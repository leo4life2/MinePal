import MCData from "../../../utils/mcdata.js";
import * as world from "../world.js";
import pf from "mineflayer-pathfinder";
import {
  buildBlockTypes,
  createCountTarget,
  createIsValidTarget,
  isExcludedFactory,
  updatePendingDropsFromVisible,
  chooseDetour,
  pruneCandidates,
  scanForCandidates,
  handleEmptyCandidatesExit,
  selectNearestCandidate,
  performDigAndPredict,
  sweepPendingDropsIfNeeded
} from "./blockCollectionHelpers.js";
import {
  FAR_DISTANCE,
  VERY_FAR_DISTANCE,
  DETOUR_BUDGET,
  URGENT_AGE_MS,
  DESPAWN_MS,
  ABOUT_TO_DESPAWN_MS,
  PRUNE_UNSEEN_MS,
  DROP_NEAR_RADIUS,
  DEBT_DROP_COUNT,
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

  const { blocktypes, desiredDropNames } = buildBlockTypes(MCData.getInstance(), BLOCK_DROP_MAP, blockType);
  const desiredDropNamesNormalized = desiredDropNames.map(n => n.toLowerCase());

  // Use centralized crop age map
  const keyOf = (v) => `${v.x},${v.y},${v.z}`;
  const posEq = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z;
  const excluded = Array.isArray(exclude) ? exclude : [];
  const unreachableKeys = new Set();

  const candidates = new Map();
  const pendingDrops = new Map();
  let emptyTicks = 0;
  let isCollecting = false;
  let currentTargetKey = null;
  let tickIndex = 0;

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
          emptyTicks++;
        } else {
          emptyTicks = 0;
        }
      }
    } catch {}
  };

  bot.on('physicsTick', onPhysicsTick);

  let lastDugPos = null;
  let unreachableCount = 0;
  let digBatchCount = 0;
  const undiggableByBlock = new Map();
  const cannotHarvestByBlockTool = new Map();
  try {
    while (true) {
      const collectedTarget = countTarget() - baselineCount;
      if (collectedTarget >= num) break;
      if (bot.interrupt_code) break;
      if (isCollecting) {
        await new Promise(r => setTimeout(r, 50));
        continue;
      }
      if (candidates.size === 0) {
        const exit = handleEmptyCandidatesExit({
          emptyTicks,
          collectedTarget,
          unreachableCount,
          candidatesSize: candidates.size,
          MCDataInstance: MCData.getInstance(),
          blocktypes,
          blockType,
          FAR_DISTANCE,
          bot
        });
        if (exit.exit) break;
        await new Promise(r => setTimeout(r, 100));
        continue;
      } else {
      }

      const pick = selectNearestCandidate(candidates, lastDugPos, bot);
      if (!pick) continue;
      const { targetPos, targetKey } = pick;

      if (!isValidTarget(targetPos)) { candidates.delete(targetKey); continue; }

      let targetBlock;
      try { targetBlock = bot.blockAt(targetPos); } catch { candidates.delete(targetKey); continue; }
      if (!targetBlock) { candidates.delete(targetKey); continue; }

      try {
        if (targetBlock && targetBlock.diggable === false) {
          try {
            unreachableKeys.add(targetKey);
            unreachableCount++;
            const bname = targetBlock.name;
            undiggableByBlock.set(bname, (undiggableByBlock.get(bname) || 0) + 1);
          } catch {}
          candidates.delete(targetKey);
          continue;
        }
      } catch {}

      try { await bot.tool.equipForBlock(targetBlock); } catch {}
      const itemId = bot.heldItem ? bot.heldItem.type : null;
      try {
        if (!targetBlock.canHarvest(itemId)) {
          const toolName = (bot.heldItem && bot.heldItem.name) ? bot.heldItem.name : 'empty hand';
          try {
            unreachableKeys.add(targetKey);
            unreachableCount++;
            const bname = targetBlock.name;
            const key = `${bname}||${toolName}`;
            cannotHarvestByBlockTool.set(key, (cannotHarvestByBlockTool.get(key) || 0) + 1);
          } catch {}
          candidates.delete(targetKey);
          continue;
        }
      } catch {
        try {
          unreachableKeys.add(targetKey);
          unreachableCount++;
          const toolName = (bot.heldItem && bot.heldItem.name) ? bot.heldItem.name : 'empty hand';
          const bname = targetBlock?.name || 'unknown';
          const key = `${bname}||${toolName}`;
          cannotHarvestByBlockTool.set(key, (cannotHarvestByBlockTool.get(key) || 0) + 1);
        } catch {}
        candidates.delete(targetKey);
        continue;
      }

      try { await chooseDetour(bot, targetPos, pendingDrops, desiredDropNamesNormalized, DETOUR_BUDGET, URGENT_AGE_MS, DROP_NEAR_RADIUS, pf); } catch {}

      isCollecting = true;
      currentTargetKey = targetKey;
      candidates.delete(targetKey);
      {
        const res = await performDigAndPredict(bot, targetBlock, targetPos, countTarget, baselineCount, pendingDrops);
        if (res.lastDugPosNew) lastDugPos = res.lastDugPosNew;
        digBatchCount += res.digBatchInc;
      }
      isCollecting = false;
      currentTargetKey = null;

      await sweepPendingDropsIfNeeded(bot, pendingDrops, desiredDropNamesNormalized, DEBT_DROP_COUNT, ABOUT_TO_DESPAWN_MS, DROP_NEAR_RADIUS, pf);
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
