import { vec3 } from "gl-matrix"
import { NierCache, NierWorldBlock } from "./cache.js";

// Hex grid is 24x24, but numbering is a bit weird:
// 00-11 -> 23-00
// 00-12 -> 23-01
// ...
// 00-34 -> 23-23

// X coordinate is horizontal, so 23 is the max value
const MAX_HEX_X_COORD: number = 23;
// Y coordinate is diagonal top-right to bottom-left, so max value is higher, but still capped at 34
const MAX_HEX_Y_COORD: number = 34;

class HexCoord {
    x: number;
    y: number;

    constructor(x: number, y: number) {
        this.x = Math.max(0, Math.min(MAX_HEX_X_COORD, x));
        this.y = Math.max(0, Math.min(MAX_HEX_Y_COORD, y));
    }

    public equals(other: HexCoord): boolean {
        return this.x === other.x && this.y === other.y;
    }

    public toBlockName(): string {
        let xStr = this.x.toString().padStart(2, '0');
        let yStr = this.y.toString().padStart(2, '0');
        return `g1${xStr}${yStr}`;
    }

    public static fromBlockName(blockName: string): HexCoord | null {
        if (!blockName.startsWith('g') || blockName.length !== 6) {
            return null;
        }
        return new HexCoord(parseInt(blockName.slice(2, 4)), parseInt(blockName.slice(4, 6)));
    }
}

// Arbitrary center position
const GRID_CENTER = new HexCoord(11, 17);
// Distance between centers of adjacent hexagons
const HEX_SIZE: number = 140;


export class World {

    private cache: NierCache;
    private currentHex: HexCoord | undefined;

    constructor(cache: NierCache) {
        this.cache = cache;
        this.currentHex = undefined;
    }

    public getVisibleBlocks(position: vec3): {name: string, position: vec3, block: NierWorldBlock}[] {
        const hex = this.worldToHexCoords(position);
        if (this.currentHex === undefined || !hex.equals(this.currentHex)) {
            this.currentHex = hex;
            this.updateLoadedBlocks(this.currentHex);
        }
        return this.cache.allLoadedBlocks().map(block => {
            const blockName = block.name;
            const blockPosition = this.hexToWorldCoords(HexCoord.fromBlockName(blockName) || GRID_CENTER);
            return block ? { name: blockName, position: blockPosition, block } : undefined;
        }).filter(x => x !== undefined);
    }

    private updateLoadedBlocks(currentHexCoord: HexCoord) {
        this.getNeighboringHexCoords(currentHexCoord).forEach(hexCoord => {
            this.loadBlock(hexCoord);
        });
        // TODO: unload blocks that are too far away
    }

    private loadBlock(hexCoord: HexCoord) {
        const blockName = hexCoord.toBlockName();
        this.cache.loadBlock(blockName);
    }

    private unloadBlock(hexCoord: HexCoord) {
        const blockName = hexCoord.toBlockName();
        this.cache.unloadBlock(blockName);
    }

    private getNeighboringHexCoords(hexCoord: HexCoord): HexCoord[] {
        const neighbors = [
            new HexCoord(hexCoord.x + 1, hexCoord.y),     // Down-Right
            new HexCoord(hexCoord.x - 1, hexCoord.y),     // Up-Left
            new HexCoord(hexCoord.x, hexCoord.y + 1),     // Down
            new HexCoord(hexCoord.x, hexCoord.y - 1),     // Up
            new HexCoord(hexCoord.x + 1, hexCoord.y - 1), // Up-Right
            new HexCoord(hexCoord.x - 1, hexCoord.y + 1)  // Down-Left
        ];
        return neighbors;
    }

    private worldToHexCoords(position: vec3): HexCoord {
        return new HexCoord(Math.round(position[0] / HEX_SIZE + GRID_CENTER.x), Math.round(position[2] / HEX_SIZE + GRID_CENTER.y));
    }

    private hexToWorldCoords(hexCoord: HexCoord): vec3 {
        return vec3.fromValues((hexCoord.x - GRID_CENTER.x) * HEX_SIZE, 0, (hexCoord.y - GRID_CENTER.y) * HEX_SIZE);
    }
}