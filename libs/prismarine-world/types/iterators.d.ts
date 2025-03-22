import type { Vec3 } from "vec3";

export declare enum BlockFace {
    UNKNOWN = -999,
    BOTTOM = 0,
    TOP = 1,
    NORTH = 2,
    SOUTH = 3,
    WEST = 4,
    EAST = 5,
}

export type RaycastBlock = {
    x: number;
    y: number;
    z: number;
    face: BlockFace;
};

export type RaycastResult = RaycastBlock & {
    intersect: Vec3;
}

export type RaycastIntersection = {
    pos: Vec3;
    face: BlockFace;
};

/** [x0, y0, z0, x1, y1, z1] */
export type Shape = [number, number, number, number, number, number];

export interface Iterator<T> {
    next(): T | null;
}

// 2D spiral iterator, useful to iterate on
// columns that are centered on bot position
// https://en.wikipedia.org/wiki/Taxicab_geometry
export declare class ManhattanIterator implements Iterator<Vec3> {
    public readonly maxDistance: number;
    public readonly startx: number;
    public readonly starty: number;
    private x: number;
    private y: number;
    private layer: number;
    private leg: number;

    constructor(x: number, y: number, maxDistance: number);

    /**
     * @returns {Vec3 | null} The current position of the iterator OR null if exceeded maxDistance.
     */
    next(): Vec3 | null;
}

export declare class OctahedronIterator implements Iterator<Vec3> {
    public readonly start: Vec3;
    public readonly maxDistance: number;
    private apothem: number;
    private x: number;
    private y: number;
    private z: number;
    private L: number;
    private R: number;

    constructor(start: Vec3, maxDistance: number);

    /**
     * @returns {Vec3 | null} The current position of the iterator OR null if exceeded maxDistance.
     */
    next(): Vec3 | null;
}

// This iterate along a ray starting at `pos` in `dir` direction
// It steps exactly 1 block at a time, returning the block coordinates
// and the face by which the ray entered the block.
export declare class RaycastIterator implements Iterator<RaycastBlock> {
    private block: RaycastBlock;
    public readonly pos: Vec3;
    public readonly dir: Vec3;
    private invDirX: number;
    private invDirY: number;
    private invDirZ: number;
    private stepX: number;
    private stepY: number;
    private stepZ: number;
    private tDeltaX: number;
    private tDeltaY: number;
    private tDeltaZ: number;
    private tMaxX: number;
    private tMaxY: number;
    private tMaxZ: number;
    public readonly maxDistance: number;

    constructor(pos: Vec3, dir: Vec3, distance: number);

    /**
     * @param {Shape[]} shapes Takes shapes from block.shapes.
     * @param {Vec3} offset Offset from original position to start the intersect calculation from.
     * @returns {RaycastIntersection | null} A possible intersection.
     */
    intersect(shapes: Shape[], offset: Vec3): RaycastIntersection | null;

    /**
     * @returns {RaycastBlock | null} The block the raycast is currently passing through (not hit detection, just the general AABB of a block if it were there).
     */
    next(): RaycastBlock | null;
}

/**
 * Spiral outwards from a central position in growing squares.
 * Every point has a constant distance to its previous and following position of 1. First point returned is the starting position.
 * Generates positions like this:
 * ```text
 * 16 15 14 13 12
 * 17  4  3  2 11
 * 18  5  0  1 10
 * 19  6  7  8  9
 * 20 21 22 23 24
 * (maxDistance = 2; points returned = 25)
 * ```
 * Copy and paste warrior source: https://stackoverflow.com/questions/3706219/algorithm-for-iterating-over-an-outward-spiral-on-a-discrete-2d-grid-from-the-or
 */
export declare class SpiralIterator2d implements Iterator<Vec3> {
    public readonly start: Vec3;
    public readonly maxDistance: number;
    private di: number;
    private dj: number;
    private i: number;
    private j: number;
    private k: number;
    private segment_passed: number;
    private segment_length: number;
    private readonly NUMBER_OF_POINTS: number;

    /**
     * @param {Vec3} pos Starting position
     * @param {number} maxDistance Max distance from starting position
     */
    constructor(pos: Vec3, maxDistance: number);


    /**
     * @returns {Vec3 | null} The current position of the iterator OR null if exceeded maxDistance.
     */
    next(): Vec3 | null;
}

export declare const ManathanIterator: ManhattanIterator;
