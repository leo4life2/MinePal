import { Bot, EquipmentDestination } from 'mineflayer'
import { Item } from 'prismarine-item'
import { setTimeout as sleep } from 'timers/promises'

interface Options {
    priority: 'saturation' | 'foodPoints' | 'auto'
    startAt: number
    healthThreshold: number
    bannedFood: number[]
    eatingTimeout: number
    ignoreInventoryCheck: boolean
    checkOnItemPickup: boolean
    equipOldItem: boolean
}

declare module 'mineflayer' {
    interface Bot {
        autoEat: {
            disabled: boolean
            isEating: boolean
            hasFood: boolean
            options: Options
            eat: () => Promise<boolean>
            disable: () => void
            enable: () => void
        }
    }

    interface BotEvents {
        autoeat_started: (eatenItem: Item, usedOffhand: boolean) => void
        autoeat_finished: (eatenItem: Item, usedOffhand: boolean) => void
        autoeat_error: (error: Error) => void
    }
}

const DEFAULT_OPTIONS: Options = {
    priority: 'auto',
    startAt: 19,
    healthThreshold: 14,
    eatingTimeout: 3000,
    bannedFood: [],
    ignoreInventoryCheck: false,
    checkOnItemPickup: true,
    equipOldItem: true
}

export function plugin(bot: Bot) {
    bot.autoEat = {
        disabled: false,
        isEating: false,
        hasFood: true, // Initialize hasFood to true
        options: { ...DEFAULT_OPTIONS, bannedFood: getBannedFood(bot) },
        disable: () => { bot.autoEat.disabled = true },
        enable: () => { bot.autoEat.disabled = false },
        eat: async () => {
            if (bot.autoEat.disabled || bot.food > 19 || bot.food > bot.autoEat.options.startAt) {
                bot.autoEat.isEating = false
                console.log(`[autoeat] Skipping: ${bot.autoEat.disabled ? 'disabled' : bot.food > 19 ? 'food > 19' : 'food > startAt'} (food: ${bot.food}, startAt: ${bot.autoEat.options.startAt})`);
                return false
            }

            const bestFood = getBestFood(bot)
            if (!bestFood) {
                bot.emit('autoeat_error', new Error('No food found'))
                bot.autoEat.isEating = false
                bot.autoEat.hasFood = false // Set hasFood to false if no food found
                bot.chat("I'm out of food!");
                return false
            }

            await eatFood(bot, bestFood)
            bot.autoEat.isEating = false
            return true
        }
    }

    // Set startAt based on health threshold
    if (bot.autoEat.options.priority === 'auto' && bot.health <= bot.autoEat.options.healthThreshold) {
        bot.autoEat.options.startAt = 19
    } else {
        bot.autoEat.options.startAt = DEFAULT_OPTIONS.startAt
    }

    bot.on('playerCollect', async (who) => {
        if (!bot.autoEat.options.checkOnItemPickup || who.username !== bot.username) return
        // console.log("[autoeat] collect try eat");
        bot.autoEat.hasFood = true // Set hasFood to true on playerCollect event
        await tryEat(bot)
    })

    bot.on('health', async () => {
        if (bot.food < bot.autoEat.options.startAt && !bot.autoEat.isEating && bot.autoEat.hasFood) {
            // console.log("[autoeat] health eating");
            await tryEat(bot);
        }
    })

    bot.on('physicsTick', async () => {
        if (bot.food < bot.autoEat.options.startAt && !bot.autoEat.isEating && bot.autoEat.hasFood) {
            // console.log("[autoeat] physics tick eating!");
            await tryEat(bot);
        }
    })

    bot.on('spawn', () => {
        bot.autoEat.isEating = false
    })

    bot.on('death', () => {
        bot.autoEat.isEating = false
    })

    bot._client.on('entity_status', (packet: any) => {
        if (packet.entityId === bot.entity.id && packet.entityStatus === 9 && bot.autoEat.isEating) {
            bot.autoEat.isEating = false
        }
    })

    bot.on('autoeat_error', (error: Error) => {
        console.log(`[AutoEat] error: ${error.message}`)
    })
}

function getBannedFood(bot: Bot): number[] {
    return [
        bot.registry.foodsByName['pufferfish'].id,
        bot.registry.foodsByName['spider_eye'].id,
        bot.registry.foodsByName['poisonous_potato'].id,
        bot.registry.foodsByName['rotten_flesh'].id,
        bot.registry.foodsByName['chorus_fruit'].id,
        bot.registry.foodsByName['chicken'].id,
        bot.registry.foodsByName['suspicious_stew'].id
    ]
}

function getBestFood(bot: Bot): Item | null {
    const priority = bot.autoEat.options.priority
    const banned = bot.autoEat.options.bannedFood
    const food = bot.registry.foodsByName
    const items = bot.inventory.items()

    const bestChoices = items
        .filter((item) => item.name in bot.registry.foodsByName)
        .filter((item) => !banned.includes(item.type))
        .sort((a, b) => {
            if (priority !== 'auto') return food[b.name][priority] - food[a.name][priority]
            if (bot.health <= bot.autoEat.options.healthThreshold) {
                return food[b.name].saturation - food[a.name].saturation
            } else {
                return food[b.name].foodPoints - food[a.name].foodPoints
            }
        })

    if (bestChoices.length === 0) return null

    let bestFood = bestChoices[0]
    if (priority === 'foodPoints' || (priority === 'auto' && bot.health > bot.autoEat.options.healthThreshold)) {
        const neededPoints = 20 - bot.food
        const bestFoodPoints = food[bestFood.name].foodPoints

        for (const item of bestChoices) {
            const points = food[item.name].foodPoints
            if (Math.abs(points - neededPoints) < Math.abs(bestFoodPoints - neededPoints)) {
                bestFood = item
            }
        }
    }

    return bestFood
}

async function eatFood(bot: Bot, bestFood: Item) {
    const usedHand: EquipmentDestination = 'hand'
    bot.emit('autoeat_started', bestFood, false)

    const requiresConfirmation = bot.inventory.requiresConfirmation
    if (bot.autoEat.options.ignoreInventoryCheck) bot.inventory.requiresConfirmation = false

    const oldItem = bot.inventory.slots[bot.getEquipmentDestSlot(usedHand)]
    await bot.equip(bestFood, usedHand)
    bot.inventory.requiresConfirmation = requiresConfirmation

    bot.deactivateItem();
    await bot.consume();

    const time = performance.now()
    while (bot.autoEat.isEating && performance.now() - time < bot.autoEat.options.eatingTimeout &&
        bot.inventory.slots[bot.getEquipmentDestSlot(usedHand)]?.name === bestFood.name) {
        await sleep()
    }

    if (bot.autoEat.options.equipOldItem && oldItem && oldItem.name !== bestFood.name) {
        await bot.equip(oldItem, usedHand)
    }

    bot.autoEat.isEating = false
    bot.emit('autoeat_finished', bestFood, false)
}

async function tryEat(bot: Bot) {
    if (bot.autoEat.isEating) return;

    bot.autoEat.isEating = true
    try {
        await bot.waitForTicks(1)
        await bot.autoEat.eat()
    } catch (error) {
        bot.emit('autoeat_error', error as Error)
    }
}