import type { EventEmitter } from "events";
import type { Vec3 } from "vec3";
import type { Block } from "prismarine-block";
import loaderOfChunk from "prismarine-chunk";
import type { RaycastResult } from "./iterators";

export type Chunk = InstanceType<ReturnType<typeof loaderOfChunk>>;

export type ChunkGenerator = (chunkX: number, chunkZ: number) => Chunk;
export type ChunkCoordinates = { chunkX: number, chunkZ: number };
export type ChunkCoordsAndColumn = { chunkX: number, chunkZ: number, column: Chunk };

export interface StorageProvider {
    load(chunkX: number, chunkZ: number): Promise<Chunk>;
    save(chunkX: number, chunkZ: number, chunk: Chunk): Promise<void>;
}

export declare class World extends EventEmitter {

    private readonly savingQueue: Map<String, ChunkCoordinates>;
    private finishedSaving: Promise<unknown>;
    private readonly columns: { [key: string]: Chunk };
    public readonly chunkGenerator: ChunkGenerator | null | undefined;
    public readonly storageProvider: StorageProvider | null | undefined;
    public readonly savingInterval: number;
    public readonly sync: WorldSync;

    /**
     * @param {ChunkGenerator} chunkGenerator A generator that requires X and Z coordinates of lower left of chunk. Returns a {Chunk} chunk object.
     * @param {StorageProvider} storageProvider The provider the world uses to save chunks. See "prismarine-provider-anvil" or "prismarine-provider-raw".
     * @param {number} savingInterval The duration in milliseconds between saves.
     */
    constructor(
        chunkGenerator?: ChunkGenerator | null | undefined,
        storageProvider?: StorageProvider | null | undefined,
        savingInterval?: number,
    );

    public initialize(
        iniFunc: (x: number, y: number, z: number) => Block,
        length: number,
        width: number,
        height?: number,
        iniPos?: Vec3,
    ): Promise<ChunkCoordinates[]>;

    /**
     * 
     * @param {Vec3} from Position to start raycasting from.
     * @param {Vec3} direction Normalized vector, direction of raycast.
     * @param {number} range Maximum range to raycast.
     * @param {(block: Block) => boolean} matcher Optional function with a block parameter, return true if the raycast should stop at this block, false otherwise.
     */
    public raycast(
        from: Vec3,
        direction: Vec3,
        range: number,
        matcher?: (block: Block) => boolean,
    ): Promise<RaycastResult | null>;

    public getLoadedColumn(chunkX: number, chunkZ: number): Chunk;

    public getColumn(chunkX: number, chunkZ: number): Promise<Chunk>;

    private _emitBlockUpdate(
        oldBlock: Block,
        newBlock: Block,
        position: Vec3,
    ): void;

    public setLoadedColumn(
        chunkX: number,
        chunkZ: number,
        chunk: Chunk,
        save?: boolean,
    ): void;

    public setColumn(
        chunkX: number,
        chunkZ: number,
        chunk: Chunk,
        save?: boolean,
    ): Promise<void>;

    public unloadColumn(chunkX: number, chunkZ: number): void;

    public saveNow(): Promise<void>;

    public startSaving(): void;

    public waitSaving(): Promise<void>;

    public stopSaving(): void;

    public queueSaving(chunkX: number, chunkZ: number): void;

    public saveAt(pos: Vec3): void;

    public getColumns(): ChunkCoordsAndColumn[];

    public getLoadedColumnAt(pos: Vec3): Chunk;

    public getColumnAt(pos: Vec3): Promise<Chunk>;

    public setBlock(pos: Vec3, block: Block): Promise<void>;

    public getBlock(pos: Vec3): Promise<Block>;

    public getBlockStateId(pos: Vec3): Promise<number>;

    public getBlockType(pos: Vec3): Promise<number>;

    public getBlockData(pos: Vec3): Promise<number>;

    public getBlockLight(pos: Vec3): Promise<number>;

    public getSkyLight(pos: Vec3): Promise<number>;

    public getBiome(pos: Vec3): Promise<number>;

    public setBlockStateId(pos: Vec3, stateId: number): Promise<void>;

    public setBlockType(pos: Vec3, blockType: number): Promise<void>;

    public setBlockData(pos: Vec3, data: number): Promise<void>;

    public setBlockLight(pos: Vec3, light: number): Promise<void>;

    public setSkyLight(pos: Vec3, light: number): Promise<void>;

    public setBiome(pos: Vec3, biome: number): Promise<void>;

}

export declare class WorldSync extends EventEmitter {

    public readonly async: World;

    /**
     * @param {World} world Async representation of the World object.
     */
    constructor(world: World);


    public initialize(
        iniFunc: (x: number, y: number, z: number) => Block,
        length: number,
        width: number,
        height?: number,
        iniPos?: Vec3,
    ): void;

    /**
     * 
     * @param {Vec3} from Position to start raycasting from.
     * @param {Vec3} direction Normalized vector, direction of raycast.
     * @param {number} range Maximum range to raycast.
     * @param {(block: Block) => boolean} matcher Optional function with a block parameter, return true if the raycast should stop at this block, false otherwise.
     */
    public raycast(
        from: Vec3,
        direction: Vec3,
        range: number,
        matcher?: (block: Block) => boolean,
    ): RaycastResult | null;

    private _emitBlockUpdate(
        oldBlock: Block,
        newBlock: Block,
        position: Vec3
    ): void;

    public getColumns(): ChunkCoordsAndColumn[];

    public getColumn(chunkX: number, chunkZ: number): Chunk;

    public getColumnAt(pos: Vec3): Chunk;

    public setColumn(
        chunkX: number,
        chunkZ: number,
        chunk: Chunk,
        save?: boolean,
    ): void;

    public unloadColumn(chunkX: number, chunkZ: number): void;

    public getBlock(pos: Vec3): Block;

    public getBlockStateId(pos: Vec3): number;

    public getBlockType(pos: Vec3): number;

    public getBlockData(pos: Vec3): number;

    public getBlockLight(pos: Vec3): number;

    public getSkyLight(pos: Vec3): number;

    public getBiome(pos: Vec3): number;

    public setBlock(pos: Vec3, block: Block): void;

    public setBlockStateId(pos: Vec3, stateId: number): void;

    public setBlockType(pos: Vec3, blockType: number): void;

    public setBlockData(pos: Vec3, data: number): void;

    public setBlockLight(pos: Vec3, light: number): void;

    public setSkyLight(pos: Vec3, light: number): void;

    public setBiome(pos: Vec3, biome: number): void;
}
