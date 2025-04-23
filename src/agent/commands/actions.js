import * as skills from "../library/skills.js";

function wrapExecution(func, timeout = -1, resume_name = null) {
  return async function (agent, ...args) {
    let code_return;
    if (resume_name != null) { // not used afaik
      code_return = await agent.coder.executeResume(
        async () => {
          await func(agent, ...args);
        },
        resume_name,
        timeout
      );
    } else {
      code_return = await agent.coder.execute(async () => {
        await func(agent, ...args);
      }, timeout);
    if (agent.followPlayerName) {
      await skills.followPlayer(agent.bot, agent.followPlayerName);
    }
    }
    if (code_return.interrupted && !code_return.timedout) return;
    return code_return.message;
  };
}

export const actionsList = [
  {
    name: "!stop",
    description:
      "Force stop all actions and commands that are currently executing.",
    perform: async function (agent) {
      console.log("[CODERSTOP] Stop command.");
      await agent.coder.stop();
      agent.followPlayerName = null;
      agent.coder.clear();
      agent.coder.cancelResume();
      agent.bot.emit("idle");
      return "Agent stopped.";
    },
  },
  {
    name: "!setMode",
    description:
      "Set a mode to on or off. A mode is an automatic behavior that constantly checks and responds to the environment.",
    params: {
      mode_name: "(string) The name of the mode to enable.",
      on: "(bool) Whether to enable or disable the mode.",
    },
    perform: async function (agent, mode_name, on) {
      const modes = agent.bot.modes;
      if (!modes.exists(mode_name))
        return `Mode ${mode_name} does not exist.` + modes.getStr();
      if (modes.isOn(mode_name) === on)
        return `Mode ${mode_name} is already ${on ? "on" : "off"}.`;
      modes.setOn(mode_name, on);
      return `Mode ${mode_name} is now ${on ? "on" : "off"}.`;
    },
  },
  {
    name: "!goToPlayer",
    description: "Go to the given player. Argument is only player's name.",
    params: {
      player_name: "(string) The name of the player to go to.",
    },
    perform: wrapExecution(async (agent, player_name) => {
      return await skills.goToPlayer(agent.bot, player_name);
    }),
  },
  {
    name: "!teleportToPlayer",
    description: "Teleport to the given player. Argument is only player's name. Using player's username in the chat message is enough. The user does NOT need to be around you to teleport to them.",
    params: {
        player_name: "(string) The name of the player to teleport to.",
    },
    perform: wrapExecution(async (agent, player_name) => {
        return await skills.teleportToPlayer(agent.bot, player_name);
    }),
  },
  {
    name: "!followPlayer",
    description:
      "Endlessly follow the given player. Will defend that player if self_defense mode is on.",
    params: {
      player_name: "(string) The name of the player to follow."
    },
    perform: wrapExecution(
      async (agent, player_name, follow_dist) => {
        const success = await skills.followPlayer(agent.bot, player_name, 1);
        if (success) {
            agent.followPlayerName = player_name;
        }
      },
      -1,
      "followPlayer"
    ),
  },
  {
    name: "!moveAway",
    description:
      "Move away from the current location in any direction by a given distance.",
    params: { distance: "(number) The distance to move away." },
    perform: wrapExecution(async (agent, distance) => {
      await skills.moveAway(agent.bot, distance);
    }),
  },
  {
    name: "!rememberHere",
    description: "Save the current location with a given name.",
    params: { name: "(string) The name to remember the location as." },
    perform: async function (agent, name) {
      const pos = agent.bot.entity.position;
      agent.memory_bank.rememberPlace(name, pos.x, pos.y, pos.z);
    },
  },
  {
    name: "!renamePlace",
    description: "Rename a saved location.",
    params: {
      oldName: "(string) The current name of the location.",
      newName: "(string) The new name for the location.",
    },
    perform: async function (agent, oldName, newName) {
      agent.memory_bank.renamePlace(oldName, newName);
      return `Location "${oldName}" has been renamed to "${newName}".`;
    },
  },
  {
    name: "!deletePlace",
    description: "Delete a saved location.",
    params: {
      name: "(string) The name of the location to delete.",
    },
    perform: async function (agent, name) {
      return agent.memory_bank.deletePlace(name);
    },
  },
  {
    name: "!goToPlace",
    description: "Go to a saved location.",
    params: { name: "(string) The name of the location to go to." },
    perform: wrapExecution(async (agent, name) => {
      const pos = agent.memory_bank.recallPlace(name);
      if (!pos) {
        const allLocations = agent.memory_bank.getKeys();
        skills.log(
          agent.bot,
          `Could not find location "${name}", but we have: ${allLocations}`
        );
        return;
      }
      await skills.goToPosition(agent.bot, pos[0], pos[1], pos[2], 1);
    }),
  },
  {
    name: "!goToCoordinates",
    description: "Navigate to the specified coordinates.",
    params: {
      x: "(number) The x coordinate to navigate to.",
      y: "(number) The y coordinate to navigate to.",
      z: "(number) The z coordinate to navigate to.",
    },
    perform: wrapExecution(async (agent, x, y, z) => {
      await skills.goToPosition(agent.bot, x, y, z);
    }),
  },
  {
    name: "!givePlayer",
    description: "Give the specified items to the given player.",
    params: {
      player_name: "(string) The name of the player to give the items to.",
      items: "(string) The items to give in the format 'item1:quantity1,item2:quantity2,...'.",
    },
    perform: wrapExecution(async (agent, player_name, items) => {
      await skills.giveToPlayer(agent.bot, player_name, items);
    }),
  },
  {
    name: "!digToGetBlocks",
    description: "Collect the nearest blocks of a given type.",
    params: {
      type: "(string) The block type to collect.",
      num: "(number) The number of blocks to collect.",
      grownCropsOnly: "(boolean) Whether to collect only fully grown crops.",
    },
    perform: wrapExecution(async (agent, type, num, grownCropsOnly = false) => {
      await skills.collectBlock(agent.bot, type, num, null, grownCropsOnly);
    }, 10), // 10 minute timeout
  },
  {
    name: "!craftRecipe",
    description: "Craft the given recipe a given number of times.",
    params: {
      recipe_name: "(string) The name of the output item to craft.",
      num: "(number) The number of times to craft the recipe. This is NOT the number of output items, as it may craft many more items depending on the recipe.",
    },
    perform: wrapExecution(async (agent, recipe_name, num) => {
      await skills.craftRecipe(agent.bot, recipe_name, num);
    }),
  },
  {
    name: "!smeltWithFurnace",
    description: "Adds fuel and input items to a specific furnace to begin smelting.",
    params: {
      furnaceIdentifier: "(string) The identifier of the furnace block in the format 'furnace@(x,y,z)'.",
      item_name: "(string) The name of the input item to smelt.",
      fuelItemName: "(string) The name of the item to use as fuel (e.g., 'coal', 'oak_log').",
      fuelQuantity: "(number) The exact amount of fuel items to add.",
      num: "(number) The number of input items to add.",
    },
    perform: wrapExecution(async (agent, furnaceIdentifier, item_name, fuelItemName, fuelQuantity, num) => {
      const quantity = parseInt(fuelQuantity);
      if (isNaN(quantity) || quantity <= 0) {
          return `Invalid fuelQuantity: ${fuelQuantity}. Must be a positive number.`;
      }
      return await skills.smeltWithFurnace(agent.bot, furnaceIdentifier, item_name, fuelItemName, quantity, num);
    }),
  },
  {
    name: "!placeHere",
    description:
      "Place a given block in the current location. Do NOT use to build structures, only use for single blocks/torches.",
    params: { type: "(string) The block type to place." },
    perform: wrapExecution(async (agent, type) => {
      let pos = agent.bot.entity.position;
      await skills.placeBlock(agent.bot, type, pos.x, pos.y, pos.z);
    }),
  },
  {
    name: "!attackPlayer",
    description: "Attack and kill the specified player with a username.",
    params: {
      player_username: "(string) The username of the player to attack.",
    },
    perform: wrapExecution(async (agent, player_username) => {
      await skills.attackNearest(agent.bot, player_username, true, true);
    }),
  },
  {
    name: "!attackMob",
    description: "Attack and kill the nearest mob(s) of a given type.",
    params: {
      type: "(string) The type of mob to attack (e.g., 'zombie', 'skeleton').",
      count: "(number, optional) How many mobs of this type to attack. Defaults to 1.",
    },
    perform: wrapExecution(async (agent, type, count = 1) => {
      const numAttacks = parseInt(count) || 1;
      if (numAttacks <= 0) return "Attack count must be positive.";

      return await skills.attackMultipleCreatures(agent.bot, type, numAttacks);
    }),
  },
  {
    name: "!sleepOnBed",
    description: "Go to the nearest bed and sleep.",
    perform: wrapExecution(async (agent) => {
      await skills.goToBed(agent.bot);
    }),
  },
  {
    name: "!activateBlock",
    description:
      "DO NOT use this with chests, furnace, or containers. Activate the nearest object of a given type.",
    params: { type: "(string) The type of object to activate." },
    perform: wrapExecution(async (agent, type) => {
      await skills.activateNearestBlock(agent.bot, type);
    }),
  },
  {
    name: "!activateItem",
    description:
      "Use item, activate the currently held item in main or off hand.",
    params: {
      offHand:
        "(boolean, optional) Whether to activate the item in the off hand. Defaults to false (main hand).",
    },
    perform: wrapExecution(async (agent, offHand = false) => {
      const success = await skills.activateItem(agent.bot, offHand);
      const handName = offHand ? "off hand" : "main hand";
      return success
        ? `Activated item in ${handName}.`
        : `Failed to activate item in ${handName}.`;
    }),
  },
  {
    name: "!equip",
    description: "Equip an item to a specific body part.",
    params: {
      itemName: "(string) The name of the item to equip.",
      bodyPart:
        "(string) The body part to equip the item to (e.g. 'hand', 'torso').",
    },
    perform: wrapExecution(async (agent, itemName, bodyPart) => {
      return await skills.equip(agent.bot, itemName, bodyPart);
    }),
  },
  {
    name: "!useItemOnEntity",
    description: "Use the specified item on a specified entity.",
    params: {
      entityName: "(string) The name of the entity to use the item on.",
      itemName: "(string) The name of the item to use.",
    },
    perform: wrapExecution(async (agent, entityName, itemName) => {
      return await skills.useItemOnEntity(agent.bot, entityName, itemName);
    }),
  },
  {
    name: "!depositToContainer",
    description: "Deposit items into a specific container block.",
    params: {
      containerIdentifier: "(string) The identifier of the container block in the format 'block_name@(x,y,z)'.",
      items: "(string) The items to deposit in the format 'item1:quantity1,item2:quantity2,...'.",
    },
    perform: wrapExecution(async (agent, containerIdentifier, items) => {
      return await skills.depositToContainer(agent.bot, containerIdentifier, items);
    }),
  },
  {
    name: "!withdrawFromContainer",
    description: "Withdraw items from a specific container block.",
    params: {
      containerIdentifier: "(string) The identifier of the container block in the format 'block_name@(x,y,z)'.",
      items: "(string) The items to withdraw in the format 'item1:quantity1,item2:quantity2,...'.",
    },
    perform: wrapExecution(async (agent, containerIdentifier, items) => {
      return await skills.withdrawFromContainer(agent.bot, containerIdentifier, items);
    }),
  },
  {
    name: "!lookInContainer",
    description: "Look in a specific container block and log its contents.",
    params: {
        containerIdentifier: "(string) The identifier of the container block in the format 'block_name@(x,y,z)'."
    },
    perform: wrapExecution(async (agent, containerIdentifier) => {
      return await skills.lookInContainer(agent.bot, containerIdentifier);
    }),
  },
  {
    name: "!consume",
    description: "Eating or drinking, consume an item in the bot's inventory.",
    params: {
      itemName: "(string) The name of the item to consume.",
    },
    perform: wrapExecution(async (agent, itemName) => {
      return await skills.consume(agent.bot, itemName);
    }),
  },
  {
    name: "!dismount",
    description: "Dismount the bot from any entity it is currently riding.",
    perform: wrapExecution(async (agent) => {
      const success = await skills.dismount(agent.bot);
      return success
        ? "Successfully dismounted."
        : "Failed to dismount or not riding any entity.";
    }),
  },
  {
    name: "!startCrouching",
    description: "AKA sneak. Make the agent start crouching.",
    perform: wrapExecution(async (agent) => {
      await skills.startCrouching(agent.bot);
    }),
  },
  {
    name: "!stopCrouching",
    description: "AKA sneak. Make the agent stop crouching.",
    perform: wrapExecution(async (agent) => {
      await skills.stopCrouching(agent.bot);
    }),
  },
  {
    name: "!activateEntity",
    description:
      "Activate the nearest entity of a given type. E.g. boat, horse.",
    params: { type: "(string) The type of entity to activate." },
    perform: wrapExecution(async (agent, type) => {
      const success = await skills.activateNearestEntity(agent.bot, type);
      return success
        ? `Activated nearest ${type}.`
        : `No ${type} found nearby.`;
    }),
  },
  {
    name: "!lookInFurnace",
    description: "Look in a specific furnace and log its contents.",
    params: {
        furnaceIdentifier: "(string) The identifier of the furnace block in the format 'furnace@(x,y,z)'."
    },
    perform: wrapExecution(async (agent, furnaceIdentifier) => {
      return await skills.lookInFurnace(agent.bot, furnaceIdentifier);
    }),
  },
  {
    name: "!takeFromFurnace",
    description: "Take items from a specific furnace.",
    params: {
        furnaceIdentifier: "(string) The identifier of the furnace block in the format 'furnace@(x,y,z)'.",
        itemType: "(string) The type of item to take (input, fuel, output)."
    },
    perform: wrapExecution(async (agent, furnaceIdentifier, itemType) => {
        return await skills.takeFromFurnace(agent.bot, furnaceIdentifier, itemType);
    }),
  },
  {
    name: "!sow",
    description: "Sow seeds on nearby tilled soil.",
    params: {
      seed_type: "(string) The type of seed to sow.",
    },
    perform: wrapExecution(async (agent, seed_type) => {
      return await skills.sowSeeds(agent.bot, seed_type);
    }),
  },
  {
    name: "!buildHouse",
    description: "Build a house of the specified type.",
    params: {
      house_type: "(string) The type of house to build.",
    },
    perform: wrapExecution(async (agent, house_type) => {
      return await skills.buildHouse(agent.bot, house_type);
    }),
  },
  {
    name: "!tameMob",
    description: "Tame a nearby cat or wolf using appropriate items (fish for cats, bones for wolves).",
    params: {
      mobType: "(string) The type of mob to tame ('cat' or 'wolf').",
    },
    perform: wrapExecution(async (agent, mobType) => {
      return await skills.tameMob(agent.bot, mobType);
    }),
  },
  {
    name: "!goIntoNetherPortal",
    description: "Finds the nearest Nether Portal and walks into it to trigger teleportation.",
    params: {}, // No parameters needed
    perform: wrapExecution(async (agent) => {
      await skills.goIntoNetherPortal(agent.bot);
    }),
  },
  {
    name: "!goIntoEndPortal",
    description: "Finds the nearest End Portal and walks into it to trigger teleportation.",
    params: {}, // No parameters needed
    perform: wrapExecution(async (agent) => {
      await skills.goIntoEndPortal(agent.bot);
    }),
  },
  {
    name: "!editSign",
    description: "Edits the text on a specific sign block identified by its ID string.",
    params: {
        signIdentifier: "(string) The identifier of the sign block in the format 'block_name@(x,y,z)'. Example: 'oak_sign@(10,64,-20)'",
        frontText: "(string) The text to write on the front of the sign.",
        backText: "(string, optional) The text to write on the back of the sign. Defaults to empty."
    },
    perform: wrapExecution(async (agent, signIdentifier, frontText, backText = '') => {
        // Parse the signIdentifier string without regex
        let blockName = '';
        let positionString = '';
        let errorMsg = null;

        if (!signIdentifier) {
            errorMsg = `Invalid signIdentifier: it cannot be empty. Expected format 'block_name@(x,y,z)'.`;
        } else {
            const atIndex = signIdentifier.indexOf('@');
            const openParenIndex = signIdentifier.indexOf('('); // Should be after @

            if (atIndex === -1 || openParenIndex === -1 || openParenIndex <= atIndex) {
                errorMsg = `Invalid signIdentifier format: \"${signIdentifier}\". Expected format 'block_name@(x,y,z)'. Missing or misplaced '@' or '('.`;
            } else {
                blockName = signIdentifier.slice(0, atIndex); // Get text before '@'
                // Get text from '@' onwards, which should be the position like (x,y,z)
                positionString = signIdentifier.slice(atIndex + 1);

                if (!blockName) {
                   errorMsg = `Invalid signIdentifier format: \"${signIdentifier}\". Block name is empty.`;
                }
                if (!positionString.startsWith('(') || !positionString.endsWith(')')) {
                   errorMsg = `Invalid signIdentifier format: \"${signIdentifier}\". Position part is invalid: ${positionString}. Expected (x,y,z).`;
                }
            }
        }

        if (errorMsg) {
            skills.log(agent.bot, errorMsg);
            return errorMsg; // Return error message to agent history
        }

        // Call the skill function with the parsed arguments
        return await skills.editSign(agent.bot, blockName, positionString, frontText, backText);
    })
  },
  {
    name: "!unequip",
    description: "Unequip an item from a specific body part.",
    params: {
        destination:
        "(string) The body part to unequip the item from (e.g. 'hand', 'torso', 'off-hand').",
    },
    perform: wrapExecution(async (agent, destination) => {
        return await skills.unequip(agent.bot, destination);
    }),
  },
  {
    name: "!confirmActionsCompleted",
    description: "Double-check your HUD (inventory and environment) to verify explicitly that your intended actions are fully completed and correct. Only call this when you've confirmed your goal is completely achieved.",
    params: {},
    perform: wrapExecution(async (agent) => {
      return "Your HUD has been updated. Now double-check your HUD to verify that your intended actions are fully completed and correct.";
    }),
  },
  {
    name: "!giveUp",
    description: "Give up on the current task and go idle.",
    params: {},
    perform: wrapExecution(async (agent) => {
      // This is a placebo for the LLM to know that the actions are complete.
      return "Giving up on the current task and going idle.";
    }),
  },
  // {
  //   name: "!goal",
  //   description: "Set a goal to automatically work towards.",
  //   params: {
  //     name: "(string) The name of the goal to set. Can be item or building name. If empty will automatically choose a goal.",
  //     quantity: "(number) The quantity of the goal to set. Default is 1.",
  //   },
  //   perform: async function (agent, name = null, quantity = 1) {
  //     await agent.npc.setGoal(name, quantity);
  //     agent.bot.emit("idle"); // to trigger the goal
  //     return "Set goal: " + agent.npc.data.curr_goal.name;
  //   },
  // },
  // {
  //   name: "!newAction",
  //   description:
  //     "Perform new and unknown custom behaviors that are not available as a command by writing code.",
  //   perform: async function (agent) {
  //     if (!agent.settings.allow_insecure_coding)
  //       return "newAction Failed! Agent is not allowed to write code. Notify the user.";
  //     return await agent.coder.generateCode(agent.history);
  //   },
  // },
];
