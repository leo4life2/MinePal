import { readFileSync } from 'fs';
import { History } from './history.js';
import { Coder } from './coder.js';
import { Prompter } from './prompter.js';
import { initModes } from './modes.js';
import MCData from '../utils/mcdata.js';
import { containsCommand, commandExists, executeCommand, truncCommandMessage } from './commands/index.js';
import { NPCContoller } from './npc/controller.js';
import { MemoryBank } from './memory_bank.js';
import fs from 'fs/promises';
import { queryList } from './commands/queries.js';
import * as world from "./library/world.js";

const queryMap = {
    stats: queryList.find(query => query.name === "!stats").perform,
    inventory: queryList.find(query => query.name === "!inventory").perform,
    nearbyBlocks: queryList.find(query => query.name === "!nearbyBlocks").perform,
    nearbyEntities: queryList.find(query => query.name === "!entities").perform,
};

/**
 * Represents an AI agent that can interact with a Minecraft world.
 */
export class Agent {
    constructor() {
        // Initialize the latest HUD as an empty map
        this.latestHUD = {
            position: '',
            gamemode: '',
            health: '',
            hunger: '',
            biome: '',
            weather: '',
            timeOfDay: '',
            otherPlayers: [],
            backpack: [],
            hotbar: [],
            offHand: [],
            armor: [],
            nearbyBlocks: [],
            nearbyEntities: [],
            empty: true // for easy detect, on first use only
        };
        this.hudListFields = ['otherPlayers', 'backpack', 'hotbar', 'offHand', 'armor', 'nearbyBlocks', 'nearbyEntities'];
    }

    /**
     * Initializes and starts the agent.
     * @param {string} profile_fp - File path to the agent's profile.
     * @param {string} userDataDir - Path to the user data directory.
     * @param {string} appPath - Path to the application directory.
     * @param {boolean} load_mem - Whether to load memory from previous sessions.
     */
    async start(profile_fp, userDataDir, appPath, load_mem=false) {
        // Initialize agent components
        this.userDataDir = userDataDir;
        this.appPath = appPath
        this.profile = JSON.parse(readFileSync(profile_fp, 'utf8'));
        this.prompter = new Prompter(this);
        this.name = this.prompter.getName();
        const settingsPath = `${this.userDataDir}/settings.json`;
        this.settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8')); // Changed to instance variable
        this.owner = this.settings.player_username
        this.history = new History(this);
        this.coder = new Coder(this);
        this.npc = new NPCContoller(this);
        this.memory_bank = new MemoryBank();

        //await this.prompter.initExamples();

        console.log('Logging in...');
        this.mcdata = MCData.getInstance(this.settings); // Use singleton with settings
        this.bot = this.mcdata.initBot(this.name); // Initialize bot with agent's name

        this.bot.whisper_to_player = this.settings.whisper_to_player;
        this.bot.owner = this.owner;

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
            const eventname = this.settings.profiles.length > 1 ? 'whisper' : 'chat'; // Updated to use instance variable
            
            // Set up chat event listener
            this.bot.on(eventname, (username, message) => {
                if (username === this.name) return;
                if (ignore_messages.some((m) => message.startsWith(m))) return;
                this.handleMessage(username, message);
            });

            await this.sendMessage('Hello world! I am ' + this.name);
            this.bot.emit('finished_executing');

            this.startEvents();
        });
    }

    /**
     * Generates a heads-up display (HUD) string with stats, inventory, nearby blocks, and nearby entities.
     * @returns {string} The HUD string with changes highlighted.
     */
    async headsUpDisplay() {
        if (!this.bot.entity) {
            return '';
        }

        // Initialize new HUD elements
        let newHUD = {
            position: '',
            gamemode: '',
            health: '',
            hunger: '',
            biome: '',
            weather: '',
            timeOfDay: '',
            otherPlayers: [],
            backpack: [],
            hotbar: [],
            offHand: [],
            armor: [],
            nearbyBlocks: [],
            nearbyEntities: []
        };

        const armorSlots = {
            head: 5,
            torso: 6,
            legs: 7,
            feet: 8,
        };

        const mainInventoryStart = 9;
        const mainInventoryEnd = 35;

        const hotbarStart = 36;
        const hotbarEnd = 44;

        const offHandSlot = 45;

        // Initializing basic stats
        newHUD.position = `x: ${this.bot.entity.position.x.toFixed(2)}, y: ${this.bot.entity.position.y.toFixed(2)}, z: ${this.bot.entity.position.z.toFixed(2)}`;
        newHUD.gamemode = this.bot.game.gameMode;
        newHUD.health = `${Math.round(this.bot.health)} / 20`;
        newHUD.hunger = `${Math.round(this.bot.food)} / 20`;
        newHUD.biome = world.getBiomeName(this.bot);

        newHUD.weather = "Clear";
        if (this.bot.rainState > 0) newHUD.weather = "Rain";
        if (this.bot.thunderState > 0) newHUD.weather = "Thunderstorm";

        if (this.bot.time.timeOfDay < 6000) {
            newHUD.timeOfDay = "Morning";
        } else if (this.bot.time.timeOfDay < 12000) {
            newHUD.timeOfDay = "Afternoon";
        } else {
            newHUD.timeOfDay = "Night";
        }

        newHUD.otherPlayers = world.getNearbyPlayerNames(this.bot);

        // Initializing inventory
        for (let i = mainInventoryStart; i <= mainInventoryEnd; i++) {
            let item = this.bot.inventory.slots[i];
            if (item) {
                newHUD.backpack.push(`${item.name}: ${item.count}`);
            }
        }

        for (let i = hotbarStart; i <= hotbarEnd; i++) {
            let item = this.bot.inventory.slots[i];
            if (item) {
                newHUD.hotbar.push(`${item.name}: ${item.count}`);
            }
        }

        if (!this.bot.supportFeature("doesntHaveOffHandSlot")) {
            let offHandItem = this.bot.inventory.slots[offHandSlot];
            newHUD.offHand.push(offHandItem ? `${offHandItem.name}: ${offHandItem.count}` : "empty");
        }

        for (const [slotName, slotIndex] of Object.entries(armorSlots)) {
            let item = this.bot.inventory.slots[slotIndex];
            newHUD.armor.push(`${slotName}: ${item ? `${item.name}: ${item.count}` : "empty"}`);
        }

        // Initializing nearby blocks and entities
        newHUD.nearbyBlocks = world.getNearbyBlockTypes(this.bot);
        newHUD.nearbyEntities = world.getNearbyEntityTypes(this.bot);

        // Construct HUD string
        let statsRes = "STATS";
        statsRes += `\n- Position: ${newHUD.position}`;
        statsRes += `\n- Gamemode: ${newHUD.gamemode}`;
        statsRes += `\n- Health: ${newHUD.health}`;
        statsRes += `\n- Hunger: ${newHUD.hunger}`;
        statsRes += `\n- Biome: ${newHUD.biome}`;
        statsRes += `\n- Weather: ${newHUD.weather}`;
        statsRes += `\n- Time: ${newHUD.timeOfDay}`;

        if (newHUD.otherPlayers.length > 0) {
            statsRes += "\n- Other Players: " + newHUD.otherPlayers.join(", ");
        }

        let inventoryRes = "INVENTORY";
        inventoryRes += "\nBackpack:" + (newHUD.backpack.length ? `\n- ${newHUD.backpack.join("\n- ")}` : " none");
        inventoryRes += "\nHotbar:" + (newHUD.hotbar.length ? `\n- ${newHUD.hotbar.join("\n- ")}` : " none");
        inventoryRes += "\nOff Hand Slot:" + (newHUD.offHand.length ? `\n- ${newHUD.offHand.join("\n- ")}` : " none");
        inventoryRes += "\nArmor Slots:" + (newHUD.armor.length ? `\n- ${newHUD.armor.join("\n- ")}` : " none");

        if (this.bot.game.gameMode === "creative") {
            inventoryRes += "\n(You have infinite items in creative mode)";
        }

        let blocksRes = "NEARBY_BLOCKS";
        blocksRes += newHUD.nearbyBlocks.length ? `\n- ${newHUD.nearbyBlocks.join("\n- ")}` : ": none";

        let entitiesRes = "NEARBY_ENTITIES";
        entitiesRes += newHUD.nearbyEntities.length ? `\n- mob: ${newHUD.nearbyEntities.join("\n- mob: ")}` : ": none";

        // Return both newHUD and the HUD string
        return {
            newHUD,
            hudString: `${statsRes}\n${inventoryRes}\n${blocksRes}\n${entitiesRes}`
        };
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

        // await this.history.add("system", "When you wish to do something, never just say you're doing it, you must pick a command from the docs and call it like !commandName(params). NEVER say anything like this: 'Sure, I've stopped.', instead say this: 'Sure, I'll stop. !stop'");
        await this.history.add(source, message);
        // Process the message and generate responses
        for (let i = 0; i < 5; i++) {
            let history = this.history.getHistory();

            // Check if latestHUD is empty
            const { newHUD } = await this.headsUpDisplay();
            if (!this.latestHUD.empty) { // if no longer an empty latest hud, we do diff and tell bot diff
                // Compare newHUD and latestHUD
                let diffText = '';

                this.hudListFields.forEach(field => {
                    const oldList = this.latestHUD[field];
                    const newList = newHUD[field];

                    const goneItems = oldList.filter(item => !newList.includes(item));
                    const newItems = newList.filter(item => !oldList.includes(item));

                    if (goneItems.length > 0) {
                        diffText += `**GONE: ${field} - ${goneItems.join(', ')}\n`;
                    }
                    if (newItems.length > 0) {
                        diffText += `**NEW: ${field} - ${newItems.join(', ')}\n`;
                    }
                });

                if (diffText) {
                    // console.log(`\n\nINVENTORY/STATUS UPDATE:\n${diffText}\n\n`);
                    this.history.add('system', `Your inventory or status has updated. Here are the changes:\n${diffText}`);
                }
            }
            this.latestHUD = newHUD; // Update latestHUD

            history = this.history.getHistory(); // Get updated history
            let res = await this.prompter.promptConvo(history);

            // Now we parse and execute commands.
            let command_name = containsCommand(res);
            // add user message
            if (command_name) {
                console.log(`Full response: ""${res}""`)
                res = truncCommandMessage(res);
                if (!commandExists(command_name)) {
                    this.history.add('system', `Command ${command_name} does not exist. Use !newAction to perform custom actions.`);
                    console.log('Agent hallucinated command:', command_name)
                    continue;
                }
                let pre_message = res.substring(0, res.indexOf(command_name)).trim();
                let chat_message = "";
                // let chat_message = `*used ${command_name.substring(1)}*`;
                // if (pre_message.length > 0)
                //     chat_message = `${pre_message}  ${chat_message}`;
                if (pre_message.length > 0)
                    chat_message = `${pre_message}`;
                await this.sendMessage(chat_message, true);

                let execute_res = await executeCommand(this, res);

                console.log('Agent executed:', command_name, 'and got:', execute_res);

                if (execute_res)
                    this.history.add('system', execute_res);
                else
                    break;
            }
            else {
                await this.sendMessage(res, true);
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
            this.cleanKill('Bot kicked! Killing agent process.', reason="KICK");
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
        const INTERVAL = 1000;
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
    cleanKill(msg='Killing agent process...', reason = null) {
        this.history.add('system', msg);
        this.sendMessage('Goodbye world.')
        this.history.save();

        if (reason === 'KICK') {
            process.exit(128);
        } else {
            process.exit(1);
        }
    }

    /**
     * Cleans a chat message.
     * @param {string} message - The message to send.
     */
    cleanChat(message) {
        // Replace newlines with spaces to avoid spam filters
        message = message.replaceAll('\n', '  ');
        return message;
    }

    /**
     * Sends a chat message and updates the conversation history.
     * @param {string} message - The message to send.
     * @param {boolean} clean - Whether to clean the message before sending.
     */
    async sendMessage(message, clean = false) {
        if (clean) {
            message = this.cleanChat(message);
        }
        this.bot.chat(message);
        await this.history.add(this.name, message);
    }
}