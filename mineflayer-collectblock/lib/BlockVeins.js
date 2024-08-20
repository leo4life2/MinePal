"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findFromVein = void 0;
function findFromVein(bot, block, maxBlocks, maxDistance, floodRadius) {
    const targets = [];
    const open = [block];
    const type = block.type;
    const center = block.position;
    for (let i = 0; i < maxBlocks; i++) {
        const next = open.pop();
        if (next == null)
            break;
        targets.push(next);
        for (let x = -floodRadius; x <= floodRadius; x++) {
            for (let y = -floodRadius; y <= floodRadius; y++) {
                for (let z = -floodRadius; z <= floodRadius; z++) {
                    const neighborPos = next.position.offset(x, y, z);
                    if (neighborPos.manhattanDistanceTo(center) > maxDistance)
                        continue;
                    const neighbor = bot.blockAt(neighborPos);
                    if (neighbor == null || neighbor.type !== type)
                        continue;
                    if (targets.includes(neighbor))
                        continue;
                    if (open.includes(neighbor))
                        continue;
                    open.push(neighbor);
                }
            }
        }
    }
    return targets;
}
exports.findFromVein = findFromVein;
