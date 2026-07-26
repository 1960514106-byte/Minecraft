// =============================================================================
// config.js - Single source of truth for the whole game.
// Every other module imports constants, block definitions and helpers from here
// so there is exactly one definition of the world's data formats.
// =============================================================================

// ---- World dimensions -------------------------------------------------------
export const CHUNK_SIZE = 16;      // blocks per chunk along X and Z
export const CHUNK_HEIGHT = 64;    // total world height in blocks (Y: 0..63)
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
  [ITEM.WOOL]: { name: 'Wool', tile: TILES.WOOL },
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

export function breakDuration(blockId, itemId = null, efficiencyLevel = 0) {
  const b = BLOCKS[blockId];
  if (!b || !Number.isFinite(b.hardness)) return Infinity;
  const tool = toolKind(itemId);
  const tier = toolTier(itemId);
  if (b.minTier && (tool !== b.tool || tier < b.minTier)) return Math.max(0.25, b.hardness * 3.5);
  let speed = tool && tool === b.tool ? 2.4 + tier * 1.15 : tool ? 1.25 : 1;
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
    case ITEM.WOODEN_SWORD: return 4;
    case ITEM.WOODEN_PICKAXE: return 4;
    case ITEM.STONE_SHOVEL: return 4;
    case ITEM.WOODEN_SHOVEL: return 3;
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
};
export const FUEL = {
  [ITEM.COAL]:    16,
  [BLOCK.WOOD]:   12,
  [BLOCK.PLANK]:  6,
  [ITEM.STICK]:   2,
  [ITEM.BLAZE_ROD]: 60,
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
  if (b && b.drops) return b.drops;
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
// Ordered wheat growth stages (used by the crop ticker in main.js).
export const WHEAT_STAGES = [BLOCK.WHEAT_0, BLOCK.WHEAT_1, BLOCK.WHEAT_2, BLOCK.WHEAT_3];
export const CARROT_STAGES = [BLOCK.CARROT_0, BLOCK.CARROT_1, BLOCK.CARROT_2];
const CROP_CHAINS = [WHEAT_STAGES, CARROT_STAGES];

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
export const BIOME = { PLAINS: 0, FOREST: 1, DESERT: 2, SNOW: 3, JUNGLE: 4, MUSHROOM: 5, FLOWER_FOREST: 6 };
export const BIOMES = {
  [BIOME.PLAINS]:        { name: 'Plains',        surface: BLOCK.GRASS, subsurface: BLOCK.DIRT, treeChance: 0.012 },
  [BIOME.FOREST]:        { name: 'Forest',        surface: BLOCK.GRASS, subsurface: BLOCK.DIRT, treeChance: 0.060 },
  [BIOME.DESERT]:        { name: 'Desert',        surface: BLOCK.SAND,  subsurface: BLOCK.SAND, treeChance: 0.000 },
  [BIOME.SNOW]:          { name: 'Snow',          surface: BLOCK.SNOW,  subsurface: BLOCK.DIRT, treeChance: 0.015 },
  [BIOME.JUNGLE]:        { name: 'Jungle',        surface: BLOCK.GRASS, subsurface: BLOCK.DIRT, treeChance: 0.085, tallTree: true },
  [BIOME.MUSHROOM]:      { name: 'Mushroom',      surface: BLOCK.GRASS, subsurface: BLOCK.DIRT, treeChance: 0.000, mushroomChance: 0.03 },
  [BIOME.FLOWER_FOREST]: { name: 'Flower Forest', surface: BLOCK.GRASS, subsurface: BLOCK.DIRT, treeChance: 0.035, flowerChance: 0.12 },
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

// Enchantment definitions
export const ENCHANTMENTS = {
  sharpness:   { name: 'Sharpness',   maxLevel: 3, slot: 'weapon',  desc: '+2 damage per level' },
  efficiency:  { name: 'Efficiency',  maxLevel: 3, slot: 'tool',    desc: '+30% mining speed per level' },
  protection:  { name: 'Protection',  maxLevel: 3, slot: 'armor',   desc: '+1 armor per level' },
  unbreaking:  { name: 'Unbreaking',  maxLevel: 3, slot: 'any',     desc: 'Reduces durability loss' },
};

export function isEnchantable(id) {
  const it = ITEMS[id];
  if (!it) return false;
  return !!(it.tool || it.damage || it.armor);
}
