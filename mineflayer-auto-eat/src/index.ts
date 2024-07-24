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
    offhand: boolean
    equipOldItem: boolean
}

declare module 'mineflayer' {
    interface Bot {
        autoEat: {
            disabled: boolean
            isEating: boolean
            options: Options
            eat: (offhand?: boolean) => Promise<boolean>
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

export function plugin(bot: Bot) {
    // @ts-ignore - Initializations
    bot.autoEat = {}
    bot.autoEat.disabled = false
    bot.autoEat.isEating = false
    bot.autoEat.options = {
        priority: 'auto',
        startAt: 16,
        healthThreshold: 14,
        eatingTimeout: 3000,
        bannedFood: [
            // puffer fish - only gives negative effects
            bot.registry.foodsByName['pufferfish'].id,
            // spider eye - gives poison effect
            bot.registry.foodsByName['spider_eye'].id,
            // poisonous potato - gives poison effect
            bot.registry.foodsByName['poisonous_potato'].id,
            // rotten flesh - gives hunger effect (and is disgusting)
            bot.registry.foodsByName['rotten_flesh'].id,
            // chorus fruit - randomly teleports you
            bot.registry.foodsByName['chorus_fruit'].id,
            // raw chicken - 30% chance of getting hunger effect
            bot.registry.foodsByName['chicken'].id,
            // suspicious stew - gives random effects (including hunger)
            bot.registry.foodsByName['suspicious_stew'].id,
            // golden apple - shouldn't be eaten unless the user wants to
            bot.registry.foodsByName['golden_apple'].id
        ],
        ignoreInventoryCheck: false,
        checkOnItemPickup: true,
        offhand: true,
        equipOldItem: true
    }

    bot.autoEat.disable = () => {
        bot.autoEat.disabled = true
    }

    bot.autoEat.enable = () => {
        bot.autoEat.disabled = false
    }

    bot.autoEat.eat = async (useOffhand = bot.autoEat.options.offhand) => {
        if (bot.autoEat.disabled || bot.autoEat.isEating || bot.food > 19) return false

        let startAt = bot.autoEat.options.startAt

        if (
            bot.autoEat.options.priority === 'auto' &&
            bot.health <= bot.autoEat.options.healthThreshold
        ) {
            startAt = 19
        }

        if (bot.food > startAt) return false

        bot.autoEat.isEating = true

        const canOffhand = !bot.supportFeature('doesntHaveOffHandSlot')
        const priority = bot.autoEat.options.priority
        const banned = bot.autoEat.options.bannedFood
        const food = bot.registry.foodsByName
        const items = bot.inventory.items()
        const offhandItem = bot.inventory.slots[45]
        const offhand = useOffhand && canOffhand

        if (offhandItem && canOffhand) items.push(offhandItem)

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

        if (bestChoices.length === 0) {
            bot.autoEat.isEating = false
            bot.emit('autoeat_error', new Error('No food found'))
            return false
        }

        let bestFood = bestChoices[0]
        const usedHand: EquipmentDestination = offhand ? 'off-hand' : 'hand'

        // Find the food that has the closest amount of points needed to be full
        // This is to prevent wasting food
        if (
            priority === 'foodPoints' ||
            (priority === 'auto' && bot.health > bot.autoEat.options.healthThreshold)
        ) {
            const neededPoints = 20 - bot.food
            const bestFoodPoints = food[bestFood.name].foodPoints

            for (const item of bestChoices) {
                const points = food[item.name].foodPoints

                if (Math.abs(points - neededPoints) < Math.abs(bestFoodPoints - neededPoints)) {
                    bestFood = item
                }
            }
        }

        bot.emit('autoeat_started', bestFood, offhand)

        const requiresConfirmation = bot.inventory.requiresConfirmation

        if (bot.autoEat.options.ignoreInventoryCheck) bot.inventory.requiresConfirmation = false

        const oldItem = bot.inventory.slots[bot.getEquipmentDestSlot(usedHand)]

        await bot.equip(bestFood, usedHand)

        bot.inventory.requiresConfirmation = requiresConfirmation

        bot.deactivateItem()
        bot.activateItem(offhand)

        const time = performance.now()

        while (
            bot.autoEat.isEating &&
            performance.now() - time < bot.autoEat.options.eatingTimeout &&
            bot.inventory.slots[bot.getEquipmentDestSlot(usedHand)]?.name === bestFood.name
        ) {
            await sleep()
        }

        if (bot.autoEat.options.equipOldItem && oldItem && oldItem.name !== bestFood.name) {
            await bot.equip(oldItem, usedHand)
        }

        bot.autoEat.isEating = false
        bot.emit('autoeat_finished', bestFood, offhand)

        return true
    }

    bot.on('playerCollect', async (who) => {
        if (!bot.autoEat.options.checkOnItemPickup || who.username !== bot.username) return

        try {
            await bot.waitForTicks(1)
            await bot.autoEat.eat()
        } catch (error) {
            bot.emit('autoeat_error', error as Error)
        }
    })

    bot.on('health', async () => {
        try {
            await bot.autoEat.eat()
        } catch (error) {
            bot.emit('autoeat_error', error as Error)
        }
    })

    bot.on('spawn', () => {
        bot.autoEat.isEating = false
    })

    bot.on('death', () => {
        bot.autoEat.isEating = false
    })

    bot._client.on('entity_status', (packet: any) => {
        if (
            packet.entityId === bot.entity.id &&
            packet.entityStatus === 9 &&
            bot.autoEat.isEating
        ) {
            bot.autoEat.isEating = false
        }
    })
}
