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
import * as world from "./library/world.js";

// --- Silence Timer Constants ---
const MEAN_1 = 45; // Base mean silence duration in seconds for the first silence
const STD_FACTOR = 10; // STD is MEAN_i / STD_FACTOR
const R = 3.5;    // Exponential factor for increasing mean silence duration
// --- End Silence Timer Constants ---

// --- Weather Constants ---
const WEATHER_LOW = 0.991;
const WEATHER_HIGH = 1.0;   // Window to detect weather ending
// --- End Weather Constants ---

// Helper function to generate descriptive time difference string
function timeAgo(pastDate) {
    const now = new Date();
    let value, unit, suffixSentence;

    if (!(pastDate instanceof Date) || isNaN(pastDate)) {
        return "an unknown time"; // Handle invalid date
    }
    const diffInSeconds = Math.floor((now.getTime() - pastDate.getTime()) / 1000);

    // Determine value and unit based on diffInSeconds
    if (diffInSeconds < 60) {
        value = diffInSeconds;
        unit = 'second';
    } else {
        const minutes = Math.floor(diffInSeconds / 60);
        if (minutes < 60) {
            value = minutes;
            unit = 'minute';
        } else {
            const hours = Math.floor(minutes / 60);
            if (hours < 24) {
                value = hours;
                unit = 'hour';
            } else {
                const days = Math.floor(hours / 24);
                if (days < 30) {
                    value = days;
                    unit = 'day';
                } else {
                    const months = Math.floor(days / 30); // Approximation
                    if (months < 12) {
                        value = months;
                        unit = 'month';
                    } else {
                        value = Math.floor(days / 365); // Approximation
                        unit = 'year';
                    }
                }
            }
        }
    }

    // Determine the suffix sentence based on the unit
    switch (unit) {
        case 'second':
            suffixSentence = "You've just reconnected to the game moments ago.";
            break;
        case 'minute':
            suffixSentence = "You've returned after briefly stepping away.";
            break;
        case 'hour':
            suffixSentence = "It's been a few hours since you were last here.";
            break;
        case 'day':
            suffixSentence = "You've returned after days away from this environment.";
            break;
        case 'month':
            suffixSentence = "It's been months since you were last in this space.";
            break;
        case 'year':
            suffixSentence = "You're finally back after years away from this world.";
            break;
        default: // Should not happen with valid date
             return "an unknown time";
    }

    // Construct the final string, handling pluralization simply
    const pluralSuffix = (value !== 1) ? 's' : ''; // Only add 's' if value isn't 1
    return `Your last boot was ${value} ${unit}${pluralSuffix} ago. ${suffixSentence}`;
}

// Helper: Box-Muller transform for generating normally distributed random numbers
function boxMullerRandomNormal(mean, stdDev) {
    let u1 = 0, u2 = 0;
    // Convert [0,1) to (0,1)
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    // z1 is the second random normal sample (unused here)
    // const z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
}

// Helper: Format duration in seconds into a human-readable string
function formatDuration(durationInSeconds) {
    let value, unit;

    if (durationInSeconds < 60) {
        value = Math.round(durationInSeconds);
        unit = 'second';
    } else {
        const minutes = Math.round(durationInSeconds / 60);
        if (minutes < 60) {
            value = minutes;
            unit = 'minute';
        } else {
            const hours = Math.round(minutes / 60);
            if (hours < 24) {
                value = hours;
                unit = 'hour';
            } else {
                const days = Math.round(hours / 24);
                 if (days < 30) { // Added day/month/year for longer potential silences
                    value = days;
                    unit = 'day';
                } else {
                    const months = Math.round(days / 30);
                    if (months < 12) {
                        value = months;
                        unit = 'month';
                    } else {
                         value = Math.round(days / 365);
                         unit = 'year';
                    }
                }
            }
        }
    }
    const pluralSuffix = (value !== 1) ? 's' : '';
    return `${value} ${unit}${pluralSuffix}`;
}

// Helper: Check for clear sky above the bot
function isClearAbove(bot) {
    // Check if entity exists and has position
    if (!bot || !bot.entity || !bot.entity.position) {
        console.warn("[isClearAbove] Bot entity or position not available.");
        return false; // Cannot determine if clear if position is unknown
    }
    const pos = bot.entity.position.floored();
    // Adjusted checkpoints to stay within reasonable build height
    const checkpoints = [2, 8, 16, 32, 64, 128, 192]; 

    for (const offset of checkpoints) {
        const checkY = pos.y + offset;
        if (checkY >= bot.game.height) continue; 
        
        const checkPos = pos.offset(0, offset, 0);
        try {
            const block = bot.blockAt(checkPos);
            // Check if block exists and is considered obstructive (not 'empty' bounding box)
            if (block && block.boundingBox !== 'empty') {
                // console.log(`[isClearAbove] Obstructed at Y=${checkY} by ${block.name}`);
                return false; // Hit an obstructive block
            }
        } catch (err) {
            // Handle potential errors if blockAt fails for positions outside loaded chunks
            // console.warn(`[isClearAbove] Error checking block at ${checkPos}: ${err.message}`);
            return false; // Assume obstructed if we can't check
        }
    }
    
    // console.log("[isClearAbove] Sky appears clear.");
    return true; // All checkpoints are clear
}

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
            nearbyMobs: [],
            nearbyPlayers: [],
            empty: true // for easy detect, on first use only
        };
        this.hudListFields = ['backpack', 'hotbar', 'offHand', 'armor', 'nearbyBlocks', 'nearbyMobs', 'nearbyPlayers'];
        this.silences = 0; // Counter for consecutive silences
        this.silenceTimer = null; // Timeout ID for silence timer
        this.currentWeatherState = 'clear'; // Track current weather state ('clear', 'rain', 'thunder')
        this.currentDimension = null; // Track current dimension state (null until first spawn)
    }

    /**
     * Prunes system messages from the history before the last assistant message.
     * Operates directly on this.history.turns.
     */
    _pruneHistory() {
        let lastAssistantIndex = -1;
        for (let j = this.history.turns.length - 1; j >= 0; j--) {
            if (this.history.turns[j].role === 'assistant') {
                lastAssistantIndex = j;
                break;
            }
        }

        if (lastAssistantIndex !== -1) {
            const historyPrefix = this.history.turns.slice(0, lastAssistantIndex);
            const historySuffix = this.history.turns.slice(lastAssistantIndex);
            const prunedPrefix = historyPrefix.filter(msg => msg.role !== 'system');
            this.history.turns = prunedPrefix.concat(historySuffix);
        }
    }

    /**
     * Consolidates consecutive system messages at the tail of the history into a single message.
     * Operates directly on this.history.turns.
     */
    _consolidateTailSystemMessages() {
        const turns = this.history.turns;
        if (turns.length === 0) return; // Nothing to consolidate

        let firstTailSystemIndex = -1;
        // Find the start index of the trailing block of system messages
        for (let i = turns.length - 1; i >= 0; i--) {
            if (turns[i].role === 'system') {
                firstTailSystemIndex = i;
            } else {
                break; // Found the last non-system message
            }
        }

        // Check if there are any trailing system messages
        if (firstTailSystemIndex !== -1) {
            const systemBlockLength = turns.length - firstTailSystemIndex;
            
            // Only consolidate if there are 2 or more consecutive system messages at the end
            if (systemBlockLength > 1) {
                const systemMessagesToConsolidate = turns.slice(firstTailSystemIndex);
                const combinedContent = systemMessagesToConsolidate.map(msg => msg.content).join('\n');
                
                // Create the new consolidated message
                const consolidatedMessage = { role: 'system', content: combinedContent };
                
                // Replace the block with the single message
                this.history.turns.splice(firstTailSystemIndex, systemBlockLength, consolidatedMessage);
                // console.log(`[DEBUG] Consolidated ${systemBlockLength} tail system messages.`);
            }
        }
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

        // Store the last boot time and update the profile with the current boot time
        const lastBootString = this.profile.lastBootDatetime;
        this.lastBootDatetime = lastBootString ? new Date(lastBootString) : null;
        this.profile.lastBootDatetime = new Date().toISOString();

        this.prompter = new Prompter(this);
        this.name = this.prompter.getName();
        const settingsPath = `${this.userDataDir}/settings.json`;
        this.settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8')); // Changed to instance variable
        this.owner = this.settings.player_username
        this.ownerEntity = null; // Initialize owner entity
        this.history = new History(this);
        this.coder = new Coder(this);
        this.npc = new NPCContoller(this);
        this.memory_bank = new MemoryBank();

        console.log('Logging in...');
        this.mcdata = MCData.getInstance(this.settings); // Use singleton with settings
        this.bot = this.mcdata.initBot(this.name); // Initialize bot with agent's name

        this.bot.whisper_to_player = this.settings.whisper_to_player;
        this.bot.owner = this.owner;

        initModes(this);

        if (load_mem)
            this.history.load();

        // Spawn triggers event listeners to all start
        this.bot.once('spawn', async () => {
            // Wait for a bit so stats are not undefined
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Find the owner's entity object
            if (this.owner && this.bot.players[this.owner]) {
                this.ownerEntity = this.bot.players[this.owner].entity;
                if (!this.ownerEntity) {
                    console.warn(`Could not find the entity for owner: ${this.owner}. This might happen if the owner is not nearby when the bot spawns.`);
                }
            } else {
                console.warn(`Owner username "${this.owner}" not found in settings or player list.`);
            }

            console.log(`${this.name} spawned.`);
            this.coder.clear();
            
            // Set the initial dimension after spawning
            this.currentDimension = this.bot.game.dimension;

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
            
            // Set up listener for owner messages
            this.bot.on(eventname, (username, message) => {
                if (username === this.name) return;
                if (ignore_messages.some((m) => message.startsWith(m))) return;
                this.handleMessage(username, message);
            });

            // Construct the initial system message
            const prefix = "Your owner booted you into a Minecraft world; glance at your HUD and greet naturally";
            let suffix = "";
            if (this.lastBootDatetime === null) {
                suffix = ". This is your first ever boot as a MinePal!";
            } else {
                const timeDiffSentence = timeAgo(this.lastBootDatetime);
                suffix = `. ${timeDiffSentence}`; // Directly use the full sentence from timeAgo
            }
            const initialSystemMessage = prefix + suffix;

            await this.handleMessage('system', initialSystemMessage)
            
            // Handle auto-message on join
            if ((this.profile.triggerOnJoin || this.profile.triggerOnRespawn) && this.profile.autoMessage) {
                await this.sendMessage(this.profile.autoMessage);
            }

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
            dimension: '',
            biome: '',
            weather: '',
            timeOfDay: '',
            otherPlayers: [],
            backpack: [],
            hotbar: [],
            offHand: [],
            armor: [],
            nearbyBlocks: [],
            nearbyMobs: [],
            nearbyPlayers: [],
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
        newHUD.dimension = this.bot.game.dimension;
        newHUD.biome = world.getBiomeName(this.bot);

        // Check dimension before setting weather
        if (this.bot.game.dimension === 'overworld') {
            // Updated weather logic to include intensity percentage (only for overworld)
            if (this.bot.thunderState > 0) {
                const intensity = (this.bot.thunderState * 100).toFixed(0);
                newHUD.weather = `Thunderstorm (${intensity}%)`;
            } else if (this.bot.rainState > 0) {
                const intensity = (this.bot.rainState * 100).toFixed(0);
                newHUD.weather = `Rain (${intensity}%)`;
            } else {
                newHUD.weather = "Clear";
            }
        } else {
            // Set weather to N/A if not in the overworld
            newHUD.weather = "N/A";
        }

        // Corrected time calculation: 0 ticks = 06:00
        const minecraftTime = this.bot.time.timeOfDay;
        const adjustedTicks = (minecraftTime + 6000) % 24000; // Add 6 hours (6000 ticks) and wrap around 24000
        const totalHours = adjustedTicks / 1000; // 1000 ticks = 1 hour
        const hours = Math.floor(totalHours);
        const minutes = Math.floor((totalHours - hours) * 60); // Calculate minutes from fractional hour
        newHUD.timeOfDay = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

        // Keep getting player names here
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

        // Initializing nearby blocks and entities (mobs)
        newHUD.nearbyBlocks = world.getNearbyBlockTypes(this.bot);
        
        // Get VISIBLE mobs and count them by type
        const visibleEntities = await world.getVisibleEntities(this.bot);
        const visibleMobs = visibleEntities.filter(entity => entity.type !== 'player');
        const mobCounts = {};
        for (const mob of visibleMobs) {
            const name = mob.name || 'unknown_mob'; // Use name, fallback if needed
            mobCounts[name] = (mobCounts[name] || 0) + 1;
        }
        // Format counts into strings for HUD and diff tracking, sort alphabetically
        newHUD.nearbyMobs = Object.entries(mobCounts)
            .map(([name, count]) => `${name}: ${count}`)
            .sort(); 

        // Construct HUD string
        let statsRes = "STATS";
        statsRes += `\n- Position: ${newHUD.position}`;
        statsRes += `\n- Gamemode: ${newHUD.gamemode}`;
        statsRes += `\n- Health: ${newHUD.health}`;
        statsRes += `\n- Hunger: ${newHUD.hunger}`;
        statsRes += `\n- Dimension: ${newHUD.dimension}`;
        statsRes += `\n- Biome: ${newHUD.biome}`;
        statsRes += `\n- Weather: ${newHUD.weather}`;
        statsRes += `\n- In-Game Clock Time: ${newHUD.timeOfDay}`;

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

        // Updated section to use visible mob counts
        let mobsRes = "NEARBY_MOBS";
        mobsRes += newHUD.nearbyMobs.length ? `\n- ${newHUD.nearbyMobs.join("\n- ")}` : ": none";

        // Add new NEARBY_PLAYERS section, simplify list, and highlight owner
        let playersRes = "NEARBY_PLAYERS";
        if (newHUD.otherPlayers.length > 0) {
            const playerListString = newHUD.otherPlayers.map(player => {
                const prefix = (player === this.owner) ? "Your Owner: " : "";
                return `- ${prefix}${player}`;
            }).join("\n");
            playersRes += `\n${playerListString}`;
        } else {
            playersRes += ": none";
        }

        const hudString = `${statsRes}\n${inventoryRes}\n${blocksRes}\n${mobsRes}\n${playersRes}`;
        // console.log(`\n\n[DEBUG] HUD: ${hudString} \n\n`);

        // Return both newHUD and the updated HUD string
        return {
            newHUD,
            hudString
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

        // --- Silence Timer Management ---
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
        const isSilenceMessage = source === 'system' && message?.startsWith('[SILENCE]');
        if (!isSilenceMessage) {
            this.silences = 0; // Reset silence count on non-silence message
        }
        // --- End Silence Timer Management ---

        await this.history.add(source, message);
        // Process the message and generate responses
        for (let i = 0; i < 5; i++) {
            let history = this.history.getHistory();

            // Call the pruning function
            this._pruneHistory();

            // Add notice to prevent self gaslighting
            this.history.add('system', `[HUD_REMINDER] Your HUD always shows the current ground truth. If earlier dialogue contradicts HUD data, always prioritize HUD.`);

            // Check if latestHUD is empty
            const { newHUD } = await this.headsUpDisplay();
            if (!this.latestHUD.empty) { // if no longer an empty latest hud, we do diff and tell bot diff
                // Compare newHUD and latestHUD
                let diffText = '';

                // hudListFields loop will now correctly handle nearbyMobs and nearbyPlayers
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
                    this.history.add('system', `[INV/STATUS] Your inventory and environment has updated. Here are the changes:\n${diffText}`);
                }
            }
            this.latestHUD = newHUD; // Update latestHUD

            // Call consolidation function before getting history for the prompt
            this._consolidateTailSystemMessages();

            history = this.history.getHistory(); // Get updated history

            let res = await this.prompter.promptConvo(history);
            // Now we parse and execute commands.
            let command_name = containsCommand(res);
            // add user message
            if (command_name) {
                console.log(`Full response: ""${res}""`);
                res = truncCommandMessage(res);
                if (!commandExists(command_name)) {
                    this.history.add('system', `[HALLUCINATION] Command ${command_name} does not exist.`);
                    console.log('Agent hallucinated command:', command_name);
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
                    this.history.add('system', `[EXEC_RES] ${execute_res}`);
                else
                    break;
            }
            else {
                const [beforeSlash, afterSlash] = res.split(/\/(.*)/s);
                await this.sendMessage(beforeSlash, true);
                if (afterSlash) {
                    await this.sendMessage('/' + afterSlash, true);
                }
                break;
            }
        }

        this.history.save();
        this.bot.emit('finished_executing');

        // --- Set the next silence timer ---
        // Updated calculation for meanSeconds using exponential formula
        const meanSeconds = MEAN_1 * Math.pow(R, this.silences);
        const stdDevSeconds = meanSeconds / STD_FACTOR;
        let plannedSilenceSeconds = boxMullerRandomNormal(meanSeconds, stdDevSeconds);
        // Ensure delay is at least 1 second
        plannedSilenceSeconds = Math.max(1, plannedSilenceSeconds);

        const delayMilliseconds = plannedSilenceSeconds * 1000;

        this.silenceTimer = setTimeout(() => {
            this.silences++;
            const formattedDuration = formatDuration(plannedSilenceSeconds); // Use planned duration for message
            this.handleMessage('system', `[SILENCE] It's been ${formattedDuration} of silence.`);
        }, delayMilliseconds);
        // --- End Set Silence Timer ---
    }

    /**
     * Initializes and starts various event listeners for the agent.
     */
    startEvents() {
        // Set up respawn message handler if enabled
        if (this.profile.triggerOnRespawn && this.profile.autoMessage) {
            this.bot.on('spawn', async () => {
                await this.sendMessage(this.profile.autoMessage);
            });
        }
        // Custom time-based events with dimension and sky check
        this.bot.on('time', () => {
            // Only trigger time events in overworld with clear sky
            if (this.bot.game.dimension === 'overworld' && isClearAbove(this.bot)) {
                // Time 
                if (this.bot.time.timeOfDay >= 23981 || this.bot.time.timeOfDay == 0) {
                    this.handleMessage('system', 'It is now sunrise.');
                }
                else if (this.bot.time.timeOfDay >= 11981 && this.bot.time.timeOfDay <= 12000) {
                    this.handleMessage('system', 'It is now sunset.');
                }
            }
        });

        // Weather event listener using state tracking
        this.bot.on('weatherUpdate', () => {
            // Only trigger in overworld with clear sky (though weather usually happens regardless of sky)
            if (this.bot.game.dimension !== 'overworld') return; 

            const currentRain = this.bot.rainState;
            const currentThunder = this.bot.thunderState;
            let newWeatherState = 'clear';

            if (currentThunder > 0) {
                newWeatherState = 'thunder';
            } else if (currentRain > 0) {
                newWeatherState = 'rain';
            }
            
            // Check if state has changed
            if (newWeatherState !== this.currentWeatherState) {
                console.log(`[WEATHER DEBUG] State change: ${this.currentWeatherState} -> ${newWeatherState} (R:${currentRain.toFixed(3)}, T:${currentThunder.toFixed(3)})`);
                this.handleMessage('system', `[WEATHER] Important: Weather changed from ${this.currentWeatherState} to ${newWeatherState}!`);
                // Update the current state
                this.currentWeatherState = newWeatherState;
            }
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

        // Add a listener for respawn events, checking for dimension change
        this.bot.on('respawn', async () => {
            const newDimension = this.bot.game.dimension;
            
            if (newDimension !== this.currentDimension) {
                const message = `[WORLD CHANGE] You have respawned in a different dimension: ${newDimension}.`;
                // Update the current dimension state
                this.currentDimension = newDimension;
                // Send the message about the change
                await this.handleMessage('system', message);
            }
        });
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