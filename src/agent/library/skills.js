import MCData from "../../utils/mcdata.js";
import * as world from "./world.js";
import pf from "mineflayer-pathfinder";
import Vec3 from "vec3";
import { queryList } from "../commands/queries.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const NEAR_DISTANCE = 4.5;
const MID_DISTANCE = 8;
const FAR_DISTANCE = 32;
const VERY_FAR_DISTANCE = 128;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function log(bot, message, chat = false) {
  bot.output += message + "\n";
  if (chat) bot.chat(message);
}

async function autoLight(bot) {
  if (world.shouldPlaceTorch(bot)) {
    try {
      const pos = world.getPosition(bot);
      return await placeBlock(
        bot,
        "torch",
        pos.x,
        pos.y,
        pos.z,
        "bottom",
        true
      );
    } catch (err) {
      return false;
    }
  }
  return false;
}

async function equipHighestAttack(bot) {
  let weapons = bot.inventory
    .items()
    .filter(
      (item) =>
        item.name.includes("sword") ||
        (item.name.includes("axe") && !item.name.includes("pickaxe"))
    );
  if (weapons.length === 0)
    weapons = bot.inventory
      .items()
      .filter(
        (item) => item.name.includes("pickaxe") || item.name.includes("shovel")
      );
  if (weapons.length === 0) return;
  weapons.sort((a, b) => a.attackDamage < b.attackDamage);
  let weapon = weapons[0];
  if (weapon) await bot.equip(weapon, "hand");
}

export async function craftRecipe(bot, itemName, num = 1) {
  /**
   * Attempt to craft the given item name from a recipe. May craft many items.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} itemName, the item name to craft.
   * @returns {Promise<boolean>} true if the recipe was crafted, false otherwise.
   * @example
   * await skills.craftRecipe(bot, "stick");
   **/
  let placedTable = false;

  // get recipes that don't require a crafting table
  let recipes = bot.recipesFor(
    MCData.getInstance().getItemId(itemName),
    null,
    1,
    null
  );
  let craftingTable = null;
  if (!recipes || recipes.length === 0) {
    // Look for crafting table
    craftingTable = world.getNearestBlock(bot, "crafting_table", MID_DISTANCE);
    if (craftingTable === null) {
      // Try to place crafting table
      let hasTable = world.getInventoryCounts(bot)["crafting_table"] > 0;
      if (hasTable) {
        let pos = world.getNearestFreeSpace(bot, 1, 6);
        await placeBlock(bot, "crafting_table", pos.x, pos.y, pos.z);
        craftingTable = world.getNearestBlock(
          bot,
          "crafting_table",
          MID_DISTANCE
        );
        if (craftingTable) {
          recipes = bot.recipesFor(
            MCData.getInstance().getItemId(itemName),
            null,
            1,
            craftingTable
          );
          console.log(`Recipes for ${itemName} with crafting table:`, recipes);
          placedTable = true;
        }
      } else {
        log(bot, `You do not have a crafting table to craft ${itemName}.`);
        return false;
      }
    } else {
      recipes = bot.recipesFor(
        MCData.getInstance().getItemId(itemName),
        null,
        1,
        craftingTable
      );
    }
  }
  if (!recipes || recipes.length === 0) {
    const craftableItems = queryList
      .find((query) => query.name === "!craftable")
      .perform({ bot });
    log(
      bot,
      `You do not have the resources to craft ${itemName}. You can craft the following items: ${craftableItems}`
    );
    if (placedTable) {
      await collectBlock(bot, "crafting_table", 1);
    }
    return false;
  }

  const recipe = recipes[0];
  const actualNum = Math.ceil(num / recipe.result.count); // Adjust num based on recipe result count
  await bot.craft(recipe, actualNum, craftingTable);
  log(
    bot,
    `Successfully crafted ${itemName}, you now have ${
      world.getInventoryCounts(bot)[itemName]
    } ${itemName}.`
  );
  if (placedTable) {
    await collectBlock(bot, "crafting_table", 1);
  }
  return true;
}

export async function smeltItem(bot, itemName, num = 1) {
  /**
   * Puts 1 coal in furnace and smelts the given item name, waits until the furnace runs out of fuel or input items.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} itemName, the item name to smelt. Ores must contain "raw" like raw_iron.
   * @param {number} num, the number of items to smelt. Defaults to 1.
   * @returns {Promise<boolean>} true if the item was smelted, false otherwise. Fail
   * @example
   * await skills.smeltItem(bot, "raw_iron");
   * await skills.smeltItem(bot, "beef");
   **/
  const foods = [
    "beef",
    "chicken",
    "cod",
    "mutton",
    "porkchop",
    "rabbit",
    "salmon",
    "tropical_fish",
  ];
  if (!itemName.includes("raw") && !foods.includes(itemName)) {
    log(
      bot,
      `Cannot smelt ${itemName}, must be a "raw" item, like "raw_iron".`
    );
    return false;
  } // TODO: allow cobblestone, sand, clay, etc.

  let placedFurnace = false;
  let furnaceBlock = world.getNearestBlock(bot, "furnace", FAR_DISTANCE);
  if (!furnaceBlock) {
    // Try to place furnace
    let hasFurnace = world.getInventoryCounts(bot)["furnace"] > 0;
    if (hasFurnace) {
      let pos = world.getNearestFreeSpace(bot, 1, 6);
      await placeBlock(bot, "furnace", pos.x, pos.y, pos.z);
      furnaceBlock = world.getNearestBlock(bot, "furnace", MID_DISTANCE);
      placedFurnace = true;
    }
  }
  if (!furnaceBlock) {
    log(bot, `There is no furnace nearby and you have no furnace.`);
    return false;
  }

  // Move closer to the furnace if too far
  if (bot.entity.position.distanceTo(furnaceBlock.position) > NEAR_DISTANCE) {
    await goToPosition(
      bot,
      furnaceBlock.position.x,
      furnaceBlock.position.y,
      furnaceBlock.position.z,
      2
    );
  }

  await bot.lookAt(furnaceBlock.position);

  console.log("smelting...");
  const furnace = await bot.openFurnace(furnaceBlock);
  // check if the furnace is already smelting something
  let input_item = furnace.inputItem();
  if (
    input_item &&
    input_item.type !== MCData.getInstance().getItemId(itemName) &&
    input_item.count > 0
  ) {
    // TODO: check if furnace is currently burning fuel. furnace.fuel is always null, I think there is a bug.
    // This only checks if the furnace has an input item, but it may not be smelting it and should be cleared.
    log(
      bot,
      `The furnace is currently smelting ${MCData.getInstance().getItemName(
        input_item.type
      )}.`
    );
    if (placedFurnace) await collectBlock(bot, "furnace", 1);
    return false;
  }
  // check if the bot has enough items to smelt
  let inv_counts = world.getInventoryCounts(bot);
  if (!inv_counts[itemName] || inv_counts[itemName] < num) {
    log(bot, `You do not have enough ${itemName} to smelt.`);
    if (placedFurnace) await collectBlock(bot, "furnace", 1);
    return false;
  }

  // fuel the furnace
  if (!furnace.fuelItem()) {
    let fuel = bot.inventory
      .items()
      .find((item) => item.name === "coal" || item.name === "charcoal");
    let put_fuel = Math.ceil(num / 8);
    if (!fuel || fuel.count < put_fuel) {
      log(
        bot,
        `You do not have enough coal or charcoal to smelt ${num} ${itemName}, you need ${put_fuel} coal or charcoal`
      );
      if (placedFurnace) await collectBlock(bot, "furnace", 1);
      return false;
    }
    await furnace.putFuel(fuel.type, null, put_fuel);
    log(
      bot,
      `Added ${put_fuel} ${MCData.getInstance().getItemName(
        fuel.type
      )} to furnace fuel.`
    );
    console.log(
      `Added ${put_fuel} ${MCData.getInstance().getItemName(
        fuel.type
      )} to furnace fuel.`
    );
  }
  // put the items in the furnace
  await furnace.putInput(MCData.getInstance().getItemId(itemName), null, num);
  // wait for the items to smelt
  let total = 0;
  let collected_last = true;
  let smelted_item = null;
  await new Promise((resolve) => setTimeout(resolve, 200));
  while (total < num) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    console.log("checking...");
    let collected = false;
    if (furnace.outputItem()) {
      smelted_item = await furnace.takeOutput();
      if (smelted_item) {
        total += smelted_item.count;
        collected = true;
      }
    }
    if (!collected && !collected_last) {
      break; // if nothing was collected this time or last time
    }
    collected_last = collected;
    if (bot.interrupt_code) {
      break;
    }
  }

  if (placedFurnace) {
    await collectBlock(bot, "furnace", 1);
  }
  if (total === 0) {
    log(bot, `Failed to smelt ${itemName}.`);
    return false;
  }
  if (total < num) {
    log(
      bot,
      `Only smelted ${total} ${MCData.getInstance().getItemName(
        smelted_item.type
      )}.`
    );
    return false;
  }
  log(
    bot,
    `Successfully smelted ${itemName}, got ${total} ${MCData.getInstance().getItemName(
      smelted_item.type
    )}.`
  );
  return true;
}

export async function clearNearestFurnace(bot) {
  /**
   * Clears the nearest furnace of all items.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @returns {Promise<boolean>} true if the furnace was cleared, false otherwise.
   * @example
   * await skills.clearNearestFurnace(bot);
   **/
  let furnaceBlock = world.getNearestBlock(bot, "furnace", FAR_DISTANCE);
  if (!furnaceBlock) {
    log(bot, `There is no furnace nearby.`);
    return false;
  }

  // Move closer to the furnace if too far
  if (bot.entity.position.distanceTo(furnaceBlock.position) > NEAR_DISTANCE) {
    await goToPosition(
      bot,
      furnaceBlock.position.x,
      furnaceBlock.position.y,
      furnaceBlock.position.z,
      2
    );
  }

  console.log("clearing furnace...");
  const furnace = await bot.openFurnace(furnaceBlock);
  console.log("opened furnace...");
  // take the items out of the furnace
  let smelted_item, intput_item, fuel_item;
  if (furnace.outputItem()) smelted_item = await furnace.takeOutput();
  if (furnace.inputItem()) intput_item = await furnace.takeInput();
  if (furnace.fuelItem()) fuel_item = await furnace.takeFuel();
  console.log(smelted_item, intput_item, fuel_item);
  let smelted_name = smelted_item
    ? `${smelted_item.count} ${smelted_item.name}`
    : `0 smelted items`;
  let input_name = intput_item
    ? `${intput_item.count} ${intput_item.name}`
    : `0 input items`;
  let fuel_name = fuel_item
    ? `${fuel_item.count} ${fuel_item.name}`
    : `0 fuel items`;
  log(
    bot,
    `Cleared furnace, recieved ${smelted_name}, ${input_name}, and ${fuel_name}.`
  );
  return true;
}

export async function attackNearest(
  bot,
  mobType,
  kill = true,
  isPlayer = false
) {
  /**
   * Attack mob of the given type.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} mobType, the type of mob to attack.
   * @param {boolean} kill, whether or not to continue attacking until the mob is dead. Defaults to true.
   * @returns {Promise<boolean>} true if the mob was attacked, false if the mob type was not found.
   * @example
   * await skills.attackNearest(bot, "zombie", true);
   **/
  bot.modes.pause("cowardice");
  // Replaced getNearbyEntities with await getVisibleEntities
  const visibleEntities = await world.getVisibleEntities(bot); 
  let mob;
  if (isPlayer) {
    mob = visibleEntities.find(
      (entity) =>
        entity !== bot.entity &&
        entity.type === "player" &&
        entity.username === mobType
    );
  } else {
    mob = visibleEntities.find(
      (entity) => entity !== bot.entity && entity.name === mobType
    );
  }
  if (mob) {
    return await attackEntity(bot, mob, kill);
  }
  log(
    bot,
    `Could not find any ${
      isPlayer ? "player" : "mob"
    } named ${mobType} to attack.`
  );
  return false;
}

export async function attackEntity(bot, entity, kill = true) {
  /**
   * Attack mob of the given type.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {Entity} entity, the entity to attack.
   * @returns {Promise<boolean>} true if the entity was attacked, false if interrupted
   * @example
   * await skills.attackEntity(bot, entity);
   **/

  let pos = entity.position;
  console.log(bot.entity.position.distanceTo(pos));

  await equipHighestAttack(bot);

  if (!kill) {
    if (bot.entity.position.distanceTo(pos) > NEAR_DISTANCE) {
      console.log("moving to mob...");
      await goToPosition(bot, pos.x, pos.y, pos.z);
    }
    console.log("attacking mob...");
    await bot.attack(entity);
  } else {
    bot.pvp.attack(entity);
    // Need to await getVisibleEntities inside the loop condition
    while ((await world.getVisibleEntities(bot)).includes(entity)) { 
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (bot.interrupt_code) {
        bot.pvp.stop();
        return false;
      }
    }
    log(bot, `Successfully killed ${entity.name}.`);
    await pickupNearbyItems(bot);
    return true;
  }
}

export async function defendSelf(bot, range = 9) {
  /**
   * Defend yourself from all nearby hostile mobs until there are no more.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {number} range, the range to look for mobs. Defaults to 8.
   * @returns {Promise<boolean>} true if the bot found any enemies and has killed them, false if no entities were found.
   * @example
   * await skills.defendSelf(bot);
   * **/
  bot.modes.pause("self_defense");
  bot.modes.pause("cowardice");
  let attacked = false;
  let enemy = world.getNearestEntityWhere(
    bot,
    (entity) => MCData.getInstance().isHostile(entity) && entity.name !== "item",
    range
  );
  while (enemy) {
    await equipHighestAttack(bot);
    if (
      bot.entity.position.distanceTo(enemy.position) > NEAR_DISTANCE &&
      enemy.name !== "creeper" &&
      enemy.name !== "phantom"
    ) {
      try {
        bot.pathfinder.setMovements(new pf.Movements(bot));
        await bot.pathfinder.goto(new pf.goals.GoalFollow(enemy, 2), true);
      } catch (err) {
        /* might error if entity dies, ignore */
      }
    }
    bot.pvp.attack(enemy);
    attacked = true;
    await new Promise((resolve) => setTimeout(resolve, 500));
    enemy = world.getNearestEntityWhere(
      bot,
      (entity) => MCData.getInstance().isHostile(entity),
      range
    );
    if (bot.interrupt_code) {
      bot.pvp.stop();
      return false;
    }
  }
  bot.pvp.stop();
  if (attacked) log(bot, `Successfully defended self.`);
  else log(bot, `No enemies nearby to defend self from.`);
  return attacked;
}

export async function collectBlock(
  bot,
  blockType,
  num = 1,
  exclude = null,
  grownCropsOnly = false
) {
  /**
   * Collect one of the given block type.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} blockType, the type of block to collect.
   * @param {number} num, the number of blocks to collect. Defaults to 1.
   * @returns {Promise<boolean>} true if the block was collected, false if the block type was not found.
   * @example
   * await skills.collectBlock(bot, "oak_log");
   **/
  console.log(
    `Starting collectBlock with blockType: ${blockType}, num: ${num}, exclude: ${exclude}`
  );

  if (typeof num !== 'number') {
    log(bot, `Invalid type for num: ${typeof num}. Expected a number.`);
    return false;
  }

  if (num < 1) {
    log(bot, `Invalid number of blocks to collect: ${num}.`);
    return false;
  }

  const blockDropMap = {
    stone: ["cobblestone"],
    coal_ore: ["coal", "deepslate_coal_ore"],
    iron_ore: ["raw_iron", "deepslate_iron_ore"],
    gold_ore: ["raw_gold", "deepslate_gold_ore"],
    diamond_ore: ["diamond", "deepslate_diamond_ore"],
    redstone_ore: ["redstone", "deepslate_redstone_ore"],
    lapis_ore: ["lapis_lazuli", "deepslate_lapis_ore"],
    emerald_ore: ["emerald", "deepslate_emerald_ore"],
    nether_quartz_ore: ["quartz"],
    grass_block: ["dirt"],
    gravel: ["flint"],
    snow: ["snowball"],
    clay: ["clay_ball"],
    glowstone: ["glowstone_dust"],
    nether_gold_ore: ["gold_nugget"],
    ancient_debris: ["netherite_scrap"],
  };

  let blocktypes = [blockType];
  console.log(`Initial blocktypes: ${blocktypes}`);

  if (blockDropMap[blockType]) {
    blocktypes = [...blocktypes, ...blockDropMap[blockType]];
    console.log(`Updated blocktypes with blockDropMap: ${blocktypes}`);
  }

  for (const [block, drops] of Object.entries(blockDropMap)) {
    if (drops.includes(blockType)) {
      blocktypes.push(block);
    }
  }
  console.log(`Final blocktypes after checking drops: ${blocktypes}`);

  blocktypes = [...new Set(blocktypes)];
  console.log(`Unique blocktypes: ${blocktypes}`);

  let collected = 0;
  let retries = 0;

  console.log("Starting collect loop");

  const cropAgeMap = {
    wheat: 7,
    beetroot: 3,
    carrot: 7,
    potato: 7,
  };

  while (collected < num && retries < 3) {
    console.log(
      `Attempt ${retries + 1}: Collected ${collected}/${num} ${blockType}`
    );

    let blocks = world.getNearestBlocks(bot, blocktypes, VERY_FAR_DISTANCE);
    console.log(`Found ${blocks.length} blocks of type ${blockType}`);
    if (blocks.length === 0) {
      log(
        bot,
        `You collected ${collected} ${blockType}, and don't see more ${blockType} around`
      );
      return collected;
    }

    if (exclude) {
      for (let position of exclude) {
        blocks = blocks.filter(
          (block) =>
            block.position.x !== position.x ||
            block.position.y !== position.y ||
            block.position.z !== position.z
        );
      }
      console.log(`Excluded positions, ${blocks.length} blocks remaining`);
    }

    if (grownCropsOnly && cropAgeMap[blockType]) {
      blocks = blocks.filter(
        (block) => block._properties.age === cropAgeMap[blockType]
      );
    }

    const block = blocks[0];
    await bot.tool.equipForBlock(block);
    const itemId = bot.heldItem ? bot.heldItem.type : null;
    if (!block.canHarvest(itemId)) {
      log(bot, `Don't have right tools to harvest ${blockType}.`);
      return false;
    }

    try {
      await bot.collectBlock.collect(block);
      collected++;
    } catch (err) {
      console.log(
        `Error collecting block at ${block.position}: ${err.message}`
      );
      console.log("Stack trace:", err.stack);
      if (err.name === "NoChests") {
        log(
          bot,
          `Failed to collect ${blockType}: Inventory full, no place to deposit.`
        );
        break;
      } else {
        retries++;
        continue;
      }
    }

    if (bot.interrupt_code) break;
  }

  log(bot, `Collected ${collected} ${blockType}.`);
  return collected > 0;
}

export async function pickupNearbyItems(bot) {
  /**
   * Pick up all nearby items.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @returns {Promise<boolean>} true if the items were picked up, false otherwise.
   * @example
   * await skills.pickupNearbyItems(bot);
   **/
  const distance = MID_DISTANCE;
  const getNearestItem = (bot) =>
    bot.nearestEntity(
      (entity) =>
        entity.name === "item" &&
        bot.entity.position.distanceTo(entity.position) < distance
    );
  let nearestItem = getNearestItem(bot);
  let pickedUp = 0;
  while (nearestItem) {
    bot.pathfinder.setMovements(new pf.Movements(bot));
    await bot.pathfinder.goto(new pf.goals.GoalFollow(nearestItem, 0.8), true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    let prev = nearestItem;
    nearestItem = getNearestItem(bot);
    if (prev === nearestItem) {
      break;
    }
    pickedUp++;
  }
  log(bot, `Picked up ${pickedUp} items.`);
  return true;
}

export async function breakBlockAt(bot, x, y, z) {
  /**
   * Break the block at the given position. Will use the bot's equipped item.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {number} x, the x coordinate of the block to break.
   * @param {number} y, the y coordinate of the block to break.
   * @param {number} z, the z coordinate of the block to break.
   * @returns {Promise<boolean>} true if the block was broken, false otherwise.
   * @example
   * let position = world.getPosition(bot);
   * await skills.breakBlockAt(bot, position.x, position.y - 1, position.x);
   **/
  if (x == null || y == null || z == null)
    throw new Error("Invalid position to break block at.");
  let block = bot.blockAt(Vec3(x, y, z));
  if (block.name !== "air" && block.name !== "water" && block.name !== "lava") {
    if (bot.modes.isOn("cheat")) {
      let msg =
        "/setblock " +
        Math.floor(x) +
        " " +
        Math.floor(y) +
        " " +
        Math.floor(z) +
        " air";
      bot.chat(msg);
      log(bot, `Used /setblock to break block at ${x}, ${y}, ${z}.`);
      return true;
    }

    if (bot.entity.position.distanceTo(block.position) > NEAR_DISTANCE) {
      let pos = block.position;
      let movements = new pf.Movements(bot);
      movements.canPlaceOn = false;
      movements.allow1by1towers = false;
      bot.pathfinder.setMovements(movements);
      await bot.pathfinder.goto(
        new pf.goals.GoalNear(pos.x, pos.y, pos.z, NEAR_DISTANCE)
      );
    }
    if (bot.game.gameMode !== "creative") {
      await bot.tool.equipForBlock(block);
      const itemId = bot.heldItem ? bot.heldItem.type : null;
      if (!block.canHarvest(itemId)) {
        log(bot, `Don't have right tools to break ${block.name}.`);
        return false;
      }
    }
    await bot.dig(block, true);
    log(
      bot,
      `Broke ${block.name} at x:${x.toFixed(1)}, y:${y.toFixed(
        1
      )}, z:${z.toFixed(1)}.`
    );
  } else {
    log(
      bot,
      `Skipping block at x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(
        1
      )} because it is ${block.name}.`
    );
    return false;
  }
  return true;
}

export async function placeBlock(
  bot,
  blockType,
  x,
  y,
  z,
  placeOn = "bottom",
  dontCheat = false
) {
  /**
   * Place the given block type at the given position. It will build off from any adjacent blocks. Will fail if there is a block in the way or nothing to build off of.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} blockType, the type of block to place.
   * @param {number} x, the x coordinate of the block to place.
   * @param {number} y, the y coordinate of the block to place.
   * @param {number} z, the z coordinate of the block to place.
   * @param {string} placeOn, the preferred side of the block to place on. Can be 'top', 'bottom', 'north', 'south', 'east', 'west', or 'side'. Defaults to bottom. Will place on first available side if not possible.
   * @param {boolean} dontCheat, overrides cheat mode to place the block normally. Defaults to false.
   * @returns {Promise<boolean>} true if the block was placed, false otherwise.
   * @example
   * let p = world.getPosition(bot);
   * await skills.placeBlock(bot, "oak_log", p.x + 2, p.y, p.x);
   * await skills.placeBlock(bot, "torch", p.x + 1, p.y, p.x, 'side');
   **/
  if (!MCData.getInstance().getBlockId(blockType)) {
    log(bot, `Invalid block type: ${blockType}.`);
    return false;
  }

  const target_dest = new Vec3(Math.floor(x), Math.floor(y), Math.floor(z));
  if (bot.modes.isOn("cheat") && !dontCheat) {
    // invert the facing direction
    let face =
      placeOn === "north"
        ? "south"
        : placeOn === "south"
        ? "north"
        : placeOn === "east"
        ? "west"
        : "east";
    if (blockType.includes("torch") && placeOn !== "bottom") {
      // insert wall_ before torch
      blockType = blockType.replace("torch", "wall_torch");
      if (placeOn !== "side" && placeOn !== "top") {
        blockType += `[facing=${face}]`;
      }
    }
    if (blockType.includes("button") || blockType === "lever") {
      if (placeOn === "top") {
        blockType += `[face=ceiling]`;
      } else if (placeOn === "bottom") {
        blockType += `[face=floor]`;
      } else {
        blockType += `[facing=${face}]`;
      }
    }
    if (
      blockType === "ladder" ||
      blockType === "repeater" ||
      blockType === "comparator"
    ) {
      blockType += `[facing=${face}]`;
    }

    let msg =
      "/setblock " +
      Math.floor(x) +
      " " +
      Math.floor(y) +
      " " +
      Math.floor(z) +
      " " +
      blockType;
    bot.chat(msg);
    if (blockType.includes("door"))
      bot.chat(
        "/setblock " +
          Math.floor(x) +
          " " +
          Math.floor(y + 1) +
          " " +
          Math.floor(z) +
          " " +
          blockType +
          "[half=upper]"
      );
    if (blockType.includes("bed"))
      bot.chat(
        "/setblock " +
          Math.floor(x) +
          " " +
          Math.floor(y) +
          " " +
          Math.floor(z - 1) +
          " " +
          blockType +
          "[part=head]"
      );
    log(bot, `Used /setblock to place ${blockType} at ${target_dest}.`);
    return true;
  }

  let block = bot.inventory.items().find((item) => item.name === blockType);
  if (!block && bot.game.gameMode === "creative") {
    await bot.creative.setInventorySlot(
      36,
      MCData.getInstance().makeItem(blockType, 1)
    ); // 36 is first hotbar slot
    block = bot.inventory.items().find((item) => item.name === blockType);
  }
  if (!block) {
    log(bot, `Don't have any ${blockType} to place.`);
    return false;
  }

  const targetBlock = bot.blockAt(target_dest);
  if (targetBlock.name === blockType) {
    log(bot, `${blockType} already at ${targetBlock.position}.`);
    return false;
  }
  const empty_blocks = [
    "air",
    "water",
    "lava",
    "grass",
    "short_grass",
    "tall_grass",
    "snow",
    "dead_bush",
    "fern",
  ];
  if (!empty_blocks.includes(targetBlock.name)) {
    log(bot, `${blockType} in the way at ${targetBlock.position}.`);
    const removed = await breakBlockAt(bot, x, y, z);
    if (!removed) {
      log(
        bot,
        `Cannot place ${blockType} at ${targetBlock.position}: block in the way.`
      );
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 200)); // wait for block to break
  }
  // get the buildoffblock and facevec based on whichever adjacent block is not empty
  let buildOffBlock = null;
  let faceVec = null;
  const dir_map = {
    top: Vec3(0, 1, 0),
    bottom: Vec3(0, -1, 0),
    north: Vec3(0, 0, -1),
    south: Vec3(0, 0, 1),
    east: Vec3(1, 0, 0),
    west: Vec3(-1, 0, 0),
  };
  let dirs = [];
  if (placeOn === "side") {
    dirs.push(
      dir_map["north"],
      dir_map["south"],
      dir_map["east"],
      dir_map["west"]
    );
  } else if (dir_map[placeOn] !== undefined) {
    dirs.push(dir_map[placeOn]);
  } else {
    dirs.push(dir_map["bottom"]);
    log(bot, `Unknown placeOn value "${placeOn}". Defaulting to bottom.`);
  }
  dirs.push(...Object.values(dir_map).filter((d) => !dirs.includes(d)));

  for (let d of dirs) {
    const block = bot.blockAt(target_dest.plus(d));
    if (!empty_blocks.includes(block.name)) {
      buildOffBlock = block;
      faceVec = new Vec3(-d.x, -d.y, -d.z); // invert
      break;
    }
  }
  if (!buildOffBlock) {
    log(
      bot,
      `Cannot place ${blockType} at ${targetBlock.position}: nothing to place on.`
    );
    return false;
  }

  const pos = bot.entity.position;
  const pos_above = pos.plus(Vec3(0, 1, 0));
  const dont_move_for = [
    "torch",
    "redstone_torch",
    "redstone",
    "lever",
    "button",
    "rail",
    "detector_rail",
    "powered_rail",
    "activator_rail",
    "tripwire_hook",
    "tripwire",
    "water_bucket",
  ];
  if (
    !dont_move_for.includes(blockType) &&
    (pos.distanceTo(targetBlock.position) < 1 ||
      pos_above.distanceTo(targetBlock.position) < 1)
  ) {
    // too close
    let goal = new pf.goals.GoalNear(
      targetBlock.position.x,
      targetBlock.position.y,
      targetBlock.position.z,
      2
    );
    let inverted_goal = new pf.goals.GoalInvert(goal);
    bot.pathfinder.setMovements(new pf.Movements(bot));
    await bot.pathfinder.goto(inverted_goal);
  }
  if (bot.entity.position.distanceTo(targetBlock.position) > NEAR_DISTANCE) {
    // too far
    let pos = targetBlock.position;
    let movements = new pf.Movements(bot);
    bot.pathfinder.setMovements(movements);
    await bot.pathfinder.goto(
      new pf.goals.GoalNear(pos.x, pos.y, pos.z, NEAR_DISTANCE)
    );
  }

  await bot.equip(block, "hand");
  await bot.lookAt(buildOffBlock.position);

  // will throw error if an entity is in the way, and sometimes even if the block was placed
  try {
    await bot.placeBlock(buildOffBlock, faceVec);
    log(bot, `Successfully placed ${blockType} at ${target_dest}.`);
    await new Promise((resolve) => setTimeout(resolve, 200));
    return true;
  } catch (err) {
    log(bot, `Failed to place ${blockType} at ${target_dest}.`);
    return false;
  }
}

export async function equip(bot, itemName, bodyPart) {
  /**
   * Equip the given item to the given body part, like tools or armor.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} itemName, the item or block name to equip.
   * @param {string} bodyPart, the body part to equip the item to.
   * @returns {Promise<boolean>} true if the item was equipped, false otherwise.
   * @example
   * await skills.equip(bot, "iron_pickaxe", "hand");
   * await skills.equip(bot, "diamond_chestplate", "torso");
   **/
  let item = bot.inventory.items().find((item) => item.name === itemName);
  if (!item) {
    log(bot, `You do not have any ${itemName} to equip.`);
    return false;
  }
  await bot.equip(item, bodyPart);
  return true;
}

export async function discard(bot, itemName, num = -1) {
  /**
   * Discard the given item.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} itemName, the item or block name to discard.
   * @param {number} num, the number of items to discard. Defaults to -1, which discards all items.
   * @returns {Promise<boolean>} true if the item was discarded, false otherwise.
   * @example
   * await skills.discard(bot, "oak_log");
   **/
  let discarded = 0;
  while (true) {
    let item = bot.inventory.items().find((item) => item.name === itemName);
    if (!item) {
      break;
    }
    let to_discard =
      num === -1 ? item.count : Math.min(num - discarded, item.count);
    await bot.toss(item.type, null, to_discard);
    discarded += to_discard;
    if (num !== -1 && discarded >= num) {
      break;
    }
  }
  if (discarded === 0) {
    log(bot, `You do not have any ${itemName} to discard.`);
    return false;
  }
  log(bot, `Successfully discarded ${discarded} ${itemName}.`);
  return true;
}

export async function eat(bot, foodName = "") {
  /**
   * Eat the given item. If no item is given, it will eat the first food item in the bot's inventory.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} item, the item to eat.
   * @returns {Promise<boolean>} true if the item was eaten, false otherwise.
   * @example
   * await skills.eat(bot, "apple");
   **/
  let item, name;
  if (foodName) {
    item = bot.inventory.items().find((item) => item.name === foodName);
    name = foodName;
  } else {
    item = bot.inventory.items().find((item) => item.foodRecovery > 0);
    name = "food";
  }
  if (!item) {
    log(bot, `You do not have any ${name} to eat.`);
    return false;
  }
  await bot.equip(item, "hand");
  await bot.consume();
  log(bot, `Successfully ate ${item.name}.`);
  return true;
}

export async function giveToPlayer(bot, username, items) {
  /**
   * Give the specified items to the given player.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @param {string} username - The name of the player to give the items to.
   * @param {string} items - The items to give in the format 'item1:quantity1,item2:quantity2,...'.
   * @returns {Promise<boolean>} true if the items were given, false otherwise.
   * @example
   * await skills.giveToPlayer(bot, "player_name", "oak_log:10,stone:5");
   **/
  const itemsList = items
    .split(",")
    .map((item) => {
      const [name, quantity] = item.split(":");
      if (!name || isNaN(quantity)) {
        log(
          bot,
          `Invalid items format. Use 'item1:quantity1,item2:quantity2,...'`
        );
        return null;
      }
      return { name, quantity: parseInt(quantity, 10) };
    })
    .filter((item) => item !== null);

  let player = bot.players[username].entity;
  if (!player) {
    log(bot, `Could not find ${username}.`);
    return false;
  }
  await goToPlayer(bot, username);
  await bot.lookAt(player.position);
  for (const { name, quantity } of itemsList) {
    await discard(bot, name, quantity);
  }
  return true;
}

export async function goToPosition(bot, x, y, z, min_distance = 2) {
  /**
   * Navigate to the given position.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {number} x, the x coordinate to navigate to. If null, the bot's current x coordinate will be used.
   * @param {number} y, the y coordinate to navigate to. If null, the bot's current y coordinate will be used.
   * @param {number} z, the z coordinate to navigate to. If null, the bot's current z coordinate will be used.
   * @param {number} distance, the distance to keep from the position. Defaults to 2.
   * @returns {Promise<boolean>} true if the position was reached, false otherwise.
   * @example
   * let position = world.world.getNearestBlock(bot, "oak_log", 64).position;
   * await skills.goToPosition(bot, position.x, position.y, position.x + 20);
   **/
  if (x == null || y == null || z == null) {
    log(bot, `Missing coordinates, given x:${x} y:${y} z:${z}`);
    return false;
  }
  if (bot.modes.isOn("cheat")) {
    bot.chat("/tp @s " + x + " " + y + " " + z);
    log(bot, `Teleported to ${x}, ${y}, ${z}.`);
    return true;
  }
  bot.pathfinder.setMovements(new pf.Movements(bot));
  await bot.pathfinder.goto(new pf.goals.GoalNear(x, y, z, min_distance));
  log(bot, `You have reached at ${x}, ${y}, ${z}.`);
  return true;
}

export async function goToPlayer(bot, username, distance = 1) {
  /**
   * Navigate to the given player.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} username, the username of the player to navigate to.
   * @param {number} distance, the goal distance to the player.
   * @returns {Promise<boolean>} true if the player was found, false otherwise.
   * @example
   * await skills.goToPlayer(bot, "player");
   **/

  if (bot.modes.isOn("cheat")) {
    bot.chat("/tp @s " + username);
    log(bot, `Teleported to ${username}.`);
    return true;
  }

  bot.modes.pause("self_defense");
  bot.modes.pause("cowardice");
  let player = bot.players[username]?.entity;
  if (!player) {
    log(
      bot,
      `${username} is too far for me to detect. Ask if player wants me to teleport directly, or press F3 and tell me your coordinates in chat.`
    );
    return false;
  }

  const move = new pf.Movements(bot);
  bot.pathfinder.setMovements(move);
  await bot.pathfinder.goto(new pf.goals.GoalFollow(player, distance), true);

  log(bot, `You have reached ${username}.`);
}

export async function teleportToPlayer(bot, username) {
  /**
   * Teleport to the given player.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} username, the username of the player to teleport to.
   * @returns {Promise<boolean>} true if the player was found and teleported to, false otherwise.
   * @example
   * await skills.teleportToPlayer(bot, "player");
   **/
  bot.chat("/tp @s " + username);
  await new Promise((resolve) => setTimeout(resolve, 500)); // wait for tp to complete
  let player = bot.players[username]?.entity;
  if (!player) {
    log(bot, `username ${username} incorrect, player not found.`);
    return false;
  }
  if (
    bot.entity.position.distanceTo(player.position) <= NEAR_DISTANCE
  ) {
    log(bot, `Teleported to ${username}.`);
    return true;
  } else {
    log(bot, "Cannot teleport, is cheats on?");
    return false;
  }
}

export async function followPlayer(bot, username, distance = 4) {
  /**
   * Follow the given player endlessly. Will not return until the code is manually stopped.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} username, the username of the player to follow.
   * @returns {Promise<boolean>} true if the player was found, false otherwise.
   * @example
   * await skills.followPlayer(bot, "player");
   **/
  let player = bot.players[username].entity;
  if (!player) return false;

  const move = new pf.Movements(bot);
  bot.pathfinder.setMovements(move);
  bot.pathfinder.setGoal(new pf.goals.GoalFollow(player, distance), true);
  log(bot, `You are now actively following player ${username}.`);

  while (!bot.interrupt_code) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return true;
}

export async function moveAway(bot, distance) {
  /**
   * Move away from current position in any direction.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {number} distance, the distance to move away.
   * @returns {Promise<boolean>} true if the bot moved away, false otherwise.
   * @example
   * await skills.moveAway(bot, 8);
   **/
  const pos = bot.entity.position;
  let goal = new pf.goals.GoalNear(pos.x, pos.y, pos.z, distance);
  let inverted_goal = new pf.goals.GoalInvert(goal);
  bot.pathfinder.setMovements(new pf.Movements(bot));

  if (bot.modes.isOn("cheat")) {
    const path = await bot.pathfinder.getPathTo(move, inverted_goal, 10000);
    let last_move = path.path[path.path.length - 1];
    console.log(last_move);
    if (last_move) {
      let x = Math.floor(last_move.x);
      let y = Math.floor(last_move.y);
      let z = Math.floor(last_move.z);
      bot.chat("/tp @s " + x + " " + y + " " + z);
      return true;
    }
  }

  await bot.pathfinder.goto(inverted_goal);
  let new_pos = bot.entity.position;
  log(bot, `Moved away from nearest entity to ${new_pos}.`);
  return true;
}

export async function avoidEnemies(bot, distance = 16) {
  /**
   * Move a given distance away from all nearby enemy mobs.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {number} distance, the distance to move away.
   * @returns {Promise<boolean>} true if the bot moved away, false otherwise.
   * @example
   * await skills.avoidEnemies(bot, 8);
   **/
  bot.modes.pause("self_preservation"); // prevents damage-on-low-health from interrupting the bot
  let enemy = world.getNearestEntityWhere(
    bot,
    (entity) => MCData.getInstance().isHostile(entity),
    distance
  );
  while (enemy) {
    const follow = new pf.goals.GoalFollow(enemy, distance + 1); // move a little further away
    const inverted_goal = new pf.goals.GoalInvert(follow);
    bot.pathfinder.setMovements(new pf.Movements(bot));
    bot.pathfinder.setGoal(inverted_goal, true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    enemy = world.getNearestEntityWhere(
      bot,
      (entity) => MCData.getInstance().isHostile(entity),
      distance
    );
    if (bot.interrupt_code) {
      break;
    }
  }
  bot.pathfinder.stop();
  log(bot, `Moved ${distance} away from enemies.`);
  return true;
}

export async function stay(bot) {
  /**
   * Stay in the current position until interrupted. Disables all modes.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @returns {Promise<boolean>} true if the bot stayed, false otherwise.
   * @example
   * await skills.stay(bot);
   **/
  bot.modes.pause("self_preservation");
  bot.modes.pause("cowardice");
  bot.modes.pause("self_defense");
  bot.modes.pause("hunting");
  bot.modes.pause("torch_placing");
  bot.modes.pause("item_collecting");
  while (!bot.interrupt_code) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return true;
}

export async function useDoor(bot, door_pos = null) {
  /**
   * Use the door at the given position.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {Vec3} door_pos, the position of the door to use. If null, the nearest door will be used.
   * @returns {Promise<boolean>} true if the door was used, false otherwise.
   * @example
   * let door = world.getNearestBlock(bot, "oak_door", 16).position;
   * await skills.useDoor(bot, door);
   **/
  if (!door_pos) {
    for (let door_type of [
      "oak_door",
      "spruce_door",
      "birch_door",
      "jungle_door",
      "acacia_door",
      "dark_oak_door",
      "mangrove_door",
      "cherry_door",
      "bamboo_door",
      "crimson_door",
      "warped_door",
    ]) {
      door_pos = world.getNearestBlock(bot, door_type, 16).position;
      if (door_pos) break;
    }
  } else {
    door_pos = Vec3(door_pos.x, door_pos.y, door_pos.z);
  }
  if (!door_pos) {
    log(bot, `Could not find a door to use.`);
    return false;
  }

  bot.pathfinder.setGoal(
    new pf.goals.GoalNear(door_pos.x, door_pos.y, door_pos.z, 1)
  );
  await new Promise((resolve) => setTimeout(resolve, 1000));
  while (bot.pathfinder.isMoving()) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  let door_block = bot.blockAt(door_pos);
  await bot.lookAt(door_pos);
  if (!door_block._properties.open) await bot.activateBlock(door_block);

  bot.setControlState("forward", true);
  await new Promise((resolve) => setTimeout(resolve, 600));
  bot.setControlState("forward", false);
  await bot.activateBlock(door_block);

  log(bot, `Used door at ${door_pos}.`);
  return true;
}

export async function goToBed(bot) {
  /**
   * Tries to sleep in the nearest available bed.
   * Will iterate through nearby beds if the first one fails.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @returns {Promise<boolean>} true if the bot successfully slept, false otherwise.
   * @example
   * await skills.goToBed(bot);
   **/
  const beds = bot.findBlocks({
    matching: (block) => block.name.includes("bed"),
    maxDistance: 32,
    count: 10, // Find up to 10 nearby beds
  });

  if (beds.length === 0) {
    log(bot, `Could not find any beds nearby to sleep in.`);
    return false;
  }

  for (const loc of beds) {
    const bedPosition = loc; // findBlocks returns Vec3 positions directly

    // Check distance and navigate if necessary
    if (bot.entity.position.distanceTo(bedPosition) > NEAR_DISTANCE) {
      try {
        await goToPosition(bot, bedPosition.x, bedPosition.y, bedPosition.z, 1); // Aim close
      } catch (navErr) {
        console.log(`Failed to navigate to bed at ${bedPosition}: ${navErr.message}, ${navErr.stack}. Trying next bed.`);
        continue; // Skip to the next bed if navigation fails
      }
    }
      
    // Now attempt to use the bed (outer try for sleep-related errors)
    try {
      const bed = bot.blockAt(bedPosition);
      if (!bed || !bed.name.includes('bed')) { // Double-check block exists
          continue;
      }

      // Attempt to sleep
      await bot.sleep(bed);
      log(bot, `Successfully entered bed at ${bedPosition}.`);
      
      // Wait until woken up
      while (bot.isSleeping) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (bot.interrupt_code) {
           log(bot, "Sleep interrupted.");
           // Might need to wake up manually if interrupted? Mineflayer usually handles this.
           return false; // Indicate interruption
        }
      }
      log(bot, `You have woken up.`);
      return true; // Successfully slept and woke up

    } catch (err) {
      log(bot, `Could not use bed at ${bedPosition}: ${err.message}. Trying next bed...`);
      // Optional: Check for specific errors like occupied, monsters nearby, daytime
    }
    
    if (bot.interrupt_code) {
        log(bot, "goToBed sequence interrupted.");
        return false;
    }
  }

  // If loop finishes without returning true
  log(bot, "Tried all nearby beds, but could not sleep in any.");
  return false;
}

export async function goIntoNetherPortal(bot) {
  /**
   * Finds the nearest Nether portal block and walks into its space.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @returns {Promise<boolean>} true if the bot reached the portal block's coordinates, false otherwise.
   */
  const portalBlock = world.getNearestBlock(bot, "nether_portal", MID_DISTANCE);

  if (!portalBlock) {
    log(bot, "Could not find a Nether Portal nearby.");
    return false;
  }

  log(bot, `Found Nether Portal at ${portalBlock.position}. Moving into it...`);

  const goal = new pf.goals.GoalBlock(portalBlock.position.x, portalBlock.position.y, portalBlock.position.z);
  bot.pathfinder.setMovements(new pf.Movements(bot));

  try {
    await bot.pathfinder.goto(goal);
    // Once the bot reaches the goal coordinates, it should be inside the portal
    // The game handles the teleportation delay.
    log(bot, "Entered Nether Portal block space. Waiting for teleportation...");
    return true; // Indicates the bot reached the portal coordinates
  } catch (err) {
    log(bot, `Failed to move into the Nether Portal: ${err.message}`);
    return false;
  }
}

export async function goIntoEndPortal(bot) {
  /**
   * Finds the nearest End portal block and walks into its space.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @returns {Promise<boolean>} true if the bot reached the portal block's coordinates, false otherwise.
   */
  const portalBlock = world.getNearestBlock(bot, "end_portal", MID_DISTANCE);

  if (!portalBlock) {
    log(bot, "Could not find an End Portal nearby.");
    return false;
  }

  log(bot, `Found End Portal at ${portalBlock.position}. Moving into it...`);

  const goal = new pf.goals.GoalBlock(portalBlock.position.x, portalBlock.position.y, portalBlock.position.z);
  bot.pathfinder.setMovements(new pf.Movements(bot));

  try {
    await bot.pathfinder.goto(goal);
    log(bot, "Entered End Portal block space. Waiting for teleportation...");
    return true;
  } catch (err) {
    log(bot, `Failed to move into the End Portal: ${err.message}`);
    return false;
  }
}

export async function tillAndSow(bot, x, y, z, seedType = null) {
  /**
   * Till the ground at the given position and plant the given seed type.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {number} x, the x coordinate to till.
   * @param {number} y, the y coordinate to till.
   * @param {number} z, the z coordinate to till.
   * @param {string} plantType, the type of plant to plant. Defaults to none, which will only till the ground.
   * @returns {Promise<boolean>} true if the ground was tilled, false otherwise.
   * @example
   * let position = world.getPosition(bot);
   * await skills.till(bot, position.x, position.y - 1, position.x);
   **/
  console.log(x, y, z);
  x = Math.round(x);
  y = Math.round(y);
  z = Math.round(z);
  let block = bot.blockAt(new Vec3(x, y, z));
  console.log(x, y, z);
  if (
    block.name !== "grass_block" &&
    block.name !== "dirt" &&
    block.name !== "farmland"
  ) {
    log(bot, `Cannot till ${block.name}, must be grass_block or dirt.`);
    return false;
  }
  let above = bot.blockAt(new Vec3(x, y + 1, z));
  if (above.name !== "air") {
    log(bot, `Cannot till, there is ${above.name} above the block.`);
    return false;
  }
  // if distance is too far, move to the block
  if (bot.entity.position.distanceTo(block.position) > NEAR_DISTANCE) {
    let pos = block.position;
    bot.pathfinder.setMovements(new pf.Movements(bot));
    await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 4));
  }
  if (block.name !== "farmland") {
    let hoe = bot.inventory.items().find((item) => item.name.includes("hoe"));
    if (!hoe) {
      log(bot, `Cannot till, no hoes.`);
      return false;
    }
    await bot.equip(hoe, "hand");
    await bot.activateBlock(block);
    log(
      bot,
      `Tilled block x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)}.`
    );
  }

  if (seedType) {
    if (seedType.endsWith("seed") && !seedType.endsWith("seeds"))
      seedType += "s"; // fixes common mistake
    let seeds = bot.inventory.items().find((item) => item.name === seedType);
    if (!seeds) {
      log(bot, `No ${seedType} to plant.`);
      return false;
    }
    await bot.equip(seeds, "hand");

    await bot.placeBlock(block, new Vec3(0, -1, 0));
    log(
      bot,
      `Planted ${seedType} at x:${x.toFixed(1)}, y:${y.toFixed(
        1
      )}, z:${z.toFixed(1)}.`
    );
  }
  return true;
}

export async function activateNearestBlock(bot, type) {
  /**
   * Activate the nearest block of the given type.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} type, the type of block to activate.
   * @returns {Promise<boolean>} true if the block was activated, false otherwise.
   * @example
   * await skills.activateNearestBlock(bot, "lever");
   * **/
  let block = world.getNearestBlock(bot, type, 16);
  if (!block) {
    log(bot, `Could not find any ${type} to activate.`);
    return false;
  }
  if (bot.entity.position.distanceTo(block.position) > NEAR_DISTANCE) {
    let pos = block.position;
    bot.pathfinder.setMovements(new pf.Movements(bot));
    await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 4));
  }
  await bot.activateBlock(block);
  log(
    bot,
    `Activated ${type} at x:${block.position.x.toFixed(
      1
    )}, y:${block.position.y.toFixed(1)}, z:${block.position.z.toFixed(1)}.`
  );
  return true;
}

export async function activateItem(bot, offHand = false) {
  /**
   * Activates the currently held item.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {boolean} offHand, whether to activate the item in the off hand. Defaults to false (main hand).
   * @returns {Promise<boolean>} true if the item was activated, false if there was an error.
   * @example
   * await skills.activateItem(bot);
   * await skills.activateItem(bot, true); // activate off-hand item
   **/
  try {
    // TODO: not working for spawn eggs
    await bot.activateItem(offHand);
    const handName = offHand ? "off hand" : "main hand";
    log(bot, `Activated item in ${handName}.`);
    return true;
  } catch (error) {
    log(bot, `Failed to activate item: ${error.message}`);
    return false;
  }
}

export async function activateNearestEntity(bot, entityType) {
  /**
   * Activate the nearest entity of the given type.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} entityType, the type of entity to activate.
   * @returns {Promise<boolean>} true if the entity was activated, false otherwise.
   * @example
   * await skills.activateNearestEntity(bot, "villager");
   **/
  let entity = world.getNearestEntityWhere(
    bot,
    (entity) => entity.name === entityType,
    16
  );
  if (!entity) {
    log(bot, `Could not find any ${entityType} to activate.`);
    return false;
  }
  if (entity === bot.vehicle) {
    log(bot, `Already riding the nearest ${entityType}.`);
    return false;
  }
  if (bot.entity.position.distanceTo(entity.position) > NEAR_DISTANCE) {
    let pos = entity.position;
    bot.pathfinder.setMovements(new pf.Movements(bot));
    await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 4));
  }
  await bot.activateEntity(entity);
  log(
    bot,
    `Activated ${entityType} at x:${entity.position.x.toFixed(
      1
    )}, y:${entity.position.y.toFixed(1)}, z:${entity.position.z.toFixed(1)}.`
  );
  return true;
}

export async function useItemOnEntity(bot, entityName, itemName) {
  /**
   * Uses the specified item on the specified entity.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} entityName, the name of the entity to use the item on.
   * @param {string} itemName, the name of the item to use.
   * @returns {Promise<boolean>} true if the item was used on the entity, false otherwise.
   * @example
   * await skills.useItemOnEntity(bot, "cow", "wheat");
   **/
  if (!entityName) {
    log(bot, `No target entity specified.`);
    return false;
  }

  // Replaced getNearbyEntities with await getVisibleEntities
  const visibleEntities = await world.getVisibleEntities(bot);
  const targetEntity = visibleEntities.find((e) => e.name === entityName);
  if (!targetEntity) {
    // Get names from visibleEntities, not nearbyEntities
    const visibleEntityNames = visibleEntities.map((e) => e.name || e.username || `ID ${e.id}`).join(", ");
    log(
      bot,
      `${entityName} does not exist nearby. Visible entities: ${visibleEntityNames}`
    );
    return false;
  }

  const item = bot.inventory.items().find((item) => item.name === itemName);
  if (!item) {
    const inventoryItems = bot.inventory
      .items()
      .map((i) => i.name)
      .join(", ");
    log(
      bot,
      `No ${itemName} found in inventory. Inventory contains: ${inventoryItems}`
    );
    return false;
  }

  // Ensure the bot is close enough to the target entity
  const distance = bot.entity.position.distanceTo(targetEntity.position);
  if (distance > NEAR_DISTANCE) {
    log(bot, `Target entity is too far away, moving closer...`);
    const move = new pf.Movements(bot);
    bot.pathfinder.setMovements(move);
    await bot.pathfinder.goto(new pf.goals.GoalFollow(targetEntity, 2));
  }

  // Ensure the bot is looking at the target entity
  await bot.lookAt(targetEntity.position);

  try {
    await bot.equip(item, "hand");
    await bot.useOn(targetEntity);
    log(bot, `Successfully used ${itemName} on ${entityName}.`);
    return true;
  } catch (err) {
    log(bot, `Failed to use ${itemName} on ${entityName}: ${err.message}`);
    return false;
  }
}

export async function lookInChest(bot) {
  /**
   * Look in the nearest chest and log its contents.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @returns {Promise<boolean>} true if the chest contents were logged, false if no chest was found.
   * @example
   * await skills.lookInChest(bot);
   */
  const chestToOpen = bot.findBlock({
    matching: bot.registry.blocksByName.chest.id,
    maxDistance: FAR_DISTANCE,
  });

  if (!chestToOpen) {
    log(bot, "No chest found nearby.");
    return false;
  }

  // Move closer to the chest if too far
  if (bot.entity.position.distanceTo(chestToOpen.position) > NEAR_DISTANCE) {
    await goToPosition(
      bot,
      chestToOpen.position.x,
      chestToOpen.position.y,
      chestToOpen.position.z,
      2
    );
  }

  const chest = await bot.openContainer(chestToOpen);
  const itemsInChest = chest
    .containerItems()
    .map((item) => `${item.name} x${item.count}`);

  if (itemsInChest.length === 0) {
    log(bot, "The chest is empty.");
  } else {
    log(bot, "Chest contents:");
    itemsInChest.forEach((item) => log(bot, `- ${item}`));
  }

  chest.close();
  return true;
}

export async function depositToChest(bot, items) {
  /**
   * Deposit the specified items into the nearest chest.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @param {string} items - The items to deposit in the format 'item1:quantity1,item2:quantity2,...'.
   * @returns {Promise<boolean>} true if the items were deposited, false otherwise.
   * @example
   * await skills.depositToChest(bot, "oak_log:10,stone:5");
   **/
  const itemsList = items
    .split(",")
    .map((item) => {
      const [name, quantity] = item.split(":");
      if (!name || isNaN(quantity)) {
        log(
          bot,
          `Invalid items format. Use 'item1:quantity1,item2:quantity2,...'`
        );
        return null;
      }
      return { name, quantity: parseInt(quantity, 10) };
    })
    .filter((item) => item !== null);

  const chestToOpen = bot.findBlock({
    matching: bot.registry.blocksByName.chest.id,
    maxDistance: FAR_DISTANCE,
  });

  if (!chestToOpen) {
    log(bot, "No chest found");
    return false;
  }

  if (bot.entity.position.distanceTo(chestToOpen.position) > NEAR_DISTANCE) {
    await goToPosition(
      bot,
      chestToOpen.position.x,
      chestToOpen.position.y,
      chestToOpen.position.z,
      2
    );
  }

  const chest = await bot.openContainer(chestToOpen);
  for (const { name, quantity } of itemsList) {
    const item = bot.inventory.items().find((item) => item.name === name);
    if (!item) {
      log(bot, `You do not have any ${name} to deposit.`);
      continue;
    }
    try {
      await chest.deposit(item.type, null, quantity);
      log(bot, `Deposited ${quantity} ${name}`);
    } catch (err) {
      log(bot, `Unable to deposit ${quantity} ${name}`);
    }
  }
  chest.close();
  return true;
}

export async function withdrawFromChest(bot, items) {
  /**
   * Withdraw the specified items from the nearest chest.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @param {string} items - The items to withdraw in the format 'item1:quantity1,item2:quantity2,...'.
   * @returns {Promise<boolean>} true if the items were withdrawn, false otherwise.
   * @example
   * await skills.withdrawFromChest(bot, "oak_log:10,stone:5");
   **/
  const itemsList = items
    .split(",")
    .map((item) => {
      const [name, quantity] = item.split(":");
      if (!name || isNaN(quantity)) {
        log(
          bot,
          `Invalid items format. Use 'item1:quantity1,item2:quantity2,...'`
        );
        return null;
      }
      return { name, quantity: parseInt(quantity, 10) };
    })
    .filter((item) => item !== null);

  const chestToOpen = bot.findBlock({
    matching: bot.registry.blocksByName.chest.id,
    maxDistance: FAR_DISTANCE,
  });

  if (!chestToOpen) {
    log(bot, "No chest found");
    return false;
  }

  if (bot.entity.position.distanceTo(chestToOpen.position) > NEAR_DISTANCE) {
    await goToPosition(
      bot,
      chestToOpen.position.x,
      chestToOpen.position.y,
      chestToOpen.position.z,
      2
    );
  }

  const chest = await bot.openContainer(chestToOpen);
  for (const { name, quantity } of itemsList) {
    const item = chest.containerItems().find((item) => item.name === name);
    if (!item) {
      log(bot, `No ${name} found in the chest.`);
      continue;
    }
    try {
      await chest.withdraw(item.type, null, quantity);
      log(bot, `Withdrew ${quantity} ${name}`);
    } catch (err) {
      log(bot, `Unable to withdraw ${quantity} ${name}`);
    }
  }
  chest.close();
  return true;
}

export function startCrouching(bot) {
  /**
   * Start crouching.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @example
   * skills.startCrouching(bot);
   **/
  bot.pathfinder.sneak = true;
  log(bot, "Started crouching.");
}

export function stopCrouching(bot) {
  /**
   * Stop crouching.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @example
   * skills.stopCrouching(bot);
   **/
  bot.pathfinder.sneak = false;
  log(bot, "Stopped crouching.");
}

export async function consume(bot, itemName) {
  /**
   * Consume an item in the bot's inventory.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} itemName, the name of the item to consume.
   * @returns {Promise<boolean>} true if the item was consumed, false otherwise.
   * @example
   * await skills.consume(bot, 'apple');
   **/
  const item = bot.inventory.items().find((item) => item.name === itemName);
  if (!item) {
    log(bot, `No ${itemName} found in inventory.`);
    return false;
  }

  try {
    await bot.equip(item, "hand");
    await bot.consume();
    log(bot, `Consumed ${itemName}`);
    return true;
  } catch (err) {
    log(bot, `Unable to consume ${itemName}: ${err.message}`);
    return false;
  }
}

export async function dismount(bot) {
  /**
   * Dismount the bot from any entity it is currently riding.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @returns {Promise<boolean>} true if the bot dismounted, false otherwise.
   * @example
   * await skills.dismount(bot);
   **/
  if (!bot.vehicle) {
    log(bot, "The bot is not riding any entity.");
    return false;
  }

  try {
    await bot.dismount();
    log(bot, "Successfully dismounted.");
    return true;
  } catch (err) {
    log(bot, `Failed to dismount: ${err.message}`);
    return false;
  }
}

export async function lookInFurnace(bot) {
  /**
   * Look in the nearest furnace and log its contents.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @returns {Promise<boolean>} true if the furnace contents were logged, false if no furnace was found.
   * @example
   * await skills.lookInFurnace(bot);
   */
  const furnaceBlock = world.getNearestBlock(bot, "furnace", FAR_DISTANCE);
  if (!furnaceBlock) {
    log(bot, "No furnace found nearby.");
    return false;
  }

  // Move closer to the furnace if too far
  if (bot.entity.position.distanceTo(furnaceBlock.position) > NEAR_DISTANCE) {
    await goToPosition(
      bot,
      furnaceBlock.position.x,
      furnaceBlock.position.y,
      furnaceBlock.position.z,
      2
    );
  }

  const furnace = await bot.openFurnace(furnaceBlock);
  const inputItem = furnace.inputItem();
  const fuelItem = furnace.fuelItem();
  const outputItem = furnace.outputItem();

  log(bot, `Furnace contents:`);
  log(
    bot,
    `Input: ${inputItem ? `${inputItem.count} ${inputItem.name}` : "None"}`
  );
  log(bot, `Fuel: ${fuelItem ? `${fuelItem.count} ${fuelItem.name}` : "None"}`);
  log(
    bot,
    `Output: ${outputItem ? `${outputItem.count} ${outputItem.name}` : "None"}`
  );

  furnace.close();
  return true;
}

export async function takeFromFurnace(bot, itemType) {
  /**
   * Take items from the nearest furnace.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @param {string} itemType - The type of item to take (input, fuel, output).
   * @returns {Promise<boolean>} true if the items were taken, false otherwise.
   * @example
   * await skills.takeFromFurnace(bot, "input");
   */
  const furnaceBlock = world.getNearestBlock(bot, "furnace", MID_DISTANCE);
  if (!furnaceBlock) {
    log(bot, "No furnace found nearby.");
    return false;
  }

  // Move closer to the furnace if too far
  if (bot.entity.position.distanceTo(furnaceBlock.position) > NEAR_DISTANCE) {
    await goToPosition(
      bot,
      furnaceBlock.position.x,
      furnaceBlock.position.y,
      furnaceBlock.position.z,
      2
    );
  }

  const furnace = await bot.openFurnace(furnaceBlock);
  let item;

  try {
    if (itemType === "input") {
      item = await furnace.takeInput();
    } else if (itemType === "fuel") {
      item = await furnace.takeFuel();
    } else if (itemType === "output") {
      item = await furnace.takeOutput();
    } else {
      log(bot, `Invalid item type: ${itemType}`);
      furnace.close();
      return false;
    }
  } catch (err) {
    log(bot, `Failed to take ${itemType} from furnace: ${err.message}`);
    furnace.close();
    return false;
  }

  log(bot, `Successfully took ${item.count} ${item.name} from furnace.`);
  furnace.close();
  return true;
}

export async function sowSeeds(bot, seedType) {
  /**
   * Sow seeds on nearby tilled soil.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} seedType, the type of seed to sow.
   * @returns {Promise<boolean>} true if the seeds were sown, false otherwise.
   * @example
   * await skills.sowSeeds(bot, "wheat_seeds");
   **/
  if (seedType.endsWith("seed") && !seedType.endsWith("seeds")) seedType += "s"; // fixes common mistake

  let seeds = bot.inventory.items().find((item) => item.name === seedType);
  if (!seeds) {
    log(bot, `No ${seedType} to plant.`);
    return false;
  }

  await bot.equip(seeds, "hand");

  const tilledSoilBlocks = bot.findBlocks({
    matching: (block) => block.name === "farmland",
    maxDistance: 16,
    count: 64,
    useExtraInfo: (block) => {
      const blockAbove = bot.blockAt(block.position.offset(0, 1, 0));
      return !blockAbove || blockAbove.type === 0;
    },
  });

  if (tilledSoilBlocks.length === 0) {
    log(bot, `No tilled soil found nearby.`);
    return false;
  }

  for (const toSowBlock of tilledSoilBlocks) {
    const block = bot.blockAt(
      new Vec3(toSowBlock.x, toSowBlock.y, toSowBlock.z)
    );
    const distance = bot.entity.position.distanceTo(block.position);
    if (distance > NEAR_DISTANCE) {
      await goToPosition(
        bot,
        block.position.x,
        block.position.y,
        block.position.z,
        2
      );
    }

    await bot.placeBlock(block, new Vec3(0, 1, 0));
  }
  log(bot, `Planted ${seedType} on ${tilledSoilBlocks.length} blocks.`);

  return true;
}

export async function buildHouse(bot, houseType) {
    const designsDir = path.join(__dirname, '../npc/construction');
    const designFiles = fs.readdirSync(designsDir).filter(file => file.endsWith('.json'));
    const designNames = designFiles.map(file => file.replace('.json', ''));

    if (!designNames.includes(houseType)) {
        log(bot, `Invalid design '${houseType}'. Available designs: ${designNames.join(', ')}`);
        return null;
    }

    const filePath = path.join(designsDir, `${houseType}.json`);
    const data = fs.readFileSync(filePath, 'utf8');
    const design = JSON.parse(data);

    const specialBlocks = {
        bed: item => item.name.endsWith('_bed'),
        log: item => item.name.endsWith('_log'),
        planks: item => item.name.endsWith('_planks'),
        door: item => item.name.endsWith('_door'),
        trapdoor: item => item.name.endsWith('_trapdoor'),
        fence: item => item.name.endsWith('_fence') && !item.name.endsWith('_fence_gate'),
        fence_gate: item => item.name.endsWith('_fence_gate'),
        stairs: item => item.name.endsWith('_stairs'),
        slab: item => item.name.endsWith('_slab'),
        button: item => item.name.endsWith('_button'),
        pressure_plate: item => item.name.endsWith('_pressure_plate'),
        sign: item => item.name.endsWith('_sign'),
        banner: item => item.name.endsWith('_banner'),
        carpet: item => item.name.endsWith('_carpet'),
        shulker_box: item => item.name.endsWith('_shulker_box'),
        terracotta: item => item.name.endsWith('_terracotta') && !item.name.startsWith('glazed'),
        concrete: item => item.name.endsWith('_concrete') && !item.name.endsWith('_powder'),
        concrete_powder: item => item.name.endsWith('_concrete_powder'),
        glazed_terracotta: item => item.name.endsWith('_glazed_terracotta')
    };

    const blocks = design.blocks.flat(2).filter(block => block !== "");
    const inventoryCounts = world.getInventoryCounts(bot);

    const requiredBlocks = blocks.reduce((acc, block) => {
        acc[block] = (acc[block] || 0) + 1;
        return acc;
    }, {});
    let missingBlocks = [];
    for (const [block, count] of Object.entries(requiredBlocks)) {
        if (block !== 'air') {
            let found = false;
            if (specialBlocks[block]) {
                console.log(`Checking special block: ${block}`);
                const totalCount = bot.inventory.items().reduce((sum, item) => {
                    if (specialBlocks[block](item)) {
                        sum += inventoryCounts[item.name];
                    }
                    return sum;
                }, 0);
                found = totalCount >= count;
                console.log(`Block: ${block}, Total Count: ${totalCount}, Required: ${count}, Found: ${found}`);
            } else {
                console.log(`Checking regular block: ${block}`);
                found = inventoryCounts[block] && inventoryCounts[block] >= count;
                console.log(`Block: ${block}, Count: ${inventoryCounts[block]}, Required: ${count}, Found: ${found}`);
            }
            if (!found) {
                missingBlocks.push(`Not enough ${block}. Required: ${count}, Available: ${inventoryCounts[block] || 0}`);
            }
        }
    }
    if (missingBlocks.length > 0) {
        log(bot, missingBlocks.join('\n'));
        return false;
    }

    const basePos = bot.entity.position;
    const offset = design.offset < 0 ? design.offset : 0; // Ensure offset is 0 or negative

    // Clear the area if offset is negative
    let lastBlockName = "";
    if (offset < 0) {
        const layersToClear = Math.abs(offset);
        for (let y = layersToClear - 1; y >= 0; y--) {
            console.log(design.blocks[y].map(row => row.join(' ')).join('\n'));
            for (let z = 0; z < design.blocks[y].length; z++) {
                for (let x = 0; x < design.blocks[y][z].length; x++) {
                    let blockType = design.blocks[y][z][x];
                    if (blockType !== "") {
                        const pos = basePos.offset(x, y + offset, z);
                        let block = bot.blockAt(pos);
                        if (block && block.name !== 'air') {
                            if (block.name !== lastBlockName) {
                                await bot.tool.equipForBlock(block);
                                lastBlockName = block.name;
                            }
                            if (bot.entity.position.distanceTo(pos) > NEAR_DISTANCE) {
                                await goToPosition(bot, pos.x, pos.y, pos.z);
                            }
                            await bot.dig(block);
                        }
                        if (bot.interrupt_code) {
                            log(bot, "Interrupted Build House");
                            return false;
                        }
                    }
                }
            }
        }
    }

    const delayedBlocks = [];

    const placeBlockAtPosition = async (block, pos) => {
        const currentBlock = bot.blockAt(pos);
        if (block === "air" && currentBlock.name !== "air") {
            if (bot.entity.position.distanceTo(pos) > NEAR_DISTANCE) {
                await goToPosition(bot, pos.x, pos.y, pos.z);
            }
            await bot.dig(currentBlock);
        } else if (block !== "air" && block !== "") {
            if (specialBlocks[block]) {
                const item = bot.inventory.items().find(specialBlocks[block]);
                if (item) {
                    block = item.name;
                } else {
                    log(bot, `No ${block} found in inventory to place at ${pos}.`);
                    return false;
                }
            }
            if (bot.entity.position.distanceTo(pos) > NEAR_DISTANCE) {
                await goToPosition(bot, pos.x, pos.y, pos.z);
            }
            await placeBlock(bot, block, pos.x, pos.y, pos.z);
        }
    };

    for (let y = 0; y < design.blocks.length; y++) {
        for (let z = 0; z < design.blocks[y].length; z++) {
            for (let x = 0; x < design.blocks[y][z].length; x++) {
                let block = design.blocks[y][z][x];
                const pos = basePos.offset(x, y + offset, z);

                if (block === "bed" || block === "door") {
                    delayedBlocks.push({ block, pos });
                } else {
                    await placeBlockAtPosition(block, pos);
                }
                if (bot.interrupt_code) {
                    log(bot, "Interrupted Build House");
                    return false
                }
            }
        }
    }

    for (const { block, pos } of delayedBlocks) {
        await placeBlockAtPosition(block, pos);
        if (bot.interrupt_code) {
            log(bot, "Interrupted Build House");
            return false
        }
    }

    log(bot, `${houseType} built successfully.`);
    return true;
}

export async function tameMob(bot, mobType) {
  /**
   * Tame a nearby untamed cat or wolf.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} mobType, the type of mob to tame ('cat' or 'wolf').
   * @returns {Promise<boolean>} true if the mob was tamed, false otherwise.
   * @example
   * await skills.tameMob(bot, "cat");
   * await skills.tameMob(bot, "wolf");
   **/
  
  const tamingItems = {
    cat: ["cod", "salmon"],
    wolf: ["bone"]
  };

  if (!tamingItems[mobType]) {
    log(bot, `Can only tame cats or wolves, not ${mobType}.`);
    return false;
  }

  // Find required taming item in inventory
  const validItems = tamingItems[mobType];
  let tamingItem = null;
  for (const itemName of validItems) {
    const item = bot.inventory.items().find(item => item.name === itemName);
    if (item) {
      tamingItem = item;
      break;
    }
  }

  if (!tamingItem) {
    log(bot, `You need ${validItems.join(" or ")} to tame a ${mobType}.`);
    return false;
  }

  // Find nearest untamed mob
  // Replaced getNearbyEntities with await getVisibleEntities
  const visibleEntities = await world.getVisibleEntities(bot);
  let targetMob = null;
  
  // Need to sort by distance if we want the nearest visible
  visibleEntities.sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position));

  for (const entity of visibleEntities) {
    if (entity.name !== mobType) continue;
    
    // Check if any metadata value is a UUID (contains dashes)
    const isTamed = entity.metadata.some(meta => 
      typeof meta === 'string' && meta.includes('-')
    );
    
    if (!isTamed) {
      targetMob = entity;
      break; // Found the nearest untamed one
    }
  }

  if (!targetMob) {
    log(bot, `No untamed ${mobType} found among visible entities.`); // Updated log message
    return false;
  }

  // Equip taming item and use it on the mob
  await bot.equip(tamingItem, "hand");
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    try {
      const distance = bot.entity.position.distanceTo(targetMob.position);
      
      // For cats, manage crouching based on distance
      if (mobType === 'cat') {
        if (distance > 12) { // Too far, need to catch up
          stopCrouching(bot);
        } else if (distance <= 10) { // Close enough to be stealthy
          startCrouching(bot);
        }
      }

      // Move closer if needed
      if (distance > NEAR_DISTANCE) {
        await goToPosition(
          bot,
          targetMob.position.x,
          targetMob.position.y,
          targetMob.position.z,
          2
        );
      }
      
      await bot.lookAt(targetMob.position.offset(0, 0.5, 0));
      await bot.useOn(targetMob);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait to see if taming succeeded

      // Check if any metadata value is a UUID (contains dashes)
      const isTamed = targetMob.metadata.some(meta => 
        typeof meta === 'string' && meta.includes('-')
      );
      
      if (isTamed) {
        if (mobType === 'cat') {
          stopCrouching(bot);
        }
        log(bot, `Successfully tamed ${mobType}!`);

        // make pet stand if it's sitting
        await bot.unequip('hand');  // Unequip food/bone first
        await bot.lookAt(targetMob.position.offset(0, 0.5, 0));
        await bot.useOn(targetMob);
        return true;
      }
      
      attempts++;
    } catch (err) {
      if (mobType === 'cat') {
        stopCrouching(bot);
      }
      log(bot, `Failed to use ${tamingItem.name} on ${mobType}: ${err.message}`);
      return false;
    }
  }

  if (mobType === 'cat') {
    stopCrouching(bot);
  }
  log(bot, `Failed to tame ${mobType} after ${maxAttempts} attempts.`);
  return false;
}

// Added function to handle attacking multiple creatures sequentially
export async function attackMultipleCreatures(bot, mobType, count) {
  /**
   * Attacks and kills a specified number of the nearest creatures of a given type sequentially.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @param {string} mobType - The type of creature to attack.
   * @param {number} count - The number of creatures to attack and kill.
   * @returns {Promise<string>} A message summarizing the outcome.
   */
  bot.modes.pause("cowardice");
  let killedCount = 0;
  const maxRange = 24; // Note: maxRange is no longer used by getVisibleEntities

  for (let i = 0; i < count; i++) {
    if (bot.interrupt_code) {
      const message = `Attack sequence interrupted after killing ${killedCount} ${mobType}(s).`;
      log(bot, message);
      return message;
    }

    // Find the *current* nearest visible creature of the specified type in each iteration
    // Replaced getNearbyEntities with await getVisibleEntities
    const visibleEntities = await world.getVisibleEntities(bot); 

    // Need to sort by distance to find the nearest one
    visibleEntities.sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position));
    
    const target = visibleEntities.find(
      (entity) => entity !== bot.entity && entity.name === mobType
    );

    if (!target) {
      // Keep final log for no more targets
      const message = killedCount > 0
        ? `Successfully killed ${killedCount} ${mobType}(s). Could not find any more visible nearby.` // Updated log
        : `Could not find any ${mobType} visible nearby to attack.`; // Updated log
      log(bot, message);
      return message;
    }

    const success = await attackEntity(bot, target, true); // Call attackEntity to handle the kill

    if (success) {
      killedCount++;
    } else {
      // attackEntity returned false, likely due to interruption or error during combat
      const message = `Attack sequence stopped after killing ${killedCount} ${mobType}(s) due to an issue killing target #${i+1}.`;
      log(bot, message);
      return message;
    }
    
    // Small delay to allow things to settle (e.g., item drops)
    await new Promise(resolve => setTimeout(resolve, 300)); 
  }

  const finalMessage = `Successfully completed attack sequence. Killed ${killedCount} ${mobType}(s).`;
  log(bot, finalMessage);
  return finalMessage;
}