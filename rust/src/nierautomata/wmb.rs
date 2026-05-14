// WMB parser
// Contains World Mesh data

use std::io;

use crate::{geometry::AABB, nierautomata, nierautomata::constants, util};

use nalgebra_glm::{TVec3, Vec3};
use wasm_bindgen::prelude::*;
use web_sys::console;

type Tri = TVec3<usize>;

const WMB3_MESH_SIZE: usize = 7 * size_of::<u32>();
const WMB3_AABB_SIZE: usize = 6 * size_of::<f32>();
const WMB_VERTEX_GROUP_SIZE: usize = 12 * size_of::<u32>();


#[derive(Debug)]
#[wasm_bindgen(js_name = "NierMesh")]
pub struct MeshReference {
    vertex_group_index: u32,
    vertex_offset: u32,
    face_offset: u32,
    vertex_count: u32,
    face_count: u32
}

#[derive(Debug)]
#[wasm_bindgen(js_name = "NierVertexGroup")]
pub struct VertexGroup {
    
}

#[derive(Debug)]
#[wasm_bindgen(js_name = "NierWorldMesh")]
pub struct WmbFile {
    bounding_box: AABB,
    meshes: Vec<MeshReference>
}

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
    pub fn new(data: &Vec<u8>, offs: usize) -> io::Result<Self> {
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

        console::log_1(&format!(" - Found {} vertex groups, {} meshes", vertex_group_count, mesh_count).into());

        let vertex_groups = Self::parse_vertex_groups(data, vertex_group_offset as usize, vertex_group_count as usize);
        let meshes = Self::parse_meshes(data, mesh_array_offset as usize, mesh_count as usize);

        Ok(Self {
            bounding_box: aabb,
            meshes
        })
    }

    fn parse_aabb(data: &Vec<u8>, offset: usize) -> AABB {
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

    // fn parse_vertex_groups(data: &Vec<u8>, offset: usize, mesh_count: usize) -> Vec<Mesh> {
    // }

    fn parse_meshes(data: &Vec<u8>, offset: usize, mesh_count: usize) -> Vec<MeshReference> {
        let mut meshes = Vec::with_capacity(mesh_count);
        for (i, _) in [0..mesh_count].iter().enumerate() {
            meshes.push(Self::parse_mesh(data, offset + i * WMB3_MESH_SIZE));
        }
        meshes
    }

    fn parse_mesh(data: &Vec<u8>, offset: usize) -> MeshReference {
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

    fn parse_vertex_groups(data: &Vec<u8>, offset: usize, count: usize) -> Vec<VertexGroup> {
        let mut offs = offset;
        let mut vertex_groups = Vec::with_capacity(count);
        for _ in [0..count] {
            vertex_groups.push(Self::parse_vertex_group(data, offs));
            offs += WMB_VERTEX_GROUP_SIZE;
        }
        vertex_groups
    }

    fn parse_vertex_group(data: &Vec<u8>, offset: usize) -> VertexGroup {
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
        let face_array_offset = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();
        let face_count = util::get_uint32_le(data, offs);
        offs += size_of::<u32>();

        // Data
        

        VertexGroup {}
    }

    /*
    fn parse_vertices(data: &Vec<u8>, offset: usize, count: usize) -> Vec<Vec3> {
        let vertices = Vec::with_capacity(count);
        vertices
    }

    fn parse_faces(data: &Vec<u8>, offset: usize, count: usize) -> Vec<Tri> {
        let faces = Vec::with_capacity(count);
        faces
    }
*/
}