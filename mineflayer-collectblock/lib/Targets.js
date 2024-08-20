"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Targets = void 0;
class Targets {
    constructor(bot) {
        this.targets = [];
        this.bot = bot;
    }
    appendTargets(targets) {
        for (const target of targets) {
            this.appendTarget(target);
        }
    }
    appendTarget(target) {
        if (this.targets.includes(target))
            return;
        this.targets.push(target);
    }
    /**
     * Gets the closest target to the bot in this list.
     *
     * @returns The closest target, or null if there are no targets.
     */
    getClosest() {
        let closest = null;
        let distance = 0;
        for (const target of this.targets) {
            const dist = target.position.distanceTo(this.bot.entity.position);
            if (closest == null || dist < distance) {
                closest = target;
                distance = dist;
            }
        }
        return closest;
    }
    get empty() {
        return this.targets.length === 0;
    }
    clear() {
        this.targets.length = 0;
    }
    removeTarget(target) {
        const index = this.targets.indexOf(target);
        if (index < 0)
            return;
        this.targets.splice(index, 1);
    }
}
exports.Targets = Targets;
