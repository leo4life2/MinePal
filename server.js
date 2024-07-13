import { AgentProcess } from './src/process/agent-process.js';
import express from 'express';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import cors from 'cors';

const BACKEND_HOST = 'wss://backend.minepal.net:11111';
const argv = yargs(hideBin(process.argv)).argv;

const userDataDir = argv.userDataDir || './';
const settingsPath = `${userDataDir}/settings.json`;
let settings;

if (!fs.existsSync(settingsPath)) {
    settings = {
        "minecraft_version": "1.20.4",
        "host": "localhost",
        "port": "5555",
        "auth": "offline",
        "player_username": "WhosMaCreeper",
        "profiles": [
            "./ethan.json"
        ],
        "load_memory": true,
        "init_message": "Say hello world and your name",
        "allow_insecure_coding": false,
        "code_timeout_mins": 10
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
} else {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

let profiles = settings.profiles;
let load_memory = settings.load_memory;
let init_message = settings.init_message;
let agentProcessStarted = false;
let agentProcesses = [];

const app = express();
const port = 10101;
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Configure CORS to allow credentials
app.use(cors({
    origin: ['http://localhost', 'http://localhost:5173', 'http://localhost:4173'],
    credentials: true
}));

// Debugging middleware to log incoming requests
app.use((req, res, next) => {
    // console.log(`Incoming request: ${req.method} ${req.url}`);
    next();
});

wss.on("connection", (ws) => {
    console.log("socket: client connected");
    const proxyWs = new WebSocket(BACKEND_HOST);

    proxyWs.on('open', () => {
        console.log(`proxy: connected to ${BACKEND_HOST}`);
    });

    proxyWs.on('message', (message) => {
        // Forward message from backend host to frontend
        const parsedMessage = message.toString('utf8');
        ws.send(parsedMessage);

        // Call sendTranscription for all agents
        agentProcesses.forEach(agentProcess => {
            agentProcess.sendTranscription(parsedMessage);
        });
    });

    proxyWs.on('close', () => {
        console.log(`proxy: connection to ${BACKEND_HOST} closed`);
        ws.close();
    });

    proxyWs.on('error', (error) => {
        console.error("proxy: error", error);
        ws.close();
    });

    ws.on("message", (message) => {
        // Forward message from frontend to backend host
        if (proxyWs.readyState === WebSocket.OPEN) {
            proxyWs.send(message);
        } else {
            console.log("socket: data couldn't be sent to proxy");
        }
    });

    ws.on("close", () => {
        console.log("socket: client disconnected");
        proxyWs.close();
    });
});

app.get('/settings', (req, res) => {
    console.log('API: GET /settings called');
    res.json(settings);
});

app.get('/agent-status', (req, res) => {
    console.log('API: GET /agent-status called');
    res.json({ agentStarted: agentProcessStarted });
});

app.post('/stop', (req, res) => {
    console.log('API: POST /stop called');
    if (!agentProcessStarted) {
        console.log('API: No agent processes running');
        return res.status(404).send('No agent processes are currently running.');
    }

    agentProcesses.forEach(agentProcess => {
        agentProcess.agentProcess.kill('SIGTERM');;
    });

    agentProcesses = [];
    agentProcessStarted = false;

    console.log('API: All agent processes stopped');
    res.send('All agent processes have been stopped.');
});

app.post('/start', express.json(), (req, res) => {
    console.log('API: POST /start called');
    if (agentProcessStarted) {
        console.log('API: Agent process already started');
        return res.status(409).send('Agent process already started. Restart not allowed.');
    }

    const newSettings = req.body;
    // Check for empty fields in newSettings
    const emptyFields = Object.entries(newSettings)
        .filter(([key, value]) => {
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
    
    Object.assign(settings, newSettings);
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
    profiles = settings.profiles;
    load_memory = settings.load_memory;
    init_message = settings.init_message;

    for (let profile of profiles) {
        const agentProcess = new AgentProcess();
        agentProcess.start(profile, argv.userDataDir, load_memory, init_message);
        agentProcesses.push(agentProcess);
    }
    agentProcessStarted = true;
    console.log('API: Settings updated and AgentProcess started for all profiles');
    res.send('Settings updated and AgentProcess started for all profiles');
});

const shutdown = () => {
    console.log('Shutting down gracefully...');
    if (agentProcessStarted) {
        agentProcesses.forEach(agentProcess => {
            agentProcess.agentProcess.kill('SIGTERM');
        });
        agentProcesses = [];
        agentProcessStarted = false;
    }
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
});