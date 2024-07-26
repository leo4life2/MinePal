import { Bot } from "mineflayer";
import { Movements, Pathfinder, goals } from "mineflayer-pathfinder";
import { Entity } from "prismarine-entity";
import { MaxDamageOffset, TimingSolver } from "./TimingSolver";
import { TaskQueue } from 'mineflayer-utils';

/**
 * The main pvp manager plugin class.
 */
export class PVP
{
    private readonly bot: Bot;
    private timeToNextAttack: number = 0;
    private wasInRange: boolean = false;
    private blockingExplosion: boolean = false;

    /**
     * The current target. This value should never be assigned to from outside the plugin.
     */
    target?: Entity;

    /**
     * The movements object to pass to pathfinder when creating the follow entity goal. Assign
     * to null in order to avoid passing any movement config to pathfinder. (If you plan on using
     * your own)
     */
    movements?: Movements;

    /**
     * How close the bot will attempt to get to the target when when pursuing it.
     */
    followRange: number = 2;

    /**
     * How far away the target entity must be to lose the target. Target entities further than this
     * distance from the bot will be considered defeated.
     */
    viewDistance: number = 128;

    /**
     * How close must the bot be to the target in order to try attacking it.
     */
    attackRange: number = 3.0;

    /**
     * The timing solver to use when deciding how long to wait before preforming another attack
     * after finishing an attack.
     *
     * // TODO Check for 'hasAtttackCooldown' feature. If feature not present, default to RandomTicks solver.
     */
    meleeAttackRate: TimingSolver = new MaxDamageOffset();

    /**
     * Creates a new instance of the PVP plugin.
     *
     * @param bot - The bot this plugin is being attached to.
     */
    constructor(bot: Bot)
    {
        this.bot = bot;
        this.movements = new Movements(bot);

        this.bot.on('physicsTick', () => this.update());
        this.bot.on('entityGone', e => { if (e === this.target) this.stop(); })
    }

    /**
     * Causes the bot to begin attacking an entity until it is killed or told to stop.
     *
     * @param target - The target to attack.
     */
    async attack(target: Entity): Promise<void>
    {
        if (target === this.target) return;

        await this.stop();
        this.target = target;
        this.timeToNextAttack = 0;

        if (!this.target) return;

        const pathfinder: Pathfinder = this.bot.pathfinder;
        if (this.movements) pathfinder.setMovements(this.movements);

        pathfinder.setGoal(new goals.GoalFollow(this.target, this.followRange), true);

        // @ts-expect-error
        this.bot.emit('startedAttacking');
    }

    /**
     * Stops attacking the current entity.
     */
    async stop(): Promise<void>
    {
        if (this.target == null) return

        this.target = undefined;

        const pathfinder: Pathfinder = this.bot.pathfinder;
        pathfinder.stop();

        try {
            await this.onceWithTimeout('path_stop', 5000)
        } catch (err) {
            this.bot.removeAllListeners('path_stop')
            pathfinder.setGoal(null)
        }

        // @ts-expect-error
        this.bot.emit('stoppedAttacking');
    }

    /**
     * Resolve if event fires within the timeout. Rejects if the event did not fire within the timeout.
     * @param eventName Event name to listen to
     * @param timeout Timeout in ms
     * @returns {Promise<void>}
     */
    async onceWithTimeout(eventName: string, timeout: number): Promise<void>
    {
        let callback = () => {}
        let timeoutId: NodeJS.Timeout
        const cleanup = (): void => {
            clearTimeout(timeoutId)
            this.bot.removeListener(eventName as any, callback)
        }
        return new Promise((resolve, reject) => {
            callback = (): void => {
                cleanup()
                resolve()
            }
            this.bot.once(eventName as any, callback)
            timeoutId = setTimeout(() => {
                cleanup()
                reject()
            }, timeout)
        })
    }

    /**
     * Stops attacking the current entity. Force stops pathfinder. May result in the bot falling off of things or failing jumps.
     * @returns void
     */
    forceStop(): void
    {
        if (this.target == null) return

        this.target = undefined;

        const pathfinder: Pathfinder = this.bot.pathfinder;
        pathfinder.setGoal(null);

        // @ts-expect-error
        this.bot.emit('stoppedAttacking');
    }

    /**
     * Called each tick to update attack timers.
     */
    private update(): void
    {
        this.checkExplosion();
        this.checkRange();

        if (!this.target || this.blockingExplosion) return;

        this.timeToNextAttack--;
        if (this.timeToNextAttack === -1)
            this.attemptAttack();
    }

    /**
     * Updates whether the bot is in attack range of the target or not.
     */
    private checkRange(): void
    {
        if (!this.target) return;
        if (this.timeToNextAttack < 0) return;

        const dist = this.target.position.distanceTo(this.bot.entity.position);

        if (dist > this.viewDistance)
        {
            this.stop();
            return;
        }

        const inRange = dist <= this.attackRange;

        if (!this.wasInRange && inRange)
            this.timeToNextAttack = 0;

        this.wasInRange = inRange;
    }

    /**
     * Blocks a creeper explosion with a shield.
     */
    private checkExplosion() {
        if (!this.target || !this.hasShield()) return;

        if (
            this.target.name &&
            this.target.name === 'creeper' &&
            this.target.metadata[16] &&
            // @ts-ignore
            this.target.metadata[16] === 1
        ) {
            this.blockingExplosion = true;

            this.bot.pathfinder.stop();
            this.bot.lookAt(this.target.position.offset(0, 1, 0), true);
            this.bot.activateItem(true);

            setTimeout(() => {
                this.blockingExplosion = false;
            }, 2000)
        }
    }

    /**
     * Attempts to preform an attack on the target.
     */
    private attemptAttack()
    {
        if (!this.target) return;

        if (!this.wasInRange)
        {
            this.timeToNextAttack = this.meleeAttackRate.getTicks(this.bot);
            return;
        }

        const queue = new TaskQueue()
        const target = this.target;
        const shield = this.hasShield();

        if (shield)
        {
            queue.addSync(() => this.bot.deactivateItem())
            queue.add(cb => setTimeout(cb, 100))
        }

        queue.add(cb => {
            if (target !== this.target) throw 'Target changed!';
            this.bot.lookAt(this.target.position.offset(0, this.target.height, 0), true).then(() => cb()).catch(err => cb(err));
        });

        queue.addSync(() => {
            if (target !== this.target) throw 'Target changed!';
            this.bot.attack(this.target);

            // @ts-expect-error
            this.bot.emit('attackedTarget');
        });

        if (shield)
        {
            queue.add(cb => setTimeout(cb, 150))
            queue.addSync(() => {
                if (target !== this.target) throw 'Target changed!';
                if (this.hasShield())
                    this.bot.activateItem(true)
            })
        }

        queue.runAll((err) => {
            if (!err)
                this.timeToNextAttack = this.meleeAttackRate.getTicks(this.bot);
        });
    }

    /**
     * Check if the bot currently has a shield equipped.
     */
    private hasShield(): boolean
    {
        if (this.bot.supportFeature('doesntHaveOffHandSlot')) return false;

        const slot = this.bot.inventory.slots[this.bot.getEquipmentDestSlot('off-hand')];
        if (!slot) return false;

        return slot.name.includes('shield');
    }
}
