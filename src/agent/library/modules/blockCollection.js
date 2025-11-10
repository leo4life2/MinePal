import MCData from "../../../utils/mcdata.js";
import * as world from "../world.js";
import pf from "mineflayer-pathfinder";
import {
  buildBlockTypes,
  createCountTarget,
  createIsValidTarget,
  isExcludedFactory,
  updatePendingDropsFromVisible,
  pruneCandidates,
  scanForCandidates,
  handleEmptyCandidatesExit,
  selectNearestCandidate,
  performDigAndPredict,
  normalizeDropCandidates,
  ensureHarvestable
} from "./blockCollectionHelpers.js";
import {
  FAR_DISTANCE,
  VERY_FAR_DISTANCE,
  DESPAWN_MS,
  PRUNE_UNSEEN_MS,
  DROP_NEAR_RADIUS,
  SCAN_EVERY_TICKS,
  PRUNE_EVERY_TICKS,
  MAX_CANDIDATES,
  BLOCK_DROP_MAP,
  CROP_AGE_MAP
} from "./blockCollectionConfig.js";

export async function collectBlocks(
  bot,
  {
    blockType,
    num = 1,
    exclude = null,
    grownCropsOnly = false,
  } = {}
) {
  console.log(`[collectBlock(producer-consumer)] start: ${blockType}, num: ${num}`);

  if (typeof num !== 'number') {
    const error = `Invalid type for num: ${typeof num}. Expected a number.\n`;
    bot.output += error;
    return { success: false, collected: 0, error };
  }
  if (num < 1) {
    const error = `Invalid number of blocks to collect: ${num}.\n`;
    bot.output += error;
    return { success: false, collected: 0, error };
  }

  // Early validation: ensure provided block type exists in MCData registry
  try {
    const id = MCData.getInstance().getBlockId(blockType);
    if (id === null) {
      const error = `Invalid block type: ${blockType}.\n`;
      bot.output += error;
      return { success: false, collected: 0, error };
    }
  } catch {
    const error = `Invalid block type: ${blockType}.\n`;
    bot.output += error;
    return { success: false, collected: 0, error };
  }

  const { blocktypes, desiredDropNames } = buildBlockTypes(MCData.getInstance(), BLOCK_DROP_MAP, blockType);
  const desiredDropNamesNormalized = desiredDropNames.map(n => n.toLowerCase());
  const trackedItemNames = Array.from(new Set(desiredDropNames));

  // Use centralized crop age map
  const keyOf = (v) => `${v.x},${v.y},${v.z}`;
  const posEq = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z;
  const excluded = Array.isArray(exclude) ? exclude : [];
  const unreachableKeys = new Set();

  const candidates = new Map();
  const pendingDrops = new Map();
  const dropsInProgress = new Set();
  let emptyScans = 0;
  let isCollecting = false;
  let currentTargetKey = null;
  let tickIndex = 0;
  let collectingWaitLogTs = 0;
  let loopIteration = 0;
  let loopHeartbeatTs = 0;
  const dropPickCounts = new Map();
  const dropFailureCounts = new Map();
  const unreachableDropIds = new Set();

  const countTarget = createCountTarget(MCData.getInstance(), bot, desiredDropNames, world);
  const baselineCounts = (() => {
    if (typeof countTarget.getCounts === 'function') {
      const counts = countTarget.getCounts() || {};
      const result = {};
      for (const name of trackedItemNames) result[name] = counts[name] || 0;
      return result;
    }
    const result = {};
    for (const name of trackedItemNames) result[name] = 0;
    return result;
  })();
  const baselineCount = countTarget();

  const summarizeCollected = () => {
    if (typeof countTarget.getCounts !== 'function') {
      const total = countTarget() - baselineCount;
      const fallbackName = trackedItemNames[0] || blockType || 'items';
      const parts = total > 0 ? [{ name: fallbackName, count: total }] : [];
      return { total, parts };
    }

    const currentCounts = countTarget.getCounts() || {};
    const parts = [];
    for (const name of trackedItemNames) {
      const delta = (currentCounts[name] || 0) - (baselineCounts[name] || 0);
      if (delta > 0) parts.push({ name, count: delta });
    }
    const total = parts.reduce((sum, entry) => sum + entry.count, 0);
    return { total, parts };
  };

  const formatSummaryForDisplay = (summary, { includeTotalPrefix = false } = {}) => {
    const { total, parts } = summary || { total: 0, parts: [] };
    const fallbackLabel = trackedItemNames[0] || blockType || 'items';
    const label = parts.length === 1 ? parts[0].name : parts.length > 1 ? 'target items' : fallbackLabel;
    const breakdown = parts.length > 1 ? parts.map(({ name, count }) => `${count} ${name}`).join(', ') : null;
    if (parts.length === 1) {
      return `${parts[0].count} ${parts[0].name}`;
    }
    if (parts.length > 1) {
      return includeTotalPrefix ? `${total} ${label} (${breakdown})` : `${total} ${label} (${breakdown})`;
    }
    return `${total} ${label}`;
  };

  const isValidTarget = createIsValidTarget(bot, blocktypes, grownCropsOnly, CROP_AGE_MAP, blockType);
  const isExcluded = isExcludedFactory(unreachableKeys, excluded, keyOf, posEq);
  const excludedReason = (position) => {
    const k = keyOf(position);
    if (unreachableKeys.has(k)) return 'unreachable';
    if (excluded.some(p => posEq(p, position))) return 'user_excluded';
    return 'unknown';
  };
  const scanSummaryOut = { last: null };
  let inventoryFull = false;

  const onPhysicsTick = () => {
    try {
      tickIndex++;
      try {
        if (bot.inventory && typeof bot.inventory.emptySlotCount === 'function') {
          inventoryFull = bot.inventory.emptySlotCount() === 0;
        }
      } catch {}
      const doScan = (tickIndex % SCAN_EVERY_TICKS) === 0;
      const doPrune = (tickIndex % PRUNE_EVERY_TICKS) === 0;
      if (!doScan && !doPrune) return;

      const scanRadius = candidates.size === 0 ? VERY_FAR_DISTANCE : FAR_DISTANCE;
      let added = 0;
      if (doScan) {
        const res = scanForCandidates(
          bot,
          world,
          blocktypes,
          candidates,
          isExcluded,
          isValidTarget,
          scanRadius,
          MAX_CANDIDATES,
          tickIndex,
          excludedReason,
          scanSummaryOut
        );
        added = res.added;
        try {
          updatePendingDropsFromVisible(
            bot,
            pendingDrops,
            desiredDropNamesNormalized,
            PRUNE_UNSEEN_MS,
            DESPAWN_MS,
            world,
            unreachableDropIds,
            dropsInProgress
          );
        } catch {}
        if (candidates.size === 0 && added === 0) {
          emptyScans++;
        } else {
          emptyScans = 0;
        }
      }
      if (doPrune) pruneCandidates(candidates, isCollecting, currentTargetKey, isValidTarget, isExcluded);
    } catch {}
  };

  bot.on('physicsTick', onPhysicsTick);

  let lastCollectedPos = null;
  let unreachableCount = 0;
  let digBatchCount = 0;
  const undiggableByBlock = new Map();
  const cannotHarvestByBlockTool = new Map();
  try {
    while (true) {
      loopIteration++;
      const nowLoop = Date.now();
      if (!loopHeartbeatTs || (nowLoop - loopHeartbeatTs) > 1000) {
        loopHeartbeatTs = nowLoop;
      }
      const collectedTarget = countTarget() - baselineCount;
      if (collectedTarget >= num) break;
      if (bot.interrupt_code) break;
      if (isCollecting) {
        const nowTs = Date.now();
        if (!collectingWaitLogTs || (nowTs - collectingWaitLogTs) > 300) {
          collectingWaitLogTs = nowTs;
        }
        await new Promise(r => setTimeout(r, 50));
        continue;
      }

      const dropCandidates = normalizeDropCandidates(pendingDrops, desiredDropNamesNormalized, unreachableDropIds, dropsInProgress);
      if (candidates.size === 0 && dropCandidates.length === 0) {
        console.log("[collectBlocks] no candidates available emptyScans=%s pendingDrops=%s", emptyScans, pendingDrops.size);
        const collectedSummaryForExit = summarizeCollected();
        const exit = handleEmptyCandidatesExit({
          emptyScans,
          collectedTarget,
          collectedSummary: collectedSummaryForExit,
          unreachableCount,
          candidatesSize: candidates.size,
          MCDataInstance: MCData.getInstance(),
          blocktypes,
          blockType,
          FAR_DISTANCE,
          bot,
          summaryFormatter: formatSummaryForDisplay
        });
        if (exit.exit) {
          console.log("[collectBlocks] exiting due to empty candidates reason=%j", exit);
          break;
        }
        await new Promise(r => setTimeout(r, 100));
        continue;
      }

      if (inventoryFull) {
        console.log("[collectBlocks] inventory full, exiting loop");
        break;
      }

      const pick = selectNearestCandidate(candidates, dropCandidates, lastCollectedPos, bot);
      if (!pick) {
        continue;
      }
      const { type, targetPos, blockKey, dropId } = pick;

      if (type === 'drop') {
        if (dropId !== null && dropId !== undefined) {
          dropsInProgress.add(dropId);
        }
        try {
          const dropCount = (dropPickCounts.get(dropId) || 0) + 1;
          dropPickCounts.set(dropId, dropCount);
          const movements = new pf.Movements(bot);
          movements.canDig = true;
          movements.allow1by1towers = false;
          try {
            bot.pathfinder?.setMovements?.(movements);
          } catch {}
          await bot.pathfinder?.goto?.(new pf.goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, DROP_NEAR_RADIUS));
          await new Promise(r => setTimeout(r, 120));
        } catch (err) {
          console.warn('[collectBlocks] drop navigation failed', err);
          if (dropId) {
            const failures = (dropFailureCounts.get(dropId) || 0) + 1;
            dropFailureCounts.set(dropId, failures);
            if (failures >= 3) {
              unreachableDropIds.add(dropId);
            }
          }
          try { bot.pathfinder?.stop?.(); } catch {}
        } finally {
          if (dropId && pendingDrops.has(dropId)) pendingDrops.delete(dropId);
          if (dropId !== null && dropId !== undefined) {
            dropsInProgress.delete(dropId);
          }
        }
        lastCollectedPos = targetPos.clone();
        continue;
      }

      const targetPosBlock = targetPos;
      if (!isValidTarget(targetPosBlock)) {
        candidates.delete(blockKey);
        continue;
      }

      let targetBlock;
      try { targetBlock = bot.blockAt(targetPosBlock); } catch {
        candidates.delete(blockKey);
        continue;
      }
      if (!targetBlock) {
        candidates.delete(blockKey);
        continue;
      }

      const { ok: harvestable } = ensureHarvestable(bot, targetBlock, targetPosBlock, {
        unreachableKeys,
        undiggableByBlock,
        cannotHarvestByBlockTool,
        candidates,
        targetKey: blockKey
      });
      if (!harvestable) {
        unreachableCount++;
        continue;
      }

      isCollecting = true;
      currentTargetKey = blockKey;
      collectingWaitLogTs = 0;
      candidates.delete(blockKey);
      {
        const res = await performDigAndPredict(bot, targetBlock, targetPosBlock, countTarget, baselineCount, pendingDrops);
        if (res.lastDugPosNew) {
          lastCollectedPos = res.lastDugPosNew;
        }
        if (res.digBatchInc === 0) {
          unreachableKeys.add(blockKey);
        }
        digBatchCount += res.digBatchInc;
      }
      isCollecting = false;
      currentTargetKey = null;
      try { bot.pathfinder?.stop?.(); } catch {}
    }
  } finally {
    try { bot.removeListener('physicsTick', onPhysicsTick); } catch {}
  }

  const finalSummary = summarizeCollected();
  const finalCollected = finalSummary.total;
  const collectedDisplay = formatSummaryForDisplay(finalSummary, { includeTotalPrefix: true });
  const miningContext = blockType ? ` while mining ${blockType}` : '';

  // Add appropriate final summary based on why we stopped
  if (bot.interrupt_code) {
    // Interrupted (timeout or manual stop)
    bot.output += `Collected ${collectedDisplay}${miningContext} before being interrupted.\n`;
  } else if (finalCollected >= num) {
    // Successfully collected the requested amount
    bot.output += `Collected ${collectedDisplay}${miningContext}.\n`;
  } else if (inventoryFull) {
    if (finalCollected > 0) {
      bot.output += `Collected ${collectedDisplay}${miningContext} but inventory is full.\n`;
    } else {
      bot.output += `Inventory is full; unable to collect more ${blockType}.\n`;
    }
  } else if (unreachableCount > 0) {
    // Stopped early due to unreachable blocks
    bot.output += `Collected ${collectedDisplay} (target was ${num} ${blockType}). Visible but unreachable: ${unreachableCount}.\n`;
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
        bot.output += `Unreachable breakdown:\n- ${details.join('\n- ')}\n`;
      }
    } catch {}
  }
  // Note: If stopped due to empty scans, handleEmptyCandidatesExit already added the message
  
  const success = !bot.interrupt_code && finalCollected >= num;
  return {
    success,
    collected: finalCollected,
    required: num,
    interrupted: Boolean(bot.interrupt_code),
    inventoryFull,
    unreachableCount,
  };
}
