<h1 align="center">mineflayer-pvp</h1>
<p align="center"><i>A lightweight plugin for Mineflayer that makes it easier to manage PVP and PVE actions.</i></p>

<p align="center">
  <img src="https://github.com/TheDudeFromCI/mineflayer-plugin-template/workflows/Build/badge.svg" />
  <img src="https://img.shields.io/npm/v/mineflayer-pvp" />
  <img src="https://img.shields.io/github/repo-size/TheDudeFromCI/mineflayer-pvp" />
  <img src="https://img.shields.io/npm/dm/mineflayer-pvp" />
  <img src="https://img.shields.io/github/contributors/TheDudeFromCI/mineflayer-pvp" />
  <img src="https://img.shields.io/github/license/TheDudeFromCI/mineflayer-pvp" />
</p>

---

### Getting Started

This plugin is built using Node and can be installed using:
```bash
npm install --save mineflayer-pvp
```

**Plugin Dependencies**
These plugins must be loaded using `bot.loadPlugin` in order to use this plugin.

* [**mineflayer-pathfinder**](https://github.com/Karang/mineflayer-pathfinder)

### Simple Bot

The brief description goes here.

```js
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const pvp = require('mineflayer-pvp').plugin

const bot = mineflayer.createBot({ 'Guard' })

bot.loadPlugin(pathfinder)
bot.loadPlugin(pvp)

bot.on('chat', (username, message) => {
  if (message === 'fight me') {
    const player = bot.players[username]

    if (!player) {
      bot.chat("I can't see you.")
      return
    }

    bot.pvp.attack(player.entity)
  }

  if (message === 'stop') {
    bot.pvp.stop()
  }
})
```

### Documentation

[API](https://github.com/TheDudeFromCI/mineflayer-pvp/blob/master/docs/api.md)

[Examples](https://github.com/TheDudeFromCI/mineflayer-pvp/tree/master/examples)

**Video Tutorial:**

<a href="https://youtu.be/Giu0ADA5uo8"><img src="https://img.youtube.com/vi/Giu0ADA5uo8/hqdefault.jpg" width="256" /></a>

### License

This project uses the [MIT](https://github.com/TheDudeFromCI/mineflayer-pvp/blob/master/LICENSE) license.

### Contributions

This project is accepting PRs and Issues. See something you think can be improved? Go for it! Any and all help is highly appreciated!

For larger changes, it is recommended to discuss these changes in the issues tab before writing any code. It's also preferred to make many smaller PRs than one large one, where applicable.
