import { Bot } from 'mineflayer';
import { Block } from 'prismarine-block';
import { Movements } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import { ItemFilter } from './Inventory';
import { Collectable } from './Targets';
export declare type Callback = (err?: Error) => void;
/**
 * A set of options to apply when collecting the given targets.
 */
export interface CollectOptions {
    /**
     * If true, the target(s) will be appended to the existing target list instead of
     * starting a new task. Defaults to false.
     */
    append?: boolean;
    /**
     * If true, errors will not be thrown when a path to the target block cannot
     * be found. The bot will attempt to choose the best available position it
     * can find, instead. Errors are still thrown if the bot cannot interact with
     * the block from it's final location. Defaults to false.
     */
    ignoreNoPath?: boolean;
    /**
     * Gets the list of chest locations to use when storing items after the bot's
     * inventory becomes full. If undefined, it defaults to the chest location
     * list on the bot.collectBlock plugin.
     */
    chestLocations?: Vec3[];
    /**
     * When transferring items to a chest, this filter is used to determine what
     * items are allowed to be moved, and what items aren't allowed to be moved.
     * Defaults to the item filter specified on the bot.collectBlock plugin.
     */
    itemFilter?: ItemFilter;
}
/**
 * The collect block plugin.
 */
export declare class CollectBlock {
    /**
       * The bot.
       */
    private readonly bot;
    /**
     * The list of active targets being collected.
     */
    private readonly targets;
    /**
       * The movements configuration to be sent to the pathfinder plugin.
       */
    movements?: Movements;
    /**
       * A list of chest locations which the bot is allowed to empty their inventory into
       * if it becomes full while the bot is collecting resources.
       */
    chestLocations: Vec3[];
    /**
       * When collecting items, this filter is used to determine what items should be placed
       * into a chest if the bot's inventory becomes full. By default, returns true for all
       * items except for tools, weapons, and armor.
       *
       * @param item - The item stack in the bot's inventory to check.
       *
       * @returns True if the item should be moved into the chest. False otherwise.
       */
    itemFilter: ItemFilter;
    /**
       * Creates a new instance of the create block plugin.
       *
       * @param bot - The bot this plugin is acting on.
       */
    constructor(bot: Bot);
    /**
       * If target is a block:
       * Causes the bot to break and collect the target block.
       *
       * If target is an item drop:
       * Causes the bot to collect the item drop.
       *
       * If target is an array containing items or blocks, preforms the correct action for
       * all targets in that array sorting dynamically by distance.
       *
       * @param target - The block(s) or item(s) to collect.
       * @param options - The set of options to use when handling these targets
       * @param cb - The callback that is called finished.
       */
    collect(target: Collectable | Collectable[], options?: CollectOptions | Callback, cb?: Callback): Promise<void>;
    /**
     * Loads all touching blocks of the same type to the given block and returns them as an array.
     * This effectively acts as a flood fill algorithm to retrieve blocks in the same ore vein and similar.
     *
     * @param block - The starting block.
     * @param maxBlocks - The maximum number of blocks to look for before stopping.
     * @param maxDistance - The max distance from the starting block to look.
     * @param floodRadius - The max distance distance from block A to block B to be considered "touching"
     */
    findFromVein(block: Block, maxBlocks?: number, maxDistance?: number, floodRadius?: number): Block[];
    /**
     * Cancels the current collection task, if still active.
     *
     * @param cb - The callback to use when the task is stopped.
     */
    cancelTask(cb?: Callback): Promise<void>;
}
