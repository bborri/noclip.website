import { rust } from "../rustlib.js";
import { mat4, vec3 } from 'gl-matrix';
import * as Viewer from '../viewer.js';
import { SceneContext } from '../SceneBase.js';
import { fillMatrix4x3, fillMatrix4x4 } from '../gfx/helpers/UniformBufferHelpers.js';
import { GfxDevice, GfxProgram, GfxCullMode, GfxFrontFaceMode } from '../gfx/platform/GfxPlatform.js';
import { GfxRenderHelper } from '../gfx/render/GfxRenderHelper.js';
import { GfxRenderInst, GfxRenderInstList } from '../gfx/render/GfxRenderInstManager.js';
import { GfxrAttachmentSlot } from '../gfx/render/GfxRenderGraph.js';
import { makeBackbufferDescSimple, standardFullClearRenderPassDescriptor } from '../gfx/helpers/RenderGraphHelpers.js';

import { WorldBlockShader } from "./render.js";
import { NierCache } from "./cache.js";
import { World } from "./world.js";

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

        template.setBindingLayouts([
            { numSamplers: 3, numUniformBuffers: 3 },
        ]);

        this.fillSceneParams(template, viewerInput);

        renderInstManager.setCurrentList(this.renderInstListMain);

        template.setGfxProgram(this.shader);
        template.setUniformBuffer(this.renderHelper.uniformBuffer);

        const cameraPos = vec3.fromValues(viewerInput.camera.worldMatrix[12], viewerInput.camera.worldMatrix[13], viewerInput.camera.worldMatrix[14]);
        this.world.getVisibleBlocks(cameraPos).forEach(({name, position, block}) => {
            if (block === undefined) {
                console.log("World block " + name + ' not yet ready !');
            }
            else {
                const renderInst = renderInstManager.newRenderInst();
                renderInst.setMegaStateFlags({ cullMode: GfxCullMode.Back, frontFace: GfxFrontFaceMode.CW });
                block?.setAsInput(renderInst);
                const objectTransform = mat4.fromTranslation(mat4.create(), position);
                const objectParams = renderInst.allocateUniformBufferF32(WorldBlockShader.ub_ObjectParams, 12);
                let offs = 0;
                offs += fillMatrix4x3(objectParams, offs, objectTransform);
                renderInst.validate();
                renderInstManager.submitRenderInst(renderInst);
            }
        });
        template.setMegaStateFlags({ cullMode: GfxCullMode.Back, frontFace: GfxFrontFaceMode.CW });

        renderInstManager.popTemplate();
        this.renderHelper.prepareToRender();
    }

    private fillSceneParams(template: GfxRenderInst, viewerInput: Viewer.ViewerRenderInput): void {
        const data = template.allocateUniformBufferF32(0, 16);
        let offs = 0;
        offs += fillMatrix4x4(data, offs, viewerInput.camera.clipFromWorldMatrix);
    }

    public render(device: GfxDevice, viewerInput: Viewer.ViewerRenderInput) {
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