import { SceneContext } from '../SceneBase.js';
import { GfxDevice } from '../gfx/platform/GfxPlatform.js';
import { GfxRenderCache } from '../gfx/render/GfxRenderCache.js';
import ArrayBufferSlice from '../ArrayBufferSlice.js';

import { NierDatFile } from "noclip-rust-support";
import { WorldBlock } from './worldblock.js';

const pathBase = "NierAutomata";

export class NierCache {
    private device: GfxDevice;
    private context: SceneContext;
    private renderCache: GfxRenderCache;
    private worldBlocks: Map<string, WorldBlock | undefined>;

    constructor(device: GfxDevice, context: SceneContext, renderCache: GfxRenderCache) {
        this.device = device;
        this.context = context;
        this.renderCache = renderCache;
        this.worldBlocks = new Map<string, WorldBlock>;
    }

    public allLoadedBlocks(): WorldBlock[] {
        return Array.from(this.worldBlocks.values()).filter(block => block !== undefined);
    }

    public loadBlock(modelName: string): WorldBlock | undefined {
        if (!this.worldBlocks.has(modelName)) {
            // !!! Probably not thread-safe...
            // This is used to avoid launching concurrent loads on the same block
            this.worldBlocks.set(modelName, undefined);
            console.log("Block " + modelName + " not found! Loading...");
            this.loadModel(modelName).then(block => {
                if (!this.worldBlocks.has(modelName) || this.worldBlocks.get(modelName) === undefined) {
                    console.log("Block " + modelName + " added to cache!");
                    this.worldBlocks.set(modelName, block);
                }
            }).catch(() => {
                console.log("World block " + modelName + " not yet ready !");
            });
        }
        return this.worldBlocks.get(modelName);
    }

    public unloadBlock(modelName: string) {
        if (this.worldBlocks.has(modelName) && this.worldBlocks.get(modelName) !== undefined) {
            this.worldBlocks.delete(modelName);
            console.log("Block " + modelName + " removed from cache!");
        }
    }

    private async loadModel(modelName: string): Promise<WorldBlock> {
        //console.time("loading DTT");
        const file = await this.loadFile(this.dttFromModel(modelName));
        //this.loadFile(this.datFromModel(modelName)); // TODO: Also load corresponding .dat ?
        const block = new WorldBlock(modelName, this.device, this.renderCache, await file.binary, await file.datFile);
        //await console.timeEnd("loading DTT");
        return await block;
    }

    private async loadFile(path: string): Promise<{ binary: ArrayBufferSlice; datFile: NierDatFile }> {
        let binary = await this.context.dataFetcher.fetchData(path);
        let datFile = new NierDatFile(await binary.createTypedArray(Uint8Array))
        return { binary, datFile };
    }

    private pathFromModel(modelName: string): string {
        // wdX path number is identical to the first character in the model number: "NierAutomata/wdX/gX0000.dtt"
        // e.g. "NierAutomata/wd2/g20908.dtt"
        return `${pathBase}/wd` + modelName[1] + `/`;
    }
    private dttFromModel(modelName: string): string {
        return this.pathFromModel(modelName) + modelName + `.dtt`
    }
    private datFromModel(modelName: string): string {
        return this.pathFromModel(modelName) + modelName + `.dat`
    }
} 