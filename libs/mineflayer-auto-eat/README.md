# Mineflayer Auto Eat

A comprehensive food management plugin for Mineflayer bots, with automatic eating capabilities.

## Features

- **Auto-detect and eat food** when hunger or health is low
- **Smart food selection** with multiple priority modes
- **Offhand support** for eating
- **Wastage minimization** to choose optimal food based on current hunger
- **Flexible configuration** for banned foods, thresholds, and behavior
- **Event driven** architecture with detailed events for custom handling
- **Full TypeScript support** with type definitions

## Installation

```bash
npm install mineflayer-auto-eat
```

## Basic Usage

```javascript
const mineflayer = require('mineflayer')
const autoEat = require('mineflayer-auto-eat')

const bot = mineflayer.createBot({
  host: 'localhost',
  username: 'Player',
})

// Load the plugin
bot.loadPlugin(autoEat)

// The plugin is enabled by default
// You can disable and re-enable as needed
bot.autoEat.disableAuto()
bot.autoEat.enableAuto()

// Listen to eating events
bot.on('autoeat_started', (item, offhand) => {
  console.log(`Started eating ${item.name} (offhand: ${offhand})`)
})

bot.on('autoeat_finished', (item, offhand) => {
  console.log(`Finished eating ${item.name}`)
})

bot.on('autoeat_error', (error) => {
  console.error(`Error while eating: ${error.message}`)
})

// Configure the plugin
bot.autoEat.setOpts({
  priority: 'foodPoints',  // 'foodPoints', 'saturation', 'effectiveQuality', 'saturationRatio', or 'auto'
  minHunger: 14,           // Eat when hunger reaches this level
  minHealth: 16,           // Use saturation-focused foods when health is below this level
  bannedFood: ['rotten_flesh', 'poisonous_potato']  // Foods to never eat
})

// Manually trigger eating
bot.autoEat.eat()
  .then(() => console.log('Finished eating'))
  .catch(err => console.error('Failed to eat:', err))
```

## Configuration Options

You can configure the plugin using `bot.autoEat.setOpts(options)` with these options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `priority` | string | `'auto'` | Food selection priority strategy ('foodPoints', 'saturation', 'effectiveQuality', 'saturationRatio', or 'auto') |
| `minHunger` | number | `15` | Minimum hunger level before eating |
| `minHealth` | number | `14` | Health threshold for prioritizing food with high saturation |
| `bannedFood` | string[] | `[...]` | Array of food item names to never eat |
| `returnToLastItem` | boolean | `true` | Re-equip previous item after eating |
| `offhand` | boolean | `false` | Use offhand for eating |
| `eatingTimeout` | number | `3000` | Milliseconds to wait before timing out an eating attempt |
| `strictErrors` | boolean | `true` | Whether to throw errors or just log them |
| `checkOnItemPickup` | boolean | `true` | Check if food should be eaten when picking up items |
| `chatNotifications` | boolean | `true` | Send chat messages when out of food |

## Advanced Usage

### Manual Eating with Options

```javascript
bot.autoEat.eat({
  food: 'cooked_beef',    // Item name, Item object, or foodId
  offhand: false,         // Whether to use offhand
  equipOldItem: true,     // Return to previous item after eating
  priority: 'saturation'  // Override default priority for this eat operation
})
```

### Customizing Events

```javascript
// Using the new EventEmitter API
bot.autoEat.on('eatStart', (opts) => {
  console.log(`Starting to eat ${opts.food.name}`)
})

bot.autoEat.on('eatFinish', (opts) => {
  console.log(`Finished eating ${opts.food.name}`)
})

bot.autoEat.on('eatFail', (error) => {
  console.error(`Eating failed: ${error.message}`)
})
```

## Migration from v4.x to v5.x

This plugin has been completely rewritten for v5.0, with major architectural improvements while maintaining backward compatibility.

### Important Changes

1. **Class-based architecture**: Now uses `EatUtil` class instead of attaching methods directly
2. **More robust event handling**: Both old and new event systems are supported
3. **Better typing**: Full TypeScript support with detailed interfaces
4. **Additional priority modes**: Added 'effectiveQuality' and 'saturationRatio' options
5. **Improved offhand support**: Better handling of offhand eating
6. **Smarter food selection**: Enhanced algorithms for choosing the best food

### Backwards Compatibility

- All v4.x methods still work through compatibility layers
- Old events are still emitted alongside new typed events
- Configuration options are preserved with the same defaults

## Advanced Features

### Food Wastage Minimization

The plugin can intelligently select food to minimize wastage, choosing food items that will fill your hunger bar efficiently rather than using high-value foods when not needed.

### Auto Priority Mode

When using `'auto'` priority (default), the plugin switches between:
- `foodPoints` optimization when health is good (above `minHealth`)
- `saturation` optimization when health is low (below `minHealth`)

This ensures optimal healing and hunger management depending on your bot's situation.

## License

MIT
