import * as skills from './library/skills.js';
import * as world from './library/world.js';
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
            else if (Date.now() - bot.lastDamageTime < 3000 && (bot.health < 5 || bot.lastDamageTaken >= bot.health)) {
                await agent.sendMessage('I\'m dying!');
                execute(this, agent, async () => {
                    await skills.moveAway(bot, 20);
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
            const enemy = world.getNearestEntityWhere(agent.bot, entity => MCData.getInstance().isHostile(entity), 16);
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
            const enemy = world.getNearestEntityWhere(agent.bot, entity => MCData.getInstance().isHostile(entity), 4);
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
            let item = world.getNearestEntityWhere(agent.bot, entity => entity.name === 'item', 8);
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
            const entity = agent.bot.nearestEntity();
            let entity_in_view = entity && entity.position.distanceTo(agent.bot.entity.position) < 10 && entity.name !== 'enderman';
            if (entity_in_view && entity !== this.last_entity) {
                this.staring = true;
                this.last_entity = entity;
                this.next_change = Date.now() + Math.random() * 1000 + 4000;
            }
            if (entity_in_view && this.staring) {
                let isbaby = entity.type !== 'player' && entity.metadata[16];
                let height = isbaby ? entity.height/2 : entity.height;
                agent.bot.lookAt(entity.position.offset(0, height, 0));
            }
            if (!entity_in_view)
                this.last_entity = null;
            if (Date.now() > this.next_change) {
                // look in random direction
                this.staring = Math.random() < 0.3;
                if (!this.staring) {
                    const yaw = Math.random() * Math.PI * 2;
                    const pitch = (Math.random() * Math.PI/2) - Math.PI/4;
                    agent.bot.look(yaw, pitch, false);
                }
                this.next_change = Date.now() + Math.random() * 10000 + 2000;
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
    let modes = agent.prompter.getInitModes();
    if (modes) {
        agent.bot.modes.loadJson(modes);
    }
}
