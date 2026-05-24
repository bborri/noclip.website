import { rust } from "../rustlib.js";
import { Blue, Color, Green, Red } from '../Color.js';
import { mat4 } from 'gl-matrix';
import * as Viewer from '../viewer.js';
import { SceneContext } from '../SceneBase.js';
import { fillMatrix4x3, fillMatrix4x4 } from '../gfx/helpers/UniformBufferHelpers.js';
import { GfxDevice, GfxProgram, GfxCullMode, GfxFrontFaceMode, GfxPrimitiveTopology } from '../gfx/platform/GfxPlatform.js';
import { GfxInputLayout }  from '../gfx/platform/GfxPlatformImpl.js';
import { GfxRenderHelper } from '../gfx/render/GfxRenderHelper.js';
import { GfxRenderInst, GfxRenderInstList } from '../gfx/render/GfxRenderInstManager.js';
import { GfxrAttachmentSlot } from '../gfx/render/GfxRenderGraph.js';
import { makeBackbufferDescSimple, standardFullClearRenderPassDescriptor } from '../gfx/helpers/RenderGraphHelpers.js';

import { WorldBlockShader } from "./render.js";
import { NierCache, NierWorldBlock } from "./cache.js";
import { assert } from "../util.js";
/*
import {
    ReadonlyMat4,
    ReadonlyVec3,
    mat4,
    quat,
    vec3,
    vec4
} from "gl-matrix";
import { GfxRenderDynamicUniformBuffer } from "../gfx/render/GfxRenderDynamicUniformBuffer.js";
*/
export class NierRenderer implements Viewer.SceneGfx {
    private context: SceneContext;
    private renderHelper: GfxRenderHelper;
    private renderInstListMain = new GfxRenderInstList();
    private shader: GfxProgram;
    private cache: NierCache;

    constructor(device: GfxDevice, context: SceneContext) {
        this.context = context;
        this.renderHelper = new GfxRenderHelper(device);
        this.shader = this.renderHelper.renderCache.createProgram(new WorldBlockShader());
        this.cache = new NierCache(device, context);
    }

    protected prepareToRender(device: GfxDevice, viewerInput: Viewer.ViewerRenderInput): void {
        const template = this.renderHelper.pushTemplateRenderInst();
        const renderInstManager = this.renderHelper.renderInstManager;
        //const renderInst = renderInstManager.newRenderInst();

        template.setBindingLayouts([
            { numSamplers: 0, numUniformBuffers: 3 },
        ]);

        this.fillSceneParams(template, viewerInput);

        renderInstManager.setCurrentList(this.renderInstListMain);

        template.setGfxProgram(this.shader);
        template.setUniformBuffer(this.renderHelper.uniformBuffer);

        const objectTransform = mat4.create();

        let blockName = "g20908";
        const worldBlock = this.cache.loadBlock(blockName);
        if (worldBlock === undefined) {
            console.log("World block " + blockName + ' not yet ready !');
        }
        else {
            const renderInst = renderInstManager.newRenderInst();
            //renderInst.setPrimitiveTopology(GfxPrimitiveTopology.TriangleStrip);
            renderInst.setMegaStateFlags({ cullMode: GfxCullMode.None, frontFace: GfxFrontFaceMode.CW });
            worldBlock?.setAsInput(device, renderInst, this.cache);
            const objectParams = renderInst.allocateUniformBufferF32(WorldBlockShader.ub_ObjectParams, 12);
            let offs = 0;
            offs += fillMatrix4x3(objectParams, offs, objectTransform);
            //block.debugDrawTris(this.renderHelper.debugDraw);
            renderInst.validate();
            renderInstManager.submitRenderInst(renderInst);
        }

        //template.setSamplerBindingsFromTextureMappings(this.textures[i]);
        // TODO: Reactivate culling when debugging is done
        template.setMegaStateFlags({ cullMode: GfxCullMode.None, frontFace: GfxFrontFaceMode.CW });

        //renderInstManager.submitRenderInst(renderInst);
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