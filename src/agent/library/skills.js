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

export async function smeltWithFurnace(bot, furnaceIdentifier, itemName, fuelItemName, fuelQuantity, num = 1) {
  /** 
   * Puts fuel and items in a specific furnace to begin smelting.
   * Does NOT wait for smelting to finish or collect output.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @param {string} furnaceIdentifier - The identifier string, e.g., '[furnace@(x,y,z)]'.
   * @param {string} itemName - The item name to put in the input slot.
   * @param {string} fuelItemName - The name of the item to use as fuel.
   * @param {number} fuelQuantity - The exact amount of fuel items to add.
   * @param {number} num - The desired number of input items. Will use available amount if less.
   * @returns {Promise<string>} A message summarizing the actions taken or an error.
   */

  // Validate and get the specific furnace block
  const { targetBlock: furnaceBlock, errorMsg: validationError } = await _getAndValidateContainer(bot, furnaceIdentifier);
  if (validationError) {
    if (validationError.includes("not appear to be a container")) {
        return `Block ${furnaceIdentifier} is not a valid furnace.`;
    }
    return validationError;
  }

  if (!furnaceBlock.name.includes('furnace')) {
      const message = `Block ${furnaceIdentifier} is a ${furnaceBlock.name}, not a furnace.`;
      log(bot, message);
      return message;
  }
  
  // Removed smeltable validation

  let furnace;
  try {
    furnace = await bot.openFurnace(furnaceBlock);
  } catch (err) {
    const message = `Failed to open furnace ${furnaceIdentifier}: ${err.message}`;
    log(bot, message);
    return message;
  }

  let resultsMessage = `Preparing to smelt in ${furnaceIdentifier}:\n`;

  // Check inventory and adjust quantity if needed
  let inv_counts = world.getInventoryCounts(bot);
  let amountToSmelt = num;
  if (!inv_counts[itemName] || inv_counts[itemName] < num) {
    const availableAmount = inv_counts[itemName] || 0;
    if (availableAmount === 0) {
        const message = `You do not have any ${itemName} to put in the furnace.`; // Updated wording
        resultsMessage += `- Error: ${message}\n`;
        log(bot, message);
        await furnace.close();
        return resultsMessage;
    }
    const noticeMsg = `Not enough ${itemName} for ${num}. Will add all available ${availableAmount} instead.`;
    resultsMessage += `- Notice: ${noticeMsg}\n`;
    log(bot, noticeMsg);
    amountToSmelt = availableAmount; 
  }

  // Fuel the furnace if necessary using the specified fuel item and quantity
  if (!furnace.fuelItem()) {
    let fuel = bot.inventory.items().find((item) => item.name === fuelItemName);
    // Check if bot has enough of the specified fuel quantity
    if (!fuel || fuel.count < fuelQuantity) {
      const message = `Not enough ${fuelItemName} fuel (need ${fuelQuantity}, have ${fuel ? fuel.count : 0}). Cannot start smelting.`;
      resultsMessage += `- Error: ${message}\n`;
      log(bot, message);
      await furnace.close();
      return resultsMessage;
    }
    try {
        // Use the specified fuel quantity
        await furnace.putFuel(fuel.type, null, fuelQuantity); 
        const fuelMsg = `Added ${fuelQuantity} ${fuelItemName} as fuel.`; 
        resultsMessage += `- ${fuelMsg}\n`;
        log(bot, fuelMsg);
    } catch (fuelErr) {
        const message = `Failed to add ${fuelItemName} fuel: ${fuelErr.message}`;
        resultsMessage += `- Error: ${message}\n`;
        log(bot, message);
        await furnace.close();
        return resultsMessage;
    }
  } else {
      resultsMessage += `- Furnace already has fuel.\n`;
  }

  // Put items in the furnace input slot
  try {
    // Ensure the item exists in registry before getting ID
    const inputItemType = MCData.getInstance().getItemId(itemName);
    if (!inputItemType) {
      throw new Error(`Item name "${itemName}" not found in registry.`);
    }
    await furnace.putInput(inputItemType, null, amountToSmelt);
    const inputMsg = `Added ${amountToSmelt} ${itemName} to input slot.`;
    resultsMessage += `- ${inputMsg}\n`;
    log(bot, inputMsg);
  } catch (inputErr) {
      const message = `Failed to add ${itemName} to input: ${inputErr.message}`;
      resultsMessage += `- Error: ${message}\n`;
      log(bot, message);
      await furnace.close();
      return resultsMessage;
  }

  // Close the furnace - items are added, smelting will happen in the background
  try {
    await furnace.close();
    resultsMessage += `- Closed furnace interface. Smelting should proceed in-game.\n`;
  } catch (closeErr) {
    console.warn(`Error closing furnace ${furnaceIdentifier} after adding items: ${closeErr.message}`);
    resultsMessage += `- Warning: Error closing furnace interface: ${closeErr.message}\n`;
  }

  log(bot, `Successfully prepared ${furnaceIdentifier} with fuel and ${amountToSmelt} ${itemName}.`); // Updated log
  return resultsMessage; // Return the summary of actions taken
}

export async function lookInFurnace(bot, furnaceIdentifier) {
  /**
   * Look in a specific furnace and log its contents.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @param {string} furnaceIdentifier - The identifier string, e.g., '[furnace@(x,y,z)]'.
   * @returns {Promise<string>} A message summarizing the contents or an error.
   */
  // Validate and get the specific furnace block
  const { targetBlock: furnaceBlock, errorMsg: validationError } = await _getAndValidateContainer(bot, furnaceIdentifier);
  if (validationError) return validationError;

  // Ensure it's specifically a furnace
  if (!furnaceBlock.name.includes('furnace')) {
      const message = `Block ${furnaceIdentifier} is a ${furnaceBlock.name}, not a furnace.`;
      log(bot, message);
      return message;
  }

  let furnace;
  try {
    furnace = await bot.openFurnace(furnaceBlock);
  } catch (err) {
    const message = `Failed to open furnace ${furnaceIdentifier}: ${err.message}`;
    log(bot, message);
    return message;
  }

  const inputItem = furnace.inputItem();
  const fuelItem = furnace.fuelItem();
  const outputItem = furnace.outputItem();

  const message = `${furnaceIdentifier} contents:
` +
                  `- Input: ${inputItem ? `${inputItem.count} ${inputItem.name}` : "None"}
` +
                  `- Fuel: ${fuelItem ? `${fuelItem.count} ${fuelItem.name}` : "None"}
` +
                  `- Output: ${outputItem ? `${outputItem.count} ${outputItem.name}` : "None"}`;
  
  log(bot, message);

  try {
    await furnace.close();
  } catch (closeErr) {
    console.warn(`Error closing furnace ${furnaceIdentifier}: ${closeErr.message}`);
  }
  return message;
}

export async function takeFromFurnace(bot, furnaceIdentifier, itemType) {
  /**
   * Take items from a specific furnace.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @param {string} furnaceIdentifier - The identifier string, e.g., '[furnace@(x,y,z)]'.
   * @param {string} itemType - The type of item to take (input, fuel, output).
   * @returns {Promise<string>} A message summarizing the action or an error.
   */
  // Validate and get the specific furnace block
  const { targetBlock: furnaceBlock, errorMsg: validationError } = await _getAndValidateContainer(bot, furnaceIdentifier);
  if (validationError) return validationError;

  // Ensure it's specifically a furnace
  if (!furnaceBlock.name.includes('furnace')) {
      const message = `Block ${furnaceIdentifier} is a ${furnaceBlock.name}, not a furnace.`;
      log(bot, message);
      return message;
  }

  let furnace;
  try {
    furnace = await bot.openFurnace(furnaceBlock);
  } catch (err) {
    const message = `Failed to open furnace ${furnaceIdentifier}: ${err.message}`;
    log(bot, message);
    return message;
  }

  let itemTaken;
  let success = false;
  let errorMessage = null;

  try {
    if (itemType === "input") {
      if (!furnace.inputItem()) throw new Error("Input slot is empty.");
      itemTaken = await furnace.takeInput();
    } else if (itemType === "fuel") {
      if (!furnace.fuelItem()) throw new Error("Fuel slot is empty.");
      itemTaken = await furnace.takeFuel();
    } else if (itemType === "output") {
      if (!furnace.outputItem()) throw new Error("Output slot is empty.");
      itemTaken = await furnace.takeOutput();
    } else {
      throw new Error(`Invalid item type "${itemType}". Use 'input', 'fuel', or 'output'.`);
    }
    success = true;
  } catch (err) {
    errorMessage = `Failed to take ${itemType} from ${furnaceIdentifier}: ${err.message}`;
  }

  let finalMessage;
  if (success && itemTaken) {
      finalMessage = `Successfully took ${itemTaken.count} ${itemTaken.name} (${itemType}) from ${furnaceIdentifier}.`;
  } else if (success && !itemTaken) { // Should not happen if takeX throws error correctly
      finalMessage = `Took ${itemType} from ${furnaceIdentifier}, but received no item data?`;
  } else {
      finalMessage = errorMessage || `Failed to take ${itemType} from ${furnaceIdentifier}.`; // Default if no specific error
  }

  log(bot, finalMessage);

  try {
    await furnace.close();
  } catch (closeErr) {
    console.warn(`Error closing furnace ${furnaceIdentifier}: ${closeErr.message}`);
  }
  return finalMessage;
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

// --- Container Interaction Skills (Refactored) ---

async function _getAndValidateContainer(bot, containerIdentifier) {
  /** 
   * Helper function to parse identifier, find, validate, and navigate to a container block.
   * @returns {Promise<{targetBlock: Block | null, errorMsg: string | null}>}
   */
  let blockName = '';
  let positionString = '';
  let errorMsg = null;
  let positionVec = null;

  // 1. Parse Identifier
  if (!containerIdentifier || !containerIdentifier.startsWith('[') || !containerIdentifier.endsWith(']')) {
    errorMsg = `Invalid containerIdentifier format: \"${containerIdentifier}\". Expected format '[block_name@(x,y,z)]'. Missing brackets.`;
  } else {
    const atIndex = containerIdentifier.indexOf('@');
    const openParenIndex = containerIdentifier.indexOf('(');
    if (atIndex === -1 || openParenIndex === -1 || openParenIndex <= atIndex) {
      errorMsg = `Invalid containerIdentifier format: \"${containerIdentifier}\". Expected format '[block_name@(x,y,z)]'. Missing or misplaced '@' or '('.`;
    } else {
      blockName = containerIdentifier.slice(1, atIndex);
      positionString = containerIdentifier.slice(atIndex + 1, -1);
      if (!blockName) {
        errorMsg = `Invalid containerIdentifier format: \"${containerIdentifier}\". Block name is empty.`;
      }
      if (!positionString.startsWith('(') || !positionString.endsWith(')')) {
        errorMsg = `Invalid containerIdentifier format: \"${containerIdentifier}\". Position part is invalid: ${positionString}.`;
      } else {
        // 1b. Parse Position String into Vec3
        try {
          const coords = positionString.match(/\((-?\d+(\.\d+)?),(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)\)/);
          if (!coords || coords.length < 6) throw new Error("Regex failed to parse coordinates.");
          positionVec = new Vec3(parseFloat(coords[1]), parseFloat(coords[3]), parseFloat(coords[5]));
        } catch (error) {
          errorMsg = `Failed to parse position string \"${positionString}\" from identifier \"${containerIdentifier}\": ${error.message}`;
        }
      }
    }
  }

  if (errorMsg) {
    log(bot, errorMsg);
    return { targetBlock: null, errorMsg };
  }

  // 2. Find the block
  const targetBlock = bot.blockAt(positionVec);
  if (!targetBlock) {
    errorMsg = `Could not find any block at position ${positionString} from identifier ${containerIdentifier}.`;
    log(bot, errorMsg);
    return { targetBlock: null, errorMsg };
  }

  // 3. Validate Block Type
  if (targetBlock.name !== blockName) {
    errorMsg = `Block at ${positionString} is a ${targetBlock.name}, not the expected ${blockName} from identifier ${containerIdentifier}.`;
    log(bot, errorMsg);
    return { targetBlock: null, errorMsg };
  }
  
  // 4. Validate if it's a container (basic check)
  //    Note: More robust check might involve bot.registry.blocksByName[blockName]?.container? 
  //    but openContainer failure is also a good indicator.
  if (typeof bot.openContainer !== 'function') { 
    errorMsg = `Internal error: bot.openContainer function not available. Cannot interact with container ${containerIdentifier}.`;
    log(bot, errorMsg);
    return { targetBlock: null, errorMsg }; 
  }
  // Further check implicitly happens when trying to open it.

  // 5. Navigate if necessary
  if (bot.entity.position.distanceTo(targetBlock.position) > NEAR_DISTANCE) {
    log(bot, `Container ${containerIdentifier} is too far, moving closer...`);
    const success = await goToPosition(bot, targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 2);
    if (!success) {
      errorMsg = `Failed to navigate to the container ${containerIdentifier}.`;
      log(bot, errorMsg);
      return { targetBlock: null, errorMsg };
    }
  }

  return { targetBlock, errorMsg: null }; // Success
}

export async function lookInContainer(bot, containerIdentifier) {
  /**
   * Look in a specific container block and log its contents.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @param {string} containerIdentifier - The identifier string, e.g., '[chest@(x,y,z)]'.
   * @returns {Promise<string>} A message summarizing the contents or an error.
   */
  const { targetBlock, errorMsg } = await _getAndValidateContainer(bot, containerIdentifier);
  if (errorMsg) return errorMsg; // Error already logged by helper

  let container;
  try {
    container = await bot.openContainer(targetBlock);
  } catch (err) {
    const message = `Failed to open container ${containerIdentifier}: ${err.message}`;
    log(bot, message);
    return message;
  }

  const itemsInContainer = container.containerItems().map((item) => `${item.name} x${item.count}`);
  let message;
  if (itemsInContainer.length === 0) {
    message = `Container ${containerIdentifier} is empty.`;
  } else {
    message = `Container ${containerIdentifier} contents:\n- ` + itemsInContainer.join('\n- ');
  }
  log(bot, message); 

  try {
    await container.close();
  } catch (closeErr) {
    // Non-critical, just log
    console.warn(`Error closing container ${containerIdentifier}: ${closeErr.message}`);
  }
  return message; // Return the content summary
}

export async function depositToContainer(bot, containerIdentifier, itemsString) {
  /**
   * Deposit specified items into a specific container block.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @param {string} containerIdentifier - The identifier string, e.g., '[chest@(x,y,z)]'.
   * @param {string} itemsString - The items to deposit: 'item1:qty1,item2:qty2,...'.
   * @returns {Promise<string>} A message summarizing the deposit action or an error.
   */
  const { targetBlock, errorMsg: validationError } = await _getAndValidateContainer(bot, containerIdentifier);
  if (validationError) return validationError; 

  // Parse items string
  const itemsList = itemsString.split(',').map(item => {
      const [name, quantity] = item.split(':');
      const qty = parseInt(quantity, 10);
      if (!name || isNaN(qty) || qty <= 0) return null;
      return { name, quantity: qty };
  }).filter(item => item !== null);

  if (itemsList.length === 0) {
    const message = `Invalid or empty items string provided: \"${itemsString}\". Format: 'item1:qty1,item2:qty2,...'`;
    log(bot, message);
    return message;
  }

  let container;
  try {
    container = await bot.openContainer(targetBlock);
  } catch (err) {
    const message = `Failed to open container ${containerIdentifier}: ${err.message}`;
    log(bot, message);
    return message;
  }

  let depositedSummary = [];
  let errorSummary = [];

  for (const { name, quantity } of itemsList) {
    const itemInInventory = bot.inventory.items().find(invItem => invItem.name === name);
    if (!itemInInventory) {
      errorSummary.push(`You do not have any ${name} to deposit.`);
      continue; 
    }
    // Cannot deposit more than available
    const depositAmount = Math.min(quantity, itemInInventory.count); 
    if (depositAmount <= 0) continue; // Should not happen with parsing check, but safe

    try {
      await container.deposit(itemInInventory.type, null, depositAmount);
      depositedSummary.push(`${depositAmount} ${name}`);
    } catch (err) {
      errorSummary.push(`Could not deposit ${depositAmount} ${name}: ${err.message}`);
    }
    if (bot.interrupt_code) {
        errorSummary.push("Deposit action interrupted.");
        break;
    }
  }

  try {
    await container.close();
  } catch (closeErr) {
      console.warn(`Error closing container ${containerIdentifier}: ${closeErr.message}`);
  }

  // Construct final message
  let finalMessage = `Deposit action for ${containerIdentifier}:
`;
  if (depositedSummary.length > 0) {
    finalMessage += `- Deposited: ${depositedSummary.join(', ')}.\n`;
  }
  if (errorSummary.length > 0) {
    finalMessage += `- Errors: ${errorSummary.join('; ')}.`;
  }
  if (depositedSummary.length === 0 && errorSummary.length === 0) {
      finalMessage += `- No items were specified or found to deposit.`;
  }

  log(bot, finalMessage); // Log the detailed message
  return finalMessage;
}

export async function withdrawFromContainer(bot, containerIdentifier, itemsString) {
  /**
   * Withdraw specified items from a specific container block.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @param {string} containerIdentifier - The identifier string, e.g., '[chest@(x,y,z)]'.
   * @param {string} itemsString - The items to withdraw: 'item1:qty1,item2:qty2,...'.
   * @returns {Promise<string>} A message summarizing the withdrawal action or an error.
   */
  const { targetBlock, errorMsg: validationError } = await _getAndValidateContainer(bot, containerIdentifier);
  if (validationError) return validationError;

  // Parse items string
  const itemsList = itemsString.split(',').map(item => {
      const [name, quantity] = item.split(':');
      const qty = parseInt(quantity, 10);
      if (!name || isNaN(qty) || qty <= 0) return null;
      return { name, quantity: qty };
  }).filter(item => item !== null);

  if (itemsList.length === 0) {
    const message = `Invalid or empty items string provided: \"${itemsString}\". Format: 'item1:qty1,item2:qty2,...'`;
    log(bot, message);
    return message;
  }

  let container;
  try {
    container = await bot.openContainer(targetBlock);
  } catch (err) {
    const message = `Failed to open container ${containerIdentifier}: ${err.message}`;
    log(bot, message);
    return message;
  }

  // Log the initial contents
  const itemsInContainer = container.containerItems().map((item) => `${item.name} x${item.count}`);
  let initialContentsMessage;
  if (itemsInContainer.length === 0) {
    initialContentsMessage = `Container ${containerIdentifier} is empty.`;
  } else {
    initialContentsMessage = `Container ${containerIdentifier} contents before withdrawal:\n- ` + itemsInContainer.join('\n- ');
  }
  log(bot, initialContentsMessage); // Log contents to bot output

  let withdrawnSummary = [];
  let errorSummary = [];

  for (const { name, quantity } of itemsList) {
    const itemInContainer = container.containerItems().find(contItem => contItem.name === name);
    if (!itemInContainer) {
      errorSummary.push(`No ${name} found in the container.`);
      continue;
    }
    // Cannot withdraw more than available
    const withdrawAmount = Math.min(quantity, itemInContainer.count);
    if (withdrawAmount <= 0) continue;

    try {
      await container.withdraw(itemInContainer.type, null, withdrawAmount);
      withdrawnSummary.push(`${withdrawAmount} ${name}`);
    } catch (err) { 
      errorSummary.push(`Could not withdraw ${withdrawAmount} ${name}: ${err.message}`);
    }
    if (bot.interrupt_code) {
        errorSummary.push("Withdraw action interrupted.");
        break;
    }
  }

  try {
    await container.close();
  } catch (closeErr) {
      console.warn(`Error closing container ${containerIdentifier}: ${closeErr.message}`);
  }

  // Construct final message
  let finalMessage = `Withdraw action for ${containerIdentifier}:
`;
  if (withdrawnSummary.length > 0) {
    finalMessage += `- Withdrew: ${withdrawnSummary.join(', ')}.\n`;
  }
  if (errorSummary.length > 0) {
    finalMessage += `- Errors: ${errorSummary.join('; ')}.`;
  }
  if (withdrawnSummary.length === 0 && errorSummary.length === 0) {
      finalMessage += `- No items were specified or found to withdraw.`;
  }

  log(bot, finalMessage); // Log the detailed message
  return finalMessage;
}

// --- End Container Interaction Skills ---