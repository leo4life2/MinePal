import { AgentProcess } from './src/process/agent-process.js';
import { app as electronApp } from 'electron';
import express from 'express';
import http from 'http';
import { HTTPS_BACKEND_URL } from './src/constants.js';
import fs from 'fs';
import cors from 'cors';
import path from 'path';
import net from 'net';
import { uIOhook } from 'uiohook-napi';
import { LocalIndex } from 'vectra';
import { WebSocketServer, WebSocket } from 'ws';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, ACTION_SAMPLING_RATE } from './src/constants.js';

const logFile = path.join(electronApp.getPath('userData'), 'app.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
const appVersion = electronApp.getVersion();

// --- Supabase Client Management ---
let supabase = null;
function createSupabaseClientFromJWT(token) {
    if (!token) return null;
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: false,
            detectSessionInUrl: false,
            persistSession: false
        },
        global: {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    });
}
// --- End Supabase Client Management ---

let isKeyDown = false; // Track push-to-talk key state
let keyCode = null; // Store the key code for push-to-talk
let wss = null; // WebSocket server instance

function logToFile(message) {
    logStream.write(`${new Date().toISOString()} - ${message}\n`);
}

function notifyBotKicked(reason = 'unknown') {
    logToFile(`Bot was kicked. Reason: ${reason}`);
    
    // Broadcast bot-kicked event to all connected clients with the reason
    if (wss) {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ 
                    type: 'bot-kicked',
                    reason: reason
                }));
            }
        });
    }
}

// Get JWT for authentication with backend
async function getJWT(userDataDir) {
    try {
        const tokenPath = path.join(userDataDir, 'supa-jwt.json');
        if (fs.existsSync(tokenPath)) {
            const data = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
            return data.token;
        }
    } catch (err) {
        logToFile(`Error reading JWT: ${err.message}`);
    }
    return null;
}

// --- Supabase Helper Function ---
function setSupabaseClientFromJWT(token) {
    if (token) {
        supabase = createSupabaseClientFromJWT(token);
        logToFile('Supabase client set with new JWT.');
    } else {
        supabase = null;
        logToFile('Supabase client cleared (no JWT).');
    }
}
// --- End Supabase Helper Function ---

function setupVoice(settings, userDataDir, agentProcesses) {
    const { key_binding } = settings;

    // If a hook was previously set up, unregister it first
    try {
        uIOhook.stop();
    } catch (error) {
        logToFile(`Error stopping previous uIOhook: ${error.message}`);
    }

    // Only set up push-to-talk if key binding is available
    if (key_binding) {
        // Try to set up push-to-talk with the key code
        try {
            keyCode = Number(key_binding);
            
            // Set up the key down and key up listeners
            uIOhook.on('keydown', async (e) => {
                if (e.keycode === keyCode && !isKeyDown) {
                    isKeyDown = true;
                    
                    // Broadcast keydown event to all connected clients
                    if (wss) {
                        wss.clients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({ type: 'keydown' }));
                            }
                        });
                    }
                }
            });
            
            uIOhook.on('keyup', async (e) => {
                if (e.keycode === keyCode && isKeyDown) {
                    isKeyDown = false;                
                    // Broadcast keyup event to all connected clients
                    if (wss) {
                        wss.clients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({ type: 'keyup' }));
                            }
                        });
                    }
                }
            });
            
            // Start the hook
            uIOhook.start();
            logToFile(`Push-to-talk enabled with key code: ${keyCode}`);
            console.log(`Push-to-talk enabled with key code: ${keyCode}`);
        } catch (error) {
            logToFile(`Error setting up push-to-talk: ${error.message}`);
            console.error('Error setting up push-to-talk:', error);
        }
    } else {
        logToFile('Push-to-talk not configured - voice input disabled');
        console.log('Push-to-talk not configured - voice input disabled');
    }
}

function startServer() {
    logToFile("Starting server...");
    const userDataDir = electronApp.getPath('userData');
    if (!userDataDir || !fs.existsSync(userDataDir)) {
        throw new Error("userDataDir must be provided and must exist");
    }

    const settingsPath = `${userDataDir}/settings.json`;
    let settings;

    if (!fs.existsSync(settingsPath)) {
        settings = {
            "host": "localhost",
            "port": "25565",
            "auth": "offline",
            "player_username": "",
            "profiles": [
                "./ethan.json"
            ],
            "load_memory": true,
            "allow_insecure_coding": false,
            "code_timeout_mins": 10,
            "whisper_to_player": false,
            "key_binding": "",
            "openai_api_key": "",
            "model": "",
            "language": "en",
            "input_device_id": ""
        };
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
    } else {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }

    let profiles = settings.profiles;
    let load_memory = settings.load_memory;
    let agentProcessStarted = false;
    let agentProcesses = [];

    const app = express();
    const port = 10101;
    const server = http.createServer(app);

    // Set up WebSocket server
    wss = new WebSocketServer({ server });
    
    wss.on('connection', (ws) => {
        logToFile('New WebSocket client connected');
        
        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
                
                if (data.type === 'audio-binary') {
                    // Handle audio binary data from client
                    logToFile(`Received audio binary data from client of size ${data.audio.length} bytes`);
                    
                    // Get JWT for authorization
                    const token = await getJWT(userDataDir);
                    if (!token) {
                        logToFile('No JWT available for API request');
                        return;
                    }
                    
                    // Send audio to backend for transcription
                    try {
                        const model = settings.language === 'en' || settings.language === 'en-US' ? 'nova-3' : 'nova-2';
                        logToFile(`Sending audio to backend for transcription with model: ${model} and language: ${settings.language}`);
                        const response = await axios.post(
                            `${HTTPS_BACKEND_URL}/deepgram/listen?model=${model}&language=${settings.language}`,
                            Buffer.from(data.audio, 'base64'),
                            {
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'audio/ogg; codecs=opus'
                                },
                                timeout: 12000 // 12 second timeout
                            }
                        );

                        // Extract transcript from response
                        const transcript = response.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim();
                        
                        if (transcript) {
                            logToFile(`Received transcript: ${transcript}`);
                            
                            // Send transcript to all bots
                            agentProcesses.forEach(agentProcess => {
                                agentProcess.sendTranscription(transcript);
                            });
                        } else {
                            logToFile('No transcript received from Deepgram');
                            if (agentProcesses.length > 0) {
                                agentProcesses[0].sendMessage(`/tell ${settings.player_username} I couldn't quite catch that, say again?`);
                            }
                        }
                    } catch (error) {
                        logToFile(`Error sending audio for transcription: ${error.message}`);
                        if (agentProcesses.length > 0) {
                            if (error.response && error.response.status === 400 && 
                                error.response.data && 
                                error.response.data.err_msg && 
                                error.response.data.err_msg.includes('failed to process audio')) {
                                agentProcesses[0].sendMessage(`/tell ${settings.player_username} I couldn't understand that, come again?`);
                            } else {
                                agentProcesses[0].sendMessage(`/tell ${settings.player_username} My voice transcription service took an arrow to the knee, try again later`);
                            }
                        }
                        if (error.response) {
                            logToFile(`Response status: ${error.response.status}`);
                            logToFile(`Response data: ${JSON.stringify(error.response.data)}`);
                        }
                    }
                }
            } catch (error) {
                logToFile(`Error processing WebSocket message: ${error.message}`);
            }
        });
        
        ws.on('close', () => {
            logToFile('WebSocket client disconnected');
        });
        
        ws.on('error', (error) => {
            logToFile(`WebSocket error: ${error.message}`);
        });
    });

    // Configure CORS to allow credentials
    app.use(cors({
        origin: ['http://localhost', 'http://localhost:5173', 'http://localhost:4173'],
        credentials: true
    }));

    // Debugging middleware to log incoming requests
    app.use((req, res, next) => {
        // logToFile(`Incoming request: ${req.method} ${req.url}`);
        next();
    });

    app.get('/backend-alive', async (req, res) => {
        try {
            const response = await fetch(`${HTTPS_BACKEND_URL}/ping`);
            if (response.ok && await response.text() === 'pong') {
                res.json({ backend_alive: true });
            } else {
                res.json({ backend_alive: false });
            }
        } catch (error) {
            logToFile(`Heartbeat error: ${error.message}`);
            res.json({ backend_alive: false });
        }
    });

    app.get('/settings', (req, res) => {
        const profilesDir = path.join(userDataDir, 'profiles');
        const updatedProfiles = [];
        const ethanTemplatePath = path.join(electronApp.getAppPath(), 'ethan.json');
        const ethanTemplate = JSON.parse(fs.readFileSync(ethanTemplatePath, 'utf8'));
    
        fs.readdirSync(profilesDir).forEach(file => {
            if (file.endsWith('.json')) {
                const profilePath = path.join(profilesDir, file);
                const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
                
                // Replace fields with those from ethanTemplate
                profileData.conversing = ethanTemplate.conversing;
                profileData.coding = ethanTemplate.coding;
                profileData.saving_memory = ethanTemplate.saving_memory;
                
                // Write the updated profile back to the file
                fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 4));
                
                updatedProfiles.push({
                    name: profileData.name,
                    personality: profileData.personality,
                    autoMessage: profileData.autoMessage || '',
                    triggerOnJoin: !!profileData.triggerOnJoin,
                    triggerOnRespawn: !!profileData.triggerOnRespawn
                });
            }
        });
    
        const updatedSettings = {
            ...settings,
            profiles: updatedProfiles
        };
    
        fs.writeFileSync(settingsPath, JSON.stringify(updatedSettings, null, 4));
        res.json(updatedSettings);
    });

    app.get('/bot-memories', async (req, res) => {
        const { name } = req.query;
        
        if (!name) {
            return res.status(400).json({ error: "Bot name parameter is required" });
        }
    
        const botMemoryPath = path.join(userDataDir, 'bots', name, 'index');
        
        try {
            const index = new LocalIndex(botMemoryPath);
            if (!(await index.isIndexCreated())) {
                return res.json([]);
            }

            // Get all items from the index
            const items = await index.listItems();
            const memories = items.map(item => ({
                id: item.id,
                text: item.metadata.text
            }));
    
            res.json(memories);
        } catch (error) {
            logToFile(`Error reading bot memories: ${error.message}`);
            res.json([]);
        }
    });

    app.delete('/bot-memories/:botName/:memoryId', async (req, res) => {
        const { botName, memoryId } = req.params;
        
        if (!botName || !memoryId) {
            return res.status(400).json({ error: "Bot name and memory ID are required" });
        }
    
        const botMemoryPath = path.join(userDataDir, 'bots', botName, 'index');
        
        try {
            const index = new LocalIndex(botMemoryPath);
            if (!(await index.isIndexCreated())) {
                return res.status(404).json({ error: "Bot memories not found" });
            }

            await index.deleteItem(memoryId);
            res.json({ message: `Memory ${memoryId} deleted successfully` });
        } catch (error) {
            logToFile(`Error deleting memory: ${error.message}`);
            res.status(500).json({ error: "Failed to delete memory" });
        }
    });

    app.get('/check-server', (req, res) => {
        const { host, port } = req.query;
        const socket = new net.Socket();
    
        socket.setTimeout(2000); // Set a timeout for the connection
    
        socket.on('connect', () => {
            logToFile(`Server at ${host}:${port} is reachable.`);
            res.json({ alive: true });
            socket.destroy(); // Close the connection
        }).on('error', (err) => {
            logToFile(`Server at ${host}:${port} is not reachable. Error: ${err.message}`);
            res.json({ alive: false, error: err.message });
        }).on('timeout', () => {
            logToFile(`Server at ${host}:${port} is not reachable. Error: Timeout`);
            res.json({ alive: false, error: 'Timeout' });
            socket.destroy();
        }).connect(port, host);
    });

    app.get('/agent-status', (req, res) => {
        res.json({ agentStarted: agentProcessStarted });
    });

    app.post('/stop', (req, res) => {
        logToFile('API: POST /stop called');
        if (!agentProcessStarted) {
            logToFile('API: No agent processes running');
            return res.status(404).send('No agent processes are currently running.');
        }

        // Stop uIOhook to clean up keyboard listeners
        try {
            uIOhook.stop();
            logToFile('uIOhook stopped');
        } catch (error) {
            logToFile(`Error stopping uIOhook: ${error.message}`);
        }

        agentProcesses.forEach(agentProcess => {
            agentProcess.agentProcess.kill();
        });

        agentProcesses = [];
        agentProcessStarted = false;

        logToFile('API: All agent processes stopped');
        res.send('All agent processes have been stopped.');
    });

    app.post('/manual-chat', express.json(), (req, res) => {
        const { botName, message } = req.body;

        if (!botName || !message) {
            return res.status(400).json({ error: "Both 'botName' and 'message' fields are required." });
        }

        let botFound = false;

        agentProcesses.forEach(agentProcess => {
            if (agentProcess.botName === botName) {
                agentProcess.sendMessage(message);
                botFound = true;
            }
        });

        if (botFound) {
            res.json({ message: "Message sent to the bot." });
        } else {
            res.status(404).json({ error: "Bot is not in game." });
        }
    });

    // Add JWT save endpoint
    app.post('/save-jwt', express.json(), async (req, res) => {
        try {
            const { token } = req.body;
            const tokenPath = path.join(userDataDir, 'supa-jwt.json');

            setSupabaseClientFromJWT(token);
            
            // Save token to file (empty string if not provided)
            fs.writeFileSync(tokenPath, JSON.stringify({ 
                token: token || ''
            }));
            
            res.json({ success: true });
        } catch (error) {
            logToFile(`Error saving JWT: ${error.message}`);
            res.status(500).json({ error: "Failed to save JWT" });
        }
    });

    app.post('/start', express.json(), (req, res) => {
        logToFile('API: POST /start called');
        if (agentProcessStarted) {
            logToFile('API: Agent process already started');
            return res.status(409).send('Agent process already started. Restart not allowed.');
        }

        const newSettings = req.body;
        // Check for empty fields in newSettings, except for key_binding and input_device_id
        const emptyFields = Object.entries(newSettings)
            .filter(([key, value]) => {
                // Skip API key and model checks if not using own API key
                if (!newSettings.useOwnApiKey && (key === 'openai_api_key' || key === 'model')) {
                    return false;
                }
                // Skip key_binding and input_device_id as they are optional
                if (key === 'key_binding' || key === 'input_device_id') {
                    return false;
                }
                if (key === 'profiles') return !Array.isArray(value) || value.length === 0;
                return value === "" || value === null || value === undefined;
            })
            .map(([key]) => key);
        
        if (emptyFields.length > 0) {
            return res.status(400).json({
                error: "Empty fields not allowed",
                emptyFields: emptyFields
            });
        }

        // removed from UI, hardcoding these settings
        newSettings.allow_insecure_coding = false;
        newSettings.code_timeout_mins = 10;
        newSettings.auth = "offline";
        newSettings.load_memory = true;

        Object.assign(settings, newSettings);
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
        profiles = newSettings.profiles;
        load_memory = newSettings.load_memory;

        // Start agent processes first
        for (let profile of profiles) {
            const profileBotName = profile.name;
            const agentProcess = new AgentProcess(notifyBotKicked);
            agentProcess.start(profileBotName, userDataDir, newSettings.useOwnApiKey, newSettings.openai_api_key, load_memory);
            agentProcesses.push(agentProcess);
        }
        agentProcessStarted = true;

        // Set up push-to-talk functionality with the new settings
        setupVoice(settings, userDataDir, agentProcesses);

        logToFile('API: Settings updated and AgentProcess started for all profiles');
        res.send('Settings updated and AgentProcess started for all profiles');
    });

    // Only batch save supported rn.
    app.post('/save-profiles', express.json(), (req, res) => {
        const profilesDir = path.join(userDataDir, 'profiles');
        const ethanTemplatePath = path.join(electronApp.getAppPath(), 'ethan.json');
        const newProfiles = req.body.profiles;
        // Validate input
        if (!Array.isArray(newProfiles) || newProfiles.some(profile => !profile.name || !profile.personality)) {
            return res.status(400).json({ error: "Invalid input. Each profile must have 'name' and 'personality' fields." });
        }

        // Delete all existing profiles
        fs.readdirSync(profilesDir).forEach(file => {
            if (file.endsWith('.json')) {
                fs.unlinkSync(path.join(profilesDir, file));
            }
        });

        // Create new profiles
        newProfiles.forEach(profile => {
            const newProfilePath = path.join(profilesDir, `${profile.name}.json`);
            const profileData = JSON.parse(fs.readFileSync(ethanTemplatePath, 'utf8'));
            profileData.name = profile.name;
            profileData.personality = profile.personality;
            profileData.autoMessage = profile.autoMessage || '';
            profileData.triggerOnJoin = !!profile.triggerOnJoin;
            profileData.triggerOnRespawn = !!profile.triggerOnRespawn;
            fs.writeFileSync(newProfilePath, JSON.stringify(profileData, null, 4));
        });

        res.json({ message: "Profiles saved successfully." });
    });

    // --- Supabase Logging Endpoints ---
    app.post('/log-action-event', express.json(), async (req, res) => {
        logToFile('API: POST /log-action-event called');
        const { action, is_success, fail_reason, props } = req.body;

        try {
            if (!supabase) {
                logToFile('Supabase client not initialized.');
                return res.status(401).json({ error: 'Supabase client not initialized. Please authenticate first.' });
            }
            // --- Sampling Logic ---
            if (is_success === true && Math.random() >= ACTION_SAMPLING_RATE) {
                return res.status(200).json({ message: "Action event sampled out." });
            }
            // --- End Sampling Logic ---

            // Get user ID
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) {
                logToFile(`Supabase user error: ${userError?.message || 'User not found'}`);
                return res.status(401).json({ error: "Could not retrieve authenticated user." });
            }

            const eventData = {
                user_id: user.id,
                action,
                is_success: is_success !== undefined ? is_success : null,
                fail_reason: fail_reason || null,
                props: props || null
            };

            const { error: insertError } = await supabase
                .from('action_events')
                .insert(eventData);

            if (insertError) {
                logToFile(`Supabase insert error (action_events): ${insertError.message}`);
                return res.status(500).json({ error: `Failed to log action event: ${insertError.message}` });
            }

            res.status(201).json({ message: "Action event logged successfully." });
        } catch (error) {
            logToFile(`Error in /log-action-event: ${error.message}`);
            res.status(500).json({ error: "Internal server error while logging action event." });
        }
    });

    app.post('/log-agent-session', express.json(), async (req, res) => {
        logToFile('API: POST /log-agent-session called');
        const { play_time_sec, stop_reason, crash_reason, metadata } = req.body;

        if (play_time_sec === undefined || !stop_reason) {
            return res.status(400).json({ error: "'play_time_sec' and 'stop_reason' fields are required." });
        }

        try {
            if (!supabase) {
                logToFile('Supabase client not initialized.');
                return res.status(401).json({ error: 'Supabase client not initialized. Please authenticate first.' });
            }
            // Get user ID
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) {
                logToFile(`Supabase user error: ${userError?.message || 'User not found'}`);
                return res.status(401).json({ error: "Could not retrieve authenticated user." });
            }

            const sessionData = {
                user_id: user.id,
                agent_version: appVersion,
                play_time_sec,
                stop_reason,
                crash_reason: crash_reason || null,
                metadata: metadata || null
            };

            const { error: insertError } = await supabase
                .from('agent_sessions')
                .insert(sessionData);

            if (insertError) {
                logToFile(`Supabase insert error (agent_sessions): ${insertError.message}`);
                return res.status(500).json({ error: `Failed to log agent session: ${insertError.message}` });
            }

            res.status(201).json({ message: "Agent session logged successfully." });
        } catch (error) {
            logToFile(`Error in /log-agent-session: ${error.message}`);
            res.status(500).json({ error: "Internal server error while logging agent session." });
        }
    });
    // --- End Supabase Logging Endpoints ---

    const shutdown = () => {
        logToFile('Shutting down gracefully...');
        
        // Close WebSocket server
        if (wss) {
            wss.close(() => {
                logToFile('WebSocket server closed');
            });
        }
        
        // Stop uIOhook to clean up keyboard listeners
        try {
            uIOhook.stop();
            logToFile('uIOhook stopped');
        } catch (error) {
            logToFile(`Error stopping uIOhook: ${error.message}`);
        }
        
        if (agentProcessStarted) {
            agentProcesses.forEach(agentProcess => {
                agentProcess.agentProcess.kill('SIGTERM');
            });
            agentProcesses = [];
            agentProcessStarted = false;
        }
        server.close(() => {
            logToFile('HTTP server closed');
            process.exit(0);
        });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    server.listen(port, '0.0.0.0', () => {
        logToFile(`Server running at http://0.0.0.0:${port}`);
    });

    logToFile("Server started successfully.");

    // // CPU and Memory Usage Tracking
    // let maxCpu = 0;
    // let maxMemory = 0;

    // setInterval(async () => {
    //     try {
    //         const pids = [process.pid, ...agentProcesses.map(ap => ap.agentProcess.pid)];
    //         const stats = await Promise.all(pids.map(pid => pidusage(pid)));

    //         const totalCpu = stats.reduce((acc, stat) => acc + stat.cpu, 0);
    //         const totalMemory = stats.reduce((acc, stat) => acc + stat.memory, 0);

    //         if (totalCpu > maxCpu) maxCpu = totalCpu;
    //         if (totalMemory > maxMemory) maxMemory = totalMemory;
    //     } catch (err) {
    //         logToFile(`Error fetching usage stats: ${err.message}`);
    //     }
    // }, 300);

    // setInterval(() => {
    //     logToFile(`Max CPU: ${maxCpu.toFixed(2)}%, Max Memory: ${(maxMemory / 1024 / 1024).toFixed(2)} MB`);
    //     maxCpu = 0;
    //     maxMemory = 0;
    // }, 5000);
}

export { startServer };