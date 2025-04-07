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
    description: "Teleport to the given player. Argument is only player's name.",
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
    name: "!collectBlocks",
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
    name: "!collectAllBlocks",
    description:
      "Collect all the nearest blocks of a given type until told to stop.",
    params: {
      type: "(string) The block type to collect.",
    },
    perform: wrapExecution(
      async (agent, type) => {
        let success = await skills.collectBlock(agent.bot, type, 2368); // 2368 = total slots * 1 stack
        if (!success) agent.coder.cancelResume();
      },
      10,
      "collectAllBlocks"
    ), // 10 minute timeout
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
    name: "!smeltItem",
    description: "Smelt the given item the given number of times.",
    params: {
      item_name: "(string) The name of the input item to smelt.",
      num: "(number) The number of times to smelt the item.",
    },
    perform: wrapExecution(async (agent, recipe_name, num) => {
      await skills.smeltItem(agent.bot, recipe_name, num);
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
    description: "Attack and kill the specified player.",
    params: {
      player_name: "(string) The name of the player to attack.",
    },
    perform: wrapExecution(async (agent, player_name) => {
      await skills.attackNearest(agent.bot, player_name, true, true);
    }),
  },
  {
    name: "!attackCreature",
    description: "Attack and kill the nearest creature(s) of a given type.",
    params: {
      type: "(string) The type of creature to attack (e.g., 'zombie', 'skeleton').",
      count: "(number, optional) How many creatures of this type to attack. Defaults to 1.",
    },
    perform: wrapExecution(async (agent, type, count = 1) => {
      const numAttacks = parseInt(count) || 1;
      if (numAttacks <= 0) return "Attack count must be positive.";

      return await skills.attackMultipleCreatures(agent.bot, type, numAttacks);
    }),
  },
  {
    name: "!goToBed",
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
    name: "!stay",
    description:
      "Stay in the current location no matter what. Pauses all modes.",
    perform: wrapExecution(async (agent) => {
      agent.followPlayerName = null;
      await agent.coder.stop();
      await skills.stay(agent.bot);
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
    name: "!depositToChest",
    description: "Deposit items into the nearest chest.",
    params: {
      items: "(string) The items to deposit in the format 'item1:quantity1,item2:quantity2,...'.",
    },
    perform: wrapExecution(async (agent, items) => {
      await skills.depositToChest(agent.bot, items);
    }),
  },
  {
    name: "!withdrawFromChest",
    description: "Withdraw items from the nearest chest.",
    params: {
      items: "(string) The items to withdraw in the format 'item1:quantity1,item2:quantity2,...'.",
    },
    perform: wrapExecution(async (agent, items) => {
      await skills.withdrawFromChest(agent.bot, items);
    }),
  },
  {
    name: "!lookInChest",
    description: "Look in the nearest chest and log its contents.",
    perform: wrapExecution(async (agent) => {
      const success = await skills.lookInChest(agent.bot);
      return success ? "Chest contents seen." : "No chest found nearby.";
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
    description: "Look in the nearest furnace and log its contents.",
    perform: wrapExecution(async (agent) => {
      const success = await skills.lookInFurnace(agent.bot);
      return success ? "Furnace contents seen." : "No furnace found nearby.";
    }),
  },
  {
    name: "!takeFromFurnace",
    description: "Take items from the nearest furnace.",
    params: {
      itemType: "(string) The type of item to take (input, fuel, output).",
    },
    perform: wrapExecution(async (agent, itemType) => {
      const success = await skills.takeFromFurnace(agent.bot, itemType);
      return success
        ? `Successfully took ${itemType} from furnace.`
        : `Failed to take ${itemType} from furnace.`;
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
