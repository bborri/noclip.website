pub const MAX_STR_SIZE: usize = 256;
// Raw XYZ are extremely small
pub const WORLD_SCALE: f32 = 1.0;

// DAT and DTT files start with the same magic number
pub const DAT_MAGIC: u32 = 0x44415400; // "DAT\0"
pub const WMB_MAGIC: u32 = 0x574D4233; // "WMB3"
pub const WTB_MAGIC: u32 = 0x57544200; // "WTB\0"
pub const DDS_MAGIC: u32 = 0x44445320; // "DDS "
