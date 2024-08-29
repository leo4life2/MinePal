import { Bot } from "mineflayer";
import { Block } from "prismarine-block";
import { goals, SafeBlock } from "mineflayer-pathfinder";
import { Entity } from "prismarine-entity";
import { callbackify } from "util";
import { once } from 'events'
import FastPriorityQueue from "fastpriorityqueue";

export type Callback = (err?: Error) => void;

export interface CollectOptions {
    append?: boolean;
    ignoreNoPath?: boolean;
}

interface CollectOptionsFull {
    append: boolean;
    ignoreNoPath: boolean;
    targets: Targets;
}

class Targets {
    private targets: FastPriorityQueue<Block | Entity>;
    constructor(private bot: Bot) {
        this.targets = new FastPriorityQueue<Block | Entity>((a, b) => {
            const distA = a.position.distanceTo(this.bot.entity.position);
            const distB = b.position.distanceTo(this.bot.entity.position);
            return distA < distB;
        });
    }

    appendTargets(targets: (Block | Entity)[]): void {
        for (const target of targets) {
            this.appendTarget(target);
        }
    }

    appendTarget(target: Block | Entity): void {
        let exists = false;
        this.targets.forEach((t: Block | Entity) => {
            if (t === target) {
                exists = true;
            }
        });
        if (!exists) {
            this.targets.add(target);
        }
    }

    getClosest(): Block | Entity | null {
        return this.targets.poll() || null;
    }

    get empty(): boolean {
        return this.targets.isEmpty();
    }

    clear(): void {
        this.targets = new FastPriorityQueue<Block | Entity>((a, b) => {
            const distA = a.position.distanceTo(this.bot.entity.position);
            const distB = b.position.distanceTo(this.bot.entity.position);
            return distA < distB;
        });
    }

    removeTarget(target: Block | Entity): void {
        const newQueue = new FastPriorityQueue<Block | Entity>((a, b) => {
            const distA = a.position.distanceTo(this.bot.entity.position);
            const distB = b.position.distanceTo(this.bot.entity.position);
            return distA < distB;
        });
        this.targets.forEach((t: Block | Entity) => {
            if (t !== target) newQueue.add(t);
        });
        this.targets = newQueue;
    }
}

export class CollectBlock {
    private readonly bot: Bot;
    private readonly targets: Targets;

    constructor(bot: Bot) {
        this.bot = bot;
        this.targets = new Targets(bot);
    }

    async collect(target: Block | Entity | (Block | Entity)[], options: CollectOptions | Callback = {}, cb?: Callback): Promise<boolean> {
        if (typeof options === "function") {
            cb = options;
            options = {};
        }
        if (cb != null) return callbackify(() => this.collect(target, options))(cb) as unknown as boolean;

        const optionsFull: CollectOptionsFull = {
            append: options.append ?? false,
            ignoreNoPath: options.ignoreNoPath ?? false,
            targets: this.targets,
        };

        if (this.bot.pathfinder == null) {
            throw new Error("The mineflayer-pathfinder plugin is required!");
        }

        if (!optionsFull.append) await this.cancelTask(); // Re-added cancelTask logic
        if (Array.isArray(target)) {
            this.targets.appendTargets(target);
        } else {
            this.targets.appendTarget(target);
        }

        try {
            const success = await this.collectAll(optionsFull);
            return success;
        } catch (err) {
            this.targets.clear();
            throw err;
        } finally {
            // @ts-expect-error
            this.bot.emit("collectBlock_finished");
        }
    }

    private async collectAll(options: CollectOptionsFull): Promise<boolean> {
        while (!options.targets.empty) {
            const closest = options.targets.getClosest();
            if (closest == null) break;

            let success = false;
            switch (closest.constructor.name) {
                case "Block": {
                    const closestBlock = closest as Block;
                    let goal;
                    if (closestBlock.boundingBox === "empty") {
                        goal = new goals.GoalGetToBlock(closestBlock.position.x, closestBlock.position.y, closestBlock.position.z);
                    } else {
                        goal = new goals.GoalLookAtBlock(closestBlock.position, this.bot.world);
                    }
                    await this.bot.pathfinder.goto(goal);
                    success = await this.mineBlock(closestBlock as Block, options);
                    break;
                }
                case "Entity": {
                    if (!(closest as Entity).isValid) break;
                    const waitForPickup = new Promise<void>((resolve) => {
                        this.bot.once("entityGone", (entity: Entity) => {
                            if (entity === closest) resolve();
                        });
                    });
                    await this.bot.pathfinder.goto(new goals.GoalFollow(closest as Entity, 0));
                    await waitForPickup;
                    success = true;
                    break;
                }
                default: {
                    throw new Error(`Unknown target type: ${closest.constructor.name}`);
                }
            }
            options.targets.removeTarget(closest);
            if (!success) return false;
        }
        return true;
    }

    private async mineBlock(block: Block, options: CollectOptionsFull): Promise<boolean> {
        const safeBlock = block as unknown as SafeBlock;
        if (this.bot.blockAt(block.position)?.type !== block.type || !this.bot.pathfinder.movements.safeToBreak(safeBlock)) {
            options.targets.removeTarget(block);
            return false;
        }

        const success = await this.bot.dig(block);
        if (!success) return false;

        // Move to the location of the block dug
        const goal = new goals.GoalBlock(block.position.x, block.position.y, block.position.z);
        await this.bot.pathfinder.goto(goal);
        return true;
    }

    async cancelTask(cb?: Callback): Promise<void> {
        if (this.targets.empty) {
            if (cb != null) cb();
            return await Promise.resolve();
        }
        this.bot.pathfinder.stop();
        if (cb != null) {
            // @ts-expect-error
            this.bot.once('collectBlock_finished', cb);
        }
        await once(this.bot, 'collectBlock_finished');
    }
}
