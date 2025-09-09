// @ts-nocheck
const { performance } = require("perf_hooks");

const AStar = require("./lib/astar");
const Move = require("./lib/move");
const Movements = require("./lib/movements");
const gotoUtil = require("./lib/goto");
const Lock = require("./lib/lock");
const { GoalNear } = require('./lib/goals');

const Vec3 = require("vec3").Vec3;

const Physics = require("./lib/physics");
const nbt = require("prismarine-nbt");
const interactableBlocks = require("./lib/interactable.json");

function inject(bot) {
  const waterType = bot.registry.blocksByName.water.id;
  const ladderId = bot.registry.blocksByName.ladder.id;
  const vineId = bot.registry.blocksByName.vine.id;
  let stateMovements = new Movements(bot);
  let stateGoal = null;
  let astarContext = null;
  let astartTimedout = false;
  let dynamicGoal = false;
  let path = [];
  let pathUpdated = false;
  let digging = false;
  let placing = false;
  let placingBlock = null;
  let lastNodeTime = performance.now();
  let returningPos = null;
  let stopPathing = false;
  let lastStallTime = performance.now();
  let lastStallPos = null;
  let currentDigPos = null;
  let placingStartedAt = 0;
  let currentPlaceInterval = null;
  let consecutiveStallTimeouts = 0;
  const physics = new Physics(bot);
  const lockPlaceBlock = new Lock();
  const lockEquipItem = new Lock();
  const lockUseBlock = new Lock();
  let lastStallLogTs = 0;
  let lastFutilityLogTs = 0;
  let unstuckUntil = 0;
  let unstuckAction = null;
  let unstuckJump = false;
  const stallCounts = new Map(); // key: floored node pos "x|y|z" -> count

  bot.pathfinder = {};

  bot.pathfinder.thinkTimeout = 2000; // ms
  bot.pathfinder.tickTimeout = 40; // ms, amount of thinking per tick (max 50 ms)
  bot.pathfinder.searchRadius = -1; // in blocks, limits of the search area, -1: don't limit the search
  bot.pathfinder.enablePathShortcut = false; // disabled by default as it can cause bugs in specific configurations
  bot.pathfinder.LOSWhenPlacingBlocks = true;
  bot.pathfinder.sneak = false;
  bot.pathfinder.debugPathExec = false; // set true to trace corner/physics/control decisions
  bot.pathfinder.debugStallLogs = false; // set true to enable stall/futility logs
  // Stall detection (position-based): if pathing but not moving, reset path
  bot.pathfinder.stallTimeout = 1500; // ms without significant movement while pathing
  bot.pathfinder.stallDistanceEpsilon = 0.2; // blocks
  bot.pathfinder.placeTimeout = 2500; // ms maximum to spend on a single placing step
  bot.pathfinder.axisLocked = true; // prefer orthogonal, center-to-center movement when executing paths
  bot.pathfinder.axisOvershoot = 0.2; // meters to overshoot past block center along chosen axis (clamped within block)

  bot.pathfinder.bestHarvestTool = (block) => {
    const availableTools = bot.inventory.items();
    const effects = bot.entity.effects;

    let fastest = Number.MAX_VALUE;
    let bestTool = null;
    for (const tool of availableTools) {
      const enchants =
        tool && tool.nbt ? nbt.simplify(tool.nbt).Enchantments : [];
      const digTime = block.digTime(
        tool ? tool.type : null,
        false,
        false,
        false,
        enchants,
        effects
      );
      if (digTime < fastest) {
        fastest = digTime;
        bestTool = tool;
      }
    }

    return bestTool;
  };

  bot.pathfinder.getPathTo = (movements, goal, timeout) => {
    const generator = bot.pathfinder.getPathFromTo(
      movements,
      bot.entity.position,
      goal,
      { timeout }
    );
    const {
      value: { result, astarContext: context },
    } = generator.next();
    astarContext = context;
    return result;
  };

  bot.pathfinder.getPathFromTo = function* (
    movements,
    startPos,
    goal,
    options = {}
  ) {
    const optimizePath = options.optimizePath ?? true;
    const resetEntityIntersects = options.resetEntityIntersects ?? true;
    const timeout = options.timeout ?? bot.pathfinder.thinkTimeout;
    const tickTimeout = options.tickTimeout ?? bot.pathfinder.tickTimeout;
    const searchRadius = options.searchRadius ?? bot.pathfinder.searchRadius;
    let start;
    if (options.startMove) {
      start = options.startMove;
    } else {
      const p = startPos.floored();
      const dy = startPos.y - p.y;
      const b = bot.blockAt(p); // The block we are standing in
      // Offset the floored bot position by one if we are standing on a block that has not the full height but is solid
      const offset =
        b &&
        dy > 0.001 &&
        bot.entity.onGround &&
        !stateMovements.emptyBlocks.has(b.type)
          ? 1
          : 0;
      start = new Move(
        p.x,
        p.y + offset,
        p.z,
        movements.countScaffoldingItems(),
        0
      );
    }
    if (movements.allowEntityDetection) {
      if (resetEntityIntersects) {
        movements.clearCollisionIndex();
      }
      movements.updateCollisionIndex();
    }
    const astarContext = new AStar(
      start,
      movements,
      goal,
      timeout,
      tickTimeout,
      searchRadius
    );
    let result = astarContext.compute();
    if (optimizePath) result.path = postProcessPath(result.path);
    yield { result, astarContext };
    while (result.status === "partial") {
      result = astarContext.compute();
      if (optimizePath) result.path = postProcessPath(result.path);
      yield { result, astarContext };
    }
  };

  Object.defineProperties(bot.pathfinder, {
    goal: {
      get() {
        return stateGoal;
      },
    },
    movements: {
      get() {
        return stateMovements;
      },
    },
  });

  function detectDiggingStopped() {
    digging = false;
    bot.removeAllListeners("diggingAborted", detectDiggingStopped);
    bot.removeAllListeners("diggingCompleted", detectDiggingStopped);
  }

  function resetPath(reason, clearStates = true) {
    try {
      console.log("[pathfinder][resetPath] reason=%s digging=%s placing=%s pathLen=%s", reason, digging, placing, path.length);
    } catch {}
    if (!stopPathing && path.length > 0) bot.emit("path_reset", reason);
    path = [];
    if (digging) {
      bot.on("diggingAborted", detectDiggingStopped);
      bot.on("diggingCompleted", detectDiggingStopped);
      bot.stopDigging();
    }
    placing = false;
    pathUpdated = false;
    astarContext = null;
    lockEquipItem.release();
    lockPlaceBlock.release();
    lockUseBlock.release();
    stateMovements.clearCollisionIndex();
    if (clearStates) bot.clearControlStates();
    if (stopPathing) return stop();
  }

  bot.pathfinder.setGoal = (goal, dynamic = false) => {
    stateGoal = goal;
    dynamicGoal = dynamic;
    bot.emit("goal_updated", goal, dynamic);
    resetPath("goal_updated");
  };

  bot.pathfinder.setMovements = (movements) => {
    stateMovements = movements;
    resetPath("movements_updated");
  };

  bot.pathfinder.isMoving = () => path.length > 0;
  bot.pathfinder.isMining = () => digging;
  bot.pathfinder.isBuilding = () => placing;

  bot.pathfinder.goto = (goal) => {
    if (bot.pathfinder.debugPathExec) console.log('[pathfinder][goto] setGoal=%j', goal);
    // Wrap goto to ensure lingering dynamic goals are stopped on rejection
    return gotoUtil(bot, goal).catch((err) => {
      try { bot.pathfinder.stop(); } catch {}
      throw err;
    });
  };

  bot.pathfinder.stop = () => {
    stopPathing = true;
  };

  bot.on("physicsTick", monitorMovement);

  function postProcessPath(path) {
    for (let i = 0; i < path.length; i++) {
      const curPoint = path[i];
      if (curPoint.toBreak.length > 0 || curPoint.toPlace.length > 0) break;
      const b = bot.blockAt(new Vec3(curPoint.x, curPoint.y, curPoint.z));
      if (
        b &&
        (b.type === waterType ||
          ((b.type === ladderId || b.type === vineId) &&
            i + 1 < path.length &&
            path[i + 1].y < curPoint.y))
      ) {
        curPoint.x = Math.floor(curPoint.x) + 0.5;
        curPoint.y = Math.floor(curPoint.y);
        curPoint.z = Math.floor(curPoint.z) + 0.5;
        continue;
      }
      let np = getPositionOnTopOf(b);
      if (np === null)
        np = getPositionOnTopOf(
          bot.blockAt(new Vec3(curPoint.x, curPoint.y - 1, curPoint.z))
        );
      if (np) {
        curPoint.x = np.x;
        curPoint.y = np.y;
        curPoint.z = np.z;
      } else {
        curPoint.x = Math.floor(curPoint.x) + 0.5;
        curPoint.y = curPoint.y - 1;
        curPoint.z = Math.floor(curPoint.z) + 0.5;
      }
    }
    // Keep nodes as-is; rely on steering to stay orthogonal without forcing strict centering
    if (
      !bot.pathfinder.enablePathShortcut ||
      stateMovements.exclusionAreasStep.length !== 0 ||
      path.length === 0
    )
      return path;

    const newPath = [];
    let lastNode = bot.entity.position;
    for (let i = 1; i < path.length; i++) {
      const node = path[i];
      if (
        Math.abs(node.y - lastNode.y) > 0.5 ||
        node.toBreak.length > 0 ||
        node.toPlace.length > 0 ||
        !physics.canStraightLineBetween(lastNode, node)
      ) {
        // Before accepting a long segment, add an intermediate center point if it turns 90° next to reduce corner cuts
        const prev = path[i - 1];
        const hasTurn = (i + 1 < path.length) && ((path[i + 1].x !== node.x) ^ (path[i + 1].z !== node.z));
        if (hasTurn) {
          newPath.push(new Vec3(Math.floor(node.x) + 0.5, Math.floor(node.y), Math.floor(node.z) + 0.5));
        } else {
          newPath.push(path[i - 1]);
        }
        lastNode = path[i - 1];
      }
    }
    newPath.push(path[path.length - 1]);
    return newPath;
  }

  function pathFromPlayer(path) {
    if (path.length === 0) return;
    let minI = 0;
    let minDistance = 1000;
    for (let i = 0; i < path.length; i++) {
      const node = path[i];
      if (node.toBreak.length !== 0 || node.toPlace.length !== 0) break;
      const dist = bot.entity.position.distanceSquared(node);
      if (dist < minDistance) {
        minDistance = dist;
        minI = i;
      }
    }
    // check if we are between 2 nodes
    const n1 = path[minI];
    // check if node already reached
    const dx = n1.x - bot.entity.position.x;
    const dy = n1.y - bot.entity.position.y;
    const dz = n1.z - bot.entity.position.z;
    const reached =
      Math.abs(dx) <= 0.35 && Math.abs(dz) <= 0.35 && Math.abs(dy) < 1;
    if (
      minI + 1 < path.length &&
      n1.toBreak.length === 0 &&
      n1.toPlace.length === 0
    ) {
      const n2 = path[minI + 1];
      const d2 = bot.entity.position.distanceSquared(n2);
      const d12 = n1.distanceSquared(n2);
      minI += d12 > d2 || reached ? 1 : 0;
    }

    path.splice(0, minI);
  }

  function isPositionNearPath(pos, path) {
    let prevNode = null;
    for (const node of path) {
      let comparisonPoint = null;
      if (
        prevNode === null ||
        (Math.abs(prevNode.x - node.x) <= 2 &&
          Math.abs(prevNode.y - node.y) <= 2 &&
          Math.abs(prevNode.z - node.z) <= 2)
      ) {
        // Unoptimized path, or close enough to last point
        // to just check against the current point
        comparisonPoint = node;
      } else {
        // Optimized path - the points are far enough apart
        //   that we need to check the space between them too

        // First, a quick check - if point it outside the path
        // segment's AABB, then it isn't near.
        const minBound = prevNode.min(node);
        const maxBound = prevNode.max(node);
        if (
          pos.x - 0.5 < minBound.x - 1 ||
          pos.x - 0.5 > maxBound.x + 1 ||
          pos.y - 0.5 < minBound.y - 2 ||
          pos.y - 0.5 > maxBound.y + 2 ||
          pos.z - 0.5 < minBound.z - 1 ||
          pos.z - 0.5 > maxBound.z + 1
        ) {
          continue;
        }

        comparisonPoint = closestPointOnLineSegment(pos, prevNode, node);
      }

      const dx = Math.abs(comparisonPoint.x - pos.x - 0.5);
      const dy = Math.abs(comparisonPoint.y - pos.y - 0.5);
      const dz = Math.abs(comparisonPoint.z - pos.z - 0.5);
      if (dx <= 1 && dy <= 2 && dz <= 1) return true;

      prevNode = node;
    }

    return false;
  }

  function closestPointOnLineSegment(point, segmentStart, segmentEnd) {
    const segmentLength = segmentEnd.minus(segmentStart).norm();

    if (segmentLength === 0) {
      return segmentStart;
    }

    // t is like an interpolation from segmentStart to segmentEnd
    //  for the closest point on the line
    let t =
      point.minus(segmentStart).dot(segmentEnd.minus(segmentStart)) /
      segmentLength;

    // bound t to be on the segment
    t = Math.max(0, Math.min(1, t));

    return segmentStart.plus(segmentEnd.minus(segmentStart).scaled(t));
  }

  // Return the average x/z position of the highest standing positions
  // in the block.
  function getPositionOnTopOf(block) {
    if (!block || block.shapes.length === 0) return null;
    const p = new Vec3(0.5, 0, 0.5);
    let n = 1;
    for (const shape of block.shapes) {
      const h = shape[4];
      if (h === p.y) {
        p.x += (shape[0] + shape[3]) / 2;
        p.z += (shape[2] + shape[5]) / 2;
        n++;
      } else if (h > p.y) {
        n = 2;
        p.x = 0.5 + (shape[0] + shape[3]) / 2;
        p.y = h;
        p.z = 0.5 + (shape[2] + shape[5]) / 2;
      }
    }
    p.x /= n;
    p.z /= n;
    return block.position.plus(p);
  }

  /**
   * Stop the bot's movement and recenter to the center off the block when the bot's hitbox is partially beyond the
   * current blocks dimensions.
   */
  function fullStop() {
    bot.clearControlStates();

    // Force horizontal velocity to 0 (otherwise inertia can move us too far)
    // Kind of cheaty, but the server will not tell the difference
    bot.entity.velocity.x = 0;
    bot.entity.velocity.z = 0;

    const blockX = Math.floor(bot.entity.position.x) + 0.5;
    const blockZ = Math.floor(bot.entity.position.z) + 0.5;

    // Make sure our bounding box don't collide with neighboring blocks
    // otherwise recenter the position
    if (Math.abs(bot.entity.position.x - blockX) > 0.2) {
      bot.entity.position.x = blockX;
    }
    if (Math.abs(bot.entity.position.z - blockZ) > 0.2) {
      bot.entity.position.z = blockZ;
    }
  }

  function moveToEdge(refBlock, edge) {
    // If allowed turn instantly should maybe be a bot option
    const allowInstantTurn = false;
    function getViewVector(pitch, yaw) {
      const csPitch = Math.cos(pitch);
      const snPitch = Math.sin(pitch);
      const csYaw = Math.cos(yaw);
      const snYaw = Math.sin(yaw);
      return new Vec3(-snYaw * csPitch, snPitch, -csYaw * csPitch);
    }
    // Target viewing direction while approaching edge
    // The Bot approaches the edge while looking in the opposite direction from where it needs to go
    // The target Pitch angle is roughly the angle the bot has to look down for when it is in the position
    // to place the next block
    const targetBlockPos = refBlock.offset(edge.x + 0.5, edge.y, edge.z + 0.5);
    const targetPosDelta = bot.entity.position.clone().subtract(targetBlockPos);
    const targetYaw = Math.atan2(-targetPosDelta.x, -targetPosDelta.z);
    const targetPitch = -1.421;
    const viewVector = getViewVector(targetPitch, targetYaw);
    // While the bot is not in the right position rotate the view and press back while crouching
    if (
      bot.entity.position.distanceTo(
        refBlock.clone().offset(edge.x + 0.5, 1, edge.z + 0.5)
      ) > 0.4
    ) {
      bot.lookAt(
        bot.entity.position.offset(viewVector.x, viewVector.y, viewVector.z),
        allowInstantTurn
      );
      bot.setControlState("sneak", true);
      bot.setControlState("back", true);
      return false;
    }
    bot.setControlState("back", false);
    return true;
  }

  function moveToBlock(pos) {
    // minDistanceSq = Min distance sqrt to the target pos were the bot is centered enough to place blocks around him
    const minDistanceSq = 0.3 * 0.3;
    const targetPos = pos.clone().offset(0.5, 0, 0.5);
    if (bot.entity.position.distanceSquared(targetPos) > minDistanceSq) {
      bot.lookAt(targetPos);
      bot.setControlState("forward", true);
      return false;
    }
    bot.setControlState("forward", false);
    return true;
  }

  function stop() {
    stopPathing = false;
    stateGoal = null;
    path = [];
    bot.emit("path_stop");
    fullStop();
  }

  bot.on("blockUpdate", (oldBlock, newBlock) => {
    if (!oldBlock || !newBlock) return;
    // Ignore updates caused by our own planned actions (placing/digging)
    if (placingBlock && newBlock.position && newBlock.position.x === placingBlock.x && newBlock.position.y === placingBlock.y && newBlock.position.z === placingBlock.z) return;
    if (currentDigPos && newBlock.position && newBlock.position.x === currentDigPos.x && newBlock.position.y === currentDigPos.y && newBlock.position.z === currentDigPos.z) return;
    if (
      isPositionNearPath(oldBlock.position, path) &&
      oldBlock.type !== newBlock.type
    ) {
      resetPath("block_updated", false);
    }
  });

  bot.on("chunkColumnLoad", (chunk) => {
    // Reset only if the new chunk is adjacent to a visited chunk
    if (astarContext) {
      const cx = chunk.x >> 4;
      const cz = chunk.z >> 4;
      if (
        astarContext.visitedChunks.has(`${cx - 1},${cz}`) ||
        astarContext.visitedChunks.has(`${cx},${cz - 1}`) ||
        astarContext.visitedChunks.has(`${cx + 1},${cz}`) ||
        astarContext.visitedChunks.has(`${cx},${cz + 1}`)
      ) {
        resetPath("chunk_loaded", false);
      }
    }
  });

  function monitorMovement() {
    // Apply a brief nudge after stall timeouts to break micro-collisions
    const nowTick = performance.now();
    if (unstuckUntil && nowTick < unstuckUntil) {
      if (unstuckAction === 'back') {
        bot.setControlState('back', true);
      } else if (unstuckAction === 'left') {
        bot.setControlState('left', true);
      } else if (unstuckAction === 'right') {
        bot.setControlState('right', true);
      }
      if (unstuckJump) bot.setControlState('jump', true);
      return;
    } else if (unstuckAction) {
      bot.clearControlStates();
      unstuckAction = null;
      unstuckUntil = 0;
      unstuckJump = false;
    }
    // Check if the bot is allowed free motion and if the goal is an entity
    if (stateMovements && stateMovements.allowFreeMotion && stateGoal && stateGoal.entity) {
      const target = stateGoal.entity;
      // Check if the bot can move in a straight line to the target
      if (physics.canStraightLine([target.position])) {
        bot.lookAt(target.position.offset(0, 1.6, 0));

        // Check if the target is within range
        if (target.position.distanceSquared(bot.entity.position) > stateGoal.rangeSq) {
          if (bot.vehicle) {
            console.log("Vehicle move forward");
            bot.moveVehicle(0, 1); // Move forward
          } else {
            console.log("Foot move forward");
            bot.setControlState("forward", true);
          }
        } else {
          if (bot.vehicle) {
            console.log("Vehicle stop");
            bot.moveVehicle(0, 0); // Stop
          } else {
            console.log("Foot stop");
            bot.clearControlStates();
          }
        }
        return;
      }
    }

    // Check if the goal is still valid
    if (stateGoal) {
      if (!stateGoal.isValid()) {
        stop();
      } else if (stateGoal.hasChanged()) {
        resetPath("goal_moved", false);
      }
    }

    // Check if the A* context exists and if it has timed out
    if (astarContext && astartTimedout) {
      const results = astarContext.compute();
      results.path = postProcessPath(results.path);
      pathFromPlayer(results.path);
      bot.emit("path_update", results);
      path = results.path;
      astartTimedout = results.status === "partial";
    }

    // Check if the bot needs to return to a specific position for placing blocks
    if (bot.pathfinder.LOSWhenPlacingBlocks && returningPos) {
      if (!moveToBlock(returningPos)) return;
      returningPos = null;
    }

    // Check if the path is empty
    if (path.length === 0) {
      lastNodeTime = performance.now();
      if (stateGoal && stateMovements) {
        if (stateGoal.isEnd(bot.entity.position.floored())) {
          if (!dynamicGoal) {
            bot.emit("goal_reached", stateGoal);
            stateGoal = null;
            fullStop();
          }
        } else if (!pathUpdated) {
          const results = bot.pathfinder.getPathTo(stateMovements, stateGoal);
          bot.emit("path_update", results);
          path = results.path;
          astartTimedout = results.status === "partial";
          pathUpdated = true;
          if (bot.pathfinder.debugPathExec) console.log('[pathfinder][astar] new status=%s pathLen=%s', results.status, results.path.length);
        }
      }
    }

    // Check if the path is still empty after attempting to update it
    if (path.length === 0) {
      return;
    }

    let nextPoint = path[0];
    const p = bot.entity.position;

    // Ensure nextPoint is defined
    if (!nextPoint) {
      resetPath("nextPoint_undefined");
      return;
    }

    function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function walkTo(x, y, z, range = 3) {
      bot.pathfinder.setGoal(new GoalNear(x, y, z, range));
      await sleep(1000);
      while (bot.pathfinder.isMoving()) {
        await sleep(100);
      }
    }

    async function walkThroughDoor(doorToOpen) {
      if (!doorToOpen._properties.open) {
        await bot.activateBlock(doorToOpen);
      } else {
        await bot.lookAt(doorToOpen.position.offset(0.5, 0.5, 0.5), false)
      }
      bot.setControlState("forward", true);
      await sleep(600);
      bot.setControlState("forward", false);
      if (!doorToOpen._properties.open) {
        await bot.activateBlock(doorToOpen);
      }
      resetPath("door_walked_through");
      lastNodeTime = performance.now();
      digging = false;
    }

    // Handle digging
    if (digging || nextPoint.toBreak.length > 0) {
      if (!digging && bot.entity.onGround) {
        digging = true;
        const b = nextPoint.toBreak.shift();
        const block = bot.blockAt(new Vec3(b.x, b.y, b.z), false);
        currentDigPos = block ? block.position.clone() : null;
        const tool = bot.pathfinder.bestHarvestTool(block);
        fullStop();
        // Refresh progress timer so futility/stall checks don't trip while starting a dig
        lastNodeTime = performance.now();
        try {
          const posStr = block && block.position ? `${block.position.x},${block.position.y},${block.position.z}` : `${b.x},${b.y},${b.z}`;
          console.log("[pathfinder][dig] start at %s tool=%s", posStr, tool ? (tool.name || tool.type) : 'none');
        } catch {}

        const digBlock = () => {
          bot
            .dig(block, true)
            .catch((_ignoreError) => {
              resetPath("dig_error");
            })
            .then(function () {
              lastNodeTime = performance.now();
              digging = false;
              currentDigPos = null;
              try { console.log("[pathfinder][dig] completed"); } catch {}
            });
        };

        if (block.name.includes('door') || block.name.includes('gate') && !block.name.includes('iron')) {
          walkThroughDoor(block);
        } else if (!tool) {
          digBlock();
        } else {
          bot
            .equip(tool, "hand")
            .catch((_ignoreError) => {})
            .then(() => digBlock());
        }
      }
      return;
    }

    // Handle block placement
    if (placing || nextPoint.toPlace.length > 0) {
      if (!placing) {
        placing = true;
        placingBlock = nextPoint.toPlace.shift();
        fullStop();
        placingStartedAt = performance.now();
      }

      if (placingBlock) {
        // Abort placing if we've been trying too long (prevents infinite jump loops)
        if (performance.now() - placingStartedAt > bot.pathfinder.placeTimeout) {
          console.log("[pathfinder][place] timeout -> resetPath(place_timeout)");
          if (currentPlaceInterval) { try { clearInterval(currentPlaceInterval); } catch {} currentPlaceInterval = null; }
          placing = false;
          placingBlock = null;
          resetPath("place_timeout");
          return;
        }
        // Open gates or doors
        if (placingBlock.useOne) {
          if (!lockUseBlock.tryAcquire()) return;
          bot
            .activateBlock(
              bot.blockAt(
                new Vec3(placingBlock.x, placingBlock.y, placingBlock.z)
              )
            )
            .then(
              () => {
                lockUseBlock.release();
                placing = false; // Add this line to stop spamming
                lastNodeTime = performance.now(); // Add this line to update the last node time
              },
              (err) => {
                console.error(err);
                lockUseBlock.release();
              }
            );
          return;
        }
        const block = stateMovements.getScaffoldingItem();
        if (!block) {
          resetPath("no_scaffolding_blocks");
          return;
        }
        if (
          bot.pathfinder.LOSWhenPlacingBlocks &&
          placingBlock.y === bot.entity.position.floored().y - 1 &&
          placingBlock.dy === 0
        ) {
          if (
            !moveToEdge(
              new Vec3(placingBlock.x, placingBlock.y, placingBlock.z),
              new Vec3(placingBlock.dx, 0, placingBlock.dz)
            )
          )
            return;
        }
        let canPlace = true;
        if (placingBlock.jump) {
          bot.setControlState("jump", true);
          canPlace = placingBlock.y + 1 < bot.entity.position.y;
        }
        if (canPlace) {
          if (!lockEquipItem.tryAcquire()) return;
          bot
            .equip(block, "hand")
            .then(function () {
              lockEquipItem.release();
              const refBlock = bot.blockAt(
                new Vec3(placingBlock.x, placingBlock.y, placingBlock.z),
                false
              );
              if (!lockPlaceBlock.tryAcquire()) return;
              if (interactableBlocks.includes(refBlock.name)) {
                bot.setControlState("sneak", true);
              }

              // Spam placeBlock while jumping
              currentPlaceInterval = setInterval(() => {
                if (!placingBlock) {
                  clearInterval(currentPlaceInterval);
                  currentPlaceInterval = null;
                  return;
                }
                bot
                  .placeBlock(
                    refBlock,
                    new Vec3(placingBlock.dx || 0, placingBlock.dy || 0, placingBlock.dz || 0)
                  )
                  .then(function () {
                    clearInterval(currentPlaceInterval); // Stop spamming once successful
                    currentPlaceInterval = null;
                    bot.setControlState("sneak", false);
                    if (
                      bot.pathfinder.LOSWhenPlacingBlocks &&
                      placingBlock && placingBlock.returnPos
                    )
                      returningPos = placingBlock.returnPos.clone();
                    
                    // Emit blockPlaced event
                    const newBlock = placingBlock ? bot.blockAt(new Vec3(placingBlock.x, placingBlock.y, placingBlock.z)) : null;
                    bot.emit('blockPlaced', refBlock, newBlock);
                    // Placement completed; clear placing state
                    placing = false;
                    placingBlock = null;
                    lastNodeTime = performance.now();
                  })
                  .catch((_ignoreError) => {
                    // Keep trying until successful
                  });
              }, 50); // Adjust the interval as needed

            })
            .catch((_ignoreError) => {});
        }
        return;
      }
    }

    let dx = nextPoint.x - p.x;
    const dy = nextPoint.y - p.y;
    let dz = nextPoint.z - p.z;
    // Corner handling: detect real 90° turns by comparing axes of travel (prevDir vs nextDir)
    if (path.length >= 2) {
      const a = nextPoint;
      const b = path[1];
      // Approximate previous travel axis using current position → nextPoint
      const prevAxis = Math.abs(a.x - p.x) > Math.abs(a.z - p.z) ? 'x' : 'z';
      const nextAxis = Math.abs(b.x - a.x) > Math.abs(b.z - a.z) ? 'x' : 'z';
      const isTurn = (prevAxis !== nextAxis) && Math.abs(b.y - a.y) < 0.001;
      const distToCenterSq = bot.entity.position.distanceSquared(new Vec3(a.x + 0.5, a.y, a.z + 0.5));
      // Only attempt centering if clearly off-center and truly turning
      if (isTurn && distToCenterSq > 0.04) {
        const nowTs = performance.now();
        if (bot.pathfinder.debugPathExec) {
          console.log("[pathfinder][corner] isTurn=true prevAxis=%s nextAxis=%s a=%j b=%j distToCenterSq=%s", prevAxis, nextAxis, { x:a.x, y:a.y, z:a.z }, { x:b.x, y:b.y, z:b.z }, distToCenterSq.toFixed(3));
        }
        // Throttle centering attempts to avoid oscillation
        if (!monitorMovement._lastCornerCenterTs || (nowTs - monitorMovement._lastCornerCenterTs) > 150) {
          monitorMovement._lastCornerCenterTs = nowTs;
          const reachedCenter = moveToBlock(new Vec3(a.x, a.y, a.z));
          if (bot.pathfinder.debugPathExec) {
            monitorMovement._centerFails = reachedCenter ? 0 : ((monitorMovement._centerFails || 0) + 1);
            console.log("[pathfinder][corner] moveToBlock centered=%s consecutiveFails=%s", reachedCenter, monitorMovement._centerFails);
          }
          if (!reachedCenter) {
            // Wait to be centered before proceeding, reduces corner clipping
            return;
          }
        }
      }
    }
    const withinNode = Math.abs(dx) <= 0.35 && Math.abs(dz) <= 0.35 && Math.abs(dy) < 1;
    if (bot.pathfinder.debugPathExec) {
      // arrival gate debug
      console.log("[pathfinder][arrive] withinNode=%s dx=%s dz=%s dy=%s", withinNode, Math.abs(dx).toFixed(3), Math.abs(dz).toFixed(3), Math.abs(dy).toFixed(3));
    }
    if (withinNode) {
      // arrived at next point
      lastNodeTime = performance.now();
      if (stopPathing) {
        stop();
        return;
      }
      path.shift();
      if (path.length === 0) {
        // done
        // If the block the bot is standing on is not a full block only checking for the floored position can fail as
        // the distance to the goal can get greater then 0 when the vector is floored.
        if (
          !dynamicGoal &&
          stateGoal &&
          (stateGoal.isEnd(p.floored()) ||
            stateGoal.isEnd(p.floored().offset(0, 1, 0)))
        ) {
          bot.emit("goal_reached", stateGoal);
          stateGoal = null;
        }
        fullStop();
        return;
      }
      // not done yet
      nextPoint = path[0];
      if (nextPoint.toBreak.length > 0 || nextPoint.toPlace.length > 0) {
        fullStop();
        return;
      }
      dx = nextPoint.x - p.x;
      dz = nextPoint.z - p.z;
    }

    if (bot.vehicle) {
      console.log("Vehicle movement");
      bot.moveVehicle(dx > 0 ? 1 : -1, dz > 0 ? 1 : -1);
    } else {
      // Axis-locked steering: prefer orthogonal movement (center-to-center) over diagonals
      let desiredYaw;
      if (bot.pathfinder.axisLocked) {
        const center = new Vec3(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
        // If significantly off-center, gently steer toward center while progressing
        const offCenterSq = bot.entity.position.distanceSquared(center.clone().offset(0.5, 0, 0.5));
        if (offCenterSq > 0.25 * 0.25) {
          moveToBlock(center); // don't early-return; avoid stalls
        }
        const preferX = Math.abs(dx) >= Math.abs(dz);
        const overshoot = Math.max(0, Math.min(0.3, bot.pathfinder.axisOvershoot || 0));
        const destBlockX = Math.floor(nextPoint.x);
        const destBlockZ = Math.floor(nextPoint.z);
        const baseTargetX = destBlockX + 0.5;
        const baseTargetZ = destBlockZ + 0.5;
        if (preferX) {
          const dir = Math.sign(dx) || (p.x < baseTargetX ? 1 : -1);
          let targetX = baseTargetX + dir * overshoot;
          const minX = destBlockX + 0.2;
          const maxX = destBlockX + 0.8;
          if (targetX < minX) targetX = minX;
          if (targetX > maxX) targetX = maxX;
          const txDx = targetX - p.x;
          const tzDz = baseTargetZ - p.z;
          desiredYaw = Math.atan2(-txDx, -tzDz);
        } else {
          const dir = Math.sign(dz) || (p.z < baseTargetZ ? 1 : -1);
          let targetZ = baseTargetZ + dir * overshoot;
          const minZ = destBlockZ + 0.2;
          const maxZ = destBlockZ + 0.8;
          if (targetZ < minZ) targetZ = minZ;
          if (targetZ > maxZ) targetZ = maxZ;
          const txDx = baseTargetX - p.x;
          const tzDz = targetZ - p.z;
          desiredYaw = Math.atan2(-txDx, -tzDz);
        }
      } else {
        desiredYaw = Math.atan2(-dx, -dz);
      }
      bot.look(desiredYaw, 0);
      bot.setControlState("forward", true);
      bot.setControlState("jump", false);
      bot.setControlState('sneak', bot.pathfinder.sneak);

      if (bot.entity.isInWater) {
        bot.setControlState("jump", true);
        bot.setControlState("sprint", false);
      } else if (
        stateMovements.allowSprinting &&
        physics.canStraightLine(path, true)
      ) {
        bot.setControlState("jump", false);
        bot.setControlState("sprint", true);
      } else if (stateMovements.allowSprinting && physics.canSprintJump(path)) {
        bot.setControlState("jump", true);
        bot.setControlState("sprint", true);
      } else if (physics.canStraightLine(path)) {
        bot.setControlState("jump", false);
        bot.setControlState("sprint", false);
      } else if (physics.canWalkJump(path)) {
        bot.setControlState("jump", true);
        bot.setControlState("sprint", false);
      } else {
        bot.setControlState("forward", false);
        bot.setControlState("sprint", false);
      }

      // Physics/control snapshot (throttled) to diagnose jiggle
      if (bot.pathfinder.debugPathExec) {
        const nowTs = performance.now();
        if (!monitorMovement._lastCtrlLog || nowTs - monitorMovement._lastCtrlLog > 250) {
          monitorMovement._lastCtrlLog = nowTs;
          const v = bot.entity.velocity;
          const canSL = physics.canStraightLine(path);
          console.log("[pathfinder][phys] canStraightLine=%s dx=%s dz=%s pathLen=%s", canSL, (nextPoint.x - p.x).toFixed(2), (nextPoint.z - p.z).toFixed(2), path.length);
          console.log("[pathfinder][ctrl] forward=%s jump=%s sprint=%s sneak=%s vel=(%s,%s,%s)",
            bot.controlState.forward, bot.controlState.jump, bot.controlState.sprint, bot.controlState.sneak,
            v.x.toFixed(3), v.y.toFixed(3), v.z.toFixed(3));
          // motion delta snapshot
          if (monitorMovement._dbgPrevPos) {
            const dpx = p.x - monitorMovement._dbgPrevPos.x;
            const dpy = p.y - monitorMovement._dbgPrevPos.y;
            const dpz = p.z - monitorMovement._dbgPrevPos.z;
            const d2 = dpx * dpx + dpy * dpy + dpz * dpz;
            console.log("[pathfinder][motion] deltaSq=%s", d2.toFixed(4));
          }
          monitorMovement._dbgPrevPos = p.clone();
        }
      }
    }

    // Position-based stall detection: if pathing but not moving for too long, reset path
    const now = performance.now();
    if (!lastStallPos) {
      lastStallPos = bot.entity.position.clone();
      lastStallTime = now;
      if (bot.pathfinder.debugStallLogs) console.log("[pathfinder][stall] init lastStallPos=(%d,%d,%d)", lastStallPos.x, lastStallPos.y, lastStallPos.z);
    } else {
      const dxp = bot.entity.position.x - lastStallPos.x;
      const dyp = bot.entity.position.y - lastStallPos.y;
      const dzp = bot.entity.position.z - lastStallPos.z;
      const distSq = dxp * dxp + dyp * dyp + dzp * dzp;
      const eps = bot.pathfinder.stallDistanceEpsilon;
      const epsSq = eps * eps;
      const elapsed = now - lastStallTime;
      if (bot.pathfinder.debugStallLogs) {
        console.log(
          "[pathfinder][stall] check distSq=%s epsSq=%s elapsed=%sms digging=%s placing=%s pathLen=%s",
          distSq.toFixed(3), epsSq.toFixed(3), Math.floor(elapsed), digging, placing, path.length
        );
      }
      if (distSq > epsSq) {
        if (bot.pathfinder.debugStallLogs) console.log("[pathfinder][stall] movement detected; updating stall timers");
        lastStallPos = bot.entity.position.clone();
        lastStallTime = now;
        consecutiveStallTimeouts = 0;
      } else if (path.length > 0 && !digging && !placing && (elapsed > bot.pathfinder.stallTimeout)) {
        consecutiveStallTimeouts++;
        const centerFails = monitorMovement._centerFails || 0;
        console.log("[pathfinder][stall] TIMEOUT #%d node=%j centerFails=%s -> resetPath(stall_timeout)", consecutiveStallTimeouts, nextPoint, centerFails);
        resetPath("stall_timeout");
        lastNodeTime = now;
        lastStallPos = bot.entity.position.clone();
        lastStallTime = now;
        // Small movement nudge to break out of collisions
        // Randomize direction and increase step size ~15%, with slight jitter; 50% chance to jump
        const dirs = ['left', 'right', 'back'];
        const pick = Math.floor(Math.random() * dirs.length);
        unstuckAction = dirs[pick];
        const base = 200; // ms
        const factor = 1.15; // +15%
        const jitter = 0.8 + Math.random() * 0.4; // 0.8x..1.2x
        unstuckUntil = now + Math.floor(base * factor * jitter);
        unstuckJump = Math.random() < 0.5;
        // Skip current node sooner when repeatedly stalling or the path is trivial
        if (consecutiveStallTimeouts >= 2 || path.length <= 1) {
          if (bot.pathfinder.debugStallLogs) console.log("[pathfinder][stall] HARD RECOVERY: clearing states and skipping node");
          digging = false;
          placing = false;
          currentDigPos = null;
          if (path.length > 0) path.shift();
          consecutiveStallTimeouts = 0;
        }
        return;
      }
    }

    // check for futility (skip while mining or building)
    const futElapsed = performance.now() - lastNodeTime;
    if (bot.pathfinder.debugStallLogs) {
      console.log(
        "[pathfinder][futility] elapsed=%sms digging=%s placing=%s pathLen=%s",
        Math.floor(futElapsed), digging, placing, path.length
      );
    }
    if (!digging && !placing && (futElapsed > 3500)) {
      console.log("[pathfinder][futility] STUCK -> resetPath(stuck)");
      // should never take this long to go to the next node
      resetPath("stuck");
    }
  }
}

module.exports = {
  pathfinder: inject,
  Movements: require("./lib/movements"),
  goals: require("./lib/goals"),
};
