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
import { collectBlocks } from "./modules/blockCollection.js";

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

function success(bot, message = null, chat = false) {
  if (message) log(bot, message, chat);
  return true;
}

function failure(bot, message = null, chat = false) {
  if (message) log(bot, message, chat);
  return false;
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
        const placed = await placeBlock(bot, "crafting_table", pos.x, pos.y, pos.z);
        if (!placed) return failure(bot, `Failed to place crafting table to craft ${itemName}.`);
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
      return failure(bot, `No known recipes to craft ${itemName}${wasTableAttempted ? ' using a crafting table' : ' from inventory'}.`);
    } else {
      const recipeToAnalyze = allPotentialRecipes[0]; // Analyze the first available recipe
      const recipeRequiresTable = recipeToAnalyze.requiresTable;

      if (recipeRequiresTable && !craftingTable) {
          return failure(bot, `Cannot craft ${itemName} as it requires a crafting table, which is not available.`);
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
          return failure(bot, `Cannot craft ${num}x ${itemName}. Missing: ${missingReport.join(', ')}. Try again once you have these items. Consider crafting them or sourcing them.`);
        } else {
          // This case implies recipesFor failed but allPotentialRecipes[0] somehow suggests we have ingredients.
          // This should be rare if recipesFor is robust.
          // Or, it could mean recipeToAnalyze.result.count is 0 or invalid, leading to targetCraftCount issues.
          return failure(bot, `Cannot craft ${itemName}. Resources might be unavailable or a conflicting recipe state was encountered (e.g. recipesFor failed but a recipe in recipesAll seems craftable).`);
        }
      }
    }
    return failure(bot);
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
    return failure(bot, `Cannot craft ${num}x ${itemName}. Missing: ${missingIngredientsReport.join(', ')}. Try again once you have these items. Consider crafting them or sourcing them.`);
  }

  try {
    await bot.craft(recipe, actualNum, craftingTable);
    return success(
      bot,
      `Successfully crafted ${itemName}, you now have ${world.getInventoryCounts(bot)[itemName] || 0} ${itemName}.`
    );
  } catch (err) {
    return failure(bot, `Crafting ${num}x ${itemName} failed during the actual crafting attempt: ${err.message}. This might be due to a quick inventory change or an internal crafting error.`);
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
  if (validationError) return false;

  if (!furnaceBlock.name.includes('furnace')) {
      return failure(bot, `Block ${furnaceIdentifier} is a ${furnaceBlock.name}, not a furnace.`);
  }
  
  let furnace;
  try {
    furnace = await bot.openFurnace(furnaceBlock);
  } catch (err) {
    return failure(bot, `Failed to open furnace ${furnaceIdentifier}: ${err.message}`);
  }

  let successFlag = false;
  try {
    const inventoryCounts = world.getInventoryCounts(bot);
    let amountToSmelt = num;
    if (!inventoryCounts[itemName] || inventoryCounts[itemName] < num) {
      const availableAmount = inventoryCounts[itemName] || 0;
      if (availableAmount === 0) {
        return failure(bot, `You do not have any ${itemName} to put in the furnace.`);
      }
      log(bot, `Not enough ${itemName} for ${num}. Using available ${availableAmount} instead.`);
      amountToSmelt = availableAmount;
    }

    if (!furnace.fuelItem()) {
      const fuelItem = bot.inventory.items().find((item) => item.name === fuelItemName);
      if (!fuelItem || fuelItem.count < fuelQuantity) {
        return failure(bot, `Not enough ${fuelItemName} fuel (need ${fuelQuantity}, have ${fuelItem ? fuelItem.count : 0}). Cannot start smelting.`);
      }
      try {
        await furnace.putFuel(fuelItem.type, null, fuelQuantity);
        log(bot, `Added ${fuelQuantity} ${fuelItemName} as fuel.`);
      } catch (fuelErr) {
        return failure(bot, `Failed to add ${fuelItemName} fuel: ${fuelErr.message}`);
      }
    }

    try {
      const inputItemType = MCData.getInstance().getItemId(itemName);
      if (!inputItemType) {
        return failure(bot, `Item name "${itemName}" not found in registry.`);
      }
      await furnace.putInput(inputItemType, null, amountToSmelt);
      log(bot, `Added ${amountToSmelt} ${itemName} to input slot.`);
    } catch (inputErr) {
      return failure(bot, `Failed to add ${itemName} to input: ${inputErr.message}`);
    }

    log(bot, `Successfully prepared ${furnaceIdentifier} with fuel and ${amountToSmelt} ${itemName}.`);
    successFlag = true;
  } finally {
    try {
      if (furnace) await furnace.close();
    } catch (closeErr) {
      log(bot, `Error closing furnace ${furnaceIdentifier}: ${closeErr.message}`);
      successFlag = false;
    }
  }
  return successFlag;
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
  if (validationError) return false;

  // Ensure it's specifically a furnace
  if (!furnaceBlock.name.includes('furnace')) {
      return failure(bot, `Block ${furnaceIdentifier} is a ${furnaceBlock.name}, not a furnace.`);
  }

  let furnace;
  try {
    furnace = await bot.openFurnace(furnaceBlock);
  } catch (err) {
    return failure(bot, `Failed to open furnace ${furnaceIdentifier}: ${err.message}`);
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

  let successFlag = true;
  try {
    await furnace.close();
  } catch (closeErr) {
    log(bot, `Error closing furnace ${furnaceIdentifier}: ${closeErr.message}`);
    successFlag = false;
  }
  return successFlag;
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
  if (validationError) return false;

  // Ensure it's specifically a furnace
  if (!furnaceBlock.name.includes('furnace')) {
      return failure(bot, `Block ${furnaceIdentifier} is a ${furnaceBlock.name}, not a furnace.`);
  }

  let furnace;
  try {
    furnace = await bot.openFurnace(furnaceBlock);
  } catch (err) {
    return failure(bot, `Failed to open furnace ${furnaceIdentifier}: ${err.message}`);
  }

  let successFlag = false;

  try {
    let itemTaken;
    if (itemType === "input") {
      const slotItem = furnace.inputItem();
      if (!slotItem) return failure(bot, `Input slot of ${furnaceIdentifier} is empty.`);
      itemTaken = await furnace.takeInput();
    } else if (itemType === "fuel") {
      const slotItem = furnace.fuelItem();
      if (!slotItem) return failure(bot, `Fuel slot of ${furnaceIdentifier} is empty.`);
      itemTaken = await furnace.takeFuel();
    } else if (itemType === "output") {
      const slotItem = furnace.outputItem();
      if (!slotItem) return failure(bot, `Output slot of ${furnaceIdentifier} is empty.`);
      itemTaken = await furnace.takeOutput();
    } else {
      return failure(bot, `Invalid item type "${itemType}". Use 'input', 'fuel', or 'output'.`);
    }

    if (!itemTaken) {
      return failure(bot, `Furnace ${furnaceIdentifier} did not yield an item from ${itemType} slot.`);
    }

    log(bot, `Successfully took ${itemTaken.count} ${itemTaken.name} (${itemType}) from ${furnaceIdentifier}.`);
    successFlag = true;
  } finally {
    try {
      await furnace.close();
    } catch (closeErr) {
      log(bot, `Error closing furnace ${furnaceIdentifier}: ${closeErr.message}`);
      successFlag = false;
    }
  }

  return successFlag;
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

  for (let i = 0; i < count; i++) {
    if (bot.interrupt_code) {
      return failure(bot, `Attack sequence interrupted after killing ${killedCount} ${mobType}(s).`);
    }

    const visibleEntities = await world.getVisibleEntities(bot); 
    visibleEntities.sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position));
    
    const target = visibleEntities.find(
      (entity) => entity !== bot.entity && entity.name === mobType
    );

    if (!target) {
      const message = killedCount > 0
        ? `Successfully killed ${killedCount} ${mobType}(s) but no additional targets were visible.`
        : `Action failed: Could not find any ${mobType} visible nearby to attack.`;
      return failure(bot, message);
    }

    const killSuccess = await attackEntity(bot, target, true);

    if (!killSuccess) {
      return failure(bot, `Attack sequence stopped after killing ${killedCount} ${mobType}(s) due to an issue killing target #${i + 1}.`);
    }
    
    killedCount++;
    await new Promise(resolve => setTimeout(resolve, 300)); 
  }

  return success(bot, `Successfully completed attack sequence. Killed ${killedCount} ${mobType}(s).`);
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
    return failure(bot, `Invalid block name provided: "${blockName}". It must be a sign block type.`);
  }

  // Parse position string
  let positionVec;
  try {
    const coords = positionString.match(/\((-?\d+(\.\d+)?),(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)\)/);
    if (!coords || coords.length < 6) {
      throw new Error("Invalid position string format. Expected (x,y,z).");
    }
    positionVec = new Vec3(parseFloat(coords[1]), parseFloat(coords[3]), parseFloat(coords[5])); 
  } catch (error) {
    return failure(bot, `Failed to parse position string "${positionString}": ${error.message}`);
  }

  // Find the block at the specified position
  const targetBlock = bot.blockAt(positionVec);

  if (!targetBlock) {
    return failure(bot, `Could not find any block at position ${positionString}.`);
  }

  // Verify the block is the correct type and is a sign
  if (targetBlock.name !== blockName) {
    return failure(bot, `Block at ${positionString} is a ${targetBlock.name}, not the expected ${blockName}.`);
  }
  if (!targetBlock.signText) { // Check if the block object has sign capabilities
    return failure(bot, `Block at ${positionString} (${targetBlock.name}) does not appear to be a sign block.`);
  }

  // Navigate closer if necessary
  if (bot.entity.position.distanceTo(targetBlock.position) > NEAR_DISTANCE) {
    log(bot, `Sign at ${positionString} is too far, moving closer...`);
    const reached = await goToPosition(bot, targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 2);
    if (!reached) {
        return failure(bot, `Failed to navigate to the sign at ${positionString}.`);
    }
  }
  
  // Look at the sign
  await bot.lookAt(targetBlock.position);

  // Attempt to set the sign text
  try {
    await targetBlock.setSignText(frontText, backText);
    return success(bot, `Successfully updated sign at ${positionString}. Front: "${frontText}", Back: "${backText}"`);
  } catch (error) {
    return failure(bot, `Failed to edit sign at ${positionString}: ${error.message}`);
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
  return await collectBlocks(bot, { blockType, num, exclude, grownCropsOnly });
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
  const desiredAmount = num === -1 ? Infinity : num;
  let discarded = 0;

  const items = bot.inventory.items().filter((item) => item.name === itemName);
  if (items.length === 0) {
    return failure(bot, `You do not have any ${itemName} to discard.`);
  }

  for (const item of items) {
    if (discarded >= desiredAmount) break;
    const toDiscard = desiredAmount === Infinity ? item.count : Math.min(desiredAmount - discarded, item.count);
    try {
      await bot.toss(item.type, null, toDiscard);
    } catch (err) {
      return failure(bot, `Failed to discard ${toDiscard} ${itemName}: ${err.message}`);
    }
    discarded += toDiscard;
  }

  if ((num !== -1 && discarded !== num) || discarded === 0) {
    return failure(bot, `Could not discard the requested amount of ${itemName}. Discarded ${discarded}.`);
  }

  return success(bot, `Successfully discarded ${discarded} ${itemName}.`);
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
    return failure(bot, `You do not have any ${name} to eat.`);
  }
  try {
    await bot.equip(item, "hand");
    await bot.consume();
    return success(bot, `Successfully ate ${item.name}.`);
  } catch (err) {
    return failure(bot, `Failed to eat ${item.name}: ${err.message}`);
  }
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
        return null;
      }
      return { name, quantity: parseInt(quantity, 10) };
    })
    .filter((item) => item !== null && item.quantity > 0);

  if (itemsList.length === 0) {
    return failure(bot, `Invalid items format. Use 'item1:quantity1,item2:quantity2,...'.`);
  }

  const playerEntity = bot.players[username]?.entity;
  if (!playerEntity) {
    return failure(bot, `Could not find ${username}.`);
  }

  const inventoryCounts = world.getInventoryCounts(bot);
  for (const { name, quantity } of itemsList) {
    if (!inventoryCounts[name] || inventoryCounts[name] < quantity) {
      return failure(bot, `Cannot give ${quantity} ${name}; only ${inventoryCounts[name] || 0} available.`);
    }
  }

  const reached = await goToPlayer(bot, username);
  if (!reached) {
    return failure(bot, `Failed to reach ${username} to hand over items.`);
  }

  await new Promise((resolve) => setTimeout(resolve, 200));
  await bot.lookAt(playerEntity.position);
  await new Promise((resolve) => setTimeout(resolve, 300));

  for (const { name, quantity } of itemsList) {
    const tossed = await discard(bot, name, quantity);
    if (!tossed) {
      return failure(bot, `Failed to toss ${quantity} ${name} to ${username}.`);
    }
  }

  try {
    bot.setControlState("back", true);
    await new Promise((resolve) => setTimeout(resolve, 200));
  } finally {
    bot.setControlState("back", false);
  }

  return success(bot, `Successfully gave specified items to ${username}.`);
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
    return failure(bot, `Missing coordinates, given x:${x} y:${y} z:${z}`);
  }
  if (bot.modes.isOn("cheat")) {
    bot.chat("/tp @s " + x + " " + y + " " + z);
    return success(bot, `Teleported to ${x}, ${y}, ${z}.`);
  }
  bot.pathfinder.setMovements(new pf.Movements(bot));
  await bot.pathfinder.goto(new pf.goals.GoalNear(x, y, z, min_distance));
  const destination = new Vec3(x, y, z);
  const distance = bot.entity.position.distanceTo(destination);
  if (distance > min_distance) {
    return failure(bot, `Failed to reach ${x}, ${y}, ${z}. Current distance: ${distance.toFixed(2)}.`);
  }
  return success(bot, `You have reached ${x}, ${y}, ${z}.`);
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
    return success(bot, `Teleported to ${username}.`);
  }

  bot.modes.pause("self_defense");
  bot.modes.pause("cowardice");

  const startTs = Date.now();
  const maxMs = 60000; // 1 minute ceiling to avoid hanging forever

  const resolvePlayer = () => bot.players[username]?.entity || null;
  let player = resolvePlayer();
  if (!player) {
    return failure(
      bot,
      `${username} is too far for me to detect. Ask if player wants me to teleport directly, or press F3 and tell me your coordinates in chat.`
    );
  }

  // Use dynamic GoalFollow instead of goto() so we continuously track moving targets
  const movements = new pf.Movements(bot);
  bot.pathfinder.setMovements(movements);
  bot.pathfinder.setGoal(new pf.goals.GoalFollow(player, distance), true);

  try {
    while (true) {
    if (bot.interrupt_code) return failure(bot, `Navigation to ${username} interrupted.`);
      // Refresh player entity (can change as players re-entity)
      player = resolvePlayer();
      if (!player) return failure(bot, `Lost track of ${username} while navigating.`);

      const dist = bot.entity.position.distanceTo(player.position);
      if (dist <= Math.max(2, distance)) {
        bot.pathfinder.stop();
        return success(bot, `You have reached ${username}.`);
      }

      if (Date.now() - startTs > maxMs) {
        bot.pathfinder.stop();
        return failure(bot, `Failed to reach ${username}: navigation timed out.`);
      }

      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (_err) {
    // Ensure we stop any residual goal on error
    try { bot.pathfinder.stop(); } catch {}
    return failure(bot, `Navigation to ${username} encountered an unexpected error.`);
  }

  return failure(bot, `Navigation to ${username} ended unexpectedly.`);
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
    return failure(bot, "No username provided.");
  }

  if (!agent.cheatsEnabled) {
    return failure(bot, "Cannot teleport: Cheats are not enabled for you.");
  }

  bot.chat("/tp @s " + username);
  await new Promise((resolve) => setTimeout(resolve, 500));
  
  const player = bot.players[username]?.entity;
  if (player && bot.entity.position.distanceTo(player.position) <= 0.5) {
    return success(bot, `Teleported to ${username}.`);
  }

  return failure(bot, "Teleport failed - you're not next to the player.");
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
  const player = bot.players[username]?.entity;
  if (!player) {
      return failure(bot, `Could not find player ${username} to follow.`);
  }

  if (bot.modes && bot.modes.modes_map['follow_target']) {
      const agentContext = bot;
      bot.modes.modes_map['follow_target'].setTarget(agentContext, player, distance);
      return success(bot, `Now following ${username}.`);
  }

  return failure(bot, "Error: Follow mode is not available.");
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
  if (bot.modes.isOn("cheat")) {
    return failure(bot, "Cannot move away while cheat mode is active.");
  }

  const startPos = bot.entity.position.clone();
  const goal = new pf.goals.GoalNear(startPos.x, startPos.y, startPos.z, distance);
  const invertedGoal = new pf.goals.GoalInvert(goal);
  bot.pathfinder.setMovements(new pf.Movements(bot));

  await bot.pathfinder.goto(invertedGoal);
  const newPos = bot.entity.position.clone();
  const moved = startPos.distanceTo(newPos);

  if (moved + 0.1 < distance) {
    return failure(bot, `Failed to move away sufficiently. Distance moved: ${moved.toFixed(2)} (target ${distance}).`);
  }

  return success(bot, `Moved away from nearest entity to ${newPos}.`);
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
  let interrupted = false;

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
      interrupted = true;
      break;
    }
  }

  bot.pathfinder.stop();

  if (interrupted) {
    return failure(bot, "Avoid enemies action interrupted.");
  }

  const remainingHostiles = (await world.getVisibleEntities(bot)).filter(entity =>
    MCData.getInstance().isHostile(entity) &&
    bot.entity.position.distanceTo(entity.position) <= distance
  );

  if (remainingHostiles.length > 0) {
    return failure(bot, "Enemies are still within the danger radius.");
  }

  return success(bot, `Moved ${distance} away from enemies.`);
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
  const doorTypes = [
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
  ];

  let targetPos;
  if (door_pos) {
    targetPos = new Vec3(Math.floor(door_pos.x), Math.floor(door_pos.y), Math.floor(door_pos.z));
  } else {
    for (const doorType of doorTypes) {
      const found = world.getNearestBlock(bot, doorType, 16);
      if (found) {
        targetPos = found.position;
        break;
      }
    }
  }

  if (!targetPos) {
    return failure(bot, "Could not find a door to use.");
  }

  const reached = await goToPosition(bot, targetPos.x, targetPos.y, targetPos.z, 1);
  if (!reached) {
    return failure(bot, `Failed to reach door at ${targetPos}.`);
  }

  const doorBlock = bot.blockAt(targetPos);
  if (!doorBlock || !doorBlock.name.includes("door")) {
    return failure(bot, `Block at ${targetPos} is not a usable door.`);
  }

  try {
    await bot.lookAt(targetPos);
    const wasClosed = !doorBlock._properties.open;
    if (wasClosed) {
      await bot.activateBlock(doorBlock);
    }

    bot.setControlState("forward", true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    bot.setControlState("forward", false);

    if (wasClosed) {
      const updatedDoorBlock = bot.blockAt(targetPos);
      if (updatedDoorBlock && updatedDoorBlock._properties.open) {
        await bot.activateBlock(updatedDoorBlock);
      }
    }
  } catch (err) {
    bot.setControlState("forward", false);
    return failure(bot, `Failed to use door at ${targetPos}: ${err.message}`);
  }

  return success(bot, `Used door at ${targetPos}.`);
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
    return failure(bot, "Could not find any beds nearby to sleep in.");
  }

  for (const loc of beds) {
    const bedPosition = loc; // findBlocks returns Vec3 positions directly

    // Check distance and navigate if necessary
    if (bot.entity.position.distanceTo(bedPosition) > NEAR_DISTANCE) {
      const reached = await goToPosition(bot, bedPosition.x, bedPosition.y, bedPosition.z, 1);
      if (!reached) {
        continue;
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
           return failure(bot, "Sleep interrupted.");
        }
      }
      return success(bot, `You slept and woke up safely.`);

    } catch (err) {
      // Do nothing
    }
    
    if (bot.interrupt_code) {
        return failure(bot, "goToBed sequence interrupted.");
    }
  }

  // If loop finishes without returning true
  return failure(bot, "Tried all nearby beds, but could not sleep in any.");
}

export async function goIntoNetherPortal(bot) {
  /**
   * Finds the nearest Nether portal block and walks into its space.
   * @param {MinecraftBot} bot - Reference to the minecraft bot.
   * @returns {Promise<boolean>} true if the bot reached the portal block's coordinates, false otherwise.
   */
  const portalBlock = world.getNearestBlock(bot, "nether_portal", MID_DISTANCE);

  if (!portalBlock) {
    return failure(bot, "Could not find a Nether Portal nearby.");
  }

  log(bot, `Found Nether Portal at ${portalBlock.position}. Moving into it...`);

  const goal = new pf.goals.GoalBlock(portalBlock.position.x, portalBlock.position.y, portalBlock.position.z);
  bot.pathfinder.setMovements(new pf.Movements(bot));

  try {
    await bot.pathfinder.goto(goal);
    const distance = bot.entity.position.distanceTo(portalBlock.position);
    if (distance > 0.5) {
      return failure(bot, "Failed to stand inside the Nether Portal.");
    }
    return success(bot, "Entered Nether Portal block space. Waiting for teleportation...");
  } catch (err) {
    return failure(bot, `Failed to move into the Nether Portal: ${err.message}`);
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
    return failure(bot, "Could not find an End Portal nearby.");
  }

  log(bot, `Found End Portal at ${portalBlock.position}. Moving into it...`);

  const goal = new pf.goals.GoalBlock(portalBlock.position.x, portalBlock.position.y, portalBlock.position.z);
  bot.pathfinder.setMovements(new pf.Movements(bot));

  try {
    await bot.pathfinder.goto(goal);
    const distance = bot.entity.position.distanceTo(portalBlock.position);
    if (distance > 0.5) {
      return failure(bot, "Failed to stand inside the End Portal.");
    }
    return success(bot, "Entered End Portal block space. Waiting for teleportation...");
  } catch (err) {
    return failure(bot, `Failed to move into the End Portal: ${err.message}`);
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
  x = Math.round(x);
  y = Math.round(y);
  z = Math.round(z);
  let block = bot.blockAt(new Vec3(x, y, z));
  if (
    block.name !== "grass_block" &&
    block.name !== "dirt" &&
    block.name !== "farmland"
  ) {
    return failure(bot, `Cannot till ${block.name}, must be grass_block or dirt.`);
  }
  let above = bot.blockAt(new Vec3(x, y + 1, z));
  if (above.name !== "air") {
    return failure(bot, `Cannot till, there is ${above.name} above the block.`);
  }
  // if distance is too far, move to the block
  if (bot.entity.position.distanceTo(block.position) > NEAR_DISTANCE) {
    const reached = await goToPosition(bot, block.position.x, block.position.y, block.position.z, 1);
    if (!reached) {
      return failure(bot, `Unable to reach block at ${block.position}.`);
    }
  }
  if (block.name !== "farmland") {
    let hoe = bot.inventory.items().find((item) => item.name.includes("hoe"));
    if (!hoe) {
      return failure(bot, `Cannot till, no hoes.`);
    }
    try {
      await bot.equip(hoe, "hand");
      await bot.activateBlock(block);
    } catch (err) {
      return failure(bot, `Failed to till block at ${x}, ${y}, ${z}: ${err.message}`);
    }
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
      return failure(bot, `No ${seedType} to plant.`);
    }
    try {
      await bot.equip(seeds, "hand");
      await bot.placeBlock(block, new Vec3(0, -1, 0));
    } catch (err) {
      return failure(bot, `Failed to plant ${seedType} at ${x}, ${y}, ${z}: ${err.message}`);
    }
    log(
      bot,
      `Planted ${seedType} at x:${x.toFixed(1)}, y:${y.toFixed(
        1
      )}, z:${z.toFixed(1)}.`
    );
  }
  return success(bot, `Finished tilling${seedType ? " and sowing" : ""} at ${x}, ${y}, ${z}.`);
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
  const block = world.getNearestBlock(bot, type, 16);
  if (!block) {
    return failure(bot, `Could not find any ${type} to activate.`);
  }
  if (bot.entity.position.distanceTo(block.position) > NEAR_DISTANCE) {
    const reached = await goToPosition(bot, block.position.x, block.position.y, block.position.z, 1);
    if (!reached) {
      return failure(bot, `Failed to reach ${type} at ${block.position}.`);
    }
  }
  try {
    await bot.activateBlock(block);
  } catch (err) {
    return failure(bot, `Failed to activate ${type}: ${err.message}`);
  }
  return success(
    bot,
    `Activated ${type} at x:${block.position.x.toFixed(
      1
    )}, y:${block.position.y.toFixed(1)}, z:${block.position.z.toFixed(1)}.`
  );
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
    await bot.activateItem(offHand);
    const handName = offHand ? "off hand" : "main hand";
    return success(bot, `Activated item in ${handName}.`);
  } catch (error) {
    return failure(bot, `Failed to activate item: ${error.message}`);
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
    return failure(bot, `Could not find any visible ${entityType} to activate.`);
  }

  // Sort by distance to find the nearest
  targetEntities.sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position));
  let entity = targetEntities[0];

  if (entity === bot.vehicle) {
    return failure(bot, `Already riding the nearest ${entityType}.`);
  }
  if (bot.entity.position.distanceTo(entity.position) > NEAR_DISTANCE) {
    const reached = await goToPosition(bot, entity.position.x, entity.position.y, entity.position.z, 1);
    if (!reached) {
      return failure(bot, `Unable to reach ${entityType} to activate.`);
    }
  }
  try {
    await bot.activateEntity(entity);
  } catch (err) {
    return failure(bot, `Failed to activate ${entityType}: ${err.message}`);
  }
  return success(
    bot,
    `Activated ${entityType} at x:${entity.position.x.toFixed(
      1
    )}, y:${entity.position.y.toFixed(1)}, z:${entity.position.z.toFixed(1)}.`
  );
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
    return failure(bot, `No target entity specified.`);
  }

  // Replaced getNearbyEntities with await getVisibleEntities
  const visibleEntities = await world.getVisibleEntities(bot);
  const targetEntity = visibleEntities.find((e) => e.name === entityName);
  if (!targetEntity) {
    const visibleEntityNames = visibleEntities.map((e) => e.name || e.username || `ID ${e.id}`).join(", ");
    return failure(
      bot,
      `${entityName} does not exist nearby. Visible entities: ${visibleEntityNames}`
    );
  }

  const item = bot.inventory.items().find((item) => item.name === itemName);
  if (!item) {
    const inventoryItems = bot.inventory
      .items()
      .map((i) => i.name)
      .join(", ");
    return failure(
      bot,
      `No ${itemName} found in inventory. Inventory contains: ${inventoryItems}`
    );
  }

  // Ensure the bot is close enough to the target entity
  const distance = bot.entity.position.distanceTo(targetEntity.position);
  if (distance > NEAR_DISTANCE) {
    const move = new pf.Movements(bot);
    bot.pathfinder.setMovements(move);
    await bot.pathfinder.goto(new pf.goals.GoalFollow(targetEntity, 2));
  }

  await bot.lookAt(targetEntity.position);

  try {
    await bot.equip(item, "hand");
    await bot.useOn(targetEntity);
    return success(bot, `Successfully used ${itemName} on ${entityName}.`);
  } catch (err) {
    return failure(bot, `Failed to use ${itemName} on ${entityName}: ${err.message}`);
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
  return success(bot, "Started crouching.");
}

export function stopCrouching(bot) {
  /**
   * Stop crouching.
   * @param {MinecraftBot} bot, reference to the minecraft bot.
   * @example
   * skills.stopCrouching(bot);
   **/
  bot.pathfinder.sneak = false;
  return success(bot, "Stopped crouching.");
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
    return failure(bot, `No ${itemName} found in inventory.`);
  }

  try {
    await bot.equip(item, "hand");
    await bot.consume();
    return success(bot, `Consumed ${itemName}`);
  } catch (err) {
    return failure(bot, `Unable to consume ${itemName}: ${err.message}`);
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
    return failure(bot, "The bot is not riding any entity.");
  }

  try {
    await bot.dismount();
    return success(bot, "Successfully dismounted.");
  } catch (err) {
    return failure(bot, `Failed to dismount: ${err.message}`);
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
  if (errorMsg) return false;

  let container;
  try {
    container = await bot.openContainer(targetBlock);
  } catch (err) {
    return failure(bot, `Failed to open container ${containerIdentifier}: ${err.message}`);
  }

  let successFlag = true;
  try {
    const itemsInContainer = container.containerItems().map((item) => `${item.name} x${item.count}`);
    if (itemsInContainer.length === 0) {
      log(bot, `Container ${containerIdentifier} is empty.`);
    } else {
      log(bot, `Container ${containerIdentifier} contents:\n- ${itemsInContainer.join('\n- ')}\n if you wish to withdraw items, use withdrawFromContainer.`);
    }
  } finally {
    try {
      await container.close();
    } catch (closeErr) {
      log(bot, `Error closing container ${containerIdentifier}: ${closeErr.message}`);
      successFlag = false;
    }
  }

  return successFlag;
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
  if (validationError) return false; 

  const itemsList = itemsString.split(',').map(item => {
      const [name, quantity] = item.split(':');
      const qty = parseInt(quantity, 10);
      if (!name || isNaN(qty) || qty <= 0) return null;
      return { name, quantity: qty };
  }).filter(item => item !== null);

  if (itemsList.length === 0) {
    return failure(bot, `Invalid or empty items string provided: "${itemsString}". Format: 'item1:qty1,item2:qty2,...'`);
  }

  let container;
  try {
    container = await bot.openContainer(targetBlock);
  } catch (err) {
    return failure(bot, `Failed to open container ${containerIdentifier}: ${err.message}`);
  }

  let successFlag = true;
  try {
    const inventoryCounts = world.getInventoryCounts(bot);

    for (const { name, quantity } of itemsList) {
      if (!inventoryCounts[name] || inventoryCounts[name] < quantity) {
        return failure(bot, `Cannot deposit ${quantity} ${name}; only ${inventoryCounts[name] || 0} available.`);
      }

      let remaining = quantity;
      for (const item of bot.inventory.items()) {
        if (item.name !== name) continue;
        const amount = Math.min(item.count, remaining);
        if (amount <= 0) continue;
        try {
          await container.deposit(item.type, null, amount);
        } catch (err) {
          return failure(bot, `Unable to deposit ${amount} ${name}: ${err.message}`);
        }
        remaining -= amount;
        if (remaining === 0) break;
      }

      if (remaining !== 0) {
        return failure(bot, `Failed to deposit full quantity for ${name}. Remaining: ${remaining}.`);
      }

      log(bot, `Deposited ${quantity} ${name} into ${containerIdentifier}.`);

      if (bot.interrupt_code) {
        return failure(bot, `Deposit action interrupted after depositing ${name}.`);
      }
    }
  } finally {
    try {
      await container.close();
    } catch (closeErr) {
      log(bot, `Error closing container ${containerIdentifier}: ${closeErr.message}`);
      successFlag = false;
    }
  }

  if (successFlag) {
    log(bot, `Successfully deposited requested items into ${containerIdentifier}.`);
  }
  return successFlag;
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
  if (validationError) return false;

  const itemsList = itemsString.split(',').map(item => {
      const [name, quantity] = item.split(':');
      const qty = parseInt(quantity, 10);
      if (!name || isNaN(qty) || qty <= 0) return null;
      return { name, quantity: qty };
  }).filter(item => item !== null);

  if (itemsList.length === 0) {
    return failure(bot, `Invalid or empty items string provided: "${itemsString}". Format: 'item1:qty1,item2:qty2,...'`);
  }

  let container;
  try {
    container = await bot.openContainer(targetBlock);
  } catch (err) {
    return failure(bot, `Failed to open container ${containerIdentifier}: ${err.message}`);
  }

  let successFlag = true;
  try {
    const contentsBefore = container.containerItems().map((item) => `${item.name} x${item.count}`);
    if (contentsBefore.length === 0) {
      log(bot, `Container ${containerIdentifier} is empty.`);
    } else {
      log(bot, `Container ${containerIdentifier} contents before withdrawal:\n- ${contentsBefore.join('\n- ')}`);
    }

    for (const { name, quantity } of itemsList) {
      const availableItem = container.containerItems().find(contItem => contItem.name === name);
      if (!availableItem || availableItem.count < quantity) {
        return failure(bot, `Container ${containerIdentifier} does not have required ${quantity} ${name}.`);
      }

      try {
        await container.withdraw(availableItem.type, null, quantity);
      } catch (err) {
        return failure(bot, `Could not withdraw ${quantity} ${name}: ${err.message}`);
      }

      log(bot, `Withdrew ${quantity} ${name} from ${containerIdentifier}.`);

      if (bot.interrupt_code) {
        return failure(bot, `Withdraw action interrupted after withdrawing ${name}.`);
      }
    }
  } finally {
    try {
      await container.close();
    } catch (closeErr) {
      log(bot, `Error closing container ${containerIdentifier}: ${closeErr.message}`);
      successFlag = false;
    }
  }

  if (successFlag) {
    log(bot, `Successfully withdrew requested items from ${containerIdentifier}.`);
  }
  return successFlag;
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
    return failure(bot, "No destination specified for unequipping.");
  }

  try {
    await bot.unequip(destination);
    return success(bot, `Your ${destination} armor is now in your backpack.`);
  } catch (err) {
    return failure(bot, `Failed to unequip from ${destination}: ${err.message}`);
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
    await new Promise((resolve) => setTimeout(resolve, 100));

    const ownerEntity = bot.players[ownerUsername]?.entity;
    const nearOwner = ownerEntity && bot.entity.position.distanceTo(ownerEntity.position) <= 0.5;
    agent.cheatsEnabled = !!nearOwner;

    if (nearOwner) {
      return success(bot, "Cheats are ENABLED for you.");
    }

    return success(bot, "Cheats are DISABLED for you.");
  } catch (err) {
    return failure(bot, `Failed to check cheats: ${err.message}`);
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
  if (!agent.cheatsEnabled) {
    return failure(bot, "Cannot generate structure: Cheats are not enabled for you. Structure generation requires operator permissions or cheats to be enabled.");
  }

  let structureResponse;
  try {
    structureResponse = await axios.get(`http://localhost:10101/structure/${structure_id}`);
  } catch (error) {
    if (error.response?.status === 404) {
      return failure(bot, `Structure ID ${structure_id} does not exist. Please check the ID and try again.`);
    }
    return failure(bot, `Failed to fetch structure ${structure_id}: ${error.response?.data?.error || error.message}`);
  }
  
  const operations = structureResponse.data.buildscript;
  const structurePrompt = structureResponse.data.prompt;
  
  if (!operations || !Array.isArray(operations) || operations.length === 0) {
    return failure(bot, `Invalid structure data format for ${structure_id}. Expected buildscript to be a non-empty array of operations.`);
  }
  
  const botPos = bot.entity.position;
  const originX = Math.floor(botPos.x);
  const originY = Math.floor(botPos.y);
  const originZ = Math.floor(botPos.z);
  
  for (let i = 0; i < operations.length; i++) {
    const operation = operations[i];
    
    if (bot.interrupt_code) {
      return failure(bot, "Structure generation interrupted.");
    }

    let command;
    if (operation.op === "fill") {
      if (!operation.from || !operation.to || !operation.block) {
        return failure(bot, `Invalid fill operation at index ${i}.`);
      }
      const [x1, y1, z1] = operation.from;
      const [x2, y2, z2] = operation.to;
      command = `/fill ${originX + x1} ${originY + y1} ${originZ + z1} ${originX + x2} ${originY + y2} ${originZ + z2} ${operation.block}`;
    } else if (operation.op === "setBlock") {
      if (typeof operation.x !== 'number' || typeof operation.y !== 'number' || typeof operation.z !== 'number' || !operation.block) {
        return failure(bot, `Invalid setBlock operation at index ${i}.`);
      }
      command = `/setblock ${originX + operation.x} ${originY + operation.y} ${originZ + operation.z} ${operation.block}`;
    } else {
      return failure(bot, `[generateStructure] Unknown operation type: ${operation.op}`);
    }

    bot.chat(command);
  }

  try {
    await axios.post(`http://localhost:10101/structure/${structure_id}/increment-generations`);
  } catch (updateErr) {
    return failure(bot, `[generateStructure] Error updating generations counter: ${updateErr.response?.data?.error || updateErr.message}`);
  }

  log(bot, `Structure ${structure_id} generation completed successfully.`);
  log(bot, `You just built: ${structurePrompt}`);
  return true;
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
  if (!emotes[emoteType]) {
    const validEmotes = Object.keys(emotes).join(', ');
    return failure(bot, `Invalid emote type "${emoteType}". Valid emotes are: ${validEmotes}.`);
  }

  try {
    const nearbyEntity = bot.nearestEntity((e) => e.type === 'player');
    if (nearbyEntity && nearbyEntity.position.distanceTo(bot.entity.position) < 10) {
      const height = 1.62;
      await bot.lookAt(nearbyEntity.position.offset(0, height, 0));
    }

    await emotes[emoteType](bot);
    return success(bot, `Successfully performed emote: ${emoteType}.`);
  } catch (error) {
    console.error(error);
    return failure(bot, `Failed to perform emote ${emoteType}: ${error.message}`);
  }
}

// --- End Emote Skills ---