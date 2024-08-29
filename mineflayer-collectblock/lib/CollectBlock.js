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
const util_1 = require("util");
const events_1 = require("events");
const fastpriorityqueue_1 = __importDefault(require("fastpriorityqueue"));
class Targets {
    constructor(bot) {
        this.bot = bot;
        this.targets = new fastpriorityqueue_1.default((a, b) => {
            const distA = a.position.distanceTo(this.bot.entity.position);
            const distB = b.position.distanceTo(this.bot.entity.position);
            return distA < distB;
        });
    }
    appendTargets(targets) {
        for (const target of targets) {
            this.appendTarget(target);
        }
    }
    appendTarget(target) {
        let exists = false;
        this.targets.forEach((t) => {
            if (t === target) {
                exists = true;
            }
        });
        if (!exists) {
            this.targets.add(target);
        }
    }
    getClosest() {
        return this.targets.poll() || null;
    }
    get empty() {
        return this.targets.isEmpty();
    }
    clear() {
        this.targets = new fastpriorityqueue_1.default((a, b) => {
            const distA = a.position.distanceTo(this.bot.entity.position);
            const distB = b.position.distanceTo(this.bot.entity.position);
            return distA < distB;
        });
    }
    removeTarget(target) {
        const newQueue = new fastpriorityqueue_1.default((a, b) => {
            const distA = a.position.distanceTo(this.bot.entity.position);
            const distB = b.position.distanceTo(this.bot.entity.position);
            return distA < distB;
        });
        this.targets.forEach((t) => {
            if (t !== target)
                newQueue.add(t);
        });
        this.targets = newQueue;
    }
}
class CollectBlock {
    constructor(bot) {
        this.bot = bot;
        this.targets = new Targets(bot);
    }
    collect(target, options = {}, cb) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof options === "function") {
                cb = options;
                options = {};
            }
            if (cb != null)
                return (0, util_1.callbackify)(() => this.collect(target, options))(cb);
            const optionsFull = {
                append: (_a = options.append) !== null && _a !== void 0 ? _a : false,
                ignoreNoPath: (_b = options.ignoreNoPath) !== null && _b !== void 0 ? _b : false,
                targets: this.targets,
            };
            if (this.bot.pathfinder == null) {
                throw new Error("The mineflayer-pathfinder plugin is required!");
            }
            if (!optionsFull.append)
                yield this.cancelTask(); // Re-added cancelTask logic
            if (Array.isArray(target)) {
                this.targets.appendTargets(target);
            }
            else {
                this.targets.appendTarget(target);
            }
            try {
                const success = yield this.collectAll(optionsFull);
                return success;
            }
            catch (err) {
                this.targets.clear();
                throw err;
            }
            finally {
                // @ts-expect-error
                this.bot.emit("collectBlock_finished");
            }
        });
    }
    collectAll(options) {
        return __awaiter(this, void 0, void 0, function* () {
            while (!options.targets.empty) {
                const closest = options.targets.getClosest();
                if (closest == null)
                    break;
                let success = false;
                switch (closest.constructor.name) {
                    case "Block": {
                        const closestBlock = closest;
                        let goal;
                        if (closestBlock.boundingBox === "empty") {
                            goal = new mineflayer_pathfinder_1.goals.GoalGetToBlock(closestBlock.position.x, closestBlock.position.y, closestBlock.position.z);
                        }
                        else {
                            goal = new mineflayer_pathfinder_1.goals.GoalLookAtBlock(closestBlock.position, this.bot.world);
                        }
                        yield this.bot.pathfinder.goto(goal);
                        success = yield this.mineBlock(closestBlock, options);
                        break;
                    }
                    case "Entity": {
                        if (!closest.isValid)
                            break;
                        const waitForPickup = new Promise((resolve) => {
                            this.bot.once("entityGone", (entity) => {
                                if (entity === closest)
                                    resolve();
                            });
                        });
                        yield this.bot.pathfinder.goto(new mineflayer_pathfinder_1.goals.GoalFollow(closest, 0));
                        yield waitForPickup;
                        success = true;
                        break;
                    }
                    default: {
                        throw new Error(`Unknown target type: ${closest.constructor.name}`);
                    }
                }
                options.targets.removeTarget(closest);
                if (!success)
                    return false;
            }
            return true;
        });
    }
    mineBlock(block, options) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const safeBlock = block;
            if (((_a = this.bot.blockAt(block.position)) === null || _a === void 0 ? void 0 : _a.type) !== block.type || !this.bot.pathfinder.movements.safeToBreak(safeBlock)) {
                options.targets.removeTarget(block);
                return false;
            }
            const success = yield this.bot.dig(block);
            if (!success)
                return false;
            // Move to the location of the block dug
            const goal = new mineflayer_pathfinder_1.goals.GoalBlock(block.position.x, block.position.y, block.position.z);
            yield this.bot.pathfinder.goto(goal);
            return true;
        });
    }
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
