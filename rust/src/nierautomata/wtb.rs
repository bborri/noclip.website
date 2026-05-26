use crate::{nierautomata::constants, util};
use wasm_bindgen::prelude::*;

#[derive(Debug, Clone)]
#[wasm_bindgen(js_name = "NierTexture")]
pub struct Texture {
    pub offset: usize,
    pub size: usize,
    pub index: usize,
    pub flags: u32
}

#[derive(Debug, Clone)]
#[wasm_bindgen(js_name = "NierTextures", getter_with_clone)]
pub struct WtbFile {
    pub block_offset: usize,
    pub textures: Vec<Texture>
}

#[wasm_bindgen(js_class = "NierTextures")]
impl WtbFile {
    pub fn new(data: &[u8], block_offset: usize) -> Self {
        let mut offs = 0;

        let magic = util::get_uint32_be(data, offs);
        assert_eq!(magic, constants::WTB_MAGIC); // "WTB\0"
        offs += 2 * size_of::<u32>(); // skip 1 unknown uint32 value

        let texture_count = util::get_uint32_le(data, offs) as usize;
        offs += size_of::<u32>();
        let texture_array_offset = util::get_uint32_le(data, offs) as usize;
        offs += size_of::<u32>();
        let texture_size_array_offset = util::get_uint32_le(data, offs) as usize;
        offs += size_of::<u32>();
        let texture_flag_array_offset = util::get_uint32_le(data, offs) as usize;
        offs += size_of::<u32>();
        let texture_id_array_offset = util::get_uint32_le(data, offs) as usize;
        // offs += size_of::<u32>();
        // let texture_info_array_offset = util::get_uint32_le(data, offs) as usize;
        // offs += size_of::<u32>();

        let texture_offsets = util::get_uint32_le_array(data, texture_array_offset, texture_count).unwrap();
        let texture_sizes = util::get_uint32_le_array(data, texture_size_array_offset, texture_count).unwrap();
        let texture_flags = util::get_uint32_le_array(data, texture_flag_array_offset, texture_count).unwrap();
        let texture_ids = util::get_uint32_le_array(data, texture_id_array_offset, texture_count).unwrap();

        Self { block_offset, textures: Self::parse_textures(texture_count, texture_offsets, texture_sizes, texture_flags, texture_ids) }
    }

    fn parse_textures(texture_count: usize, offsets: Vec<u32>, sizes: Vec<u32>, flags: Vec<u32>, ids: Vec<u32>) -> Vec<Texture> {
        let mut textures = Vec::with_capacity(texture_count);

        for i in 0..texture_count {
            textures.push(Texture {
                offset: offsets[i] as usize,
                size: sizes[i] as usize,
                flags: flags[i],
                index: ids[i] as usize
            });
        }
        textures
    }
}
