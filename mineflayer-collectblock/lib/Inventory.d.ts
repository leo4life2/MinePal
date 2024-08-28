import { Bot } from 'mineflayer';
import { Callback } from './CollectBlock';
import { Vec3 } from 'vec3';
import { Item } from 'prismarine-item';
export type ItemFilter = (item: Item) => boolean;
export declare function emptyInventoryIfFull(bot: Bot, chestLocations: Vec3[], itemFilter: ItemFilter, cb?: Callback): Promise<void>;
export declare function emptyInventory(bot: Bot, chestLocations: Vec3[], itemFilter: ItemFilter, cb?: Callback): Promise<void>;
