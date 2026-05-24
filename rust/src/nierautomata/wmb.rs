// WMB parser
// Contains World Mesh data

use crate::{geometry::AABB, nierautomata::constants, util::{self}};

use float16::f16;
use nalgebra_glm::{TVec2, TVec3, Vec3, TVec4, make_vec2, make_vec3, make_vec4};
use wasm_bindgen::prelude::*;
use web_sys::console;

const WMB3_MESH_SIZE: usize = 7 * size_of::<u32>();
const WMB3_AABB_SIZE: usize = 6 * size_of::<f32>();
const WMB_VERTEX_GROUP_SIZE: usize = 12 * size_of::<u32>();
const WMB_LOD_SIZE: usize = 5 * size_of::<u32>();


#[derive(Debug)]
#[wasm_bindgen(js_name = "NierLoD")]
pub struct LoD {
    name: String,
    level: i32,
    grouped_meshes: Vec<GroupedMesh>
}

#[derive(Debug)]
#[wasm_bindgen(js_name = "NierGroupedMesh")]
pub struct GroupedMesh {

}

#[derive(Debug, Copy, Clone)]
#[wasm_bindgen(js_name = "NierMesh")]
pub struct MeshReference {
    vertex_group_index: u32,
    vertex_offset: u32,
    face_offset: u32,
    vertex_count: u32,
    face_count: u32
}

#[derive(Debug, Clone)]
#[wasm_bindgen(js_name = "NierVertexGroup", getter_with_clone)]
pub struct VertexGroup {
    pub positions: Vec<f32>, // 3 by 3, XYZ
    pub normals: Vec<f32>, // 3 by 3, XYZ
    pub colors: Vec<f32>, // 4 by 4, RGBA
    pub tex_coords: Vec<f32>, // 2 by 2, UV
    pub indices: Vec<u32> // No index repetition, probably triangle strips?
}

#[derive(Debug, Copy, Clone)]
#[wasm_bindgen(js_name = "NierVertex")]
pub struct Vertex {
    //pub pos: Vec3,
    pub pos_x: f32,
    pub pos_y: f32,
    pub pos_z: f32,
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
    vertex_groups: Vec<VertexGroup>,
    bounding_box: AABB,
    meshes: Vec<MeshReference>
}

#[wasm_bindgen(js_class = "NierWorldMesh")]
impl WmbFile {
    /*
    	self.magicNumber = wmb_fp.read(4)										# ID
		if self.magicNumber == b'WMB3':
			self.version = "%08x" % (read_uint32(wmb_fp))					# Version
			self.unknown08 = read_uint32(wmb_fp)								# UnknownA
			self.flags = read_uint32(wmb_fp)									# flags & referenceBone
			self.bounding_box1 = read_float(wmb_fp)						# bounding_box
			self.bounding_box2 = read_float(wmb_fp)
			self.bounding_box3 = read_float(wmb_fp)
			self.bounding_box4 = read_float(wmb_fp)
			self.bounding_box5 = read_float(wmb_fp)
			self.bounding_box6 = read_float(wmb_fp)
			self.boneArrayOffset = read_uint32(wmb_fp)						# offsetBones
			self.boneCount = read_uint32(wmb_fp)								# numBones
			self.offsetBoneIndexTranslateTable = read_uint32(wmb_fp)			# offsetBoneIndexTranslateTable		
			self.boneIndexTranslateTableSize = read_uint32(wmb_fp) 			# boneIndexTranslateTableSize
			self.vertexGroupArrayOffset = read_uint32(wmb_fp)				# offsetVertexGroups
			self.vertexGroupCount = read_uint32(wmb_fp)						# numVertexGroups
			self.meshArrayOffset = read_uint32(wmb_fp)						# offsetBatches
			self.meshCount = read_uint32(wmb_fp)								# numBatches
			self.meshGroupInfoArrayHeaderOffset = read_uint32(wmb_fp)		# offsetLODS
			self.meshGroupInfoArrayCount = read_uint32(wmb_fp)				# numLODS
			self.colTreeNodesOffset = read_uint32(wmb_fp)					# offsetColTreeNodes
			self.colTreeNodesCount = read_uint32(wmb_fp)						# numColTreeNodes
			self.boneMapOffset = read_uint32(wmb_fp)							# offsetBoneMap
			self.boneMapCount = read_uint32(wmb_fp)							# numBoneMap
			self.bonesetOffset = read_uint32(wmb_fp)							# offsetBoneSets
			self.bonesetCount = read_uint32(wmb_fp)							# numBoneSets
			self.materialArrayOffset = read_uint32(wmb_fp)					# offsetMaterials
			self.materialCount = read_uint32(wmb_fp)							# numMaterials
			self.meshGroupOffset = read_uint32(wmb_fp)						# offsetMeshes
			self.meshGroupCount = read_uint32(wmb_fp)						# numMeshes
			self.offsetMeshMaterials = read_uint32(wmb_fp)					# offsetMeshMaterials
			self.numMeshMaterials = read_uint32(wmb_fp)						# numMeshMaterials
			self.unknownWorldDataArrayOffset = read_uint32(wmb_fp)			# offsetUnknown0				World Model Stuff
			self.unknownWorldDataArrayCount = read_uint32(wmb_fp)			# numUnknown0					World Model Stuff
			self.unknown8C = read_uint32(wmb_fp)
     */
    pub fn new(data: &[u8], offs: usize) -> Self {
        let mut offset: usize = offs;
        let magic = util::get_uint32_be(data, offset);
        assert_eq!(magic, constants::WMB_MAGIC); // "WMB3"
        offset += 12; // skip version and 1 unknown 32-bit value

        console::log_1(&format!("Parsing WMB3 file!").into());

        let flags = util::get_uint32_le(data, offset);
        offset += 4;

        // Bounding box
        let aabb = Self::parse_aabb(data, offset);
        offset += WMB3_AABB_SIZE;

        offset += 4 * size_of::<u32>(); // skip all bone-related stuff

        let vertex_group_offset = util::get_uint32_le(data, offset);
        offset += size_of::<u32>();
        let vertex_group_count = util::get_uint32_le(data, offset);
        offset += size_of::<u32>();

        let mesh_array_offset = util::get_uint32_le(data, offset);
        offset += size_of::<u32>();
        let mesh_count = util::get_uint32_le(data, offset);
        offset += size_of::<u32>();

        let lod_array_offset = util::get_uint32_le(data, offset);
        offset += size_of::<u32>();
        let lod_count = util::get_uint32_le(data, offset);
        offset += size_of::<u32>();

        offset += 6 * size_of::<u32>(); // skip collisions and bone maps / sets

        let material_array_offset = util::get_uint32_le(data, offset);
        offset += size_of::<u32>();
        let material_count = util::get_uint32_le(data, offset);
        offset += size_of::<u32>();

        console::log_1(&format!(" - Found {} vertex groups, {} meshes", vertex_group_count, mesh_count).into());

        let vertex_groups = Self::parse_vertex_groups(data, offs, offs + vertex_group_offset as usize, vertex_group_count as usize);
        let lods = Self::parse_lods(data, offs + lod_array_offset as usize, lod_count as usize);
        let meshes = Self::parse_meshes(data, offs + mesh_array_offset as usize, mesh_count as usize);

        Self {
            vertex_groups,
            bounding_box: aabb,
            meshes
        }
    }

    pub fn vertex_group(&self, group_index: usize) -> VertexGroup {
        self.vertex_groups[group_index].clone()
    }

    fn parse_aabb(data: &[u8], offset: usize) -> AABB {
        let x_min = util::get_float32_le(data, offset);
        let y_min = util::get_float32_le(data, offset + 4);
        let z_min = util::get_float32_le(data, offset + 8);
        let x_max = util::get_float32_le(data, offset + 12);
        let y_max = util::get_float32_le(data, offset + 16);
        let z_max = util::get_float32_le(data, offset + 20);
        console::log_1(&format!(
                " - AABB: ({},{},{}), ({},{},{})",
                x_min, y_min, z_min,
                x_max, y_max, z_max
            )
            .into());
        AABB::from_f32(x_min, y_min, z_min, x_max, y_max, z_max)
    }

    fn parse_meshes(data: &[u8], offset: usize, mesh_count: usize) -> Vec<MeshReference> {
        let mut meshes = Vec::with_capacity(mesh_count);
        for (i, _) in [0..mesh_count].iter().enumerate() {
            meshes.push(Self::parse_mesh(data, offset + i * WMB3_MESH_SIZE));
        }
        meshes
    }

    fn parse_mesh(data: &[u8], offset: usize) -> MeshReference {
        let mut offs = offset;
        let vertex_group_index = util::get_uint32_le(data, offs);
        offs += 2 * size_of::<u32>(); // skip bone set index
		let vertex_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
		let face_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
		let vertex_count = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
		let face_count = util::get_uint32_le(data, offs);
        MeshReference {
            vertex_group_index, vertex_offset, face_offset,
            vertex_count, face_count
        }
    }

    fn parse_vertex_groups(data: &[u8], start_offset: usize, offset: usize, count: usize) -> Vec<VertexGroup> {
        let mut offs = offset;
        let mut vertex_groups = Vec::with_capacity(count);
        for _ in [0..count] {
            vertex_groups.push(Self::parse_vertex_group(data, start_offset, offs));
            offs += WMB_VERTEX_GROUP_SIZE;
        }
        vertex_groups
    }

    fn parse_vertex_group(data: &[u8], start_offset: usize, offset: usize) -> VertexGroup {
        console::log_1(&format!("Parsing vertex group at offset {}", offset).into());
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
        let vertex_offs = start_offset + vertex_array_offset as usize;
        let exdata_offs = start_offset + vertex_exdata_array_offset as usize;
        let mut positions = Vec::with_capacity(vertex_count as usize * 3);
        let mut tangents = Vec::with_capacity(vertex_count as usize);
        let mut normals = Vec::with_capacity(vertex_count as usize);
        let mut colors = Vec::with_capacity(vertex_count as usize * 4);
        let mut tex_coords = Vec::with_capacity(vertex_count as usize * 2);
        console::log_1(&format!(" --- Parsing {} vertices at offset {}", vertex_count, vertex_offs).into());
        for i in 0..vertex_count {
//            console::log_1(&format!(" --- Parsing vertex {} at offset {}", i, offs).into());
            let vertex = Self::parse_vertex(
                data,
                vertex_offs + (i * vertex_stride) as usize,
                exdata_offs + (i * vertex_exdata_stride) as usize,
                vertex_flags);
            positions.push(vertex.pos_x);
            positions.push(vertex.pos_y);
            positions.push(vertex.pos_z);
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
        let index_offs = start_offset + index_array_offset as usize;
        let mut indices = Vec::with_capacity(index_count as usize);
        console::log_1(&format!(" --- Parsing {} indices at offset {}", index_count, index_offs).into());
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
            //offs += 4;
        }

        let mut vertex = Vertex {
            //pos: make_vec3(&[ pos_x, pos_y, pos_z ]),
            pos_x, pos_y, pos_z,
            normal: normal_opt.unwrap_or(make_vec3::<f16>(&[f16::default(), f16::default(), f16::default()])),
            tangent: make_vec3(&[ tangent_x, tangent_y, tangent_z ]),
            color: color,
            tex_coord: uv,
            tex_coord2: uv2,
            tex_coord3: None,
            tex_coord4: None,
            tex_coord5: None,
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

    fn parse_lods(data: &[u8], offset: usize, count: usize) -> Vec<LoD> {
        let mut lods = Vec::with_capacity(count);

        for i in 1..count {
            lods.push(Self::parse_lod(data, offset + i * WMB_LOD_SIZE));
        }
        lods
    }

    fn parse_lod(data: &[u8], offset: usize) -> LoD {
        console::log_1(&format!("Parsing LoD at offset {}", offset).into());
        let mut offs= offset;

        let name_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        // Some implementations only copy from unsigned then replace MAX_UINT32 with -1.
        // This way seems cleaner.
        let lod_level: i32 = util::get_int32_le(data, offs);
        offs += size_of::<i32>();
        let batch_start = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let batch_infos_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let batch_infos_count = util::get_uint32_le(data, offs);

        let name = util::get_string(data, name_offset as usize, 256).unwrap();
        
        let grouped_meshes = vec!();
        LoD { name, level: lod_level, grouped_meshes }
    }
    
}