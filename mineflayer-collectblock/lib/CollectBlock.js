"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollectBlock = void 0;
const mineflayer_pathfinder_1 = require("mineflayer-pathfinder");
const TemporarySubscriber_1 = require("./TemporarySubscriber");
const Util_1 = require("./Util");
const Inventory_1 = require("./Inventory");
const BlockVeins_1 = require("./BlockVeins");
const Targets_1 = require("./Targets");
const minecraft_data_1 = __importDefault(require("minecraft-data"));
const events_1 = require("events");
const util_1 = require("util");
function collectAll(bot, options) {
    return __awaiter(this, void 0, void 0, function* () {
        while (!options.targets.empty) {
            yield (0, Inventory_1.emptyInventoryIfFull)(bot, options.chestLocations, options.itemFilter);
            const closest = options.targets.getClosest();
            if (closest == null)
                break;
            switch (closest.constructor.name) {
                case 'Block': {
                    const goal = new mineflayer_pathfinder_1.goals.GoalLookAtBlock(closest.position, bot.world);
                    yield bot.pathfinder.goto(goal);
                    yield mineBlock(bot, closest, options);
                    // TODO: options.ignoreNoPath
                    break;
                }
                case 'Entity': {
                    // Don't collect any entities that are marked as 'invalid'
                    if (!closest.isValid)
                        break;
                    const tempEvents = new TemporarySubscriber_1.TemporarySubscriber(bot);
                    const waitForPickup = new Promise(resolve => {
                        tempEvents.subscribeTo('entityGone', (entity) => {
                            if (entity === closest) {
                                tempEvents.cleanup();
                                resolve();
                            }
                        });
                    });
                    yield bot.pathfinder.goto(new mineflayer_pathfinder_1.goals.GoalFollow(closest, 0));
                    yield waitForPickup;
                    break;
                }
                default: {
                    throw (0, Util_1.error)('UnknownType', `Target ${closest.constructor.name} is not a Block or Entity!`);
                }
            }
            options.targets.removeTarget(closest);
        }
    });
}
const equipToolOptions = {
    requireHarvest: true,
    getFromChest: true,
    maxTools: 2
};
function mineBlock(bot, block, options) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        // @ts-expect-error
        if (((_a = bot.blockAt(block.position)) === null || _a === void 0 ? void 0 : _a.type) !== block.type || ((_b = bot.blockAt(block.position)) === null || _b === void 0 ? void 0 : _b.type) === 0 || !bot.pathfinder.movements.safeToBreak(block)) {
            options.targets.removeTarget(block);
            return;
        }
        yield bot.tool.equipForBlock(block, equipToolOptions);
        // @ts-expect-error
        const heldItemType = bot.heldItem?.type;
        if (!block.canHarvest(heldItemType)) {
            options.targets.removeTarget(block);
            return;
        }
        const tempEvents = new TemporarySubscriber_1.TemporarySubscriber(bot);
        tempEvents.subscribeTo('itemDrop', (entity) => {
            if (entity.position.distanceTo(block.position.offset(0.5, 0.5, 0.5)) <= 0.5) {
                options.targets.appendTarget(entity);
            }
        });
        try {
            yield bot.dig(block);
            // Waiting for items to drop
            yield new Promise(resolve => {
                let remainingTicks = 10;
                tempEvents.subscribeTo('physicTick', () => {
                    remainingTicks--;
                    if (remainingTicks <= 0) {
                        tempEvents.cleanup();
                        resolve();
                    }
                });
            });
        }
        finally {
            tempEvents.cleanup();
        }
    });
}
/**
 * The collect block plugin.
 */
class CollectBlock {
    /**
       * Creates a new instance of the create block plugin.
       *
       * @param bot - The bot this plugin is acting on.
       */
    constructor(bot) {
        /**
           * A list of chest locations which the bot is allowed to empty their inventory into
           * if it becomes full while the bot is collecting resources.
           */
        this.chestLocations = [];
        /**
           * When collecting items, this filter is used to determine what items should be placed
           * into a chest if the bot's inventory becomes full. By default, returns true for all
           * items except for tools, weapons, and armor.
           *
           * @param item - The item stack in the bot's inventory to check.
           *
           * @returns True if the item should be moved into the chest. False otherwise.
           */
        this.itemFilter = (item) => {
            if (item.name.includes('helmet'))
                return false;
            if (item.name.includes('chestplate'))
                return false;
            if (item.name.includes('leggings'))
                return false;
            if (item.name.includes('boots'))
                return false;
            if (item.name.includes('shield'))
                return false;
            if (item.name.includes('sword'))
                return false;
            if (item.name.includes('pickaxe'))
                return false;
            if (item.name.includes('axe'))
                return false;
            if (item.name.includes('shovel'))
                return false;
            if (item.name.includes('hoe'))
                return false;
            return true;
        };
        this.bot = bot;
        this.targets = new Targets_1.Targets(bot);
        this.movements = new mineflayer_pathfinder_1.Movements(bot, (0, minecraft_data_1.default)(bot.version));
    }
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
    collect(target, options = {}, cb) {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof options === 'function') {
                cb = options;
                options = {};
            }
            // @ts-expect-error
            if (cb != null)
                return (0, util_1.callbackify)(this.collect)(target, options, cb);
            const optionsFull = {
                append: (_a = options.append) !== null && _a !== void 0 ? _a : false,
                ignoreNoPath: (_b = options.ignoreNoPath) !== null && _b !== void 0 ? _b : false,
                chestLocations: (_c = options.chestLocations) !== null && _c !== void 0 ? _c : this.chestLocations,
                itemFilter: (_d = options.itemFilter) !== null && _d !== void 0 ? _d : this.itemFilter,
                targets: this.targets
            };
            if (this.bot.pathfinder == null) {
                throw (0, Util_1.error)('UnresolvedDependency', 'The mineflayer-collectblock plugin relies on the mineflayer-pathfinder plugin to run!');
            }
            if (this.bot.tool == null) {
                throw (0, Util_1.error)('UnresolvedDependency', 'The mineflayer-collectblock plugin relies on the mineflayer-tool plugin to run!');
            }
            if (this.movements != null) {
                this.bot.pathfinder.setMovements(this.movements);
            }
            if (!optionsFull.append)
                yield this.cancelTask();
            if (Array.isArray(target)) {
                this.targets.appendTargets(target);
            }
            else {
                this.targets.appendTarget(target);
            }
            try {
                yield collectAll(this.bot, optionsFull);
            }
            catch (err) {
                this.targets.clear();
                // Ignore path stopped error for cancelTask to work properly (imo we shouldn't throw any pathing errors)
                // @ts-expect-error
                if (err.name !== 'PathStopped')
                    throw err;
            }
            finally {
                // @ts-expect-error
                this.bot.emit('collectBlock_finished');
            }
        });
    }
    /**
     * Loads all touching blocks of the same type to the given block and returns them as an array.
     * This effectively acts as a flood fill algorithm to retrieve blocks in the same ore vein and similar.
     *
     * @param block - The starting block.
     * @param maxBlocks - The maximum number of blocks to look for before stopping.
     * @param maxDistance - The max distance from the starting block to look.
     * @param floodRadius - The max distance distance from block A to block B to be considered "touching"
     */
    findFromVein(block, maxBlocks = 100, maxDistance = 16, floodRadius = 1) {
        return (0, BlockVeins_1.findFromVein)(this.bot, block, maxBlocks, maxDistance, floodRadius);
    }
    /**
     * Cancels the current collection task, if still active.
     *
     * @param cb - The callback to use when the task is stopped.
     */
    cancelTask(cb) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.targets.empty) {
                if (cb != null)
                    cb();
                return yield Promise.resolve();
            }
            this.bot.pathfinder.stop();
            if (cb != null) {
                // @ts-expect-error
                this.bot.once('collectBlock_finished', cb);
            }
            yield (0, events_1.once)(this.bot, 'collectBlock_finished');
        });
    }
}
exports.CollectBlock = CollectBlock;
