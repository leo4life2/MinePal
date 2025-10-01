// @ts-nocheck

function error (name, message) {
  const err = new Error(message)
  err.name = name
  return err
}

/**
   * Adds a easy-to-use API wrapper for quickly executing a goal and running
   * a callback when that goal is reached. This function serves to remove a
   * lot of boilerplate code for quickly executing a goal.
   *
   * @param {Bot} bot - The bot.
   * @param {Goal} goal - The goal to execute.
   * @returns {Promise} - resolves on success, rejects on error
   */
function goto (bot, goal) {
  return new Promise((resolve, reject) => {
    let updateCount = 0
    let lastStatus = null
    let lastPathHash = null
    const startTs = Date.now()
    let repeatPartialHash = null
    let repeatPartialCount = 0
    let idleTimer = null
    let lastUpdatePos = bot.entity.position.clone()
    const IDLE_TIMEOUT_MS = 4000
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        try {
          const currentPos = bot.entity.position.clone()
          const moved = currentPos.distanceTo(lastUpdatePos)
          if (moved > 0.35) {
            lastUpdatePos = currentPos
            resetIdleTimer()
            return
          }
        } catch {}
        const idleErr = error('GotoIdle', 'Pathfinder provided no updates while stationary')
        cleanup(idleErr)
      }, IDLE_TIMEOUT_MS)
    }
    resetIdleTimer()
    function goalReached () {
      cleanup()
    }

    function noPathListener (results) {
      resetIdleTimer()
      updateCount++
      try {
        const first = results.path && results.path.length > 0 ? results.path[0] : null
      } catch {}
      lastStatus = results.status
      try { lastUpdatePos = bot.entity.position.clone() } catch {}
      if (results.path && results.path.length > 0) {
        const lastNode = results.path[results.path.length - 1]
        lastPathHash = lastNode && lastNode.hash ? lastNode.hash : JSON.stringify(lastNode)
      }
      if (results.status === 'partial' && results.path && results.path.length > 0) {
        const lastNode = results.path[results.path.length - 1]
        const partialHash = lastNode && lastNode.hash ? lastNode.hash : JSON.stringify(lastNode)
        if (partialHash === repeatPartialHash) {
          repeatPartialCount++
        } else {
          repeatPartialHash = partialHash
          repeatPartialCount = 1
        }
        if (repeatPartialCount >= 4) {
          const stallErr = error('PartialStall', 'Pathfinder stuck providing partial paths without progress')
          cleanup(stallErr)
          return
        }
      } else {
        repeatPartialHash = null
        repeatPartialCount = 0
      }
      if (results.path.length === 0) {
        cleanup()
      } else if (results.status === 'noPath') {
        cleanup(error('NoPath', 'No path to the goal!'))
      } else if (results.status === 'timeout') {
        cleanup(error('Timeout', 'Took to long to decide path to goal!'))
      }
    }

    function goalChangedListener (newGoal) {
      if (newGoal !== goal) {
        cleanup()
      }
    }

    function pathStopped () {
      cleanup(error('PathStopped', 'Path was stopped before it could be completed! Thus, the desired goal was not reached.'))
    }

    function cleanup (err) {
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
      bot.removeListener('goal_reached', goalReached)
      bot.removeListener('path_update', noPathListener)
      bot.removeListener('goal_updated', goalChangedListener)
      bot.removeListener('path_stop', pathStopped)

      // Run callback on next event stack to let pathfinder properly cleanup,
      // otherwise chaining waypoints does not work properly.
      setTimeout(() => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      }, 0)
    }

    bot.on('path_stop', pathStopped)
    bot.on('goal_reached', goalReached)
    bot.on('path_update', noPathListener)
    bot.on('goal_updated', goalChangedListener)
    
    bot.pathfinder.setGoal(goal)
  })
}

module.exports = goto