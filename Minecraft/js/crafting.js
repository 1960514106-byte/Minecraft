// =============================================================================
// crafting.js - Shapeless, 2x2 and crafting-table 3x3 recipes.
// =============================================================================

import { BLOCK, ITEM } from './config.js';

// Shapeless recipe: `need` maps item id -> required count; positions ignored.
const SHAPELESS = [
  { need: { [BLOCK.PLANK]: 4 }, out: { id: BLOCK.CRAFTING_TABLE, count: 1 } },
  { need: { [BLOCK.WOOD]: 1 }, out: { id: BLOCK.PLANK, count: 4 } },
  { need: { [BLOCK.PLANK]: 2 }, out: { id: ITEM.STICK, count: 4 } },
  { need: { [ITEM.IRON_INGOT]: 9 }, out: { id: BLOCK.IRON_BLOCK, count: 1 } },
  { need: { [ITEM.GOLD_INGOT]: 9 }, out: { id: BLOCK.GOLD_BLOCK, count: 1 } },
  { need: { [ITEM.REDSTONE]: 9 }, out: { id: BLOCK.REDSTONE_BLOCK, count: 1 } },
  { need: { [ITEM.DIAMOND]: 9 }, out: { id: BLOCK.DIAMOND_BLOCK, count: 1 } },
  { need: { [ITEM.EMERALD]: 9 }, out: { id: BLOCK.EMERALD_BLOCK, count: 1 } },
  { need: { [BLOCK.IRON_BLOCK]: 1 }, out: { id: ITEM.IRON_INGOT, count: 9 } },
  { need: { [BLOCK.GOLD_BLOCK]: 1 }, out: { id: ITEM.GOLD_INGOT, count: 9 } },
  { need: { [BLOCK.REDSTONE_BLOCK]: 1 }, out: { id: ITEM.REDSTONE, count: 9 } },
  { need: { [BLOCK.DIAMOND_BLOCK]: 1 }, out: { id: ITEM.DIAMOND, count: 9 } },
  { need: { [BLOCK.EMERALD_BLOCK]: 1 }, out: { id: ITEM.EMERALD, count: 9 } },
  { need: { [ITEM.COAL]: 1, [ITEM.STICK]: 1 }, out: { id: ITEM.TORCH, count: 4 } },
  { need: { [ITEM.REDSTONE]: 1, [ITEM.STICK]: 1 }, out: { id: BLOCK.REDSTONE_TORCH, count: 1 } },
  { need: { [BLOCK.COBBLESTONE]: 1, [ITEM.STICK]: 1 }, out: { id: BLOCK.LEVER, count: 1 } },
  // Bread: 3 wheat, shapeless so it also works in the 2x2 grid
  { need: { [ITEM.WHEAT]: 3 }, out: { id: ITEM.BREAD, count: 1 } },
  // Bone meal: grind one bone into 3 doses of crop fertiliser
  { need: { [ITEM.BONE]: 1 }, out: { id: ITEM.BONE_MEAL, count: 3 } },
  // Stone button
  { need: { [BLOCK.STONE]: 1 }, out: { id: BLOCK.BUTTON, count: 1 } },
  // Redstone lamp: glowstone core wrapped in redstone
  { need: { [ITEM.REDSTONE]: 4, [BLOCK.GLOWSTONE]: 1 }, out: { id: BLOCK.REDSTONE_LAMP, count: 1 } },
  // Glowstone block from dust
  { need: { [ITEM.GLOWSTONE_DUST]: 4 }, out: { id: BLOCK.GLOWSTONE, count: 1 } },
  // Flint and steel: iron struck on gravel (flint stand-in)
  { need: { [ITEM.IRON_INGOT]: 1, [BLOCK.GRAVEL]: 1 }, out: { id: ITEM.FLINT_AND_STEEL, count: 1 } },
  // Wood variants: planks from logs, sticks from variant planks
  { need: { [BLOCK.BIRCH_WOOD]: 1 }, out: { id: BLOCK.BIRCH_PLANK, count: 4 } },
  { need: { [BLOCK.SPRUCE_WOOD]: 1 }, out: { id: BLOCK.SPRUCE_PLANK, count: 4 } },
  { need: { [BLOCK.BIRCH_PLANK]: 2 }, out: { id: ITEM.STICK, count: 4 } },
  { need: { [BLOCK.SPRUCE_PLANK]: 2 }, out: { id: ITEM.STICK, count: 4 } },
  // Sugar cane -> sugar
  { need: { [BLOCK.SUGAR_CANE]: 1 }, out: { id: ITEM.SUGAR, count: 1 } },
  // Golden carrot: 1 gold ingot + carrot (no gold nuggets yet)
  { need: { [ITEM.GOLD_INGOT]: 1, [ITEM.CARROT]: 1 }, out: { id: ITEM.GOLDEN_CARROT, count: 1 } },
  // Dyes from flowers + mixes (green comes from smelting cactus)
  { need: { [BLOCK.FLOWER_RED]: 1 }, out: { id: ITEM.RED_DYE, count: 1 } },
  { need: { [BLOCK.FLOWER_YELLOW]: 1 }, out: { id: ITEM.YELLOW_DYE, count: 1 } },
  { need: { [ITEM.RED_DYE]: 1, [ITEM.YELLOW_DYE]: 1 }, out: { id: ITEM.ORANGE_DYE, count: 2 } },
  { need: { [ITEM.GREEN_DYE]: 1, [ITEM.BONE_MEAL]: 1 }, out: { id: ITEM.LIME_DYE, count: 2 } },
  { need: { [ITEM.RED_DYE]: 1, [ITEM.BONE_MEAL]: 1 }, out: { id: ITEM.PINK_DYE, count: 2 } },
  // Dye + white wool -> coloured wool (the other 9 colours await later dye sources)
  { need: { [ITEM.RED_DYE]: 1, [BLOCK.WOOL_WHITE]: 1 }, out: { id: BLOCK.WOOL_RED, count: 1 } },
  { need: { [ITEM.YELLOW_DYE]: 1, [BLOCK.WOOL_WHITE]: 1 }, out: { id: BLOCK.WOOL_YELLOW, count: 1 } },
  { need: { [ITEM.GREEN_DYE]: 1, [BLOCK.WOOL_WHITE]: 1 }, out: { id: BLOCK.WOOL_GREEN, count: 1 } },
  { need: { [ITEM.ORANGE_DYE]: 1, [BLOCK.WOOL_WHITE]: 1 }, out: { id: BLOCK.WOOL_ORANGE, count: 1 } },
  { need: { [ITEM.LIME_DYE]: 1, [BLOCK.WOOL_WHITE]: 1 }, out: { id: BLOCK.WOOL_LIME, count: 1 } },
  { need: { [ITEM.PINK_DYE]: 1, [BLOCK.WOOL_WHITE]: 1 }, out: { id: BLOCK.WOOL_PINK, count: 1 } },
  // Ink sacs act as the black dye directly; gray tones mix in bone meal.
  { need: { [ITEM.INK_SAC]: 1, [BLOCK.WOOL_WHITE]: 1 }, out: { id: BLOCK.WOOL_BLACK, count: 1 } },
  // Light gray (2 bone meal) MUST precede gray (1): shapeless matching accepts
  // supersets of counts, so the more demanding recipe is tried first.
  { need: { [ITEM.INK_SAC]: 1, [ITEM.BONE_MEAL]: 2, [BLOCK.WOOL_WHITE]: 1 }, out: { id: BLOCK.WOOL_LIGHT_GRAY, count: 1 } },
  { need: { [ITEM.INK_SAC]: 1, [ITEM.BONE_MEAL]: 1, [BLOCK.WOOL_WHITE]: 1 }, out: { id: BLOCK.WOOL_GRAY, count: 1 } },
  // Legacy wool item (pre-Phase-2 sheep drops) converts 1:1 into white wool
  { need: { [ITEM.WOOL]: 1 }, out: { id: BLOCK.WOOL_WHITE, count: 1 } },
  // Sticky piston: a piston with a slimeball smeared on the face
  { need: { [BLOCK.PISTON]: 1, [ITEM.SLIMEBALL]: 1 }, out: { id: BLOCK.STICKY_PISTON, count: 1 } },
  // ---- Phase 7: brewing ---------------------------------------------------------
  // Blaze powder: one rod grinds into two doses
  { need: { [ITEM.BLAZE_ROD]: 1 }, out: { id: ITEM.BLAZE_POWDER, count: 2 } },
  // Fermented spider eye: sugar + spider eye (vanilla adds a brown mushroom —
  // no mushroom item exists, documented simplification)
  { need: { [ITEM.SUGAR]: 1, [ITEM.SPIDER_EYE]: 1 }, out: { id: ITEM.FERMENTED_SPIDER_EYE, count: 1 } },
  // ---- Phase 9: the End -----------------------------------------------------------
  // Eye of ender: an ender pearl charged with blaze powder
  { need: { [ITEM.ENDER_PEARL]: 1, [ITEM.BLAZE_POWDER]: 1 }, out: { id: ITEM.EYE_OF_ENDER, count: 1 } },
];

// Inventory 2x2 recipes. `shape` is [top-left, top-right, bottom-left, bottom-right].
// Shapes are normalised at load time (trimmed to their bounding box, mirror
// tried automatically), so each pattern is written once and matches anywhere
// it fits in the grid.
const SHAPED_2 = [
  { shape: [BLOCK.PLANK, BLOCK.PLANK, ITEM.STICK, ITEM.STICK], out: { id: ITEM.WOODEN_PICKAXE, count: 1 } },
  { shape: [BLOCK.PLANK, BLOCK.PLANK, ITEM.STICK, null], out: { id: ITEM.WOODEN_AXE, count: 1 } },
  { shape: [BLOCK.PLANK, null, ITEM.STICK, null], out: { id: ITEM.WOODEN_SHOVEL, count: 1 } },
  { shape: [BLOCK.STONE, BLOCK.STONE, ITEM.STICK, ITEM.STICK], out: { id: ITEM.STONE_PICKAXE, count: 1 } },
  { shape: [BLOCK.STONE, BLOCK.STONE, ITEM.STICK, null], out: { id: ITEM.STONE_AXE, count: 1 } },
  { shape: [BLOCK.STONE, null, ITEM.STICK, null], out: { id: ITEM.STONE_SHOVEL, count: 1 } },
  // Pressure plate: two stone side by side
  { shape: [BLOCK.STONE, BLOCK.STONE, null, null], out: { id: BLOCK.PRESSURE_PLATE, count: 1 } },
  // Sandstone: 4 sand in a square
  { shape: [BLOCK.SAND, BLOCK.SAND, BLOCK.SAND, BLOCK.SAND], out: { id: BLOCK.SANDSTONE, count: 1 } },
];

// Crafting table 3x3 recipes. `shape` is row-major, null means the cell must be empty.
const SHAPED_3 = [
  { shape: [BLOCK.PLANK, BLOCK.PLANK, BLOCK.PLANK, null, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.WOODEN_PICKAXE, count: 1 } },
  { shape: [BLOCK.STONE, BLOCK.STONE, BLOCK.STONE, null, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.STONE_PICKAXE, count: 1 } },
  { shape: [ITEM.IRON_INGOT, ITEM.IRON_INGOT, ITEM.IRON_INGOT, null, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.IRON_PICKAXE, count: 1 } },
  { shape: [BLOCK.PLANK, BLOCK.PLANK, null, BLOCK.PLANK, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.WOODEN_AXE, count: 1 } },
  { shape: [BLOCK.STONE, BLOCK.STONE, null, BLOCK.STONE, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.STONE_AXE, count: 1 } },
  { shape: [ITEM.IRON_INGOT, ITEM.IRON_INGOT, null, ITEM.IRON_INGOT, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.IRON_AXE, count: 1 } },
  { shape: [null, BLOCK.PLANK, null, null, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.WOODEN_SHOVEL, count: 1 } },
  { shape: [null, BLOCK.STONE, null, null, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.STONE_SHOVEL, count: 1 } },
  { shape: [null, ITEM.IRON_INGOT, null, null, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.IRON_SHOVEL, count: 1 } },
  { shape: [null, BLOCK.PLANK, null, null, BLOCK.PLANK, null, null, ITEM.STICK, null], out: { id: ITEM.WOODEN_SWORD, count: 1 } },
  { shape: [null, BLOCK.STONE, null, null, BLOCK.STONE, null, null, ITEM.STICK, null], out: { id: ITEM.STONE_SWORD, count: 1 } },
  { shape: [null, ITEM.IRON_INGOT, null, null, ITEM.IRON_INGOT, null, null, ITEM.STICK, null], out: { id: ITEM.IRON_SWORD, count: 1 } },
  // Furnace: 8 stone in a ring, center empty
  { shape: [BLOCK.STONE, BLOCK.STONE, BLOCK.STONE, BLOCK.STONE, null, BLOCK.STONE, BLOCK.STONE, BLOCK.STONE, BLOCK.STONE], out: { id: BLOCK.FURNACE, count: 1 } },
  // Armor recipes
  { shape: [ITEM.LEATHER, ITEM.LEATHER, ITEM.LEATHER, ITEM.LEATHER, null, ITEM.LEATHER, null, null, null], out: { id: ITEM.LEATHER_HELMET, count: 1 } },
  { shape: [ITEM.LEATHER, null, ITEM.LEATHER, ITEM.LEATHER, ITEM.LEATHER, ITEM.LEATHER, ITEM.LEATHER, ITEM.LEATHER, ITEM.LEATHER], out: { id: ITEM.LEATHER_CHEST, count: 1 } },
  { shape: [ITEM.LEATHER, ITEM.LEATHER, ITEM.LEATHER, ITEM.LEATHER, null, ITEM.LEATHER, ITEM.LEATHER, null, ITEM.LEATHER], out: { id: ITEM.LEATHER_LEGS, count: 1 } },
  { shape: [null, null, null, ITEM.LEATHER, null, ITEM.LEATHER, ITEM.LEATHER, null, ITEM.LEATHER], out: { id: ITEM.LEATHER_BOOTS, count: 1 } },
  { shape: [ITEM.IRON_INGOT, ITEM.IRON_INGOT, ITEM.IRON_INGOT, ITEM.IRON_INGOT, null, ITEM.IRON_INGOT, null, null, null], out: { id: ITEM.IRON_HELMET, count: 1 } },
  { shape: [ITEM.IRON_INGOT, null, ITEM.IRON_INGOT, ITEM.IRON_INGOT, ITEM.IRON_INGOT, ITEM.IRON_INGOT, ITEM.IRON_INGOT, ITEM.IRON_INGOT, ITEM.IRON_INGOT], out: { id: ITEM.IRON_CHEST, count: 1 } },
  { shape: [ITEM.IRON_INGOT, ITEM.IRON_INGOT, ITEM.IRON_INGOT, ITEM.IRON_INGOT, null, ITEM.IRON_INGOT, ITEM.IRON_INGOT, null, ITEM.IRON_INGOT], out: { id: ITEM.IRON_LEGS, count: 1 } },
  { shape: [null, null, null, ITEM.IRON_INGOT, null, ITEM.IRON_INGOT, ITEM.IRON_INGOT, null, ITEM.IRON_INGOT], out: { id: ITEM.IRON_BOOTS, count: 1 } },
  // Diamond tools
  { shape: [ITEM.DIAMOND, ITEM.DIAMOND, ITEM.DIAMOND, null, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.DIAMOND_PICKAXE, count: 1 } },
  { shape: [ITEM.DIAMOND, ITEM.DIAMOND, null, ITEM.DIAMOND, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.DIAMOND_AXE, count: 1 } },
  { shape: [null, ITEM.DIAMOND, null, null, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.DIAMOND_SHOVEL, count: 1 } },
  { shape: [null, ITEM.DIAMOND, null, null, ITEM.DIAMOND, null, null, ITEM.STICK, null], out: { id: ITEM.DIAMOND_SWORD, count: 1 } },
  // Diamond armor
  { shape: [ITEM.DIAMOND, ITEM.DIAMOND, ITEM.DIAMOND, ITEM.DIAMOND, null, ITEM.DIAMOND, null, null, null], out: { id: ITEM.DIAMOND_HELMET, count: 1 } },
  { shape: [ITEM.DIAMOND, null, ITEM.DIAMOND, ITEM.DIAMOND, ITEM.DIAMOND, ITEM.DIAMOND, ITEM.DIAMOND, ITEM.DIAMOND, ITEM.DIAMOND], out: { id: ITEM.DIAMOND_CHEST, count: 1 } },
  { shape: [ITEM.DIAMOND, ITEM.DIAMOND, ITEM.DIAMOND, ITEM.DIAMOND, null, ITEM.DIAMOND, ITEM.DIAMOND, null, ITEM.DIAMOND], out: { id: ITEM.DIAMOND_LEGS, count: 1 } },
  { shape: [null, null, null, ITEM.DIAMOND, null, ITEM.DIAMOND, ITEM.DIAMOND, null, ITEM.DIAMOND], out: { id: ITEM.DIAMOND_BOOTS, count: 1 } },
  // Door, ladder, chest, bed
  { shape: [BLOCK.PLANK, BLOCK.PLANK, null, BLOCK.PLANK, BLOCK.PLANK, null, BLOCK.PLANK, BLOCK.PLANK, null], out: { id: ITEM.DOOR, count: 1 } },
  { shape: [ITEM.STICK, null, ITEM.STICK, ITEM.STICK, ITEM.STICK, ITEM.STICK, ITEM.STICK, null, ITEM.STICK], out: { id: ITEM.LADDER, count: 3 } },
  { shape: [BLOCK.PLANK, BLOCK.PLANK, BLOCK.PLANK, BLOCK.PLANK, null, BLOCK.PLANK, BLOCK.PLANK, BLOCK.PLANK, BLOCK.PLANK], out: { id: ITEM.CHEST_ITEM, count: 1 } },
  { shape: [BLOCK.PLANK, ITEM.WOOL, ITEM.WOOL, BLOCK.PLANK, ITEM.WOOL, ITEM.WOOL, BLOCK.PLANK, null, null], out: { id: ITEM.BED, count: 1 } },
  // Enchanting table: diamond + obsidian pattern (use iron blocks as obsidian stand-in)
  { shape: [null, ITEM.DIAMOND, null, ITEM.DIAMOND, BLOCK.IRON_BLOCK, ITEM.DIAMOND, BLOCK.IRON_BLOCK, BLOCK.IRON_BLOCK, BLOCK.IRON_BLOCK], out: { id: BLOCK.ENCHANTING_TABLE, count: 1 } },
  // Stone bricks: 4 stone in a square
  { shape: [BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, null, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, null, null, null, null], out: { id: BLOCK.STONE_BRICK, count: 4 } },
  // Bricks: 4 clay + coal (simplified from MC)
  { shape: [BLOCK.CLAY, BLOCK.CLAY, null, BLOCK.CLAY, BLOCK.CLAY, null, null, null, null], out: { id: BLOCK.BRICK, count: 4 } },
  // Fence: sticks and planks
  { shape: [BLOCK.PLANK, ITEM.STICK, BLOCK.PLANK, BLOCK.PLANK, ITEM.STICK, BLOCK.PLANK, null, null, null], out: { id: BLOCK.FENCE, count: 6 } },
  // Bookshelf
  { shape: [BLOCK.PLANK, BLOCK.PLANK, BLOCK.PLANK, null, null, null, BLOCK.PLANK, BLOCK.PLANK, BLOCK.PLANK], out: { id: BLOCK.BOOKSHELF, count: 1 } },
  // Glass pane: 6 glass
  { shape: [BLOCK.GLASS, BLOCK.GLASS, BLOCK.GLASS, BLOCK.GLASS, BLOCK.GLASS, BLOCK.GLASS, null, null, null], out: { id: BLOCK.GLASS_PANE, count: 16 } },
  // Bow: sticks bent around a string column
  { shape: [null, ITEM.STICK, ITEM.STRING, ITEM.STICK, null, ITEM.STRING, null, ITEM.STICK, ITEM.STRING], out: { id: ITEM.BOW, count: 1 } },
  // Arrows: gravel head (flint stand-in), stick shaft, feather fletching
  { shape: [null, BLOCK.GRAVEL, null, null, ITEM.STICK, null, null, ITEM.FEATHER, null], out: { id: ITEM.ARROW, count: 4 } },
  // TNT: gunpowder + sand checkerboard
  { shape: [ITEM.GUNPOWDER, BLOCK.SAND, ITEM.GUNPOWDER, BLOCK.SAND, ITEM.GUNPOWDER, BLOCK.SAND, ITEM.GUNPOWDER, BLOCK.SAND, ITEM.GUNPOWDER], out: { id: BLOCK.TNT, count: 1 } },
  // Hoes: two material blocks on top, sticks down the middle
  { shape: [BLOCK.PLANK, BLOCK.PLANK, null, null, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.WOODEN_HOE, count: 1 } },
  { shape: [BLOCK.STONE, BLOCK.STONE, null, null, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.STONE_HOE, count: 1 } },
  { shape: [ITEM.IRON_INGOT, ITEM.IRON_INGOT, null, null, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.IRON_HOE, count: 1 } },
  // Rails: iron rails around a stick spine
  { shape: [ITEM.IRON_INGOT, null, ITEM.IRON_INGOT, ITEM.IRON_INGOT, ITEM.STICK, ITEM.IRON_INGOT, ITEM.IRON_INGOT, null, ITEM.IRON_INGOT], out: { id: BLOCK.RAIL, count: 16 } },
  // Powered rails: golden rails + a redstone charge
  { shape: [ITEM.GOLD_INGOT, null, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, ITEM.STICK, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, ITEM.REDSTONE, ITEM.GOLD_INGOT], out: { id: BLOCK.POWERED_RAIL, count: 6 } },
  // Minecart: iron bucket shape
  { shape: [ITEM.IRON_INGOT, null, ITEM.IRON_INGOT, ITEM.IRON_INGOT, ITEM.IRON_INGOT, ITEM.IRON_INGOT, null, null, null], out: { id: ITEM.MINECART, count: 1 } },
  // Repeater: two redstone torches bridged by redstone on a stone base
  { shape: [null, null, null, BLOCK.REDSTONE_TORCH, ITEM.REDSTONE, BLOCK.REDSTONE_TORCH, BLOCK.STONE, BLOCK.STONE, BLOCK.STONE], out: { id: BLOCK.REPEATER, count: 1 } },
  // Piston: planks over cobble with an iron core and redstone drive
  { shape: [BLOCK.PLANK, BLOCK.PLANK, BLOCK.PLANK, BLOCK.COBBLESTONE, ITEM.IRON_INGOT, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, ITEM.REDSTONE, BLOCK.COBBLESTONE], out: { id: BLOCK.PISTON, count: 1 } },
  // Overlord Sigil: blaze rods and obsidian around a diamond — summons the boss
  { shape: [ITEM.BLAZE_ROD, BLOCK.OBSIDIAN, ITEM.BLAZE_ROD, BLOCK.OBSIDIAN, ITEM.DIAMOND, BLOCK.OBSIDIAN, ITEM.BLAZE_ROD, BLOCK.OBSIDIAN, ITEM.BLAZE_ROD], out: { id: ITEM.BOSS_SIGIL, count: 1 } },
  // Golden apple: apple wrapped in gold
  { shape: [ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, ITEM.APPLE, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT], out: { id: ITEM.GOLDEN_APPLE, count: 1 } },
  // Gold tools (mirror the iron shapes)
  { shape: [ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, null, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.GOLDEN_PICKAXE, count: 1 } },
  { shape: [ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, null, ITEM.GOLD_INGOT, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.GOLDEN_AXE, count: 1 } },
  { shape: [null, ITEM.GOLD_INGOT, null, null, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.GOLDEN_SHOVEL, count: 1 } },
  { shape: [null, ITEM.GOLD_INGOT, null, null, ITEM.GOLD_INGOT, null, null, ITEM.STICK, null], out: { id: ITEM.GOLDEN_SWORD, count: 1 } },
  { shape: [ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, null, null, ITEM.STICK, null, null, ITEM.STICK, null], out: { id: ITEM.GOLDEN_HOE, count: 1 } },
  // Gold armor (mirror the iron shapes)
  { shape: [ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, null, ITEM.GOLD_INGOT, null, null, null], out: { id: ITEM.GOLDEN_HELMET, count: 1 } },
  { shape: [ITEM.GOLD_INGOT, null, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT], out: { id: ITEM.GOLDEN_CHEST, count: 1 } },
  { shape: [ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, null, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, null, ITEM.GOLD_INGOT], out: { id: ITEM.GOLDEN_LEGS, count: 1 } },
  { shape: [null, null, null, ITEM.GOLD_INGOT, null, ITEM.GOLD_INGOT, ITEM.GOLD_INGOT, null, ITEM.GOLD_INGOT], out: { id: ITEM.GOLDEN_BOOTS, count: 1 } },
  // Wood-variant fences
  { shape: [BLOCK.BIRCH_PLANK, ITEM.STICK, BLOCK.BIRCH_PLANK, BLOCK.BIRCH_PLANK, ITEM.STICK, BLOCK.BIRCH_PLANK, null, null, null], out: { id: BLOCK.BIRCH_FENCE, count: 6 } },
  { shape: [BLOCK.SPRUCE_PLANK, ITEM.STICK, BLOCK.SPRUCE_PLANK, BLOCK.SPRUCE_PLANK, ITEM.STICK, BLOCK.SPRUCE_PLANK, null, null, null], out: { id: BLOCK.SPRUCE_FENCE, count: 6 } },
  // Slabs: 3 of the material in a row -> 6 slabs
  { shape: [BLOCK.PLANK, BLOCK.PLANK, BLOCK.PLANK, null, null, null, null, null, null], out: { id: BLOCK.OAK_SLAB, count: 6 } },
  { shape: [BLOCK.STONE, BLOCK.STONE, BLOCK.STONE, null, null, null, null, null, null], out: { id: BLOCK.STONE_SLAB, count: 6 } },
  { shape: [BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, null, null, null, null, null, null], out: { id: BLOCK.COBBLESTONE_SLAB, count: 6 } },
  { shape: [BLOCK.BRICK, BLOCK.BRICK, BLOCK.BRICK, null, null, null, null, null, null], out: { id: BLOCK.BRICK_SLAB, count: 6 } },
  { shape: [BLOCK.STONE_BRICK, BLOCK.STONE_BRICK, BLOCK.STONE_BRICK, null, null, null, null, null, null], out: { id: BLOCK.STONE_BRICK_SLAB, count: 6 } },
  { shape: [BLOCK.SANDSTONE, BLOCK.SANDSTONE, BLOCK.SANDSTONE, null, null, null, null, null, null], out: { id: BLOCK.SANDSTONE_SLAB, count: 6 } },
  { shape: [BLOCK.BIRCH_PLANK, BLOCK.BIRCH_PLANK, BLOCK.BIRCH_PLANK, null, null, null, null, null, null], out: { id: BLOCK.BIRCH_SLAB, count: 6 } },
  { shape: [BLOCK.SPRUCE_PLANK, BLOCK.SPRUCE_PLANK, BLOCK.SPRUCE_PLANK, null, null, null, null, null, null], out: { id: BLOCK.SPRUCE_SLAB, count: 6 } },
  // Stairs: the 6-block staircase (mirror matches the other orientation)
  { shape: [BLOCK.PLANK, null, null, BLOCK.PLANK, BLOCK.PLANK, null, BLOCK.PLANK, BLOCK.PLANK, BLOCK.PLANK], out: { id: BLOCK.OAK_STAIRS, count: 4 } },
  { shape: [BLOCK.COBBLESTONE, null, null, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, null, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE], out: { id: BLOCK.COBBLESTONE_STAIRS, count: 4 } },
  { shape: [BLOCK.BRICK, null, null, BLOCK.BRICK, BLOCK.BRICK, null, BLOCK.BRICK, BLOCK.BRICK, BLOCK.BRICK], out: { id: BLOCK.BRICK_STAIRS, count: 4 } },
  { shape: [BLOCK.STONE_BRICK, null, null, BLOCK.STONE_BRICK, BLOCK.STONE_BRICK, null, BLOCK.STONE_BRICK, BLOCK.STONE_BRICK, BLOCK.STONE_BRICK], out: { id: BLOCK.STONE_BRICK_STAIRS, count: 4 } },
  { shape: [BLOCK.SANDSTONE, null, null, BLOCK.SANDSTONE, BLOCK.SANDSTONE, null, BLOCK.SANDSTONE, BLOCK.SANDSTONE, BLOCK.SANDSTONE], out: { id: BLOCK.SANDSTONE_STAIRS, count: 4 } },
  { shape: [BLOCK.BIRCH_PLANK, null, null, BLOCK.BIRCH_PLANK, BLOCK.BIRCH_PLANK, null, BLOCK.BIRCH_PLANK, BLOCK.BIRCH_PLANK, BLOCK.BIRCH_PLANK], out: { id: BLOCK.BIRCH_STAIRS, count: 4 } },
  { shape: [BLOCK.SPRUCE_PLANK, null, null, BLOCK.SPRUCE_PLANK, BLOCK.SPRUCE_PLANK, null, BLOCK.SPRUCE_PLANK, BLOCK.SPRUCE_PLANK, BLOCK.SPRUCE_PLANK], out: { id: BLOCK.SPRUCE_STAIRS, count: 4 } },
  // Bed also accepts the white wool BLOCK (the ITEM.WOOL recipe above is legacy)
  { shape: [BLOCK.PLANK, BLOCK.WOOL_WHITE, BLOCK.WOOL_WHITE, BLOCK.PLANK, BLOCK.WOOL_WHITE, BLOCK.WOOL_WHITE, BLOCK.PLANK, null, null], out: { id: ITEM.BED, count: 1 } },
  // Bucket: 3 iron ingots in a V
  { shape: [ITEM.IRON_INGOT, null, ITEM.IRON_INGOT, null, ITEM.IRON_INGOT, null, null, null, null], out: { id: ITEM.BUCKET, count: 1 } },
  // Boat: 5 planks in a U (one recipe per plank family, all yield the same boat)
  { shape: [BLOCK.PLANK, null, BLOCK.PLANK, BLOCK.PLANK, BLOCK.PLANK, BLOCK.PLANK, null, null, null], out: { id: ITEM.BOAT, count: 1 } },
  { shape: [BLOCK.BIRCH_PLANK, null, BLOCK.BIRCH_PLANK, BLOCK.BIRCH_PLANK, BLOCK.BIRCH_PLANK, BLOCK.BIRCH_PLANK, null, null, null], out: { id: ITEM.BOAT, count: 1 } },
  { shape: [BLOCK.SPRUCE_PLANK, null, BLOCK.SPRUCE_PLANK, BLOCK.SPRUCE_PLANK, BLOCK.SPRUCE_PLANK, BLOCK.SPRUCE_PLANK, null, null, null], out: { id: ITEM.BOAT, count: 1 } },
  // Fishing rod: 3 sticks on the diagonal, string hanging off the tip
  { shape: [null, null, ITEM.STICK, null, ITEM.STICK, ITEM.STRING, ITEM.STICK, null, ITEM.STRING], out: { id: ITEM.FISHING_ROD, count: 1 } },
  // ---- Phase 6: redstone completion --------------------------------------------
  // Observer: cobble shell around redstone + glass (vanilla uses quartz — no
  // quartz in this game yet, glass stands in for the lens).
  { shape: [BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, ITEM.REDSTONE, ITEM.REDSTONE, BLOCK.GLASS, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE], out: { id: BLOCK.OBSERVER, count: 1 } },
  // Dispenser: 7 cobble around a bow, redstone drive underneath
  { shape: [BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, ITEM.BOW, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, ITEM.REDSTONE, BLOCK.COBBLESTONE], out: { id: BLOCK.DISPENSER, count: 1 } },
  // Dropper: same shell, no bow
  { shape: [BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, null, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, ITEM.REDSTONE, BLOCK.COBBLESTONE], out: { id: BLOCK.DROPPER, count: 1 } },
  // Hopper: 5 iron ingots in a W around a chest
  { shape: [ITEM.IRON_INGOT, null, ITEM.IRON_INGOT, ITEM.IRON_INGOT, ITEM.CHEST_ITEM, ITEM.IRON_INGOT, null, ITEM.IRON_INGOT, null], out: { id: BLOCK.HOPPER, count: 1 } },
  // Note block: 8 planks around redstone
  { shape: [BLOCK.PLANK, BLOCK.PLANK, BLOCK.PLANK, BLOCK.PLANK, ITEM.REDSTONE, BLOCK.PLANK, BLOCK.PLANK, BLOCK.PLANK, BLOCK.PLANK], out: { id: BLOCK.NOTE_BLOCK, count: 1 } },
  // Comparator: three torches over redstone on a stone base (vanilla uses
  // quartz in the middle — redstone stands in, no quartz yet)
  { shape: [null, BLOCK.REDSTONE_TORCH, null, BLOCK.REDSTONE_TORCH, ITEM.REDSTONE, BLOCK.REDSTONE_TORCH, BLOCK.STONE, BLOCK.STONE, BLOCK.STONE], out: { id: BLOCK.COMPARATOR, count: 1 } },
  // ---- Phase 7: brewing / anvil / shield --------------------------------------
  // Brewing stand: a blaze rod planted on 3 cobblestone
  { shape: [null, ITEM.BLAZE_ROD, null, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, BLOCK.COBBLESTONE, null, null, null], out: { id: BLOCK.BREWING_STAND, count: 1 } },
  // Glass bottles: 3 glass in a V -> 3 bottles
  { shape: [BLOCK.GLASS, null, BLOCK.GLASS, null, BLOCK.GLASS, null, null, null, null], out: { id: ITEM.GLASS_BOTTLE, count: 3 } },
  // Anvil: 3 iron blocks over 4 iron ingots (vanilla shape)
  { shape: [BLOCK.IRON_BLOCK, BLOCK.IRON_BLOCK, BLOCK.IRON_BLOCK, null, ITEM.IRON_INGOT, null, ITEM.IRON_INGOT, ITEM.IRON_INGOT, ITEM.IRON_INGOT], out: { id: BLOCK.ANVIL, count: 1 } },
  // Shield: 6 planks in a Y around an iron ingot cap
  { shape: [BLOCK.PLANK, ITEM.IRON_INGOT, BLOCK.PLANK, BLOCK.PLANK, BLOCK.PLANK, BLOCK.PLANK, null, BLOCK.PLANK, null], out: { id: ITEM.SHIELD, count: 1 } },
  // ---- Phase 9: the End -----------------------------------------------------------
  // Beacon: 5 glass around a nether star, on 3 obsidian (vanilla shape)
  { shape: [BLOCK.GLASS, BLOCK.GLASS, BLOCK.GLASS, BLOCK.GLASS, ITEM.NETHER_STAR, BLOCK.GLASS, BLOCK.OBSIDIAN, BLOCK.OBSIDIAN, BLOCK.OBSIDIAN], out: { id: BLOCK.BEACON, count: 1 } },
];

function activeSlots(grid, size) {
  if (size === 3) return grid.slice(0, 9);
  return [grid[0], grid[1], grid[3], grid[4]];
}

function tally(slots) {
  const counts = {};
  for (const s of slots) {
    if (s && s.count > 0) counts[s.id] = (counts[s.id] || 0) + s.count;
  }
  return counts;
}

function matches(need, have) {
  const needKeys = Object.keys(need);
  const haveKeys = Object.keys(have);
  if (needKeys.length !== haveKeys.length) return false;
  for (const k of needKeys) {
    if (!have[k] || have[k] < need[k]) return false;
  }
  return true;
}

function shapeCost(shape) {
  const cost = {};
  for (const id of shape) {
    if (id != null) cost[id] = (cost[id] || 0) + 1;
  }
  return cost;
}

// ---- Shape normalisation -----------------------------------------------------
// Recipes and the query grid are trimmed to their minimal bounding box so a
// pattern matches wherever it sits in the grid, and every recipe's horizontal
// mirror matches automatically — no hand-written mirrored duplicates.

// Trim a row-major `w`-wide id array to its bounding box. null if all empty.
function trimShape(cells, w) {
  const h = cells.length / w;
  let minR = h, maxR = -1, minC = w, maxC = -1;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (cells[r * w + c] != null) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  if (maxR < 0) return null;
  const out = [];
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) out.push(cells[r * w + c]);
  }
  return { w: maxC - minC + 1, h: maxR - minR + 1, cells: out };
}

// The same shape flipped left-to-right.
function mirrorShape(t) {
  const out = [];
  for (let r = 0; r < t.h; r++) {
    for (let c = t.w - 1; c >= 0; c--) out.push(t.cells[r * t.w + c]);
  }
  return { w: t.w, h: t.h, cells: out };
}

function sameShape(a, b) {
  if (!a || !b || a.w !== b.w || a.h !== b.h) return false;
  for (let i = 0; i < a.cells.length; i++) {
    if (a.cells[i] !== b.cells[i]) return false;
  }
  return true;
}

// Pre-normalise every shaped recipe once at load time.
function normalizeShaped(list, gridWidth) {
  return list.map((r) => {
    const norm = trimShape(r.shape, gridWidth);
    return { out: r.out, cost: shapeCost(r.shape), norm, mirror: mirrorShape(norm) };
  });
}
const NORM_2 = normalizeShaped(SHAPED_2, 2);
const NORM_3 = normalizeShaped(SHAPED_3, 3);

function matchedRecipe(grid, size) {
  const slots = activeSlots(grid, size);
  const have = tally(slots);
  if (Object.keys(have).length === 0) return null;

  // Shaped: compare the grid's trimmed bounding box against each recipe's
  // (and its mirror). The crafting table also accepts 2x2 recipes anywhere.
  const gridShape = trimShape(slots.map((s) => (s && s.count > 0 ? s.id : null)), size);
  const shaped = size === 3 ? [...NORM_3, ...NORM_2] : NORM_2;
  for (const r of shaped) {
    if (sameShape(r.norm, gridShape) || sameShape(r.mirror, gridShape)) {
      return { out: r.out, cost: r.cost };
    }
  }
  for (const r of SHAPELESS) {
    if (matches(r.need, have)) return { out: r.out, cost: r.need };
  }
  return null;
}

export function craftResult(grid, size = 2) {
  const recipe = matchedRecipe(grid, size);
  return recipe ? { id: recipe.out.id, count: recipe.out.count } : null;
}

export function craftCost(grid, size = 2) {
  const recipe = matchedRecipe(grid, size);
  return recipe ? recipe.cost : null;
}

// Raw recipe tables, exported for tooling (smoke test, recipe-list rendering).
export { SHAPELESS, SHAPED_2, SHAPED_3 };
