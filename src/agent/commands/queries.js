import * as world from "../library/world.js";
import MCData from "../../utils/mcdata.js";

const pad = (str) => {
  return "\n" + str + "\n";
};

// queries are commands that just return strings and don't affect anything in the world
export const queryList = [
  {
    name: "!inventory",
    callable: false,
    description: "Get your bot's inventory.",
    perform: function (agent) {
      const armorSlots = {
        head: 5,
        torso: 6,
        legs: 7,
        feet: 8,
      };

      const mainInventoryStart = 9;
      const mainInventoryEnd = 35;

      const hotbarStart = 36;
      const hotbarEnd = 44;

      const offHandSlot = 45;
      let bot = agent.bot;
      let res = "INVENTORY";
      // Main Inventory
      res += "\nBackpack:";
      for (let i = mainInventoryStart; i <= mainInventoryEnd; i++) {
        let item = bot.inventory.slots[i];
        if (item) {
          res += `\n- ${item.name}: ${item.count}`;
        }
      }

      // Hotbar
      res += "\nHotbar:";
      for (let i = hotbarStart; i <= hotbarEnd; i++) {
        let item = bot.inventory.slots[i];
        if (item) {
          res += `\n- ${item.name}: ${item.count}`;
        }
      }

      // Off Hand Slot
      if (!bot.supportFeature("doesntHaveOffHandSlot")) {
        let offHandItem = bot.inventory.slots[offHandSlot];
        res += "\nOff Hand Slot:";
        if (offHandItem) {
          res += `\n- ${offHandItem.name}: ${offHandItem.count}`;
        } else {
          res += "\n- empty";
        }
      }

      // Armor Slots
      res += "\nArmor Slots:";
      for (const [slotName, slotIndex] of Object.entries(armorSlots)) {
        let item = bot.inventory.slots[slotIndex];
        res += `\n- ${slotName}: ${
          item ? `${item.name}: ${item.count}` : "empty"
        }`;
      }

      if (res === "INVENTORY") {
        res += ": none";
      } else if (agent.bot.game.gameMode === "creative") {
        res += "\n(You have infinite items in creative mode)";
      }

      return pad(res);
    },
  },
  {
    name: "!craftable",
    description: "Get the craftable items with the bot's inventory.",
    perform: function (agent) {
      const bot = agent.bot;
      const table = world.getNearestBlock(bot, "crafting_table");
      let res = "CRAFTABLE_ITEMS";
      for (const item of MCData.getInstance().getAllItems()) {
        let recipes = bot.recipesFor(item.id, null, 1, table);
        if (recipes.length > 0) {
          res += `\n- ${item.name}`;
        }
      }
      if (res == "CRAFTABLE_ITEMS") {
        res += ": none";
      }
      return pad(res);
    },
  },
  {
    name: "!modes",
    description: "Get all available modes and see which are on/off.",
    perform: function (agent) {
      return agent.bot.modes.getStr();
    },
  },
  {
    name: "!savedPlaces",
    description: "List all saved locations.",
    perform: async function (agent) {
      return "Saved place names: " + agent.memory_bank.getKeys();
    },
  },
  // --- Moved and Commented Queries ---
  /*
  {
    name: "!stats",
    callable: false,
    description: "Get your bot's location, health, hunger, and time of day.",
    perform: function (agent) {
      let bot = agent.bot;
      let res = "STATS";
      let pos = bot.entity?.position;
      if (!pos) return '';
      // display position to 2 decimal places
      res += `\n- Position: x: ${pos.x.toFixed(2)}, y: ${pos.y.toFixed(
        2
      )}, z: ${pos.z.toFixed(2)}`;
      res += `\n- Gamemode: ${bot.game.gameMode}`;
      res += `\n- Health: ${Math.round(bot.health)} / 20`;
      res += `\n- Hunger: ${Math.round(bot.food)} / 20`;
      res += `\n- Biome: ${world.getBiomeName(bot)}`;
      let weather = "Clear";
      if (bot.rainState > 0) weather = "Rain";
      if (bot.thunderState > 0) weather = "Thunderstorm";
      res += `\n- Weather: ${weather}`;
      // let block = bot.blockAt(pos);
      // res += `\n- Artficial light: ${block.skyLight}`;
      // res += `\n- Sky light: ${block.light}`;
      // light properties are bugged, they are not accurate

      if (bot.time.timeOfDay < 6000) {
        res += "\n- Time: Morning";
      } else if (bot.time.timeOfDay < 12000) {
        res += "\n- Time: Afternoon";
      } else {
        res += "\n- Time: Night";
      }

      let other_players = world.getNearbyPlayerNames(bot);
      if (other_players.length > 0) {
        res += "\n- Other Players: " + other_players.join(", ");
      }
      return pad(res);
    },
  },
  */
  /*
  {
    name: "!nearbyBlocks",
    description: "Get the blocks near the bot.",
    perform: function (agent) {
      let bot = agent.bot;
      let res = "NEARBY_BLOCKS";
      let blocks = world.getNearbyBlockTypes(bot);
      for (let i = 0; i < blocks.length; i++) {
        res += `\n- ${blocks[i]}`;
      }
      if (blocks.length == 0) {
        res += ": none";
      }

      return pad(res);
    },
  },
  */
  // {
  //   name: "!entities",
  //   description: "Get the nearby players and entities.",
  //   perform: function (agent) {
  //     let bot = agent.bot;
  //     let res = "NEARBY_ENTITIES";
  //     for (const entity of world.getNearbyPlayerNames(bot)) {
  //       res += `\n- player: ${entity}`;
  //     }
  //     for (const entity of world.getNearbyEntityTypes(bot)) {
  //       res += `\n- mob: ${entity}`;
  //     }
  //     if (res == "NEARBY_ENTITIES") {
  //       res += ": none";
  //     }
  //     return pad(res);
  //   },
  // },
];
