import * as skills from './library/skills.js';
import * as world from './library/world.js';
import pf from "mineflayer-pathfinder";
import MCData from '../utils/mcdata.js';

// a mode is a function that is called every tick to respond immediately to the world
// it has the following fields:
// on: whether 'update' is called every tick
// active: whether an action has been triggered by the mode and hasn't yet finished
// paused: whether the mode is paused by another action that overrides the behavior (eg followplayer implements its own self defense)
// update: the function that is called every tick (if on is true)
// while update functions are async, they should *not* be awaited longer than ~100ms as it will block the update loop
// to perform longer actions, use the execute function which won't block the update loop
const modes = [
    {
        name: 'self_preservation',
        description: 'Respond to drowning, burning, and damage at low health. Interrupts other actions.',
        interrupts: ['all'],
        on: true,
        active: false,
        fall_blocks: ['sand', 'gravel', 'concrete_powder'], // includes matching substrings like 'sandstone' and 'red_sand'
        /**
         * Update function for self-preservation mode.
         * Checks the agent's environment for dangerous conditions like water, lava, fire, or falling blocks.
         * Responds by jumping, moving away, or seeking water if on fire.
         * @param {Object} agent - The agent object containing the bot.
         */
        update: async function (agent) {
            const dangerousBlocks = ['lava', 'flowing_lava', 'fire', 'magma_block', 'cactus', 'campfire', 'soul_fire', 'sweet_berry_bush', 'wither_rose'];
            const bot = agent.bot;
            let block = bot.blockAt(bot.entity.position);
            let blockAbove = bot.blockAt(bot.entity.position.offset(0, 1, 0));
            if (!block) block = {name: 'air'}; // hacky fix when blocks are not loaded
            if (!blockAbove) blockAbove = {name: 'air'};
            if (blockAbove.name === 'water' || blockAbove.name === 'flowing_water') {
                // does not call execute so does not interrupt other actions
                if (!bot.pathfinder.goal) {
                    bot.setControlState('jump', true);
                }
            }
            else if (this.fall_blocks.some(name => blockAbove.name.includes(name))) {
                execute(this, agent, async () => {
                    await skills.moveAway(bot, 2);
                });
            }
            else if (dangerousBlocks.includes(block.name) || dangerousBlocks.includes(blockAbove.name)) {
                await agent.sendMessage('I\'m on fire!');
                execute(this, agent, async () => {
                    let nearestWater = world.getNearestBlock(bot, 'water', 20);
                    if (nearestWater) {
                        const pos = nearestWater.position;
                        await skills.goToPosition(bot, pos.x, pos.y, pos.z, 0.2);
                        await agent.sendMessage('Ahhhh that\'s better!');
                    }
                    else {
                        await skills.moveAway(bot, 5);
                    }
                });
            }
            else if (agent.isIdle()) {
                bot.clearControlStates(); // clear jump if not in danger or doing anything else
            }
        }
    },
    {
        name: 'cowardice',
        description: 'Run away from enemies. Interrupts other actions.',
        interrupts: ['all'],
        on: false,
        active: false,
        /**
         * Update function for cowardice mode.
         * Detects nearby hostile entities and makes the agent run away from them.
         * @param {Object} agent - The agent object containing the bot.
         */
        update: async function (agent) {
            // Find nearest visible hostile entity within 16 blocks
            const visibleEntities = await world.getVisibleEntities(agent.bot);
            const hostileMobsInRange = visibleEntities.filter(entity => 
                MCData.getInstance().isHostile(entity) &&
                agent.bot.entity.position.distanceTo(entity.position) <= 16
            );
            hostileMobsInRange.sort((a, b) => agent.bot.entity.position.distanceTo(a.position) - agent.bot.entity.position.distanceTo(b.position));
            const enemy = hostileMobsInRange.length > 0 ? hostileMobsInRange[0] : null;

            if (enemy && await world.isClearPath(agent.bot, enemy)) {
                await agent.sendMessage(`Aaa! A ${enemy.name.replace(/_/g, ' ').toLowerCase()}!`);

                execute(this, agent, async () => {
                    await skills.avoidEnemies(agent.bot, 24);
                });
            }
        }
    },
    {
        name: 'self_defense',
        description: 'Attack nearby enemies. Interrupts other actions.',
        interrupts: ['all'],
        on: true,
        active: false,
        lastMessageTime: 0, // Track the last message time
        messageCooldown: 5000, // 5 seconds cooldown between messages
        currentEnemyName: null, // Track the name of the current enemy being fought
        /**
         * Update function for self-defense mode.
         * Detects nearby hostile entities and makes the agent attack them.
         * @param {Object} agent - The agent object containing the bot.
         */
        update: async function (agent) {
            // Find nearest visible hostile entity within 4 blocks
            const visibleEntities = await world.getVisibleEntities(agent.bot);
            const hostileMobsInRange = visibleEntities.filter(entity => 
                MCData.getInstance().isHostile(entity) &&
                agent.bot.entity.position.distanceTo(entity.position) <= 4
            );
            hostileMobsInRange.sort((a, b) => agent.bot.entity.position.distanceTo(a.position) - agent.bot.entity.position.distanceTo(b.position));
            let enemy = hostileMobsInRange.length > 0 ? hostileMobsInRange[0] : null;

            if (enemy && enemy.name.toLowerCase().trim() === "item") return;

            if (enemy && await world.isClearPath(agent.bot, enemy)) {
                const now = Date.now();
                if (enemy.name !== this.currentEnemyName || now - this.lastMessageTime > this.messageCooldown) {
                    await agent.sendMessage(`Fighting ${enemy.name.replace(/_/g, ' ').toLowerCase()}!`);
                    this.lastMessageTime = now;
                    this.currentEnemyName = enemy.name;
                }
                execute(this, agent, async () => {
                    await skills.defendSelf(agent.bot, 8);
                });
            } else {
                this.currentEnemyName = null; // Reset if no enemy is found
            }
        }
    },
    {
        name: 'hunting',
        description: 'Hunt nearby animals when idle.',
        interrupts: ['defaults'],
        on: true,
        active: false,
        /**
         * Update function for hunting mode.
         * Detects nearby huntable entities and makes the agent attack them.
         * @param {Object} agent - The agent object containing the bot.
         */
        update: async function (agent) {
            // Find nearest visible huntable entity within 8 blocks
            const visibleEntities = await world.getVisibleEntities(agent.bot);
            const huntableMobsInRange = visibleEntities.filter(entity => 
                MCData.getInstance().isHuntable(entity) &&
                agent.bot.entity.position.distanceTo(entity.position) <= 8
            );
            huntableMobsInRange.sort((a, b) => agent.bot.entity.position.distanceTo(a.position) - agent.bot.entity.position.distanceTo(b.position));
            const huntable = huntableMobsInRange.length > 0 ? huntableMobsInRange[0] : null;

            if (huntable && await world.isClearPath(agent.bot, huntable)) {
                execute(this, agent, async () => {
                    await agent.sendMessage(`Hunting ${huntable.name}!`);
                    await skills.attackEntity(agent.bot, huntable);
                });
            }
        }
    },
    {
        name: 'item_collecting',
        description: 'Collect nearby items when idle.',
        interrupts: [],
        on: true,
        active: false,

        wait: 2, // number of seconds to wait after noticing an item to pick it up
        prev_item: null,
        noticed_at: -1,
        /**
         * Update function for item collecting mode.
         * Detects nearby items and makes the agent pick them up after a short delay.
         * @param {Object} agent - The agent object containing the bot.
         */
        update: async function (agent) {
            // Find nearest visible item entity within 8 blocks
            const visibleEntities = await world.getVisibleEntities(agent.bot);
            const itemsInRange = visibleEntities.filter(entity => 
                entity.name === 'item' &&
                agent.bot.entity.position.distanceTo(entity.position) <= 8
            );
            itemsInRange.sort((a, b) => agent.bot.entity.position.distanceTo(a.position) - agent.bot.entity.position.distanceTo(b.position));
            let item = itemsInRange.length > 0 ? itemsInRange[0] : null;

            if (item && item !== this.prev_item && await world.isClearPath(agent.bot, item)) {
                if (this.noticed_at === -1) {
                    this.noticed_at = Date.now();
                }
                if (Date.now() - this.noticed_at > this.wait * 1000) {
                    const metadataIndex = agent.bot.minecraft_version && agent.bot.minecraft_version <= '1.16.5' ? 7 : 8;
                    const itemName = agent.mcdata.getItemName(item.metadata[metadataIndex]?.itemId) || 'unknown';
                    const itemCount = item.metadata[metadataIndex]?.itemCount || 1;
                    const formattedItemName = itemName.replace(/_/g, ' ');
                    await agent.sendMessage(`Picking up ${itemCount} ${formattedItemName}!`);
                    this.prev_item = item;
                    execute(this, agent, async () => {
                        await skills.pickupNearbyItems(agent.bot);
                    });
                    this.noticed_at = -1;
                }
            }
            else {
                this.noticed_at = -1;
            }
        }
    },
    {
        name: 'torch_placing',
        description: 'Place torches when idle and there are no torches nearby.',
        interrupts: ['followPlayer'],
        on: true,
        active: false,
        cooldown: 5,
        last_place: Date.now(),
        /**
         * Update function for torch placing mode.
         * Places torches in dark areas when the agent is idle and there are no torches nearby.
         * @param {Object} agent - The agent object containing the bot.
         */
        update: function (agent) {
            if (world.shouldPlaceTorch(agent.bot)) {
                if (Date.now() - this.last_place < this.cooldown * 1000) return;
                execute(this, agent, async () => {
                    const pos = agent.bot.entity.position;
                    await skills.placeBlock(agent.bot, 'torch', pos.x, pos.y, pos.z, 'bottom', true);
                });
                this.last_place = Date.now();
            }
        }
    },
    {
        name: 'idle_staring',
        description: 'Animation to look around at entities when idle.',
        interrupts: [],
        on: true,
        active: false,

        staring: false,
        last_entity: null,
        next_change: 0,
        /**
         * Update function for idle staring mode.
         * Makes the agent look around at nearby entities when idle.
         * @param {Object} agent - The agent object containing the bot.
         */
        update: function (agent) {
            const bot = agent.bot;
            const ownerName = agent.owner; // Get owner name

            // Find nearest suitable entity (player or mob, excluding endermen/items/objects)
            const nearestEntity = bot.nearestEntity((e) =>
                e.type !== 'object' && e.type !== 'orb' && e.name !== 'enderman' && e.name !== 'item'
            );

            let targetEntity = null;
            let isOwnerNearby = false;
            let isEntityNearby = false;

            if (nearestEntity && nearestEntity.position.distanceTo(bot.entity.position) < 10) {
                isEntityNearby = true;
                targetEntity = nearestEntity;
                if (targetEntity.type === 'player' && targetEntity.username === ownerName) {
                    isOwnerNearby = true;
                }
            }

            // Define durations based on who is nearby
            let stareDuration, lookAwayDuration, lookAwayProbability;
            if (isOwnerNearby) {
                stareDuration = 15000 + Math.random() * 15000; // 15-30 seconds
                lookAwayDuration = 500 + Math.random() * 1000; // 0.5-1.5 seconds
                lookAwayProbability = 0.1; // 10% chance to look away briefly
            } else if (isEntityNearby) {
                stareDuration = 4000 + Math.random() * 1000; // 4-5 seconds (original)
                lookAwayDuration = 2000 + Math.random() * 10000; // 2-12 seconds (original)
                lookAwayProbability = 0.7; // 70% chance to look away (original)
            } else { // No one nearby
                stareDuration = 0;
                lookAwayDuration = 2000 + Math.random() * 10000; // 2-12 seconds
                lookAwayProbability = 1.0; // Always look randomly if timer expires
            }

            // State logic
            if (targetEntity && (!this.staring || this.last_entity?.id !== targetEntity.id)) {
                // Start staring at a new entity
                this.staring = true;
                this.last_entity = targetEntity;
                this.next_change = Date.now() + stareDuration;
            } else if (targetEntity && this.staring && Date.now() > this.next_change) {
                // Stare duration expired, decide whether to look away
                const shouldLookAway = Math.random() < lookAwayProbability;
                if (shouldLookAway) {
                    this.staring = false;
                this.last_entity = null;
                    this.next_change = Date.now() + lookAwayDuration;
                    // Look away randomly immediately
                    const yaw = Math.random() * Math.PI * 2;
                    const pitch = (Math.random() * Math.PI/2) - Math.PI/4;
                    bot.look(yaw, pitch, false);
                } else {
                    // Continue staring at the same entity
                    this.next_change = Date.now() + stareDuration;
                }
            } else if (!targetEntity) {
                // No entity nearby
                if (this.staring) {
                    // Stop staring if entity disappeared
                    this.staring = false;
                    this.last_entity = null;
                    this.next_change = Date.now(); // Check immediately if should look random
                }
                if (Date.now() > this.next_change) {
                    // Look randomly
                    const yaw = Math.random() * Math.PI * 2;
                    const pitch = (Math.random() * Math.PI / 2) - Math.PI / 4;
                    bot.look(yaw, pitch, false);
                    this.next_change = Date.now() + lookAwayDuration;
                }
            }

            // Action: Perform lookAt if staring
            if (this.staring && this.last_entity) {
                // Calculate target height (handle players vs mobs, potential babies)
                let height = this.last_entity.height || 1.6; // Default height
                try { // Safer metadata access
                    // Simplified baby check (may need adjustment per MC version)
                    const babyMetadataIndex = 15; // Common index for baby status in mobs
                    if (this.last_entity.type !== 'player' && this.last_entity.metadata[babyMetadataIndex]) {
                        height /= 2;
                    }
                } catch (e) {/* Ignore metadata access errors */} // Ignore errors if metadata is missing/malformed
                const targetPos = this.last_entity.position.offset(0, height, 0);
                bot.lookAt(targetPos);
            } else if (!this.staring && !targetEntity && Date.now() > this.next_change - 50) {
                 // If not staring, no target nearby, and about to look randomly, maybe look straight ahead briefly?
                 // This prevents being stuck looking randomly if no entity appears.
                 // Optional: look slightly down/level instead of purely random every time.
                 // Example: bot.look(bot.entity.yaw, 0, false);
            }
        }
    },
    {
        name: 'follow_target',
        description: 'Continuously follow a specific target entity.',
        interrupts: [], // Should not interrupt others, but can be interrupted by higher priority modes
        on: false, // Off by default
        active: false, // Doesn't use execute, so active is less relevant here, but keep for consistency
        targetEntity: null, // Stores the entity object to follow
        followDistance: 4, // Default follow distance
        
        /**
         * Sets the target entity for the follow mode.
         * @param {Object} agent - The agent object.
         * @param {Entity | null} entity - The entity to follow, or null to stop following.
         * @param {number} [distance=4] - The desired distance to maintain.
         */
        setTarget: function(agent, entity, distance = 4) {
            this.targetEntity = entity;
            this.followDistance = distance;
            this.on = (entity !== null); // Turn on if entity is set, off if null
            if (!this.on) {
                // Explicitly stop pathfinder if target is cleared
                agent.bot.pathfinder.stop();
            }
            console.log(`Follow mode ${this.on ? 'enabled' : 'disabled'}. Target: ${entity ? (entity.username || entity.name) : 'None'}`);
        },

        /**
         * Update function for follow_target mode.
         * If active and target exists, maintains the pathfinder goal.
         * If target is lost, disables itself.
         * @param {Object} agent - The agent object containing the bot.
         */
        update: async function (agent) {
            // This mode runs continuously in the background if 'on', doesn't use 'execute'
            if (!this.on || !this.targetEntity) {
                return; // Do nothing if off or no target
            }
            
            // Check if the target is still valid/visible (basic check)
            const bot = agent.bot;
            const currentTarget = bot.entities[this.targetEntity.id]; // Check if entity still exists by ID
            
            if (!currentTarget || currentTarget.position.distanceTo(bot.entity.position) > world.VERY_FAR_DISTANCE * 2) {
                 // Target lost (too far or despawned)
                 await agent.sendMessage(`Lost sight of ${this.targetEntity.username || this.targetEntity.name}. Stopping follow.`);
                 this.setTarget(agent, null); // Disable the mode and clear target
                 return;
             }

            // Update target reference in case the entity object changed (though ID check is primary)
            this.targetEntity = currentTarget; 

            // Ensure the goal is set or updated
            // Note: No need to constantly call setMovements unless config changes
            // The 'true' flag keeps the goal dynamic
            const goal = new pf.goals.GoalFollow(this.targetEntity, this.followDistance);
            const pathfinderGoal = bot.pathfinder.goal;

            let goalChanged = true; // Assume goal changed unless proven otherwise
            if (pathfinderGoal && pathfinderGoal.constructor === goal.constructor) {
                // Compare relevant properties. For GoalFollow, it's the entity and distance.
                // Make sure pathfinderGoal.entity exists before accessing its id.
                if (pathfinderGoal.entity && pathfinderGoal.entity.id === this.targetEntity.id &&
                    pathfinderGoal.distance === this.followDistance) {
                    goalChanged = false;
                }
            }

            if (!bot.pathfinder.isMoving() || goalChanged) {
                // Set goal if not moving or if goal parameters changed
                bot.pathfinder.setGoal(goal, true);
            }
        },
         
        // Override default pause behavior - this mode shouldn't be paused by standard actions
        // It should only stop if explicitly told to via setTarget(null) or if interrupted by high-priority modes.
        paused: false // Explicitly manage 'on' state instead of pausing
    },
    {
        name: 'cheat',
        description: 'Use cheats to instantly place blocks and teleport.',
        interrupts: [],
        on: false,
        active: false,
        /**
         * Update function for cheat mode.
         * Currently does nothing.
         * @param {Object} agent - The agent object containing the bot.
         */
        update: function (agent) { /* do nothing */ }
    },
    {
        name: 'monitor_rare_blocks',
        description: 'Monitors for nearby rare blocks like diamond, emerald, and ancient debris.',
        interrupts: [], // Should not interrupt anything
        on: true, 
        active: false, // This mode just observes and emits events, doesn't perform long actions
        cooldown: 10000, // Check every 10 seconds to avoid spamming checks
        lastCheckTime: 0,
        rareBlockNames: [
            'diamond_ore', 'deepslate_diamond_ore',
            'emerald_ore', 'deepslate_emerald_ore',
            'ancient_debris'
        ],
        /**
         * Update function for rare block monitoring.
         * Finds nearby rare blocks, checks against a cache, and emits an event if new ones are found.
         * @param {Object} agent - The agent object containing the bot and cache.
         */
        update: async function (agent) {
            const now = Date.now();
            if (now - this.lastCheckTime < this.cooldown) {
                return; // Don't check too frequently
            }
            this.lastCheckTime = now;

            const bot = agent.bot;
            const reportedCache = agent.reportedRareBlocks; // Reference to the agent's cache

            // Find nearby blocks of the rare types
            const nearbyRareBlocks = world.getNearestBlocks(bot, this.rareBlockNames, world.FAR_DISTANCE, 1000);

            if (nearbyRareBlocks.length === 0) {
                return; // No rare blocks found nearby
            }

            const newlyFoundBlocks = [];
            for (const block of nearbyRareBlocks) {
                const posStr = `${block.position.x},${block.position.y},${block.position.z}`;
                if (!reportedCache.has(posStr)) {
                    newlyFoundBlocks.push(block); // Keep the whole block object
                }
            }

            // If new, unreported rare blocks were found
            if (newlyFoundBlocks.length > 0) {
                // Add them to the cache immediately
                newlyFoundBlocks.forEach(block => {
                    const posStr = `${block.position.x},${block.position.y},${block.position.z}`;
                    reportedCache.add(posStr);
                });

                // Emit the event with the list of new blocks
                bot.emit('rare_finds', newlyFoundBlocks);
            }
        }
    },
    // {
    //     name: 'farming',
    //     description: 'Plant wheat seeds on hoed dirt.',
    //     interrupts: ['defaults'],
    //     on: true,
    //     active: false,
    //     /**
    //      * Update function for farming mode.
    //      * Detects hoed dirt and plants wheat seeds if available.
    //      * @param {Object} agent - The agent object containing the bot.
    //      */
    //     update: async function (agent) {
    //         const bot = agent.bot;
    //         const hoedDirt = bot.findBlock({
    //             matching: bot.registry.blocksByName.farmland.id,
    //             maxDistance: 6,
    //             useExtraInfo: (block) => {
    //                 const blockAbove = bot.blockAt(block.position.offset(0, 1, 0));
    //                 return !blockAbove || blockAbove.type === 0;
    //             }
    //         });

    //         if (hoedDirt) {
    //             const seeds = bot.inventory.items().find(item => item.name === 'wheat_seeds');
    //             if (seeds) {
    //                 await bot.equip(seeds, 'hand');
    //                 await bot.placeBlock(hoedDirt, new Vec3(0, 1, 0));
    //             }
    //         }
    //     }
    // }
];

/**
 * Executes a given function within the context of a mode.
 * Sets the mode to active, runs the function, and then sets the mode to inactive.
 * @param {Object} mode - The mode object.
 * @param {Object} agent - The agent object containing the bot.
 * @param {Function} func - The function to execute.
 * @param {number} [timeout=-1] - Optional timeout for the function execution.
 */
async function execute(mode, agent, func, timeout=-1) {
    let code_return = await agent.coder.execute(async () => {
        await func();
    }, timeout);
    console.log(`Mode ${mode.name} finished executing, code_return: ${code_return.message}`);
}

/**
 * Class representing a controller for managing modes.
 */
class ModeController {
    /**
     * Creates an instance of ModeController.
     * @param {Object} agent - The agent object containing the bot.
     */
    constructor(agent) {
        this.agent = agent;
        this.modes_list = modes;
        this.modes_map = {};
        for (let mode of this.modes_list) {
            this.modes_map[mode.name] = mode;
        }
    }

    /**
     * Checks if a mode exists.
     * @param {string} mode_name - The name of the mode.
     * @returns {boolean} True if the mode exists, false otherwise.
     */
    exists(mode_name) {
        return this.modes_map[mode_name] != null;
    }

    /**
     * Sets the on state of a mode.
     * @param {string} mode_name - The name of the mode.
     * @param {boolean} on - The on state to set.
     */
    setOn(mode_name, on) {
        this.modes_map[mode_name].on = on;
    }

    /**
     * Checks if a mode is on.
     * @param {string} mode_name - The name of the mode.
     * @returns {boolean} True if the mode is on, false otherwise.
     */
    isOn(mode_name) {
        return this.modes_map[mode_name].on;
    }

    /**
     * Pauses a mode.
     * @param {string} mode_name - The name of the mode.
     */
    pause(mode_name) {
        this.modes_map[mode_name].paused = true;
    }

    /**
     * Gets a string representation of available modes.
     * @returns {string} A string listing all available modes and their states.
     */
    getStr() {
        let res = 'Available Modes:';
        for (let mode of this.modes_list) {
            let on = mode.on ? 'ON' : 'OFF';
            res += `\n- ${mode.name}(${on}): ${mode.description}`;
        }
        return res;
    }

    /**
     * Unpauses all paused modes.
     */
    unPauseAll() {
        for (let mode of this.modes_list) {
            if (mode.paused) console.log(`Unpausing mode ${mode.name}`);
            mode.paused = false;
        }
    }

    /**
     * Updates the modes based on the agent's state.
     * Calls the update function of each mode if it is on, not paused, and not active.
     * @returns {Promise<void>}
     */
    async update() {
        if (this.agent.isIdle()) {
            this.unPauseAll();
        }
        for (let mode of this.modes_list) {
            let available = mode.interrupts.includes('all') || this.agent.isIdle();
            let interruptible = this.agent.coder.interruptible && (mode.interrupts.includes('defaults') || mode.interrupts.includes(this.agent.coder.resume_name));
            if (mode.on && !mode.paused && !mode.active && (available || interruptible)) {
                mode.active = true;
                await mode.update(this.agent);
                mode.active = false;
            }
            if (mode.active) break;
        }
    }

    /**
     * Gets a JSON representation of the modes and their states.
     * @returns {Object} A JSON object representing the modes and their states.
     */
    getJson() {
        let res = {};
        for (let mode of this.modes_list) {
            res[mode.name] = mode.on;
        }
        return res;
    }

    /**
     * Loads modes from a JSON object.
     * @param {Object} json - A JSON object representing the modes and their states.
     */
    loadJson(json) {
        for (let mode of this.modes_list) {
            if (json[mode.name] != undefined) {
                mode.on = json[mode.name];
            }
        }
    }
}

/**
 * Initializes the modes for the agent.
 * Adds the mode controller to the bot object and loads initial modes from the prompter.
 * @param {Object} agent - The agent object containing the bot.
 */
export function initModes(agent) {
    // the mode controller is added to the bot object so it is accessible from anywhere the bot is used
    agent.bot.modes = new ModeController(agent);
    // Add the new mode instance to the controller's list during initialization
    const followMode = agent.bot.modes.modes_map['follow_target'];
    if (followMode) {
        followMode.setTarget = followMode.setTarget.bind(followMode); // Bind context for setTarget
    }
    let modes_json = agent.prompter.getInitModes();
    if (modes_json) {
        agent.bot.modes.loadJson(modes_json);
    }
}
