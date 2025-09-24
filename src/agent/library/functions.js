import pf from "mineflayer-pathfinder";
import Vec3 from "vec3";
import * as world from "./world.js";

const NEAR_DISTANCE = 1;
const DEBUG = true;

async function equipForBlockSafe(bot, block) {
  try {
    if (bot.game?.gameMode === "creative") return true;
    if (bot.tool && typeof bot.tool.equipForBlock === 'function') {
      await bot.tool.equipForBlock(block);
      return true;
    }
  } catch {}
  return true;
}

export async function breakBlockAt(bot, x, y, z) {
  if (x == null || y == null || z == null) return false;
  const block = bot.blockAt(Vec3(x, y, z));
  if (!block) {
    return false;
  }
  if (block.name === "air" || block.name === "water" || block.name === "lava") return false;

  if (bot.entity.position.distanceTo(block.position) > NEAR_DISTANCE) {
    const pos = block.position;
    const movements = new pf.Movements(bot);
    movements.canPlaceOn = false;
    movements.allow1by1towers = false;
    bot.pathfinder.setMovements(movements);
    await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, NEAR_DISTANCE));
  }

  if (bot.game?.gameMode !== "creative") {
    await equipForBlockSafe(bot, block);
    const itemId = bot.heldItem ? bot.heldItem.type : null;
    if (!block.canHarvest(itemId)) return false;
  }
  const ok = await bot.dig(block, true);
  if (ok && DEBUG) {
    console.log(`[functions.breakBlockAt] successfully broke ${block.name} @ ${x},${y},${z}`);
  }
  return ok;
}

export async function digBlock(bot, block) {
  // Break a block and pick up its drops (best-effort). Throws on specific failure reasons.
  if (!block || !block.position) throw new Error('InvalidTarget');
  const targetPos = block.position;

  const ok = await breakBlockAt(bot, targetPos.x, targetPos.y, targetPos.z);
  if (!ok) {
    const err = new Error('BreakFailed');
    err.code = 'BreakFailed';
    throw err;
  }

  return; // void
}


