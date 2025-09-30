import pf from "mineflayer-pathfinder";
import Vec3 from "vec3";
import * as world from "./world.js";

const NEAR_DISTANCE = 3.0;
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
  console.log('[functions.breakBlockAt] start', { x, y, z });
  const block = bot.blockAt(Vec3(x, y, z));
  if (!block) {
    console.log('[functions.breakBlockAt] no block found', { x, y, z });
    return false;
  }
  if (block.name === "air" || block.name === "water" || block.name === "lava") return false;

  if (bot.entity.position.distanceTo(block.position) > NEAR_DISTANCE) {
    console.log('[functions.breakBlockAt] walking to block', { x, y, z });
    const pos = block.position;
    const movements = new pf.Movements(bot);
    movements.canPlaceOn = false;
    movements.allow1by1towers = false;
    bot.pathfinder.setMovements(movements);
    await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, NEAR_DISTANCE));
    console.log('[functions.breakBlockAt] arrived near block', { x, y, z });
  }

  if (bot.game?.gameMode !== "creative") {
    console.log('[functions.breakBlockAt] equip safe start', { block: block.name });
    await equipForBlockSafe(bot, block);
    const itemId = bot.heldItem ? bot.heldItem.type : null;
    if (!block.canHarvest(itemId)) return false;
  }
  console.log('[functions.breakBlockAt] dig start', { block: block.name });
  const ok = await bot.dig(block, true);
  console.log('[functions.breakBlockAt] dig done', { ok });
  if (ok && DEBUG) {
    console.log(`[functions.breakBlockAt] successfully broke ${block.name} @ ${x},${y},${z}`);
  }
  return ok;
}

export async function digBlock(bot, block) {
  // Break a block and pick up its drops (best-effort). Throws on specific failure reasons.
  if (!block || !block.position) throw new Error('InvalidTarget');
  const targetPos = block.position;
  console.log('[functions.digBlock] invoked', { name: block.name, x: targetPos.x, y: targetPos.y, z: targetPos.z });

  const ok = await breakBlockAt(bot, targetPos.x, targetPos.y, targetPos.z);
  if (!ok) {
    const err = new Error('BreakFailed');
    err.code = 'BreakFailed';
    throw err;
  }

  console.log('[functions.digBlock] success', { name: block.name, x: targetPos.x, y: targetPos.y, z: targetPos.z });

  return; // void
}


