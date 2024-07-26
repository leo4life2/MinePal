import { Bot } from "mineflayer";
import { getCooldown } from "./Cooldown";

/**
 * A solver that can be used to determine the number of ticks to wait
 * aftter an attack before attempting another attack.
 */
export interface TimingSolver
{
    /**
     * Sampled right after an attack to get the number of ticks to wait
     * before the next attack.
     * 
     * @param bot - The bot preforming the action.
     */
    getTicks(bot: Bot): number;
}

/**
 * A timing solver that simply return a random number of ticks between
 * a min and max value.
 */
export class RandomTicks implements TimingSolver
{
    readonly min: number;
    readonly max: number;

    constructor(min: number = 10, max: number = 20)
    {
        this.min = min;
        this.max = max;
    }

    /** @inheritdoc */
    getTicks(): number
    {
        const ticks = Math.floor(Math.random() * (this.max - this.min) + this.min);
        return Math.max(1, ticks);
    }
}

/**
 * A timing solver that tries to maximize the damage with a configurable
 * random offset. This is identical to using the RandomTicks timing solver
 * but with the weapons's default cooldown added to it.
 */
export class MaxDamageOffset implements TimingSolver
{
    readonly min: number;
    readonly max: number;

    constructor(min: number = -2, max: number = 2)
    {
        this.min = min;
        this.max = max;
    }

    /** @inheritdoc */
    getTicks(bot: Bot): number
    {
        const heldItem = bot.inventory.slots[bot.getEquipmentDestSlot('hand')];
        const itemName = heldItem?.name ?? ''; // Use empty string if name is null or undefined
        const cooldown = getCooldown(itemName);
        const ticks = Math.floor(Math.random() * (this.max - this.min) + this.min) + cooldown;
        return Math.max(1, ticks);
    }
}