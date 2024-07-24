const mineflayer = require('mineflayer')
const autoEat = require('../dist/index.js').plugin
const ms = require('ms')
const start = Date.now()

const bot = mineflayer.createBot({
    host: process.env.HOST,
    port: parseInt(process.env.PORT),
    username: 'autoeat',
    version: '1.18.2'
})

bot.loadPlugin(autoEat)

function log(message) {
    if (process.env.CI) console.log(`[${ms(Date.now() - start)}]`, message)
    else console.log(message)
}

function display(passed, message) {
    console.clear()

    const usingOffhand = bot.autoEat.options.useOffhand
    const currentItem =
        bot.inventory.slots[bot.getEquipmentDestSlot(usingOffhand ? 'off-hand' : 'hand')]

    log(`🍖 Item: ${currentItem ? currentItem.name : 'empty'}`)
    log(`🍗 Food: ${bot.food}`)
    log(`🍔 Saturation: ${Math.floor(bot.foodSaturation)}`)

    if (passed === undefined) return

    if (passed === true) {
        log(`✅ ${message}`)
        process.exit(0)
    } else {
        log(`❌ ${message}`)
        process.exit(1)
    }
}

bot.on('end', (reason) => {
    display(false, `Disconnected: ${reason}`)
})

bot.on('autoeat_error', (err) => {
    display(false, err.message)
})

bot.on('autoeat_started', (item) => {
    const priority = bot.autoEat.options.priority

    if (priority === 'foodPoints' && item.name === 'golden_carrot') {
        display(false, 'Priority is foodPoints but golden carrot is being eaten')
    } else if (priority === 'saturation' && item.name === 'cooked_beef') {
        display(false, 'Priority is saturation but cooked beef is being eaten')
    }
})

bot.on('autoeat_finished', async (item, offhand) => {
    await bot.waitForTicks(1)

    if (bot.autoEat.options.priority === 'saturation' && bot.foodSaturation < 14) {
        display(false, 'Saturation is too low')
    }

    display(true, `Finished eating ${item.name} in ${offhand ? 'offhand' : 'hand'}`)
})

bot.on('health', () => {
    display()

    if (bot.food < 10) display(false, 'Food went below 10')
})

bot.once('spawn', async () => {
    bot.autoEat.options.priority = 'saturation'
    bot.autoEat.options.startAt = 14

    bot.chat('/clear')
    bot.chat('/effect clear @s')
    bot.chat('/kill')

    await bot.waitForTicks(20)

    bot.chat('/give @s minecraft:cooked_beef 64')
    bot.chat('/give @s minecraft:golden_carrot 64')

    await bot.waitForTicks(20)

    const successful = await bot.autoEat.eat()

    if (successful) display(false, 'Eat function tried to eat while not hungry')

    bot.chat('/effect give @s resistance 100 255')
    bot.chat('/effect give @s regeneration 100 255')
    bot.chat('/effect give @s hunger 10000 100')
})
