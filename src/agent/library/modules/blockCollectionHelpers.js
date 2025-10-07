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
      blocktypes = [...sourceBlocks, blockType];
      desiredDropNames = [blockType];
    } else {
      blocktypes = [blockType];
      desiredDropNames = [blockType];
    }
  }
  return { blocktypes: [...new Set(blocktypes)], desiredDropNames: [...new Set(desiredDropNames)] };
}

export function createCountTarget(registry, bot, desiredDropNames, world) {
  const uniqueNames = [...new Set(desiredDropNames)];
  const zeroCounts = () => {
    const counts = {};
    for (const name of uniqueNames) counts[name] = 0;
    return counts;
  };

  const getCounts = () => {
    const counts = zeroCounts();
    try {
      if (bot.inventory && typeof bot.inventory.count === 'function' && uniqueNames.length > 0) {
        for (const name of uniqueNames) {
          let id = null;
          try { id = registry.getItemId(name); } catch { id = null; }
          if (id == null) {
            counts[name] = 0;
            continue;
          }
          try {
            counts[name] = bot.inventory.count(id, null);
          } catch {
            counts[name] = 0;
          }
        }
        return counts;
      }

      const inv = world.getInventoryCounts(bot) || {};
      if (uniqueNames.length > 0) {
        for (const name of uniqueNames) {
          counts[name] = inv[name] || 0;
        }
      }
      return counts;
    } catch {
      return zeroCounts();
    }
  };

  const counter = () => {
    try {
      const counts = getCounts();
      let sum = 0;
      for (const name of Object.keys(counts)) sum += counts[name] || 0;
      return sum;
    } catch {
      return 0;
    }
  };

  counter.getCounts = getCounts;
  return counter;
}

export function createIsValidTarget(bot, blocktypes, grownCropsOnly, cropAgeMap, blockType) {
  return (position, debug = false, dbgContext = 'scan') => {
    let actual;
    try { actual = bot.blockAt(position); } catch (e) {
      console.log(`[collectBlocks][target] bot.blockAt threw via ${dbgContext}`, { position, error: e?.message || String(e) });
      if (debug) console.log(`[scanDebug] ${dbgContext} bot.blockAt threw`, { pos: position, error: e?.message || String(e) });
      return false;
    }
    if (!actual) {
      // console.log(`[collectBlocks][target] no block at ${dbgContext}`, { position });
      // if (debug) console.log(`[scanDebug] ${dbgContext} no block at`, { pos: position });
      return false;
    }
    if (!blocktypes.includes(actual.name)) {
      // console.log(`[collectBlocks][target] reject name`, { position, name: actual.name, expectedAnyOf: blocktypes });
      // if (debug) console.log(`[scanDebug] ${dbgContext} reject name`, { pos: position, name: actual.name, expectedAnyOf: blocktypes });
      return false;
    }
    if (grownCropsOnly && blockType && cropAgeMap[blockType]) {
      const expectedAge = cropAgeMap[blockType];
      const actualAge = actual._properties?.age;
      if (actualAge !== expectedAge) {
        // console.log(`[collectBlocks][target] reject crop age`, { position, block: actual.name, actualAge, expectedAge });
        // if (debug) console.log(`[scanDebug] ${dbgContext} reject crop age`, { pos: position, block: actual.name, actualAge, expectedAge });
        return false;
      }
    }
    return true;
  };
}

export function isExcludedFactory(unreachableKeys, excluded, keyOf, posEq) {
  return (position) => unreachableKeys.has(keyOf(position)) || excluded.some(p => posEq(p, position));
}

export async function updatePendingDropsFromVisible(bot, pendingDrops, desiredDropNamesNormalized, PRUNE_UNSEEN_MS, DESPAWN_MS, world, unreachableDropIds, dropsInProgress) {
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
    if (unreachableDropIds && unreachableDropIds.has(id)) {
      continue;
    }
    if (dropsInProgress && dropsInProgress.has(id)) {
      continue;
    }
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
    if (unreachableDropIds && unreachableDropIds.has(id)) {
      pendingDrops.delete(id);
      continue;
    }
    if (dropsInProgress && dropsInProgress.has(id)) {
      continue;
    }
    const age = now - rec.spawnedAt;
    const unseen = now - rec.lastSeen;
    if (age >= DESPAWN_MS || unseen >= PRUNE_UNSEEN_MS) {
      pendingDrops.delete(id);
    }
  }
}

export function normalizeDropCandidates(pendingDrops, desiredDropNamesNormalized, unreachableDropIds, dropsInProgress) {
  const entries = [];
  for (const [id, rec] of pendingDrops.entries()) {
    if (!rec || !rec.pos || rec.predicted) continue;
    if (unreachableDropIds && unreachableDropIds.has(id)) continue;
    if (dropsInProgress && dropsInProgress.has(id)) continue;
    if (rec.name && !desiredDropNamesNormalized.includes(rec.name.toLowerCase())) continue;
    entries.push([id, rec]);
  }
  return entries;
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
    if (!candidates.has(k)) {
      candidates.set(k, pos);
      summary.added++;
      if (summary.sampleAdded.length < 5) summary.sampleAdded.push({ x: pos.x, y: pos.y, z: pos.z });
    }
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

export function selectNearestCandidate(candidates, dropCandidates, lastCollectedPos, bot) {
  const origin = lastCollectedPos || bot.entity.position;
  const all = [];

  for (const [key, pos] of candidates.entries()) {
    if (!pos) continue;
    if (Number.isNaN(pos.x) || Number.isNaN(pos.y) || Number.isNaN(pos.z)) {
      console.warn('[collectBlocks][select] invalid block candidate coordinates', { key, pos });
      candidates.delete(key);
      continue;
    }
    const dist = origin.distanceTo(pos);
    if (!isFinite(dist)) {
      console.warn('[collectBlocks][select] non-finite distance for block candidate', { key, pos, origin });
      candidates.delete(key);
      continue;
    }
    all.push({ type: 'block', key, pos, dist });
  }

  for (const [id, rec] of dropCandidates) {
    if (!rec || !rec.pos) continue;
    if (Number.isNaN(rec.pos.x) || Number.isNaN(rec.pos.y) || Number.isNaN(rec.pos.z)) {
      console.warn('[collectBlocks][select] invalid drop candidate pos', { id, pos: rec.pos });
      continue;
    }
    const dist = origin.distanceTo(rec.pos);
    if (!isFinite(dist)) {
      console.warn('[collectBlocks][select] non-finite distance for drop candidate', { id, pos: rec.pos, origin });
      continue;
    }
    all.push({ type: 'drop', key: id, pos: rec.pos, dist, dropRec: rec });
  }

  if (all.length === 0) return null;

  all.sort((a, b) => {
    const distDelta = a.dist - b.dist;
    if (Math.abs(distDelta) > 1e-6) return distDelta;
    const yDelta = b.pos.y - a.pos.y;
    if (yDelta !== 0) return yDelta;
    if (a.type !== b.type) return a.type === 'drop' ? -1 : 1;
    return String(a.key).localeCompare(String(b.key));
  });

  const best = all[0];
  const targetKey = best.type === 'block' ? best.key : `drop:${best.key}`;
  return {
    type: best.type,
    targetPos: best.pos,
    targetKey,
    blockKey: best.type === 'block' ? best.key : null,
    dropId: best.type === 'drop' ? best.key : null,
    dropRec: best.type === 'drop' ? best.dropRec : null
  };
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
  let error = null;
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
    digBatchInc = 1;
    const predId = `pred:${targetPos.x},${targetPos.y},${targetPos.z}:${Date.now()}`;
    pendingDrops.set(predId, { pos: targetPos.clone(), spawnedAt: Date.now(), lastSeen: Date.now(), predicted: true });
    return { lastDugPosNew, digBatchInc, collectedType: 'block', collectedPos: lastDugPosNew, predictedDropId: predId, error: null };
  } catch (err) {
    const errorName = err?.name || (err && typeof err === 'object' ? err.constructor?.name : typeof err);
    const errorMessage = err?.message || String(err);
    // console.warn('[collectBlocks][dig] digBlock threw', {
    //   target: { x: targetPos?.x, y: targetPos?.y, z: targetPos?.z, blockName: targetBlock?.name },
    //   errorName,
    //   errorMessage
    // });
    return {
      lastDugPosNew: null,
      digBatchInc: 0,
      collectedType: null,
      collectedPos: null,
      predictedDropId: null,
      error: { name: errorName, message: errorMessage }
    };
  } finally {
    try { bot.stopDigging?.(); } catch {}
  }
}

export function handleEmptyCandidatesExit({ emptyScans, collectedTarget, collectedSummary, unreachableCount, candidatesSize, MCDataInstance, blocktypes, blockType, FAR_DISTANCE, bot, summaryFormatter }) {
  if (emptyScans <= 3) return { exit: false };
  const formatter = typeof summaryFormatter === 'function' ? summaryFormatter : null;
  if (collectedTarget > 0) {
    const summaryText = formatter
      ? formatter(collectedSummary, { includeTotalPrefix: true })
      : `${collectedTarget} ${blockType}`;
    const miningContext = blockType ? ` while mining ${blockType}` : '';
    bot.output += `You collected ${summaryText}${miningContext}, and don't see more ${blockType} around\n`;
    return { exit: true };
  } else if (unreachableCount > 0) {
    bot.output += `No reachable ${blockType} found nearby. Visible but unreachable: ${unreachableCount}.\n`;
    return { exit: true };
  } else {
    bot.output += `No reachable ${blockType} found nearby.\n`;
    return { exit: true };
  }
}
