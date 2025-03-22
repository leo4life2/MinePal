import { Bot } from 'mineflayer'
import { EatUtil } from './new.js'
import utilPlugin from '@nxg-org/mineflayer-util-plugin'
import type { Item } from 'prismarine-item'

declare module 'mineflayer' {
    interface Bot {
        autoEat: EatUtil
    }
    
    // Add compatibility with old event names
    interface BotEvents {
        autoeat_started: (eatenItem: Item, usedOffhand: boolean) => void
        autoeat_finished: (eatenItem: Item, usedOffhand: boolean) => void
        autoeat_error: (error: Error) => void
    }
}

export { EatUtil } from './new.js'

export function loader(bot: Bot) {
    if (!bot.hasPlugin(utilPlugin.default)) bot.loadPlugin(utilPlugin.default)
    bot.autoEat = new EatUtil(bot)
    
    // Enable auto eating by default for backwards compatibility
    bot.autoEat.enableAuto()
}

// Default export for backwards compatibility
export default function(bot: Bot) {
    loader(bot)
}
