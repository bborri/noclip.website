import { TextureMapping } from '../TextureHolder.js';
import { GfxDevice, GfxTexture, GfxBuffer, GfxBufferUsage, GfxBufferFrequencyHint, GfxInputLayout, GfxFormat, GfxVertexBufferFrequency, GfxTexFilterMode, GfxMipFilterMode, GfxWrapMode, GfxCullMode, GfxFrontFaceMode, GfxSamplerBinding } from '../gfx/platform/GfxPlatform.js';
import { GfxRenderCache } from '../gfx/render/GfxRenderCache.js';
import { GfxRenderInst, GfxRenderInstManager } from '../gfx/render/GfxRenderInstManager.js';
import { createBufferFromData } from '../gfx/helpers/BufferHelpers.js';
import ArrayBufferSlice from '../ArrayBufferSlice.js';
import * as DDS from '../DarkSouls/dds.js';

import { NierBatch, NierDatFile, NierLOD, NierMesh, NierMeshMaterialPair, NierVertexGroup } from "noclip-rust-support";
import { WorldBlockShader } from './render.js';
import { vec3 } from 'gl-matrix';

export enum ShaderType {
    PBS00,
    PBS10
}

export class Material {
    public name: string = "";
    public shaderType: ShaderType = ShaderType.PBS00;
    public variables: Map<string, number> = new Map();
    public parameterGroups: { index: number, parameters: Float32Array }[] = [];
    public textureReferences: { name: string, index: number }[] = [];
}

class VertexGroup {
    public indexCount: number;
    public positionBuffer: GfxBuffer;
    public colorBuffer: GfxBuffer;
    public texCoordBuffer: GfxBuffer;
    public normalBuffer: GfxBuffer;
    public indexBuffer: GfxBuffer;

    constructor(device: GfxDevice, vertexGroup: NierVertexGroup) {
        this.positionBuffer = createBufferFromData(device, GfxBufferUsage.Vertex, GfxBufferFrequencyHint.Static, vertexGroup.positions.buffer);
        this.colorBuffer = createBufferFromData(device, GfxBufferUsage.Vertex, GfxBufferFrequencyHint.Static, vertexGroup.colors.buffer);
        this.texCoordBuffer = createBufferFromData(device, GfxBufferUsage.Vertex, GfxBufferFrequencyHint.Static, vertexGroup.tex_coords.buffer);
        this.normalBuffer = createBufferFromData(device, GfxBufferUsage.Vertex, GfxBufferFrequencyHint.Static, vertexGroup.normals.buffer);
        const indices = vertexGroup.indices;
        this.indexBuffer = createBufferFromData(device, GfxBufferUsage.Index, GfxBufferFrequencyHint.Static, indices.buffer);
        this.indexCount = indices.length;
    }
}

export class WorldBlock {
    public name: string;
    public valid: boolean = false;
    public boundingBox: { min: vec3, max: vec3 } | null = null;
    private indicesCount: number = 0;

    private inputLayout: GfxInputLayout | null = null;
    private vertexGroups: (VertexGroup | undefined)[] = [];

    private lods: NierLOD[] = [];
    private materials: Material[] = [];
    private batches: NierBatch[] = [];
    private meshes: NierMesh[] = [];
    private meshMaterialPairs: NierMeshMaterialPair[] = [];

    public textures: GfxTexture[] = [];
    private samplerMappings: TextureMapping[] = [];

    constructor(name: string, device: GfxDevice, renderCache: GfxRenderCache, data: ArrayBufferSlice, datFile: NierDatFile) {
        this.name = name;
        let models = datFile.models();
        if (models.length === 0) {
            console.warn(`Skipping world block ${name} since it has no models!`);
            return;
        }
        let model = models[0];
        this.boundingBox = {
            min: vec3.fromValues(model.bounding_box[0], model.bounding_box[1], model.bounding_box[2]),
            max: vec3.fromValues(model.bounding_box[3], model.bounding_box[4], model.bounding_box[5])
        };
        this.lods = model.lods();
        if (this.lods.length === 0) {
            console.warn(`Block ${this.name}: No lod found!`);
            return;
        }
        this.materials = model.materials().map(mat => {
            const material = new Material();
            material.name = mat.name;
            material.shaderType = mat.shader_name === "PBS00_XXXXX" ? ShaderType.PBS00 : ShaderType.PBS10;
            material.variables = new Map();
            for (const [key, value] of Object.entries(mat.variables)) {
                material.variables.set(key, value.value);
            }
            material.parameterGroups = mat.parameter_groups.map(group => (
                {
                    index: group.index,
                    parameters: group.parameters
                }
            ));
            material.textureReferences = mat.texture_references.map(texRef => ({ name: texRef.name, index: texRef.texture }));
            return material;
        });
        this.batches = model.batches();
        if (this.batches.length === 0) {
            console.warn(`Block ${this.name}: No batch found!`);
            return;
        }
        console.log(`Block ${this.name}: ${this.lods[0].batch_infos.length} batch infos, ${this.batches.length} batches, ${model.meshes().length} meshes, ${model.materials().length} materials.`);
        this.meshes = model.meshes();
        this.meshMaterialPairs = model.mesh_material_pairs();

        // Vertex / index buffers
        this.inputLayout = WorldBlock.DefaultInputLayout(renderCache);
        const vertexGroups = model.vertex_groups();
        for (let i = 0; i < vertexGroups.length; i++) {
            if (vertexGroups[i].indices.length > 0) {
                this.vertexGroups.push(new VertexGroup(device, vertexGroups[i]));
                this.indicesCount += vertexGroups[i].indices.length;
            } else {
                this.vertexGroups.push(undefined);
            }
        }
        this.valid = this.indicesCount > 0;

        // Textures
        let textureBlocks = datFile.texture_blocks();
        // DDS texture creation only works one by one, it would be nice to have an array method to use with sampler2Darray
        this.textures = textureBlocks[0].textures.map(texture => {
            const dds = DDS.parse(data.slice(textureBlocks[0].block_offset + texture.offset, textureBlocks[0].block_offset + texture.offset + texture.size), 'DDSTexture', false);
            return DDS.createTexture(device, dds);
        });
        this.samplerMappings = this.textures.map(texture => {
            const mapping = new TextureMapping();
            mapping.gfxTexture = texture;
            mapping.gfxSampler = renderCache.createSampler({
                minFilter: GfxTexFilterMode.Bilinear,
                magFilter: GfxTexFilterMode.Bilinear,
                mipFilter: GfxMipFilterMode.Nearest,
                wrapS: GfxWrapMode.Repeat,
                wrapT: GfxWrapMode.Repeat
            });
            return mapping;
        });
        console.log(`Loaded world block with ${this.indicesCount} indices and ${this.textures.length} textures!`);
    }

    public prepareToRender(
        renderInstManager: GfxRenderInstManager,
        template: GfxRenderInst,
        fillRenderParamsCallback: (material: Material) => void) {

        if (this.vertexGroups.length === 0 || this.vertexGroups[0] === undefined) {
            return;
        }

        template.setSamplerBindingsFromTextureMappings(this.samplerMappings);

        for (let i = 0; i < this.lods.length; i++) {
            const lod = this.lods[i];
            const batchInfos = lod.batch_infos;
            for (let j = 0; j < batchInfos.length; j++) {
                const batchInfo = batchInfos[j];
                const mesh = this.meshes[batchInfo.mesh_index];
                const meshMaterialPair = this.meshMaterialPairs[batchInfo.mesh_material_pair_index];
                const batchIndex = (lod.batch_start_index as number) + j;
                const batch = this.batches[batchIndex];
                if (batch.index_count === 0) {
                    continue;
                }

                const renderInst = renderInstManager.newRenderInst();
                renderInst.setMegaStateFlags({ cullMode: GfxCullMode.Back, frontFace: GfxFrontFaceMode.CW });

                if (batch.vertex_group_index >= this.vertexGroups.length || batch.vertex_group_index < 0) {
                    //console.warn(`Batch ${j} uses vertex group ${batch.vertex_group_index} but only ${this.vertexGroups.length} are available! Skipping...`);
                    continue;
                }
                // FIXME: batchInfo.vertex_group_index has very high values where we usually expect 0-2
                const vertexGroup = this.vertexGroups[0/*batchInfo.vertex_group_index*/];
                const vertexBufferDescriptors = [
                    { buffer: vertexGroup.positionBuffer as GfxBuffer, byteOffset: 0 },
                    { buffer: vertexGroup.colorBuffer as GfxBuffer, byteOffset: 0 },
                    { buffer: vertexGroup.texCoordBuffer as GfxBuffer, byteOffset: 0 },
                    { buffer: vertexGroup.normalBuffer as GfxBuffer, byteOffset: 0 }
                ];
                const indexBufferDescriptor = {
                    buffer: vertexGroup.indexBuffer as GfxBuffer, byteOffset: 0
                };
                renderInst.setVertexInput(
                    this.inputLayout,
                    vertexBufferDescriptors,
                    indexBufferDescriptor);

                /*console.debug(`Batch ${j}: material ${mesh.material_indices[0]},
                    vertex offset ${batch.vertex_offset}, vertex count ${batch.vertex_count},
                    index offset ${batch.index_offset}, index count ${batch.index_count}`);*/

                const mat = this.materials[batchInfo.material_index];
                //fillRenderParamsCallback(mat);

                renderInst.setDrawCount(batch.index_count, batch.index_offset);
                renderInst.setInstanceCount(1);

                if (renderInst.getDrawCount() !== 0) {
                    renderInstManager.submitRenderInst(renderInst);
                }
            }
        }
    }

    public static DefaultInputLayout(renderCache: GfxRenderCache): GfxInputLayout {
        return renderCache.createInputLayout({
            vertexAttributeDescriptors: [
                { location: WorldBlockShader.a_Position, bufferIndex: 0, format: GfxFormat.F32_RGB, bufferByteOffset: 0 }, // XYZ
                { location: WorldBlockShader.a_Color, bufferIndex: 1, format: GfxFormat.F32_RGBA, bufferByteOffset: 0 }, // RGBA
                { location: WorldBlockShader.a_TexCoord, bufferIndex: 2, format: GfxFormat.F32_RG, bufferByteOffset: 0 },  // UV
                { location: WorldBlockShader.a_Normal, bufferIndex: 3, format: GfxFormat.F32_RGB, bufferByteOffset: 0 }  // XYZ
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
}
