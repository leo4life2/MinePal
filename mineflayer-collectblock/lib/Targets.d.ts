import { Bot } from 'mineflayer';
import { Block } from 'prismarine-block';
import { Entity } from 'prismarine-entity';
export declare type Collectable = Block | Entity;
export declare class Targets {
    private readonly bot;
    private targets;
    constructor(bot: Bot);
    appendTargets(targets: Collectable[]): void;
    appendTarget(target: Collectable): void;
    /**
     * Gets the closest target to the bot in this list.
     *
     * @returns The closest target, or null if there are no targets.
     */
    getClosest(): Collectable | null;
    get empty(): boolean;
    clear(): void;
    removeTarget(target: Collectable): void;
}
