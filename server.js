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
import archiver from 'archiver';
import multer from 'multer';
import AdmZip from 'adm-zip';

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
            "profiles": [],
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

    // Backward compatibility: Ensure existing profiles are updated with new voice-related settings.
    // If older profiles are found that lack 'enable_voice', 'base_voice_id', or 'voice_only_mode',
    // these fields will be added, taking their default values from the main 'ethan.json' template file
    // located in the application's installation directory. This ensures smooth updates for users with older configurations.
    try {
        const profilesDir = path.join(userDataDir, 'profiles');
        const ethanTemplatePath = path.join(electronApp.getAppPath(), 'ethan.json');

        if (fs.existsSync(profilesDir) && fs.existsSync(ethanTemplatePath)) {
            const ethanTemplateData = JSON.parse(fs.readFileSync(ethanTemplatePath, 'utf8'));

            // Define the voice setting fields and their intended default values from the template.
            // It's assumed that 'ethan.json' (the template) has these fields with appropriate default values.
            // If a field is not present in the template, its value will be 'undefined', and that will be copied.
            const voiceFieldsFromTemplate = {
                enable_voice: ethanTemplateData.enable_voice,
                base_voice_id: ethanTemplateData.base_voice_id,
                voice_only_mode: ethanTemplateData.voice_only_mode,
                enable_rare_finds: ethanTemplateData.enable_rare_finds,
                enable_entity_sleep: ethanTemplateData.enable_entity_sleep,
                enable_entity_hurt: ethanTemplateData.enable_entity_hurt,
                enable_silence_timer: ethanTemplateData.enable_silence_timer,
                enable_weather_listener: ethanTemplateData.enable_weather_listener
            };

            fs.readdirSync(profilesDir).forEach(file => {
                if (file.endsWith('.json')) {
                    const profileFilePath = path.join(profilesDir, file);
                    try {
                        let profileData = JSON.parse(fs.readFileSync(profileFilePath, 'utf8'));
                        let needsUpdate = false;

                        for (const key in voiceFieldsFromTemplate) {
                            if (profileData[key] === undefined) {
                                profileData[key] = voiceFieldsFromTemplate[key];
                                needsUpdate = true;
                            }
                        }

                        if (needsUpdate) {
                            fs.writeFileSync(profileFilePath, JSON.stringify(profileData, null, 4));
                            logToFile(`Backward compatibility: Updated profile ${file} with default voice settings from template.`);
                        }
                    } catch (e) {
                        logToFile(`Backward compatibility: Error processing profile ${file} for voice settings update: ${e.message}`);
                    }
                }
            });
        } else {
            if (!fs.existsSync(profilesDir)) {
                // This is expected for new users or if no custom profiles have been created yet.
                logToFile(`Profiles directory (${profilesDir}) not found. Skipping voice settings backward compatibility for existing profiles.`);
            }
            if (!fs.existsSync(ethanTemplatePath)) {
                // This is a more critical issue, as the template is needed for defaults.
                logToFile(`Critical: Ethan template (${ethanTemplatePath}) not found. Cannot perform voice settings backward compatibility update.`);
            }
        }
    } catch (error) {
        logToFile(`Error during voice settings backward compatibility logic in startServer: ${error.message}`);
    }

    // -- End Voice Settings Backward Compatibility ---

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
                    triggerOnRespawn: !!profileData.triggerOnRespawn,
                    enable_voice: profileData.enable_voice,
                    base_voice_id: profileData.base_voice_id,
                    voice_only_mode: profileData.voice_only_mode,
                    enable_rare_finds: !!profileData.enable_rare_finds,
                    enable_entity_sleep: !!profileData.enable_entity_sleep,
                    enable_entity_hurt: !!profileData.enable_entity_hurt,
                    enable_silence_timer: !!profileData.enable_silence_timer,
                    enable_weather_listener: !!profileData.enable_weather_listener
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
            if (agentProcess.agentProcess && !agentProcess.agentProcess.killed) {
                logToFile(`Sending shutdown message to agent process PID: ${agentProcess.agentProcess.pid}`);
                agentProcess.agentProcess.send({ type: 'shutdown' });

                // Optional: Add a timeout to forcefully kill if it doesn't exit
                const killTimeout = setTimeout(() => {
                    logToFile(`Agent process PID ${agentProcess.agentProcess.pid} did not exit gracefully during shutdown, forcefully killing.`);
                    // Force kill if it doesn't respond in time
                    agentProcess.agentProcess.kill('SIGKILL');
                }, 5000); // 5 seconds timeout

                agentProcess.agentProcess.on('exit', (code, signal) => {
                    clearTimeout(killTimeout); // Clear the timeout if it exits normally
                    logToFile(`Agent process PID ${agentProcess.agentProcess.pid} exited during shutdown with code ${code} and signal ${signal}.`);
                });
            }
        });

        agentProcesses = []; // Clear the array after initiating shutdown
        agentProcessStarted = false;

        logToFile('API: All agent processes shutdown initiated');
        res.send('All agent processes shutdown initiated.');
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

        // Validation for profile files and structure
        const missingProfileFiles = [];
        const invalidProfileObjects = [];
        const profilesBaseDir = path.join(userDataDir, 'profiles');

        if (newSettings.profiles && Array.isArray(newSettings.profiles)) {
            for (let i = 0; i < newSettings.profiles.length; i++) {
                const profile = newSettings.profiles[i];
                if (profile && typeof profile.name === 'string' && profile.name.trim() !== '') {
                    const profilePath = path.join(profilesBaseDir, `${profile.name}.json`);
                    if (!fs.existsSync(profilePath)) {
                        missingProfileFiles.push(profile.name);
                    }
                } else {
                    invalidProfileObjects.push({ index: i, profile_data: profile });
                    logToFile(`API: POST /start - Malformed profile object in request at index ${i}: ${JSON.stringify(profile)}`);
                }
            }
        } // If newSettings.profiles is not an array or is missing, the 'emptyFields' check should handle it if 'profiles' is required.

        if (invalidProfileObjects.length > 0) {
            const errorMsg = `One or more profile objects in the request are invalid (e.g., missing a name or incorrect format). Please check profile configurations.`;
            logToFile(`API: POST /start error - ${errorMsg} Details: ${JSON.stringify(invalidProfileObjects)}`);
            return res.status(400).json({
                error: errorMsg,
                invalid_profiles_detail: invalidProfileObjects 
            });
        }

        if (missingProfileFiles.length > 0) {
            const errorMsg = `The following profile configurations are missing: ${missingProfileFiles.join(', ')}. Please create them or ensure they are selected correctly in your settings.`;
            logToFile(`API: POST /start error - ${errorMsg}`);
            return res.status(400).json({
                error: errorMsg,
                missing_profiles: missingProfileFiles
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

    // Endpoint for Agent to send audio to be played by Frontend
    app.post('/play-audio', express.json({ limit: '10mb' }), async (req, res) => {
        const { audioData } = req.body; // Expecting base64 encoded WAV data

        if (!audioData || typeof audioData !== 'string') {
            logToFile('API: /play-audio error - missing or invalid audioData');
            return res.status(400).json({ error: "Missing or invalid 'audioData' field in request body. Expected base64 string." });
        }

        if (wss) {
            logToFile('API: /play-audio - broadcasting audioData to WebSocket clients.');
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'play-audio-frontend',
                        audioData: audioData // Send base64 string directly
                    }));
                }
            });
            res.json({ message: "Audio broadcasted to frontend clients." });
        } else {
            logToFile('API: /play-audio error - WebSocket server not available.');
            res.status(500).json({ error: "WebSocket server not available to broadcast audio." });
        }
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
            profileData.enable_voice = !!profile.enable_voice;
            profileData.base_voice_id = profile.base_voice_id;
            profileData.voice_only_mode = !!profile.voice_only_mode;
            profileData.enable_rare_finds = !!profile.enable_rare_finds;
            profileData.enable_entity_sleep = !!profile.enable_entity_sleep;
            profileData.enable_entity_hurt = !!profile.enable_entity_hurt;
            profileData.enable_silence_timer = !!profile.enable_silence_timer;
            profileData.enable_weather_listener = !!profile.enable_weather_listener;
            fs.writeFileSync(newProfilePath, JSON.stringify(profileData, null, 4));
        });

        res.json({ message: "Profiles saved successfully." });
    });

    // --- Supabase Logging Endpoints ---
    app.post('/log-action-event', express.json(), async (req, res) => {
        logToFile('API: POST /log-action-event called');
        const { action, is_success, fail_reason, props } = req.body;

        // No-op implementation - commented out Supabase logging
        try {
            // if (!supabase) {
            //     logToFile('Supabase client not initialized.');
            //     return res.status(401).json({ error: 'Supabase client not initialized. Please authenticate first.' });
            // }
            // // --- Sampling Logic ---
            // if (is_success === true && Math.random() >= ACTION_SAMPLING_RATE) {
            //     return res.status(200).json({ message: "Action event sampled out." });
            // }
            // // --- End Sampling Logic ---

            // // Get user ID
            // const { data: { user }, error: userError } = await supabase.auth.getUser();
            // if (userError || !user) {
            //     logToFile(`Supabase user error: ${userError?.message || 'User not found'}`);
            //     return res.status(401).json({ error: "Could not retrieve authenticated user." });
            // }

            // const eventData = {
            //     user_id: user.id,
            //     action,
            //     is_success: is_success !== undefined ? is_success : null,
            //     fail_reason: fail_reason || null,
            //     props: props || null
            // };

            // const { error: insertError } = await supabase
            //     .from('action_events')
            //     .insert(eventData);

            // if (insertError) {
            //     logToFile(`Supabase insert error (action_events): ${insertError.message}`);
            //     return res.status(500).json({ error: `Failed to log action event: ${insertError.message}` });
            // }

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

        // No-op implementation - commented out Supabase logging
        try {
            // if (!supabase) {
            //     logToFile('Supabase client not initialized.');
            //     return res.status(401).json({ error: 'Supabase client not initialized. Please authenticate first.' });
            // }
            // // Get user ID
            // const { data: { user }, error: userError } = await supabase.auth.getUser();
            // if (userError || !user) {
            //     logToFile(`Supabase user error: ${userError?.message || 'User not found'}`);
            //     return res.status(401).json({ error: "Could not retrieve authenticated user." });
            // }

            // const sessionData = {
            //     user_id: user.id,
            //     agent_version: appVersion,
            //     play_time_sec,
            //     stop_reason,
            //     crash_reason: crash_reason || null,
            //     metadata: metadata || null
            // };

            // const { error: insertError } = await supabase
            //     .from('agent_sessions')
            //     .insert(sessionData);

            // if (insertError) {
            //     logToFile(`Supabase insert error (agent_sessions): ${insertError.message}`);
            //     return res.status(500).json({ error: `Failed to log agent session: ${insertError.message}` });
            // }

            res.status(201).json({ message: "Agent session logged successfully." });
        } catch (error) {
            logToFile(`Error in /log-agent-session: ${error.message}`);
            res.status(500).json({ error: "Internal server error while logging agent session." });
        }
    });
    // --- Structure Management Endpoints ---
    app.post('/imagine', express.json(), async (req, res) => {
        logToFile('API: POST /imagine called');
        const { buildPrompt, mode, imageBase64, mediaType } = req.body;

        if (!buildPrompt || !mode) {
            return res.status(400).json({ error: "'buildPrompt' and 'mode' fields are required." });
        }

        try {
            if (!supabase) {
                logToFile('Supabase client not initialized for imagine');
                return res.status(401).json({ error: 'Supabase client not initialized. Please authenticate first.' });
            }

            // Get the JWT token for backend authentication
            const token = await getJWT(electronApp.getPath('userData'));
            if (!token) {
                logToFile('No JWT available for imagine API request');
                return res.status(401).json({ error: 'No authentication token available' });
            }

            // Build request body
            const requestBody = { buildPrompt, mode };
            
            // Add optional image data if provided
            if (imageBase64 && mediaType) {
                requestBody.imageBase64 = imageBase64;
                requestBody.mediaType = mediaType;
                logToFile(`Including image data in imagine request with mediaType: ${mediaType}`);
            }

            // Call the backend imagine API
            const response = await axios.post(
                `${HTTPS_BACKEND_URL}/imagine`,
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 120000 // 2 minute timeout for imagine requests
                }
            );

            const backendResult = response.data;
            
            if (!backendResult.success || !backendResult.structure?.id) {
                logToFile(`Backend imagine API returned invalid response: ${JSON.stringify(backendResult)}`);
                return res.status(500).json({ error: 'Invalid response from imagine service' });
            }

            // Fetch the complete structure data from Supabase including description and reasoning
            const { data: structureData, error: fetchError } = await supabase
                .from('structures')
                .select('id, description_text, reasoning_text')
                .eq('id', backendResult.structure.id)
                .single();

            if (fetchError) {
                logToFile(`Supabase error fetching structure ${backendResult.structure.id}: ${fetchError.message}`);
                return res.status(500).json({ error: `Database error: ${fetchError.message}` });
            }

            if (!structureData) {
                logToFile(`Structure ${backendResult.structure.id} not found in database after creation`);
                return res.status(404).json({ error: `Structure ${backendResult.structure.id} not found` });
            }

            // Return the complete structure data
            res.json({
                success: true,
                structure: {
                    id: structureData.id,
                    descriptionText: structureData.description_text,
                    reasoningText: structureData.reasoning_text
                }
            });

        } catch (error) {
            logToFile(`Error in /imagine: ${error.message}`);
            if (error.response) {
                logToFile(`Backend response status: ${error.response.status}`);
                logToFile(`Backend response data: ${JSON.stringify(error.response.data)}`);
                return res.status(error.response.status).json({ 
                    error: error.response.data?.error || 'Backend service error' 
                });
            }
            res.status(500).json({ error: "Internal server error while processing imagine request." });
        }
    });

    app.get('/structure/:id', async (req, res) => {
        const { id } = req.params;

        try {
            if (!supabase) {
                logToFile('Supabase client not initialized for structure fetch');
                return res.status(401).json({ error: 'Supabase client not initialized. Please authenticate first.' });
            }

            const { data: structureData, error } = await supabase
                .from('structures')
                .select('buildscript, prompt')
                .eq('id', id)
                .single();

            if (error) {
                // Handle specific case where structure ID doesn't exist
                if (error.message?.includes('JSON object requested, multiple (or no) rows returned') || 
                    error.code === 'PGRST116') {
                    return res.status(404).json({ error: `Structure ID ${id} does not exist` });
                }
                logToFile(`Supabase error fetching structure ${id}: ${error.message}`);
                return res.status(500).json({ error: `Database error: ${error.message}` });
            }

            if (!structureData) {
                return res.status(404).json({ error: `Structure ID ${id} does not exist` });
            }

            res.json({ 
                buildscript: structureData.buildscript,
                prompt: structureData.prompt 
            });
        } catch (error) {
            logToFile(`Error in /structure/${id}: ${error.message}`);
            res.status(500).json({ error: "Internal server error while fetching structure." });
        }
    });

    app.post('/structure/:id/increment-generations', async (req, res) => {
        const { id } = req.params;

        try {
            if (!supabase) {
                logToFile('Supabase client not initialized for increment-generations');
                return res.status(401).json({ error: 'Supabase client not initialized. Please authenticate first.' });
            }

            // First, get the current generations value
            const { data: structureData, error: fetchError } = await supabase
                .from('structures')
                .select('generations')
                .eq('id', id)
                .single();
            
            if (fetchError) {
                logToFile(`Supabase error fetching current generations for structure ${id}:`);
                logToFile(`  Error code: ${fetchError.code}`);
                logToFile(`  Error message: ${fetchError.message}`);
                logToFile(`  Error details: ${JSON.stringify(fetchError.details)}`);
                logToFile(`  Error hint: ${fetchError.hint}`);
                return res.status(500).json({ 
                    error: `Database error fetching structure: ${fetchError.message}`,
                    details: {
                        code: fetchError.code,
                        hint: fetchError.hint
                    }
                });
            }
            
            if (!structureData) {
                logToFile(`Structure ${id} not found when trying to increment generations`);
                return res.status(404).json({ error: `Structure ${id} not found` });
            }
            
            // Increment and update
            const newGenerations = (structureData.generations || 0) + 1;
            
            const { error: updateError } = await supabase
                .from('structures')
                .update({ generations: newGenerations })
                .eq('id', id);

            if (updateError) {
                logToFile(`Supabase error updating generations for structure ${id}:`);
                logToFile(`  Error code: ${updateError.code}`);
                logToFile(`  Error message: ${updateError.message}`);
                logToFile(`  Error details: ${JSON.stringify(updateError.details)}`);
                logToFile(`  Error hint: ${updateError.hint}`);
                return res.status(500).json({ 
                    error: `Database error updating generations: ${updateError.message}`,
                    details: {
                        code: updateError.code,
                        hint: updateError.hint
                    }
                });
            }

            res.json({ 
                message: `Generations counter incremented for structure ${id}`,
                newCount: newGenerations
            });
        } catch (error) {
            logToFile(`Unexpected error in /structure/${id}/increment-generations:`);
            logToFile(`  Error name: ${error.name}`);
            logToFile(`  Error message: ${error.message}`);
            logToFile(`  Error stack: ${error.stack}`);
            res.status(500).json({ 
                error: `Internal server error while incrementing generations: ${error.message}`,
                type: error.name
            });
        }
    });
    // --- End Structure Management Endpoints ---

    // --- End Supabase Logging Endpoints ---

    // --- Backup and Restore Endpoints ---
    // Create temp directory for uploads if it doesn't exist
    const tempDir = path.join(userDataDir, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    // Configure multer for file uploads
    const upload = multer({ 
        dest: tempDir,
        limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
    });

    app.get('/backup', (req, res) => {
        logToFile('API: GET /backup called');
        
        const profilesDir = path.join(userDataDir, 'profiles');
        const botsDir = path.join(userDataDir, 'bots');
        
        // Check if directories exist
        if (!fs.existsSync(profilesDir) && !fs.existsSync(botsDir)) {
            return res.status(404).json({ error: "No pal data found to backup" });
        }

        // Set response headers for file download
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `minepal-backup-${timestamp}.zip`;
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Create archive
        const archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level
        });

        // Handle archive errors
        archive.on('error', (err) => {
            logToFile(`Backup archive error: ${err.message}`);
            res.status(500).json({ error: "Failed to create backup" });
        });

        // Pipe archive data to response
        archive.pipe(res);

        // Add profiles directory if it exists
        if (fs.existsSync(profilesDir)) {
            archive.directory(profilesDir, 'profiles');
            logToFile('Added profiles directory to backup');
        }

        // Add bots directory if it exists
        if (fs.existsSync(botsDir)) {
            archive.directory(botsDir, 'bots');
            logToFile('Added bots directory to backup');
        }

        // Finalize the archive
        archive.finalize();
        logToFile('Backup archive created and sent');
    });
    
    // Helper function to generate unique directory name with _backup suffix
    const getUniqueDirectoryName = (originalPath) => {
        if (!fs.existsSync(originalPath)) {
            return originalPath;
        }
        
        const baseName = path.basename(originalPath);
        const dir = path.dirname(originalPath);
        const newBaseName = `${baseName}_backup`;
        
        return path.join(dir, newBaseName);
    };

    // Helper function to generate unique profile name with _backup suffix
    const getUniqueProfileName = (originalPath) => {
        if (!fs.existsSync(originalPath)) {
            return { path: originalPath, nameChanged: false };
        }
        
        const ext = path.extname(originalPath);
        const baseName = path.basename(originalPath, ext);
        const dir = path.dirname(originalPath);
        const newBaseName = `${baseName}_backup${ext}`;
        
        return { 
            path: path.join(dir, newBaseName), 
            nameChanged: true,
            originalName: baseName,
            newName: `${baseName}_backup`
        };
    };

    app.post('/restore', upload.single('backup'), async (req, res) => {
        logToFile('API: POST /restore called');
        
        if (!req.file) {
            return res.status(400).json({ error: "No backup file provided" });
        }

        const tempFilePath = req.file.path;
        const profilesDir = path.join(userDataDir, 'profiles');
        const botsDir = path.join(userDataDir, 'bots');

        try {
            // Create directories if they don't exist
            if (!fs.existsSync(profilesDir)) {
                fs.mkdirSync(profilesDir, { recursive: true });
            }
            if (!fs.existsSync(botsDir)) {
                fs.mkdirSync(botsDir, { recursive: true });
            }

            // Extract the uploaded zip file
            const zip = new AdmZip(tempFilePath);
            const zipEntries = zip.getEntries();

            let profilesRestored = 0;
            let botsRestored = 0;

            // First, collect all top-level directories in bots/ to handle directory conflicts
            const botDirectories = new Set();
            const botDirectoryMappings = new Map(); // original -> renamed

            zipEntries.forEach((entry) => {
                if (entry.entryName.startsWith('bots/') && !entry.isDirectory) {
                    const relativePath = entry.entryName.substring('bots/'.length);
                    const topLevelDir = relativePath.split('/')[0];
                    if (topLevelDir && !botDirectories.has(topLevelDir)) {
                        botDirectories.add(topLevelDir);
                        
                        // Check for directory conflict and create mapping
                        const originalBotPath = path.join(botsDir, topLevelDir);
                        const finalBotPath = getUniqueDirectoryName(originalBotPath);
                        const finalBotName = path.basename(finalBotPath);
                        
                        botDirectoryMappings.set(topLevelDir, finalBotName);
                        
                        if (originalBotPath !== finalBotPath) {
                            logToFile(`Bot directory conflict resolved: ${topLevelDir} -> ${finalBotName}`);
                        }
                    }
                }
            });

            // Now process all entries
            zipEntries.forEach((entry) => {
                const entryPath = entry.entryName;
                
                if (entry.isDirectory) {
                    return; // Skip directories, they'll be created automatically
                }

                if (entryPath.startsWith('profiles/')) {
                    // Extract to profiles directory
                    const relativePath = entryPath.substring('profiles/'.length);
                    const originalTargetPath = path.join(profilesDir, relativePath);
                    
                    // Get unique path and name info
                    const profileInfo = getUniqueProfileName(originalTargetPath);
                    
                    // Create directory if needed
                    const targetDir = path.dirname(profileInfo.path);
                    if (!fs.existsSync(targetDir)) {
                        fs.mkdirSync(targetDir, { recursive: true });
                    }
                    
                    let fileContent = entry.getData();
                    
                    // If we had to rename the profile, update the JSON content
                    if (profileInfo.nameChanged && relativePath.endsWith('.json')) {
                        try {
                            const jsonContent = JSON.parse(fileContent.toString());
                            if (jsonContent.name === profileInfo.originalName) {
                                jsonContent.name = profileInfo.newName;
                                fileContent = Buffer.from(JSON.stringify(jsonContent, null, 4));
                                logToFile(`Updated profile name in JSON: ${profileInfo.originalName} -> ${profileInfo.newName}`);
                            }
                        } catch (jsonError) {
                            logToFile(`Warning: Could not parse JSON for profile ${relativePath}: ${jsonError.message}`);
                        }
                    }
                    
                    // Write the file
                    fs.writeFileSync(profileInfo.path, fileContent);
                    profilesRestored++;
                    
                    const finalRelativePath = path.relative(profilesDir, profileInfo.path);
                    logToFile(`Restored profile file: ${finalRelativePath}`);
                } else if (entryPath.startsWith('bots/')) {
                    // Handle bot files
                    const relativePath = entryPath.substring('bots/'.length);
                    const pathParts = relativePath.split('/');
                    const topLevelDir = pathParts[0];
                    
                    if (topLevelDir && botDirectoryMappings.has(topLevelDir)) {
                        // Replace the top-level directory with the mapped name
                        pathParts[0] = botDirectoryMappings.get(topLevelDir);
                        const newRelativePath = pathParts.join('/');
                        const targetPath = path.join(botsDir, newRelativePath);
                        
                        // Create directory if needed
                        const targetDir = path.dirname(targetPath);
                        if (!fs.existsSync(targetDir)) {
                            fs.mkdirSync(targetDir, { recursive: true });
                        }
                        
                        // Write the file
                        fs.writeFileSync(targetPath, entry.getData());
                        botsRestored++;
                        
                        logToFile(`Restored bot file: ${newRelativePath}`);
                    }
                }
            });

            // Clean up temporary file
            fs.unlinkSync(tempFilePath);

            logToFile(`Restore completed: ${profilesRestored} profile files, ${botsRestored} bot files restored`);
            res.json({ 
                message: "Backup restored successfully",
                profilesRestored,
                botsRestored
            });

        } catch (error) {
            logToFile(`Restore error: ${error.message}`);
            
            // Clean up temporary file on error
            try {
                fs.unlinkSync(tempFilePath);
            } catch (cleanupError) {
                logToFile(`Error cleaning up temp file: ${cleanupError.message}`);
            }
            
            res.status(500).json({ error: "Failed to restore backup" });
        }
    });
    // --- End Backup and Restore Endpoints ---

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
                if (agentProcess.agentProcess && !agentProcess.agentProcess.killed) {
                    logToFile(`Sending shutdown message to agent process PID: ${agentProcess.agentProcess.pid}`);
                    agentProcess.agentProcess.send({ type: 'shutdown' });

                    // Optional: Add a timeout to forcefully kill if it doesn't exit
                    const killTimeout = setTimeout(() => {
                        logToFile(`Agent process PID ${agentProcess.agentProcess.pid} did not exit gracefully during shutdown, forcefully killing.`);
                        // Force kill if it doesn't respond in time
                        agentProcess.agentProcess.kill('SIGKILL');
                    }, 5000); // 5 seconds timeout

                    agentProcess.agentProcess.on('exit', (code, signal) => {
                        clearTimeout(killTimeout); // Clear the timeout if it exits normally
                        logToFile(`Agent process PID ${agentProcess.agentProcess.pid} exited during shutdown with code ${code} and signal ${signal}.`);
                    });
                }
            });
            agentProcesses = []; // Clear the array after initiating shutdown
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