import { Bot } from "mineflayer";
import { PVP } from "./PVP";

export function plugin(bot: Bot)
{
    const pvp = new PVP(bot);
    bot.pvp = pvp;
}

declare module "mineflayer" {
    interface Bot {
        pvp: PVP;
    }
}

export * from './Cooldown';
export * from './TimingSolver';
