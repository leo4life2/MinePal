import { Agent } from '../agent/agent.js';
import yargs from 'yargs';
import fs from 'fs';
import path from 'path';
import axios from 'axios'; // Add axios for HTTP requests

const args = process.argv.slice(2);
if (args.length < 1) {
    console.log('Usage: node init_agent.js [profile] [load_memory] [userDataDir]');
    process.exit(1);
}

const argv = yargs(args)
    .option('profile', {
        alias: 'p',
        type: 'string',
        description: 'profile filepath to use for agent'
    })
    .option('load_memory', {
        alias: 'l',
        type: 'boolean',
        description: 'load agent memory from file on startup'
    })
    .option('userDataDir', {
        alias: 'u',
        type: 'string',
        description: 'directory to store user data'
    })
    .option('appPath', {
        alias: 'e',
        type: 'string',
        description: 'application path'
    }).argv

const settingsPath = path.join(argv.userDataDir, 'settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

const agent = new Agent();

// --- Play time tracking ---
const startTime = Date.now();
function getPlayTimeSec() {
    return Math.floor((Date.now() - startTime) / 1000);
}

async function logAgentSession({ play_time_sec, stop_reason, crash_reason = null, metadata = null }) {
    try {
        await axios.post('http://localhost:10101/log-agent-session', {
            play_time_sec,
            stop_reason,
            crash_reason,
            metadata
        });
    } catch (err) {
        // Don't throw, just log
        console.error('[LOG_AGENT_SESSION] Failed to log agent session:', err?.response?.data || err.message);
    }
}
// --- End play time tracking ---

try {
    agent.start(argv.profile, argv.userDataDir, argv.appPath, argv.load_memory).then(() => {
        agent.bot._client.on('error', (error) => {
            console.error('[Client Error]', error);
            
            // Check if it's an unsupported protocol version error
            if (error.message && error.message.includes('Unsupported protocol version')) {
                console.error('[Version Error] Minecraft version incompatibility detected');
                process.exit(129);
            } else if (error.message && (error.message.includes('ECONNRESET') || error.message.includes('read ECONNRESET'))) {
                console.error('[Connection Error] Modded server detected that MinePal does not support');
                process.exit(130);
            } else {
                process.exit(1);
            }
        });
    });
} catch (error) {
    console.error('[Agent Start Error]', error);
}

process.on('message', async (e) => {
    console.log("message received:", e);
    if (e.type === 'transcription') {
        // Handle the transcription message
        agent.handleMessage(settings.player_username, e.data);
    } else if (e.type === 'manual_chat') {
        agent.sendMessage(e.data);
    } else if (e.type === 'shutdown') {
        console.log('[IPC] Received shutdown message. Exiting gracefully...');
        await logAgentSession({
            play_time_sec: getPlayTimeSec(),
            stop_reason: 'graceful'
        });
        process.exit(0);
    }
});

// Add logging for process exit
process.on('exit', (code) => {
    console.log(`[EXIT] Process exited with code: ${code}`);
});

process.on('uncaughtException', async (err) => {
    console.error('[CRASH] Uncaught Exception:', err);
    await logAgentSession({
        play_time_sec: getPlayTimeSec(),
        stop_reason: 'crash',
        crash_reason: err && err.stack ? `${err.toString()}\n${err.stack}` : JSON.stringify(err, Object.getOwnPropertyNames(err), 2)
    });
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('[CRASH] Unhandled Rejection at:', promise, 'reason:', reason);
    await logAgentSession({
        play_time_sec: getPlayTimeSec(),
        stop_reason: 'crash',
        crash_reason: `Reason: ${JSON.stringify(reason, Object.getOwnPropertyNames(reason), 2)}\nPromise: ${JSON.stringify(promise, Object.getOwnPropertyNames(promise), 2)}`
    });
    process.exit(1);
});

// Add signal handlers for graceful shutdown requests
process.on('SIGINT', async () => {
    console.log('[SIGINT] Received SIGINT. Exiting...');
    await logAgentSession({
        play_time_sec: getPlayTimeSec(),
        stop_reason: 'graceful'
    });
    process.exit(0); // Use 0 for graceful exit request
});

process.on('SIGTERM', async () => {
    console.log('[SIGTERM] Received SIGTERM. Exiting...');
    await logAgentSession({
        play_time_sec: getPlayTimeSec(),
        stop_reason: 'graceful'
    });
    process.exit(0); // Use 0 for graceful exit request
});