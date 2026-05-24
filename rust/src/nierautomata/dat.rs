// DAT/DTT parser
// Contains models and textures in sub-files

use std::io;
use std::convert::TryInto;

use crate::{nierautomata::constants, nierautomata::wmb::WmbFile, util};

use wasm_bindgen::prelude::*;
use web_sys::console;

#[derive(Debug)]
pub struct DatHeader {
    pub num_files: usize,
    pub file_table_offset: usize,
    pub extension_table_offset: usize,
    pub name_table_offset: usize,
    pub size_table_offset: usize,
    pub hash_map_offset: usize,
}

#[derive(Debug)]
pub struct DatEntry {
    pub index: usize,
    pub offset: u32,
    pub size_in_bytes: u32,
    pub magic: u32,
    pub name: String
}

#[derive(Debug)]
#[wasm_bindgen(js_name = "NierDatArchive")]
pub struct DatArchive {
    header: DatHeader,

    entries: Vec<DatEntry>,
    models: Vec<WmbFile>
}

impl DatArchive {
    pub fn new(data: &Vec<u8>) -> io::Result<Self> {
        // Parse header
        let mut offset: usize = 0;

        // Magic number
        let magic = util::get_uint32_be(data, offset);
        assert_eq!(magic, constants::DAT_MAGIC);
        offset += 4;

        let num_files = util::get_uint32_le(data, offset) as usize;
        offset += 4;
        console::log_1(&format!("Parsing DAT file: {} files found!", num_files).into());

        let file_table_offset = util::get_uint32_le(data, offset) as usize;
        offset += 4;
        let extension_table_offset = util::get_uint32_le(data, offset) as usize;
        offset += 4;
        let name_table_offset = util::get_uint32_le(data, offset) as usize;
        offset += 4;
        let size_table_offset = util::get_uint32_le(data, offset) as usize;
        offset += 4;
        let hash_map_offset = util::get_uint32_le(data, offset) as usize;

        // Read file offsets
        let file_offsets = read_u32_table_le(
            &data,
            file_table_offset,
            num_files,
        )?;
        // Read file sizes
        let file_sizes = read_u32_table_le(
            &data,
            size_table_offset as usize,
            num_files,
        )?;
        // Read file names
        let max_file_name_size = util::get_uint32_le(data, name_table_offset as usize);
        let mut file_names = Vec::with_capacity(num_files);
        let mut offset = name_table_offset + 4;
        for _ in 0..num_files {
            file_names.push(util::get_string(data, offset, max_file_name_size as usize)?);
            offset += max_file_name_size as usize;
        }

        assert!(file_offsets.len() == num_files);
        assert!(file_sizes.len() == num_files);
        assert!(file_names.len() == num_files);

        let mut entries = Vec::with_capacity(num_files);
        let mut models = Vec::with_capacity(num_files);
        for i in 0..num_files {
            let file_offset = file_offsets[i];
            let file_magic = util::get_uint32_be(data, file_offset as usize);
            let entry = DatEntry {
                index: i,
                offset: file_offset,
                size_in_bytes: file_sizes[i],
                magic: file_magic,
                name: file_names[i].clone()
            };
            if entry.magic == constants::WMB_MAGIC {
                models.push(WmbFile::new(data, file_offset as usize));
            }
            entries.push(entry);
            console::log_1(&format!(" - File {}: \"{}\", type: {}, offset: {}, size: {} bytes",
                i,
                file_names[i],
                uint_to_magic(file_magic),
                file_offsets[i],
                file_sizes[i]).into());
        }

        Ok(Self {
            header: DatHeader {
                num_files,
                file_table_offset,
                extension_table_offset,
                name_table_offset,
                size_table_offset,
                hash_map_offset
            },
            entries,
            models
        })
    }

    pub fn len(&self) -> usize {
        self.models.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

}

#[derive(Debug)]
#[wasm_bindgen(js_name = "NierDatFile")]
pub struct DatFile {
    inner: DatArchive
}

#[wasm_bindgen(js_class = "NierDatFile")]
impl DatFile {
    #[wasm_bindgen(constructor)]
    pub fn new(data: Vec<u8>) -> Result<DatFile, JsValue> {
        let archive = DatArchive::new(&data)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(DatFile { inner: archive })
    }

    pub fn len(&self) -> usize {
        self.inner.len()
    }

    pub fn models(&self) -> Vec<WmbFile> {
        self.inner.models.to_vec()
    }

    pub fn model(&self, index: usize) -> WmbFile {
        self.inner.models[index].clone()
    }
}

// =======================
// Helpers
// =======================

// Little-endian
fn read_u32_table_le(
    data: &Vec<u8>,
    offset: usize,
    count: usize,
) -> io::Result<Vec<u32>> {
    let mut result = Vec::with_capacity(count);
    let end = offset + count * 4;

    if end > data.len() {
        return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "Not enough data!"));
    }

    let slice = &data[offset..end];
    for chunk in slice.chunks_exact(4) {
        let buf: [u8; 4] = chunk.try_into().unwrap();
        result.push(u32::from_le_bytes(buf));
    }

    Ok(result)
}

fn uint_to_magic(
    nb: u32
) -> String {
    String::from_utf8_lossy(&[
        (nb >> 24) as u8,
        ((nb >> 16) & 0xFF) as u8,
        ((nb >> 8) & 0xFF) as u8,
        (nb & 0xFF) as u8 ]).to_string()
}