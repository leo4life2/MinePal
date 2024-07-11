import { Agent } from '../agent/agent.js';
import yargs from 'yargs';
import settings from '../../settings.json' assert { type: 'json' };

const args = process.argv.slice(2);
if (args.length < 1) {
    console.log('Usage: node init_agent.js <agent_name> [profile] [load_memory] [init_message]');
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
    .option('init_message', {
        alias: 'm',
        type: 'string',
        description: 'automatically prompt the agent on startup'
    }).argv

const agent = new Agent();
agent.start(argv.profile, argv.load_memory, argv.init_message);
    
process.on('message', (message) => {
    if (message.type === 'transcription') {
        // Handle the transcription message
        agent.handleMessage(settings.player_username, message.data);
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