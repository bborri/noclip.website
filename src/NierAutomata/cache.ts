import { SceneContext } from '../SceneBase.js';
import { GfxDevice, GfxTexture, GfxSampler, GfxBufferUsage, GfxBufferFrequencyHint, GfxInputLayout, GfxFormat, GfxIndexBufferDescriptor, GfxVertexBufferFrequency, GfxVertexBufferDescriptor, GfxTexFilterMode, GfxMipFilterMode, GfxWrapMode } from '../gfx/platform/GfxPlatform.js';
import { GfxRenderCache } from '../gfx/render/GfxRenderCache.js';
import { GfxRenderInst } from '../gfx/render/GfxRenderInstManager.js';
import { createBufferFromData } from '../gfx/helpers/BufferHelpers.js';
import ArrayBufferSlice from '../ArrayBufferSlice.js';
import * as DDS from '../DarkSouls/dds.js';

import { NierDatFile } from "noclip-rust-support";
import { WorldBlockShader } from './render.js';

const pathBase = "NierAutomata";

export class NierWorldBlock {
    private indicesCount: number = 0;
    private inputLayout: GfxInputLayout | null = null;
    private vertexBufferDescriptors: GfxVertexBufferDescriptor[] = [];
    private indexBufferDescriptor: GfxIndexBufferDescriptor;
    public textures: GfxTexture[] = [];
    private sampler: GfxSampler;

    constructor(device: GfxDevice, renderCache: GfxRenderCache, cache: NierCache, data: ArrayBufferSlice, datFile: NierDatFile) {
        let vg = datFile.models()[0].vertex_group(0);
        this.indicesCount = vg.indices.length;

        this.inputLayout = cache.toInputLayout(this);
        this.vertexBufferDescriptors = [
            { buffer: createBufferFromData(device, GfxBufferUsage.Vertex, GfxBufferFrequencyHint.Static, vg.positions.buffer), byteOffset: 0 },
            { buffer: createBufferFromData(device, GfxBufferUsage.Vertex, GfxBufferFrequencyHint.Static, vg.colors.buffer), byteOffset: 0 },
            { buffer: createBufferFromData(device, GfxBufferUsage.Vertex, GfxBufferFrequencyHint.Static, vg.tex_coords.buffer), byteOffset: 0 },
            { buffer: createBufferFromData(device, GfxBufferUsage.Vertex, GfxBufferFrequencyHint.Static, vg.normals.buffer), byteOffset: 0 }
        ];
        this.indexBufferDescriptor = {
            buffer: createBufferFromData(device, GfxBufferUsage.Index, GfxBufferFrequencyHint.Static, vg.indices.buffer), byteOffset: 0
        };

        this.sampler = renderCache.createSampler({
            minFilter: GfxTexFilterMode.Bilinear,
            magFilter: GfxTexFilterMode.Bilinear,
            mipFilter: GfxMipFilterMode.Nearest,
            wrapS: GfxWrapMode.Repeat,
            wrapT: GfxWrapMode.Repeat
        });
        let textureBlocks = datFile.texture_blocks();
        this.textures = textureBlocks[0].textures.map(texture => {
            const dds = DDS.parse(data.slice(textureBlocks[0].block_offset + texture.offset, textureBlocks[0].block_offset + texture.offset + texture.size), 'DDSTexture', false);
            return DDS.createTexture(device, dds);
        });
        console.log(`Loaded world block with ${this.indicesCount} indices and ${this.textures.length} textures!`);
    }

    public indexCount(): number {
        return this.indicesCount;
    }

    public setAsInput(renderInst: GfxRenderInst) {

        renderInst.setVertexInput(
            this.inputLayout,
            this.vertexBufferDescriptors,
            this.indexBufferDescriptor);
        renderInst.setSamplerBindingsFromTextureMappings(this.textures.map(texture => {
            return { gfxTexture: texture, gfxSampler: this.sampler };
        }));    
        renderInst.setDrawCount(this.indexCount());
        renderInst.setInstanceCount(1);
    }
}

export class NierCache {
    private device: GfxDevice;
    private context: SceneContext;
    private renderCache: GfxRenderCache;
    private cache: GfxRenderCache;
    private worldBlocks: Map<string, NierWorldBlock | undefined>;

    constructor(device: GfxDevice, context: SceneContext, renderCache: GfxRenderCache) {
        this.device = device;
        this.context = context;
        this.renderCache = renderCache;
        this.cache = new GfxRenderCache(device);
        this.worldBlocks = new Map<string, NierWorldBlock>;
    }

    public toInputLayout(worldBlock: NierWorldBlock): GfxInputLayout {
        return this.cache.createInputLayout({
            vertexAttributeDescriptors: [
                { location: WorldBlockShader.a_Position, bufferIndex: 0, format: GfxFormat.F32_RGB, bufferByteOffset: 0 }, // XYZ
                { location: WorldBlockShader.a_Color, bufferIndex: 1, format: GfxFormat.F32_RGBA, bufferByteOffset: 0 }, // RGBA
                { location: WorldBlockShader.a_TexCoord, bufferIndex: 2, format: GfxFormat.F32_RG, bufferByteOffset: 0 },  // UV
                { location: WorldBlockShader.a_Normal, bufferIndex: 3, format: GfxFormat.F32_RGB, bufferByteOffset: 0 }  // Normal XYZ
            ],
            vertexBufferDescriptors: [
                { byteStride: 12, frequency: GfxVertexBufferFrequency.PerVertex },
                { byteStride: 16, frequency: GfxVertexBufferFrequency.PerVertex },
                { byteStride: 8, frequency: GfxVertexBufferFrequency.PerVertex },
                { byteStride: 12, frequency: GfxVertexBufferFrequency.PerVertex }
            ],
            indexBufferFormat: GfxFormat.U32_R
        });
    }

    public loadBlock(modelName: string): NierWorldBlock | undefined {
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

    private async loadModel(modelName: string): Promise<NierWorldBlock> {
        console.time("loading DTT");
        const file = await this.loadFile(this.dttFromModel(modelName));
        //this.loadFile(this.datFromModel(modelName)); // TODO: Also load corresponding .dat
        const block = new NierWorldBlock(this.device, this.renderCache, this, await file.binary, await file.datFile);
        await console.timeEnd("loading DTT");
        return await block;
    }

    private async loadFile(path: string): Promise<{ binary: ArrayBufferSlice; datFile: NierDatFile }> {
        let binary = await this.context.dataFetcher.fetchData(path);
        let datFile = new NierDatFile(await binary.createTypedArray(Uint8Array))
        return { binary, datFile };
    }

    private pathFromModel(modelName: string): string {
        // wdX path number is identical to the first digit in the model number
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