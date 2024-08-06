import { fork } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { createStream } from 'rotating-file-stream';

const logStream = createStream('app.log', {
    size: '500K', // Rotate every 500KB
    path: app.getPath('userData')
});

function logToFile(message) {
    logStream.write(`${new Date().toISOString()} - ${message}\n`);
}

/**
 * Represents a process for managing and running an agent.
 * This class handles the spawning, monitoring, and restarting of agent processes.
 */
export class AgentProcess {
    constructor(notifyBotKicked) {
        this.agentProcess = null;
        this.restartCount = 0; // Track restart count
        this.lastRestartTime = Date.now(); // Track last restart time
        this.notifyBotKicked = notifyBotKicked
    }

    /**
     * Starts the agent process with the given profile and options.
     * @param {string} profile - The profile to use for the agent.
     * @param {string} userDataDir - The directory to store log files.
     * @param {boolean} [load_memory=false] - Whether to load memory from a previous session.
     * @param {string|null} [init_message=null] - An initial message to send to the agent.
     */
    start(profile, userDataDir, load_memory=false, init_message=null) {
        // Prepare arguments for the agent process
        let args = [path.join(app.getAppPath(), 'src/process/init-agent.js')]; // Adjust path
        const logDirectory = app.getPath('userData');
        const profilesDir = path.join(logDirectory, 'profiles');
        const profilePath = path.join(profilesDir, `${profile}.json`);
        args.push('-p', profilePath, '-u', userDataDir, '-e', app.getAppPath());
        if (load_memory)
            args.push('-l', load_memory.toString()); // Ensure it's a string
        if (init_message)
            args.push('-m', init_message);

        const logDir = path.join(userDataDir, 'runlogs');
        // Create log directory if it doesn't exist
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir);
        }

        const logFilePath = path.join(logDir, 'agent.log');
        const agentLogStream = createStream('agent.log', {
            size: '5M', // Rotate every 5MB
            path: logDir
        });

        logToFile(`Log file path: ${logFilePath}`);

        // Log all arguments at the top of the log file
        if (!fs.existsSync(logFilePath)) {
            fs.writeFileSync(logFilePath, `Arguments: ${args.join(' ')}\n\n`, { mode: 0o666 });
        } else {
            fs.appendFileSync(logFilePath, `\n\nArguments: ${args.join(' ')}\n\n`);
        }

        // Spawn the agent process using Node.js's child_process.fork
        this.agentProcess = fork(path.join(app.getAppPath(), 'src/process/init-agent.js'), args, {
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        });

        // Pipe process output to log file
        this.agentProcess.stdout.pipe(agentLogStream);
        this.agentProcess.stderr.pipe(agentLogStream);

        this.agentProcess.on('exit', (code, signal) => {
            logToFile(`Agent process exited with code ${code} and signal ${signal}`);
            if (agentLogStream.writable) {
                agentLogStream.write(`Agent process exited with code ${code} and signal ${signal}\n`);
                agentLogStream.end();
            }

            const now = Date.now();
            if (now - this.lastRestartTime < 2000) {
                this.restartCount++;
            } else {
                this.restartCount = 1; // Reset counter if more than 2 seconds have passed
            }
            this.lastRestartTime = now;

            if (this.restartCount > 3) {
                logToFile('Restart limit reached. Not restarting.');
                if (agentLogStream.writable) {
                    agentLogStream.write('Restart limit reached. Not restarting.\n');
                    agentLogStream.end();
                }
                return;
            }

            if (code === 128 || signal === 'SIGTERM' || signal === 'SIGINT') {
                const reason = code === 128 ? 'bot being kicked' : 'SIGTERM';
                logToFile(`Agent process terminated due to ${reason}. Not restarting.`);
                if (agentLogStream.writable) {
                    agentLogStream.write(`Agent process terminated due to ${reason}. Not restarting.\n`);
                    agentLogStream.end();
                }
                this.notifyBotKicked();
            } else if (code !== 0) {
                logToFile('Restarting agent...');
                if (agentLogStream.writable) {
                    agentLogStream.write('Restarting agent...\n');
                    agentLogStream.end();
                }
                this.start(profile, userDataDir, true, 'Agent process restarted.');
            }
        });
    
        this.agentProcess.on('error', (err) => {
            logToFile(`Failed to start agent process: ${err}\n${err.stack}`);
            if (!agentLogStream.destroyed) {
                agentLogStream.write(`Failed to start agent process: ${err}\n${err.stack}\n`);
                agentLogStream.end();
            }
        });
    }

    /**
     * Sends a transcription message to the agent process.
     * @param {string} transcription - The transcription to send.
     */
    sendTranscription(transcription) {
        if (this.agentProcess && transcription.trim() !== '') {
            try {
                this.agentProcess.send({
                    type: 'transcription',
                    data: transcription
                });
            } catch (error) {
                logToFile(`Failed to send message: ${error}`);
            }
        } else if (!this.agentProcess) {
            logToFile('Agent process is not initialized.');
        }
    }
}