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
  normalizeDropCandidates
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
    bot.output += `Invalid type for num: ${typeof num}. Expected a number.\n`;
    return false;
  }
  if (num < 1) {
    bot.output += `Invalid number of blocks to collect: ${num}.\n`;
    return false;
  }

  // Early validation: ensure provided block type exists in MCData registry
  try {
    const id = MCData.getInstance().getBlockId(blockType);
    if (id === null) {
      bot.output += `Invalid block type: ${blockType}.\n`;
      return false;
    }
  } catch {
    bot.output += `Invalid block type: ${blockType}.\n`;
    return false;
  }

  const { blocktypes, desiredDropNames } = buildBlockTypes(MCData.getInstance(), BLOCK_DROP_MAP, blockType);
  const desiredDropNamesNormalized = desiredDropNames.map(n => n.toLowerCase());

  // Use centralized crop age map
  const keyOf = (v) => `${v.x},${v.y},${v.z}`;
  const posEq = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z;
  const excluded = Array.isArray(exclude) ? exclude : [];
  const unreachableKeys = new Set();

  const candidates = new Map();
  const pendingDrops = new Map();
  let emptyScans = 0;
  let isCollecting = false;
  let currentTargetKey = null;
  let tickIndex = 0;
  let collectingWaitLogTs = 0;
  let loopIteration = 0;
  let loopHeartbeatTs = 0;

  const countTarget = createCountTarget(MCData.getInstance(), bot, desiredDropNames, world);
  const baselineCount = countTarget();

  const isValidTarget = createIsValidTarget(bot, blocktypes, grownCropsOnly, CROP_AGE_MAP, blockType);
  const isExcluded = isExcludedFactory(unreachableKeys, excluded, keyOf, posEq);
  const excludedReason = (position) => {
    const k = keyOf(position);
    if (unreachableKeys.has(k)) return 'unreachable';
    if (excluded.some(p => posEq(p, position))) return 'user_excluded';
    return 'unknown';
  };
  const scanSummaryOut = { last: null };

  const onPhysicsTick = () => {
    try {
      tickIndex++;
      const doScan = (tickIndex % SCAN_EVERY_TICKS) === 0;
      const doPrune = (tickIndex % PRUNE_EVERY_TICKS) === 0;
      if (!doScan && !doPrune) return;

      const scanRadius = candidates.size === 0 ? VERY_FAR_DISTANCE : FAR_DISTANCE;
      let added = 0;
      if (doScan) {
        const res = scanForCandidates(bot, world, blocktypes, candidates, isExcluded, isValidTarget, scanRadius, MAX_CANDIDATES, tickIndex, excludedReason, scanSummaryOut);
        added = res.added;
      }
      if (doScan) {
        try { updatePendingDropsFromVisible(bot, pendingDrops, desiredDropNamesNormalized, PRUNE_UNSEEN_MS, DESPAWN_MS, world); } catch {}
      }
      if (doPrune) pruneCandidates(candidates, isCollecting, currentTargetKey, isValidTarget, isExcluded);
      if (doScan) {
        if (candidates.size === 0 && added === 0) {
          emptyScans++;
        } else {
          emptyScans = 0;
        }
      }
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
        console.log("[collectBlocks] loop heartbeat iter=%s collected=%s/%s candidates=%s pendingDrops=%s isCollecting=%s emptyScans=%s target=%s", loopIteration, countTarget() - baselineCount, num, candidates.size, pendingDrops.size, isCollecting, emptyScans, currentTargetKey);
      }
      const collectedTarget = countTarget() - baselineCount;
      if (collectedTarget >= num) break;
      if (bot.interrupt_code) break;
      if (isCollecting) {
        const nowTs = Date.now();
        if (!collectingWaitLogTs || (nowTs - collectingWaitLogTs) > 300) {
          collectingWaitLogTs = nowTs;
          console.log("[collectBlocks] waiting for active dig to resolve target=%s", currentTargetKey);
        }
        await new Promise(r => setTimeout(r, 50));
        continue;
      }
      if (candidates.size === 0) {
        console.log("[collectBlocks] no candidates available emptyScans=%s pendingDrops=%s", emptyScans, pendingDrops.size);
        const exit = handleEmptyCandidatesExit({
          emptyScans,
          collectedTarget,
          unreachableCount,
          candidatesSize: candidates.size,
          MCDataInstance: MCData.getInstance(),
          blocktypes,
          blockType,
          FAR_DISTANCE,
          bot
        });
        if (exit.exit) {
          console.log("[collectBlocks] exiting due to empty candidates reason=%j", exit);
          break;
        }
        await new Promise(r => setTimeout(r, 100));
        continue;
      } else {
      }

      const dropCandidates = normalizeDropCandidates(pendingDrops, desiredDropNamesNormalized);
      const pick = selectNearestCandidate(candidates, dropCandidates, lastCollectedPos, bot);
      if (!pick) {
        console.log("[collectBlocks] selectNearestCandidate returned null despite candidates size=%s", candidates.size);
        continue;
      }
      const { type, targetPos, blockKey, dropId } = pick;

      if (type === 'drop') {
        try {
          console.log("[collectBlocks] navigating to drop id=%s pos=%j", dropId, targetPos);
          bot.pathfinder?.setMovements?.(new pf.Movements(bot));
          await bot.pathfinder?.goto?.(new pf.goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, DROP_NEAR_RADIUS));
          await new Promise(r => setTimeout(r, 120));
        } catch (err) {
          console.warn('[collectBlocks] drop navigation failed', err);
        } finally {
          if (dropId && pendingDrops.has(dropId)) pendingDrops.delete(dropId);
        }
        lastCollectedPos = targetPos.clone();
        continue;
      }

      const targetPosBlock = targetPos;
      if (!isValidTarget(targetPosBlock)) { candidates.delete(blockKey); continue; }

      let targetBlock;
      try { targetBlock = bot.blockAt(targetPosBlock); } catch { candidates.delete(blockKey); continue; }
      if (!targetBlock) { console.log("[collectBlocks] targetBlock missing at %j", targetPosBlock); candidates.delete(blockKey); continue; }

      try {
        if (targetBlock && targetBlock.diggable === false) {
          try {
            unreachableKeys.add(blockKey);
            unreachableCount++;
            const bname = targetBlock.name;
            undiggableByBlock.set(bname, (undiggableByBlock.get(bname) || 0) + 1);
          } catch {}
          console.log("[collectBlocks] target not diggable pos=%j", targetPosBlock);
          candidates.delete(blockKey);
          continue;
        }
      } catch {}

      try { await bot.tool.equipForBlock(targetBlock); } catch {}
      const itemId = bot.heldItem ? bot.heldItem.type : null;
      try {
        if (!targetBlock.canHarvest(itemId)) {
          console.log(`[collectBlock] canHarvest false, cannot harvest block: ${targetBlock.name} with ${itemId}`);
          const toolName = (bot.heldItem && bot.heldItem.name) ? bot.heldItem.name : 'empty hand';
          try {
            unreachableKeys.add(blockKey);
            unreachableCount++;
            const bname = targetBlock.name;
            const key = `${bname}||${toolName}`;
            cannotHarvestByBlockTool.set(key, (cannotHarvestByBlockTool.get(key) || 0) + 1);
          } catch {}
          candidates.delete(blockKey);
          continue;
        }
      } catch {
        console.log(`[collectBlock] catch, cannot harvest block: ${targetBlock.name} with ${itemId}`);
        try {
          unreachableKeys.add(blockKey);
          unreachableCount++;
          const toolName = (bot.heldItem && bot.heldItem.name) ? bot.heldItem.name : 'empty hand';
          const bname = targetBlock?.name || 'unknown';
          const key = `${bname}||${toolName}`;
          cannotHarvestByBlockTool.set(key, (cannotHarvestByBlockTool.get(key) || 0) + 1);
        } catch {}
        candidates.delete(blockKey);
        continue;
      }

      isCollecting = true;
      currentTargetKey = blockKey;
      collectingWaitLogTs = 0;
      candidates.delete(blockKey);
      console.log("[collectBlocks] begin dig target=%s pos=%j", blockKey, targetPosBlock);
      {
        const res = await performDigAndPredict(bot, targetBlock, targetPosBlock, countTarget, baselineCount, pendingDrops);
        console.log("[collectBlocks] dig finished target=%s digBatchInc=%s lastDugPos=%s", blockKey, res.digBatchInc, res.lastDugPosNew ? `${res.lastDugPosNew.x},${res.lastDugPosNew.y},${res.lastDugPosNew.z}` : 'null');
        if (res.lastDugPosNew) {
          lastCollectedPos = res.lastDugPosNew;
        }
        if (res.digBatchInc === 0) {
          try { unreachableKeys.add(blockKey); unreachableCount++; } catch {}
        }
        digBatchCount += res.digBatchInc;
      }
      isCollecting = false;
      currentTargetKey = null;
    }
  } finally {
    try { bot.removeListener('physicsTick', onPhysicsTick); } catch {}
  }

  const finalCollected = countTarget() - baselineCount;
  if (unreachableCount > 0) {
    bot.output += `Collected ${finalCollected} ${blockType}. Visible but unreachable: ${unreachableCount}.\n`;
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
  bot.output += `Collected ${finalCollected} ${blockType}.\n`;
  return finalCollected > 0;
}
