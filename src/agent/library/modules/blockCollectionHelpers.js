import Vec3 from "vec3";
import MCData from "../../../utils/mcdata.js";
import { digBlock } from "../functions.js";

export function buildBlockTypes(registry, blockDropMap, blockType) {
  let blocktypes = [];
  let desiredDropNames = [];
  if (blockDropMap[blockType]) {
    const variantBlocks = blockDropMap[blockType].filter((name) => {
      try { return !!registry.getBlockId(name); } catch { return false; }
    });
    blocktypes = [blockType, ...variantBlocks];
    desiredDropNames = [...blockDropMap[blockType]];
  } else {
    const sourceBlocks = Object.entries(blockDropMap)
      .filter(([, drops]) => drops.includes(blockType))
      .map(([block]) => block);
    if (sourceBlocks.length > 0) {
      blocktypes = sourceBlocks;
      desiredDropNames = [blockType];
    } else {
      blocktypes = [blockType];
      desiredDropNames = [blockType];
    }
  }
  return { blocktypes: [...new Set(blocktypes)], desiredDropNames: [...new Set(desiredDropNames)] };
}

export function createCountTarget(registry, bot, desiredDropNames, world) {
  return () => {
    try {
      if (bot.inventory && typeof bot.inventory.count === 'function' && desiredDropNames.length > 0) {
        return desiredDropNames.reduce((sum, name) => {
          let id = null;
          try { id = registry.getItemId(name); } catch { id = null; }
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
}

export function createIsValidTarget(bot, blocktypes, grownCropsOnly, cropAgeMap, blockType) {
  return (position, debug = false, dbgContext = 'scan') => {
    let actual;
    try { actual = bot.blockAt(position); } catch (e) {
      if (debug) console.log(`[scanDebug] ${dbgContext} bot.blockAt threw`, { pos: position, error: e?.message || String(e) });
      return false;
    }
    if (!actual) {
      if (debug) console.log(`[scanDebug] ${dbgContext} no block at`, { pos: position });
      return false;
    }
    if (!blocktypes.includes(actual.name)) {
      if (debug) console.log(`[scanDebug] ${dbgContext} reject name`, { pos: position, name: actual.name, expectedAnyOf: blocktypes });
      return false;
    }
    if (grownCropsOnly && blockType && cropAgeMap[blockType]) {
      const expectedAge = cropAgeMap[blockType];
      const actualAge = actual._properties?.age;
      if (actualAge !== expectedAge) {
        if (debug) console.log(`[scanDebug] ${dbgContext} reject crop age`, { pos: position, block: actual.name, actualAge, expectedAge });
        return false;
      }
    }
    return true;
  };
}

export function isExcludedFactory(unreachableKeys, excluded, keyOf, posEq) {
  return (position) => unreachableKeys.has(keyOf(position)) || excluded.some(p => posEq(p, position));
}

export async function updatePendingDropsFromVisible(bot, pendingDrops, desiredDropNamesNormalized, PRUNE_UNSEEN_MS, DESPAWN_MS, world) {
  const visible = await world.getVisibleEntities(bot);
  const now = Date.now();
  const visibleItems = [];
  for (const e of visible) {
    if (e && e.name === 'item') {
      visibleItems.push(e);
    }
  }
  const normalizeDisp = (s) => (s || '').toLowerCase().replace(/\s+/g, '_');
  const metadataIndex = bot.minecraft_version && bot.minecraft_version <= '1.16.5' ? 7 : 8;
  for (const it of visibleItems) {
    const id = it.id;
    const pos = it.position;
    const existing = pendingDrops.get(id);
    if (existing) {
      existing.pos = pos;
      existing.lastSeen = now;
      if (!existing.name) {
        let resolvedName = null;
        try {
          const itemMeta = it.metadata?.[metadataIndex];
          const itemId = itemMeta?.itemId;
          if (itemId != null) {
            const mcName = MCData.getInstance().getItemName(itemId);
            if (mcName) resolvedName = normalizeDisp(mcName);
          }
        } catch {}
        if (!resolvedName && it.displayName) resolvedName = normalizeDisp(it.displayName);
        if (resolvedName) existing.name = resolvedName;
      }
    } else {
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
      let itemNameNorm = null;
      try {
        const itemMeta = it.metadata?.[metadataIndex];
        const itemId = itemMeta?.itemId;
        if (itemId != null) {
          const mcName = MCData.getInstance().getItemName(itemId);
          if (mcName) itemNameNorm = normalizeDisp(mcName);
        }
      } catch {}
      if (!itemNameNorm && it.displayName) {
        itemNameNorm = normalizeDisp(it.displayName);
      }
      const matchesDesired = !itemNameNorm || desiredDropNamesNormalized.includes(itemNameNorm);
      if (matchesDesired) {
        pendingDrops.set(id, {
          pos: pos,
          spawnedAt: predictedSpawnTs,
          lastSeen: now,
          predicted: false,
          name: itemNameNorm || null
        });
      }
    }
  }
  for (const [id, rec] of Array.from(pendingDrops.entries())) {
    const age = now - rec.spawnedAt;
    const unseen = now - rec.lastSeen;
    if (age >= DESPAWN_MS || unseen >= PRUNE_UNSEEN_MS) {
      pendingDrops.delete(id);
    }
  }
}

export async function chooseDetour(bot, targetPos, pendingDrops, desiredDropNamesNormalized, DETOUR_BUDGET, URGENT_AGE_MS, DROP_NEAR_RADIUS, pf) {
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
    if (bot.interrupt_code) return true;
    return true;
  }
  return false;
}

export function pruneCandidates(candidates, isCollecting, currentTargetKey, isValidTarget, isExcluded) {
  const before = candidates.size;
  for (const [k, pos] of Array.from(candidates.entries())) {
    if (isCollecting && k === currentTargetKey) continue;
    if (!isValidTarget(pos, true, 'prune') || isExcluded(pos)) candidates.delete(k);
  }
  const after = candidates.size;
  return { removed: before - after, remaining: after };
}

export function scanForCandidates(bot, world, blocktypes, candidates, isExcluded, isValidTarget, scanRadius, MAX_CANDIDATES, tickIndex, excludedReason, scanSummaryOut) {
  const found = world.getNearestBlocks(bot, blocktypes, scanRadius) || [];
  const summary = {
    tickIndex,
    scanRadius,
    foundCount: found.length,
    candidatesBefore: candidates.size,
    added: 0,
    excludedCounts: { unreachable: 0, user_excluded: 0, unknown: 0 },
    sampleFound: [],
    sampleAdded: [],
    sampleExcluded: []
  };
  for (const b of found) {
    if (!b || !b.position) continue;
    const pos = b.position;
    if (summary.sampleFound.length < 5) summary.sampleFound.push({ x: pos.x, y: pos.y, z: pos.z });
    if (isExcluded(pos)) {
      const reason = excludedReason ? excludedReason(pos) : 'unknown';
      if (summary.sampleExcluded.length < 5) summary.sampleExcluded.push({ x: pos.x, y: pos.y, z: pos.z, reason });
      if (summary.excludedCounts[reason] !== undefined) summary.excludedCounts[reason]++;
      else summary.excludedCounts.unknown++;
      continue;
    }
    if (!isValidTarget(pos, true, 'scan')) { continue; }
    const k = `${pos.x},${pos.y},${pos.z}`;
    if (!candidates.has(k)) { candidates.set(k, pos); summary.added++; if (summary.sampleAdded.length < 5) summary.sampleAdded.push({ x: pos.x, y: pos.y, z: pos.z }); }
  }
  if (candidates.size > MAX_CANDIDATES) {
    const trimmed = Array.from(candidates.values())
      .map(pos => ({ pos, dist: bot.entity.position.distanceTo(pos) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, MAX_CANDIDATES)
      .map(entry => entry.pos);
    candidates.clear();
    for (const pos of trimmed) candidates.set(`${pos.x},${pos.y},${pos.z}`, pos);
  }
  if (scanSummaryOut) scanSummaryOut.last = summary;
  return { added: summary.added, foundCount: summary.foundCount };
}

export const keyOfVec3 = (v) => `${v.x},${v.y},${v.z}`;

export function selectNearestCandidate(candidates, lastDugPos, bot) {
  if (candidates.size === 0) return null;
  const nearest = Array.from(candidates.values())
    .map(pos => ({ pos, dist: (lastDugPos ? lastDugPos.distanceTo(pos) : bot.entity.position.distanceTo(pos)) }))
    .sort((a, b) => a.dist - b.dist)[0];
  const targetPos = nearest.pos;
  const targetKey = keyOfVec3(targetPos);
  return { targetPos, targetKey };
}

export function ensureHarvestable(bot, targetBlock, targetPos, { unreachableKeys, undiggableByBlock, cannotHarvestByBlockTool, candidates, targetKey }) {
  try {
    if (targetBlock && targetBlock.diggable === false) {
      try {
        unreachableKeys.add(targetKey);
        const bname = targetBlock.name;
        undiggableByBlock.set(bname, (undiggableByBlock.get(bname) || 0) + 1);
      } catch {}
      candidates.delete(targetKey);
      return { ok: false };
    }
  } catch {}

  try { bot.tool.equipForBlock(targetBlock); } catch {}
  const itemId = bot.heldItem ? bot.heldItem.type : null;
  try {
    if (!targetBlock.canHarvest(itemId)) {
      const toolName = (bot.heldItem && bot.heldItem.name) ? bot.heldItem.name : 'empty hand';
      try {
        unreachableKeys.add(targetKey);
        const bname = targetBlock.name;
        const key = `${bname}||${toolName}`;
        cannotHarvestByBlockTool.set(key, (cannotHarvestByBlockTool.get(key) || 0) + 1);
      } catch {}
      candidates.delete(targetKey);
      return { ok: false };
    }
  } catch {
    try {
      unreachableKeys.add(targetKey);
      const toolName = (bot.heldItem && bot.heldItem.name) ? bot.heldItem.name : 'empty hand';
      const bname = targetBlock?.name || 'unknown';
      const key = `${bname}||${toolName}`;
      cannotHarvestByBlockTool.set(key, (cannotHarvestByBlockTool.get(key) || 0) + 1);
    } catch {}
    candidates.delete(targetKey);
    return { ok: false };
  }
  return { ok: true };
}

export async function performDigAndPredict(bot, targetBlock, targetPos, countTarget, baselineCount, pendingDrops) {
  let lastDugPosNew = null;
  let digBatchInc = 0;
  try {
    await bot.tool.equipForBlock?.(targetBlock);
  } catch {}
  try {
    await bot.pathfinder?.setMovements?.(new (require('mineflayer-pathfinder').Movements)(bot));
  } catch {}
  try {
    await digBlock(bot, targetBlock);
    try {
      const now = bot.blockAt(targetPos);
      if (!now || now.name !== targetBlock.name) lastDugPosNew = targetPos.clone();
    } catch { lastDugPosNew = targetPos.clone(); }
    const collectedTargetNow = countTarget() - baselineCount;
    digBatchInc = 1;
    const predId = `pred:${targetPos.x},${targetPos.y},${targetPos.z}:${Date.now()}`;
    pendingDrops.set(predId, { pos: targetPos.clone(), spawnedAt: Date.now(), lastSeen: Date.now(), predicted: true });
    return { lastDugPosNew, digBatchInc };
  } catch (err) {
    const name = err?.name || (err && typeof err === 'object' ? err.constructor?.name : String(err));
    const msg = err?.message || String(err);
    return { lastDugPosNew: null, digBatchInc: 0 };
  }
}

export async function sweepPendingDropsIfNeeded(bot, pendingDrops, desiredDropNamesNormalized, DEBT_DROP_COUNT, ABOUT_TO_DESPAWN_MS, DROP_NEAR_RADIUS, pf) {
  try {
    const now = Date.now();
    let oldestAge = 0;
    for (const rec of pendingDrops.values()) {
      if (rec.predicted) continue;
      oldestAge = Math.max(oldestAge, now - rec.spawnedAt);
    }
    const pickupDebtTooHigh = pendingDrops.size >= DEBT_DROP_COUNT || oldestAge >= ABOUT_TO_DESPAWN_MS;
    if (pickupDebtTooHigh && pendingDrops.size > 0) {
      const ordered = Array.from(pendingDrops.entries())
        .filter(([, rec]) => rec.predicted || (rec.name && desiredDropNamesNormalized.includes(rec.name.toLowerCase())))
        .map(([id, rec]) => ({ id, rec, d: bot.entity.position.distanceTo(rec.pos) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 10);
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
    }
  } catch {}
}

export function handleEmptyCandidatesExit({ emptyScans, collectedTarget, unreachableCount, candidatesSize, MCDataInstance, blocktypes, blockType, FAR_DISTANCE, bot }) {
  if (emptyScans <= 3) return { exit: false };
  if (collectedTarget > 0) {
    bot.output += `You collected ${collectedTarget} ${blockType}, and don't see more ${blockType} around\n`;
    return { exit: true };
  } else if (unreachableCount > 0) {
    bot.output += `No reachable ${blockType} found nearby. Visible but unreachable: ${unreachableCount}.\n`;
    return { exit: true };
  } else {
    bot.output += `No reachable ${blockType} found nearby. Scanner not populated yet.\n`;
    return { exit: true };
  }
}
