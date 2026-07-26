// =============================================================================
// minimap.js — Top-down 2D minimap showing surrounding terrain.
// =============================================================================

import { BLOCK, SEA_LEVEL, WOOL_BLOCKS, WOOL_RGB } from './config.js';

const SIZE = 120;
const RANGE = 64;

const BLOCK_COLORS = {
  [BLOCK.GRASS]: [95, 158, 64],
  [BLOCK.DIRT]: [135, 96, 68],
  [BLOCK.STONE]: [128, 128, 132],
  [BLOCK.SAND]: [219, 203, 150],
  [BLOCK.WATER]: [60, 100, 190],
  [BLOCK.WOOD]: [110, 80, 50],
  [BLOCK.LEAVES]: [46, 110, 44],
  [BLOCK.SNOW]: [238, 242, 250],
  [BLOCK.PLANK]: [178, 138, 86],
  [BLOCK.CACTUS]: [44, 132, 72],
  [BLOCK.COBBLESTONE]: [110, 110, 114],
  [BLOCK.MOSSY_STONE]: [100, 115, 100],
  [BLOCK.BRICK]: [155, 75, 60],
  [BLOCK.OBSIDIAN]: [26, 16, 40],
  [BLOCK.STONE_BRICK]: [120, 120, 124],
  [BLOCK.GRAVEL]: [130, 125, 120],
  [BLOCK.CLAY]: [160, 165, 175],
  [BLOCK.BOOKSHELF]: [160, 120, 60],
  [BLOCK.TNT]: [200, 60, 45],
  [BLOCK.GLASS]: [200, 225, 235],
  [BLOCK.GLASS_PANE]: [200, 225, 235],
  [BLOCK.FENCE]: [178, 138, 86],
  [BLOCK.RAIL]: [150, 150, 156],
  [BLOCK.POWERED_RAIL]: [190, 160, 70],
  [BLOCK.POWERED_RAIL_ON]: [220, 170, 60],
  [BLOCK.NETHERRACK]: [110, 42, 38],
  [BLOCK.SOUL_SAND]: [96, 74, 56],
  [BLOCK.GLOWSTONE]: [240, 210, 110],
  [BLOCK.NETHER_PORTAL]: [130, 50, 200],
  [BLOCK.NETHER_BRICK]: [66, 26, 30],
  [BLOCK.LAVA]: [230, 110, 30],
  [BLOCK.MOB_SPAWNER]: [40, 46, 52],
  [BLOCK.REDSTONE_LAMP]: [92, 64, 36],
  [BLOCK.REDSTONE_LAMP_ON]: [232, 178, 72],
  [BLOCK.PISTON]: [140, 120, 90],
  [BLOCK.FARMLAND]: [110, 70, 40],
  // Phase 2: slabs/stairs use their base material colour.
  [BLOCK.OAK_SLAB]: [178, 138, 86],
  [BLOCK.STONE_SLAB]: [128, 128, 132],
  [BLOCK.COBBLESTONE_SLAB]: [110, 110, 114],
  [BLOCK.BRICK_SLAB]: [155, 75, 60],
  [BLOCK.STONE_BRICK_SLAB]: [120, 120, 124],
  [BLOCK.SANDSTONE_SLAB]: [222, 206, 156],
  [BLOCK.BIRCH_SLAB]: [214, 196, 150],
  [BLOCK.SPRUCE_SLAB]: [122, 86, 52],
  [BLOCK.OAK_STAIRS]: [178, 138, 86],
  [BLOCK.COBBLESTONE_STAIRS]: [110, 110, 114],
  [BLOCK.BRICK_STAIRS]: [155, 75, 60],
  [BLOCK.STONE_BRICK_STAIRS]: [120, 120, 124],
  [BLOCK.SANDSTONE_STAIRS]: [222, 206, 156],
  [BLOCK.BIRCH_STAIRS]: [214, 196, 150],
  [BLOCK.SPRUCE_STAIRS]: [122, 86, 52],
  [BLOCK.BIRCH_WOOD]: [208, 204, 192],
  [BLOCK.BIRCH_PLANK]: [214, 196, 150],
  [BLOCK.BIRCH_LEAVES]: [92, 160, 70],
  [BLOCK.SPRUCE_WOOD]: [72, 50, 30],
  [BLOCK.SPRUCE_PLANK]: [122, 86, 52],
  [BLOCK.SPRUCE_LEAVES]: [40, 84, 60],
  [BLOCK.BIRCH_FENCE]: [214, 196, 150],
  [BLOCK.SPRUCE_FENCE]: [122, 86, 52],
  [BLOCK.SANDSTONE]: [222, 206, 156],
  [BLOCK.SUGAR_CANE]: [140, 190, 96],
  // Phase 6: redstone completion.
  [BLOCK.STICKY_PISTON]: [124, 150, 96],
  [BLOCK.OBSERVER]: [104, 104, 110],
  [BLOCK.DISPENSER]: [118, 118, 122],
  [BLOCK.DROPPER]: [118, 118, 122],
  [BLOCK.HOPPER]: [64, 64, 70],
  [BLOCK.NOTE_BLOCK]: [108, 78, 52],
  [BLOCK.COMPARATOR]: [148, 148, 152],
  // Phase 7: brewing + anvil.
  [BLOCK.BREWING_STAND]: [150, 120, 70],
  [BLOCK.NETHER_WART_0]: [120, 36, 40],
  [BLOCK.NETHER_WART_1]: [136, 32, 38],
  [BLOCK.NETHER_WART_2]: [152, 28, 36],
  [BLOCK.ANVIL]: [58, 58, 64],
  // Phase 5: worldgen 2.0 ores.
  [BLOCK.EMERALD_ORE]: [70, 190, 110],
  [BLOCK.LAPIS_ORE]: [55, 85, 190],
  [BLOCK.EMERALD_BLOCK]: [56, 196, 112],
};
// All 16 wool colours share the registry palette.
for (const woolId of WOOL_BLOCKS) BLOCK_COLORS[woolId] = WOOL_RGB[woolId];

export class Minimap {
  constructor(container) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.canvas.id = 'minimap';
    this.canvas.style.cssText = 'position:absolute;top:8px;right:8px;border:2px solid rgba(255,255,255,0.3);image-rendering:pixelated;pointer-events:none;z-index:50;';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.visible = true;
    this.updateTimer = 0;
  }

  toggle() {
    this.visible = !this.visible;
    this.canvas.style.display = this.visible ? 'block' : 'none';
  }

  update(dt, playerPos, world) {
    this.updateTimer -= dt;
    if (this.updateTimer > 0 || !this.visible) return;
    this.updateTimer = 0.5;

    const px = Math.floor(playerPos.x);
    const pz = Math.floor(playerPos.z);
    const img = this.ctx.createImageData(SIZE, SIZE);
    const half = RANGE / 2;
    const scale = SIZE / RANGE;

    for (let sy = 0; sy < SIZE; sy++) {
      for (let sx = 0; sx < SIZE; sx++) {
        const wx = px + Math.floor((sx / SIZE) * RANGE - half);
        const wz = pz + Math.floor((sy / SIZE) * RANGE - half);
        const h = typeof world.surfaceHeight === 'function' ? world.surfaceHeight(wx, wz) : -1;
        let r = 20, g = 20, b = 30;
        if (h >= 0) {
          const block = world.getBlock(wx, h, wz);
          const c = BLOCK_COLORS[block] || (h <= SEA_LEVEL ? [60, 100, 190] : [100, 100, 100]);
          r = c[0]; g = c[1]; b = c[2];
          const shade = Math.min(1, 0.6 + h / 80);
          r = Math.floor(r * shade);
          g = Math.floor(g * shade);
          b = Math.floor(b * shade);
        }
        const i = (sy * SIZE + sx) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }

    // Player marker (center)
    const cx = Math.floor(SIZE / 2);
    const cy = Math.floor(SIZE / 2);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const i = ((cy + dy) * SIZE + (cx + dx)) * 4;
        img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = 255;
      }
    }

    this.ctx.putImageData(img, 0, 0);
  }
}
