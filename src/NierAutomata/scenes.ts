import { rust } from "../rustlib.js";
import { mat4, vec3 } from 'gl-matrix';
import * as Viewer from '../viewer.js';
import { SceneContext } from '../SceneBase.js';
import { fillMatrix4x3, fillMatrix4x4, fillVec4 } from '../gfx/helpers/UniformBufferHelpers.js';
import { GfxDevice, GfxProgram, GfxCullMode, GfxFrontFaceMode, GfxSamplerFormatKind, GfxTextureDimension } from '../gfx/platform/GfxPlatform.js';
import { GfxRenderHelper } from '../gfx/render/GfxRenderHelper.js';
import { GfxRenderInst, GfxRenderInstList } from '../gfx/render/GfxRenderInstManager.js';
import { GfxrAttachmentSlot } from '../gfx/render/GfxRenderGraph.js';
import { makeBackbufferDescSimple, standardFullClearRenderPassDescriptor } from '../gfx/helpers/RenderGraphHelpers.js';

import { WorldBlockShader } from "./render.js";
import { NierCache } from "./cache.js";
import { World } from "./world.js";
import { Material } from "./worldblock.js";

export class NierRenderer implements Viewer.SceneGfx {
    private context: SceneContext;
    private renderHelper: GfxRenderHelper;
    private renderInstListMain = new GfxRenderInstList();
    private shader: GfxProgram;
    private cache: NierCache;
    private world: World;

    constructor(device: GfxDevice, context: SceneContext) {
        this.context = context;
        this.renderHelper = new GfxRenderHelper(device);
        this.shader = this.renderHelper.renderCache.createProgram(new WorldBlockShader());
        this.cache = new NierCache(device, context, this.renderHelper.renderCache);
        this.world = new World(this.cache);
    }

    protected prepareToRender(device: GfxDevice, viewerInput: Viewer.ViewerRenderInput): void {
        const template = this.renderHelper.pushTemplateRenderInst();
        const renderInstManager = this.renderHelper.renderInstManager;

        template.setBindingLayouts([ { numSamplers: 4, numUniformBuffers: 2 } ]);

        let uniformOffset = 0;
        uniformOffset = this.fillCameraParams(template, uniformOffset, viewerInput);

        renderInstManager.setCurrentList(this.renderInstListMain);

        template.setGfxProgram(this.shader);
        template.setUniformBuffer(this.renderHelper.uniformBuffer);

        const cameraPos = mat4.getTranslation(vec3.create(), viewerInput.camera.worldMatrix);
        this.world.getVisibleBlocks(cameraPos).forEach(({name, position, block}) => {
            if (block === undefined) {
                console.log("World block " + name + ' not yet ready !');
            }
            else {
                uniformOffset = this.fillObjectParams(template, uniformOffset, position);
                const fillRenderParamsCallback = (material: Material): void => {
                    uniformOffset = this.fillRenderParams(template, uniformOffset, material);
                }
                block?.prepareToRender(renderInstManager, this.shader, fillRenderParamsCallback);
            }
        });
        template.setMegaStateFlags({ cullMode: GfxCullMode.None, frontFace: GfxFrontFaceMode.CW });

        renderInstManager.popTemplate();
        this.renderHelper.prepareToRender();
    }

    private fillCameraParams(template: GfxRenderInst, offset: number, viewerInput: Viewer.ViewerRenderInput): number {
        const data = template.allocateUniformBufferF32(WorldBlockShader.ub_CameraParams, 16);
        let offs = offset;
        offs += fillMatrix4x4(data, offs, viewerInput.camera.clipFromWorldMatrix);
        return offs;
    }

    private fillObjectParams(template: GfxRenderInst, offset: number, position: vec3): number {
        const modelMatrix = mat4.create();
        mat4.fromTranslation(modelMatrix, position);

        const data = template.allocateUniformBufferF32(WorldBlockShader.ub_ObjectParams, 12);
        let offs = offset;
        offs += fillMatrix4x3(data, offs, modelMatrix);
        return offs;
    }

    private fillRenderParams(template: GfxRenderInst, offset: number, material: Material): number {
        // FIXME: Issue with UNIFORM_BLOCK_DATA_SIZE alignment?
        const data = template.allocateUniformBufferF32(WorldBlockShader.ub_RenderParams, 8);
        const diffuse = material.variables.find(mat => mat.name === "g_AlbedoMap")?.value;
        const normal = material.variables.find(mat => mat.name === "g_NormalMap")?.value;
        const mask = material.variables.find(mat => mat.name === "g_MaskMap")?.value;
        const specular = material.variables.find(mat => mat.name === "g_MaskMap2")?.value;
        let offs = offset;
        offs += fillVec4(data, offs, diffuse as number, normal, mask, specular);
        return offs;
    }

    public render(device: GfxDevice, viewerInput: Viewer.ViewerRenderInput) {
        this.renderHelper.debugDraw.beginFrame(viewerInput.camera.projectionMatrix, viewerInput.camera.viewMatrix, viewerInput.backbufferWidth, viewerInput.backbufferHeight);
        //this.renderHelper.debugDraw.screenPrintText('NieR:Automata', Red);

        // Prepare render insts before building render graph
        this.prepareToRender(device, viewerInput);

        const builder = this.renderHelper.renderGraph.newGraphBuilder();

        const mainColorDesc = makeBackbufferDescSimple(GfxrAttachmentSlot.Color0, viewerInput, standardFullClearRenderPassDescriptor);
        const mainDepthDesc = makeBackbufferDescSimple(GfxrAttachmentSlot.DepthStencil, viewerInput, standardFullClearRenderPassDescriptor);

        const mainColorTargetID = builder.createRenderTargetID(mainColorDesc, 'Main Color');
        const mainDepthTargetID = builder.createRenderTargetID(mainDepthDesc, 'Main Depth');

        builder.pushPass((pass) => {
            pass.setDebugName('Main');
            pass.attachRenderTargetID(GfxrAttachmentSlot.Color0, mainColorTargetID);
            pass.attachRenderTargetID(GfxrAttachmentSlot.DepthStencil, mainDepthTargetID);
            pass.exec((passRenderer) => {
                this.renderInstListMain.drawOnPassRenderer(this.renderHelper.renderCache, passRenderer);
            });
        });

        this.renderHelper.debugDraw.pushPasses(builder, mainColorTargetID, mainDepthTargetID);
        this.renderHelper.antialiasingSupport.pushPasses(builder, viewerInput, mainColorTargetID);
        builder.resolveRenderTargetToExternalTexture(mainColorTargetID, viewerInput.onscreenTexture);

        builder.execute();
        this.renderInstListMain.reset();
    }

    public destroy(device: GfxDevice) {
        this.renderHelper.destroy();
    }
}

class NierSceneDesc implements Viewer.SceneDesc {
    constructor(public id: string, public name: string) {
    }

    public async createScene(device: GfxDevice, context: SceneContext): Promise<Viewer.SceneGfx> {
        rust.init_panic_hook();
        return new NierRenderer(device, context);
    }
}

const id = "NierAutomata";
const name = "NieR:Automata";

const sceneDescs = [
    new NierSceneDesc("world", "World Map"),
];

export const sceneGroup: Viewer.SceneGroup = { id, name, sceneDescs, hidden: true };