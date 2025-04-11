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
import { Vec3 } from 'vec3'; // Ensure Vec3 is imported if not already

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

// Helper function to format +/- values
const formatDiff = (diff) => {
    return diff > 0 ? `(+${diff})` : `(${diff})`;
};

// Helper to convert ticks to MM:SS or just S if short
const formatDurationDiff = (ticks) => { // Renamed for clarity
    if (ticks <= 0) return '';
    const totalSeconds = Math.max(0, Math.floor(ticks / 20));
     if (totalSeconds < 60) return `(${totalSeconds}s remaining)`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    // Added remaining for diff context
    return `(${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} remaining)`; 
};

/**
 * Represents an AI agent that can interact with a Minecraft world.
 */
export class Agent {
    constructor() {
        // Initialize the latest HUD as an empty map
        this.latestHUD = {
            inventory: new Map(),
            trackedBlocks: new Map(),
            aggregatedBlocks: new Map(), // Still useful for internal logic?
            mobs: new Map(),
            players: new Map(),
            health: 0,
            hunger: 0,
            effects: new Map(),
            // Keep other simple fields if needed for initial setup?
            position: '', gamemode: '', dimension: '', biome: '', weather: '', timeOfDay: '',
            empty: true // Critical flag for first run
        };
        this.hudListFields = []; // This is no longer used for diffing
        this.silences = 0; // Counter for consecutive silences
        this.silenceTimer = null; // Timeout ID for silence timer
        this.currentWeatherState = 'clear'; // Track current weather state ('clear', 'rain', 'thunder')
        this.currentDimension = null; // Track current dimension state (null until first spawn)
        this.ownerHurtCooldownActive = false; // Cooldown flag for owner hurt event
        this.botHurtCooldownActive = false; // Cooldown flag for bot hurt event
        this.reportedRareBlocks = new Set(); // Cache for reported rare block locations (stores "x,y,z")
    }

    /**
     * Private helper to identify the likely source of damage to the bot.
     * @param {MinecraftBot} bot - The bot instance.
     * @returns {string} A string describing the likely damage source.
     */
    _identifyDamageSource(bot) {
        if (!bot || !bot.entity) return "Unknown"; // Guard clause

        // Check environmental hazards first
        if (bot.entity.isInLava) return "Lava";
        // bot.oxygenLevel doesn't exist, check for bubbles property
        // if (bot.entity.isInWater && bot.oxygenLevel < 20) return "Drowning";
        // Alternative drowning check (might need refinement based on game version/specifics)
        if (bot.entity.isInWater && bot.health < 20) { // Crude check, assumes drowning if in water and health dropping
             // Check if last damage was recent to correlate
            if (Date.now() - bot.lastDamageTime < 1500) { // 1.5 seconds threshold
                return "Drowning";
            }
        }
        if (bot.entity.onFire) return "Fire";

        // Check nearby entities (within 5 blocks)
        const nearbyEntities = Object.values(bot.entities).filter(e =>
            e && e.position && bot.entity.position.distanceTo(e.position) < 5 && 
            e !== bot.entity && // Exclude self
            e.type !== 'object' && e.type !== 'orb' && e.type !== 'arrow' // Exclude non-damaging/projectile types
        );
        
        // Check nearby hostile entities
        const hostileMobs = nearbyEntities.filter(e => e.kind === 'Hostile mobs' && e.isValid);
        if (hostileMobs.length > 0) {
            // Prioritize the closest hostile mob
            hostileMobs.sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position));
            return `Hostile mob (${hostileMobs[0].name || 'Unknown'})`;
        }

        // Check nearby players (PvP)
        const nearbyPlayers = nearbyEntities.filter(e => e.type === 'player' && e.isValid);
        if (nearbyPlayers.length > 0) {
            nearbyPlayers.sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position));
            return `Player (${nearbyPlayers[0].username || 'Unknown'})`;
        }

        // If no specific source identified, check generic damage causes
        // Note: Cactus damage might be hard to distinguish without specific event data
        // Hunger damage usually happens slowly when food is 0
        if (bot.food === 0 && bot.health < 20 && Date.now() - bot.lastDamageTime < 1500) {
            return "Starvation";
        }
        // Add more checks if possible (e.g., poison, wither effects from status)

        return "Unknown"; // Default if source isn't clear
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
     * Generates a detailed heads-up display (HUD) string in Markdown format.
     * Also prepares a simpler newHUD object for diff tracking.
     * @returns {{hudString: string, diffText: string | null}} An object containing the newHUD for diffing and the formatted Markdown HUD string.
     */
    async headsUpDisplay() {
        if (!this.bot.entity) {
            return {
                hudString: "# 🎮 MINEPAL HUD\n\nWaiting for bot to spawn...",
                diffText: null // No diff on initial wait
            };
        }

        // --- Helper Functions ---
        const getFacingDirection = (yaw) => {
            const angle = yaw * (180 / Math.PI); // Convert radians to degrees
            const adjustedAngle = (angle % 360 + 360) % 360; // Normalize angle to 0-360
            if (adjustedAngle >= 315 || adjustedAngle < 45) return "South"; // +Z
            if (adjustedAngle >= 45 && adjustedAngle < 135) return "West";  // +X
            if (adjustedAngle >= 135 && adjustedAngle < 225) return "North"; // -Z
            if (adjustedAngle >= 225 && adjustedAngle < 315) return "East";  // -X
            return "Unknown";
        };

        const formatMinecraftTime = (ticks) => {
            const adjustedTicks = (ticks + 6000) % 24000; // 06:00 = 0 ticks
            const totalHours = adjustedTicks / 1000;
            const hours = Math.floor(totalHours);
            const minutes = Math.floor((totalHours - hours) * 60);
            const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

            let description = "Day";
            if (ticks >= 23000 || ticks < 500) description = "Sunrise"; // Approx range
            else if (ticks >= 11500 && ticks < 13000) description = "Sunset"; // Approx range
            else if (ticks >= 13000 && ticks < 23000) description = "Night";

            return `${timeStr} (${description})`;
        };

        const calculateDistance = (pos1, pos2) => {
             if (!pos1 || !pos2) return Infinity;
             return pos1.distanceTo(pos2);
        };

        // --- Data Fetching ---
        const botPos = this.bot.entity.position;
        const inventory = this.bot.inventory;
        const nearbyBlockObjects = world.getNearestBlocks(this.bot, null, 16);
        const visibleEntities = await world.getVisibleEntities(this.bot);
        const nearbyPlayers = await world.getNearbyPlayers(this.bot, 16);

        // --- Initialize STRUCTURED newHUD for diffing ---        
        let newHUD = {
            inventory: new Map(), // name -> count
            trackedBlocks: new Map(), // key (name@coords) -> full display string for easy check?
            mobs: new Map(), // name -> count
            players: new Map(), // name -> { distance }
            health: Math.round(this.bot.health),
            hunger: Math.round(this.bot.food),
            effects: new Map(), // name -> { amplifier, durationTicks }
            empty: false
        };

        // --- Build HUD String AND Populate Structured newHUD ---        
        let hud = ["# 🎮 MINEPAL HUD"];

        // == STATUS == (Populate newHUD.health/hunger/effects here)
        hud.push("\n## 📍 STATUS");
        const facing = getFacingDirection(this.bot.entity.yaw);
        const positionStr = `(${botPos.x.toFixed(2)}, ${botPos.y.toFixed(2)}, ${botPos.z.toFixed(2)})`;
        hud.push(`- **Position:** ${positionStr}, Facing: ${facing}`);
        const dimensionStr = this.bot.game.dimension;
        const biomeStr = world.getBiomeName(this.bot);
        hud.push(`- **Dimension:** ${dimensionStr.charAt(0).toUpperCase() + dimensionStr.slice(1)} | **Biome:** ${biomeStr}`);
        const timeStr = formatMinecraftTime(this.bot.time.timeOfDay);
        let weatherStr = "N/A";
        if (dimensionStr === 'overworld') {
             if (this.bot.thunderState > 0) weatherStr = `Thunderstorm (${(this.bot.thunderState * 100).toFixed(0)}%)`;
             else if (this.bot.rainState > 0) weatherStr = `Rain (${(this.bot.rainState * 100).toFixed(0)}%)`;
             else weatherStr = "Clear";
        }
        hud.push(`- **Time:** ${timeStr} | **Weather:** ${weatherStr}`);
        hud.push(`- **Health:** ❤️ ${newHUD.health}/20 | **Hunger:** 🍖 ${newHUD.hunger}/20`);

        // Status Effects - Populate newHUD.effects and build display string
        let effectsDisplayString = "None";
        const activeEffectsDisplay = [];
        if (this.bot.entity.effects) {
            for (const effectData of Object.values(this.bot.entity.effects)) {
                if (effectData && typeof effectData.id !== 'undefined') {
                    const effectInfo = this.mcdata.getEffectById(effectData.id);
                    if (effectInfo) {
                        const name = effectInfo.displayName || effectInfo.name;
                        const amplifier = effectData.amplifier;
                        const durationTicks = effectData.duration;
                        newHUD.effects.set(name, { amplifier, durationTicks }); // Populate structured HUD
                        
                        const amplifierLevel = amplifier > 0 ? ` ${amplifier + 1}` : '';
                        const durationStr = formatDurationDiff(durationTicks); // Use helper for display
                        activeEffectsDisplay.push(`${name}${amplifierLevel} ${durationStr}`.trim());
        } else {
                         console.warn(`[HUD Effects] Unknown effect ID: ${effectData.id}`);
                         // Optionally handle display of unknown effects
                    }
                }
            }
        }
        if (activeEffectsDisplay.length > 0) {
            effectsDisplayString = activeEffectsDisplay.join(', ');
        }
        hud.push(`- **Status Effects:** ${effectsDisplayString}`);


        // == EQUIPMENT == (Display only)
        hud.push("\n## 🛡️ EQUIPMENT");
        const armorSlots = { Head: 5, Torso: 6, Legs: 7, Feet: 8 };
        let armorStrings = [];
        for (const [name, slotIndex] of Object.entries(armorSlots)) {
             const item = inventory.slots[slotIndex];
             armorStrings.push(`${name}: ${item ? item.name : "empty"}`);
        }
        hud.push(`- **Armor:** ${armorStrings.join(' | ')}`);
        const offHandItem = this.bot.supportFeature("doesntHaveOffHandSlot") ? null : inventory.slots[45];
        hud.push(`- **Off-Hand:** ${offHandItem ? offHandItem.name : "empty"}`);



        // == INVENTORY == (Populate newHUD.inventory)
        hud.push("\n## 🎒 INVENTORY");
        const backpackSlots = { start: 9, end: 35 };
        const hotbarSlots = { start: 36, end: 44 };
        
        // Use newHUD.inventory directly for tallying
        newHUD.inventory.clear(); // Ensure it's empty before tallying

        // Tally backpack items into newHUD.inventory
        for (let i = backpackSlots.start; i <= backpackSlots.end; i++) {
            const item = inventory.slots[i];
            if (item) {
                newHUD.inventory.set(item.name, (newHUD.inventory.get(item.name) || 0) + item.count);
            }
        }
        // Tally hotbar items into newHUD.inventory and prepare display strings
        let hotbarDisplayStrings = [];
        for (let i = 0; i < 9; i++) {
            const slotIndex = hotbarSlots.start + i;
            const item = inventory.slots[slotIndex];
            let itemStr = "empty";
            if (item) {
                newHUD.inventory.set(item.name, (newHUD.inventory.get(item.name) || 0) + item.count);
                itemStr = `${item.name} ×${item.count}`;
            }
            hotbarDisplayStrings.push(`[${i + 1}] ${itemStr}`);
        }

        // Format Backpack for display (requires iterating again or using a temp map)
        let displayBackpackItems = {};
        let backpackItemCount = 0;
        for (let i = backpackSlots.start; i <= backpackSlots.end; i++) { 
            const item = inventory.slots[i];
            if (item) {
                displayBackpackItems[item.name] = (displayBackpackItems[item.name] || 0) + item.count;
                backpackItemCount += item.count;
            }
        }
        hud.push(`**Backpack:** (${Object.keys(displayBackpackItems).length} unique stacks, ${backpackItemCount} total items)`);
        Object.keys(displayBackpackItems).sort().forEach(name => hud.push(`- ${name} ×${displayBackpackItems[name]}`));

        // Main Hand (display as before)
        const mainHandSlotIndex = this.bot.quickBarSlot;
        const mainHandInvSlot = hotbarSlots.start + mainHandSlotIndex;
        const mainHandItem = inventory.slots[mainHandInvSlot];
        hud.push(`**Main Hand:** Slot [${mainHandSlotIndex + 1}] ${mainHandItem ? `${mainHandItem.name} ×${mainHandItem.count}` : 'empty'}`);

        // Hotbar (display as before)
        hud.push(`**Hotbar:** (9 slots)`);
        hud.push(hotbarDisplayStrings.join(' | '));


        // == NEARBY BLOCKS == (Populate newHUD.trackedBlocks)
        hud.push("\n## 🌳 NEARBY BLOCKS");
        const uniquelyTrackedBlockTypes = ["sign", "chest", "barrel", "shulker_box", "lectern", "furnace", "jukebox"];
        let signBlocksDisplay = [];
        let containerBlocksDisplay = [];
        let otherTrackedBlocksDisplay = [];
        let aggregatedBlocksDisplay = {}; // For display only

        newHUD.trackedBlocks.clear(); // Ensure empty

        nearbyBlockObjects.forEach(block => {
            const dist = parseFloat(calculateDistance(botPos, block.position).toFixed(0));
            // Store raw coords for comparison
            const x = Math.round(block.position.x);
            const y = Math.round(block.position.y);
            const z = Math.round(block.position.z);
            const posCoordsDisplay = `(${x},${y},${z})`; // For display key/string
            const posStr = `@${posCoordsDisplay}`; // Includes @ for display string
            const blockKey = `${block.name}${posStr}`; // Unique key for map
            let isSign = false;
            let isContainer = false;
            let textFront = null;
            let textBack = null;
            let isUniquelyTracked = false;

            if (block.name.includes('sign')) {
                isUniquelyTracked = true;
                isSign = true;
                try {
                    const signTexts = block.getSignText();
                    if (signTexts && Array.isArray(signTexts)) {
                        textFront = signTexts[0]?.trim() || null;
                        textBack = signTexts[1]?.trim() || null;
                    }
                } catch (err) { /* Ignore */ }
                let textSuffix = '';
                if (textFront) textSuffix += ` | Front: "${textFront}"`;
                if (textBack) textSuffix += ` | Back: "${textBack}"`;
                const displayString = `[${block.name}${posStr}]${textSuffix}, Distance: ${dist}`;
                // Store numeric coords in value
                newHUD.trackedBlocks.set(blockKey, { name: block.name, x, y, z, isSign, isContainer, textFront, textBack });
                signBlocksDisplay.push(`- ${displayString}`); // Add full string for direct display
            } else if (uniquelyTrackedBlockTypes.some(sub => block.name.includes(sub))) {
                isUniquelyTracked = true;
                 isContainer = block.name.includes('chest') || block.name.includes('barrel') || block.name.includes('shulker_box');
                 const displayString = `[${block.name}${posStr}], Distance: ${dist}`;
                 // Store numeric coords in value
                 newHUD.trackedBlocks.set(blockKey, { name: block.name, x, y, z, isSign, isContainer, textFront, textBack });
                 if (isContainer) {
                     containerBlocksDisplay.push(`- ${displayString}`); // Add initial string
                 } else {
                     otherTrackedBlocksDisplay.push(`- ${displayString}`);
                 }
            }

            if (!isUniquelyTracked) {
                if (!aggregatedBlocksDisplay[block.name]) aggregatedBlocksDisplay[block.name] = { count: 0, minDist: Infinity };
                aggregatedBlocksDisplay[block.name].count++;
                aggregatedBlocksDisplay[block.name].minDist = Math.min(aggregatedBlocksDisplay[block.name].minDist, dist);
            }
        });

        // Post-process container display strings to add labels
        containerBlocksDisplay = containerBlocksDisplay.map(containerString => {
            const match = containerString.match(/-\s*\[(.*?)@\((.*?),(.*?),(.*?)\)\]/); // Match name and coords
            if (!match) return containerString;

            const [, containerName, xStr, yStr, zStr] = match;
            const containerX = parseInt(xStr);
            const containerY = parseInt(yStr);
            const containerZ = parseInt(zStr);

            let labels = [];
            // Iterate through the collected sign data in newHUD.trackedBlocks
            for (const blockData of newHUD.trackedBlocks.values()) {
                // Check if it's a sign adjacent on X axis at same Y/Z
                if (blockData.isSign &&
                    blockData.y === containerY &&
                    blockData.z === containerZ &&
                    (blockData.x === containerX + 1 || blockData.x === containerX - 1))
                {
                    if (blockData.textFront) labels.push(`"${blockData.textFront}"`);
                    if (blockData.textBack) labels.push(`"${blockData.textBack}"`);
                }
            }
            let labelString = "";
            const distancePartIndex = containerString.lastIndexOf(', Distance:');
            if (labels.length > 0) {
                labelString = ` | Name: ${labels.join(' ')}`;
            } else {
                labelString = " | Unnamed";
            }
            if (distancePartIndex !== -1) {
                // Insert label before distance
                return containerString.substring(0, distancePartIndex) + labelString + containerString.substring(distancePartIndex);
            } else {
                return containerString + labelString; // Fallback append
            }
        });

        // Format block display sections (using potentially modified containerBlocksDisplay)
        if (signBlocksDisplay.length > 0) { hud.push("- Signs:"); signBlocksDisplay.sort().forEach(s => hud.push(`  ${s}`)); }
        if (containerBlocksDisplay.length > 0) { hud.push("- Containers:"); containerBlocksDisplay.sort().forEach(c => hud.push(`  ${c}`)); }
        if (otherTrackedBlocksDisplay.length > 0) { hud.push("- Other Tracked:"); otherTrackedBlocksDisplay.sort().forEach(o => hud.push(`  ${o}`)); }
        const sortedOtherNamesDisplay = Object.keys(aggregatedBlocksDisplay).sort(); // Renamed for clarity
        if (sortedOtherNamesDisplay.length > 0) {
            hud.push("- Others:");
            sortedOtherNamesDisplay.forEach(name => {
                const data = aggregatedBlocksDisplay[name];
                hud.push(`  - ${name} ×${data.count}, Nearest Distance: ${data.minDist === Infinity ? 'N/A' : data.minDist}`);
            });
        }
        // Check if any blocks were detected at all
        if (!signBlocksDisplay.length && !containerBlocksDisplay.length && !otherTrackedBlocksDisplay.length && !sortedOtherNamesDisplay.length) {
            hud.push("- none detected");
        }


        // == NEARBY MOBS == (Populate newHUD.mobs)
        hud.push("\n## 🐾 NEARBY MOBS");
        let passiveMobsDisplayMap = {}; // Temp map for display aggregation
        let hostileMobsDisplayMap = {};
        newHUD.mobs.clear(); // Ensure empty

        visibleEntities.filter(e => e.type !== 'player').forEach(entity => {
            const name = entity.name || 'unknown_entity';
            const dist = parseFloat(calculateDistance(botPos, entity.position).toFixed(0));
            const isHostile = this.mcdata.isHostile(entity);
            
            // Populate structured newHUD
            newHUD.mobs.set(name, (newHUD.mobs.get(name) || 0) + 1);

            // Aggregate for display string
            const displayMap = isHostile ? hostileMobsDisplayMap : passiveMobsDisplayMap;
            if (!displayMap[name]) {
                displayMap[name] = { count: 0, minDist: Infinity };
            }
            displayMap[name].count++;
            displayMap[name].minDist = Math.min(displayMap[name].minDist, dist);
        });

        // Format Passive Mobs Display
        const sortedPassiveNames = Object.keys(passiveMobsDisplayMap).sort();
        if (sortedPassiveNames.length > 0) {
            hud.push("- Passive:");
            sortedPassiveNames.forEach(name => {
                const data = passiveMobsDisplayMap[name];
                hud.push(`  - ${name} ×${data.count}, Nearest Distance: ${data.minDist === Infinity ? 'N/A' : data.minDist}`);
            });
        } else {
            hud.push("- Passive: none detected");
        }
        // Format Hostile Mobs Display
        const sortedHostileNames = Object.keys(hostileMobsDisplayMap).sort();
        if (sortedHostileNames.length > 0) {
            hud.push("- Hostile:");
            sortedHostileNames.forEach(name => {
                const data = hostileMobsDisplayMap[name];
                hud.push(`  - ${name} ×${data.count}, Nearest Distance: ${data.minDist === Infinity ? 'N/A' : data.minDist}`);
            });
        } else {
            hud.push("- Hostile: none detected");
        }


        // == NEARBY PLAYERS == (Populate newHUD.players)
        hud.push("\n## 👥 NEARBY PLAYERS");
        newHUD.players.clear(); // Ensure empty
        if (nearbyPlayers.length > 0) {
            nearbyPlayers.forEach(player => {
                const dist = calculateDistance(botPos, player.position);
                const name = player.username;
                newHUD.players.set(name, { distance: dist }); // Populate structured HUD
                const prefix = (name === this.owner) ? "**Your Owner:** " : "";
                hud.push(`- ${prefix}${name}, Distance: ${dist.toFixed(0)}`);
            });
        } else {
            hud.push("- none detected");
        }


        // --- Calculate DETAILED Diff Text ---        
        let diffText = null;
        let diffSections = []; // Store sections like ["📦 Inventory Changes:", "- item x 1"]

        if (!this.latestHUD.empty) { // Only calculate diff if not the first run
            
            // Inventory Changes
            let inventoryChanges = [];
            const oldInv = this.latestHUD.inventory;
            const newInv = newHUD.inventory;
            const allItems = new Set([...oldInv.keys(), ...newInv.keys()]);
            allItems.forEach(item => {
                const oldCount = oldInv.get(item) || 0;
                const newCount = newInv.get(item) || 0;
                const diff = newCount - oldCount;
                if (diff !== 0) {
                    if (oldCount === 0) inventoryChanges.push(`+ ${item} ×${newCount} *(new)*`);
                    else if (newCount === 0) inventoryChanges.push(`- ${item} ×${oldCount} *(removed)*`);
                    else inventoryChanges.push(`- ${item} ×${oldCount} ➜ ×${newCount} *${formatDiff(diff)}*`);
                }
            });
            if (inventoryChanges.length > 0) {
                diffSections.push("📦 **Inventory Changes:**");
                diffSections.push(...inventoryChanges.sort());
            }

            // Environment (Tracked Blocks) Changes
            let envChanges = [];
            const oldBlocks = this.latestHUD.trackedBlocks;
            const newBlocks = newHUD.trackedBlocks;
            const allBlockKeys = new Set([...oldBlocks.keys(), ...newBlocks.keys()]);
            allBlockKeys.forEach(key => {
                const oldBlockData = oldBlocks.get(key);
                const newBlockData = newBlocks.get(key);
                if (oldBlockData && !newBlockData) { // Removed
                    envChanges.push(`- [${oldBlockData.name}${oldBlockData.coords}] *(removed)*`);
                } else if (!oldBlockData && newBlockData) { // Added
                    const textPart = newBlockData.text ? ` *(${newBlockData.text.substring(3)})*` : ""; // Remove leading ' | ' 
                    envChanges.push(`+ [${newBlockData.name}${newBlockData.coords}]${textPart} *(new)*`);
                }
            });
            if (envChanges.length > 0) {
                diffSections.push("\n🌳 **Environment Changes:**");
                diffSections.push(...envChanges.sort());
            }

            // Mob Changes
            let mobChanges = [];
            const oldMobs = this.latestHUD.mobs;
            const newMobs = newHUD.mobs;
            const allMobs = new Set([...oldMobs.keys(), ...newMobs.keys()]);
            allMobs.forEach(mob => {
                const oldCount = oldMobs.get(mob) || 0;
                const newCount = newMobs.get(mob) || 0;
                const diff = newCount - oldCount;
                if (diff !== 0) {
                    mobChanges.push(`- ${mob} ×${oldCount} ➜ ×${newCount} *${formatDiff(diff)}*`);
                }
            });
            if (mobChanges.length > 0) {
                diffSections.push("\n🐾 **Mob Changes:**");
                diffSections.push(...mobChanges.sort());
            }

            // Player Changes
            let playerChanges = [];
            const oldPlayers = this.latestHUD.players;
            const newPlayers = newHUD.players;
            const allPlayers = new Set([...oldPlayers.keys(), ...newPlayers.keys()]);
            allPlayers.forEach(player => {
                const oldPlayerData = oldPlayers.get(player);
                const newPlayerData = newPlayers.get(player);
                if (!oldPlayerData && newPlayerData) playerChanges.push(`+ Player joined: ${player} (Distance: ${newPlayerData.distance.toFixed(0)})`);
                else if (oldPlayerData && !newPlayerData) playerChanges.push(`- Player left: ${player}`);
            });
            if (playerChanges.length > 0) {
                diffSections.push("\n👥 **Player Changes:**");
                diffSections.push(...playerChanges.sort());
            }

            // Status Updates (Health, Hunger, Effects)
            let statusUpdates = [];
            const healthDiff = newHUD.health - this.latestHUD.health;
            const hungerDiff = newHUD.hunger - this.latestHUD.hunger;
            if (healthDiff !== 0) statusUpdates.push(`- Health: ❤️ ${this.latestHUD.health} ➜ ❤️ ${newHUD.health} *${formatDiff(healthDiff)}*`);
            if (hungerDiff !== 0) statusUpdates.push(`- Hunger: 🍖 ${this.latestHUD.hunger} ➜ 🍖 ${newHUD.hunger} *${formatDiff(hungerDiff)}*`);
            
            const oldEffects = this.latestHUD.effects;
            const newEffects = newHUD.effects;
            const allEffectNames = new Set([...oldEffects.keys(), ...newEffects.keys()]);
            allEffectNames.forEach(name => {
                const oldEffectData = oldEffects.get(name);
                const newEffectData = newEffects.get(name);
                if (!oldEffectData && newEffectData) { // New effect
                    const amplifierLevel = newEffectData.amplifier > 0 ? ` ${newEffectData.amplifier + 1}` : '';
                    const durationStr = formatDurationDiff(newEffectData.durationTicks); // Use renamed helper
                    statusUpdates.push(`- Status Effect: ${name}${amplifierLevel} *(new, ${durationStr.slice(1, -1)})*`); // Adjusted format
                } else if (oldEffectData && !newEffectData) { // Removed effect
                    const amplifierLevel = oldEffectData.amplifier > 0 ? ` ${oldEffectData.amplifier + 1}` : '';
                    statusUpdates.push(`- Status Effect: ${name}${amplifierLevel} *(removed)*`);
                }
                // Duration / amplifier change diffing can be added here if needed
            });
            if (statusUpdates.length > 0) {
                diffSections.push("\n✨ **Status Updates:**");
                diffSections.push(...statusUpdates.sort()); 
            }

            // Combine sections if any changes occurred
            if (diffSections.length > 0) {
                diffText = diffSections.join('\n');
            }
        }

        // --- Update latestHUD (with structured data) --- 
        this.latestHUD = newHUD;

        // --- Final Assembly ---
        const finalHudString = hud.join('\n');
        console.log(`\n\n[HUD DEBUG] HUD:\n${finalHudString}\n\n`); // Log full HUD
        // if (diffText) {
        //      console.log(`\n\n[DEBUG] HUD Diff:\n${diffText}\n\n`); // Log detailed diff
        // }

        // Return the formatted string and the calculated detailed diff text
        return {
            hudString: finalHudString,
            diffText: diffText 
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
        let continue_autonomously_count = 0;

        await this.history.add(source, message);
        // Process the message and generate responses
        while (continue_autonomously_count < 10) {
            let history = this.history.getHistory();

            // Call the pruning function
            this._pruneHistory();

            // Add notice to prevent self gaslighting
            this.history.add('system', `[HUD_REMINDER] Your HUD always shows the current ground truth. If earlier dialogue contradicts HUD data, always prioritize HUD.`);

            // Check if latestHUD is empty
            const { diffText } = await this.headsUpDisplay();
            if (diffText) {
                this.history.add('system', `[INV/STATUS] Your inventory and environment has updated. Here are the changes:\n${diffText}`);
            }

            // Call consolidation function before getting history for the prompt
            this._consolidateTailSystemMessages();

            history = this.history.getHistory(); // Get updated history

            // Get structured response from prompter
            const { chatMessage, command, error, continue_autonomously } = await this.prompter.promptConvo(history);

            // Handle errors first
            if (error) {
                console.error("Error from promptConvo:", error);
                // Decide how to handle the error, e.g., send a message to the user or retry
                await this.sendMessage(`${error}`, true);
                break; // Exit the loop on error
            }

            // add user message
            if (command) {                
                // Send chat message first, if any
                if (chatMessage && chatMessage.trim() !== '') {
                     await this.sendMessage(chatMessage, true);
                }
                
                // Check if it's a slash command (in-game command)
                if (command.startsWith('/')) {
                    console.log(`Sending slash command: "${command}"`);
                    await this.sendMessage(command, true); // Send directly to chat
                    break; // Treat as finished, don't try to execute internally
                }

                // --- It's an internal command (!) ---
                const command_name = containsCommand(command); // Use containsCommand to extract !action_name
                if (!command_name) { // Should ideally not happen if command starts with ! but good sanity check
                    console.error(`[ERROR] Command string "${command}" did not yield a valid command name.`);
                    this.history.add('system', `[ERROR] Invalid function call: ${command}`);
                    continue; // Try again
                }

                if (!commandExists(command_name)) { // Check if internal command exists
                    this.history.add('system', `[HALLUCINATION] Command ${command_name} does not exist.`);
                    console.log('Agent hallucinated command:', command_name);
                    continue; // Try generating again
                }
                
                let execute_res = await executeCommand(this, command);
                console.log('Agent executed:', command_name, 'and got:', execute_res);

                if (execute_res) {
                    this.history.add('system', `[EXEC_RES] ${execute_res}`);
                    continue; // A successful execution auto-reprompts the LLM.
                } else {

                    // If the LLM says to continue autonomously, increment the counter.
                    // Otherwise, break the loop.
                    if (continue_autonomously) {
                        continue_autonomously_count++;
                    } else {
                        break;
                    }
                }
            } else {
                // No command, just send the chat message if it exists
                if (chatMessage && chatMessage.trim() !== '') {
                    await this.sendMessage(chatMessage, true);
                } else {
                    // Handle case where LLM returns no chat and no command (maybe silence or just thinking)
                    console.log("[DEBUG] LLM returned no chat message and no command.");
                }

                // If the LLM says to continue autonomously, increment the counter.
                // Otherwise, break the loop.   
                if (continue_autonomously) {
                    continue_autonomously_count++;
                } else {
                    break;
                }
            }
        }
        if (continue_autonomously_count >= 10) {
            this.history.add('system', `[NOTICE] Continue autonomously usage is limited to 10 times. Stopping execution.`);
            await this.sendMessage(`/tell ${this.owner} [NOTICE] Autonomous execution is limited to 10 steps. Stopping execution.`, true);
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
        const INTERVAL = 500;
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

        // Owner-specific entity event listeners
        this.bot.on('entityDead', async (entity) => {
            if (entity.type === 'player' && entity.username === this.owner) {
                const message = `[OWNER DIED] (${this.owner}) has just died!!`;
                await this.handleMessage('system', message);
            }
        });

        this.bot.on('entityHurt', async (entity) => {
            // First, check if the hurt entity is a player
            if (entity.type === 'player') {
                // Now check if it's the owner
                if (entity.username === this.owner) {
                    // Check if owner hurt cooldown is active
                    if (!this.ownerHurtCooldownActive) {
                        // Activate cooldown
                        this.ownerHurtCooldownActive = true;
                        
                        const message = `[OWNER HURT] (${this.owner}) was just hurt!`;
                        await this.handleMessage('system', message);

                        // Set timeout to deactivate cooldown (using user's 5s)
                        setTimeout(() => {
                            this.ownerHurtCooldownActive = false;
                        }, 5000); 
                    }
                } 
                // Else, check if it's the bot itself
                else if (entity.username === this.bot.username) { 
                    // Check if bot hurt cooldown is active
                    if (!this.botHurtCooldownActive) {
                        // Activate cooldown
                        this.botHurtCooldownActive = true;

                        const botHealth = Math.round(this.bot.health);
                        const damageTaken = Math.round(this.bot.lastDamageTaken);
                        // Identify damage source
                        const damageSource = this._identifyDamageSource(this.bot);
                        
                        const message = `[SELF HURT] You were just hurt by ${damageSource}! (Damage: ${damageTaken}, Health: ${botHealth}/20)`;
                        await this.handleMessage('system', message);

                        // Set timeout to deactivate cooldown (using user's 5s)
                        setTimeout(() => {
                            this.botHurtCooldownActive = false;
                        }, 5000); 
                    }
                }
            }
        });

        this.bot.on('entitySleep', async (entity) => {
            if (entity.type === 'player' && entity.username === this.owner) {
                const message = `[OWNER SLEEP] (${this.owner}) is sleeping. You should sleep too.`;
                await this.handleMessage('system', message);
            }
        });

        // Listener for newly discovered rare blocks
        this.bot.on('rare_finds', async (blockList) => {
            if (!blockList || blockList.length === 0) return;

            // Aggregate counts by block name
            const counts = {};
            blockList.forEach(block => {
                counts[block.name] = (counts[block.name] || 0) + 1;
            });

            // Format the message
            const summary = Object.entries(counts)
                .map(([name, count]) => `${count} ${name}`)
                .join(', ');
            
            const message = `[RARE FINDS] You spotted nearby: ${summary}.`;
            await this.handleMessage('system', message);
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