"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollectBlock = exports.plugin = void 0;
const CollectBlock_1 = require("./CollectBlock");
const mineflayer_pathfinder_1 = require("mineflayer-pathfinder");
const mineflayer_tool_1 = require("mineflayer-tool");
function plugin(bot) {
    bot.collectBlock = new CollectBlock_1.CollectBlock(bot);
    // Load plugins if not loaded manually.
    setTimeout(() => loadPathfinderPlugin(bot), 0);
    setTimeout(() => loadToolPlugin(bot), 0);
}
exports.plugin = plugin;
function loadPathfinderPlugin(bot) {
    if (bot.pathfinder != null)
        return;
    bot.loadPlugin(mineflayer_pathfinder_1.pathfinder);
}
function loadToolPlugin(bot) {
    if (bot.tool != null)
        return;
    bot.loadPlugin(mineflayer_tool_1.plugin);
}
var CollectBlock_2 = require("./CollectBlock");
Object.defineProperty(exports, "CollectBlock", { enumerable: true, get: function () { return CollectBlock_2.CollectBlock; } });
