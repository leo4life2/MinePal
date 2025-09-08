import pf from 'mineflayer-pathfinder';
import MCData from '../../utils/mcdata.js';


export function getNearestFreeSpace(bot, size=1, distance=8) {
    /**
     * Get the nearest empty space with solid blocks beneath it of the given size.
     * @param {Bot} bot - The bot to get the nearest free space for.
     * @param {number} size - The (size x size) of the space to find, default 1.
     * @param {number} distance - The maximum distance to search, default 8.
     * @returns {Vec3} - The south west corner position of the nearest free space.
     * @example
     * let position = world.getNearestFreeSpace(bot, 1, 8);
     **/
    let empty_pos = bot.findBlocks({
        matching: (block) => {
            return block && block.name == 'air';
        },
        maxDistance: distance,
        count: 1000
    });
    for (let i = 0; i < empty_pos.length; i++) {
        let empty = true;
        for (let x = 0; x < size; x++) {
            for (let z = 0; z < size; z++) {
                let top = bot.blockAt(empty_pos[i].offset(x, 0, z));
                let bottom = bot.blockAt(empty_pos[i].offset(x, -1, z));
                if (!top || !top.name == 'air' || !bottom || bottom.drops.length == 0 || !bottom.diggable) {
                    empty = false;
                    break;
                }
            }
            if (!empty) break;
        }
        if (empty) {
            return empty_pos[i];
        }
    }
}

export function getNearestBlocks(bot, block_types=null, distance=64, count=10000) {
    /**
     * Get a list of the nearest blocks of the given types.
     * @param {Bot} bot - The bot to get the nearest block for.
     * @param {string[]} block_types - The names of the blocks to search for.
     * @param {number} distance - The maximum distance to search, default 64.
     * @param {number} count - The maximum number of blocks to find, default 10000.
     * @returns {Block[]} - The nearest blocks of the given type.
     * @example
     * let woodBlocks = world.getNearestBlocks(bot, ['oak_log', 'birch_log'], 16, 1);
     **/
    // if blocktypes is not a list, make it a list
    let block_ids = [];
    if (block_types === null) {
        block_ids = MCData.getInstance().getAllBlockIds(['air']);
    }
    else {
        if (!Array.isArray(block_types))
            block_types = [block_types];
        for(let block_type of block_types) {
            const id = MCData.getInstance().getBlockId(block_type);
            if (id === null) {
                console.log(`[getNearestBlocks] block type not found: ${block_type}`);
                continue;
            }
            block_ids.push(id);
        }
    }

    let positions = bot.findBlocks({matching: block_ids, maxDistance: distance, count: count});
    // console.log(`[getNearestBlocks] target: ${block_types}, positions length: ${positions.length}`);
    let blocks = [];
    for (let i = 0; i < positions.length; i++) {
        let block = bot.blockAt(positions[i]);
        let distance = positions[i].distanceTo(bot.entity.position);
        try {
            if (bot.canSeeBlock(block)) {
                blocks.push({ block: block, distance: distance });
            }
        } catch (err) {
            // swallow
        }
    }
    blocks.sort((a, b) => a.distance - b.distance);

    let res = [];
    for (let i = 0; i < blocks.length; i++) {
        res.push(blocks[i].block);
    }
    // console.log(`[getNearestBlocks] res length: ${res.length}`);
    return res;
}


export function getNearestBlock(bot, block_type, distance=16) {
     /**
     * Get the nearest block of the given type.
     * @param {Bot} bot - The bot to get the nearest block for.
     * @param {string} block_type - The name of the block to search for.
     * @param {number} distance - The maximum distance to search, default 16.
     * @returns {Block} - The nearest block of the given type.
     * @example
     * let coalBlock = world.getNearestBlock(bot, 'coal_ore', 16);
     **/
    let blocks = getNearestBlocks(bot, block_type, distance, 1);
    if (blocks.length > 0) {
        return blocks[0];
    }
    return null;
}

// Helper function to group entities by type/name and format for logging
function formatEntityCounts(entities) {
    const counts = {};
    for (const entity of entities) {
        const identifier = entity.username || entity.name || `type_${entity.type}` || 'unknown';
        counts[identifier] = (counts[identifier] || 0) + 1;
    }
    if (Object.keys(counts).length === 0) return "None";
    return Object.entries(counts).map(([name, count]) => `${name}: ${count}`).join(', ');
}

export async function getVisibleEntities(bot) {
    /**
     * Get a list of entities that the bot has a direct line of sight to.
     * Based on raycasting from the bot's eyes to the entity's position.
     * Ensures nearby chunks are loaded.
     * @param {Bot} bot - The bot instance.
     * 
     * @returns {Promise<Entity[]>} - A promise resolving to a list of visible entities (excluding the bot itself).
     */
    const visibleEntities = [];
    if (!bot.entity || !bot.entity.position || bot.entity.eyeHeight === undefined) {
        return visibleEntities; 
    }

    // Wait for nearby chunks to load
    try {
        await bot.waitForChunksToLoad();
    } catch (err) {
        console.warn(`[getVisibleEntities] Error waiting for chunks: ${err.message}`);
        return visibleEntities;
    }

    const headPos = bot.entity.position.offset(0, bot.entity.eyeHeight, 0);
    // Get entities immediately after chunk load
    const allEntities = Object.values(bot.entities).filter(e => e !== bot.entity); 

    for (const entity of allEntities) {
        // Self already filtered out
        if (!entity.position) {
            continue; // Skip entities without a position
        }

        const targetPos = entity.position.offset(0, entity.height*0.9, 0);
        const range = headPos.distanceTo(targetPos);
        if (range === 0) continue; // Skip entity at the exact same position
        const entityIdentifier = entity.username || entity.name || `ID ${entity.id}`;
        try {
            if (bot.canSeeEntity(entity)) {
                visibleEntities.push(entity);
            }
        } catch (err) {
            console.warn(`[getVisibleEntities] Visibility error for entity ${entityIdentifier}: ${err.message}`);
        }
    }
    return visibleEntities;
}

export async function getNearbyPlayers(bot) {
    /**
     * Get a list of all visible players.
     * @param {Bot} bot - The bot instance.
     * @returns {Promise<Entity[]>} - A promise resolving to a list of nearby visible player entities.
     */
    const visibleEntities = await getVisibleEntities(bot); // Use the existing async function

    const nearbyPlayers = visibleEntities.filter(entity => 
        entity.type === 'player' && 
        entity.username !== bot.username
    );

    // Sort by distance (optional, but often useful)
    nearbyPlayers.sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position));

    return nearbyPlayers;
}


export function getInventoryStacks(bot) {
    let inventory = [];
    for (const item of bot.inventory.items()) {
        if (item != null) {
            inventory.push(item);
        }
    }
    return inventory;
}


export function getInventoryCounts(bot) {
    /**
     * Get an object representing the bot's inventory.
     * @param {Bot} bot - The bot to get the inventory for.
     * @returns {object} - An object with item names as keys and counts as values.
     * @example
     * let inventory = world.getInventoryCounts(bot);
     * let oakLogCount = inventory['oak_log'];
     * let hasWoodenPickaxe = inventory['wooden_pickaxe'] > 0;
     **/
    let inventory = {};
    for (const item of bot.inventory.items()) {
        if (item != null) {
            if (inventory[item.name] == null) {
                inventory[item.name] = 0;
            }
            inventory[item.name] += item.count;
        }
    }
    return inventory;
}


export function getPosition(bot) {
    /**
     * Get your position in the world (Note that y is vertical).
     * @param {Bot} bot - The bot to get the position for.
     * @returns {Vec3} - An object with x, y, and x attributes representing the position of the bot.
     * @example
     * let position = world.getPosition(bot);
     * let x = position.x;
     **/
    return bot.entity.position;
}


export function getNearbyEntityTypes(bot) {
    /**
     * Get a list of all nearby mob types.
     * @param {Bot} bot - The bot to get nearby mobs for.
     * @returns {string[]} - A list of all nearby mobs.
     * @example
     * let mobs = world.getNearbyEntityTypes(bot);
     **/
    let mobs = getVisibleEntities(bot);
    let found = [];
    for (let i = 0; i < mobs.length; i++) {
        if (!found.includes(mobs[i].name)) {
            found.push(mobs[i].name);
        }
    }
    return found;
}


export async function getNearbyPlayerNames(bot) {
    /**
     * Get a list of all nearby player names.
     * @param {Bot} bot - The bot to get nearby players for.
     * @returns {string[]} - A list of all nearby players.
     * @example
     * let players = world.getNearbyPlayerNames(bot);
     **/
    let players = await getNearbyPlayers(bot); // Await the async call
    let found = [];
    for (let i = 0; i < players.length; i++) {
        if (!found.includes(players[i].username) && players[i].username != bot.username) {
            found.push(players[i].username);
        }
    }
    return found;
}


export function getNearbyBlockTypes(bot, distance=16) {
    /**
     * Get a list of all nearby block names.
     * @param {Bot} bot - The bot to get nearby blocks for.
     * @param {number} distance - The maximum distance to search, default 16.
     * @returns {string[]} - A list of all nearby blocks.
     * @example
     * let blocks = world.getNearbyBlockTypes(bot);
     **/
    let blocks = getNearestBlocks(bot, null, distance);
    let found = [];
    for (let i = 0; i < blocks.length; i++) {
        if (!found.includes(blocks[i].name)) {
            found.push(blocks[i].name);
        }
    }
    return found;
}

export async function isClearPath(bot, target) {
    /**
     * Check if there is a path to the target that requires no digging or placing blocks.
     * @param {Bot} bot - The bot to get the path for.
     * @param {Entity} target - The target to path to.
     * @returns {boolean} - True if there is a clear path, false otherwise.
     */
    let movements = new pf.Movements(bot)
    movements.canDig = false;
    movements.canPlaceOn = false;
    let goal = new pf.goals.GoalNear(target.position.x, target.position.y, target.position.z, 1);
    let path = await bot.pathfinder.getPathTo(movements, goal, 100);
    return path.status === 'success';
}

export function shouldPlaceTorch(bot) {
    if (!bot.modes.isOn('torch_placing') || bot.interrupt_code) return false;
    const pos = getPosition(bot);
    // TODO: check light level instead of nearby torches, block.light is broken
    let nearest_torch = getNearestBlock(bot, 'torch', 6);
    if (!nearest_torch)
        nearest_torch = getNearestBlock(bot, 'wall_torch', 6);
    if (!nearest_torch) {
        const block = bot.blockAt(pos);
        let has_torch = bot.inventory.items().find(item => item.name === 'torch');
        return has_torch && block?.name === 'air';
    }
    return false;
}

export function getBiomeName(bot) {
    /**
     * Get the name of the biome the bot is in.
     * @param {Bot} bot - The bot to get the biome for.
     * @returns {string} - The name of the biome.
     * @example
     * let biome = world.getBiomeName(bot);
     **/
    const biomeId = bot.world.getBiome(bot.entity.position);
    return MCData.getInstance().getAllBiomes()[biomeId].name;
}