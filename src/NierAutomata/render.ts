import { DeviceProgram } from "../Program";
import { GfxShaderLibrary } from "../gfx/helpers/GfxShaderLibrary";

// Shader for world rendering
export class WorldBlockShader extends DeviceProgram {
    public static a_Position = 0;
    public static a_Color = 1;
    public static a_TexCoord = 2;
    public static a_Normal = 3;

    public static ub_CameraParams = 0;
    public static ub_ObjectParams = 1;
    public static ub_RenderParams = 2;

    // Vertex shader
    public override vert = `
${WorldBlockShader.Common}

layout(location = ${WorldBlockShader.a_Position}) in vec3 a_Position;
layout(location = ${WorldBlockShader.a_Color}) in vec3 a_Color;
layout(location = ${WorldBlockShader.a_TexCoord}) in vec2 a_TexCoord;
layout(location = ${WorldBlockShader.a_Normal}) in vec3 a_Normal;

out vec3 v_Color;
out vec2 v_TexCoord;
out vec3 v_Normal;

void main() {
    vec3 t_PositionWorld = (UnpackMatrix(u_WorldFromLocal) * vec4(a_Position.xyz, 1.0f)).xyz;
    gl_Position = UnpackMatrix(u_ClipFromWorld) * vec4(t_PositionWorld, 1.0f);

    v_Color = a_Color.rgb;
    v_TexCoord = a_TexCoord.xy;
    v_Normal = a_Normal.xyz;
}
`;

    // Fragment shader
    public override frag = `
${WorldBlockShader.Common}

in vec3 v_Color;
in vec2 v_TexCoord;
in vec3 v_Normal;

void main() {
    mediump vec4 diffuse = texture(SAMPLER_2D(u_Textures[0]), v_TexCoord.xy);
    mediump vec4 normal = texture(SAMPLER_2D(u_Textures[1]), v_TexCoord.xy);
    mediump vec4 mask = texture(SAMPLER_2D(u_Textures[2]), v_TexCoord.xy);
    mediump vec4 specular = texture(SAMPLER_2D(u_Textures[3]), v_TexCoord.xy);

    // Colors in Nier are stored in a strange way, among 3 textures.
    // color = (1 - r) * (g * color3 + (1 - g) * color2) + r * color1
    // source: https://discord.com/channels/457656329235070981/837783151329411122/990068822063075358
    float r = 0.25;
    float g = 0.25;
    vec3 color1 = diffuse.rgb;
    vec3 color2 = normal.rgb;
    vec3 color3 = mask.rgb;
    vec3 outColor = (1.0 - r) * (g * color3 + (1.0 - g) * color2) + r * color1;

    gl_FragColor = vec4(v_Normal.rgb, 1.0); // vec4(diffuse.rgb, 1.0); //vec4(outColor, 1.0);
}
`;

    public static Common = `
precision mediump float;
precision highp sampler2DArray;

${GfxShaderLibrary.MatrixLibrary}

layout(std140) uniform ub_SceneParams {
    Mat4x4 u_ClipFromWorld;
};

layout(std140) uniform ub_ObjectParams {
    Mat3x4 u_WorldFromLocal;
};
/*
layout(std140) uniform ub_RenderParams {
    // x: diffuse, y: normal, z: mask, w: specular
    vec4 u_MaterialTextures;
};
*/
layout(location = 0) uniform sampler2D u_Textures[4];
`;
}