import { SceneContext } from '../SceneBase.js';
import { vec3 } from 'gl-matrix';
import { colorNewFromRGBA } from '../Color.js';
import { GfxDevice, GfxBufferUsage, GfxBufferFrequencyHint, GfxInputLayout, GfxFormat, GfxVertexBufferFrequency } from '../gfx/platform/GfxPlatform.js';
import { GfxRenderInst } from '../gfx/render/GfxRenderInstManager.js';
import { GfxRenderDynamicUniformBuffer } from "../gfx/render/GfxRenderDynamicUniformBuffer.js";
import { NierDatFile, NierVertexGroup } from "noclip-rust-support";
import { createBufferFromData } from '../gfx/helpers/BufferHelpers.js';
import { GfxTopology, convertToTriangleIndexBuffer32 } from '../gfx/helpers/TopologyHelpers.js'
import { DebugDraw } from '../gfx/helpers/DebugDraw.js';
import { GfxRenderCache } from '../gfx/render/GfxRenderCache.js';
import { GfxRenderHelper } from '../gfx/render/GfxRenderHelper.js';
import { WorldBlockShader } from './render.js';
import { World } from '../SuperMonkeyBall/World.js';

const pathBase = "NierAutomata";

export class NierWorldBlock {
    private positions: Float32Array;
    private colors: Float32Array;
    private uvs: Float32Array;
    private normals: Float32Array;
    private indices: Uint32Array;
    private datFile: NierDatFile;

    constructor(datFile: NierDatFile) {
        this.datFile = datFile;
        let vg = datFile.model(0).vertex_group(0);
        this.positions = vg.positions;
        this.colors = vg.colors;
        this.uvs = vg.tex_coords;
        this.normals = vg.normals;
        //this.indices = convertToTriangleIndexBuffer32(GfxTopology.TriStrips, vg.indices);
        this.indices = vg.indices;
    }

    public indexCount(): number {
        return this.indices.length;
    }

    public debugDrawTris(debugDraw: DebugDraw) {
        for (let i = 0; i < this.indices.length - 1; i += 3) {
            let index1 = this.indices[i];
            let index2 = this.indices[i+1];
            let index3 = this.indices[i+2];
            debugDraw.drawTriSolidP(
                vec3.fromValues(this.positions[index1*3], this.positions[index1*3+1], this.positions[index1*3+2]),
                vec3.fromValues(this.positions[index2*3], this.positions[index2*3+1], this.positions[index2*3+2]),
                vec3.fromValues(this.positions[index3*3], this.positions[index3*3+1], this.positions[index3*3+2]),
                colorNewFromRGBA(0.2, 0.2, 0.2));
        }
    }

    public setAsInput(device: GfxDevice, renderInst: GfxRenderInst, cache: NierCache) {
        let vertexBufferDescriptors = [
            { buffer: createBufferFromData(device, GfxBufferUsage.Vertex, GfxBufferFrequencyHint.Static, this.positions.buffer), byteOffset: 0 },
            { buffer: createBufferFromData(device, GfxBufferUsage.Vertex, GfxBufferFrequencyHint.Static, this.colors.buffer), byteOffset: 0 },
            { buffer: createBufferFromData(device, GfxBufferUsage.Vertex, GfxBufferFrequencyHint.Static, this.uvs.buffer), byteOffset: 0 },
            { buffer: createBufferFromData(device, GfxBufferUsage.Vertex, GfxBufferFrequencyHint.Static, this.normals.buffer), byteOffset: 0 }
        ];
        renderInst.setVertexInput(
            cache.toInputLayout(this),
            vertexBufferDescriptors,
            { buffer: createBufferFromData(device, GfxBufferUsage.Index, GfxBufferFrequencyHint.Static, this.indices.buffer), byteOffset: 0  });
        renderInst.setDrawCount(this.indexCount());
    }
}

export class NierCache {
    private device: GfxDevice;
    private context: SceneContext;
    private cache: GfxRenderCache;
    private worldBlocks: Map<string, NierWorldBlock | undefined>;

    constructor(device: GfxDevice, context: SceneContext) {
        this.device = device;
        this.context = context;
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
        const block = new NierWorldBlock(await file);
        await console.timeEnd("loading DTT");
        return await block;
    }

    private async loadFile(path: string): Promise<NierDatFile> {
        let binary = await this.context.dataFetcher.fetchData(path);
        return new NierDatFile(await binary.createTypedArray(Uint8Array));
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