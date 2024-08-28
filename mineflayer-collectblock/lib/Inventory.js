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
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyInventory = exports.emptyInventoryIfFull = void 0;
const Util_1 = require("./Util");
const mineflayer_pathfinder_1 = require("mineflayer-pathfinder");
const util_1 = require("util");
function getClosestChest(bot, chestLocations) {
    let chest = null;
    let distance = 0;
    for (const c of chestLocations) {
        const dist = c.distanceTo(bot.entity.position);
        if (chest == null || dist < distance) {
            chest = c;
            distance = dist;
        }
    }
    if (chest != null) {
        chestLocations.splice(chestLocations.indexOf(chest), 1);
    }
    return chest;
}
function emptyInventoryIfFull(bot, chestLocations, itemFilter, cb) {
    return __awaiter(this, void 0, void 0, function* () {
        // @ts-expect-error
        if (cb != null)
            return (0, util_1.callbackify)(emptyInventoryIfFull)(bot, chestLocations, cb);
        if (bot.inventory.emptySlotCount() > 0)
            return;
        return yield emptyInventory(bot, chestLocations, itemFilter);
    });
}
exports.emptyInventoryIfFull = emptyInventoryIfFull;
function emptyInventory(bot, chestLocations, itemFilter, cb) {
    return __awaiter(this, void 0, void 0, function* () {
        // @ts-expect-error
        if (cb != null)
            return (0, util_1.callbackify)(emptyInventory)(bot, chestLocations, cb);
        if (chestLocations.length === 0) {
            throw (0, Util_1.error)('NoChests', 'There are no defined chest locations!');
        }
        // Shallow clone so we can safely remove chests from the list that are full.
        chestLocations = [...chestLocations];
        while (true) {
            const chest = getClosestChest(bot, chestLocations);
            if (chest == null) {
                throw (0, Util_1.error)('NoChests', 'All chests are full.');
            }
            const hasRemaining = yield tryEmptyInventory(bot, chest, itemFilter);
            if (!hasRemaining)
                return;
        }
    });
}
exports.emptyInventory = emptyInventory;
function tryEmptyInventory(bot, chestLocation, itemFilter, cb) {
    return __awaiter(this, void 0, void 0, function* () {
        // @ts-expect-error
        if (cb != null)
            return (0, util_1.callbackify)(tryEmptyInventory)(bot, chestLocation, itemFilter, cb);
        yield gotoChest(bot, chestLocation);
        return yield placeItems(bot, chestLocation, itemFilter);
    });
}
function gotoChest(bot, location, cb) {
    return __awaiter(this, void 0, void 0, function* () {
        // @ts-expect-error
        if (cb != null)
            return (0, util_1.callbackify)(gotoChest)(bot, location);
        yield bot.pathfinder.goto(new mineflayer_pathfinder_1.goals.GoalGetToBlock(location.x, location.y, location.z));
    });
}
function placeItems(bot, chestPos, itemFilter, cb) {
    return __awaiter(this, void 0, void 0, function* () {
        // @ts-expect-error
        if (cb != null)
            return (0, util_1.callbackify)(placeItems)(bot, chestPos, itemFilter, cb);
        const chestBlock = bot.blockAt(chestPos);
        if (chestBlock == null) {
            throw (0, Util_1.error)('UnloadedChunk', 'Chest is in an unloaded chunk!');
        }
        const chest = yield bot.openChest(chestBlock);
        for (const item of bot.inventory.items()) {
            if (!itemFilter(item))
                continue;
            if (chest.firstEmptyContainerSlot() === null) {
                // We have items that didn't fit.
                return true;
            }
            yield chest.deposit(item.type, item.metadata, item.count);
        }
        return false;
    });
}
