import { History } from './history.js';
import { Coder } from './coder.js';
import { Prompter } from './prompter.js';
import { initModes } from './modes.js';
import { initBot } from '../utils/mcdata.js';
import { containsCommand, commandExists, executeCommand, truncCommandMessage } from './commands/index.js';
import { NPCContoller } from './npc/controller.js';
import { MemoryBank } from './memory_bank.js';
import settings from '../../settings.json' assert { type: 'json' };

/**
 * Represents an AI agent that can interact with a Minecraft world.
 */
export class Agent {
    /**
     * Initializes and starts the agent.
     * @param {string} profile_fp - File path to the agent's profile.
     * @param {boolean} load_mem - Whether to load memory from previous sessions.
     * @param {string|null} init_message - Initial message to send to the agent.
     */
    async start(profile_fp, load_mem=false, init_message=null) {
        // Initialize agent components
        this.prompter = new Prompter(this, profile_fp);
        this.name = this.prompter.getName();
        this.history = new History(this);
        this.coder = new Coder(this);
        this.npc = new NPCContoller(this);
        this.memory_bank = new MemoryBank();

        await this.prompter.initExamples();

        console.log('Logging in...');
        this.bot = initBot(this.name);

        initModes(this);

        if (load_mem)
            this.history.load();

        this.bot.once('spawn', async () => {
            // Wait for a bit so stats are not undefined
            await new Promise((resolve) => setTimeout(resolve, 1000));

            console.log(`${this.name} spawned.`);
            this.coder.clear();
            
            // Define messages to ignore
            const ignore_messages = [
                "Set own game mode to",
                "Set the time to",
                "Set the difficulty to",
                "Teleported ",
                "Set the weather to",
                "Gamerule "
            ];
            const eventname = settings.profiles.length > 1 ? 'whisper' : 'chat';
            
            // Set up chat event listener
            this.bot.on(eventname, (username, message) => {
                if (username === this.name) return;
                
                if (ignore_messages.some((m) => message.startsWith(m))) return;

                console.log('received message from', username, ':', message);
    
                this.handleMessage(username, message);
            });

            // Configure auto-eat settings
            this.bot.autoEat.options = {
                priority: 'foodPoints',
                startAt: 14,
                bannedFood: ["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "chicken"]
            };

            // Handle initial message or send a greeting
            if (init_message) {
                this.handleMessage('system', init_message);
            } else {
                this.bot.chat('Hello world! I am ' + this.name);
                this.bot.emit('finished_executing');
            }

            this.startEvents();
        });
    }

    /**
     * Cleans and sends a chat message.
     * @param {string} message - The message to send.
     */
    cleanChat(message) {
        // Replace newlines with spaces to avoid spam filters
        message = message.replaceAll('\n', '  ');
        return this.bot.chat(message);
    }

    /**
     * Handles incoming messages and executes appropriate actions.
     * @param {string} source - The source of the message.
     * @param {string} message - The content of the message.
     */
    async handleMessage(source, message) {
        if (!this.bot) {
            return;
        }

        const user_command_name = containsCommand(message);
        if (user_command_name) {
            if (!commandExists(user_command_name)) {
                this.bot.chat(`Command '${user_command_name}' does not exist.`);
                return;
            }
            this.bot.chat(`*${source} used ${user_command_name.substring(1)}*`);
            if (user_command_name === '!newAction') {
                // Add context for newAction command
                this.history.add(source, message);
            }
            let execute_res = await executeCommand(this, message);
            if (execute_res) 
                this.cleanChat(execute_res);
            return;
        }

        await this.history.add(source, message);

        // Process the message and generate responses
        for (let i=0; i<5; i++) {
            let history = this.history.getHistory();
            let res = await this.prompter.promptConvo(history);

            let command_name = containsCommand(res);

            if (command_name) {
                console.log(`Full response: ""${res}""`)
                res = truncCommandMessage(res);
                this.history.add(this.name, res);
                if (!commandExists(command_name)) {
                    this.history.add('system', `Command ${command_name} does not exist. Use !newAction to perform custom actions.`);
                    console.log('Agent hallucinated command:', command_name)
                    continue;
                }
                let pre_message = res.substring(0, res.indexOf(command_name)).trim();
                let chat_message = `*used ${command_name.substring(1)}*`;
                if (pre_message.length > 0)
                    chat_message = `${pre_message}  ${chat_message}`;
                this.cleanChat(chat_message);

                let execute_res = await executeCommand(this, res);

                console.log('Agent executed:', command_name, 'and got:', execute_res);

                if (execute_res)
                    this.history.add('system', execute_res);
                else
                    break;
            }
            else {
                this.history.add(this.name, res);
                this.cleanChat(res);
                console.log('Purely conversational response:', res);
                break;
            }
        }

        this.history.save();
        this.bot.emit('finished_executing');
    }

    /**
     * Initializes and starts various event listeners for the agent.
     */
    startEvents() {
        // Custom time-based events
        this.bot.on('time', () => {
            if (this.bot.time.timeOfDay == 0)
                this.bot.emit('sunrise');
            else if (this.bot.time.timeOfDay == 6000)
                this.bot.emit('noon');
            else if (this.bot.time.timeOfDay == 12000)
                this.bot.emit('sunset');
            else if (this.bot.time.timeOfDay == 18000)
                this.bot.emit('midnight');
        });

        // Health tracking
        let prev_health = this.bot.health;
        this.bot.lastDamageTime = 0;
        this.bot.lastDamageTaken = 0;
        this.bot.on('health', () => {
            if (this.bot.health < prev_health) {
                this.bot.lastDamageTime = Date.now();
                this.bot.lastDamageTaken = prev_health - this.bot.health;
            }
            prev_health = this.bot.health;
        });

        // Error handling and logging
        this.bot.on('error' , (err) => {
            console.error('Error event!', err);
        });
        this.bot.on('end', (reason) => {
            console.warn('Bot disconnected! Killing agent process.', reason)
            console.log('[CLEANKILL] Bot disconnected.');
            this.cleanKill('Bot disconnected! Killing agent process.');
        });
        this.bot.on('death', () => {
            this.coder.cancelResume();
            console.log("[CODERSTOP] Bot death.");
            this.coder.stop();
        });
        this.bot.on('kicked', (reason) => {
            console.warn('Bot kicked!', reason);
            console.log('[CLEANKILL] Bot kicked.');
            this.cleanKill('Bot kicked! Killing agent process.');
        });
        this.bot.on('messagestr', async (message, _, jsonMsg) => {
            if (jsonMsg.translate && jsonMsg.translate.startsWith('death') && message.startsWith(this.name)) {
                console.log('Agent died: ', message);
                this.handleMessage('system', `You died with the final message: '${message}'. Previous actions were stopped and you have respawned. Notify the user and perform any necessary actions.`);
            }
        });
        this.bot.on('idle', () => {
            this.bot.clearControlStates();
            this.bot.pathfinder.stop(); // Clear any lingering pathfinder
            this.bot.modes.unPauseAll();
            this.coder.executeResume();
        });

        // Initialize NPC controller
        this.npc.init();

        // Set up update loop for modes
        const INTERVAL = 300;
        setTimeout(async () => {
            while (true) {
                let start = Date.now();
                await this.bot.modes.update();
                let remaining = INTERVAL - (Date.now() - start);
                if (remaining > 0) {
                    await new Promise((resolve) => setTimeout(resolve, remaining));
                }
            }
        }, INTERVAL);

        this.bot.emit('idle');
    }

    /**
     * Checks if the agent is currently idle.
     * @returns {boolean} True if the agent is idle, false otherwise.
     */
    isIdle() {
        return !this.coder.executing && !this.coder.generating;
    }
    
    /**
     * Performs a clean shutdown of the agent.
     * @param {string} msg - Message to log before shutting down.
     */
    cleanKill(msg='Killing agent process...') {
        this.history.add('system', msg);
        this.bot.chat('Goodbye world.')
        this.history.save();
        process.exit(1);
    }
}
