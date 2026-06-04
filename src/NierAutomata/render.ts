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
    vec4 samples[7];
    samples[0] = texture(SAMPLER_2D(u_Texture0), v_TexCoord);
    samples[1] = texture(SAMPLER_2D(u_Texture1), v_TexCoord);
    samples[2] = texture(SAMPLER_2D(u_Texture2), v_TexCoord);
    samples[3] = texture(SAMPLER_2D(u_Texture3), v_TexCoord);
    samples[4] = texture(SAMPLER_2D(u_Texture4), v_TexCoord);
    samples[5] = texture(SAMPLER_2D(u_Texture5), v_TexCoord);
    samples[6] = texture(SAMPLER_2D(u_Texture6), v_TexCoord);

    //bool usePBS10 = u_Textures0.w > 0.5;
    vec2 uv = v_TexCoord;
    vec4 albedo1 = samples[0]; //samples[int(u_Textures0[0])];
    vec4 albedo2 = samples[1]; //samples[int(u_Textures0[1])];
    vec4 albedo3 = samples[2]; //samples[int(u_Textures0[2])];
    vec4 mask = samples[4]; //samples[int(u_Textures1[0])];
    vec4 normal = samples[5]; //samples[int(u_Textures1[0])];

    // Colors in Nier are stored in a strange way, among 3 textures.
    // color = (1 - r) * (g * color3 + (1 - g) * color2) + r * color1
    // source: https://discord.com/channels/457656329235070981/837783151329411122/990068822063075358
    float r = 0.25;
    float g = 0.25;
    vec3 color1 = albedo1.rgb;
    vec3 color2 = albedo2.rgb;
    vec3 color3 = albedo3.rgb;
    vec3 outColor = (1.0 - r) * (g * color3 + (1.0 - g) * color2) + r * color1;

    gl_FragColor = vec4(v_Normal.rgb, 1.0); //vec4(outColor, 1.0);
}
`;

    public static Common = `
precision highp float;

${GfxShaderLibrary.MatrixLibrary}

layout(std140) uniform ub_SceneParams {
    Mat4x4 u_ClipFromWorld;
};

layout(std140) uniform ub_ObjectParams {
    Mat3x4 u_WorldFromLocal;
};
/*
layout(std140) uniform ub_RenderParams {
    // x: albedo/albedo1, y: light/albedo2, z: mask/albedo3, w: use PBS00 (0) / PBS10 (1)
    vec4 u_Textures0;
    // x: normal/light, y: detail/mask, z: env/normal, w: irradiance/normal2
    vec4 u_Textures1;
    // x: N/A / normal3, y: N/A / env, z: N/A / irradiance, w: N/A
    vec4 u_Textures2;
};
*/
layout(location = 0) uniform sampler2D u_Texture0;
layout(location = 1) uniform sampler2D u_Texture1;
layout(location = 2) uniform sampler2D u_Texture2;
layout(location = 3) uniform sampler2D u_Texture3;
layout(location = 4) uniform sampler2D u_Texture4;
layout(location = 5) uniform sampler2D u_Texture5;
layout(location = 6) uniform sampler2D u_Texture6;
`;
}