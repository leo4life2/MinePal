import { spawn } from 'child_process';

/**
 * Represents a process for managing and running an agent.
 * This class handles the spawning, monitoring, and restarting of agent processes.
 */
export class AgentProcess {
    constructor() {
        this.agentProcess = null;
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

        // Spawn the agent process with IPC enabled
        this.agentProcess = spawn('node', args, {
            stdio: ['inherit', 'inherit', 'inherit', 'ipc'], // Enable IPC
        });
        
        let last_restart = Date.now();
        this.agentProcess.on('exit', (code, signal) => {
            console.log(`Agent process exited with code ${code} and signal ${signal}`);
            
            if (code !== 0 && signal !== 'SIGTERM') {
                // Check if the agent ran for at least 10 seconds before attempting to restart
                if (Date.now() - last_restart < 10000) {
                    console.error('Agent process exited too quickly. Killing entire process. Goodbye.');
                    process.exit(1);
                }
                console.log('Restarting agent...');
                this.start(profile, true, 'Agent process restarted.');
                last_restart = Date.now();
            } else if (signal === 'SIGTERM') {
                console.log('Agent process terminated by SIGTERM. Not restarting.');
            }
        });
    
        this.agentProcess.on('error', (err) => {
            console.error('Failed to start agent process:', err);
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