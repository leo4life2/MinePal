import { AgentProcess } from './src/process/agent-process.js';
import { app as electronApp } from 'electron';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { HTTPS_BACKEND_URL, WSS_BACKEND_URL } from './src/constants.js';
import fs from 'fs';
import cors from 'cors';
import path from 'path';
import net from 'net';

const logFile = path.join(electronApp.getPath('userData'), 'app.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

let wss; // Declare wss in the outer scope

function logToFile(message) {
    logStream.write(`${new Date().toISOString()} - ${message}\n`);
}

function broadcastMessage(message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function notifyBotKicked() {
    logToFile("Bot was kicked");
    broadcastMessage("Error: Bot kicked.");
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
    wss = new WebSocketServer({ server }); // Initialize wss within startServer

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

    let transcriptBuffer = "";

    function broadcastMessage(message) {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    wss.on("connection", (ws) => {
        logToFile("socket: client connected");
        const proxyWs = new WebSocket(WSS_BACKEND_URL);

        proxyWs.on('open', () => {
            logToFile(`proxy: connected to ${WSS_BACKEND_URL}`);
        });

        proxyWs.on('message', (message) => {
            const parsedMessage = JSON.parse(message.toString('utf8'));
            const { is_final, speech_final, transcript } = parsedMessage;

            if (is_final) {
                transcriptBuffer += transcript;
            }

            if (speech_final) {
                ws.send(transcriptBuffer); // to frontend
                agentProcesses.forEach(agentProcess => {
                    agentProcess.sendTranscription(transcriptBuffer);
                });
                transcriptBuffer = "";
            }
        });

        proxyWs.on('close', () => {
            logToFile(`proxy: connection to ${WSS_BACKEND_URL} closed`);
            ws.close();
        });

        proxyWs.on('error', (error) => {
            logToFile(`proxy: error ${error}`);
            ws.close();
        });

        ws.on("message", (message) => {
            if (proxyWs.readyState === WebSocket.OPEN) {
                proxyWs.send(message);
            } else {
                logToFile("socket: data couldn't be sent to proxy");
            }
        });

        ws.on("close", () => {
            logToFile("socket: client disconnected");
            proxyWs.close();
        });
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
        res.json(settings);
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

    app.post('/start', express.json(), (req, res) => {
        logToFile('API: POST /start called');
        if (agentProcessStarted) {
            logToFile('API: Agent process already started');
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
            const agentProcess = new AgentProcess(notifyBotKicked);
            agentProcess.start(profile, userDataDir, load_memory, init_message);
            agentProcesses.push(agentProcess);
        }
        agentProcessStarted = true;
        logToFile('API: Settings updated and AgentProcess started for all profiles');
        res.send('Settings updated and AgentProcess started for all profiles');
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
}

export { startServer };