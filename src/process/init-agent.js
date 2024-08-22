import { Agent } from '../agent/agent.js';
import yargs from 'yargs';
import fs from 'fs';
import path from 'path';

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
agent.start(argv.profile, argv.userDataDir, argv.appPath, argv.load_memory);

process.on('message', (e) => {
    console.log("message", e);
    if (e.type === 'transcription') {
        // Handle the transcription message
        agent.handleMessage(settings.player_username, e.data);
    } else if (e.type === 'manual_chat') {
        agent.sendMessage(e.data);
    }
});

// Add logging for process exit
process.on('exit', (code) => {
    console.log(`Process exited with code: ${code}`);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});