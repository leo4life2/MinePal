import { Bot } from "mineflayer";
import { CollectBlock, Callback, CollectOptions } from "./CollectBlock";
import { pathfinder as pathfinderPlugin } from "mineflayer-pathfinder";
import { plugin as toolPlugin } from "mineflayer-tool";

declare module "mineflayer" {
	interface Bot {
		collectBlock: CollectBlock;
	}
}

export function plugin(bot: Bot): void {
	bot.collectBlock = new CollectBlock(bot);

	// Load plugins if not loaded manually.
	setTimeout(() => loadPathfinderPlugin(bot), 0);
	setTimeout(() => loadToolPlugin(bot), 0);
}

function loadPathfinderPlugin(bot: Bot): void {
	if (bot.pathfinder != null) return;
	bot.loadPlugin(pathfinderPlugin);
}

function loadToolPlugin(bot: Bot): void {
	if (bot.tool != null) return;
	bot.loadPlugin(toolPlugin);
}

export { CollectBlock, Callback, CollectOptions };
