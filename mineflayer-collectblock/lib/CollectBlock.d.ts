import { Bot } from "mineflayer";
import { Block } from "prismarine-block";
import { Entity } from "prismarine-entity";
export type Callback = (err?: Error) => void;
export interface CollectOptions {
    append?: boolean;
    ignoreNoPath?: boolean;
}
export declare class CollectBlock {
    private readonly bot;
    private readonly targets;
    constructor(bot: Bot);
    collect(target: Block | Entity | (Block | Entity)[], options?: CollectOptions | Callback, cb?: Callback): Promise<void>;
    private collectAll;
    private mineBlock;
}
