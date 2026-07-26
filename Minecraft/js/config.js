// =============================================================================
// config.js - Single source of truth for the whole game.
// Every other module imports constants, block definitions and helpers from here
// so there is exactly one definition of the world's data formats.
// =============================================================================

// ---- World dimensions -------------------------------------------------------
export const CHUNK_SIZE = 16;      // blocks per chunk along X and Z
export const CHUNK_HEIGHT = 128;   // total world height in blocks (Y: 0..127)
// The nether remains a 64-tall experience inside the 128-tall data volume: its
// bedrock roof sits at NETHER_HEIGHT-1 and everything above stays AIR.
export const NETHER_HEIGHT = 64;
export const RENDER_DISTANCE = 6;  // chunk radius loaded around the player
export const WORLD_SEED = 1337;

// ---- Terrain generation parameters -----------------------------------------
export const BASE_HEIGHT = 22;     // average ground height
export const HEIGHT_AMP = 14;      // +/- variation added by noise
export const DIRT_DEPTH = 4;       // dirt/subsurface layer thickness under the surface
export const SEA_LEVEL = 20;       // empty space at/below this Y is flooded with water
export const SAND_LEVEL = 21;      // surfaces at/below this height are sand (beaches + seabed)

// ---- Block IDs (stored as uint16 in chunk data; ids must stay < 4096) -------
export const BLOCK = {
  AIR:     0,
  GRASS:   1,
  DIRT:    2,
  STONE:   3,
  SAND:    4,
  WOOD:    5,
  LEAVES:  6,
  BEDROCK: 7,
  WATER:   8,
  SNOW:    9,
  PLANK:   10,
  COAL_ORE: 11,
  IRON_ORE: 12,
  CRAFTING_TABLE: 13,
  FURNACE:  14,
  FURNACE_LIT: 15,
  GLASS:    16,
  GOLD_ORE: 17,
  REDSTONE_ORE: 18,
  IRON_BLOCK: 19,
  GOLD_BLOCK: 20,
  REDSTONE_BLOCK: 21,
  CACTUS: 22,
  DIAMOND_ORE: 23,
  DIAMOND_BLOCK: 24,
  TORCH: 25,
  DOOR_BOTTOM: 26,
  DOOR_TOP: 27,
  LADDER: 28,
  CHEST: 29,
  BED_HEAD: 30,
  BED_FOOT: 31,
  FLOWER_RED: 32,
  FLOWER_YELLOW: 33,
  TALL_GRASS: 34,
  ENCHANTING_TABLE: 35,
  COBBLESTONE: 36,
  MOSSY_STONE: 37,
  BRICK: 38,
  OBSIDIAN: 39,
  GLASS_PANE: 40,
  FENCE: 41,
  BOOKSHELF: 42,
  TNT: 43,
  STONE_BRICK: 44,
  GRAVEL: 45,
  CLAY: 46,
  REDSTONE_WIRE: 47,
  LEVER: 48,
  REDSTONE_TORCH: 49,
  DOOR_BOTTOM_OPEN: 50,
  DOOR_TOP_OPEN: 51,
  FARMLAND: 52,
  WHEAT_0: 53,
  WHEAT_1: 54,
  WHEAT_2: 55,
  WHEAT_3: 56,
  CARROT_0: 57,
  CARROT_1: 58,
  CARROT_2: 59,
  RAIL: 60,
  POWERED_RAIL: 61,
  POWERED_RAIL_ON: 62,
  PISTON: 63,
  PISTON_HEAD: 64,
  BUTTON: 65,
  PRESSURE_PLATE: 66,
  REPEATER: 67,
  REPEATER_ON: 68,
  REDSTONE_LAMP: 69,
  REDSTONE_LAMP_ON: 70,
  NETHERRACK: 71,
  SOUL_SAND: 72,
  GLOWSTONE: 73,
  NETHER_PORTAL: 74,
  NETHER_BRICK: 75,
  LAVA: 76,
  MOB_SPAWNER: 77,
  // ---- Phase 2: building-block breadth (78+) --------------------------------
  // Slabs: meta bit0 = top half. Stairs: meta bits0-1 = facing (0=+X, 1=+Z,
  // 2=-X, 3=-Z), bit2 = upside-down. One id per material variant.
  OAK_SLAB: 78,
  STONE_SLAB: 79,
  COBBLESTONE_SLAB: 80,
  BRICK_SLAB: 81,
  STONE_BRICK_SLAB: 82,
  SANDSTONE_SLAB: 83,
  BIRCH_SLAB: 84,
  SPRUCE_SLAB: 85,
  OAK_STAIRS: 86,
  COBBLESTONE_STAIRS: 87,
  BRICK_STAIRS: 88,
  STONE_BRICK_STAIRS: 89,
  SANDSTONE_STAIRS: 90,
  BIRCH_STAIRS: 91,
  SPRUCE_STAIRS: 92,
  BIRCH_WOOD: 93,
  BIRCH_PLANK: 94,
  BIRCH_LEAVES: 95,
  SPRUCE_WOOD: 96,
  SPRUCE_PLANK: 97,
  SPRUCE_LEAVES: 98,
  BIRCH_FENCE: 99,
  SPRUCE_FENCE: 100,
  SANDSTONE: 101,
  SUGAR_CANE: 102,
  // 16 wool colours as separate ids (vanilla order) so wool works everywhere
  // blocks are handled generically (no meta involved).
  WOOL_WHITE: 103,
  WOOL_ORANGE: 104,
  WOOL_MAGENTA: 105,
  WOOL_LIGHT_BLUE: 106,
  WOOL_YELLOW: 107,
  WOOL_LIME: 108,
  WOOL_PINK: 109,
  WOOL_GRAY: 110,
  WOOL_LIGHT_GRAY: 111,
  WOOL_CYAN: 112,
  WOOL_PURPLE: 113,
  WOOL_BLUE: 114,
  WOOL_BROWN: 115,
  WOOL_GREEN: 116,
  WOOL_RED: 117,
  WOOL_BLACK: 118,
  // ---- Phase 6: redstone completion (119+) ----------------------------------
  // (The plan reserved 230-259 for redstone; ids continue sequentially from 119
  // instead — the ranges were advisory and sequential keeps the space dense.)
  REDSTONE_TORCH_OFF: 119, // technical: a torch whose support block is powered
  STICKY_PISTON: 120,      // retraction pulls the block in front of the head
  OBSERVER: 121,           // pulses out its back when the watched cell changes
  DISPENSER: 122,          // 9-slot container; fires/ejects on a rising edge
  DROPPER: 123,            // 9-slot container; drops one item on a rising edge
  HOPPER: 124,             // 5-slot funnel; pulls drops/containers, pushes on
  NOTE_BLOCK: 125,         // right-click cycles pitch (meta 0..24), plays on power
  COMPARATOR: 126,         // analog: rear signal vs sides; reads container fill
  // ---- Phase 7: brewing + anvil (127+) ---------------------------------------
  BREWING_STAND: 127,      // cross-model stand (real 3D stand model is future polish)
  NETHER_WART_0: 128,      // crop stages, grows ONLY on soul sand
  NETHER_WART_1: 129,
  NETHER_WART_2: 130,
  ANVIL: 131,              // plain cube with an anvil-silhouette texture
  // ---- Phase 5: worldgen 2.0 ores (132+) --------------------------------------
  EMERALD_ORE: 132,        // mountains-only; future villager trade currency
  LAPIS_ORE: 133,          // deep ore; drops 4-8 lapis (future enchanting currency)
  // ---- Phase 8: villages & trading (134+) --------------------------------------
  EMERALD_BLOCK: 134,      // storage block: 9 emeralds <-> 1 block (shapeless)
};

// Wool blocks in vanilla colour order, plus the RGB used by the texture
// painter, minimap and particle colours (single source of truth).
export const WOOL_BLOCKS = [
  BLOCK.WOOL_WHITE, BLOCK.WOOL_ORANGE, BLOCK.WOOL_MAGENTA, BLOCK.WOOL_LIGHT_BLUE,
  BLOCK.WOOL_YELLOW, BLOCK.WOOL_LIME, BLOCK.WOOL_PINK, BLOCK.WOOL_GRAY,
  BLOCK.WOOL_LIGHT_GRAY, BLOCK.WOOL_CYAN, BLOCK.WOOL_PURPLE, BLOCK.WOOL_BLUE,
  BLOCK.WOOL_BROWN, BLOCK.WOOL_GREEN, BLOCK.WOOL_RED, BLOCK.WOOL_BLACK,
];
export const WOOL_RGB = {
  [BLOCK.WOOL_WHITE]: [233, 236, 236],
  [BLOCK.WOOL_ORANGE]: [240, 118, 19],
  [BLOCK.WOOL_MAGENTA]: [189, 68, 179],
  [BLOCK.WOOL_LIGHT_BLUE]: [58, 175, 217],
  [BLOCK.WOOL_YELLOW]: [248, 197, 39],
  [BLOCK.WOOL_LIME]: [112, 185, 25],
  [BLOCK.WOOL_PINK]: [237, 141, 172],
  [BLOCK.WOOL_GRAY]: [62, 68, 71],
  [BLOCK.WOOL_LIGHT_GRAY]: [142, 142, 134],
  [BLOCK.WOOL_CYAN]: [21, 137, 145],
  [BLOCK.WOOL_PURPLE]: [121, 42, 172],
  [BLOCK.WOOL_BLUE]: [53, 57, 157],
  [BLOCK.WOOL_BROWN]: [114, 71, 40],
  [BLOCK.WOOL_GREEN]: [84, 109, 27],
  [BLOCK.WOOL_RED]: [160, 39, 34],
  [BLOCK.WOOL_BLACK]: [20, 21, 25],
};

// ---- Texture atlas layout ---------------------------------------------------
// The atlas is ATLAS_COLS x ATLAS_ROWS tiles. A tile index is row-major:
//   index = row * ATLAS_COLS + col
export const TILE_PX = 16;   // pixel size of one tile when drawn to the atlas canvas
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 64;

// Tile indices into the atlas.
export const TILES = {
  GRASS_TOP:  0,
  GRASS_SIDE: 1,
  DIRT:       2,
  STONE:      3,
  SAND:       4,
  WOOD_TOP:   5,
  WOOD_SIDE:  6,
  LEAVES:     7,
  BEDROCK:    8,
  WATER:      9,
  SNOW:       10,
  PLANK:      11,
  APPLE:      12,  // item-only icon (not a placeable block)
  STICK:      13,  // item-only icon
  WOODEN_PICKAXE: 14,
  WOODEN_AXE:     15,
  WOODEN_SHOVEL:  16,
  COAL_ORE:       17,
  IRON_ORE:       18,
  COAL:           19,
  RAW_IRON:       20,
  STONE_PICKAXE:  21,
  STONE_AXE:      22,
  STONE_SHOVEL:   23,
  CRAFTING_TABLE_TOP: 24,
  CRAFTING_TABLE_SIDE: 25,
  WOODEN_SWORD:   26,
  STONE_SWORD:    27,
  // --- row 7 (28..31) ---
  FURNACE_FRONT:  28,
  FURNACE_FRONT_LIT: 29,
  FURNACE_SIDE:   30,
  FURNACE_TOP:    31,
  // --- row 8 (32..35) ---
  GLASS:          32,
  GOLD_ORE:       33,
  REDSTONE_ORE:   34,
  IRON_INGOT:     35,
  // --- row 9 (36..39) ---
  GOLD_INGOT:     36,
  REDSTONE:       37,
  RAW_PORK:       38,
  COOKED_PORK:    39,
  // --- row 10 (40..43) ---
  RAW_BEEF:       40,
  COOKED_BEEF:    41,
  LEATHER:        42,
  WOOL:           43,
  // --- row 11 (44..47) ---
  LEATHER_HELMET: 44,
  LEATHER_CHEST:  45,
  IRON_HELMET:    46,
  IRON_CHEST:     47,
  // --- row 12 (48..51) ---
  IRON_PICKAXE:   48,
  IRON_AXE:       49,
  IRON_SHOVEL:    50,
  IRON_SWORD:     51,
  // --- row 13 (52..55) ---
  LEATHER_LEGS:   52,
  LEATHER_BOOTS:  53,
  IRON_LEGS:      54,
  IRON_BOOTS:     55,
  // --- row 14 (56..59) ---
  IRON_BLOCK:     56,
  GOLD_BLOCK:     57,
  REDSTONE_BLOCK: 58,
  CACTUS:         59,
  // --- row 15 (60..63) ---
  TORCH:          60,
  DOOR_TOP:       61,
  DOOR_BOTTOM:    62,
  LADDER:         63,
  // --- row 16 (64..67) ---
  CHEST_FRONT:    64,
  CHEST_SIDE:     65,
  CHEST_TOP:      66,
  BED_TOP:        67,
  // --- row 17 (68..71) ---
  BED_SIDE:       68,
  FLOWER_RED:     69,
  FLOWER_YELLOW:  70,
  TALL_GRASS:     71,
  // --- row 18 (72..75) ---
  DIAMOND_ORE:    72,
  DIAMOND_BLOCK:  73,
  DIAMOND:        74,
  DIAMOND_PICKAXE: 75,
  // --- row 19 (76..79) ---
  DIAMOND_AXE:    76,
  DIAMOND_SHOVEL: 77,
  DIAMOND_SWORD:  78,
  DIAMOND_HELMET: 79,
  // --- row 20 (80..83) ---
  DIAMOND_CHEST:  80,
  DIAMOND_LEGS:   81,
  DIAMOND_BOOTS:  82,
  BONE:           83,
  // --- row 21 (84..87) ---
  ARROW:          84,
  STRING:         85,
  GUNPOWDER:      86,
  RAW_CHICKEN:    87,
  // --- row 22 (88..91) ---
  COOKED_CHICKEN: 88,
  FEATHER:        89,
  DOOR_ITEM:      90,
  BED_ITEM:       91,
  // --- row 23 (92..95) ---
  TORCH_ITEM:     92,
  LADDER_ITEM:    93,
  CHEST_ITEM:     94,
  ENCHANT_TOP:    95,
  // --- row 24 (96..99) ---
  COBBLESTONE:    96,
  MOSSY_STONE:    97,
  BRICK:          98,
  OBSIDIAN:       99,
  // --- row 25 (100..103) ---
  GLASS_PANE:     100,
  FENCE:          101,
  BOOKSHELF:      102,
  TNT_SIDE:       103,
  // --- row 26 (104..107) ---
  TNT_TOP:        104,
  STONE_BRICK:    105,
  GRAVEL:         106,
  CLAY:           107,
  // --- row 27 (108..111) ---
  REDSTONE_WIRE:  108,
  LEVER:          109,
  REDSTONE_TORCH: 110,
  BOW:            111,
  // --- row 28 (112..115) ---
  FARMLAND:       112,
  WHEAT_STAGE_0:  113,
  WHEAT_STAGE_1:  114,
  WHEAT_STAGE_2:  115,
  // --- row 29 (116..119) ---
  WHEAT_STAGE_3:  116,
  SEEDS:          117,
  WHEAT_ITEM:     118,
  BREAD:          119,
  // --- row 30 (120..123) ---
  WOODEN_HOE:     120,
  STONE_HOE:      121,
  IRON_HOE:       122,
  BONE_MEAL:      123,
  // --- row 31 (124..127) ---
  CARROT_STAGE_0: 124,
  CARROT_STAGE_1: 125,
  CARROT_STAGE_2: 126,
  CARROT:         127,
  // --- row 32 (128..131) ---
  RAIL_STRAIGHT:  128,
  RAIL_CURVE:     129,
  POWERED_RAIL:   130,
  POWERED_RAIL_ON: 131,
  // --- row 33 (132..135) ---
  PISTON_SIDE:    132,
  PISTON_FACE:    133,
  PISTON_BACK:    134,
  BUTTON:         135,
  // --- row 34 (136..139) ---
  PRESSURE_PLATE: 136,
  REPEATER:       137,
  REPEATER_ON:    138,
  REDSTONE_LAMP:  139,
  // --- row 35 (140..143) ---
  REDSTONE_LAMP_ON: 140,
  NETHERRACK:     141,
  SOUL_SAND:      142,
  GLOWSTONE:      143,
  // --- row 36 (144..147) ---
  NETHER_PORTAL:  144,
  NETHER_BRICK:   145,
  LAVA:           146,
  MOB_SPAWNER:    147,
  // --- row 37 (148..151) ---
  FLINT_AND_STEEL: 148,
  MINECART_ITEM:  149,
  ENDER_PEARL:    150,
  SPIDER_EYE:     151,
  // --- row 38 (152..155) ---
  GLOWSTONE_DUST: 152,
  NETHER_STAR:    153,
  BLAZE_ROD:      154,
  BOSS_SIGIL:     155,
  // --- row 39 (156..159) ---
  GOLDEN_APPLE:   156,
  BIRCH_WOOD_TOP: 157,
  BIRCH_WOOD_SIDE: 158,
  BIRCH_PLANK:    159,
  // --- row 40 (160..163) ---
  BIRCH_LEAVES:   160,
  SPRUCE_WOOD_TOP: 161,
  SPRUCE_WOOD_SIDE: 162,
  SPRUCE_PLANK:   163,
  // --- row 41 (164..167) ---
  SPRUCE_LEAVES:  164,
  SANDSTONE_TOP:  165,
  SANDSTONE_SIDE: 166,
  SUGAR_CANE:     167,
  // --- row 42 (168..171) ---
  SUGAR:          168,
  // 16 wool tiles in vanilla colour order (168+1 .. 184)
  WOOL_WHITE:     169,
  WOOL_ORANGE:    170,
  WOOL_MAGENTA:   171,
  // --- row 43 (172..175) ---
  WOOL_LIGHT_BLUE: 172,
  WOOL_YELLOW:    173,
  WOOL_LIME:      174,
  WOOL_PINK:      175,
  // --- row 44 (176..179) ---
  WOOL_GRAY:      176,
  WOOL_LIGHT_GRAY: 177,
  WOOL_CYAN:      178,
  WOOL_PURPLE:    179,
  // --- row 45 (180..183) ---
  WOOL_BLUE:      180,
  WOOL_BROWN:     181,
  WOOL_GREEN:     182,
  WOOL_RED:       183,
  // --- row 46 (184..187) ---
  WOOL_BLACK:     184,
  GOLDEN_PICKAXE: 185,
  GOLDEN_AXE:     186,
  GOLDEN_SHOVEL:  187,
  // --- row 47 (188..191) ---
  GOLDEN_SWORD:   188,
  GOLDEN_HOE:     189,
  GOLDEN_HELMET:  190,
  GOLDEN_CHEST:   191,
  // --- row 48 (192..195) ---
  GOLDEN_LEGS:    192,
  GOLDEN_BOOTS:   193,
  GOLDEN_CARROT:  194,
  RED_DYE:        195,
  // --- row 49 (196..199) ---
  YELLOW_DYE:     196,
  GREEN_DYE:      197,
  ORANGE_DYE:     198,
  LIME_DYE:       199,
  // --- row 50 (200..203) ---
  PINK_DYE:       200,
  // ---- Phase 3 (201+): buckets, boat, fishing --------------------------------
  BUCKET:         201,
  WATER_BUCKET:   202,
  LAVA_BUCKET:    203,
  // --- row 51 (204..207) ---
  BOAT:           204,
  FISHING_ROD:    205,
  RAW_FISH:       206,
  COOKED_FISH:    207,
  // ---- Phase 4 (208+): mob drops + saddle -------------------------------------
  // --- row 52 (208..211) ---
  GHAST_TEAR:     208,
  SLIMEBALL:      209,
  MAGMA_CREAM:    210,
  INK_SAC:        211,
  // --- row 53 (212..215) ---
  SADDLE:         212,
  // ---- Phase 6 (213+): redstone completion ------------------------------------
  REDSTONE_TORCH_OFF: 213,
  STICKY_PISTON_FACE: 214,
  OBSERVER_FACE:  215,
  // --- row 54 (216..219) ---
  OBSERVER_SIDE:  216,
  OBSERVER_BACK:  217,
  DISPENSER_FRONT: 218,
  DROPPER_FRONT:  219,
  // --- row 55 (220..223) ---
  HOPPER_SIDE:    220,
  HOPPER_TOP:     221,
  NOTE_BLOCK:     222,
  COMPARATOR:     223,
  // ---- Phase 7 (224+): brewing, potions, anvil, shield --------------------------
  // --- row 56 (224..227) ---
  BREWING_STAND:  224,
  NETHER_WART_STAGE_0: 225,
  NETHER_WART_STAGE_1: 226,
  NETHER_WART_STAGE_2: 227,
  // --- row 57 (228..231) ---
  ANVIL_TOP:      228,
  ANVIL_SIDE:     229,
  GLASS_BOTTLE:   230,
  NETHER_WART_ITEM: 231,
  // --- row 58 (232..235) ---
  BLAZE_POWDER:   232,
  FERMENTED_SPIDER_EYE: 233,
  // Potions: one parameterized bottle painter, liquid colour per type.
  POTION_WATER:   234,
  POTION_AWKWARD: 235,
  // --- row 59 (236..239) ---
  POTION_SPEED:   236,
  POTION_STRENGTH: 237,
  POTION_HEALING: 238,
  POTION_POISON:  239,
  // --- row 60 (240..243) ---
  POTION_REGEN:   240,
  POTION_FIRE_RES: 241,
  POTION_NIGHT_VISION: 242,
  POTION_WATER_BREATHING: 243,
  // --- row 61 (244..247) ---
  POTION_SLOWNESS: 244,
  POTION_WEAKNESS: 245,
  SHIELD:         246,
  // ---- Phase 5 (247+): worldgen 2.0 ores + currencies ----------------------------
  // --- row 62 (248..251) ---
  EMERALD_ORE:    247,
  LAPIS_ORE:      248,
  EMERALD:        249,
  LAPIS:          250,
  // ---- Phase 8 (251+): villages & trading -----------------------------------------
  EMERALD_BLOCK:  251,
};

// Non-block item IDs. Items and blocks share one numeric ID space so an
// inventory slot can hold either. Item IDs start at 1000, leaving 78-999 free
// for future block ids (saves from the old 100+ range are migrated by storage.js).
// Defined before BLOCKS because the ore block definitions reference ITEM.* in their `drops`.
export const ITEM = {
  APPLE: 1000,
  STICK: 1001,
  WOODEN_PICKAXE: 1002,
  WOODEN_AXE: 1003,
  WOODEN_SHOVEL: 1004,
  COAL: 1005,
  RAW_IRON: 1006,
  STONE_PICKAXE: 1007,
  STONE_AXE: 1008,
  STONE_SHOVEL: 1009,
  WOODEN_SWORD: 1010,
  STONE_SWORD: 1011,
  IRON_INGOT: 1012,
  GOLD_INGOT: 1013,
  REDSTONE: 1014,
  RAW_PORK: 1015,
  COOKED_PORK: 1016,
  RAW_BEEF: 1017,
  COOKED_BEEF: 1018,
  LEATHER: 1019,
  WOOL: 1020,
  LEATHER_HELMET: 1021,
  LEATHER_CHEST: 1022,
  IRON_HELMET: 1023,
  IRON_CHEST: 1024,
  IRON_PICKAXE: 1025,
  IRON_AXE: 1026,
  IRON_SHOVEL: 1027,
  IRON_SWORD: 1028,
  LEATHER_LEGS: 1029,
  LEATHER_BOOTS: 1030,
  IRON_LEGS: 1031,
  IRON_BOOTS: 1032,
  DIAMOND: 1033,
  DIAMOND_PICKAXE: 1034,
  DIAMOND_AXE: 1035,
  DIAMOND_SHOVEL: 1036,
  DIAMOND_SWORD: 1037,
  DIAMOND_HELMET: 1038,
  DIAMOND_CHEST: 1039,
  DIAMOND_LEGS: 1040,
  DIAMOND_BOOTS: 1041,
  TORCH: 1042,
  DOOR: 1043,
  LADDER: 1044,
  CHEST_ITEM: 1045,
  BED: 1046,
  BONE: 1047,
  ARROW: 1048,
  STRING: 1049,
  GUNPOWDER: 1050,
  RAW_CHICKEN: 1051,
  COOKED_CHICKEN: 1052,
  FEATHER: 1053,
  BOW: 1054,
  WHEAT_SEEDS: 1055,
  WHEAT: 1056,
  BREAD: 1057,
  WOODEN_HOE: 1058,
  STONE_HOE: 1059,
  IRON_HOE: 1060,
  BONE_MEAL: 1061,
  CARROT: 1062,
  FLINT_AND_STEEL: 1063,
  MINECART: 1064,
  ENDER_PEARL: 1065,
  SPIDER_EYE: 1066,
  GLOWSTONE_DUST: 1067,
  NETHER_STAR: 1068,
  BLAZE_ROD: 1069,
  BOSS_SIGIL: 1070,
  GOLDEN_APPLE: 1071,
  // ---- Phase 2 (1072+) ------------------------------------------------------
  GOLDEN_PICKAXE: 1072,
  GOLDEN_AXE: 1073,
  GOLDEN_SHOVEL: 1074,
  GOLDEN_SWORD: 1075,
  GOLDEN_HOE: 1076,
  GOLDEN_HELMET: 1077,
  GOLDEN_CHEST: 1078,
  GOLDEN_LEGS: 1079,
  GOLDEN_BOOTS: 1080,
  GOLDEN_CARROT: 1081,
  SUGAR: 1082,
  RED_DYE: 1083,
  YELLOW_DYE: 1084,
  GREEN_DYE: 1085,
  ORANGE_DYE: 1086,
  LIME_DYE: 1087,
  PINK_DYE: 1088,
  // ---- Phase 3 (1089+) --------------------------------------------------------
  BUCKET: 1089,
  WATER_BUCKET: 1090,
  LAVA_BUCKET: 1091,
  BOAT: 1092,
  FISHING_ROD: 1093,
  RAW_FISH: 1094,
  COOKED_FISH: 1095,
  // ---- Phase 4 (1096+): new mob drops + saddle ---------------------------------
  GHAST_TEAR: 1096,
  SLIMEBALL: 1097,
  MAGMA_CREAM: 1098,
  INK_SAC: 1099,
  SADDLE: 1100,
  // ---- Phase 7 (1101+): brewing, potions, shield --------------------------------
  GLASS_BOTTLE: 1101,
  WATER_BOTTLE: 1102,
  NETHER_WART: 1103,
  BLAZE_POWDER: 1104,
  FERMENTED_SPIDER_EYE: 1105,
  // One item id per potion type. Splash variants are NOT separate ids: a stack
  // brewed with gunpowder carries `splash: true` (like durability/enchantments,
  // preserved by inventory/containers) — bounds the id sprawl to 11 potions.
  POTION_AWKWARD: 1106,
  POTION_SPEED: 1107,
  POTION_STRENGTH: 1108,
  POTION_HEALING: 1109,
  POTION_POISON: 1110,
  POTION_REGEN: 1111,
  POTION_FIRE_RES: 1112,
  POTION_NIGHT_VISION: 1113,
  POTION_WATER_BREATHING: 1114,
  POTION_SLOWNESS: 1115,
  POTION_WEAKNESS: 1116,
  SHIELD: 1117,
  // ---- Phase 5 (1118+): worldgen 2.0 currencies ---------------------------------
  EMERALD: 1118,
  LAPIS: 1119,
};

// Per-block definition. `top`/`bottom`/`side` are atlas tile indices.
// `solid`      -> participates in collision.
// `transparent`-> neighbouring faces are still drawn against it (used for culling).
export const BLOCKS = {
  [BLOCK.GRASS]:   { name: 'Grass',   top: TILES.GRASS_TOP,  bottom: TILES.DIRT, side: TILES.GRASS_SIDE, solid: true,  transparent: false, hardness: 0.45, tool: 'shovel' },
  [BLOCK.DIRT]:    { name: 'Dirt',    top: TILES.DIRT,       bottom: TILES.DIRT, side: TILES.DIRT,       solid: true,  transparent: false, hardness: 0.45, tool: 'shovel' },
  [BLOCK.STONE]:   { name: 'Stone',   top: TILES.STONE,      bottom: TILES.STONE,side: TILES.STONE,      solid: true,  transparent: false, hardness: 1.55, tool: 'pickaxe', drops: [{ id: BLOCK.COBBLESTONE, count: 1 }] },
  [BLOCK.SAND]:    { name: 'Sand',    top: TILES.SAND,       bottom: TILES.SAND, side: TILES.SAND,       solid: true,  transparent: false, hardness: 0.35, tool: 'shovel' },
  [BLOCK.WOOD]:    { name: 'Wood',    top: TILES.WOOD_TOP,   bottom: TILES.WOOD_TOP, side: TILES.WOOD_SIDE, solid: true, transparent: false, hardness: 1.15, tool: 'axe' },
  [BLOCK.LEAVES]:  { name: 'Leaves',  top: TILES.LEAVES,     bottom: TILES.LEAVES,side: TILES.LEAVES,     solid: true,  transparent: false, hardness: 0.18 },
  [BLOCK.BEDROCK]: { name: 'Bedrock', top: TILES.BEDROCK,    bottom: TILES.BEDROCK,side: TILES.BEDROCK,   solid: true,  transparent: false, hardness: Infinity },
  // Water: non-solid (you fall/walk through it) and transparent (so the faces of
  // solid blocks touching it are still drawn). `liquid` marks it for the mesher,
  // which gives water its own translucent pass and special face-culling.
  [BLOCK.WATER]:   { name: 'Water',   top: TILES.WATER,      bottom: TILES.WATER, side: TILES.WATER,      solid: false, transparent: true, liquid: true, hardness: Infinity },
  [BLOCK.SNOW]:    { name: 'Snow',    top: TILES.SNOW,       bottom: TILES.DIRT,  side: TILES.SNOW,       solid: true,  transparent: false, hardness: 0.28, tool: 'shovel' },
  [BLOCK.PLANK]:   { name: 'Planks',  top: TILES.PLANK,      bottom: TILES.PLANK, side: TILES.PLANK,      solid: true,  transparent: false, hardness: 0.8, tool: 'axe' },
  [BLOCK.COAL_ORE]: { name: 'Coal Ore', top: TILES.COAL_ORE,  bottom: TILES.COAL_ORE, side: TILES.COAL_ORE, solid: true, transparent: false, hardness: 1.75, tool: 'pickaxe', minTier: 1, drops: [{ id: ITEM.COAL, count: 1 }] },
  [BLOCK.IRON_ORE]: { name: 'Iron Ore', top: TILES.IRON_ORE,  bottom: TILES.IRON_ORE, side: TILES.IRON_ORE, solid: true, transparent: false, hardness: 2.1, tool: 'pickaxe', minTier: 2, drops: [{ id: ITEM.RAW_IRON, count: 1 }] },
  [BLOCK.CRAFTING_TABLE]: { name: 'Crafting Table', top: TILES.CRAFTING_TABLE_TOP, bottom: TILES.PLANK, side: TILES.CRAFTING_TABLE_SIDE, solid: true, transparent: false, hardness: 0.9, tool: 'axe' },
  [BLOCK.FURNACE]: { name: 'Furnace', top: TILES.FURNACE_TOP, bottom: TILES.FURNACE_TOP, side: TILES.FURNACE_FRONT, solid: true, transparent: false, hardness: 2.6, tool: 'pickaxe' },
  [BLOCK.FURNACE_LIT]: { name: 'Furnace', top: TILES.FURNACE_TOP, bottom: TILES.FURNACE_TOP, side: TILES.FURNACE_FRONT_LIT, solid: true, transparent: false, hardness: 2.6, tool: 'pickaxe', drops: [{ id: BLOCK.FURNACE, count: 1 }], light: 13 },
  [BLOCK.GLASS]: { name: 'Glass', top: TILES.GLASS, bottom: TILES.GLASS, side: TILES.GLASS, solid: true, transparent: true, hardness: 0.4, drops: [] },
  [BLOCK.GOLD_ORE]: { name: 'Gold Ore', top: TILES.GOLD_ORE, bottom: TILES.GOLD_ORE, side: TILES.GOLD_ORE, solid: true, transparent: false, hardness: 2.6, tool: 'pickaxe', minTier: 2, drops: [{ id: BLOCK.GOLD_ORE, count: 1 }] },
  [BLOCK.REDSTONE_ORE]: { name: 'Redstone Ore', top: TILES.REDSTONE_ORE, bottom: TILES.REDSTONE_ORE, side: TILES.REDSTONE_ORE, solid: true, transparent: false, hardness: 2.6, tool: 'pickaxe', minTier: 2, drops: [{ id: ITEM.REDSTONE, count: 2 }] },
  [BLOCK.IRON_BLOCK]: { name: 'Iron Block', top: TILES.IRON_BLOCK, bottom: TILES.IRON_BLOCK, side: TILES.IRON_BLOCK, solid: true, transparent: false, hardness: 3.0, tool: 'pickaxe', minTier: 2 },
  [BLOCK.GOLD_BLOCK]: { name: 'Gold Block', top: TILES.GOLD_BLOCK, bottom: TILES.GOLD_BLOCK, side: TILES.GOLD_BLOCK, solid: true, transparent: false, hardness: 3.0, tool: 'pickaxe', minTier: 2 },
  [BLOCK.REDSTONE_BLOCK]: { name: 'Redstone Block', top: TILES.REDSTONE_BLOCK, bottom: TILES.REDSTONE_BLOCK, side: TILES.REDSTONE_BLOCK, solid: true, transparent: false, hardness: 2.2, tool: 'pickaxe', minTier: 2 },
  [BLOCK.CACTUS]: { name: 'Cactus', top: TILES.CACTUS, bottom: TILES.CACTUS, side: TILES.CACTUS, solid: true, transparent: false, hardness: 0.55, tool: 'axe' },
  [BLOCK.DIAMOND_ORE]: { name: 'Diamond Ore', top: TILES.DIAMOND_ORE, bottom: TILES.DIAMOND_ORE, side: TILES.DIAMOND_ORE, solid: true, transparent: false, hardness: 3.0, tool: 'pickaxe', minTier: 3, drops: [{ id: ITEM.DIAMOND, count: 1 }] },
  [BLOCK.DIAMOND_BLOCK]: { name: 'Diamond Block', top: TILES.DIAMOND_BLOCK, bottom: TILES.DIAMOND_BLOCK, side: TILES.DIAMOND_BLOCK, solid: true, transparent: false, hardness: 3.5, tool: 'pickaxe', minTier: 3 },
  [BLOCK.TORCH]: { name: 'Torch', top: TILES.TORCH, bottom: TILES.TORCH, side: TILES.TORCH, solid: false, transparent: true, hardness: 0.01, model: 'torch', light: 14 },
  [BLOCK.DOOR_BOTTOM]: { name: 'Door', top: TILES.DOOR_BOTTOM, bottom: TILES.DOOR_BOTTOM, side: TILES.DOOR_BOTTOM, solid: true, transparent: true, hardness: 0.6, tool: 'axe', model: 'door', drops: [{ id: ITEM.DOOR, count: 1 }] },
  [BLOCK.DOOR_TOP]: { name: 'Door', top: TILES.DOOR_TOP, bottom: TILES.DOOR_TOP, side: TILES.DOOR_TOP, solid: true, transparent: true, hardness: 0.6, tool: 'axe', model: 'door', drops: [] },
  [BLOCK.LADDER]: { name: 'Ladder', top: TILES.LADDER, bottom: TILES.LADDER, side: TILES.LADDER, solid: false, transparent: true, hardness: 0.3, tool: 'axe', model: 'cross', climbable: true },
  [BLOCK.CHEST]: { name: 'Chest', top: TILES.CHEST_TOP, bottom: TILES.CHEST_SIDE, side: TILES.CHEST_FRONT, solid: true, transparent: false, hardness: 0.9, tool: 'axe' },
  [BLOCK.BED_HEAD]: { name: 'Bed', top: TILES.BED_TOP, bottom: TILES.PLANK, side: TILES.BED_SIDE, solid: true, transparent: false, hardness: 0.3, drops: [{ id: ITEM.BED, count: 1 }] },
  [BLOCK.BED_FOOT]: { name: 'Bed', top: TILES.BED_TOP, bottom: TILES.PLANK, side: TILES.BED_SIDE, solid: true, transparent: false, hardness: 0.3, drops: [] },
  [BLOCK.FLOWER_RED]: { name: 'Red Flower', top: TILES.FLOWER_RED, bottom: TILES.FLOWER_RED, side: TILES.FLOWER_RED, solid: false, transparent: true, hardness: 0.01, model: 'cross' },
  [BLOCK.FLOWER_YELLOW]: { name: 'Yellow Flower', top: TILES.FLOWER_YELLOW, bottom: TILES.FLOWER_YELLOW, side: TILES.FLOWER_YELLOW, solid: false, transparent: true, hardness: 0.01, model: 'cross' },
  [BLOCK.TALL_GRASS]: { name: 'Tall Grass', top: TILES.TALL_GRASS, bottom: TILES.TALL_GRASS, side: TILES.TALL_GRASS, solid: false, transparent: true, hardness: 0.01, model: 'cross', drops: [] },
  [BLOCK.ENCHANTING_TABLE]: { name: 'Enchanting Table', top: TILES.ENCHANT_TOP, bottom: TILES.DIAMOND_BLOCK, side: TILES.DIAMOND_BLOCK, solid: true, transparent: false, hardness: 3.0, tool: 'pickaxe' },
  [BLOCK.COBBLESTONE]: { name: 'Cobblestone', top: TILES.COBBLESTONE, bottom: TILES.COBBLESTONE, side: TILES.COBBLESTONE, solid: true, transparent: false, hardness: 1.8, tool: 'pickaxe' },
  [BLOCK.MOSSY_STONE]: { name: 'Mossy Stone', top: TILES.MOSSY_STONE, bottom: TILES.MOSSY_STONE, side: TILES.MOSSY_STONE, solid: true, transparent: false, hardness: 1.8, tool: 'pickaxe' },
  [BLOCK.BRICK]: { name: 'Bricks', top: TILES.BRICK, bottom: TILES.BRICK, side: TILES.BRICK, solid: true, transparent: false, hardness: 2.0, tool: 'pickaxe' },
  [BLOCK.OBSIDIAN]: { name: 'Obsidian', top: TILES.OBSIDIAN, bottom: TILES.OBSIDIAN, side: TILES.OBSIDIAN, solid: true, transparent: false, hardness: 8.0, tool: 'pickaxe', minTier: 3 },
  [BLOCK.GLASS_PANE]: { name: 'Glass Pane', top: TILES.GLASS_PANE, bottom: TILES.GLASS_PANE, side: TILES.GLASS_PANE, solid: true, transparent: true, hardness: 0.3, model: 'pane', drops: [] },
  [BLOCK.FENCE]: { name: 'Fence', top: TILES.PLANK, bottom: TILES.PLANK, side: TILES.PLANK, solid: true, transparent: true, hardness: 0.8, tool: 'axe', model: 'fence' },
  [BLOCK.BOOKSHELF]: { name: 'Bookshelf', top: TILES.PLANK, bottom: TILES.PLANK, side: TILES.BOOKSHELF, solid: true, transparent: false, hardness: 0.8, tool: 'axe' },
  [BLOCK.TNT]: { name: 'TNT', top: TILES.TNT_TOP, bottom: TILES.TNT_TOP, side: TILES.TNT_SIDE, solid: true, transparent: false, hardness: 0.01 },
  [BLOCK.STONE_BRICK]: { name: 'Stone Bricks', top: TILES.STONE_BRICK, bottom: TILES.STONE_BRICK, side: TILES.STONE_BRICK, solid: true, transparent: false, hardness: 2.0, tool: 'pickaxe' },
  [BLOCK.GRAVEL]: { name: 'Gravel', top: TILES.GRAVEL, bottom: TILES.GRAVEL, side: TILES.GRAVEL, solid: true, transparent: false, hardness: 0.5, tool: 'shovel' },
  [BLOCK.CLAY]: { name: 'Clay', top: TILES.CLAY, bottom: TILES.CLAY, side: TILES.CLAY, solid: true, transparent: false, hardness: 0.5, tool: 'shovel' },
  [BLOCK.REDSTONE_WIRE]: { name: 'Redstone Wire', top: TILES.REDSTONE_WIRE, bottom: TILES.REDSTONE_WIRE, side: TILES.REDSTONE_WIRE, solid: false, transparent: true, hardness: 0.01, model: 'cross', drops: [{ id: ITEM.REDSTONE, count: 1 }] },
  [BLOCK.LEVER]: { name: 'Lever', top: TILES.LEVER, bottom: TILES.LEVER, side: TILES.LEVER, solid: false, transparent: true, hardness: 0.2, model: 'cross' },
  [BLOCK.REDSTONE_TORCH]: { name: 'Redstone Torch', top: TILES.REDSTONE_TORCH, bottom: TILES.REDSTONE_TORCH, side: TILES.REDSTONE_TORCH, solid: false, transparent: true, hardness: 0.01, model: 'torch', light: 7 },
  // Open door halves: non-solid so the player can walk through, drawn as a thin
  // slab rotated against the side of the cell (doorOpen model in chunk.js).
  [BLOCK.DOOR_BOTTOM_OPEN]: { name: 'Door', top: TILES.DOOR_BOTTOM, bottom: TILES.DOOR_BOTTOM, side: TILES.DOOR_BOTTOM, solid: false, transparent: true, hardness: 0.6, tool: 'axe', model: 'doorOpen', drops: [{ id: ITEM.DOOR, count: 1 }] },
  [BLOCK.DOOR_TOP_OPEN]: { name: 'Door', top: TILES.DOOR_TOP, bottom: TILES.DOOR_TOP, side: TILES.DOOR_TOP, solid: false, transparent: true, hardness: 0.6, tool: 'axe', model: 'doorOpen', drops: [] },
  // Farmland: tilled dirt made with a hoe. Breaking it reverts to dirt.
  [BLOCK.FARMLAND]: { name: 'Farmland', top: TILES.FARMLAND, bottom: TILES.DIRT, side: TILES.DIRT, solid: true, transparent: false, hardness: 0.45, tool: 'shovel', drops: [{ id: BLOCK.DIRT, count: 1 }] },
  // Wheat crop growth stages. Only the mature stage drops wheat; every stage
  // returns at least one seed so a farm is never a net loss.
  [BLOCK.WHEAT_0]: { name: 'Wheat (seedling)', top: TILES.WHEAT_STAGE_0, bottom: TILES.WHEAT_STAGE_0, side: TILES.WHEAT_STAGE_0, solid: false, transparent: true, hardness: 0.01, model: 'cross', drops: [{ id: ITEM.WHEAT_SEEDS, count: 1 }] },
  [BLOCK.WHEAT_1]: { name: 'Wheat (growing)', top: TILES.WHEAT_STAGE_1, bottom: TILES.WHEAT_STAGE_1, side: TILES.WHEAT_STAGE_1, solid: false, transparent: true, hardness: 0.01, model: 'cross', drops: [{ id: ITEM.WHEAT_SEEDS, count: 1 }] },
  [BLOCK.WHEAT_2]: { name: 'Wheat (growing)', top: TILES.WHEAT_STAGE_2, bottom: TILES.WHEAT_STAGE_2, side: TILES.WHEAT_STAGE_2, solid: false, transparent: true, hardness: 0.01, model: 'cross', drops: [{ id: ITEM.WHEAT_SEEDS, count: 1 }] },
  [BLOCK.WHEAT_3]: { name: 'Wheat', top: TILES.WHEAT_STAGE_3, bottom: TILES.WHEAT_STAGE_3, side: TILES.WHEAT_STAGE_3, solid: false, transparent: true, hardness: 0.01, model: 'cross', drops: [{ id: ITEM.WHEAT, count: 1 }, { id: ITEM.WHEAT_SEEDS, count: 2 }] },
  // Carrot crop stages. Carrots replant themselves (the item is the seed).
  [BLOCK.CARROT_0]: { name: 'Carrots (seedling)', top: TILES.CARROT_STAGE_0, bottom: TILES.CARROT_STAGE_0, side: TILES.CARROT_STAGE_0, solid: false, transparent: true, hardness: 0.01, model: 'cross', drops: [{ id: ITEM.CARROT, count: 1 }] },
  [BLOCK.CARROT_1]: { name: 'Carrots (growing)', top: TILES.CARROT_STAGE_1, bottom: TILES.CARROT_STAGE_1, side: TILES.CARROT_STAGE_1, solid: false, transparent: true, hardness: 0.01, model: 'cross', drops: [{ id: ITEM.CARROT, count: 1 }] },
  [BLOCK.CARROT_2]: { name: 'Carrots', top: TILES.CARROT_STAGE_2, bottom: TILES.CARROT_STAGE_2, side: TILES.CARROT_STAGE_2, solid: false, transparent: true, hardness: 0.01, model: 'cross', drops: [{ id: ITEM.CARROT, count: 3 }] },
  // Rails: flat plates on the floor, shape (straight/curve/slope) derived from
  // neighbouring rails at mesh time. Non-solid so carts/players pass through.
  [BLOCK.RAIL]: { name: 'Rail', top: TILES.RAIL_STRAIGHT, bottom: TILES.RAIL_STRAIGHT, side: TILES.RAIL_STRAIGHT, solid: false, transparent: true, hardness: 0.5, tool: 'pickaxe', model: 'rail' },
  [BLOCK.POWERED_RAIL]: { name: 'Powered Rail', top: TILES.POWERED_RAIL, bottom: TILES.POWERED_RAIL, side: TILES.POWERED_RAIL, solid: false, transparent: true, hardness: 0.5, tool: 'pickaxe', model: 'rail' },
  [BLOCK.POWERED_RAIL_ON]: { name: 'Powered Rail', top: TILES.POWERED_RAIL_ON, bottom: TILES.POWERED_RAIL_ON, side: TILES.POWERED_RAIL_ON, solid: false, transparent: true, hardness: 0.5, tool: 'pickaxe', model: 'rail', drops: [{ id: BLOCK.POWERED_RAIL, count: 1 }] },
  // Piston body + extended head. Orientation lives in the redstone side-table.
  [BLOCK.PISTON]: { name: 'Piston', top: TILES.PISTON_FACE, bottom: TILES.PISTON_BACK, side: TILES.PISTON_SIDE, solid: true, transparent: false, hardness: 1.2, tool: 'pickaxe' },
  [BLOCK.PISTON_HEAD]: { name: 'Piston Head', top: TILES.PISTON_FACE, bottom: TILES.PISTON_FACE, side: TILES.PISTON_SIDE, solid: true, transparent: true, hardness: 1.2, tool: 'pickaxe', drops: [] },
  [BLOCK.BUTTON]: { name: 'Button', top: TILES.BUTTON, bottom: TILES.BUTTON, side: TILES.BUTTON, solid: false, transparent: true, hardness: 0.3, model: 'button' },
  [BLOCK.PRESSURE_PLATE]: { name: 'Pressure Plate', top: TILES.PRESSURE_PLATE, bottom: TILES.PRESSURE_PLATE, side: TILES.PRESSURE_PLATE, solid: false, transparent: true, hardness: 0.3, model: 'plate' },
  // Repeater: orientation + delay live in the redstone side-table.
  [BLOCK.REPEATER]: { name: 'Repeater', top: TILES.REPEATER, bottom: TILES.REPEATER, side: TILES.REPEATER, solid: false, transparent: true, hardness: 0.3, model: 'plate', drops: [{ id: BLOCK.REPEATER, count: 1 }] },
  [BLOCK.REPEATER_ON]: { name: 'Repeater', top: TILES.REPEATER_ON, bottom: TILES.REPEATER_ON, side: TILES.REPEATER_ON, solid: false, transparent: true, hardness: 0.3, model: 'plate', drops: [{ id: BLOCK.REPEATER, count: 1 }] },
  [BLOCK.REDSTONE_LAMP]: { name: 'Redstone Lamp', top: TILES.REDSTONE_LAMP, bottom: TILES.REDSTONE_LAMP, side: TILES.REDSTONE_LAMP, solid: true, transparent: false, hardness: 0.8 },
  [BLOCK.REDSTONE_LAMP_ON]: { name: 'Redstone Lamp', top: TILES.REDSTONE_LAMP_ON, bottom: TILES.REDSTONE_LAMP_ON, side: TILES.REDSTONE_LAMP_ON, solid: true, transparent: false, hardness: 0.8, drops: [{ id: BLOCK.REDSTONE_LAMP, count: 1 }], light: 15 },
  [BLOCK.NETHERRACK]: { name: 'Netherrack', top: TILES.NETHERRACK, bottom: TILES.NETHERRACK, side: TILES.NETHERRACK, solid: true, transparent: false, hardness: 0.5, tool: 'pickaxe' },
  // Soul sand slows anything walking on it (see player.js / mobs.js).
  [BLOCK.SOUL_SAND]: { name: 'Soul Sand', top: TILES.SOUL_SAND, bottom: TILES.SOUL_SAND, side: TILES.SOUL_SAND, solid: true, transparent: false, hardness: 0.6, tool: 'shovel' },
  [BLOCK.GLOWSTONE]: { name: 'Glowstone', top: TILES.GLOWSTONE, bottom: TILES.GLOWSTONE, side: TILES.GLOWSTONE, solid: true, transparent: false, hardness: 0.4, light: 15, drops: [{ id: ITEM.GLOWSTONE_DUST, count: 3 }] },
  // Portal interior: indestructible, destroyed by breaking the obsidian frame.
  [BLOCK.NETHER_PORTAL]: { name: 'Nether Portal', top: TILES.NETHER_PORTAL, bottom: TILES.NETHER_PORTAL, side: TILES.NETHER_PORTAL, solid: false, transparent: true, hardness: Infinity, model: 'portal', light: 11, drops: [] },
  [BLOCK.NETHER_BRICK]: { name: 'Nether Bricks', top: TILES.NETHER_BRICK, bottom: TILES.NETHER_BRICK, side: TILES.NETHER_BRICK, solid: true, transparent: false, hardness: 2.2, tool: 'pickaxe' },
  // Lava: non-solid liquid (swim physics apply), full-bright, hurts on contact.
  // Rendered as ordinary opaque cube geometry so the sea reads as a glowing floor.
  [BLOCK.LAVA]: { name: 'Lava', top: TILES.LAVA, bottom: TILES.LAVA, side: TILES.LAVA, solid: false, transparent: false, liquid: true, hardness: Infinity, light: 15 },
  [BLOCK.MOB_SPAWNER]: { name: 'Mob Spawner', top: TILES.MOB_SPAWNER, bottom: TILES.MOB_SPAWNER, side: TILES.MOB_SPAWNER, solid: true, transparent: true, hardness: 3.5, tool: 'pickaxe', minTier: 1, drops: [] },
  // ---- Slabs & stairs ---------------------------------------------------------
  // solid (collision is a full box — an accepted approximation, player.js only
  // knows isSolid) but transparent so neighbouring faces still render behind
  // the partial shape (the PISTON_HEAD trick). Geometry state lives in meta.
  [BLOCK.OAK_SLAB]: { name: 'Oak Slab', top: TILES.PLANK, bottom: TILES.PLANK, side: TILES.PLANK, solid: true, transparent: true, hardness: 0.8, tool: 'axe', model: 'slab' },
  [BLOCK.STONE_SLAB]: { name: 'Stone Slab', top: TILES.STONE, bottom: TILES.STONE, side: TILES.STONE, solid: true, transparent: true, hardness: 1.8, tool: 'pickaxe', model: 'slab' },
  [BLOCK.COBBLESTONE_SLAB]: { name: 'Cobblestone Slab', top: TILES.COBBLESTONE, bottom: TILES.COBBLESTONE, side: TILES.COBBLESTONE, solid: true, transparent: true, hardness: 1.8, tool: 'pickaxe', model: 'slab' },
  [BLOCK.BRICK_SLAB]: { name: 'Brick Slab', top: TILES.BRICK, bottom: TILES.BRICK, side: TILES.BRICK, solid: true, transparent: true, hardness: 2.0, tool: 'pickaxe', model: 'slab' },
  [BLOCK.STONE_BRICK_SLAB]: { name: 'Stone Brick Slab', top: TILES.STONE_BRICK, bottom: TILES.STONE_BRICK, side: TILES.STONE_BRICK, solid: true, transparent: true, hardness: 2.0, tool: 'pickaxe', model: 'slab' },
  [BLOCK.SANDSTONE_SLAB]: { name: 'Sandstone Slab', top: TILES.SANDSTONE_TOP, bottom: TILES.SANDSTONE_TOP, side: TILES.SANDSTONE_SIDE, solid: true, transparent: true, hardness: 0.9, tool: 'pickaxe', model: 'slab' },
  [BLOCK.BIRCH_SLAB]: { name: 'Birch Slab', top: TILES.BIRCH_PLANK, bottom: TILES.BIRCH_PLANK, side: TILES.BIRCH_PLANK, solid: true, transparent: true, hardness: 0.8, tool: 'axe', model: 'slab' },
  [BLOCK.SPRUCE_SLAB]: { name: 'Spruce Slab', top: TILES.SPRUCE_PLANK, bottom: TILES.SPRUCE_PLANK, side: TILES.SPRUCE_PLANK, solid: true, transparent: true, hardness: 0.8, tool: 'axe', model: 'slab' },
  [BLOCK.OAK_STAIRS]: { name: 'Oak Stairs', top: TILES.PLANK, bottom: TILES.PLANK, side: TILES.PLANK, solid: true, transparent: true, hardness: 0.8, tool: 'axe', model: 'stairs' },
  [BLOCK.COBBLESTONE_STAIRS]: { name: 'Cobblestone Stairs', top: TILES.COBBLESTONE, bottom: TILES.COBBLESTONE, side: TILES.COBBLESTONE, solid: true, transparent: true, hardness: 1.8, tool: 'pickaxe', model: 'stairs' },
  [BLOCK.BRICK_STAIRS]: { name: 'Brick Stairs', top: TILES.BRICK, bottom: TILES.BRICK, side: TILES.BRICK, solid: true, transparent: true, hardness: 2.0, tool: 'pickaxe', model: 'stairs' },
  [BLOCK.STONE_BRICK_STAIRS]: { name: 'Stone Brick Stairs', top: TILES.STONE_BRICK, bottom: TILES.STONE_BRICK, side: TILES.STONE_BRICK, solid: true, transparent: true, hardness: 2.0, tool: 'pickaxe', model: 'stairs' },
  [BLOCK.SANDSTONE_STAIRS]: { name: 'Sandstone Stairs', top: TILES.SANDSTONE_TOP, bottom: TILES.SANDSTONE_TOP, side: TILES.SANDSTONE_SIDE, solid: true, transparent: true, hardness: 0.9, tool: 'pickaxe', model: 'stairs' },
  [BLOCK.BIRCH_STAIRS]: { name: 'Birch Stairs', top: TILES.BIRCH_PLANK, bottom: TILES.BIRCH_PLANK, side: TILES.BIRCH_PLANK, solid: true, transparent: true, hardness: 0.8, tool: 'axe', model: 'stairs' },
  [BLOCK.SPRUCE_STAIRS]: { name: 'Spruce Stairs', top: TILES.SPRUCE_PLANK, bottom: TILES.SPRUCE_PLANK, side: TILES.SPRUCE_PLANK, solid: true, transparent: true, hardness: 0.8, tool: 'axe', model: 'stairs' },
  // ---- Wood variants ------------------------------------------------------------
  [BLOCK.BIRCH_WOOD]: { name: 'Birch Wood', top: TILES.BIRCH_WOOD_TOP, bottom: TILES.BIRCH_WOOD_TOP, side: TILES.BIRCH_WOOD_SIDE, solid: true, transparent: false, hardness: 1.15, tool: 'axe' },
  [BLOCK.BIRCH_PLANK]: { name: 'Birch Planks', top: TILES.BIRCH_PLANK, bottom: TILES.BIRCH_PLANK, side: TILES.BIRCH_PLANK, solid: true, transparent: false, hardness: 0.8, tool: 'axe' },
  [BLOCK.BIRCH_LEAVES]: { name: 'Birch Leaves', top: TILES.BIRCH_LEAVES, bottom: TILES.BIRCH_LEAVES, side: TILES.BIRCH_LEAVES, solid: true, transparent: false, hardness: 0.18, drops: [] },
  [BLOCK.SPRUCE_WOOD]: { name: 'Spruce Wood', top: TILES.SPRUCE_WOOD_TOP, bottom: TILES.SPRUCE_WOOD_TOP, side: TILES.SPRUCE_WOOD_SIDE, solid: true, transparent: false, hardness: 1.15, tool: 'axe' },
  [BLOCK.SPRUCE_PLANK]: { name: 'Spruce Planks', top: TILES.SPRUCE_PLANK, bottom: TILES.SPRUCE_PLANK, side: TILES.SPRUCE_PLANK, solid: true, transparent: false, hardness: 0.8, tool: 'axe' },
  [BLOCK.SPRUCE_LEAVES]: { name: 'Spruce Leaves', top: TILES.SPRUCE_LEAVES, bottom: TILES.SPRUCE_LEAVES, side: TILES.SPRUCE_LEAVES, solid: true, transparent: false, hardness: 0.18, drops: [] },
  [BLOCK.BIRCH_FENCE]: { name: 'Birch Fence', top: TILES.BIRCH_PLANK, bottom: TILES.BIRCH_PLANK, side: TILES.BIRCH_PLANK, solid: true, transparent: true, hardness: 0.8, tool: 'axe', model: 'fence' },
  [BLOCK.SPRUCE_FENCE]: { name: 'Spruce Fence', top: TILES.SPRUCE_PLANK, bottom: TILES.SPRUCE_PLANK, side: TILES.SPRUCE_PLANK, solid: true, transparent: true, hardness: 0.8, tool: 'axe', model: 'fence' },
  // ---- Sandstone / sugar cane ---------------------------------------------------
  [BLOCK.SANDSTONE]: { name: 'Sandstone', top: TILES.SANDSTONE_TOP, bottom: TILES.SANDSTONE_TOP, side: TILES.SANDSTONE_SIDE, solid: true, transparent: false, hardness: 0.9, tool: 'pickaxe' },
  // Sugar cane: cross model like flowers; placement rules (sand/dirt/grass below,
  // water adjacent to the support) are enforced in the main.js place path.
  [BLOCK.SUGAR_CANE]: { name: 'Sugar Cane', top: TILES.SUGAR_CANE, bottom: TILES.SUGAR_CANE, side: TILES.SUGAR_CANE, solid: false, transparent: true, hardness: 0.05, model: 'cross' },
  // ---- Wool x16 -------------------------------------------------------------------
  [BLOCK.WOOL_WHITE]: { name: 'White Wool', top: TILES.WOOL_WHITE, bottom: TILES.WOOL_WHITE, side: TILES.WOOL_WHITE, solid: true, transparent: false, hardness: 0.75 },
  [BLOCK.WOOL_ORANGE]: { name: 'Orange Wool', top: TILES.WOOL_ORANGE, bottom: TILES.WOOL_ORANGE, side: TILES.WOOL_ORANGE, solid: true, transparent: false, hardness: 0.75 },
  [BLOCK.WOOL_MAGENTA]: { name: 'Magenta Wool', top: TILES.WOOL_MAGENTA, bottom: TILES.WOOL_MAGENTA, side: TILES.WOOL_MAGENTA, solid: true, transparent: false, hardness: 0.75 },
  [BLOCK.WOOL_LIGHT_BLUE]: { name: 'Light Blue Wool', top: TILES.WOOL_LIGHT_BLUE, bottom: TILES.WOOL_LIGHT_BLUE, side: TILES.WOOL_LIGHT_BLUE, solid: true, transparent: false, hardness: 0.75 },
  [BLOCK.WOOL_YELLOW]: { name: 'Yellow Wool', top: TILES.WOOL_YELLOW, bottom: TILES.WOOL_YELLOW, side: TILES.WOOL_YELLOW, solid: true, transparent: false, hardness: 0.75 },
  [BLOCK.WOOL_LIME]: { name: 'Lime Wool', top: TILES.WOOL_LIME, bottom: TILES.WOOL_LIME, side: TILES.WOOL_LIME, solid: true, transparent: false, hardness: 0.75 },
  [BLOCK.WOOL_PINK]: { name: 'Pink Wool', top: TILES.WOOL_PINK, bottom: TILES.WOOL_PINK, side: TILES.WOOL_PINK, solid: true, transparent: false, hardness: 0.75 },
  [BLOCK.WOOL_GRAY]: { name: 'Gray Wool', top: TILES.WOOL_GRAY, bottom: TILES.WOOL_GRAY, side: TILES.WOOL_GRAY, solid: true, transparent: false, hardness: 0.75 },
  [BLOCK.WOOL_LIGHT_GRAY]: { name: 'Light Gray Wool', top: TILES.WOOL_LIGHT_GRAY, bottom: TILES.WOOL_LIGHT_GRAY, side: TILES.WOOL_LIGHT_GRAY, solid: true, transparent: false, hardness: 0.75 },
  [BLOCK.WOOL_CYAN]: { name: 'Cyan Wool', top: TILES.WOOL_CYAN, bottom: TILES.WOOL_CYAN, side: TILES.WOOL_CYAN, solid: true, transparent: false, hardness: 0.75 },
  [BLOCK.WOOL_PURPLE]: { name: 'Purple Wool', top: TILES.WOOL_PURPLE, bottom: TILES.WOOL_PURPLE, side: TILES.WOOL_PURPLE, solid: true, transparent: false, hardness: 0.75 },
  [BLOCK.WOOL_BLUE]: { name: 'Blue Wool', top: TILES.WOOL_BLUE, bottom: TILES.WOOL_BLUE, side: TILES.WOOL_BLUE, solid: true, transparent: false, hardness: 0.75 },
  [BLOCK.WOOL_BROWN]: { name: 'Brown Wool', top: TILES.WOOL_BROWN, bottom: TILES.WOOL_BROWN, side: TILES.WOOL_BROWN, solid: true, transparent: false, hardness: 0.75 },
  [BLOCK.WOOL_GREEN]: { name: 'Green Wool', top: TILES.WOOL_GREEN, bottom: TILES.WOOL_GREEN, side: TILES.WOOL_GREEN, solid: true, transparent: false, hardness: 0.75 },
  [BLOCK.WOOL_RED]: { name: 'Red Wool', top: TILES.WOOL_RED, bottom: TILES.WOOL_RED, side: TILES.WOOL_RED, solid: true, transparent: false, hardness: 0.75 },
  [BLOCK.WOOL_BLACK]: { name: 'Black Wool', top: TILES.WOOL_BLACK, bottom: TILES.WOOL_BLACK, side: TILES.WOOL_BLACK, solid: true, transparent: false, hardness: 0.75 },
  // ---- Phase 6: redstone completion --------------------------------------------
  // Unlit torch variant (technical block, mirrors the lamp on/off pattern so
  // lighting stays correct). Drops the regular redstone torch.
  [BLOCK.REDSTONE_TORCH_OFF]: { name: 'Redstone Torch', top: TILES.REDSTONE_TORCH_OFF, bottom: TILES.REDSTONE_TORCH_OFF, side: TILES.REDSTONE_TORCH_OFF, solid: false, transparent: true, hardness: 0.01, model: 'torch', drops: [{ id: BLOCK.REDSTONE_TORCH, count: 1 }] },
  // Sticky piston: same body as the piston, slime-tinted face. Orientation and
  // extended state live in the redstone side-table (PISTON_HEAD is shared).
  [BLOCK.STICKY_PISTON]: { name: 'Sticky Piston', top: TILES.STICKY_PISTON_FACE, bottom: TILES.PISTON_BACK, side: TILES.PISTON_SIDE, solid: true, transparent: false, hardness: 1.2, tool: 'pickaxe' },
  // Observer: watches the cell its face points at (dir in the redstone
  // side-table, like pistons) and pulses out its back on any id/meta change.
  [BLOCK.OBSERVER]: { name: 'Observer', top: TILES.OBSERVER_FACE, bottom: TILES.OBSERVER_BACK, side: TILES.OBSERVER_SIDE, solid: true, transparent: false, hardness: 1.6, tool: 'pickaxe' },
  // Dispenser/dropper: directional 9-slot containers (dispensers.js manager).
  [BLOCK.DISPENSER]: { name: 'Dispenser', top: TILES.FURNACE_TOP, bottom: TILES.FURNACE_TOP, side: TILES.DISPENSER_FRONT, solid: true, transparent: false, hardness: 2.6, tool: 'pickaxe' },
  [BLOCK.DROPPER]: { name: 'Dropper', top: TILES.FURNACE_TOP, bottom: TILES.FURNACE_TOP, side: TILES.DROPPER_FRONT, solid: true, transparent: false, hardness: 2.6, tool: 'pickaxe' },
  // Hopper: rendered as a plain cube with a funnel texture (a real funnel model
  // is future polish); 5 slots + direction live in the hoppers.js manager.
  [BLOCK.HOPPER]: { name: 'Hopper', top: TILES.HOPPER_TOP, bottom: TILES.HOPPER_SIDE, side: TILES.HOPPER_SIDE, solid: true, transparent: false, hardness: 2.2, tool: 'pickaxe' },
  // Note block: pitch 0..24 stored in per-voxel meta (cube, so meta is free).
  [BLOCK.NOTE_BLOCK]: { name: 'Note Block', top: TILES.NOTE_BLOCK, bottom: TILES.NOTE_BLOCK, side: TILES.NOTE_BLOCK, solid: true, transparent: false, hardness: 0.8, tool: 'axe' },
  // Comparator: plate model like the repeater; direction/mode/output level
  // live in the redstone side-table. Right-click toggles subtract mode.
  [BLOCK.COMPARATOR]: { name: 'Comparator', top: TILES.COMPARATOR, bottom: TILES.COMPARATOR, side: TILES.COMPARATOR, solid: false, transparent: true, hardness: 0.3, model: 'plate' },
  // ---- Phase 7: brewing + anvil -------------------------------------------------
  // Brewing stand: cross model (like flowers) but SOLID so the interaction ray
  // hits it (right-click opens the brew screen). A real 3D stand mesh is
  // future polish — documented simplification.
  [BLOCK.BREWING_STAND]: { name: 'Brewing Stand', top: TILES.BREWING_STAND, bottom: TILES.BREWING_STAND, side: TILES.BREWING_STAND, solid: true, transparent: true, hardness: 0.6, tool: 'pickaxe', model: 'cross', light: 2 },
  // Nether wart crop stages (grows only on soul sand; separate-id pattern like
  // wheat). Immature stages return one wart; mature yields 3 (fixed roll).
  [BLOCK.NETHER_WART_0]: { name: 'Nether Wart (young)', top: TILES.NETHER_WART_STAGE_0, bottom: TILES.NETHER_WART_STAGE_0, side: TILES.NETHER_WART_STAGE_0, solid: false, transparent: true, hardness: 0.01, model: 'cross', drops: [{ id: ITEM.NETHER_WART, count: 1 }] },
  [BLOCK.NETHER_WART_1]: { name: 'Nether Wart (growing)', top: TILES.NETHER_WART_STAGE_1, bottom: TILES.NETHER_WART_STAGE_1, side: TILES.NETHER_WART_STAGE_1, solid: false, transparent: true, hardness: 0.01, model: 'cross', drops: [{ id: ITEM.NETHER_WART, count: 1 }] },
  [BLOCK.NETHER_WART_2]: { name: 'Nether Wart', top: TILES.NETHER_WART_STAGE_2, bottom: TILES.NETHER_WART_STAGE_2, side: TILES.NETHER_WART_STAGE_2, solid: false, transparent: true, hardness: 0.01, model: 'cross', drops: [{ id: ITEM.NETHER_WART, count: 3 }] },
  // Anvil: plain cube with an anvil-silhouette texture (a real anvil shape is
  // future polish — documented). Right-click opens the repair screen.
  [BLOCK.ANVIL]: { name: 'Anvil', top: TILES.ANVIL_TOP, bottom: TILES.ANVIL_SIDE, side: TILES.ANVIL_SIDE, solid: true, transparent: false, hardness: 3.0, tool: 'pickaxe' },
  // ---- Phase 5: worldgen 2.0 ores -------------------------------------------------
  [BLOCK.EMERALD_ORE]: { name: 'Emerald Ore', top: TILES.EMERALD_ORE, bottom: TILES.EMERALD_ORE, side: TILES.EMERALD_ORE, solid: true, transparent: false, hardness: 2.6, tool: 'pickaxe', minTier: 2, drops: [{ id: ITEM.EMERALD, count: 1 }] },
  [BLOCK.LAPIS_ORE]: { name: 'Lapis Lazuli Ore', top: TILES.LAPIS_ORE, bottom: TILES.LAPIS_ORE, side: TILES.LAPIS_ORE, solid: true, transparent: false, hardness: 2.4, tool: 'pickaxe', minTier: 2, drops: [{ id: ITEM.LAPIS, count: 4, max: 8 }] }, // count..max rolled by blockDrop()
  // ---- Phase 8: emerald storage block (decorative; shapeless <-> 9 emeralds) -------
  [BLOCK.EMERALD_BLOCK]: { name: 'Emerald Block', top: TILES.EMERALD_BLOCK, bottom: TILES.EMERALD_BLOCK, side: TILES.EMERALD_BLOCK, solid: true, transparent: false, hardness: 3.0, tool: 'pickaxe', minTier: 2 },
};

// Blocks selectable in the hotbar (1..N keys), in order.
export const HOTBAR = [BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SAND, BLOCK.WOOD, BLOCK.LEAVES, BLOCK.WATER, BLOCK.SNOW];

// ---- Inventory / items ------------------------------------------------------
// Survival inventory: a flat list of slots. The first HOTBAR_SIZE slots are the
// on-screen hotbar (keys 1..9, scroll wheel); the rest are backpack-only and
// reachable through the inventory screen.
export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36;
export const STACK_MAX = 64;

// Per-item definition for things that are NOT placeable blocks. Block items
// derive their name/icon from BLOCKS via itemDef() below.
//   tile  -> atlas tile index used as the inventory icon
//   food  -> hunger points restored when eaten (omit if not edible)
export const ITEMS = {
  [ITEM.APPLE]: { name: 'Apple', tile: TILES.APPLE, food: 5 },
  [ITEM.STICK]: { name: 'Stick', tile: TILES.STICK },
  [ITEM.WOODEN_PICKAXE]: { name: 'Wooden Pickaxe', tile: TILES.WOODEN_PICKAXE, tool: 'pickaxe', tier: 1, stack: 1, durability: 60 },
  [ITEM.WOODEN_AXE]: { name: 'Wooden Axe', tile: TILES.WOODEN_AXE, tool: 'axe', tier: 1, stack: 1, durability: 60 },
  [ITEM.WOODEN_SHOVEL]: { name: 'Wooden Shovel', tile: TILES.WOODEN_SHOVEL, tool: 'shovel', tier: 1, stack: 1, durability: 60 },
  [ITEM.COAL]: { name: 'Coal', tile: TILES.COAL },
  [ITEM.RAW_IRON]: { name: 'Raw Iron', tile: TILES.RAW_IRON },
  [ITEM.STONE_PICKAXE]: { name: 'Stone Pickaxe', tile: TILES.STONE_PICKAXE, tool: 'pickaxe', tier: 2, stack: 1, durability: 132 },
  [ITEM.STONE_AXE]: { name: 'Stone Axe', tile: TILES.STONE_AXE, tool: 'axe', tier: 2, stack: 1, durability: 132 },
  [ITEM.STONE_SHOVEL]: { name: 'Stone Shovel', tile: TILES.STONE_SHOVEL, tool: 'shovel', tier: 2, stack: 1, durability: 132 },
  [ITEM.WOODEN_SWORD]: { name: 'Wooden Sword', tile: TILES.WOODEN_SWORD, stack: 1, damage: 4, durability: 60 },
  [ITEM.STONE_SWORD]: { name: 'Stone Sword', tile: TILES.STONE_SWORD, stack: 1, damage: 7, durability: 132 },
  [ITEM.IRON_INGOT]: { name: 'Iron Ingot', tile: TILES.IRON_INGOT },
  [ITEM.GOLD_INGOT]: { name: 'Gold Ingot', tile: TILES.GOLD_INGOT },
  [ITEM.REDSTONE]: { name: 'Redstone', tile: TILES.REDSTONE, placeable: BLOCK.REDSTONE_WIRE },
  [ITEM.RAW_PORK]: { name: 'Raw Porkchop', tile: TILES.RAW_PORK, food: 3 },
  [ITEM.COOKED_PORK]: { name: 'Cooked Porkchop', tile: TILES.COOKED_PORK, food: 8 },
  [ITEM.RAW_BEEF]: { name: 'Raw Beef', tile: TILES.RAW_BEEF, food: 3 },
  [ITEM.COOKED_BEEF]: { name: 'Steak', tile: TILES.COOKED_BEEF, food: 8 },
  [ITEM.LEATHER]: { name: 'Leather', tile: TILES.LEATHER },
  // Legacy wool item (pre-Phase-2 saves): kept as an alias that places white
  // wool so old stacks stay usable. Sheep now drop BLOCK.WOOL_WHITE directly.
  [ITEM.WOOL]: { name: 'Wool', tile: TILES.WOOL, placeable: BLOCK.WOOL_WHITE },
  [ITEM.LEATHER_HELMET]: { name: 'Leather Cap', tile: TILES.LEATHER_HELMET, stack: 1, armor: 2, armorSlot: 'head' },
  [ITEM.LEATHER_CHEST]: { name: 'Leather Tunic', tile: TILES.LEATHER_CHEST, stack: 1, armor: 3, armorSlot: 'chest' },
  [ITEM.IRON_HELMET]: { name: 'Iron Helmet', tile: TILES.IRON_HELMET, stack: 1, armor: 4, armorSlot: 'head' },
  [ITEM.IRON_CHEST]: { name: 'Iron Chestplate', tile: TILES.IRON_CHEST, stack: 1, armor: 6, armorSlot: 'chest' },
  [ITEM.IRON_PICKAXE]: { name: 'Iron Pickaxe', tile: TILES.IRON_PICKAXE, tool: 'pickaxe', tier: 3, stack: 1, durability: 250 },
  [ITEM.IRON_AXE]: { name: 'Iron Axe', tile: TILES.IRON_AXE, tool: 'axe', tier: 3, stack: 1, durability: 250 },
  [ITEM.IRON_SHOVEL]: { name: 'Iron Shovel', tile: TILES.IRON_SHOVEL, tool: 'shovel', tier: 3, stack: 1, durability: 250 },
  [ITEM.IRON_SWORD]: { name: 'Iron Sword', tile: TILES.IRON_SWORD, stack: 1, damage: 10, durability: 250 },
  [ITEM.LEATHER_LEGS]: { name: 'Leather Pants', tile: TILES.LEATHER_LEGS, stack: 1, armor: 2, armorSlot: 'legs' },
  [ITEM.LEATHER_BOOTS]: { name: 'Leather Boots', tile: TILES.LEATHER_BOOTS, stack: 1, armor: 1, armorSlot: 'feet' },
  [ITEM.IRON_LEGS]: { name: 'Iron Leggings', tile: TILES.IRON_LEGS, stack: 1, armor: 5, armorSlot: 'legs' },
  [ITEM.IRON_BOOTS]: { name: 'Iron Boots', tile: TILES.IRON_BOOTS, stack: 1, armor: 2, armorSlot: 'feet' },
  [ITEM.DIAMOND]: { name: 'Diamond', tile: TILES.DIAMOND },
  [ITEM.DIAMOND_PICKAXE]: { name: 'Diamond Pickaxe', tile: TILES.DIAMOND_PICKAXE, tool: 'pickaxe', tier: 4, stack: 1, durability: 1561 },
  [ITEM.DIAMOND_AXE]: { name: 'Diamond Axe', tile: TILES.DIAMOND_AXE, tool: 'axe', tier: 4, stack: 1, durability: 1561 },
  [ITEM.DIAMOND_SHOVEL]: { name: 'Diamond Shovel', tile: TILES.DIAMOND_SHOVEL, tool: 'shovel', tier: 4, stack: 1, durability: 1561 },
  [ITEM.DIAMOND_SWORD]: { name: 'Diamond Sword', tile: TILES.DIAMOND_SWORD, stack: 1, damage: 13, durability: 1561 },
  [ITEM.DIAMOND_HELMET]: { name: 'Diamond Helmet', tile: TILES.DIAMOND_HELMET, stack: 1, armor: 5, armorSlot: 'head' },
  [ITEM.DIAMOND_CHEST]: { name: 'Diamond Chestplate', tile: TILES.DIAMOND_CHEST, stack: 1, armor: 8, armorSlot: 'chest' },
  [ITEM.DIAMOND_LEGS]: { name: 'Diamond Leggings', tile: TILES.DIAMOND_LEGS, stack: 1, armor: 6, armorSlot: 'legs' },
  [ITEM.DIAMOND_BOOTS]: { name: 'Diamond Boots', tile: TILES.DIAMOND_BOOTS, stack: 1, armor: 3, armorSlot: 'feet' },
  [ITEM.TORCH]: { name: 'Torch', tile: TILES.TORCH_ITEM, placeable: BLOCK.TORCH },
  [ITEM.DOOR]: { name: 'Door', tile: TILES.DOOR_ITEM, placeable: BLOCK.DOOR_BOTTOM },
  [ITEM.LADDER]: { name: 'Ladder', tile: TILES.LADDER_ITEM, placeable: BLOCK.LADDER },
  [ITEM.CHEST_ITEM]: { name: 'Chest', tile: TILES.CHEST_ITEM, placeable: BLOCK.CHEST },
  [ITEM.BED]: { name: 'Bed', tile: TILES.BED_ITEM, placeable: BLOCK.BED_FOOT },
  [ITEM.BONE]: { name: 'Bone', tile: TILES.BONE },
  [ITEM.ARROW]: { name: 'Arrow', tile: TILES.ARROW },
  [ITEM.STRING]: { name: 'String', tile: TILES.STRING },
  [ITEM.GUNPOWDER]: { name: 'Gunpowder', tile: TILES.GUNPOWDER },
  [ITEM.RAW_CHICKEN]: { name: 'Raw Chicken', tile: TILES.RAW_CHICKEN, food: 2 },
  [ITEM.COOKED_CHICKEN]: { name: 'Cooked Chicken', tile: TILES.COOKED_CHICKEN, food: 6 },
  [ITEM.FEATHER]: { name: 'Feather', tile: TILES.FEATHER },
  [ITEM.BOW]: { name: 'Bow', tile: TILES.BOW, stack: 1, durability: 200, bow: true },
  [ITEM.WHEAT_SEEDS]: { name: 'Wheat Seeds', tile: TILES.SEEDS },
  [ITEM.WHEAT]: { name: 'Wheat', tile: TILES.WHEAT_ITEM },
  [ITEM.BREAD]: { name: 'Bread', tile: TILES.BREAD, food: 5 },
  [ITEM.WOODEN_HOE]: { name: 'Wooden Hoe', tile: TILES.WOODEN_HOE, tool: 'hoe', tier: 1, stack: 1, durability: 60 },
  [ITEM.STONE_HOE]: { name: 'Stone Hoe', tile: TILES.STONE_HOE, tool: 'hoe', tier: 2, stack: 1, durability: 132 },
  [ITEM.IRON_HOE]: { name: 'Iron Hoe', tile: TILES.IRON_HOE, tool: 'hoe', tier: 3, stack: 1, durability: 250 },
  [ITEM.BONE_MEAL]: { name: 'Bone Meal', tile: TILES.BONE_MEAL },
  [ITEM.CARROT]: { name: 'Carrot', tile: TILES.CARROT, food: 4 },
  [ITEM.FLINT_AND_STEEL]: { name: 'Flint and Steel', tile: TILES.FLINT_AND_STEEL, stack: 1, durability: 64 },
  [ITEM.MINECART]: { name: 'Minecart', tile: TILES.MINECART_ITEM, stack: 1 },
  [ITEM.ENDER_PEARL]: { name: 'Ender Pearl', tile: TILES.ENDER_PEARL, stack: 16 },
  [ITEM.SPIDER_EYE]: { name: 'Spider Eye', tile: TILES.SPIDER_EYE, food: 2 },
  [ITEM.GLOWSTONE_DUST]: { name: 'Glowstone Dust', tile: TILES.GLOWSTONE_DUST },
  [ITEM.NETHER_STAR]: { name: 'Nether Star', tile: TILES.NETHER_STAR, stack: 1 },
  [ITEM.BLAZE_ROD]: { name: 'Blaze Rod', tile: TILES.BLAZE_ROD },
  [ITEM.BOSS_SIGIL]: { name: 'Overlord Sigil', tile: TILES.BOSS_SIGIL, stack: 1 },
  // Golden apple: big hunger refill; eating it also fully heals (main.js).
  [ITEM.GOLDEN_APPLE]: { name: 'Golden Apple', tile: TILES.GOLDEN_APPLE, food: 20 },
  // Gold tools: stone-tier mining CAPABILITY (tier 2) but very fast (speedTier
  // 6 feeds the breakDuration speed formula) and fragile (durability 32).
  [ITEM.GOLDEN_PICKAXE]: { name: 'Golden Pickaxe', tile: TILES.GOLDEN_PICKAXE, tool: 'pickaxe', tier: 2, speedTier: 6, stack: 1, durability: 32 },
  [ITEM.GOLDEN_AXE]: { name: 'Golden Axe', tile: TILES.GOLDEN_AXE, tool: 'axe', tier: 2, speedTier: 6, stack: 1, durability: 32 },
  [ITEM.GOLDEN_SHOVEL]: { name: 'Golden Shovel', tile: TILES.GOLDEN_SHOVEL, tool: 'shovel', tier: 2, speedTier: 6, stack: 1, durability: 32 },
  [ITEM.GOLDEN_SWORD]: { name: 'Golden Sword', tile: TILES.GOLDEN_SWORD, stack: 1, damage: 4, durability: 32 },
  [ITEM.GOLDEN_HOE]: { name: 'Golden Hoe', tile: TILES.GOLDEN_HOE, tool: 'hoe', tier: 2, speedTier: 6, stack: 1, durability: 32 },
  [ITEM.GOLDEN_HELMET]: { name: 'Golden Helmet', tile: TILES.GOLDEN_HELMET, stack: 1, armor: 2, armorSlot: 'head' },
  [ITEM.GOLDEN_CHEST]: { name: 'Golden Chestplate', tile: TILES.GOLDEN_CHEST, stack: 1, armor: 5, armorSlot: 'chest' },
  [ITEM.GOLDEN_LEGS]: { name: 'Golden Leggings', tile: TILES.GOLDEN_LEGS, stack: 1, armor: 3, armorSlot: 'legs' },
  [ITEM.GOLDEN_BOOTS]: { name: 'Golden Boots', tile: TILES.GOLDEN_BOOTS, stack: 1, armor: 1, armorSlot: 'feet' },
  // Golden carrot: future potion ingredient; crafted from 1 gold ingot + carrot
  // (no gold nuggets exist yet).
  [ITEM.GOLDEN_CARROT]: { name: 'Golden Carrot', tile: TILES.GOLDEN_CARROT, food: 6 },
  [ITEM.SUGAR]: { name: 'Sugar', tile: TILES.SUGAR },
  // Dyes (partial set — the rest arrive with their source mobs/plants).
  [ITEM.RED_DYE]: { name: 'Red Dye', tile: TILES.RED_DYE },
  [ITEM.YELLOW_DYE]: { name: 'Yellow Dye', tile: TILES.YELLOW_DYE },
  [ITEM.GREEN_DYE]: { name: 'Green Dye', tile: TILES.GREEN_DYE },
  [ITEM.ORANGE_DYE]: { name: 'Orange Dye', tile: TILES.ORANGE_DYE },
  [ITEM.LIME_DYE]: { name: 'Lime Dye', tile: TILES.LIME_DYE },
  [ITEM.PINK_DYE]: { name: 'Pink Dye', tile: TILES.PINK_DYE },
  // ---- Phase 3: buckets, boat, fishing ------------------------------------------
  // Empty buckets stack (like vanilla); filled buckets don't.
  [ITEM.BUCKET]: { name: 'Bucket', tile: TILES.BUCKET, stack: 16 },
  [ITEM.WATER_BUCKET]: { name: 'Water Bucket', tile: TILES.WATER_BUCKET, stack: 1 },
  [ITEM.LAVA_BUCKET]: { name: 'Lava Bucket', tile: TILES.LAVA_BUCKET, stack: 1 },
  [ITEM.BOAT]: { name: 'Boat', tile: TILES.BOAT, stack: 1 },
  [ITEM.FISHING_ROD]: { name: 'Fishing Rod', tile: TILES.FISHING_ROD, stack: 1, durability: 64 },
  [ITEM.RAW_FISH]: { name: 'Raw Fish', tile: TILES.RAW_FISH, food: 2 },
  [ITEM.COOKED_FISH]: { name: 'Cooked Fish', tile: TILES.COOKED_FISH, food: 6 },
  // ---- Phase 4: new mob drops + saddle ---------------------------------------------
  [ITEM.GHAST_TEAR]: { name: 'Ghast Tear', tile: TILES.GHAST_TEAR },
  [ITEM.SLIMEBALL]: { name: 'Slimeball', tile: TILES.SLIMEBALL },
  [ITEM.MAGMA_CREAM]: { name: 'Magma Cream', tile: TILES.MAGMA_CREAM },
  // Ink sacs double as the black dye (gray tones mix in bone meal).
  [ITEM.INK_SAC]: { name: 'Ink Sac', tile: TILES.INK_SAC },
  [ITEM.SADDLE]: { name: 'Saddle', tile: TILES.SADDLE, stack: 1 },
  // ---- Phase 7: brewing, potions, shield -------------------------------------------
  [ITEM.GLASS_BOTTLE]: { name: 'Glass Bottle', tile: TILES.GLASS_BOTTLE, stack: 16 },
  [ITEM.WATER_BOTTLE]: { name: 'Water Bottle', tile: TILES.POTION_WATER, stack: 1 },
  [ITEM.NETHER_WART]: { name: 'Nether Wart', tile: TILES.NETHER_WART_ITEM },
  [ITEM.BLAZE_POWDER]: { name: 'Blaze Powder', tile: TILES.BLAZE_POWDER },
  [ITEM.FERMENTED_SPIDER_EYE]: { name: 'Fermented Spider Eye', tile: TILES.FERMENTED_SPIDER_EYE },
  [ITEM.POTION_AWKWARD]: { name: 'Awkward Potion', tile: TILES.POTION_AWKWARD, stack: 1, potion: true },
  [ITEM.POTION_SPEED]: { name: 'Potion of Swiftness', tile: TILES.POTION_SPEED, stack: 1, potion: true },
  [ITEM.POTION_STRENGTH]: { name: 'Potion of Strength', tile: TILES.POTION_STRENGTH, stack: 1, potion: true },
  [ITEM.POTION_HEALING]: { name: 'Potion of Healing', tile: TILES.POTION_HEALING, stack: 1, potion: true },
  [ITEM.POTION_POISON]: { name: 'Potion of Poison', tile: TILES.POTION_POISON, stack: 1, potion: true },
  [ITEM.POTION_REGEN]: { name: 'Potion of Regeneration', tile: TILES.POTION_REGEN, stack: 1, potion: true },
  [ITEM.POTION_FIRE_RES]: { name: 'Potion of Fire Resistance', tile: TILES.POTION_FIRE_RES, stack: 1, potion: true },
  [ITEM.POTION_NIGHT_VISION]: { name: 'Potion of Night Vision', tile: TILES.POTION_NIGHT_VISION, stack: 1, potion: true },
  [ITEM.POTION_WATER_BREATHING]: { name: 'Potion of Water Breathing', tile: TILES.POTION_WATER_BREATHING, stack: 1, potion: true },
  [ITEM.POTION_SLOWNESS]: { name: 'Potion of Slowness', tile: TILES.POTION_SLOWNESS, stack: 1, potion: true },
  [ITEM.POTION_WEAKNESS]: { name: 'Potion of Weakness', tile: TILES.POTION_WEAKNESS, stack: 1, potion: true },
  // Shield: hold right-click to block (30% move speed; frontal damage -66%,
  // the prevented damage is charged to the shield's durability instead).
  [ITEM.SHIELD]: { name: 'Shield', tile: TILES.SHIELD, stack: 1, durability: 336 },
  // ---- Phase 5: worldgen 2.0 currencies -------------------------------------------
  [ITEM.EMERALD]: { name: 'Emerald', tile: TILES.EMERALD },
  [ITEM.LAPIS]: { name: 'Lapis Lazuli', tile: TILES.LAPIS },
};

// True if an item ID refers to a placeable block (vs. an item-only thing).
export function isBlockItem(id) {
  return id !== BLOCK.AIR && BLOCKS[id] !== undefined;
}

// Unified lookup for any inventory item, block or not. Returns { name, tile }.
export function itemDef(id) {
  if (isBlockItem(id)) {
    const b = BLOCKS[id];
    return { name: b.name, tile: b.top };
  }
  return ITEMS[id] || { name: 'Unknown', tile: 0 };
}

// Hunger restored by eating an item, or 0 if it isn't food.
export function foodValue(id) {
  const it = ITEMS[id];
  return it && it.food ? it.food : 0;
}

export function itemStackMax(id) {
  const it = ITEMS[id];
  return it && it.stack ? it.stack : STACK_MAX;
}

export function toolKind(id) {
  const it = ITEMS[id];
  return it && it.tool ? it.tool : null;
}

export function toolTier(id) {
  const it = ITEMS[id];
  return it && it.tier ? it.tier : 0;
}

// Mining SPEED tier of a tool: `speedTier` override if present (gold tools mine
// fast despite their low capability tier), otherwise the capability tier.
export function toolSpeedTier(id) {
  const it = ITEMS[id];
  if (!it) return 0;
  return it.speedTier ? it.speedTier : (it.tier || 0);
}

export function breakDuration(blockId, itemId = null, efficiencyLevel = 0) {
  const b = BLOCKS[blockId];
  if (!b || !Number.isFinite(b.hardness)) return Infinity;
  const tool = toolKind(itemId);
  const tier = toolTier(itemId);
  if (b.minTier && (tool !== b.tool || tier < b.minTier)) return Math.max(0.25, b.hardness * 3.5);
  let speed = tool && tool === b.tool ? 2.4 + toolSpeedTier(itemId) * 1.15 : tool ? 1.25 : 1;
  // Efficiency only helps when the right tool is used on the block.
  if (efficiencyLevel > 0 && tool && tool === b.tool) speed *= 1 + 0.3 * efficiencyLevel;
  return Math.max(0.12, b.hardness / speed);
}

// Enchantment level stored on an inventory stack (0 if absent).
export function stackEnchant(stack, key) {
  return stack && stack.enchantments ? (stack.enchantments[key] || 0) : 0;
}

export function attackDamage(itemId = null) {
  switch (itemId) {
    case ITEM.DIAMOND_SWORD: return 13;
    case ITEM.DIAMOND_AXE: return 11;
    case ITEM.IRON_SWORD: return 10;
    case ITEM.IRON_AXE: return 8;
    case ITEM.DIAMOND_PICKAXE: return 8;
    case ITEM.STONE_SWORD: return 7;
    case ITEM.DIAMOND_SHOVEL: return 7;
    case ITEM.IRON_PICKAXE: return 6;
    case ITEM.STONE_AXE: return 6;
    case ITEM.WOODEN_AXE: return 5;
    case ITEM.STONE_PICKAXE: return 5;
    case ITEM.IRON_SHOVEL: return 5;
    case ITEM.GOLDEN_AXE: return 5;
    case ITEM.WOODEN_SWORD: return 4;
    case ITEM.WOODEN_PICKAXE: return 4;
    case ITEM.STONE_SHOVEL: return 4;
    case ITEM.GOLDEN_SWORD: return 4;   // gold: fast but weak, like wood
    case ITEM.GOLDEN_PICKAXE: return 4;
    case ITEM.WOODEN_SHOVEL: return 3;
    case ITEM.GOLDEN_SHOVEL: return 3;
    default: return 1;
  }
}

// ---- Smelting / fuel --------------------------------------------------------
// A furnace turns one `input` item into one `output` item over `SMELT_TIME`
// seconds while it has fuel. FUEL maps an item id -> seconds of burn time one
// of it provides.
export const SMELT_TIME = 6;        // seconds to smelt one item
export const SMELTING = {
  [ITEM.RAW_IRON]:    { id: ITEM.IRON_INGOT,   count: 1 },
  [ITEM.RAW_PORK]:    { id: ITEM.COOKED_PORK,  count: 1 },
  [ITEM.RAW_BEEF]:    { id: ITEM.COOKED_BEEF,  count: 1 },
  [BLOCK.SAND]:       { id: BLOCK.GLASS,       count: 1 },
  [BLOCK.GOLD_ORE]:   { id: ITEM.GOLD_INGOT,   count: 1 },
  [ITEM.RAW_CHICKEN]: { id: ITEM.COOKED_CHICKEN, count: 1 },
  [BLOCK.COBBLESTONE]: { id: BLOCK.STONE,      count: 1 },
  [BLOCK.CLAY]:       { id: BLOCK.BRICK,       count: 1 },
  [BLOCK.NETHERRACK]: { id: BLOCK.NETHER_BRICK, count: 1 },
  [BLOCK.CACTUS]:     { id: ITEM.GREEN_DYE,    count: 1 },
  [ITEM.RAW_FISH]:    { id: ITEM.COOKED_FISH,  count: 1 },
};
export const FUEL = {
  [ITEM.COAL]:    16,
  [BLOCK.WOOD]:   12,
  [BLOCK.BIRCH_WOOD]: 12,
  [BLOCK.SPRUCE_WOOD]: 12,
  [BLOCK.PLANK]:  6,
  [BLOCK.BIRCH_PLANK]: 6,
  [BLOCK.SPRUCE_PLANK]: 6,
  [ITEM.STICK]:   2,
  [ITEM.BLAZE_ROD]: 60,
  // Lava bucket: huge burn; the furnace hands the empty bucket back (furnace.js).
  [ITEM.LAVA_BUCKET]: 100,
};
export function smeltResult(id) { return SMELTING[id] || null; }
export function fuelValue(id) { return FUEL[id] || 0; }

// ---- Armor ------------------------------------------------------------------
// Total armor points reduce incoming damage. Each point mitigates 4% up to a
// 60% cap (see survival.js). armorSlot is 'head' | 'chest' | 'legs' | 'feet'.
export function armorPoints(id) {
  const it = ITEMS[id];
  return it && it.armor ? it.armor : 0;
}
export function armorSlotOf(id) {
  const it = ITEMS[id];
  return it && it.armorSlot ? it.armorSlot : null;
}

// What a broken block yields, as { id, count } drops. Most blocks drop
// themselves; leaves drop nothing here (the apple roll is random and handled by
// the caller). Water/air/bedrock cannot be collected.
export function blockDrop(id, itemId = null) {
  const b = BLOCKS[id];
  if (b && b.minTier && (toolKind(itemId) !== b.tool || toolTier(itemId) < b.minTier)) return [];
  if (b && b.drops) {
    // Ranged drops: an entry with `max` rolls count..max (e.g. lapis 4-8).
    if (b.drops.some((d) => d.max)) {
      return b.drops.map((d) => d.max
        ? { id: d.id, count: d.count + Math.floor(Math.random() * (d.max - d.count + 1)) }
        : d);
    }
    return b.drops;
  }
  switch (id) {
    case BLOCK.AIR:
    case BLOCK.WATER:
    case BLOCK.BEDROCK:
      return [];
    case BLOCK.COAL_ORE:
      return [{ id: ITEM.COAL, count: 1 }];
    case BLOCK.IRON_ORE:
      return [{ id: ITEM.RAW_IRON, count: 1 }];
    case BLOCK.REDSTONE_ORE:
      return [{ id: ITEM.REDSTONE, count: 2 }];
    case BLOCK.DIAMOND_ORE:
      return [{ id: ITEM.DIAMOND, count: 1 }];
    case BLOCK.FURNACE_LIT:
      return [{ id: BLOCK.FURNACE, count: 1 }];
    case BLOCK.GLASS:
      return [];
    case BLOCK.LEAVES:
      return [];
    case BLOCK.GRASS:
      return [{ id: BLOCK.DIRT, count: 1 }];
    case BLOCK.TALL_GRASS:
      return [];
    case BLOCK.FLOWER_RED:
      return [{ id: BLOCK.FLOWER_RED, count: 1 }];
    case BLOCK.FLOWER_YELLOW:
      return [{ id: BLOCK.FLOWER_YELLOW, count: 1 }];
    case BLOCK.TORCH:
      return [{ id: ITEM.TORCH, count: 1 }];
    case BLOCK.LADDER:
      return [{ id: ITEM.LADDER, count: 1 }];
    case BLOCK.CHEST:
      return [{ id: ITEM.CHEST_ITEM, count: 1 }];
    case BLOCK.DOOR_BOTTOM:
      return [{ id: ITEM.DOOR, count: 1 }];
    case BLOCK.DOOR_TOP:
      return [];
    case BLOCK.BED_HEAD:
      return [{ id: ITEM.BED, count: 1 }];
    case BLOCK.BED_FOOT:
      return [];
    default:
      return [{ id, count: 1 }];
  }
}

// Chance a broken leaves block drops an apple.
export const APPLE_DROP_CHANCE = 0.08;

// ---- Farming ----------------------------------------------------------------
// Chance a broken tall-grass block drops wheat seeds.
export const SEED_DROP_CHANCE = 0.4;
// Per-second chance that a growing wheat crop advances one stage.
export const WHEAT_GROW_CHANCE = 0.02;
// Per-second chance a player-planted sugar cane grows one segment (max 3 tall).
export const CANE_GROW_CHANCE = 0.02;
// Ordered wheat growth stages (used by the crop ticker in main.js).
export const WHEAT_STAGES = [BLOCK.WHEAT_0, BLOCK.WHEAT_1, BLOCK.WHEAT_2, BLOCK.WHEAT_3];
export const CARROT_STAGES = [BLOCK.CARROT_0, BLOCK.CARROT_1, BLOCK.CARROT_2];
// Nether wart joins the generic crop chains (edit-scan growth ticker, bone
// meal, pop-when-support-breaks) but only PLANTS on soul sand (main.js).
export const NETHER_WART_STAGES = [BLOCK.NETHER_WART_0, BLOCK.NETHER_WART_1, BLOCK.NETHER_WART_2];
const CROP_CHAINS = [WHEAT_STAGES, CARROT_STAGES, NETHER_WART_STAGES];

// The next growth stage for a crop block, or 0 if it is mature / not a crop.
export function nextCropStage(id) {
  for (const chain of CROP_CHAINS) {
    const i = chain.indexOf(id);
    if (i >= 0 && i < chain.length - 1) return chain[i + 1];
  }
  return 0;
}
export function isCropBlock(id) {
  return CROP_CHAINS.some((chain) => chain.includes(id));
}

// ---- Biomes -----------------------------------------------------------------
// Picked per-column from low-frequency temperature/moisture noise. Biomes only
// repaint the surface palette and vary tree density - terrain HEIGHT is shared
// across all biomes so their borders never form cliffs.
export const BIOME = {
  PLAINS: 0, FOREST: 1, DESERT: 2, SNOW: 3, JUNGLE: 4, MUSHROOM: 5, FLOWER_FOREST: 6,
  // Phase 5 (GEN_V2 worlds only): continentalness-driven biomes.
  OCEAN: 7, BEACH: 8, MOUNTAINS: 9, BIRCH_FOREST: 10, TAIGA: 11, SWAMP: 12,
};
export const BIOMES = {
  [BIOME.PLAINS]:        { name: 'Plains',        surface: BLOCK.GRASS, subsurface: BLOCK.DIRT, treeChance: 0.012 },
  [BIOME.FOREST]:        { name: 'Forest',        surface: BLOCK.GRASS, subsurface: BLOCK.DIRT, treeChance: 0.060 },
  [BIOME.DESERT]:        { name: 'Desert',        surface: BLOCK.SAND,  subsurface: BLOCK.SAND, treeChance: 0.000 },
  [BIOME.SNOW]:          { name: 'Snow',          surface: BLOCK.SNOW,  subsurface: BLOCK.DIRT, treeChance: 0.015 },
  [BIOME.JUNGLE]:        { name: 'Jungle',        surface: BLOCK.GRASS, subsurface: BLOCK.DIRT, treeChance: 0.085, tallTree: true },
  [BIOME.MUSHROOM]:      { name: 'Mushroom',      surface: BLOCK.GRASS, subsurface: BLOCK.DIRT, treeChance: 0.000, mushroomChance: 0.03 },
  [BIOME.FLOWER_FOREST]: { name: 'Flower Forest', surface: BLOCK.GRASS, subsurface: BLOCK.DIRT, treeChance: 0.035, flowerChance: 0.12 },
  // ---- Phase 5: GEN_V2 biomes ---------------------------------------------------
  [BIOME.OCEAN]:         { name: 'Ocean',         surface: BLOCK.SAND,  subsurface: BLOCK.SAND, treeChance: 0.000 },
  [BIOME.BEACH]:         { name: 'Beach',         surface: BLOCK.SAND,  subsurface: BLOCK.SAND, treeChance: 0.000 },
  // Mountains: bare stone surface; generateChunkV2 caps peaks above y 80 in snow.
  [BIOME.MOUNTAINS]:     { name: 'Mountains',     surface: BLOCK.STONE, subsurface: BLOCK.STONE, treeChance: 0.003 },
  [BIOME.BIRCH_FOREST]:  { name: 'Birch Forest',  surface: BLOCK.GRASS, subsurface: BLOCK.DIRT, treeChance: 0.055 },
  [BIOME.TAIGA]:         { name: 'Taiga',         surface: BLOCK.GRASS, subsurface: BLOCK.DIRT, treeChance: 0.045 },
  [BIOME.SWAMP]:         { name: 'Swamp',         surface: BLOCK.GRASS, subsurface: BLOCK.DIRT, treeChance: 0.028 },
};
export function biomeDef(id) { return BIOMES[id]; }

// ---- Dimensions ---------------------------------------------------------------
// One descriptor per dimension. `hasSky` drives lighting (sun seeding) and sky
// rendering; `editKeyPrefix` namespaces per-block container keys (furnaces,
// chests) so two dimensions never collide on the same coordinates. The end is
// declared ahead of time but unused until it ships.
export const DIMENSIONS = {
  overworld: { id: 'overworld', hasSky: true,  editKeyPrefix: '' },
  nether:    { id: 'nether',    hasSky: false, editKeyPrefix: 'N|' },
  end:       { id: 'end',       hasSky: false, editKeyPrefix: 'E|' },
};

// ---- Edit-diff encoding -------------------------------------------------------
// Player edits are stored as one number per voxel: low 12 bits = block id
// (0..4095), high bits = metadata. Old saves stored the bare id, which decodes
// to meta 0 automatically.
export function encodeEdit(id, meta = 0) { return (id & 4095) | (meta << 12); }
export function decodeEditId(v) { return v & 4095; }
export function decodeEditMeta(v) { return v >>> 12; }

// ---- Block helpers ----------------------------------------------------------
export function isSolid(id) {
  if (id === BLOCK.AIR) return false;
  const b = BLOCKS[id];
  return b ? b.solid : false;
}
export function isTransparent(id) {
  if (id === BLOCK.AIR) return true;       // air never occludes
  const b = BLOCKS[id];
  return b ? b.transparent : false;
}
export function isLiquid(id) {
  const b = BLOCKS[id];
  return b ? !!b.liquid : false;
}

// ---- Fluid metadata ----------------------------------------------------------
// WATER/LAVA cells keep their flow state in per-voxel meta:
//   bits 0-2 = level: 0 = source, 1..7 = flowing (weaker the further from the
//              supplier; water spreads to level 7, lava only to 3)
//   bit 3    = falling-column flag (the cell is part of a vertical stream)
// Worldgen oceans/lava seas default to meta 0, i.e. they are all sources.
export const FLUID_LEVEL_MASK = 7;
export const FLUID_FALLING_BIT = 8;
export function fluidLevel(meta) { return meta & FLUID_LEVEL_MASK; }
export function isFluidFalling(meta) { return (meta & FLUID_FALLING_BIT) !== 0; }
export function fluidMeta(level, falling = false) {
  return (level & FLUID_LEVEL_MASK) | (falling ? FLUID_FALLING_BIT : 0);
}
export function isFluidSource(meta) { return (meta & (FLUID_LEVEL_MASK | FLUID_FALLING_BIT)) === 0; }
export function fluidMaxLevel(id) { return id === BLOCK.LAVA ? 3 : 7; }
export function blockDef(id) { return BLOCKS[id]; }

// Returns the atlas tile index for a given block id and face key ('top'|'bottom'|'side').
export function faceTile(id, key) {
  const b = BLOCKS[id];
  if (!b) return 0;
  return b[key];
}

// ---- Atlas UV helper --------------------------------------------------------
// Returns the UV rectangle for a tile. A tiny padding avoids texture bleeding.
// Convention: the atlas texture is created with `flipY = false`, so v0 is the
// TOP edge of the tile in image space.
const UV_PAD = 0.0015;
export function tileUV(index) {
  const col = index % ATLAS_COLS;
  const row = Math.floor(index / ATLAS_COLS);
  const u0 = col / ATLAS_COLS + UV_PAD;
  const u1 = (col + 1) / ATLAS_COLS - UV_PAD;
  const v0 = row / ATLAS_ROWS + UV_PAD;          // top edge of tile (flipY = false)
  const v1 = (row + 1) / ATLAS_ROWS - UV_PAD;    // bottom edge of tile
  return { u0, v0, u1, v1 };
}

// ---- Canonical cube faces ---------------------------------------------------
// One entry per cube face. Used by chunk meshing so face geometry is defined
// exactly once. Axes: +X right, +Y up, +Z toward the viewer.
//
//   dir     : outward normal (also the neighbour offset used for face culling)
//   tile    : which block-def key supplies the texture ('top'|'bottom'|'side')
//   corners : 4 vertices in CCW order viewed from OUTSIDE (front-facing)
//             ordered bottom-left, bottom-right, top-right, top-left
//   uv      : per-corner [u,v] selector in {0,1}; 0 -> u0/v0, 1 -> u1/v1.
//             v selector is 0 at the world-top corners so tiles render upright.
//
// Triangulate each face as (0,1,2) + (0,2,3).
export const FACES = [
  { dir: [ 1, 0, 0], tile: 'side',   corners: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]], uv: [[0,1],[1,1],[1,0],[0,0]] }, // +X
  { dir: [-1, 0, 0], tile: 'side',   corners: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]], uv: [[0,1],[1,1],[1,0],[0,0]] }, // -X
  { dir: [ 0, 1, 0], tile: 'top',    corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], uv: [[0,1],[1,1],[1,0],[0,0]] }, // +Y (top)
  { dir: [ 0,-1, 0], tile: 'bottom', corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], uv: [[0,1],[1,1],[1,0],[0,0]] }, // -Y (bottom)
  { dir: [ 0, 0, 1], tile: 'side',   corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], uv: [[0,1],[1,1],[1,0],[0,0]] }, // +Z
  { dir: [ 0, 0,-1], tile: 'side',   corners: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], uv: [[0,1],[1,1],[1,0],[0,0]] }, // -Z
];

// ---- Durability ---------------------------------------------------------------
export function itemMaxDurability(id) {
  const it = ITEMS[id];
  return it && it.durability ? it.durability : 0;
}

// ---- Placeable items ----------------------------------------------------------
export function placeableBlock(id) {
  if (isBlockItem(id)) return id;
  const it = ITEMS[id];
  return it && it.placeable ? it.placeable : 0;
}

// ---- Climbable blocks ---------------------------------------------------------
export function isClimbable(id) {
  const b = BLOCKS[id];
  return b ? !!b.climbable : false;
}

// ---- Rails ----------------------------------------------------------------------
export function isRail(id) {
  return id === BLOCK.RAIL || id === BLOCK.POWERED_RAIL || id === BLOCK.POWERED_RAIL_ON;
}

// ---- Light emission -----------------------------------------------------------
export function lightLevel(id) {
  const b = BLOCKS[id];
  return b && b.light ? b.light : 0;
}

// ---- Block model type ---------------------------------------------------------
export function blockModel(id) {
  const b = BLOCKS[id];
  return b && b.model ? b.model : 'cube';
}

// ---- XP system ----------------------------------------------------------------
export function xpForLevel(level) {
  if (level <= 15) return 2 * level + 7;
  if (level <= 30) return 5 * level - 38;
  return 9 * level - 158;
}
export function xpFromKill(type) {
  switch (type) {
    case 'zombie': return 5;
    case 'skeleton': return 5;
    case 'creeper': return 5;
    case 'spider': return 5;
    case 'enderman': return 8;
    case 'zombie_pigman': return 6;
    case 'fire_imp': return 6;
    case 'boss': return 50;
    default: return 1;
  }
}
export function xpFromMining(blockId) {
  switch (blockId) {
    case BLOCK.COAL_ORE: return 1;
    case BLOCK.IRON_ORE: return 1;
    case BLOCK.GOLD_ORE: return 2;
    case BLOCK.REDSTONE_ORE: return 2;
    case BLOCK.DIAMOND_ORE: return 5;
    case BLOCK.EMERALD_ORE: return 4;
    case BLOCK.LAPIS_ORE: return 2;
    case BLOCK.MOB_SPAWNER: return 15;
    case BLOCK.GLOWSTONE: return 1;
    default: return 0;
  }
}
export function xpFromSmelting(itemId) {
  switch (itemId) {
    case ITEM.IRON_INGOT: return 1;
    case ITEM.GOLD_INGOT: return 2;
    default: return 0;
  }
}

// Enchantment definitions. Phase 7: max levels raised to IV, POWER added for
// bows. Level N costs enchantCost(N) XP levels (N+2: I=3 as before, IV=6).
export const ENCHANTMENTS = {
  sharpness:   { name: 'Sharpness',   maxLevel: 4, slot: 'weapon',  desc: '+2 damage per level' },
  efficiency:  { name: 'Efficiency',  maxLevel: 4, slot: 'tool',    desc: '+30% mining speed per level' },
  protection:  { name: 'Protection',  maxLevel: 4, slot: 'armor',   desc: '+1 armor per level' },
  unbreaking:  { name: 'Unbreaking',  maxLevel: 4, slot: 'any',     desc: 'Reduces durability loss' },
  power:       { name: 'Power',       maxLevel: 4, slot: 'bow',     desc: '+25% bow damage per level' },
};

// XP-level cost of buying enchantment level `level` (1-based).
export function enchantCost(level) {
  return level + 2;
}

export function isEnchantable(id) {
  const it = ITEMS[id];
  if (!it) return false;
  return !!(it.tool || it.damage || it.armor || it.bow);
}

// ---- Phase 7: potions ------------------------------------------------------------
// What drinking (or being splashed by) each potion does. Timed entries apply
// through the EffectManager; `instant` entries apply immediately and are never
// stored. Durations: 90 s for buffs (vanilla-ish 3 min halved to keep pace),
// poison 20 s, regen 30 s, slowness/weakness 45 s — documented choice.
export const POTION_EFFECTS = {
  [ITEM.POTION_SPEED]:           { effect: 'speed', amp: 1, dur: 90 },
  [ITEM.POTION_STRENGTH]:        { effect: 'strength', amp: 1, dur: 90 },
  [ITEM.POTION_HEALING]:         { instant: 'heal', amount: 6 },
  [ITEM.POTION_POISON]:          { effect: 'poison', amp: 1, dur: 20 },
  [ITEM.POTION_REGEN]:           { effect: 'regeneration', amp: 1, dur: 30 },
  [ITEM.POTION_FIRE_RES]:        { effect: 'fire_resistance', amp: 1, dur: 90 },
  [ITEM.POTION_NIGHT_VISION]:    { effect: 'night_vision', amp: 1, dur: 90 },
  [ITEM.POTION_WATER_BREATHING]: { effect: 'water_breathing', amp: 1, dur: 90 },
  [ITEM.POTION_SLOWNESS]:        { effect: 'slowness', amp: 1, dur: 45 },
  [ITEM.POTION_WEAKNESS]:        { effect: 'weakness', amp: 1, dur: 45 },
};

// Every drinkable/throwable bottle id (awkward + water have no effect but
// still return the glass bottle when drunk).
export function isPotionItem(id) {
  const it = ITEMS[id];
  return !!(it && it.potion) || id === ITEM.WATER_BOTTLE;
}

// ---- Phase 7: anvil repair materials ----------------------------------------------
// item id -> the raw material that repairs 25% of max durability per unit in
// the anvil. Only items that actually wear (tools/weapons/shield — armor has
// no durability in this game) are listed; anything absent can only be
// repaired by combining two of the same item.
const IRON_GEAR = [ITEM.IRON_PICKAXE, ITEM.IRON_AXE, ITEM.IRON_SHOVEL, ITEM.IRON_SWORD, ITEM.IRON_HOE];
const GOLD_GEAR = [ITEM.GOLDEN_PICKAXE, ITEM.GOLDEN_AXE, ITEM.GOLDEN_SHOVEL, ITEM.GOLDEN_SWORD, ITEM.GOLDEN_HOE];
const DIAMOND_GEAR = [ITEM.DIAMOND_PICKAXE, ITEM.DIAMOND_AXE, ITEM.DIAMOND_SHOVEL, ITEM.DIAMOND_SWORD];
const STONE_GEAR = [ITEM.STONE_PICKAXE, ITEM.STONE_AXE, ITEM.STONE_SHOVEL, ITEM.STONE_SWORD, ITEM.STONE_HOE];
const WOOD_GEAR = [ITEM.WOODEN_PICKAXE, ITEM.WOODEN_AXE, ITEM.WOODEN_SHOVEL, ITEM.WOODEN_SWORD, ITEM.WOODEN_HOE, ITEM.SHIELD];
export const REPAIR_MATERIAL = {};
for (const id of IRON_GEAR) REPAIR_MATERIAL[id] = ITEM.IRON_INGOT;
for (const id of GOLD_GEAR) REPAIR_MATERIAL[id] = ITEM.GOLD_INGOT;
for (const id of DIAMOND_GEAR) REPAIR_MATERIAL[id] = ITEM.DIAMOND;
for (const id of STONE_GEAR) REPAIR_MATERIAL[id] = BLOCK.COBBLESTONE;
for (const id of WOOD_GEAR) REPAIR_MATERIAL[id] = BLOCK.PLANK;
