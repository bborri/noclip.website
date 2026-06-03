import { vec3 } from "gl-matrix"
import { NierCache } from "./cache.js";
import { WorldBlock } from "./worldblock.js";
import { dfShow } from "../DebugFloaters.js";

// Hex grid is 24x24, but numbering is a bit weird:
// 00-11 -> 23-00
// 00-12 -> 23-01
// ...
// 00-34 -> 23-23

// X coordinate is horizontal left to right [0..23]
const MAX_HEX_X_COORD: number = 23;
// Y coordinate is diagonal top-right to bottom-left [0..34]
const MAX_HEX_Y_COORD: number = 34;
const WORLD_SCALE = 1;

// Actual real blocks available on disk, which is a subset of the possible hex coordinates
// This is used to avoid trying to load blocks that don't exist
const COMMON_BLOCK_LIST = new Set<string>([
    //"ga0000", "ga0001", "ga0002"
]);

const BLOCK_LIST = new Set<string>([
    "g10217", "g10218",
    "g10316", "g10317", "g10318", "g10319",
    "g10415", "g10416", "g10417", "g10418", "g10419", "g10420",
    "g10514", "g10515", "g10516", "g10517", "g10518", "g10519", "g10520", "g10521",
    "g10614", "g10615", "g10616", "g10617", "g10618", "g10619",
    "g10712", "g10713", "g10714", "g10715", "g10716", "g10717", "g10718", "g10719", "g10722",
    "g10812", "g10813", "g10814", "g10815", "g10816", "g10817", "g10818", "g10819", "g10820", "g10821", "g10822",
    "g10912", "g10913", "g10914", "g10915", "g10916", "g10917", "g10918", "g10919", "g10920", "g10921", "g10922", "g10923", "g10924",
    "g11012", "g11013", "g11014", "g11015", "g11016", "g11017", "g11018", "g11021",
    "g11111", "g11112", "g11113", "g11114", "g11115", "g11117", "g11118", "g11119", "g11120", "g11121",
    "g11211", "g11212", "g11213", "g11214", "g11215", "g11216", "g11217", "g11218", "g11219", "g11220", "g11221",
    "g11310", "g11311", "g11312", "g11313", "g11314", "g11315", "g11316", "g11317", "g11318", "g11319", "g11320",
    "g11410", "g11412", "g11413", "g11414", "g11415", "g11416", "g11417", "g11418", "g11419", "g11420", "g11421",
    "g11512", "g11513", "g11514", "g11515", "g11516", "g11517", "g11519", "g11520", "g11521",
    "g11612", "g11613", "g11614", "g11615", "g11616", "g11617", "g11619", "g11620",
    "g11711", "g11712", "g11713", "g11714", "g11716", "g11717",
    "g11811", "g11812", "g11813", "g11815", "g11816", "g11817",
    "g11911", "g11914", "g11915", "g11916",
    "g12010", "g12014", "g12015",
/*
    "g20204",
    "g20303", "g20304", "g20305", "g20306",
    "g20404", "g20405", "g20406", "g20407",
    "g20504", "g20505", "g20506", "g20507", "g20508",
    "g20604", "g20605", "g20606", "g20607", "g20608", "g20609",
    "g20706", "g20707", "g20708", "g20709",
    "g20806", "g20807", "g20808", "g20809",
    "g20908", "g20909", "g20923",
    "g29999"*/
]);

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

    public isValidBlock(): boolean {
        return COMMON_BLOCK_LIST.has(this.toBlockName()) || BLOCK_LIST.has(this.toBlockName());
    }

    public toBlockName(): string {
        if (this.x === 0 && this.y >= 0 && this.y < 3) {
            return `ga${this.y.toString().padStart(4, '0')}`;
        }
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
const HEX_SIZE: number = 155 * WORLD_SCALE;


export class World {

    private cache: NierCache;
    private currentHex: HexCoord | undefined;
    @dfShow()
    public loadedBlocks: { name: string, position: vec3 }[] = [];

    constructor(cache: NierCache) {
        this.cache = cache;
        this.currentHex = undefined;
        COMMON_BLOCK_LIST.forEach(blockName => {
            this.cache.loadBlock(blockName);
        });
        /*BLOCK_LIST.forEach(blockName => {
            this.cache.loadBlock(blockName);
        });*/
    }

    public static GetBlockPosition(blockName: string): vec3 {
        const hexCoord = HexCoord.fromBlockName(blockName);
        if (hexCoord === null) {
            return vec3.fromValues(0, 0, 0);
        }
        return this.HexToWorldCoords(hexCoord);
    }

    public getVisibleBlocks(position: vec3): {name: string, position: vec3, block: WorldBlock}[] {
        const hex = World.WorldToHexCoords(position);
        if (this.currentHex === undefined || !hex.equals(this.currentHex)) {
            console.log(`Current hex: ${hex.x}, ${hex.y} for pos: ${position[0]}, ${position[1]}, ${position[2]}`);
            this.currentHex = hex;
            this.updateLoadedBlocks(this.currentHex);
        }
/*
        let currentBlockName = this.currentHex.toBlockName();
        let block = this.cache.loadBlock(currentBlockName);
        if (block === undefined) {
            console.log(`Failed to load block ${currentBlockName} !`);
            return [];
        }
        return [ { name: currentBlockName, position: World.HexToWorldCoords(this.currentHex), block } ];*/
        // All loaded blocks
        return this.cache.allLoadedBlocks().map(block => {
            if (!block.valid) {
                return undefined;
            }
            const blockName = block.name;
            const blockPosition = World.HexToWorldCoords(HexCoord.fromBlockName(blockName) || GRID_CENTER);
            return block ? { name: blockName, position: blockPosition, block } : undefined;
        }).filter(x => x !== undefined);
    }

    private updateLoadedBlocks(currentHexCoord: HexCoord) {
        this.loadBlock(currentHexCoord);
        // TODO: A better approach would be to check bounding boxes of blocks and load/unload based on that
        World.GetNeighboringHexCoords(currentHexCoord).forEach(hexCoord => {
            this.loadBlock(hexCoord);
        });
        // TODO: Unload blocks that are too far away
    }

    private loadBlock(hexCoord: HexCoord) {
        if (hexCoord.isValidBlock()) {
            const blockName = hexCoord.toBlockName();
            this.cache.loadBlock(blockName);
        }
    }
/*
    private unloadBlock(hexCoord: HexCoord) {
        if (hexCoord.isValidBlock()) {
            const blockName = hexCoord.toBlockName();
            this.cache.unloadBlock(blockName);
        }
    }
*/
    private static GetNeighboringHexCoords(hexCoord: HexCoord): HexCoord[] {
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

    private static WorldToHexCoords(position: vec3): HexCoord {
        return new HexCoord(Math.round(position[0] / HEX_SIZE + GRID_CENTER.x), Math.round(position[2] / HEX_SIZE + GRID_CENTER.y));
    }

    private static HexToWorldCoords(hexCoord: HexCoord): vec3 {
        return vec3.fromValues((hexCoord.x - GRID_CENTER.x) * HEX_SIZE, 0, (hexCoord.y - GRID_CENTER.y) * HEX_SIZE);
    }
}
