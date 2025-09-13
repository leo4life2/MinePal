import MCData from "../../utils/mcdata.js";
import * as world from "./world.js";
import pf from "mineflayer-pathfinder";
import Vec3 from "vec3";
import { digBlock, breakBlockAt as functionsBreakBlockAt } from "./functions.js";
import { queryList } from "../commands/queries.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from 'axios';

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
    // Bot cannot craft the item
    console.log("[craftRecipe] No recipes found for " + itemName);
    // Look for crafting table
    craftingTable = world.getNearestBlock(bot, "crafting_table", MID_DISTANCE);
    if (craftingTable === null) {
      // Try to place a crafting table
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
        // No crafting table item in inventory and no crafting table block nearby.
        // This means `craftingTable` is null.
        const itemId = MCData.getInstance().getItemId(itemName);
        // Check if there are any recipes at all for this item that can be made in inventory (requiresTable = false).
        const inventoryOnlyPotentialRecipes = bot.recipesAll(itemId, null, false);

        if (!inventoryOnlyPotentialRecipes || inventoryOnlyPotentialRecipes.length === 0) {
          log(bot, `Cannot craft ${itemName}: crafting table is required.`);
          return false;
        }
      }
    } else { // Crafting table is nearby
      recipes = bot.recipesFor(
        MCData.getInstance().getItemId(itemName),
        null,
        1,
        craftingTable
      );
    }
  }

  if (!recipes || recipes.length === 0) {
    const itemId = MCData.getInstance().getItemId(itemName);
    // craftingTable variable holds the context: null for inventory, or block object for table
    const wasTableAttempted = craftingTable !== null;
    const allPotentialRecipes = bot.recipesAll(itemId, null, wasTableAttempted);

    if (!allPotentialRecipes || allPotentialRecipes.length === 0) {
      log(bot, `No known recipes to craft ${itemName}${wasTableAttempted ? ' using a crafting table' : ' from inventory'}.`);
    } else {
      const recipeToAnalyze = allPotentialRecipes[0]; // Analyze the first available recipe
      const recipeRequiresTable = recipeToAnalyze.requiresTable;

      if (recipeRequiresTable && !craftingTable) {
         log(bot, `Cannot craft ${itemName} as it requires a crafting table, which is not available.`);
      } else {
        const targetCraftCount = Math.ceil(num / recipeToAnalyze.result.count);
        const missingReport = [];

        for (const ingredient of recipeToAnalyze.delta) {
          if (ingredient.count < 0) { // Negative count means it's a required ingredient
            const requiredAmount = Math.abs(ingredient.count) * targetCraftCount;
            const currentAmount = bot.inventory.count(ingredient.id, ingredient.metadata);
            if (currentAmount < requiredAmount) {
              const itemInfo = bot.registry.items[ingredient.id];
              const ingredientName = itemInfo ? (itemInfo.displayName || itemInfo.name) : `item ID ${ingredient.id}`;
              missingReport.push(`${requiredAmount - currentAmount}x ${ingredientName}`);
            }
          }
        }

        if (missingReport.length > 0) {
          log(bot, `Cannot craft ${num}x ${itemName}. Missing: ${missingReport.join(', ')}. Try again once you have these items. Consider crafting them or sourcing them.`);
        } else {
          // This case implies recipesFor failed but allPotentialRecipes[0] somehow suggests we have ingredients.
          // This should be rare if recipesFor is robust.
          // Or, it could mean recipeToAnalyze.result.count is 0 or invalid, leading to targetCraftCount issues.
          log(bot, `Cannot craft ${itemName}. Resources might be unavailable or a conflicting recipe state was encountered (e.g. recipesFor failed but a recipe in recipesAll seems craftable).`);
        }
      }
    }
    return false;
  }

  console.log("[craftRecipe] crafting " + itemName);

  const recipe = recipes[0];
  const actualNum = Math.ceil(num / recipe.result.count); // Adjust num based on recipe result count

  // Pre-crafting ingredient availability check, even if recipesFor succeeded initially
  const missingIngredientsReport = [];
  for (const deltaItem of recipe.delta) {
    if (deltaItem.count < 0) { // Ingredients have negative counts in delta
      const requiredAmount = Math.abs(deltaItem.count) * actualNum;
      const currentAmount = bot.inventory.count(deltaItem.id, deltaItem.metadata);
      if (currentAmount < requiredAmount) {
        const itemInfo = bot.registry.items[deltaItem.id];
        const ingredientName = itemInfo ? (itemInfo.displayName || itemInfo.name) : `item ID ${deltaItem.id}`;
        missingIngredientsReport.push(`${requiredAmount - currentAmount}x ${ingredientName}`);
      }
    }
  }

  if (missingIngredientsReport.length > 0) {
    log(bot, `Cannot craft ${num}x ${itemName}. Missing: ${missingIngredientsReport.join(', ')}. Try again once you have these items. Consider crafting them or sourcing them.`);
    return false;
  }

  try {
    await bot.craft(recipe, actualNum, craftingTable);
    log(
      bot,
      `Successfully crafted ${itemName}, you now have ${world.getInventoryCounts(bot)[itemName] || 0} ${itemName}.`
    );
    return true;
  } catch (err) {
    log(bot, `Crafting ${num}x ${itemName} failed during the actual crafting attempt: ${err.message}. This might be due to a quick inventory change or an internal crafting error.`);
    return false;
  }
}

export async function smeltWithFurnace(bot, furnaceIdentifier, itemName, fuelItemName, fuelQuantity, num = 1) {
  /** 
   * Puts fuel and items in a specific furnace to begin smelting.
   * Does NOT wait for smelting to finish or collect output.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @param {string} furnaceIdentifier - The identifier string, e.g., 'furnace@(x,y,z)'.
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
   * @param {string} furnaceIdentifier - The identifier string, e.g., 'furnace@(x,y,z)'.
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
   * @param {string} furnaceIdentifier - The identifier string, e.g., 'furnace@(x,y,z)'.
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
   * await skills.tameMob(bot, "parrot"); // Added parrot example
   **/
  
  const tamingItems = {
    cat: ["cod", "salmon", "raw_cod", "raw_salmon"], // Added raw fish
    wolf: ["bone"],
    parrot: ["wheat_seeds", "melon_seeds", "pumpkin_seeds", "beetroot_seeds", "torchflower_seeds"] // Added parrot taming items
  };

  if (!tamingItems[mobType]) {
    log(bot, `Cannot tame ${mobType}. Can only tame: ${Object.keys(tamingItems).join(', ')}.`); // Updated message
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

        // make pet stand if it's sitting (only for cats/wolves)
        if (mobType === 'cat' || mobType === 'wolf') {
            await bot.unequip('hand');  // Unequip food/bone first
            await bot.lookAt(targetMob.position.offset(0, 0.5, 0));
            await bot.useOn(targetMob);
        }
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
        : `Action failed: Could not find any ${mobType} visible nearby to attack.`; // Updated log
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

export async function editSign(bot, blockName, positionString, frontText, backText) {
  /**
   * Edits the text on a specific sign block.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @param {string} blockName - The name of the sign block (e.g., "oak_sign").
   * @param {string} positionString - The position of the sign in format "(x,y,z)".
   * @param {string} frontText - The text to set on the front of the sign.
   * @param {string} backText - The text to set on the back of the sign.
   * @returns {Promise<string>} A message indicating success or failure.
   */
  // Validate block name
  if (!blockName || !blockName.includes("sign")) {
    const message = `Invalid block name provided: "${blockName}". It must be a sign block type.`;
    log(bot, message);
    return message;
  }

  // Parse position string
  let positionVec;
  try {
    const coords = positionString.match(/\((-?\d+(\.\d+)?),(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)\)/);
    if (!coords || coords.length < 6) {
      throw new Error("Invalid position string format. Expected (x,y,z).");
    }
    // Use parseFloat for potentially non-integer coordinates, although block positions are usually integers.
    positionVec = new Vec3(parseFloat(coords[1]), parseFloat(coords[3]), parseFloat(coords[5])); 
  } catch (error) {
    const message = `Failed to parse position string "${positionString}": ${error.message}`;
    log(bot, message);
    return message;
  }

  // Find the block at the specified position
  const targetBlock = bot.blockAt(positionVec);

  if (!targetBlock) {
    const message = `Could not find any block at position ${positionString}.`;
    log(bot, message);
    return message;
  }

  // Verify the block is the correct type and is a sign
  if (targetBlock.name !== blockName) {
    const message = `Block at ${positionString} is a ${targetBlock.name}, not the expected ${blockName}.`;
    log(bot, message);
    return message;
  }
  if (!targetBlock.signText) { // Check if the block object has sign capabilities
    const message = `Block at ${positionString} (${targetBlock.name}) does not appear to be a sign block.`;
    log(bot, message);
    return message;
  }

  // Navigate closer if necessary
  if (bot.entity.position.distanceTo(targetBlock.position) > NEAR_DISTANCE) {
    log(bot, `Sign at ${positionString} is too far, moving closer...`);
    const success = await goToPosition(bot, targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 2);
    if (!success) {
        const message = `Failed to navigate to the sign at ${positionString}.`;
        log(bot, message);
        return message;
    }
  }
  
  // Look at the sign
  await bot.lookAt(targetBlock.position);

  // Attempt to set the sign text
  try {
    // The setSignText method exists on the bot, taking the block object as the first argument
    await targetBlock.setSignText(frontText, backText); // Corrected: Call on targetBlock
    const message = `Successfully updated sign at ${positionString}. Front: "${frontText}", Back: "${backText}"`;
    log(bot, message);
    return message;
  } catch (error) {
    const message = `Failed to edit sign at ${positionString}: ${error.message}`;
    log(bot, message);
    return message;
  }
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
    // First, try to find a player with the given username
    mob = visibleEntities.find(
      (entity) =>
        entity !== bot.entity &&
        entity.type === "player" &&
        entity.username === mobType
    );
    // If no player found, check if there's a mob with that name
    if (!mob) {
      const foundMob = visibleEntities.find(
        (entity) => entity !== bot.entity && entity.name === mobType
      );
      if (foundMob) {
        log(bot, `No player named "${mobType}" found, but found a mob with that name. Attacking the mob.`);
        mob = foundMob; // Target the mob instead
      }
    }
  } else {
    // Original logic: find a mob with the given name
    mob = visibleEntities.find(
      (entity) => entity !== bot.entity && entity.name === mobType
    );
  }

  // Proceed with attack if a target (player or mob) was found
  if (mob) {
    return await attackEntity(bot, mob, kill);
  }

  // Log failure if no target was found
  log(
    bot,
    `Could not find any ${isPlayer ? "player or mob" : "mob"} named ${mobType} to attack. `
  );
  return false;
}

export async function attackEntity(bot, entity, kill = true) {
  let pos = entity.position;
  await equipHighestAttack(bot);

  // Move within attack range
  if (bot.entity.position.distanceTo(pos) > NEAR_DISTANCE) {
    try {
      await goToPosition(bot, pos.x, pos.y, pos.z, 2);
    } catch (err) {
      log(bot, `Failed to reach ${entity.name}: ${err.message}`);
      return false;
    }
  }

  // Listen for entity death
  let killed = false;
  const onEntityDead = (deadEntity) => {
    if (deadEntity.id === entity.id) killed = true;
  };
  bot.on('entityDead', onEntityDead);

  try {
    bot.pvp.attack(entity);
    // Wait up to 15 seconds for the entity to die
    const start = Date.now();
    while (!killed && Date.now() - start < 15000) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (bot.interrupt_code) {
        bot.pvp.stop();
        bot.removeListener('entityDead', onEntityDead);
        return false;
      }
    }
    bot.pvp.stop();
    bot.removeListener('entityDead', onEntityDead);

    if (killed) {
      log(bot, `Successfully killed ${entity.name}.`);
      await pickupNearbyItems(bot);
      return true;
    } else {
      log(bot, `Failed to kill ${entity.name} (timeout or interrupted).`);
      return false;
    }
  } catch (err) {
    bot.pvp.stop();
    bot.removeListener('entityDead', onEntityDead);
    log(bot, `Error attacking ${entity.name}: ${err.message}`);
    return false;
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
  let enemy = null; // Initialize enemy to null

  while (true) { // Loop until no visible, close hostile enemies are found
    // Find visible hostile mobs within range
    const visibleEntities = await world.getVisibleEntities(bot);
    const hostileMobsInRange = visibleEntities.filter(entity =>
      MCData.getInstance().isHostile(entity) &&
      entity.name !== "item" && // Ensure it's not an item entity
      bot.entity.position.distanceTo(entity.position) <= range
    );

    // Sort by distance to get the nearest
    hostileMobsInRange.sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position));

    enemy = hostileMobsInRange.length > 0 ? hostileMobsInRange[0] : null;

    if (!enemy) {
      break; // Exit loop if no suitable enemy found
    }

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
    await new Promise((resolve) => setTimeout(resolve, 500)); // Wait a bit for combat to proceed

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
   * Producer-consumer model: continuously scan via physicsTick and consume nearest candidates.
   */
  console.log(`[collectBlock(producer-consumer)] start: ${blockType}, num: ${num}`);

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

  // Build the scan list: ONLY include diggable block names, never item drop names
  // and compute desired drop item names for pickup sweeping.

  const DEBUG = true;

  let blocktypes = [];
  let desiredDropNames = [];
  if (blockDropMap[blockType]) {
    // Requested is a diggable block that has special drops (e.g., diamond_ore -> diamond)
    const registry = MCData.getInstance();
    const variantBlocks = blockDropMap[blockType].filter((name) => {
      try { return !!registry.getBlockId(name); } catch { return false; }
    });
    blocktypes = [blockType, ...variantBlocks];
    desiredDropNames = [...blockDropMap[blockType]];
  } else {
    // See if requested is a drop item; then scan for any blocks that can drop it
    const sourceBlocks = Object.entries(blockDropMap)
      .filter(([, drops]) => drops.includes(blockType))
      .map(([block]) => block);
    if (sourceBlocks.length > 0) {
      blocktypes = sourceBlocks;
      desiredDropNames = [blockType];
    } else {
      // Default case: assume the requested name is itself a block and its drop is itself
      blocktypes = [blockType];
      desiredDropNames = [blockType];
    }
  }
  blocktypes = [...new Set(blocktypes)];
  desiredDropNames = [...new Set(desiredDropNames)];
  if (DEBUG) {
    try {
      console.log(`[skills.collectBlock][init] blocktypes=${JSON.stringify(blocktypes)} desiredDrops=${JSON.stringify(desiredDropNames)} grownCropsOnly=${grownCropsOnly}`);
    } catch {}
  }
  const desiredDropNamesNormalized = desiredDropNames.map(n => n.toLowerCase());

  const cropAgeMap = { wheat: 7, beetroot: 3, carrot: 7, potato: 7 };
  const keyOf = (v) => `${v.x},${v.y},${v.z}`;
  const posEq = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z;
  const excluded = Array.isArray(exclude) ? exclude : [];
  // Track unreachable targets during this session to avoid retry loops
  const unreachableKeys = new Set();

  const candidates = new Map(); // key -> Vec3
  // Persistent drop tracking: id -> { pos: Vec3, spawnedAt: number, lastSeen: number, predicted: boolean, name?: string }
  const pendingDrops = new Map();
  const DETOUR_BUDGET = 10; // blocks of extra distance allowed by default
  const URGENT_AGE_MS = 4 * 60 * 1000; // 4 minutes
  const DESPAWN_MS = 5 * 60 * 1000; // 5 minutes
  const ABOUT_TO_DESPAWN_MS = DESPAWN_MS - 20 * 1000; // 20s margin
  const PRUNE_UNSEEN_MS = 15 * 1000; // if unseen for this long, consider gone
  const DROP_NEAR_RADIUS = 1.0;
  const DEBT_DROP_COUNT = 15;
  const MAX_SWEEP_ON_DEBT = 10;
  let emptyTicks = 0;
  const EMPTY_TICKS_BEFORE_EXIT = 60; // ~3s at 20Hz
  let isCollecting = false; // control-plane guard
  let currentTargetKey = null; // for observability
  const SCAN_EVERY_TICKS = 5; // throttle producer scans (~6-7Hz)
  const PRUNE_EVERY_TICKS = 10; // prune cadence (~2Hz)
  const MAX_CANDIDATES = 200; // cap pool to avoid O(n) bloat
  let tickIndex = 0;

  // Inventory-based progress tracking
  const registryForCount = MCData.getInstance();
  const countTarget = () => {
    try {
      if (bot.inventory && typeof bot.inventory.count === 'function' && desiredDropNames.length > 0) {
        return desiredDropNames.reduce((sum, name) => {
          let id = null;
          try { id = registryForCount.getItemId(name); } catch { id = null; }
          if (id == null) return sum;
          return sum + bot.inventory.count(id, null);
        }, 0);
      }
      const inv = world.getInventoryCounts(bot) || {};
      if (desiredDropNames.length > 0) {
        return desiredDropNames.reduce((sum, name) => sum + (inv[name] || 0), 0);
      }
      return 0;
    } catch {
      return 0;
    }
  };
  const baselineCount = countTarget();

  const isValidTarget = (position) => {
    let actual;
    try { actual = bot.blockAt(position); } catch { return false; }
    if (!actual) return false;
    if (!blocktypes.includes(actual.name)) return false;
    if (grownCropsOnly && cropAgeMap[blockType]) {
      if (actual._properties?.age !== cropAgeMap[blockType]) return false;
    }
    return true;
  };

  const isExcluded = (position) => unreachableKeys.has(keyOf(position)) || excluded.some(p => posEq(p, position));

  const onPhysicsTick = () => {
    try {
      tickIndex++;
      // Throttle heavy work
      const doScan = (tickIndex % SCAN_EVERY_TICKS) === 0;
      const doPrune = (tickIndex % PRUNE_EVERY_TICKS) === 0;
      if (!doScan && !doPrune) return;

      // Choose a lighter radius when we already have a pool
      const scanRadius = candidates.size === 0 ? VERY_FAR_DISTANCE : FAR_DISTANCE;
      const found = doScan ? (world.getNearestBlocks(bot, blocktypes, scanRadius) || []) : [];
      if (doScan && DEBUG) {
        try {
          console.log(`[skills.collectBlock][scan] scanRadius=${scanRadius} found=${found.length}`);
          const preview = found.slice(0, 5).map(b => `(${b.position.x},${b.position.y},${b.position.z}) ${b.name}`);
          if (preview.length > 0) console.log(`[skills.collectBlock][scan] first: ${preview.join(' | ')}`);
        } catch {}
      }
      let added = 0;
      if (doScan) {
        for (const b of found) {
          if (!b || !b.position) continue;
          const pos = b.position;
          if (isExcluded(pos)) continue;
          if (!isValidTarget(pos)) {
            if (DEBUG) console.log(`[skills.collectBlock][filter] rejected (${pos.x},${pos.y},${pos.z}) name=${bot.blockAt(pos)?.name} grownCropsOnly=${grownCropsOnly}`);
            continue;
          }
          const k = keyOf(pos);
          if (!candidates.has(k)) { candidates.set(k, pos); added++; }
        }
        // Cap pool size by keeping nearest
        if (candidates.size > MAX_CANDIDATES) {
          const trimmed = Array.from(candidates.values())
            .map(pos => ({ pos, dist: bot.entity.position.distanceTo(pos) }))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, MAX_CANDIDATES)
            .map(entry => entry.pos);
          candidates.clear();
          for (const pos of trimmed) candidates.set(keyOf(pos), pos);
        }
      }
      // Scan/update pending drops with visible item entities
      if (doScan) {
        try {
          world.getVisibleEntities(bot).then((visible) => {
            const now = Date.now();
            // First, index visible items by id and position
            const visibleItems = [];
            for (const e of visible) {
              if (e && e.name === 'item') {
                visibleItems.push(e);
              }
            }

            // Merge or insert visible items
            const normalizeDisp = (s) => (s || '').toLowerCase().replace(/\s+/g, '_');
            for (const it of visibleItems) {
              const id = it.id;
              const pos = it.position;
              const existing = pendingDrops.get(id);
              if (existing) {
                existing.pos = pos;
                existing.lastSeen = now;
                if (!existing.name && it.displayName) existing.name = normalizeDisp(it.displayName);
              } else {
                // Reconcile with any predicted drops near this position (within 1.5 blocks)
                let predictedMatchKey = null;
                let predictedSpawnTs = now;
                for (const [k, rec] of pendingDrops.entries()) {
                  if (rec.predicted && rec.pos.distanceTo(pos) <= 1.5) {
                    predictedMatchKey = k;
                    predictedSpawnTs = Math.min(predictedSpawnTs, rec.spawnedAt);
                    break;
                  }
                }
                if (predictedMatchKey) pendingDrops.delete(predictedMatchKey);
                // Only track items that match desired drop names to keep the pool relevant
                const itemNameNorm = normalizeDisp(it.displayName || '');
                const matchesDesired = itemNameNorm === '' || desiredDropNamesNormalized.includes(itemNameNorm);
                if (matchesDesired) {
                  pendingDrops.set(id, {
                    pos: pos,
                    spawnedAt: predictedSpawnTs,
                    lastSeen: now,
                    predicted: false,
                    name: itemNameNorm
                  });
                }
              }
            }

            // Prune drops that are unseen for too long or certainly despawned
            for (const [id, rec] of Array.from(pendingDrops.entries())) {
              const age = now - rec.spawnedAt;
              const unseen = now - rec.lastSeen;
              if (age >= DESPAWN_MS || unseen >= PRUNE_UNSEEN_MS) {
                pendingDrops.delete(id);
              }
            }
          }).catch(() => {});
        } catch {}
      }
      if (doPrune) {
        for (const [k, pos] of Array.from(candidates.entries())) {
          // Do not prune the current target while actively collecting
          if (isCollecting && k === currentTargetKey) continue;
          if (!isValidTarget(pos) || isExcluded(pos)) candidates.delete(k);
        }
      }
      if (doScan) {
        if (candidates.size === 0 && added === 0) emptyTicks++; else emptyTicks = 0;
      }
    } catch {}
  };

  bot.on('physicsTick', onPhysicsTick);

  // Note: collectedTarget is derived from inventory, not incremented manually
  let lastDugPos = null; // pivot: choose next candidate closest to this
  let zeroScanStreak = 0;
  let unreachableCount = 0;
  let digBatchCount = 0;
  // Track reasons for unreachable targets for end-of-run diagnostics
  const undiggableByBlock = new Map(); // blockName -> count
  const cannotHarvestByBlockTool = new Map(); // `${blockName}||${toolName}` -> count
  try {
    while (true) {
      const collectedTarget = countTarget() - baselineCount;
      if (collectedTarget >= num) break;
      console.log(`[skills.collectBlock] collected: ${collectedTarget}, candidates: ${candidates.size}`);

      if (bot.interrupt_code) break;

      // If currently collecting, yield and let the ongoing action finish
      if (isCollecting) {
        await new Promise(r => setTimeout(r, 50));
        continue;
      }

      if (candidates.size === 0) {
        zeroScanStreak++;
        // Diagnostic: if nothing in candidates, probe raw matches without visibility filter
        if (DEBUG) {
          try {
            const registry = MCData.getInstance();
            const ids = blocktypes
              .map((name) => { try { return registry.getBlockId(name); } catch { return null; } })
              .filter((id) => id != null);
            if (ids.length > 0) {
              const rawPositions = bot.findBlocks({ matching: ids, maxDistance: FAR_DISTANCE, count: 64 });
              console.log(`[skills.collectBlock][diagnostic] candidates empty; rawPositions=${rawPositions.length} within ${FAR_DISTANCE}`);
              for (let i = 0; i < Math.min(5, rawPositions.length); i++) {
                const p = rawPositions[i];
                const b = bot.blockAt(p);
                let vis = false; let visErr = null;
                try { vis = bot.canSeeBlock(b); } catch (e) { visErr = e?.message || String(e); }
                const dist = bot.entity.position.distanceTo(p).toFixed(2);
                console.log(`[skills.collectBlock][diagnostic] #${i+1} at (${p.x},${p.y},${p.z}) name=${b?.name} dist=${dist} visible=${vis}${visErr ? ` err=${visErr}` : ''}`);
              }
            } else {
              console.log(`[skills.collectBlock][diagnostic] candidates empty; no valid block IDs computed for blocktypes=${JSON.stringify(blocktypes)}`);
            }
          } catch {}
        }
        if (zeroScanStreak >= 3 || emptyTicks > EMPTY_TICKS_BEFORE_EXIT) {
          if (collectedTarget > 0) log(bot, `You collected ${collectedTarget} ${blockType}, and don't see more ${blockType} around`);
          else log(bot, `No ${blockType} found around.`);
          break;
        }
        await new Promise(r => setTimeout(r, 100));
        continue;
      } else {
        zeroScanStreak = 0;
      }

      const nearest = Array.from(candidates.values())
        .map(pos => ({ pos, dist: (lastDugPos ? lastDugPos.distanceTo(pos) : bot.entity.position.distanceTo(pos)) }))
        .sort((a, b) => a.dist - b.dist)[0];
      if (DEBUG && nearest && nearest.pos) {
        const b = bot.blockAt(nearest.pos);
        console.log(`[skills.collectBlock][choose] target (${nearest.pos.x},${nearest.pos.y},${nearest.pos.z}) ${b?.name} d=${nearest.dist.toFixed(2)}`);
      }
      if (DEBUG) {
        const preview = Array.from(candidates.values())
          .map(pos => ({ pos, dist: bot.entity.position.distanceTo(pos) }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 5)
          .map(e => `(${e.pos.x},${e.pos.y},${e.pos.z}) d=${e.dist.toFixed(2)}`);
        console.log(`[skills.collectBlock][pick] top candidates: ${preview.join(' | ')}`);
      }
      const targetPos = nearest.pos;
      const targetKey = keyOf(targetPos);

      if (!isValidTarget(targetPos)) { candidates.delete(targetKey); continue; }

      let targetBlock;
      try { targetBlock = bot.blockAt(targetPos); } catch { candidates.delete(targetKey); continue; }
      if (!targetBlock) { candidates.delete(targetKey); continue; }

      // Skip undiggable blocks (e.g., bedrock) and mark as unreachable for this session
      try {
        if (targetBlock && targetBlock.diggable === false) {
          if (DEBUG) console.log(`[skills.collectBlock] undiggable ${targetBlock.name} at (${targetPos.x},${targetPos.y},${targetPos.z}) -> marking unreachable`);
          try {
            unreachableKeys.add(targetKey); 
            unreachableCount++;
            const bname = targetBlock.name;
            undiggableByBlock.set(bname, (undiggableByBlock.get(bname) || 0) + 1);
          } catch {}
          candidates.delete(targetKey);
          continue;
        }
      } catch {}

      // Try to equip the right tool for the block
      try { await bot.tool.equipForBlock(targetBlock); } catch {}
      const itemId = bot.heldItem ? bot.heldItem.type : null;
      // If we still cannot harvest with the currently equipped tool (or empty hand),
      // mark as unreachable to avoid infinite re-discovery loops.
      try {
        if (!targetBlock.canHarvest(itemId)) {
          const toolName = (bot.heldItem && bot.heldItem.name) ? bot.heldItem.name : 'empty hand';
          if (DEBUG) console.log(`[skills.collectBlock] cannot harvest ${targetBlock.name} with ${toolName} at (${targetPos.x},${targetPos.y},${targetPos.z}) -> marking unreachable`);
          try {
            unreachableKeys.add(targetKey); 
            unreachableCount++;
            const bname = targetBlock.name;
            const key = `${bname}||${toolName}`;
            cannotHarvestByBlockTool.set(key, (cannotHarvestByBlockTool.get(key) || 0) + 1);
          } catch {}
          candidates.delete(targetKey);
          continue;
        }
      } catch {
        // If canHarvest throws for any reason, be conservative and mark as unreachable
        try {
          unreachableKeys.add(targetKey); 
          unreachableCount++;
          const toolName = (bot.heldItem && bot.heldItem.name) ? bot.heldItem.name : 'empty hand';
          const bname = targetBlock?.name || 'unknown';
          const key = `${bname}||${toolName}`;
          cannotHarvestByBlockTool.set(key, (cannotHarvestByBlockTool.get(key) || 0) + 1);
        } catch {}
        candidates.delete(targetKey);
        continue;
      }

      // Decide on a detour drop before heading to target block
      // A greedy detour-budget heuristic for pickup-and-delivery TSP with time-window constraints.
      try {
        const now = Date.now();
        let bestDropEntry = null;
        let bestDelta = Number.POSITIVE_INFINITY;
        const cur = bot.entity.position;
        const direct = cur.distanceTo(targetPos);
        for (const [did, rec] of pendingDrops.entries()) {
          const drop = rec.pos;
          const delta = cur.distanceTo(drop) + drop.distanceTo(targetPos) - direct;
          const urgent = (now - rec.spawnedAt) >= URGENT_AGE_MS;
          const budget = urgent ? 3 * DETOUR_BUDGET : DETOUR_BUDGET;
          // Only consider desired drops or predicted ones (which will reconcile shortly)
          const isDesired = rec.predicted || (rec.name && desiredDropNamesNormalized.includes(rec.name.toLowerCase()));
          if (isDesired && delta <= budget && delta < bestDelta) {
            bestDelta = delta;
            bestDropEntry = [did, rec];
          }
        }
        if (bestDropEntry) {
          const [did, rec] = bestDropEntry;
          try {
            bot.pathfinder.setMovements(new pf.Movements(bot));
            await bot.pathfinder.goto(new pf.goals.GoalNear(rec.pos.x, rec.pos.y, rec.pos.z, DROP_NEAR_RADIUS));
            await new Promise(r => setTimeout(r, 120));
          } catch {}
          finally {
            pendingDrops.delete(did);
          }
          if (bot.interrupt_code) break;
        }
      } catch {}

      // Mark control-plane state and remove from pool before starting
      isCollecting = true;
      currentTargetKey = targetKey;
      candidates.delete(targetKey);
      try {
        // Use in-house digBlock (break + targeted pickup). Throws on specific reasons.
        await digBlock(bot, targetBlock);
        // Update lastDugPos only if block actually broke
        try {
          const now = bot.blockAt(targetPos);
          if (!now || now.name !== targetBlock.name) lastDugPos = targetPos.clone();
        } catch { lastDugPos = targetPos.clone(); }
        const collectedTargetNow = countTarget() - baselineCount;
        if (DEBUG) console.log(`[skills.collectBlock][dig] attempted ${targetBlock.name} at (${targetPos.x},${targetPos.y},${targetPos.z}) -> total ${collectedTargetNow}`);
        digBatchCount++;
        // Predict a drop at the dig position
        const predId = `pred:${targetPos.x},${targetPos.y},${targetPos.z}:${Date.now()}`;
        pendingDrops.set(predId, { pos: targetPos.clone(), spawnedAt: Date.now(), lastSeen: Date.now(), predicted: true });
      } catch (err) {
        const name = err?.name || (err && typeof err === 'object' ? (err).constructor?.name : String(err));
        const msg = err?.message || String(err);
        const stack = err?.stack || "<no stack>";
        const heldName = bot.heldItem ? bot.heldItem.name : '<empty hand>';
        const heldType = bot.heldItem ? bot.heldItem.type : null;
        let canHarvestNow = false;
        try { canHarvestNow = targetBlock.canHarvest(heldType); } catch {}
        const collectedTargetNow = (typeof countTarget === 'function') ? (countTarget() - baselineCount) : undefined;
        const ctx = {
          target: { name: targetBlock?.name, pos: { x: targetPos?.x, y: targetPos?.y, z: targetPos?.z } },
          held: { name: heldName, type: heldType },
          canHarvestNow,
          collectedSoFar: collectedTargetNow,
          candidatesSize: candidates.size,
          isCollecting,
          unreachableCount
        };
        // Handle our new error codes first (best-effort: continue)
        if (msg === 'BreakFailed' || msg === 'NoDropsVisible' || msg === 'PickupTimeout' || msg === 'PickupFailed' || name === 'AcquireFailed') {
          console.log(`[skills.collectBlock] digBlock issue: ${msg} context=${JSON.stringify(ctx)}`);
          // Mark this target as unreachable so it won't re-enter the pool
          try { unreachableKeys.add(targetKey); unreachableCount++; } catch {}
          // Even on pickup failure, rely on inventory progress; fall through to other logic
        }
      } finally {
        // Clear control-plane state
        isCollecting = false;
        currentTargetKey = null;
      }

      // Fallback sweep (rare): if pickup debt is high or drops are about to despawn
      try {
        const now = Date.now();
        let oldestAge = 0;
        for (const rec of pendingDrops.values()) {
          if (rec.predicted) continue; // ignore predicted for despawn urgency
          oldestAge = Math.max(oldestAge, now - rec.spawnedAt);
        }
        const pickupDebtTooHigh = pendingDrops.size >= DEBT_DROP_COUNT || oldestAge >= ABOUT_TO_DESPAWN_MS;
        if (pickupDebtTooHigh && pendingDrops.size > 0) {
          const ordered = Array.from(pendingDrops.entries())
            .filter(([, rec]) => rec.predicted || (rec.name && desiredDropNamesNormalized.includes(rec.name.toLowerCase())))
            .map(([id, rec]) => ({ id, rec, d: bot.entity.position.distanceTo(rec.pos) }))
            .sort((a, b) => a.d - b.d)
            .slice(0, MAX_SWEEP_ON_DEBT);
          for (const { id, rec } of ordered) {
            try {
              bot.pathfinder.setMovements(new pf.Movements(bot));
              await bot.pathfinder.goto(new pf.goals.GoalNear(rec.pos.x, rec.pos.y, rec.pos.z, DROP_NEAR_RADIUS));
              await new Promise(r => setTimeout(r, 120));
            } catch {}
            finally {
              pendingDrops.delete(id);
            }
            if (bot.interrupt_code) break;
          }
          // After a sweep, reset batch count to encourage more digging before next sweep
          digBatchCount = 0;
        }
      } catch {}
    }
  } finally {
    try { bot.removeListener('physicsTick', onPhysicsTick); } catch {}
  }

  const finalCollected = countTarget() - baselineCount;
  if (unreachableCount > 0) {
    log(bot, `Collected ${finalCollected} ${blockType}. Visible but unreachable: ${unreachableCount}.`);
    // Provide breakdown of unreachable reasons for visibility
    try {
      const details = [];
      if (undiggableByBlock.size > 0) {
        for (const [bname, cnt] of undiggableByBlock.entries()) {
          details.push(`${cnt} ${bname} not diggable`);
        }
      }
      if (cannotHarvestByBlockTool.size > 0) {
        for (const [key, cnt] of cannotHarvestByBlockTool.entries()) {
          const [bname, toolName] = key.split('||');
          details.push(`${cnt} ${bname} cannot be harvested with ${toolName}`);
        }
      }
      if (details.length > 0) {
        log(bot, `Unreachable breakdown:\n- ${details.join('\n- ')}`);
      }
    } catch {}
  } else {
    log(bot, `Collected ${finalCollected} ${blockType}.`);
  }
  return finalCollected > 0;
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
  let pickedUp = 0;

  while (true) { // Loop until no more visible items are nearby or movement fails
    const visibleEntities = await world.getVisibleEntities(bot);
    const nearbyItems = visibleEntities.filter(entity =>
      entity.name === "item" &&
      bot.entity.position.distanceTo(entity.position) < distance
    );

    if (nearbyItems.length === 0) {
      break; // No more items to pick up
    }

    // Sort by distance to get the nearest
    nearbyItems.sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position));
    const nearestItem = nearbyItems[0];

    try {
      bot.pathfinder.setMovements(new pf.Movements(bot));
      await bot.pathfinder.goto(new pf.goals.GoalFollow(nearestItem, 0.8), true);
      await new Promise(resolve => setTimeout(resolve, 200)); // Wait for bot to potentially pick up item

      // Check if the specific item entity still exists and is visible
      // This is a simple check; more robust would involve tracking entity IDs
      const stillVisibleItems = (await world.getVisibleEntities(bot)).filter(entity =>
          entity.name === "item" &&
          bot.entity.position.distanceTo(entity.position) < distance &&
          entity.id === nearestItem.id // Check if the same entity ID is still around
      );

      if (stillVisibleItems.length === 0) {
          pickedUp++; // Assume item was picked up if it's no longer visible/nearby
      } else {
          // Item might still be there, maybe pathfinding failed or pickup was slow.
          // Could implement a retry mechanism or just break if stuck.
          // For simplicity, let's check if we are stuck on the same item.
          const currentNearestItem = stillVisibleItems.sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))[0];
          if (currentNearestItem && currentNearestItem.id === nearestItem.id && bot.entity.position.distanceTo(currentNearestItem.position) < 1.5) {
              log(bot, "Seems stuck trying to pick up an item, stopping pickup attempt.");
              break; // Break if potentially stuck
          }
      }
    } catch (err) {
        log(bot, `Error during pathfinding/pickup for item ${nearestItem.id}: ${err.message}. Stopping.`);
        break; // Stop if pathfinding throws an error
    }

    if (bot.interrupt_code) {
        log(bot, "Pickup items interrupted.");
        break;
    }
  }

  log(bot, `Picked up ${pickedUp} items.`);
  return true;
}

// Deprecated: moved to library/functions.js
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
  return functionsBreakBlockAt(bot, x, y, z);
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
  await new Promise((resolve) => setTimeout(resolve, 200));
  await bot.lookAt(player.position);
  await new Promise((resolve) => setTimeout(resolve, 300));
  for (const { name, quantity } of itemsList) {
    await discard(bot, name, quantity);
  }
  // After tossing items, step back a bit to avoid picking them up ourselves
  try {
    bot.setControlState("back", true);
    await new Promise((resolve) => setTimeout(resolve, 200)); // ~two short steps
    bot.setControlState("back", false);
  } catch (_) {}
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
   * Navigate to the given player by following them until within distance, then stop.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} username, the username of the player to navigate to.
   * @param {number} distance, the goal distance to the player.
   * @returns {Promise<boolean>} true if reached (within distance), false otherwise.
   */

  if (bot.modes.isOn("cheat")) {
    bot.chat("/tp @s " + username);
    log(bot, `Teleported to ${username}.`);
    return true;
  }

  bot.modes.pause("self_defense");
  bot.modes.pause("cowardice");

  const startTs = Date.now();
  const maxMs = 60000; // 1 minute ceiling to avoid hanging forever

  const resolvePlayer = () => bot.players[username]?.entity || null;
  let player = resolvePlayer();
  if (!player) {
    log(
      bot,
      `${username} is too far for me to detect. Ask if player wants me to teleport directly, or press F3 and tell me your coordinates in chat.`
    );
    return false;
  }

  // Use dynamic GoalFollow instead of goto() so we continuously track moving targets
  const movements = new pf.Movements(bot);
  bot.pathfinder.setMovements(movements);
  bot.pathfinder.setGoal(new pf.goals.GoalFollow(player, distance), true);

  try {
    while (true) {
      if (bot.interrupt_code) return false;
      // Refresh player entity (can change as players re-entity)
      player = resolvePlayer();
      if (!player) return false;

      const dist = bot.entity.position.distanceTo(player.position);
      if (dist <= Math.max(2, distance)) {
        // Arrived
        bot.pathfinder.stop();
        log(bot, `You have reached ${username}.`);
        return true;
      }

      if (Date.now() - startTs > maxMs) {
        bot.pathfinder.stop();
        log(bot, `Failed to reach ${username}: navigation timed out.`);
        return false;
      }

      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (_err) {
    // Ensure we stop any residual goal on error
    try { bot.pathfinder.stop(); } catch {}
    return false;
  }
}

export async function teleportToPlayer(bot, username, agent) {
  /**
   * Teleport to the given player.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} username, the username of the player to teleport to.
   * @param {Agent} agent - Reference to the agent instance.
   * @returns {Promise<boolean>} true if the player was found and teleported to, false otherwise.
   * @example
   * await skills.teleportToPlayer(bot, "player", agent);
   **/
  if (!username) {
    log(bot, `No username provided.`);
    return false;
  }

  if (!agent.cheatsEnabled) {
    log(bot, "Cannot teleport: Cheats are not enabled for you.");
    return false;
  }

  bot.chat("/tp @s " + username);
  await new Promise((resolve) => setTimeout(resolve, 500)); // wait for tp to complete
  
  let player = bot.players[username]?.entity;
  if (player && bot.entity.position.distanceTo(player.position) <= 0.5) {
    log(bot, `Teleported to ${username}.`);
    return true;
  } else {
    log(bot, "Teleport failed - you're not next to the player.");
    return false;
  }
}

export async function followPlayer(bot, username, distance = 4) {
  /**
   * Follow the given player endlessly. Will not return until the code is manually stopped.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @param {string} username, the username of the player to follow.
   * @param {number} distance, the distance to maintain while following.
   * @returns {Promise<boolean>} true if the player was found and follow mode enabled, false otherwise.
   * @example
   * await skills.followPlayer(bot, "player");
   **/
  let player = bot.players[username]?.entity;
  if (!player) {
      log(bot, `Could not find player ${username} to follow.`);
      return false;
  }

  // Activate the follow_target mode
  if (bot.modes && bot.modes.modes_map['follow_target']) {
      const agent = bot;
      bot.modes.modes_map['follow_target'].setTarget(agent, player, distance);
      log(bot, `Now following ${username}.`);
      return true;
  } else {
      log(bot, "Error: Follow mode is not available.");
      return false;
  }
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
  let enemy = null;

  while (true) { // Loop until no visible, close hostile enemies are found
    const visibleEntities = await world.getVisibleEntities(bot);
    const hostileMobsInRange = visibleEntities.filter(entity =>
      MCData.getInstance().isHostile(entity) &&
      bot.entity.position.distanceTo(entity.position) <= distance
    );

    // Sort by distance to get the nearest
    hostileMobsInRange.sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position));

    enemy = hostileMobsInRange.length > 0 ? hostileMobsInRange[0] : null;

    if (!enemy) {
      break; // Exit loop if no suitable enemy found
    }

    const follow = new pf.goals.GoalFollow(enemy, distance + 1); // move a little further away
    const inverted_goal = new pf.goals.GoalInvert(follow);
    bot.pathfinder.setMovements(new pf.Movements(bot));
    bot.pathfinder.setGoal(inverted_goal, true);
    await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for movement

    if (bot.interrupt_code) {
      break;
    }
  }

  bot.pathfinder.stop();
  log(bot, `Moved ${distance} away from enemies.`);
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
    matching: (block) => block.name.includes("_bed") || block.name === "bed",
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
      log(bot, `Successfully slept in bed at ${bedPosition}.`);
      
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
      // Do nothing
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
   **/
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
  const visibleEntities = await world.getVisibleEntities(bot);
  const targetEntities = visibleEntities.filter(entity => entity.name === entityType);

  if (targetEntities.length === 0) {
    log(bot, `Could not find any visible ${entityType} to activate.`);
    return false;
  }

  // Sort by distance to find the nearest
  targetEntities.sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position));
  let entity = targetEntities[0];

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
  if (!containerIdentifier) {
      errorMsg = `Invalid containerIdentifier: it cannot be empty. Expected format 'block_name@(x,y,z)'.`;
  } else {
    const atIndex = containerIdentifier.indexOf('@');
    const openParenIndex = containerIdentifier.indexOf('('); // Should be after @
    if (atIndex === -1 || openParenIndex === -1 || openParenIndex <= atIndex) {
      errorMsg = `Invalid containerIdentifier format: \"${containerIdentifier}\". Expected format 'block_name@(x,y,z)'. Missing or misplaced '@' or '('.`;
    } else {
      blockName = containerIdentifier.slice(0, atIndex); // Get text before '@'
      positionString = containerIdentifier.slice(atIndex + 1); // Get text from '@' onwards
      if (!blockName) {
        errorMsg = `Invalid containerIdentifier format: \"${containerIdentifier}\". Block name is empty.`;
      }
      if (!positionString.startsWith('(') || !positionString.endsWith(')')) {
        errorMsg = `Invalid containerIdentifier format: \"${containerIdentifier}\". Position part is invalid: ${positionString}. Expected (x,y,z).`;
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
   * @param {string} containerIdentifier - The identifier string, e.g., 'chest@(x,y,z)'.
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
    message += `\n if you wish to withdraw items, use withdrawFromContainer.`;
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
   * @param {string} containerIdentifier - The identifier string, e.g., 'chest@(x,y,z)'.
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
   * @param {string} containerIdentifier - The identifier string, e.g., 'chest@(x,y,z)'.
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

export async function unequip(bot, destination) {
  /**
   * Unequip an item from a specific body part.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @param {string} destination - The body part to unequip from (e.g., 'hand', 'torso', 'off-hand').
   * @returns {Promise<string>} A message indicating success or failure.
   * @example
   * await skills.unequip(bot, 'hand');
   * await skills.unequip(bot, 'off-hand');
   */
  if (!destination) {
    const message = "No destination specified for unequipping.";
    log(bot, message);
    return message;
  }

  try {
    await bot.unequip(destination);
    const message = `Your ${destination} armor is now in your backpack.`;
    log(bot, message);
    return message;
  } catch (err) {
    // Catch potential errors, although bot.unequip is usually forgiving.
    const message = `Failed to unequip from ${destination}: ${err.message}`;
    log(bot, message);
    return message;
  }
}

// --- End Container Interaction Skills ---

export async function checkCheats(bot, ownerUsername, agent) {
  /**
   * Check if cheats are enabled on the server by attempting to teleport to the owner.
   * Updates the agent's cheatsEnabled instance variable.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @param {string} ownerUsername - The username of the owner to teleport to.
   * @param {Agent} agent - Reference to the agent instance.
   * @returns {Promise<string>} A message indicating the result.
   */
  try {

    bot.chat(`/tp @s ${ownerUsername}`);
    await new Promise((resolve) => setTimeout(resolve, 25)); // Wait for teleport

    const ownerEntity = bot.players[ownerUsername]?.entity;
    if (ownerEntity && bot.entity.position.distanceTo(ownerEntity.position) <= 0.5) {
      agent.cheatsEnabled = true;
      const distance = bot.entity.position.distanceTo(ownerEntity.position);
      const message = `Cheats are ENABLED for you.`;
      log(bot, message);
      return message;
    } else {
      agent.cheatsEnabled = false;
      const message = `Cheats are DISABLED for you.`;
      log(bot, message);
      return message;
    }

  } catch (err) {
    const message = `Failed to check cheats: ${err.message}`;
    log(bot, message);
    return message;
  }
}

export async function generateStructure(bot, structure_id, agent) {
  /**
   * Generate a structure from Supabase by executing Minecraft commands.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @param {number} structure_id - The ID of the structure to generate from the Supabase structures table.
   * @param {Agent} agent - Reference to the agent instance.
   * @returns {Promise<string>} A message indicating success or failure.
   * @example
   * await skills.generateStructure(bot, 1, agent);
   */
  try {
    // Check if cheats are enabled using the agent's instance variable
    if (!agent.cheatsEnabled) {
      const message = "Cannot generate structure: Cheats are not enabled for you. Structure generation requires operator permissions or cheats to be enabled.";
      log(bot, message);
      return message;
    }

    // Fetch structure data from local API
    let structureResponse;
    try {
      structureResponse = await axios.get(`http://localhost:10101/structure/${structure_id}`);
    } catch (error) {
      if (error.response?.status === 404) {
        const message = `Structure ID ${structure_id} does not exist. Please check the ID and try again.`;
        log(bot, message);
        return message;
      }
      const message = `Failed to fetch structure ${structure_id}: ${error.response?.data?.error || error.message}`;
      log(bot, message);
      return message;
    }
    
    const operations = structureResponse.data.buildscript;
    const structurePrompt = structureResponse.data.prompt;
    
    if (!operations || !Array.isArray(operations)) {
      const message = `Invalid structure data format for ${structure_id}. Expected buildscript to be an array of operations.`;
      log(bot, message);
      return message;
    }
    
    // Get bot's current position as the origin for the structure
    const botPos = bot.entity.position;
    const originX = Math.floor(botPos.x);
    const originY = Math.floor(botPos.y);
    const originZ = Math.floor(botPos.z);
    
    let successCount = 0;
    let errorCount = 0;

    // Execute each operation
    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      
      if (bot.interrupt_code) {
        log(bot, "Structure generation interrupted.");
        break;
      }

      try {
        let command = "";
        
        if (operation.op === "fill") {
          // Format: /fill x1 y1 z1 x2 y2 z2 block
          // Add bot's position to make it relative to bot
          const [x1, y1, z1] = operation.from;
          const [x2, y2, z2] = operation.to;
          const worldX1 = originX + x1;
          const worldY1 = originY + y1;
          const worldZ1 = originZ + z1;
          const worldX2 = originX + x2;
          const worldY2 = originY + y2;
          const worldZ2 = originZ + z2;
          command = `/fill ${worldX1} ${worldY1} ${worldZ1} ${worldX2} ${worldY2} ${worldZ2} ${operation.block}`;
        } else if (operation.op === "setBlock") {
          // Format: /setblock x y z block
          // Add bot's position to make it relative to bot
          const worldX = originX + operation.x;
          const worldY = originY + operation.y;
          const worldZ = originZ + operation.z;
          command = `/setblock ${worldX} ${worldY} ${worldZ} ${operation.block}`;
        } else {
          console.warn(`[generateStructure] Unknown operation type: ${operation.op}`);
          errorCount++;
          continue;
        }

        // Execute the command
        bot.chat(command);
        successCount++;
      } catch (err) {
        console.error(`[generateStructure] Error executing operation ${i}:`, err);
        errorCount++;
      }
    }

    // Update the generations counter via API
    try {
      await axios.post(`http://localhost:10101/structure/${structure_id}/increment-generations`);
    } catch (updateErr) {
      console.error(`[generateStructure] Error updating generations counter:`, updateErr.response?.data?.error || updateErr.message);
    }

    const message = `Structure ${structure_id} generation completed. Successfully executed ${successCount} operations${errorCount > 0 ? `, with ${errorCount} errors` : ''}.`;
    log(bot, message);
    
    // Tell the bot what it just built
    log(bot, `You just built: ${structurePrompt}`);
    
    return message;

  } catch (err) {
    const message = `Failed to generate structure: ${err.message}`;
    log(bot, message);
    return message;
  }
}

// --- Emote Skills ---

// Helper Functions
const delay = ms => new Promise(res => setTimeout(res, ms));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min, max) => Math.random() * (max - min) + min;
const randDur = (base = 75, range = 25) => base + randInt(-range, range); // Random duration around a base

async function tap(bot, state, times, dur = 75) {
  for (let i = 0; i < times; i++) {
    bot.setControlState(state, true);
    await delay(dur);
    bot.setControlState(state, false);
    await delay(dur);
  }
}

async function hold(bot, state, ms) {
  bot.setControlState(state, true);
  await delay(ms);
  bot.setControlState(state, false);
}

async function look(bot, yawDeg, pitchDeg, ms = 0) {
  const rad = x => (x * Math.PI) / 180;
  // Ensure yaw stays within [-180, 180) for consistency if needed, though bot.look handles wrapping
  // yawDeg = ((yawDeg + 180) % 360) - 180;
  bot.look(rad(yawDeg), rad(pitchDeg), true);
  if (ms) await delay(ms);
}

async function wave(bot, times = 3, hand = 'right') {
  // Add randomness to wave helper
  const numWaves = randInt(2, 4); // Wave 2-4 times
  for (let i = 0; i < times; i++) {
    // Check if hand is empty before swinging? Maybe too complex for now.
    bot.swingArm(hand);
    await delay(randDur(200, 50)); // Random delay between waves
  }
}

const emotes = {
  hello: async (bot) => {
    await tap(bot, 'sneak', randInt(3, 5), randDur(75, 15)); // 3-5 taps, 60-90ms duration
  },
  bow: async (bot) => {
    await tap(bot, 'sneak', randInt(2, 4), randDur(80, 20)); // 2-4 taps first
    await delay(randDur(180, 40)); // 140-220ms delay
    await tap(bot, 'sneak', 1, randDur(100, 20)); // Single tap last, slightly longer duration
  },
  twerk: async (bot) => {
    await tap(bot, 'sneak', randInt(10, 15), randDur(40, 10)); // 10-15 taps, 30-50ms duration (fast)
  },
  yes: async (bot) => {
    // This emote controls head movement directly, so it ignores targetPosition.
    // Increased range of motion
    const currentYaw = bot.entity.yaw * 180 / Math.PI;
    const repetitions = randInt(2, 4); // 2-4 nods
    for (let i = 0; i < repetitions; i++) {
        await look(bot, currentYaw, randFloat(25, 40), randDur(120, 30)); // Look down 25-40 deg
        await delay(randDur(100, 40));
        await look(bot, currentYaw, randFloat(-25, -40), randDur(120, 30)); // Look up 25-40 deg
        await delay(100);
    }
  },
  no: async (bot) => {
    // This emote controls head movement directly, so it ignores targetPosition.
    // Increased range of motion
    const currentYaw = bot.entity.yaw * 180 / Math.PI;
    const currentPitch = bot.entity.pitch * 180 / Math.PI;
    const repetitions = randInt(2, 4); // 2-4 shakes
    for (let i = 0; i < repetitions; i++) {
        await look(bot, currentYaw - randFloat(25, 40), currentPitch, randDur(100, 30)); // Look left 25-40 deg
        await delay(randDur(100, 40));
        await look(bot, currentYaw + randFloat(25, 40), currentPitch, randDur(150, 40)); // Look right 25-40 deg
        await delay(100);
    }
  },
  spin: async (bot) => {
    // This emote controls head movement directly, so it ignores targetPosition.
    const turns = randInt(10, 16); // Random number of turns for smoothness variation
    // Increased speed
    const currentYaw = bot.entity.yaw * 180 / Math.PI;
    for(let i = 1; i <= turns; i++){
        await look(bot, currentYaw + (360 / turns) * i, 0, randDur(20, 5)); // Randomize step speed slightly (15-25ms)
        await delay(randDur(30, 10)); // Randomize delay between steps slightly (20-40ms)
    }
    await look(bot, currentYaw, 0, randDur(25, 10)); // Faster random return look
  },
  wave: async (bot) => {
      await wave(bot); // Call helper which now has randomness
  },
  pogo: async (bot) => {
      // Refined actions to only jump/sneak for pogo feel
      const actions = ['jump', 'sneak'];
      const randomAction = () => actions[Math.floor(Math.random() * actions.length)];
      const randomCount = () => Math.floor(Math.random() * 3) + 1; // 1-3 times
      const randomDelay = () => Math.floor(Math.random() * 100) + 50; // 50-150ms
      const numLoops = randInt(6, 10); // Random number of loops
      for (let i = 0; i < numLoops; i++) {
          await tap(bot, randomAction(), randomCount(), randomDelay());
          await delay(randomDelay());
      }
  },
  cheer: async (bot) => {
      await tap(bot, 'jump', randInt(1, 3), randDur(100, 20));
      await tap(bot, 'sneak', randInt(1, 3), randDur(80, 20));
      await tap(bot, 'jump', randInt(1, 3), randDur(100, 20));
      await tap(bot, 'sneak', randInt(1, 3), randDur(80, 20));
      await tap(bot, 'jump', randInt(1, 2), randDur(120, 20)); // Fewer jumps at the end
  },
};

export async function emote(bot, emoteType) {
  /**
   * Perform a visual emote.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @param {string} emoteType - The type of emote (e.g., 'hello', 'nod', 'spin').
   * Attempts to look at the nearest entity during non-look-based emotes.
   * @returns {Promise<string>} A message indicating success or failure.
   */
  if (emotes[emoteType]) {
    try {
      // Find nearest entity to look at (similar to idle_staring)
      const entity = bot.nearestEntity((e) => e.type !== 'object' && e.type !== 'orb' && e.name !== 'enderman' && e.name !== 'item'); // Filter out objects/items/endermen
      if (entity && entity.position.distanceTo(bot.entity.position) < 10) {
          // Find nearest PLAYER entity to look at
          const entity = bot.nearestEntity((e) => e.type === 'player');
          // Players don't have a 'baby' state affecting height this way, use standard player height
          const height = 1.62; // Standard player eye height

          // Perform the lookAt here, once, before calling the specific emote.
          const targetPosition = entity.position.offset(0, height, 0);
          await bot.lookAt(targetPosition);
      }
      // No need to pass targetPosition to the emote function
      await emotes[emoteType](bot);
      const message = `Successfully performed emote: ${emoteType}.`;
      return message;
    } catch (error) {
      const message = `Failed to perform emote ${emoteType}: ${error.message}`;
      console.error(error); // Log full error for debugging
      return message;
    }
  } else {
    const validEmotes = Object.keys(emotes).join(', ');
    const message = `Invalid emote type "${emoteType}". Valid emotes are: ${validEmotes}.`;
    return message;
  }
}

// --- End Emote Skills ---