import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Represents a process for managing and running an agent.
 * This class handles the spawning, monitoring, and restarting of agent processes.
 */
export class AgentProcess {
    constructor() {
        this.agentProcess = null;
        const now = new Date();
        this.logFileNamePrefix = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}`;
    }

    /**
     * Starts the agent process with the given profile and options.
     * @param {string} profile - The profile to use for the agent.
     * @param {boolean} [load_memory=false] - Whether to load memory from a previous session.
     * @param {string|null} [init_message=null] - An initial message to send to the agent.
     */
    start(profile, load_memory=false, init_message=null) {
        // Prepare arguments for the agent process
        let args = ['src/process/init-agent.js', this.name];
        args.push('-p', profile);
        if (load_memory)
            args.push('-l', load_memory);
        if (init_message)
            args.push('-m', init_message);

        // Create log directory if it doesn't exist
        const logDir = 'agent-runlogs';
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir);
        }

        // Create log file name with datetime and sanitized profile
        const sanitizedProfile = profile.replace(/[^a-zA-Z0-9-_]/g, '_');
        const logFileName = `${this.logFileNamePrefix}_${sanitizedProfile}.log`;
        const logFilePath = path.join(logDir, logFileName);

        // Log all arguments at the top of the log file
        if (!fs.existsSync(logFilePath)) {
            fs.writeFileSync(logFilePath, `Arguments: ${args.join(' ')}\n\n`, { mode: 0o666 });
        } else {
            fs.appendFileSync(logFilePath, `\n\nArguments: ${args.join(' ')}\n\n`);
        }

        // Spawn the agent process with IPC enabled and redirect output to log file
        const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
        this.agentProcess = spawn('node', args, {
            stdio: ['inherit', 'pipe', 'pipe', 'ipc'], // Enable IPC and pipe stdout/stderr
        });
        
        // Pipe process output to log file
        this.agentProcess.stdout.pipe(logStream);
        this.agentProcess.stderr.pipe(logStream);

        let last_restart = Date.now();
        this.agentProcess.on('exit', (code, signal) => {
            console.log(`Agent process exited with code ${code} and signal ${signal}`);
            if (!logStream.destroyed) {
                logStream.write(`Agent process exited with code ${code} and signal ${signal}\n`);
                logStream.end();
            }

            if (code !== 0 && signal !== 'SIGTERM') {
                console.log('Restarting agent...');
                if (!logStream.destroyed) {
                    logStream.write('Restarting agent...\n');
                    logStream.end();
                }
                this.start(profile, true, 'Agent process restarted.');
                last_restart = Date.now();
            } else if (signal === 'SIGTERM') {
                console.log('Agent process terminated by SIGTERM. Not restarting.');
                if (!logStream.destroyed) {
                    logStream.write('Agent process terminated by SIGTERM. Not restarting.\n');
                    logStream.end();
                }
            }
        });
    
        this.agentProcess.on('error', (err) => {
            console.error('Failed to start agent process:', err);
            if (!logStream.destroyed) {
                logStream.write(`Failed to start agent process: ${err}\n`);
                logStream.end();
            }
        });
    }

    /**
     * Sends a transcription message to the agent process.
     * @param {string} transcription - The transcription to send.
     */
    sendTranscription(transcription) {
        if (this.agentProcess && this.agentProcess.connected) {
            this.agentProcess.send({
                type: 'transcription',
                data: transcription
            });
        } else {
            if (!this.agentProcess) {
                console.error('Cannot send transcription: Agent process is not running.');
            } else if (!this.agentProcess.connected) {
                console.error('Cannot send transcription: Agent process is not connected.');
            }
        }
    }
}