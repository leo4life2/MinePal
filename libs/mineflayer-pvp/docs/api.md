# API <!-- omit in toc -->

Welcome to the *mineflayer-pvp* API documentation page.

## Table of Contents <!-- omit in toc -->

- [1. Summary](#1-summary)

## 1. Summary

* `bot.pvp.attack(entity)`

  Attacks the given entity

* `bot.pvp.target`

  The entity currently being attacked, if any. Value is read-only!

* `bot.pvp.stop()`

  Stops attacking the target entity.

* `bot.pvp.forceStop()`

  Stops attacking the target entity. Forces pathfinder to stop.

* `bot.pvp.movements`

  The pathfinder movements config to use when pursuing a target.

* `bot.pvp.followRange`

  How close to try to get to the target.

* `bot.pvp.viewDistance`

  How far away should a target be before losing interest.

* `bot.pvp.attackRange`

  How far from the target can the bot be and still try to attack.

* `bot.pvp.meleeAttackRate`

  The solver for determining how often to attack the target.

* `bot.on('startedAttacking', () => {})`

  Called when the bot has started attacking a new target.

* `bot.on('stoppedAttacking', () => {})`

  Called when the bot has stopped attacking a target. (Either manualluy stopped, or target has died/teleported/despawned/disconnected.)

* `bot.on('attackedTarget', () => {})`

  Called each time the bot preforms a melee attack.
