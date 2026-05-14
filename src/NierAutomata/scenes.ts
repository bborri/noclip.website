import { rust } from "../rustlib.js";
import { Blue, Color, Green, Red } from '../Color.js';
import * as Viewer from '../viewer.js';
import { SceneContext } from '../SceneBase.js';
import { GfxDevice, GfxProgram } from '../gfx/platform/GfxPlatform.js';
import { GfxRenderHelper } from '../gfx/render/GfxRenderHelper.js';
import { GfxRenderInstList } from '../gfx/render/GfxRenderInstManager.js';
import { GfxrAttachmentSlot } from '../gfx/render/GfxRenderGraph.js';
import { makeBackbufferDescSimple, standardFullClearRenderPassDescriptor } from '../gfx/helpers/RenderGraphHelpers.js';

import { NierDatFile } from "noclip-rust-support";

const pathBase = "NierAutomata";

export class NierRenderer implements Viewer.SceneGfx {
    private context: SceneContext;
    private renderHelper: GfxRenderHelper;
    private renderInstListMain = new GfxRenderInstList();
    private debugDatFile: NierDatFile;

    constructor(device: GfxDevice, context: SceneContext) {
        this.context = context;
        this.renderHelper = new GfxRenderHelper(device);
        /*
            !!! Temporary: Open DAT/DTT file here and read it all into a string
            The proper solution requires opening the CPK file, unpacking to memory and sending
            the split binary buffers for parsing.
        */
        //let path = `${pathBase}/wd1/g11320.dtt`;
        let path = `${pathBase}/wd2/g20908.dtt`;
        this.loadFile(path);
    }

    protected async loadFile(path: string) {
        let binary = await this.context.dataFetcher.fetchData(path);
        this.debugDatFile = new NierDatFile(binary.createTypedArray(Uint8Array));
    }

    protected prepareToRender(device: GfxDevice, viewerInput: Viewer.ViewerRenderInput): void {
        const template = this.renderHelper.pushTemplateRenderInst();
        const renderInstManager = this.renderHelper.renderInstManager;



        renderInstManager.popTemplate();
        this.renderHelper.prepareToRender();
    }

    public render(device: GfxDevice, viewerInput: Viewer.ViewerRenderInput) {

        this.renderHelper.debugDraw.beginFrame(viewerInput.camera.projectionMatrix, viewerInput.camera.viewMatrix, viewerInput.backbufferWidth, viewerInput.backbufferHeight);
        this.renderHelper.debugDraw.screenPrintText('NieR:Automata', Red);

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