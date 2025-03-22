import * as attackSpeeds from './AttackSpeeds.json';

export function getAttackSpeed(weaponName: string): number
{
    if (!weaponName) return attackSpeeds.other;
    return (<any>attackSpeeds)[weaponName] || attackSpeeds.other;
}

function clamp(x: number, min: number, max: number): number
{
    if (x < min) return min;
    if (x > max) return max;
    return x;
}

export function getCooldown(weaponName: string): number
{
    const speed = getAttackSpeed(weaponName);
    return Math.floor(1 / speed * 20);
}

export function getDamageMultiplier(weaponName: string): number
{
    const speed = getAttackSpeed(weaponName);
    const damageMul = 0.2 + Math.pow((speed + 0.5) / (1 / speed * 20), 2) * 0.8;
    return clamp(damageMul, 0.2, 1.0);
}
