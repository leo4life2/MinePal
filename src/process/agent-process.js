import { fork } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const logFile = path.join(app.getPath('userData'), 'app.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function logToFile(message) {
    logStream.write(`${new Date().toISOString()} - ${message}\n`);
}

/**
 * Represents a process for managing and running an agent.
 * This class handles the spawning, monitoring, and restarting of agent processes.
 */
export class AgentProcess {
    constructor() {
        this.agentProcess = null;
        this.restartCount = 0; // Track restart count
        this.lastRestartTime = Date.now(); // Track last restart time
        const now = new Date();
        this.logFileNamePrefix = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}`;
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
        const profilePath = path.join(app.getAppPath(), profile);
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

        // Create log file name with datetime and sanitized profile
        const sanitizedProfile = profile.replace(/[^a-zA-Z0-9-_]/g, '_');
        const logFileName = `${this.logFileNamePrefix}_${sanitizedProfile}.log`;
        const logFilePath = path.join(logDir, logFileName);
        logToFile(`Log file path: ${logFilePath}`);

        // Log all arguments at the top of the log file
        if (!fs.existsSync(logFilePath)) {
            fs.writeFileSync(logFilePath, `Arguments: ${args.join(' ')}\n\n`, { mode: 0o666 });
        } else {
            fs.appendFileSync(logFilePath, `\n\nArguments: ${args.join(' ')}\n\n`);
        }

        // Spawn the agent process using Node.js's child_process.fork
        const agentLogStream = fs.createWriteStream(logFilePath, { flags: 'a' });
        this.agentProcess = fork(path.join(app.getAppPath(), 'src/process/init-agent.js'), args, {
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        });

        // Pipe process output to log file
        this.agentProcess.stdout.pipe(agentLogStream);
        this.agentProcess.stderr.pipe(agentLogStream);

        this.agentProcess.on('exit', (code, signal) => {
            logToFile(`Agent process exited with code ${code} and signal ${signal}`);
            if (!agentLogStream.destroyed) {
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
                if (!agentLogStream.destroyed) {
                    agentLogStream.write('Restart limit reached. Not restarting.\n');
                    agentLogStream.end();
                }
                return;
            }

            if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGINT') {
                logToFile('Restarting agent...');
                if (!agentLogStream.destroyed) {
                    agentLogStream.write('Restarting agent...\n');
                    agentLogStream.end();
                }
                this.start(profile, userDataDir, true, 'Agent process restarted.');
            } else if (signal === 'SIGTERM' || signal === 'SIGINT') {
                logToFile('Agent process terminated by SIGTERM. Not restarting.');
                if (!agentLogStream.destroyed) {
                    agentLogStream.write('Agent process terminated by SIGTERM. Not restarting.\n');
                    agentLogStream.end();
                }
            }
        });
    
        this.agentProcess.on('error', (err) => {
            logToFile(`Failed to start agent process: ${err}`);
            if (!agentLogStream.destroyed) {
                agentLogStream.write(`Failed to start agent process: ${err}\n`);
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