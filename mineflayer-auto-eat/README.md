<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

-   [mineflayer-auto-eat](#mineflayer-auto-eat)
    -   [Install](#install)
    -   [Example](#example)
    -   [API](#api)
        -   [Properties](#properties)
            -   [bot.autoEat.disabled](#botautoeatdisabled)
            -   [bot.autoEat.isEating](#botautoeatiseating)
            -   [bot.autoEat.options](#botautoeatoptions)
            -   [bot.autoEat.options.priority](#botautoeatoptionspriority)
            -   [bot.autoEat.options.startAt](#botautoeatoptionsstartat)
            -   [bot.autoEat.options.healthThreshold](#botautoeatoptionshealththreshold)
            -   [bot.autoEat.options.bannedFood](#botautoeatoptionsbannedfood)
            -   [bot.autoEat.options.ignoreInventoryCheck](#botautoeatoptionsignoreinventorycheck)
            -   [bot.autoEat.options.checkOnItemPickup](#botautoeatoptionscheckonitempickup)
            -   [bot.autoEat.options.eatingTimeout](#botautoeatoptionseatingtimeout)
            -   [bot.autoEat.options.useOffhand](#botautoeatoptionsuseoffhand)
            -   [bot.autoEat.options.equipOldItem](#botautoeatoptionsequipolditem)
        -   [Methods](#methods)
            -   [bot.autoEat.enable()](#botautoeatenable)
            -   [bot.autoEat.disable()](#botautoeatdisable)
            -   [bot.autoEat.eat()](#botautoeateat)
    -   [Author](#author)
    -   [Show your support](#show-your-support)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

<h1 align="center">mineflayer-auto-eat</h1>

![npm](https://img.shields.io/npm/v/mineflayer-auto-eat)
![npm bundle size](https://img.shields.io/bundlephobia/min/mineflayer-auto-eat)
![GitHub](https://img.shields.io/github/license/link-discord/mineflayer-auto-eat?color=red)

> Auto eat plugin for mineflayer

## Install

```sh
npm install mineflayer-auto-eat
```

## Example

```js
const mineflayer = require('mineflayer')
const autoeat = require('mineflayer-auto-eat').plugin

const bot = mineflayer.createBot({
    host: process.argv[2],
    port: process.argv[3],
    username: process.argv[4],
    password: process.argv[5]
})

bot.loadPlugin(autoeat)

bot.on('autoeat_started', (item, offhand) => {
    console.log(`Eating ${item.name} in ${offhand ? 'offhand' : 'hand'}`)
})

bot.on('autoeat_finished', (item, offhand) => {
    console.log(`Finished eating ${item.name} in ${offhand ? 'offhand' : 'hand'}`)
})

bot.on('autoeat_error', console.error)
```

## API

### Properties

#### bot.autoEat.disabled

Boolean value indicating whether auto eat is disabled or not.

#### bot.autoEat.isEating

Boolean value indicating whether the bot is currently eating or not.
This value should never be set manually.

#### bot.autoEat.options

Can be changed to change the settings for the auto eat plugin
(Should only be changed when the bot has spawned)

Example

```js
bot.once('spawn', () => {
    bot.autoEat.options.priority = 'auto'
    bot.autoEat.options.startAt = 14
    bot.autoEat.options.bannedFood.push('golden_apple')
})
```

#### bot.autoEat.options.priority

Acceptable Values are "saturation", "foodPoints" or "auto"

default: "auto"

#### bot.autoEat.options.startAt

If the bot has less or equal food points than this value, the bot will start eating

default: 16

#### bot.autoEat.options.healthThreshold

If the bot has less or equal health than this value and the bots priority is set to "auto",
the bot will prioritize eating food with the highest saturation value and it will temporarily set startAt to 19

#### bot.autoEat.options.bannedFood

The bot will not eat the items in the array.

default: pufferfish, spider_eye, poisonous_potato, rotten_flesh, chorus_fruit, chicken, suspicious_stew, golden_apple

#### bot.autoEat.options.ignoreInventoryCheck

Forces bot to disable inventory window click confirmation.
Related to [PrismarineJS/mineflayer#2030](https://github.com/PrismarineJS/mineflayer/issues/2030)

default: false

#### bot.autoEat.options.checkOnItemPickup

Attempts to eat food when the bot picks up an item and the bot reached the startAt threshold.

default: true

#### bot.autoEat.options.eatingTimeout

Timeout of food consumption. If eating takes too long, we're assuming that
it is finished after that time. Time in milliseconds, null or negative value means
"no timeout".

default: 3000

#### bot.autoEat.options.useOffhand

If true, the bot will use the offhand slot to eat food.

default: true

#### bot.autoEat.options.equipOldItem

If true, the bot will equip the previous item after eating.

default: true

### Methods

#### bot.autoEat.enable()

Calling this function will enable the plugin
(its enabled by default ofc)

#### bot.autoEat.disable()

Calling this function will disable the plugin

#### bot.autoEat.eat()

If you want to call the eat function manually
you can do it like this below

```js
bot.autoEat
    // Setting to true will use offhand slot
    .eat(true)
    .then((successful) => {
        console.log('Finished executing eating function', successful)
    })
    .catch((error) => {
        console.error(error)
    })
```

## Author

👤 **Link**

-   Github: [@link-discord](https://github.com/link-discord)
-   Twitter: [@link0069](https://twitter.com/link0069)
-   Discord: @link0069

## Show your support

Give a ⭐️ if this plugin helped you!
