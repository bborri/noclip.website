// WMB parser
// Contains World Mesh data

use crate::{geometry::AABB, nierautomata::constants, util};

use float16::f16;
use nalgebra_glm::{TVec2, TVec3, Vec3, TVec4, make_vec2, make_vec3, make_vec4};
use wasm_bindgen::prelude::*;
use web_sys::console;

const WMB_AABB_SIZE: usize = 6 * size_of::<f32>();
const WMB_VERTEX_GROUP_SIZE: usize = 12 * size_of::<u32>();
const WMB_LOD_SIZE: usize = 5 * size_of::<u32>();
const WMB_BATCH_INFO_SIZE: usize = 6 * size_of::<u32>();
const WMB_MATERIAL_SIZE: usize = 12 * size_of::<u32>();
const WMB_TEXTURE_REFERENCE_SIZE: usize = 2 * size_of::<u32>();
const WMB_PARAMETER_GROUP_SIZE: usize = 3 * size_of::<u32>();
const WMB_VARIABLE_SIZE: usize = 2 * size_of::<u32>();
const WMB_BATCH_SIZE: usize = 6 * size_of::<u32>();
const WMB_MESH_SIZE: usize = 11 * size_of::<u32>();


type WorldDataEntry = [f32; 6];

#[derive(Debug, Clone)]
#[wasm_bindgen(js_name = "NierMaterial", getter_with_clone)]
pub struct Material {
    pub name: String,
    pub texture_references: Vec<TextureReference>,
    pub parameter_groups: Vec<MaterialParameterGroup>,
    pub variables: Vec<MaterialVariable>
}

#[derive(Debug, Clone)]
#[wasm_bindgen(js_name = "NierMaterialParameterGroup", getter_with_clone)]
pub struct MaterialParameterGroup {
    pub index: i32,
    pub parameters: Vec<f32>
}

#[derive(Debug, Clone)]
#[wasm_bindgen(js_name = "NierMaterialVariable", getter_with_clone)]
pub struct MaterialVariable {
    pub name: String,
    pub value: f32
}

#[derive(Debug, Clone)]
#[wasm_bindgen(js_name = "NierLOD", getter_with_clone)]
pub struct LOD {
    pub name: String,
    pub lod_level: i32,
    pub batch_start_index: u32,
    pub batch_infos: Vec<BatchInfo>
}

#[derive(Debug, Copy, Clone)]
#[wasm_bindgen(js_name = "NierBatchInfo")]
pub struct BatchInfo {
    pub vertex_group_index: u32,
    pub mesh_index: u32,
    pub material_index: u32,
    pub mesh_material_pair_index: u32
}

#[derive(Debug, Copy, Clone)]
#[wasm_bindgen(js_name = "NierBatch")]
pub struct Batch {
    pub vertex_group_index: i32,
    pub vertex_offset: u32,
    pub index_offset: u32,
    pub vertex_count: u32,
    pub index_count: u32,
    pub primitive_count: u32
}

#[derive(Debug, Clone)]
#[wasm_bindgen(js_name = "NierMesh", getter_with_clone)]
pub struct Mesh {
    pub name: String,
    bounding_box: AABB,
    pub material_indices: Vec<u16>
}

#[derive(Debug, Copy, Clone)]
#[wasm_bindgen(js_name = "NierMeshMaterialPair")]
pub struct MeshMaterialPair {
    pub mesh_index: u32,
    pub material_index: u32
}

#[derive(Debug, Clone)]
#[wasm_bindgen(js_name = "NierTextureReference", getter_with_clone)]

pub struct TextureReference {
    pub name: String,
    pub texture: u32
}

#[derive(Debug, Clone)]
#[wasm_bindgen(js_name = "NierVertexGroup", getter_with_clone)]
pub struct VertexGroup {
    pub positions: Vec<f32>, // 3 by 3, XYZ
    pub normals: Vec<f32>, // 3 by 3, XYZ
    pub colors: Vec<f32>, // 4 by 4, RGBA
    pub tex_coords: Vec<f32>, // 2 by 2, UV
    pub indices: Vec<u32> // 3 by 3, indices into the vertex arrays
}

pub struct Vertex {
    pos_x: f32,
    pos_y: f32,
    pos_z: f32,
    normal: TVec3<f16>,
    tangent: Vec3,
    color: Option<Color>,
    tex_coord: TVec2<f16>,
    tex_coord2: Option<TVec2<f16>>,
    tex_coord3: Option<TVec2<f16>>,
    tex_coord4: Option<TVec2<f16>>,
    tex_coord5: Option<TVec2<f16>>
}

type Color = TVec4<f32>;

#[derive(Debug, Clone)]
#[wasm_bindgen(js_name = "NierWorldMesh")]
pub struct WmbFile {
    block_offset: usize,
    vertex_groups: Vec<VertexGroup>,
    bounding_box: AABB,
    lods: Vec<LOD>,
    batches: Vec<Batch>,
    meshes: Vec<Mesh>,
    materials: Vec<Material>,
    mesh_material_pairs: Vec<MeshMaterialPair>
}

#[wasm_bindgen(js_class = "NierWorldMesh")]
impl WmbFile {

    pub fn new(data: &[u8], block_offset: usize) -> Self {
        let mut offs: usize = 0;
        let magic = util::get_uint32_be(data, offs);
        assert_eq!(magic, constants::WMB_MAGIC); // "WMB3"
        offs += 12; // skip version and 1 unknown 32-bit value

        //console::log_1(&format!("Parsing WMB3 file!").into());

        let flags = util::get_uint32_le(data, offs);
        offs += 4;

        // Bounding box
        let bounding_box = Self::parse_aabb(data, offs);
        offs += WMB_AABB_SIZE;

        offs += 4 * size_of::<u32>(); // skip all bone-related stuff

        let vertex_group_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let vertex_group_count = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();

        let batch_array_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let batch_count = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();

        let lod_array_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let lod_count = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();

        offs += 6 * size_of::<u32>(); // skip collisions and bone maps / sets

        let material_array_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let material_count = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();

        let mesh_array_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let mesh_count = util::get_uint32_le(data, offs);
        offs += 3 * size_of::<u32>(); // skip mesh materials

        let world_data_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let world_data_count = util::get_uint32_le(data, offs);
        //offs += size_of::<u32>();

        console::log_1(&format!(" - Found {} vertex groups, {} meshes, {} batches, {} LODs", vertex_group_count, mesh_count, batch_count, lod_count).into());

        let vertex_groups = Self::parse_vertex_groups(data, vertex_group_offset as usize, vertex_group_count as usize);
        let lods = Self::parse_lods(data, lod_array_offset as usize, lod_count as usize);
        let batches = Self::parse_batches(data, batch_array_offset as usize, batch_count as usize);
        let meshes = Self::parse_meshes(data, mesh_array_offset as usize, mesh_count as usize);
        let materials = Self::parse_materials(data, material_array_offset as usize, material_count as usize);
        let mesh_material_pairs = Self::parse_mesh_material_pairs(data, offs, world_data_count as usize);
        let world_data = Self::parse_world_data(data, world_data_offset as usize, world_data_count as usize);

        Self {
            block_offset,
            vertex_groups,
            bounding_box,
            lods,
            batches,
            meshes,
            materials,
            mesh_material_pairs
        }
    }

    pub fn vertex_groups(&self) -> Vec<VertexGroup> {
        self.vertex_groups.clone()
    }

    pub fn materials(&self) -> Vec<Material> {
        self.materials.clone()
    }

    pub fn lods(&self) -> Vec<LOD> {
        self.lods.clone()
    }

    pub fn batches(&self) -> Vec<Batch> {
        self.batches.clone()
    }

    pub fn meshes(&self) -> Vec<Mesh> {
        self.meshes.clone()
    }

    pub fn mesh_material_pairs(&self) -> Vec<MeshMaterialPair> {
        self.mesh_material_pairs.clone()
    }

    fn parse_aabb(data: &[u8], offset: usize) -> AABB {
        let x_min = util::get_float32_le(data, offset) * constants::WORLD_SCALE;
        let y_min = util::get_float32_le(data, offset + 4) * constants::WORLD_SCALE;
        let z_min = util::get_float32_le(data, offset + 8) * constants::WORLD_SCALE;
        let x_max = util::get_float32_le(data, offset + 12) * constants::WORLD_SCALE;
        let y_max = util::get_float32_le(data, offset + 16) * constants::WORLD_SCALE;
        let z_max = util::get_float32_le(data, offset + 20) * constants::WORLD_SCALE;
        /*console::log_1(&format!(
                " - AABB: ({},{},{}), ({},{},{})",
                x_min, y_min, z_min,
                x_max, y_max, z_max
            )
            .into());*/
        AABB::from_f32(x_min, y_min, z_min, x_max, y_max, z_max)
    }

    fn parse_lods(data: &[u8], offset: usize, count: usize) -> Vec<LOD> {
        let mut lods = Vec::with_capacity(count);
        for i in 0..count {
            lods.push(Self::parse_lod(data, offset + i * WMB_LOD_SIZE));
        }
        lods
    }

    fn parse_lod(data: &[u8], offset: usize) -> LOD {
        let mut offs = offset;
        let name_offset = util::get_uint32_le(data, offs) as usize;
        offs += size_of::<u32>();
        let lod_level = util::get_int32_le(data, offs);
        offs += size_of::<i32>();
        let batch_start_index = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let batch_info_offset = util::get_uint32_le(data, offs) as usize;
        offs += size_of::<u32>();
        let batch_count = util::get_uint32_le(data, offs) as usize;

        let name = util::get_string(data, name_offset, constants::MAX_STR_SIZE).unwrap();
        let batch_infos = Self::parse_batch_infos(data, batch_info_offset, batch_count);

        LOD { name, lod_level, batch_start_index, batch_infos }
    }

    fn parse_batch_infos(data: &[u8], offset: usize, count: usize) -> Vec<BatchInfo> {
        let mut batch_infos = Vec::with_capacity(count);
        for i in 0..count {
            batch_infos.push(Self::parse_batch_info(data, offset + i * WMB_BATCH_INFO_SIZE));
        }
        batch_infos
    }

    fn parse_batch_info(data: &[u8], offset: usize) -> BatchInfo {
        let mut offs = offset;
        let vertex_group_index = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let mesh_index = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let material_index = util::get_uint32_le(data, offs);
        offs += 2 * size_of::<u32>(); // skip collision tree nodes
        let mesh_material_pair_index = util::get_uint32_le(data, offs);

        BatchInfo { vertex_group_index, mesh_index, material_index, mesh_material_pair_index }
    }

    fn parse_batches(data: &[u8], offset: usize, mesh_count: usize) -> Vec<Batch> {
        let mut batches = Vec::with_capacity(mesh_count);
        for i in 0..mesh_count {
            batches.push(Self::parse_batch(data, offset + i * WMB_BATCH_SIZE));
        }
        batches
    }

    fn parse_batch(data: &[u8], offset: usize) -> Batch {
        let mut offs = offset;
        let vertex_group_index = util::get_int32_le(data, offs);
        offs += 2 * size_of::<u32>(); // skip bone set index
		let vertex_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
		let index_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
		let vertex_count = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
		let index_count = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let primitive_count = util::get_uint32_le(data, offs);
        Batch {
            vertex_group_index, vertex_offset, index_offset,
            vertex_count, index_count, primitive_count
        }
    }

    fn parse_meshes(data: &[u8], offset: usize, count: usize) -> Vec<Mesh> {
        let mut meshes = Vec::with_capacity(count);
        for i in 0..count {
            meshes.push(Self::parse_mesh(data, offset + i * WMB_MESH_SIZE));
        }
        meshes
    }

    fn parse_mesh(data: &[u8], offset: usize) -> Mesh {
        let mut offs = offset;
        let name_offset = util::get_uint32_le(data, offs) as usize;
        offs += size_of::<u32>();
        let bounding_box = Self::parse_aabb(data, offs);
        offs += WMB_AABB_SIZE;
        let materials_offset = util::get_uint32_le(data, offs) as usize;
        offs += size_of::<u32>();
        let materials_count = util::get_uint32_le(data, offs) as usize;

        let name = util::get_string(data, name_offset, constants::MAX_STR_SIZE).unwrap();
        let mut material_indices = Vec::with_capacity(materials_count);
        for _ in 0..materials_count {
            let material_index = util::get_uint16_le(data, materials_offset);
            material_indices.push(material_index);
        }

        Mesh { name, bounding_box, material_indices }
    }

    fn parse_mesh_material_pairs(data: &[u8], offset: usize, count: usize) -> Vec<MeshMaterialPair> {
        let mut offs = offset;
        let mut pairs = Vec::with_capacity(count);
        for _ in 0..count {
            let mesh_index = util::get_uint32_le(data, offs);
            offs += size_of::<u32>();
            let material_index = util::get_uint32_le(data, offs);
            offs += size_of::<u32>();
            pairs.push(MeshMaterialPair { mesh_index, material_index });
        }
        pairs
    }

    fn parse_vertex_groups(data: &[u8], offset: usize, count: usize) -> Vec<VertexGroup> {
        let mut vertex_groups = Vec::with_capacity(count);
        for i in 0..count {
            vertex_groups.push(Self::parse_vertex_group(data, offset + i * WMB_VERTEX_GROUP_SIZE));
        }
        vertex_groups
    }

    fn parse_vertex_group(data: &[u8], offset: usize) -> VertexGroup {
        //console::log_1(&format!("Parsing vertex group at offset {}", offset).into());
        let mut offs= offset;
        // Header
        let vertex_array_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let vertex_exdata_array_offset = util::get_uint32_le(data, offs);
        offs += 3 * size_of::<u32>(); // skip 2 unknown u32 values
        let vertex_stride = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let vertex_exdata_stride = util::get_uint32_le(data, offs);
        offs += 3 * size_of::<u32>(); // skip 2 unknown u32 values
        let vertex_count = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let vertex_flags = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let index_array_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let index_count = util::get_uint32_le(data, offs);

        console::log_1(&format!(" --- Found {} vertices, {} indices, flags = {}", vertex_count, index_count, vertex_flags).into());
        // Data
        let vertex_offs = vertex_array_offset as usize;
        let exdata_offs = vertex_exdata_array_offset as usize;
        let mut positions = Vec::with_capacity(vertex_count as usize * 3);
        let mut tangents = Vec::with_capacity(vertex_count as usize);
        let mut normals = Vec::with_capacity(vertex_count as usize);
        let mut colors = Vec::with_capacity(vertex_count as usize * 4);
        let mut tex_coords = Vec::with_capacity(vertex_count as usize * 2);
        //console::log_1(&format!(" --- Parsing {} vertices at offset {}", vertex_count, vertex_offs).into());
        for i in 0..vertex_count {
//            console::log_1(&format!(" --- Parsing vertex {} at offset {}", i, offs).into());
            let vertex = Self::parse_vertex(
                data,
                vertex_offs + (i * vertex_stride) as usize,
                exdata_offs + (i * vertex_exdata_stride) as usize,
                vertex_flags);
            positions.push(vertex.pos_x * constants::WORLD_SCALE);
            positions.push(vertex.pos_y * constants::WORLD_SCALE);
            positions.push(vertex.pos_z * constants::WORLD_SCALE);
            tangents.push(vertex.tangent);
            normals.push(f32::from(vertex.normal.x));
            normals.push(f32::from(vertex.normal.y));
            normals.push(f32::from(vertex.normal.z));
            tex_coords.push(f32::from(vertex.tex_coord[0]));
            tex_coords.push(f32::from(vertex.tex_coord[1]));
            if vertex.color.is_some() {
                let color = vertex.color.unwrap();
                colors.push(color[0] as f32 / 255.0, );
            }
        }
        let index_offs = index_array_offset as usize;
        let mut indices = Vec::with_capacity(index_count as usize);
        //console::log_1(&format!(" --- Parsing {} indices at offset {}", index_count, index_offs).into());
        // TODO: Proper handling of 16-bit indices. For now, just store them as u32.
        let get_index_fn = if vertex_flags & 0x8 != 0 {
            util::get_uint32_le
        } else {
            |data: &[u8], offs: usize| -> u32 { util::get_uint16_le(data, offs) as u32 }
        };
        let stride = if vertex_flags & 0x8 != 0 { size_of::<u32>() } else { size_of::<u16>() };
        for i in 0..index_count as usize {
            indices.push(get_index_fn(data, index_offs + (i * stride)));
        }

        VertexGroup { positions, normals, colors, tex_coords, indices }
    }

    fn parse_vertex(data: &[u8], offset: usize, exdata_offset: usize, vertex_flags: u32) -> Vertex {
        let mut offs = offset;
        let pos_x = util::get_float32_le(data, offs);
        offs += size_of::<f32>();
        let pos_y = util::get_float32_le(data, offs);
        offs += size_of::<f32>();
        let pos_z = util::get_float32_le(data, offs);
        offs += size_of::<f32>();

        let tangent_x = (data[offs] as f32 - 127.0) / 127.0;
        let tangent_y = (data[offs + 1] as f32 - 127.0) / 127.0;
        let tangent_z = (data[offs + 2] as f32 - 127.0) / 127.0;
        let tangent_sign = (data[offs + 3] as f32 - 127.0) / 127.0;

        offs += 4 * size_of::<u8>();

        let uv = make_vec2(&[
            util::get_float16_le(data, offs),
            util::get_float16_le(data, offs + size_of::<f16>()) ]);
        offs += 2 * size_of::<f16>();

        let mut normal_opt = None;
        if vertex_flags == 0 {
            normal_opt = Some(make_vec3(&[
                util::get_float16_le(data, offs),
                util::get_float16_le(data, offs + size_of::<f16>()),
                util::get_float16_le(data, offs + 2 * size_of::<f16>()) ]));
            offs += 4 * size_of::<f16>();
        }
        let mut uv2 = None;
        if [1, 4, 5, 12, 14].contains(&vertex_flags) {
            uv2 = Some(make_vec2(&[
                util::get_float16_le(data, offs),
                util::get_float16_le(data, offs + size_of::<f16>()) ]));
            offs += 2 * size_of::<f16>();
        }
        if [7, 8, 10, 11].contains(&vertex_flags) {
            panic!("Not yet supported!");
            /*
            self.boneIndices = read_uint8_x4(wmb_fp);
            self.boneWeights = [x / 255 for x in read_uint8_x4(wmb_fp)];*/
        }
        let mut color = Option::None;
        if [3, 4, 5, 12, 14].contains(&vertex_flags) {
            color = Some(make_vec4(&[
                (data[offs] as f32).floor() / 255.0,
                (data[offs + 1] as f32).floor() / 255.0,
                (data[offs + 2] as f32).floor() / 255.0,
                (data[offs + 3] as f32).floor() / 255.0 ]
            ));
            offs += 4 * size_of::<u8>();
        }
        let mut uv3 = None;
        let mut uv4 = None;
        if [12, 14].contains(&vertex_flags) {
            uv3 = Some(make_vec2(&[
                util::get_float16_le(data, offs),
                util::get_float16_le(data, offs + size_of::<f16>()) ]));
            offs += 2 * size_of::<f16>();
            uv4 = Some(make_vec2(&[
                util::get_float16_le(data, offs),
                util::get_float16_le(data, offs + size_of::<f16>()) ]));
            offs += 2 * size_of::<f16>();
        }
        let mut uv5 = None;
        if vertex_flags == 12 {
            uv5 = Some(make_vec2(&[
                util::get_float16_le(data, offs),
                util::get_float16_le(data, offs + size_of::<f16>()) ]));
            //offs += 2 * size_of::<f16>();
        }

        let mut vertex = Vertex {
            //pos: make_vec3(&[ pos_x, pos_y, pos_z ]),
            pos_x, pos_y, pos_z,
            normal: normal_opt.unwrap_or(make_vec3::<f16>(&[f16::default(), f16::default(), f16::default()])),
            tangent: make_vec3(&[ tangent_x, tangent_y, tangent_z ]),
            color: color,
            tex_coord: uv,
            tex_coord2: uv2,
            tex_coord3: uv3,
            tex_coord4: uv4,
            tex_coord5: uv5,
        };

        vertex = Self::parse_vertex_exdata(data, exdata_offset, vertex_flags, vertex);

        vertex

    }

    fn parse_vertex_exdata(data: &[u8], offset: usize, vertex_flags: u32, vertex: Vertex) -> Vertex {

        if vertex_flags == 0 {
            return vertex;
        }

        let mut v = vertex;

        let mut offs = offset;

        if [7, 8, 10, 11].contains(&vertex_flags) {
            v.tex_coord2 = Some(make_vec2(&[
                util::get_float16_le(data, offs),
                util::get_float16_le(data, offs + size_of::<f16>()),
            ]));
            offs += 2 * size_of::<f16>();
        }

        if [10, 11].contains(&vertex_flags) {
            v.color = Some(make_vec4(&[
                (data[offs] as f32).floor() / 255.0,
                (data[offs + 1] as f32).floor() / 255.0,
                (data[offs + 2] as f32).floor() / 255.0,
                (data[offs + 3] as f32).floor() / 255.0 ]
            ));
            offs += 4;
        }

        v.normal = make_vec3(&[
            util::get_float16_le(data, offset),
            util::get_float16_le(data, offset + size_of::<f16>()),
            util::get_float16_le(data, offset + 2 * size_of::<f16>())
        ]);
        offs += 3 * size_of::<f16>();

        if [5, 8, 11, 12, 14].contains(&vertex_flags) {
            v.tex_coord3 = Some(make_vec2(&[
                util::get_float16_le(data, offs),
                util::get_float16_le(data, offs + size_of::<f16>()),
            ]));
            offs += 2 * size_of::<f16>();
        }

        if [12, 14].contains(&vertex_flags) {
            v.tex_coord4 = Some(make_vec2(&[
                util::get_float16_le(data, offs),
                util::get_float16_le(data, offs + size_of::<f16>()),
            ]));
            offs += 2 * size_of::<f16>();
        }

        if vertex_flags == 12 {
            v.tex_coord5 = Some(make_vec2(&[
                util::get_float16_le(data, offs),
                util::get_float16_le(data, offs + size_of::<f16>()),
            ]));
        }

        v
    }

    fn parse_materials(data: &[u8], offset: usize, count: usize) -> Vec<Material> {
        let mut materials = Vec::with_capacity(count);
        for i in 0..count {
            materials.push(Self::parse_material(data, offset + i * WMB_MATERIAL_SIZE));
        }
        materials
    }

    fn parse_material(data: &[u8], offset: usize) -> Material {
        let mut offs= offset;

        offs += 4 * size_of::<u16>(); // skip 4 unknown u16 values
        let name_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let shader_name_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let technique_name_offset = util::get_uint32_le(data, offs);
        offs += 2 * size_of::<u32>(); // skip 1 unknown u32 value
        let texture_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let texture_count = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let parameter_groups_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let parameter_groups_count = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let variables_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let variables_count = util::get_uint32_le(data, offs);

        let name = util::get_string(data, name_offset as usize, constants::MAX_STR_SIZE).unwrap();
        let shader_name = util::get_string(data, shader_name_offset as usize, constants::MAX_STR_SIZE).unwrap();
        let technique_name = util::get_string(data, technique_name_offset as usize, constants::MAX_STR_SIZE).unwrap();

        /*console::log_1(&format!(" -- Found material with name '{}', shader '{}', technique '{}', referencing {} textures, with {} parameter groups and {} variables",
            name,
            shader_name,
            technique_name,
            texture_count,
            parameter_groups_count,
            variables_count).into());*/

        let texture_references = Self::parse_texture_references(data, texture_offset as usize, texture_count as usize);
        let parameter_groups = Self::parse_parameter_groups(data, parameter_groups_offset as usize, parameter_groups_count as usize);
        let variables = Self::parse_variables(data, variables_offset as usize, variables_count as usize);

        Material { name, texture_references, parameter_groups, variables }
    }

    fn parse_texture_references(data: &[u8], offset: usize, count: usize) -> Vec<TextureReference> {
        let mut texture_refs = Vec::with_capacity(count);
        for i in 0..count {
            texture_refs.push(Self::parse_texture_reference(data, offset + i * WMB_TEXTURE_REFERENCE_SIZE));
        }
        texture_refs
    }

    fn parse_texture_reference(data: &[u8], offset: usize) -> TextureReference {
        let mut offs = offset;
        let name_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let texture_ref = util::get_uint32_le(data, offs);
        let name = util::get_string(data, name_offset as usize, constants::MAX_STR_SIZE).unwrap();
        TextureReference { name, texture: texture_ref }
    }

    fn parse_parameter_groups(data: &[u8], offset: usize, count: usize) -> Vec<MaterialParameterGroup> {
        let mut groups = Vec::with_capacity(count);
        for i in 0..count {
            groups.push(Self::parse_parameter_group(data, offset + i * WMB_PARAMETER_GROUP_SIZE));
        }
        groups
    }

    fn parse_parameter_group(data: &[u8], offset: usize) -> MaterialParameterGroup {
        let mut offs = offset;
        let index = util::get_int32_le(data, offs);
        offs += size_of::<i32>();
        let parameter_array_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let parameter_count = util::get_uint32_le(data, offs);
        //offs += size_of::<u32>();

        let mut parameters = Vec::with_capacity(parameter_count as usize);
        for i in 0..parameter_count as usize {
            parameters.push(util::get_float32_le(data, parameter_array_offset as usize + i * size_of::<f32>()));
        }
        //console::log_1(&format!(" --- Found parameter group containing {} parameters", parameter_count).into());
        MaterialParameterGroup { index, parameters }
    }

    fn parse_variables(data: &[u8], offset: usize, count: usize) -> Vec<MaterialVariable> {
        //console::log_1(&format!(" --- Reading {} variables at offset '{}'", count, offset).into());
        let mut variables = Vec::with_capacity(count);
        for i in 0..count {
            variables.push(Self::parse_variable(data, offset + i * WMB_VARIABLE_SIZE));
        }
        variables
    }

    fn parse_variable(data: &[u8], offset: usize) -> MaterialVariable {
        let mut offs = offset;
        let name_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let value = util::get_float32_le(data, offs);

        let name = util::get_string(data, name_offset as usize, constants::MAX_STR_SIZE).unwrap();
        //console::log_1(&format!(" --- Found variable with name '{}', value {}", name, value).into());
        MaterialVariable { name, value }
    }

    fn parse_world_data(data: &[u8], offset: usize, count: usize) -> Vec<WorldDataEntry> {
        if offset == 0 {
            return vec![];
        }
        let mut world_data = Vec::with_capacity(count);
        for i in 0..count {
            let world_data_entry: WorldDataEntry = [
                util::get_float32_le(data, offset + i * size_of::<WorldDataEntry>()),
                util::get_float32_le(data, offset + i * size_of::<WorldDataEntry>() + size_of::<f32>()),
                util::get_float32_le(data, offset + i * size_of::<WorldDataEntry>() + 2 * size_of::<f32>()),
                util::get_float32_le(data, offset + i * size_of::<WorldDataEntry>() + 3 * size_of::<f32>()),
                util::get_float32_le(data, offset + i * size_of::<WorldDataEntry>() + 4 * size_of::<f32>()),
                util::get_float32_le(data, offset + i * size_of::<WorldDataEntry>() + 5 * size_of::<f32>())
            ];
            world_data.push(world_data_entry);
        }
        world_data
    }
}