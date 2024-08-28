import { Bot } from "mineflayer";
import { CollectBlock } from "./CollectBlock";
declare module "mineflayer" {
    interface Bot {
        collectBlock: CollectBlock;
    }
}
export declare function plugin(bot: Bot): void;
export { CollectBlock, Callback, CollectOptions } from "./CollectBlock";
