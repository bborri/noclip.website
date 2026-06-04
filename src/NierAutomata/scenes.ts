import { rust } from "../rustlib.js";
import { mat4, vec3 } from 'gl-matrix';
import * as Viewer from '../viewer.js';
import { SceneContext } from '../SceneBase.js';
import { fillMatrix4x3, fillMatrix4x4, fillVec4 } from '../gfx/helpers/UniformBufferHelpers.js';
import { GfxDevice, GfxProgram, GfxCullMode, GfxFrontFaceMode } from '../gfx/platform/GfxPlatform.js';
import { GfxRenderHelper } from '../gfx/render/GfxRenderHelper.js';
import { GfxRenderInst, GfxRenderInstList } from '../gfx/render/GfxRenderInstManager.js';
import { GfxrAttachmentSlot } from '../gfx/render/GfxRenderGraph.js';
import { makeBackbufferDescSimple, standardFullClearRenderPassDescriptor } from '../gfx/helpers/RenderGraphHelpers.js';

import { WorldBlockShader } from "./render.js";
import { NierCache } from "./cache.js";
import { World } from "./world.js";
import { Material, ShaderType } from "./worldblock.js";

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

        const renderInstManager = this.renderHelper.renderInstManager;
        renderInstManager.setCurrentList(this.renderInstListMain);

        const template = this.renderHelper.pushTemplateRenderInst();
        template.setGfxProgram(this.shader);
        template.setBindingLayouts([ { numSamplers: 7, numUniformBuffers: 2 } ]);

        let uniformOffset = 0;
        uniformOffset = this.fillCameraParams(template, uniformOffset, viewerInput);

        const cameraPos = mat4.getTranslation(vec3.create(), viewerInput.camera.worldMatrix);
        this.world.getVisibleBlocks(cameraPos).forEach(({name, position, block}) => {
            if (block === undefined) {
                console.log("World block " + name + ' not yet ready !');
            }
            else {
                uniformOffset = this.fillObjectParams(template, 0, position);
                const fillRenderParamsCallback = (material: Material): void => {
                    uniformOffset = this.fillRenderParams(template, 0, material);
                }
                block?.prepareToRender(renderInstManager, template, fillRenderParamsCallback);
            }
        });
        template.setMegaStateFlags({ cullMode: GfxCullMode.Back, frontFace: GfxFrontFaceMode.CW });

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
        const modelMatrix = mat4.fromTranslation(mat4.create(), position);

        const data = template.allocateUniformBufferF32(WorldBlockShader.ub_ObjectParams, 12);
        let offs = offset;
        offs += fillMatrix4x3(data, offs, modelMatrix);
        return offs;
    }

    private fillRenderParams(template: GfxRenderInst, offset: number, material: Material): number {
        // FIXME: Issue with UNIFORM_BLOCK_DATA_SIZE alignment?
        const data = template.allocateUniformBufferF32(WorldBlockShader.ub_RenderParams, 48);
        const usePBS00 = material.shaderType === ShaderType.PBS00;
        let x = 0, y = 0, z = 0, w = 0;
        let x2 = 0, y2 = 0, z2 = 0, w2 = 0;
        let x3 = 0, y3 = 0, z3 = 0, w3 = 0;
        if (usePBS00) {
            x = material.variables.get("g_AlbedoMap")?.valueOf() ?? 0;
            y = material.variables.get("g_LightMap")?.valueOf() ?? 0;
            z = material.variables.get("g_MaskMap")?.valueOf() ?? 0;
            w = 0;
            x2 = material.variables.get("g_NormalMap")?.valueOf() ?? 0;
            y2 = material.variables.get("g_DetailNormalMap")?.valueOf() ?? 0;
            z2 = material.variables.get("g_EnvMap")?.valueOf() ?? 0;
            w2 = material.variables.get("g_IrradianceMap")?.valueOf() ?? 0;
        } else {
            x = material.variables.get("g_AlbedoMap1")?.valueOf() ?? 0;
            y = material.variables.get("g_AlbedoMap2")?.valueOf() ?? 0;
            z = material.variables.get("g_AlbedoMap3")?.valueOf() ?? 0;
            w = 1;
            x2 = material.variables.get("g_LightMap")?.valueOf() ?? 0;
            y2 = material.variables.get("g_MaskMap")?.valueOf() ?? 0;
            z2 = material.variables.get("g_NormalMap")?.valueOf() ?? 0;
            w2 = material.variables.get("g_NormalMap2")?.valueOf() ?? 0;
            x3 = material.variables.get("g_NormalMap3")?.valueOf() ?? 0;
            y3 = material.variables.get("g_EnvMap")?.valueOf() ?? 0;
            z3 = material.variables.get("g_IrradianceMap")?.valueOf() ?? 0;
        }
        let offs = offset;
        offs += fillVec4(data, offs, x, y, z, w);
        offs += fillVec4(data, offs, x2, y2, z2, w2);
        offs += fillVec4(data, offs, x3, y3, z3, w3);
        return offs;
    }

    public render(device: GfxDevice, viewerInput: Viewer.ViewerRenderInput) {
        viewerInput.camera.setClipPlanes(0.5, 10000);
        this.renderHelper.debugDraw.beginFrame(viewerInput.camera.projectionMatrix, viewerInput.camera.viewMatrix, viewerInput.backbufferWidth, viewerInput.backbufferHeight);
        //this.renderHelper.debugDraw.screenPrintText('NieR:Automata', Red);

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

        this.prepareToRender(device, viewerInput);
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