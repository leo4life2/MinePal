import { AgentProcess } from './src/process/agent-process.js';
import { app as electronApp } from 'electron';
import express from 'express';
import http from 'http';
import { HTTPS_BACKEND_URL } from './src/constants.js';
import fs from 'fs';
import cors from 'cors';
import path from 'path';
import net from 'net';
import { GlobalKeyboardListener } from 'node-global-key-listener';
import { LocalIndex } from 'vectra';

const logFile = path.join(electronApp.getPath('userData'), 'app.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

let isToggleToTalkActive = false; // Global state for toggle_to_talk
let isKeyDown = false; // Track key state
let gkl; // Declare the global keyboard listener
let voice_mode = 'off'; // Global voice_mode variable with default value

function logToFile(message) {
    logStream.write(`${new Date().toISOString()} - ${message}\n`);
}

function notifyBotKicked() {
    logToFile("Bot was kicked");
}

function setupVoice(settings) {
    voice_mode = settings.voice_mode; // Assign voice_mode from settings
    const { key_binding } = settings;

    if ((voice_mode === 'push_to_talk' || voice_mode === 'toggle_to_talk') && key_binding) {
        gkl = new GlobalKeyboardListener();

        gkl.addListener((e) => {
            if (e.name.toLowerCase() === key_binding.toLowerCase()) {
                if (e.state === 'DOWN') {
                    if (voice_mode === 'push_to_talk') {
                        isKeyDown = true;
                        console.log('Push-to-talk key down:', isKeyDown);
                    } else if (voice_mode === 'toggle_to_talk') {
                        isToggleToTalkActive = !isToggleToTalkActive;
                        console.log('Toggle-to-talk active:', isToggleToTalkActive);
                    }
                } else if (e.state === 'UP' && voice_mode === 'push_to_talk') {
                    isKeyDown = false;
                    console.log('Push-to-talk key up:', isKeyDown);
                }
            }
        });
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
            "minecraft_version": "select",
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
            "voice_mode": "always_on",
            "key_binding": "",
            "openai_api_key": "",
            "model": "",
            "language": "en"
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

    app.post('/start', express.json(), (req, res) => {
        logToFile('API: POST /start called');
        if (agentProcessStarted) {
            logToFile('API: Agent process already started');
            return res.status(409).send('Agent process already started. Restart not allowed.');
        }

        const newSettings = req.body;
        // Check for empty fields in newSettings, except for key_binding if voice_mode is always_on or off
        const emptyFields = Object.entries(newSettings)
            .filter(([key, value]) => {
                // Skip API key and model checks if not using own API key
                if (!newSettings.useOwnApiKey && (key === 'openai_api_key' || key === 'model')) {
                    return false;
                }
                if (key === 'profiles') return !Array.isArray(value) || value.length === 0;
                if (key === 'key_binding' && (newSettings.voice_mode === 'always_on' || newSettings.voice_mode === 'off')) return false;
                if (key === 'minecraft_version' && value === 'select') return true;
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

        for (let profile of profiles) {
            const profileBotName = profile.name;
            const agentProcess = new AgentProcess(notifyBotKicked);
            agentProcess.start(profileBotName, userDataDir, newSettings.useOwnApiKey, newSettings.openai_api_key, load_memory);
            agentProcesses.push(agentProcess);
        }
        agentProcessStarted = true;
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

    const shutdown = () => {
        logToFile('Shutting down gracefully...');
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