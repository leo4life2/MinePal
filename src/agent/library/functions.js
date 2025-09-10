import pf from "mineflayer-pathfinder";
import Vec3 from "vec3";
import * as world from "./world.js";

const NEAR_DISTANCE = 4.5;
const MID_DISTANCE = 8;

export async function breakBlockAt(bot, x, y, z) {
  if (x == null || y == null || z == null) return false;
  const block = bot.blockAt(Vec3(x, y, z));
  if (!block) return false;
  if (block.name === "air" || block.name === "water" || block.name === "lava") return false;

  if (bot.modes?.isOn && bot.modes.isOn("cheat")) {
    bot.chat(`/setblock ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} air`);
    return true;
  }

  if (bot.entity.position.distanceTo(block.position) > NEAR_DISTANCE) {
    const pos = block.position;
    const movements = new pf.Movements(bot);
    movements.canPlaceOn = false;
    movements.allow1by1towers = false;
    bot.pathfinder.setMovements(movements);
    await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, NEAR_DISTANCE));
  }

  if (bot.game?.gameMode !== "creative") {
    await bot.tool.equipForBlock(block);
    const itemId = bot.heldItem ? bot.heldItem.type : null;
    if (!block.canHarvest(itemId)) return false;
  }

  try {
    await bot.dig(block, true);
    return true;
  } catch {
    return false;
  }
}

export async function acquireBlock(bot, block) {
  // Break a block and pick up its drops only, optionally batching pickup for nearby immediate breaks
  if (!block || !block.position) return false;
  const targetPos = block.position;

  // Ensure proper tool before breaking (defensive; breakBlockAt also equips)
  try {
    if (bot.game?.gameMode !== "creative") {
      await bot.tool.equipForBlock(block);
    }
  } catch {}

  // Pre-snapshot: nearby item entities before breaking
  const before = (await world.getVisibleEntities(bot)).filter(e => e.name === "item");

  const ok = await breakBlockAt(bot, targetPos.x, targetPos.y, targetPos.z);
  if (!ok) return false;

  // Post-snapshot: identify new/nearby items that likely correspond to this break
  // Heuristic: items now visible within MID_DISTANCE of targetPos and not present in 'before' by id
  const after = (await world.getVisibleEntities(bot)).filter(e => e.name === "item");
  const beforeIds = new Set(before.map(it => it.id));
  const candidateDrops = after.filter(it => !beforeIds.has(it.id) && it.position.distanceTo(targetPos) <= MID_DISTANCE);

  if (candidateDrops.length === 0) {
    // No visible drop; consider failure (e.g., fell off/clipped)
    return false;
  }

  // Batch pick-up: go to the nearest drop, then sweep remaining that are still close to the target
  candidateDrops.sort((a, b) => targetPos.distanceTo(a.position) - targetPos.distanceTo(b.position));

  try {
    bot.pathfinder.setMovements(new pf.Movements(bot));
    // Follow nearest to within close range
    const nearest = candidateDrops[0];
    await bot.pathfinder.goto(new pf.goals.GoalFollow(nearest, 0.8), true);
    await new Promise(r => setTimeout(r, 200));

    // Sweep any remaining candidate drops still visible and near
    const visibleNow = (await world.getVisibleEntities(bot)).filter(e => e.name === "item");
    const candidateIds = new Set(candidateDrops.map(d => d.id));
    const remaining = visibleNow.filter(e => candidateIds.has(e.id) && bot.entity.position.distanceTo(e.position) < MID_DISTANCE);
    for (const it of remaining) {
      try {
        await bot.pathfinder.goto(new pf.goals.GoalFollow(it, 0.8), true);
        await new Promise(r => setTimeout(r, 100));
      } catch {}
    }
  } catch {
    // pickup failed
    return false;
  }

  return true;
}


