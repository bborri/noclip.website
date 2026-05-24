import { DeviceProgram } from "../Program";
import { GfxShaderLibrary } from "../gfx/helpers/GfxShaderLibrary";

// Default shader for debugging
export class WorldBlockShader extends DeviceProgram {
    public static a_Position = 0;
    public static a_Color = 1;
    public static a_TexCoord = 2;
    public static a_Normal = 3;

    public static ub_SceneParams = 0;
    public static ub_ObjectParams = 1;

    // Vertex shader
    public override vert = `
${WorldBlockShader.Common}

layout(location = ${WorldBlockShader.a_Position}) in vec3 a_Position;
layout(location = ${WorldBlockShader.a_Color}) in vec3 a_Color;
layout(location = ${WorldBlockShader.a_TexCoord}) in vec2 a_TexCoord;
layout(location = ${WorldBlockShader.a_Normal}) in vec3 a_Normal;

out vec2 v_TexCoord;
out vec3 v_Color;
out vec3 v_Normal;

void main() {
    // Compute our world-space position from the position vertex attribute, and our uniform data.
    // I use a "t_" prefix to mean "temporary variable".
    // The UnpackMatrix call here comes from the MatrixLibrary (see the Common declarations below).
    vec3 t_PositionWorld = (UnpackMatrix(u_WorldFromLocal) * vec4(a_Position.xyz, 1.0f)).xyz;

    // Compute our output clip-space position from the world-space position.
    // I like to name matrices with the format "SpaceFromSpace". That way, you can snap them together like:
    //   u_ClipFromWorld * u_WorldFromView * u_ViewFromLocal * t_PositionView.
    gl_Position = UnpackMatrix(u_ClipFromWorld) * vec4(t_PositionWorld, 1.0f);

    // Output our texture coordinates for sampling to the fragment shader below.
    v_TexCoord = a_TexCoord.xy;
    v_Color = a_Color.rgb;
    v_Normal = a_Normal.xyz;
}
`;

    // Fragment shader
    public override frag = `
${WorldBlockShader.Common}

in vec2 v_TexCoord;
in vec3 v_Color;

void main() {
    // Use the UV coordinates output by the vertex shader to sample our texture.
    gl_FragColor = vec4(v_Color, 1.0);//texture(SAMPLER_2D(u_Texture), v_TexCoord.xy);
}
`

    public static Common = `
// Import some helper code. In this case, we use a special matrix library as a workaround for some computers
// with incomplete WebGL implementations.
${GfxShaderLibrary.MatrixLibrary}

// Declare our uniform data. These are parameters that are constant across the entire draw call,
// and do not change per vertex or per pixel.
layout(std140) uniform ub_SceneParams {
    // Define our ViewProjection, or "ClipFromWorld" matrix, since it transforms us into clip space, from world space.
    // I use a "u_" prefix for uniform parameters.
    Mat4x4 u_ClipFromWorld;
};

// Define a second matrix for our cube's transform. This could be in the uniform buffer above, however
// I'm declaring two of them just to show how that works.
layout(std140) uniform ub_ObjectParams {
    Mat3x4 u_WorldFromLocal;
};

// Declare our texture for the cube.
layout(location = 0) uniform sampler2D u_Texture;
`;
}