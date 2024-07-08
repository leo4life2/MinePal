import { AgentProcess } from './src/process/agent-process.js';
import settings from './settings.json' assert { type: 'json' };
import express from 'express';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import http from 'http';
import { WebSocketServer } from 'ws';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { getKey } from './src/utils/keys.js';
import fs from 'fs';
import basicAuth from 'express-basic-auth';
import cors from 'cors';

const PROD_FE_HOST = 'https://minepal-fe.vercel.app';
const TEST_FE_HOST = 'http://10.0.0.235:4173';
const LOCAL_FE_HOST = 'http://localhost:4173';

const argv = yargs(hideBin(process.argv)).argv;

let profiles = settings.profiles;
let load_memory = settings.load_memory;
let init_message = settings.init_message;
let agentProcessStarted = false;
let agentProcesses = [];

if (argv.mode === 'server') {
    const app = express();
    const port = 19999;
    const server = http.createServer(app);
    const wss = new WebSocketServer({ server });

    // Configure CORS to allow credentials
    app.use(cors({
        origin: PROD_FE_HOST,
        credentials: true
    }));

    // Add HTTP Basic Auth
    app.use(basicAuth({
        users: { 'alphatest': 'MinePalAlphaTester123!@#123' },
        challenge: true,
        realm: 'MinePal'
    }));

    const deepgramClient = createClient(getKey('DEEPGRAM_API_KEY'));
    let keepAlive;

    const setupDeepgram = (ws) => {
        const deepgram = deepgramClient.listen.live({
            language: "en",
            punctuate: true,
            smart_format: true,
            model: "nova",
        });

        if (keepAlive) clearInterval(keepAlive);
        keepAlive = setInterval(() => {
            deepgram.keepAlive();
        }, 10 * 1000);

        deepgram.addListener(LiveTranscriptionEvents.Open, async () => {
            console.log("deepgram: connected");

            deepgram.addListener(LiveTranscriptionEvents.Transcript, (data) => {
                const transcript = data.channel.alternatives[0].transcript;
                ws.send(JSON.stringify(data));
                agentProcesses.forEach(agentProcess => {
                    if (transcript.trim() !== '') {
                        agentProcess.sendTranscription(transcript);
                    }
                });
            });

            deepgram.addListener(LiveTranscriptionEvents.Close, async () => {
                console.log("deepgram: disconnected");
                clearInterval(keepAlive);
                deepgram.requestClose();
            });

            deepgram.addListener(LiveTranscriptionEvents.Error, async (error) => {
                console.log("deepgram: error received");
                console.error(error);
            });
            deepgram.addListener(LiveTranscriptionEvents.Warning, async (warning) => {
                console.log("deepgram: warning received");
                console.warn(warning);
            });

            deepgram.addListener(LiveTranscriptionEvents.Metadata, (data) => {
                ws.send(JSON.stringify({ metadata: data }));
            });
        });

        return deepgram;
    };

    wss.on("connection", (ws) => {
        console.log("socket: client connected");
        let deepgram = setupDeepgram(ws);

        ws.on("message", (message) => {
            if (deepgram.getReadyState() === 1) {
                deepgram.send(message);
            } else if (deepgram.getReadyState() >= 2) {
                console.log("socket: data couldn't be sent to deepgram");
                console.log("socket: retrying connection to deepgram");
                deepgram.requestClose();
                deepgram.removeAllListeners();
                deepgram = setupDeepgram(ws);
            } else {
                console.log("socket: data couldn't be sent to deepgram");
            }
        });

        ws.on("close", () => {
            console.log("socket: client disconnected");
            deepgram.requestClose();
            deepgram.removeAllListeners();
            deepgram = null;
        });
    });

    app.get('/settings', (req, res) => {
        res.json(settings);
    });

    app.get('/agent-status', (req, res) => {
        res.json({ agentStarted: agentProcessStarted });
    });
    
    app.post('/stop', (req, res) => {
        if (!agentProcessStarted) {
            return res.status(404).send('No agent processes are currently running.');
        }

        agentProcesses.forEach(agentProcess => {
            agentProcess.agentProcess.kill('SIGTERM');;
        });

        agentProcesses = [];
        agentProcessStarted = false;

        res.send('All agent processes have been stopped.');
    });

    app.post('/start', express.json(), (req, res) => {
        if (agentProcessStarted) {
            return res.status(409).send('Agent process already started. Restart not allowed.');
        }

        const newSettings = req.body;
        Object.assign(settings, newSettings);
        fs.writeFileSync('settings.json', JSON.stringify(settings, null, 4));

        profiles = settings.profiles;
        load_memory = settings.load_memory;
        init_message = settings.init_message;

        for (let profile of profiles) {
            const agentProcess = new AgentProcess();
            agentProcess.start(profile, load_memory, init_message);
            agentProcesses.push(agentProcess);
        }
        agentProcessStarted = true;
        res.send('Settings updated and AgentProcess started for all profiles');
    });

    server.listen(port, '0.0.0.0', () => {
        console.log(`Server running at http://0.0.0.0:${port}`);
    });
} else {
    for (let profile of profiles) {
        const agentProcess = new AgentProcess();
        agentProcess.start(profile, load_memory, init_message);
        agentProcesses.push(agentProcess);
    }
    agentProcessStarted = true;
}