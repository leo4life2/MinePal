import * as skills from "../library/skills.js";

function wrapExecution(func, timeout = -1, resume_name = null) {
  return async function (agent, ...args) {
    let code_return;
    if (resume_name != null) {
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
    description: "Go to the given player.",
    params: {
      player_name: "(string) The name of the player to go to."
    },
    perform: wrapExecution(async (agent, player_name) => {
      return await skills.goToPlayer(agent.bot, player_name);
    }),
  },
  {
    name: "!followPlayer",
    description:
      "Endlessly follow the given player. Will defend that player if self_defense mode is on.",
    params: {
      player_name: "(string) The name of the player to follow.",
      follow_dist: "(number) The distance to follow from.",
    },
    perform: wrapExecution(
      async (agent, player_name, follow_dist) => {
        await skills.followPlayer(agent.bot, player_name, follow_dist);
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
    name: "!goToPlace",
    description: "Go to a saved location.",
    params: { name: "(string) The name of the location to go to." },
    perform: wrapExecution(async (agent, name) => {
      const pos = agent.memory_bank.recallPlace(name);
      if (!pos) {
        const allLocations = agent.memory_bank.getKeys();
        skills.log(agent.bot, `Could not find location "${name}", but we have: ${allLocations.join(', ')}`);
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
    description: "Give the specified item to the given player.",
    params: {
      player_name: "(string) The name of the player to give the item to.",
      item_name: "(string) The name of the item to give.",
      num: "(number) The number of items to give.",
    },
    perform: wrapExecution(async (agent, player_name, item_name, num) => {
      await skills.giveToPlayer(agent.bot, item_name, player_name, num);
    }),
  },
  {
    name: "!collectBlocks",
    description: "Collect the nearest blocks of a given type.",
    params: {
      type: "(string) The block type to collect.",
      num: "(number) The number of blocks to collect.",
    },
    perform: wrapExecution(async (agent, type, num) => {
      await skills.collectBlock(agent.bot, type, num);
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
    name: "!attack",
    description: "Attack and kill the nearest entity of a given type.",
    params: { 
      type: "(string) The type of entity to attack. If it's a player, give the player's name.",
      isPlayer: "(boolean) Whether the target is a player or not. If type is not a Minecraft mob type, this is true."
    },
    perform: wrapExecution(async (agent, type, isPlayer) => {
      await skills.attackNearest(agent.bot, type, true, isPlayer);
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
      "DO NOT use this with chests or containers. Activate the nearest object of a given type.",
    params: { type: "(string) The type of object to activate." },
    perform: wrapExecution(async (agent, type) => {
      await skills.activateNearestBlock(agent.bot, type);
    }),
  },
  {
    name: "!activateItem",
    description: "Use item, activate the currently held item in main or off hand.",
    params: {
      offHand: "(boolean, optional) Whether to activate the item in the off hand. Defaults to false (main hand).",
    },
    perform: wrapExecution(async (agent, offHand = false) => {
      const success = await skills.activateItem(agent.bot, offHand);
      const handName = offHand ? "off hand" : "main hand";
      return success ? `Activated item in ${handName}.` : `Failed to activate item in ${handName}.`;
    }),
  },
  {
    name: "!stay",
    description:
      "Stay in the current location no matter what. Pauses all modes.",
    perform: wrapExecution(async (agent) => {
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
    name: "!useOn",
    description: "Use the currently held item on a specified entity.",
    params: {
      entityName: "(string) The name of the entity to use the item on.",
    },
    perform: wrapExecution(async (agent, entityName) => {
      const targetEntity = agent.bot.nearestEntity(
        (entity) => entity.name === entityName
      );
      if (!targetEntity) {
        return `No entity named ${entityName} found nearby.`;
      }
      return await skills.useOn(agent.bot, targetEntity);
    }),
  },
  {
    name: "!depositToChest",
    description: "Deposit items into the nearest chest.",
    params: {
      itemName: "(string) The name of the item to deposit.",
      amount: "(number) The amount of items to deposit.",
    },
    perform: wrapExecution(async (agent, itemName, amount) => {
      return await skills.depositToChest(agent.bot, itemName, amount);
    }),
  },
  {
    name: "!withdrawFromChest",
    description: "Withdraw items from the nearest chest.",
    params: {
      itemName: "(string) The name of the item to withdraw.",
      amount: "(number) The amount of items to withdraw.",
    },
    perform: wrapExecution(async (agent, itemName, amount) => {
      return await skills.withdrawFromChest(agent.bot, itemName, amount);
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
      return success ? "Successfully dismounted." : "Failed to dismount or not riding any entity.";
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
  // {
  //   name: "!activateEntity",
  //   description: "Activate the nearest entity of a given type. E.g. boat, horse.",
  //   params: { type: "(string) The type of entity to activate." },
  //   perform: wrapExecution(async (agent, type) => {
  //     const success = await skills.activateNearestEntity(agent.bot, type);
  //     return success ? `Activated nearest ${type}.` : `No ${type} found nearby.`;
  //   }),
  // },
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
