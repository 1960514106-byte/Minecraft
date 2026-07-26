// =============================================================================
// textures.js - Procedurally paints a texture atlas to an offscreen canvas
// and returns a pixel-art (NearestFilter) THREE.Texture. No external images.
// =============================================================================

import * as THREE from 'three';
import { TILE_PX, ATLAS_COLS, ATLAS_ROWS, TILES } from './config.js';

// Deterministic noise so the atlas looks the same every run.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

export function createAtlasTexture() {
  const W = ATLAS_COLS * TILE_PX;
  const H = ATLAS_ROWS * TILE_PX;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const rng = mulberry32(20240614);
  const setpx = (x, y, r, g, b) => {
    ctx.fillStyle = `rgb(${clamp255(r)},${clamp255(g)},${clamp255(b)})`;
    ctx.fillRect(x, y, 1, 1);
  };

  // Fill an entire tile with a base colour plus per-pixel speckle.
  const speckle = (index, base, amount) => {
    const col = index % ATLAS_COLS;
    const row = Math.floor(index / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const n = (rng() * 2 - 1) * amount;
        setpx(ox + x, oy + y, base[0] + n, base[1] + n, base[2] + n);
      }
    }
    return { ox, oy };
  };

  // ---- GRASS_TOP : green with speckle --------------------------------------
  speckle(TILES.GRASS_TOP, [96, 158, 64], 22);

  // ---- DIRT : brown speckle ------------------------------------------------
  speckle(TILES.DIRT, [134, 96, 67], 20);

  // ---- GRASS_SIDE : dirt body with a green top strip -----------------------
  {
    const { ox, oy } = speckle(TILES.GRASS_SIDE, [134, 96, 67], 20);
    const strip = 4;
    for (let y = 0; y < strip + 1; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        // ragged lower edge of the grass overhang
        if (y === strip && rng() > 0.5) continue;
        const n = (rng() * 2 - 1) * 22;
        setpx(ox + x, oy + y, 96 + n, 158 + n, 64 + n);
      }
    }
  }

  // ---- STONE : grey speckle ------------------------------------------------
  speckle(TILES.STONE, [128, 128, 132], 18);

  // ---- SAND : tan speckle --------------------------------------------------
  speckle(TILES.SAND, [219, 203, 150], 16);

  // ---- WOOD_TOP : concentric growth rings ----------------------------------
  {
    const { ox, oy } = speckle(TILES.WOOD_TOP, [160, 120, 72], 8);
    const cx = TILE_PX / 2 - 0.5, cy = TILE_PX / 2 - 0.5;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if ((Math.round(d) % 2) === 0) setpx(ox + x, oy + y, 120, 86, 50);
      }
    }
  }

  // ---- WOOD_SIDE : vertical bark grain --------------------------------------
  {
    const { ox, oy } = speckle(TILES.WOOD_SIDE, [110, 80, 50], 10);
    for (let x = 0; x < TILE_PX; x++) {
      if (rng() > 0.6) {
        for (let y = 0; y < TILE_PX; y++) {
          const n = (rng() * 2 - 1) * 8;
          setpx(ox + x, oy + y, 88 + n, 62 + n, 38 + n);
        }
      }
    }
  }

  // ---- LEAVES : noisy dark green --------------------------------------------
  {
    const { ox, oy } = speckle(TILES.LEAVES, [46, 110, 44], 26);
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        if (rng() > 0.82) setpx(ox + x, oy + y, 28, 78, 30); // dark gaps
      }
    }
  }

  // ---- BEDROCK : dark mottled ----------------------------------------------
  {
    const { ox, oy } = speckle(TILES.BEDROCK, [62, 62, 68], 22);
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        if (rng() > 0.85) setpx(ox + x, oy + y, 24, 24, 28);
      }
    }
  }

  // ---- WATER : blue with brighter horizontal ripple lines ------------------
  {
    const { ox, oy } = speckle(TILES.WATER, [50, 104, 190], 12);
    for (let y = 0; y < TILE_PX; y++) {
      if (y % 4 === 0) {                       // a ripple highlight every 4 rows
        for (let x = 0; x < TILE_PX; x++) {
          const n = (rng() * 2 - 1) * 10;
          setpx(ox + x, oy + y, 92 + n, 152 + n, 224 + n);
        }
      }
    }
  }

  // ---- SNOW : near-white with a faint cool speckle -------------------------
  {
    const { ox, oy } = speckle(TILES.SNOW, [238, 242, 250], 8);
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        if (rng() > 0.88) setpx(ox + x, oy + y, 210, 222, 240); // sparse bluish flecks
      }
    }
  }

  // ---- PLANK : sawn boards with horizontal seams and vertical grain --------
  {
    const { ox, oy } = speckle(TILES.PLANK, [178, 138, 86], 10);
    for (let y = 0; y < TILE_PX; y++) {
      if (y % 4 === 0) {                          // dark seam between boards
        for (let x = 0; x < TILE_PX; x++) setpx(ox + x, oy + y, 120, 88, 52);
      } else if (rng() > 0.7) {                   // faint grain streak
        for (let x = 0; x < TILE_PX; x++) {
          const n = (rng() * 2 - 1) * 8;
          setpx(ox + x, oy + y, 168 + n, 128 + n, 78 + n);
        }
      }
    }
  }

  // ---- APPLE : round red item on transparent background --------------------
  {
    const col = TILES.APPLE % ATLAS_COLS;
    const row = Math.floor(TILES.APPLE / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    const cx = TILE_PX / 2 - 0.5, cy = TILE_PX / 2 + 0.5;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const d = Math.sqrt((x - cx) ** 2 + ((y - cy) * 0.9) ** 2);
        if (d < 6) {
          const shade = x < cx ? 30 : 0;          // simple left-side highlight
          const n = (rng() * 2 - 1) * 10;
          setpx(ox + x, oy + y, 196 + shade + n, 40 + n, 40 + n);
        }
      }
    }
    // stalk
    setpx(ox + (cx | 0), oy + 2, 96, 64, 36);
    setpx(ox + (cx | 0), oy + 3, 96, 64, 36);
  }

  // ---- STICK : thin diagonal brown rod on transparent background -----------
  {
    const col = TILES.STICK % ATLAS_COLS;
    const row = Math.floor(TILES.STICK / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let i = 3; i < TILE_PX - 3; i++) {
      const n = (rng() * 2 - 1) * 12;
      setpx(ox + i, oy + (TILE_PX - 1 - i), 132 + n, 92 + n, 50 + n);
      setpx(ox + i, oy + (TILE_PX - 2 - i), 110 + n, 76 + n, 42 + n);
    }
  }

  const drawHandle = (ox, oy) => {
    for (let i = 6; i < 14; i++) {
      setpx(ox + i, oy + i, 118, 78, 42);
      setpx(ox + i + 1, oy + i, 86, 56, 34);
    }
  };
  const toolTile = (index) => {
    const col = index % ATLAS_COLS;
    const row = Math.floor(index / ATLAS_COLS);
    return { ox: col * TILE_PX, oy: row * TILE_PX };
  };

  // ---- COAL_ORE / IRON_ORE --------------------------------------------------
  const oreTexture = (index, fleck) => {
    const { ox, oy } = speckle(index, [124, 124, 128], 18);
    for (let y = 1; y < TILE_PX - 1; y++) {
      for (let x = 1; x < TILE_PX - 1; x++) {
        const n = rng();
        if (n > 0.88 && ((x + y) % 3 !== 0)) {
          setpx(ox + x, oy + y, fleck[0], fleck[1], fleck[2]);
          if (x + 1 < TILE_PX) setpx(ox + x + 1, oy + y, fleck[0] - 18, fleck[1] - 18, fleck[2] - 18);
        }
      }
    }
  };
  oreTexture(TILES.COAL_ORE, [38, 38, 42]);
  oreTexture(TILES.IRON_ORE, [204, 142, 92]);

  // ---- COAL / RAW_IRON items ------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.COAL);
    for (let y = 3; y <= 12; y++) {
      for (let x = 3; x <= 12; x++) {
        const jag = Math.abs(x - 8) + Math.abs(y - 8) + rng() * 3;
        if (jag < 8) {
          const n = (rng() * 2 - 1) * 14;
          setpx(ox + x, oy + y, 42 + n, 42 + n, 46 + n);
        }
      }
    }
  }
  {
    const { ox, oy } = toolTile(TILES.RAW_IRON);
    for (let y = 3; y <= 12; y++) {
      for (let x = 3; x <= 12; x++) {
        const jag = Math.abs(x - 8) + Math.abs(y - 8) + rng() * 3;
        if (jag < 8) {
          const n = (rng() * 2 - 1) * 12;
          setpx(ox + x, oy + y, 188 + n, 116 + n, 72 + n);
        }
      }
    }
  }

  // ---- WOODEN_PICKAXE : small 2x2 crafting pick ----------------------------
  {
    const { ox, oy } = toolTile(TILES.WOODEN_PICKAXE);
    drawHandle(ox, oy);
    for (let x = 3; x <= 12; x++) {
      setpx(ox + x, oy + 3, 156, 114, 66);
      setpx(ox + x, oy + 4, 116, 78, 44);
    }
    setpx(ox + 2, oy + 4, 92, 62, 38);
    setpx(ox + 13, oy + 4, 92, 62, 38);
  }

  // ---- WOODEN_AXE -----------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.WOODEN_AXE);
    drawHandle(ox, oy);
    for (let y = 2; y <= 7; y++) {
      for (let x = 3; x <= 8; x++) {
        if (x + y < 8 || x - y > 3) continue;
        setpx(ox + x, oy + y, 150, 104, 58);
      }
    }
    for (let y = 3; y <= 6; y++) setpx(ox + 8, oy + y, 96, 64, 38);
  }

  // ---- WOODEN_SHOVEL --------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.WOODEN_SHOVEL);
    drawHandle(ox, oy);
    for (let y = 2; y <= 7; y++) {
      for (let x = 5; x <= 10; x++) {
        const dx = Math.abs(x - 7.5);
        if (dx + Math.abs(y - 4.5) > 4.2) continue;
        setpx(ox + x, oy + y, 156, 114, 66);
      }
    }
    setpx(ox + 7, oy + 7, 92, 62, 38);
    setpx(ox + 8, oy + 7, 92, 62, 38);
  }

  // ---- STONE TOOLS ----------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.STONE_PICKAXE);
    drawHandle(ox, oy);
    for (let x = 3; x <= 12; x++) {
      setpx(ox + x, oy + 3, 150, 150, 154);
      setpx(ox + x, oy + 4, 104, 104, 110);
    }
    setpx(ox + 2, oy + 4, 82, 82, 88);
    setpx(ox + 13, oy + 4, 82, 82, 88);
  }
  {
    const { ox, oy } = toolTile(TILES.STONE_AXE);
    drawHandle(ox, oy);
    for (let y = 2; y <= 7; y++) {
      for (let x = 3; x <= 8; x++) {
        if (x + y < 8 || x - y > 3) continue;
        setpx(ox + x, oy + y, 145, 145, 150);
      }
    }
    for (let y = 3; y <= 6; y++) setpx(ox + 8, oy + y, 92, 92, 98);
  }
  {
    const { ox, oy } = toolTile(TILES.STONE_SHOVEL);
    drawHandle(ox, oy);
    for (let y = 2; y <= 7; y++) {
      for (let x = 5; x <= 10; x++) {
        const dx = Math.abs(x - 7.5);
        if (dx + Math.abs(y - 4.5) > 4.2) continue;
        setpx(ox + x, oy + y, 150, 150, 154);
      }
    }
    setpx(ox + 7, oy + 7, 82, 82, 88);
    setpx(ox + 8, oy + 7, 82, 82, 88);
  }

  // ---- CRAFTING_TABLE ------------------------------------------------------
  {
    const { ox, oy } = speckle(TILES.CRAFTING_TABLE_TOP, [166, 116, 64], 8);
    for (let i = 2; i < TILE_PX - 2; i++) {
      setpx(ox + i, oy + 2, 92, 60, 34);
      setpx(ox + i, oy + TILE_PX - 3, 92, 60, 34);
      setpx(ox + 2, oy + i, 92, 60, 34);
      setpx(ox + TILE_PX - 3, oy + i, 92, 60, 34);
    }
    for (let i = 4; i < TILE_PX - 4; i++) {
      setpx(ox + i, oy + 7, 118, 78, 42);
      setpx(ox + 7, oy + i, 118, 78, 42);
    }
  }
  {
    const { ox, oy } = speckle(TILES.CRAFTING_TABLE_SIDE, [150, 98, 54], 10);
    for (let y = 2; y < TILE_PX - 2; y++) {
      if (y === 4 || y === 11) for (let x = 1; x < TILE_PX - 1; x++) setpx(ox + x, oy + y, 90, 58, 34);
    }
    for (let x = 3; x <= 5; x++) for (let y = 5; y <= 10; y++) setpx(ox + x, oy + y, 104, 66, 38);
    for (let x = 10; x <= 12; x++) for (let y = 5; y <= 10; y++) setpx(ox + x, oy + y, 104, 66, 38);
  }

  // ---- SWORDS --------------------------------------------------------------
  const swordTile = (index, blade, guard) => {
    const { ox, oy } = toolTile(index);
    for (let i = 2; i <= 10; i++) {
      setpx(ox + 8, oy + i, blade[0], blade[1], blade[2]);
      setpx(ox + 7, oy + i + 1, blade[0] - 30, blade[1] - 30, blade[2] - 30);
    }
    for (let x = 5; x <= 10; x++) setpx(ox + x, oy + 11, guard[0], guard[1], guard[2]);
    setpx(ox + 8, oy + 12, 118, 78, 42);
    setpx(ox + 8, oy + 13, 92, 58, 34);
  };
  swordTile(TILES.WOODEN_SWORD, [158, 112, 62], [96, 62, 36]);
  swordTile(TILES.STONE_SWORD, [158, 158, 164], [88, 88, 94]);

  // ---- FURNACE (28-31) -------------------------------------------------------
  {
    const { ox, oy } = speckle(TILES.FURNACE_FRONT, [120, 120, 124], 14);
    for (let y = 4; y <= 11; y++) {
      for (let x = 4; x <= 11; x++) {
        setpx(ox + x, oy + y, 32, 28, 28);
      }
    }
    for (let x = 3; x <= 12; x++) { setpx(ox + x, oy + 3, 80, 80, 84); setpx(ox + x, oy + 12, 80, 80, 84); }
    for (let y = 3; y <= 12; y++) { setpx(ox + 3, oy + y, 80, 80, 84); setpx(ox + 12, oy + y, 80, 80, 84); }
  }
  {
    const { ox, oy } = speckle(TILES.FURNACE_FRONT_LIT, [120, 120, 124], 14);
    for (let y = 4; y <= 11; y++) {
      for (let x = 4; x <= 11; x++) {
        const glow = (y > 7) ? 1.0 : 0.5;
        const n = rng() * 20;
        setpx(ox + x, oy + y, 180 + n * glow | 0, 90 + n * glow * 0.5 | 0, 20);
      }
    }
    for (let x = 3; x <= 12; x++) { setpx(ox + x, oy + 3, 80, 80, 84); setpx(ox + x, oy + 12, 80, 80, 84); }
    for (let y = 3; y <= 12; y++) { setpx(ox + 3, oy + y, 80, 80, 84); setpx(ox + 12, oy + y, 80, 80, 84); }
  }
  speckle(TILES.FURNACE_SIDE, [118, 118, 122], 14);
  {
    const { ox, oy } = speckle(TILES.FURNACE_TOP, [126, 126, 130], 12);
    for (let i = 2; i < 14; i++) {
      setpx(ox + i, oy + 2, 90, 90, 94);
      setpx(ox + i, oy + 13, 90, 90, 94);
      setpx(ox + 2, oy + i, 90, 90, 94);
      setpx(ox + 13, oy + i, 90, 90, 94);
    }
  }

  // ---- GLASS (32) -------------------------------------------------------------
  {
    const col = TILES.GLASS % ATLAS_COLS;
    const row = Math.floor(TILES.GLASS / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const edge = x === 0 || x === 15 || y === 0 || y === 15;
        if (edge) { setpx(ox + x, oy + y, 180, 210, 220); continue; }
        const n = rng() * 8;
        setpx(ox + x, oy + y, 200 + n, 220 + n, 230 + n);
      }
    }
    for (let i = 2; i < 8; i++) setpx(ox + i, oy + i, 240, 248, 255);
    for (let i = 2; i < 7; i++) setpx(ox + i + 1, oy + i, 230, 240, 250);
  }

  // ---- GOLD_ORE (33), REDSTONE_ORE (34) ---------------------------------------
  oreTexture(TILES.GOLD_ORE, [226, 196, 56]);
  oreTexture(TILES.REDSTONE_ORE, [196, 42, 42]);

  // ---- IRON_INGOT (35), GOLD_INGOT (36) ---------------------------------------
  const ingotTile = (index, baseColor) => {
    const { ox, oy } = toolTile(index);
    for (let y = 5; y <= 12; y++) {
      const w = y < 7 ? 3 : (y < 10 ? 4 : 3);
      const cx = 8;
      for (let x = cx - w; x <= cx + w; x++) {
        const shade = y < 7 ? 20 : (y < 10 ? 0 : -20);
        const n = (rng() * 2 - 1) * 10;
        setpx(ox + x, oy + y, baseColor[0] + shade + n, baseColor[1] + shade + n, baseColor[2] + shade + n);
      }
    }
  };
  ingotTile(TILES.IRON_INGOT, [190, 190, 196]);
  ingotTile(TILES.GOLD_INGOT, [226, 196, 56]);

  // ---- REDSTONE (37) ----------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.REDSTONE);
    for (let y = 4; y <= 12; y++) {
      for (let x = 4; x <= 12; x++) {
        const jag = Math.abs(x - 8) + Math.abs(y - 8) + rng() * 3;
        if (jag < 7) {
          const n = (rng() * 2 - 1) * 16;
          setpx(ox + x, oy + y, 180 + n, 28 + n * 0.3, 28 + n * 0.3);
        }
      }
    }
  }

  // ---- MEAT items (38-41) -----------------------------------------------------
  const meatTile = (index, base) => {
    const { ox, oy } = toolTile(index);
    const cx = 7.5, cy = 8;
    for (let y = 3; y <= 13; y++) {
      for (let x = 3; x <= 12; x++) {
        const dx = (x - cx) * 1.1, dy = (y - cy) * 0.85;
        if (dx * dx + dy * dy > 28) continue;
        const n = (rng() * 2 - 1) * 14;
        setpx(ox + x, oy + y, base[0] + n, base[1] + n, base[2] + n);
      }
    }
  };
  meatTile(TILES.RAW_PORK, [210, 130, 130]);
  meatTile(TILES.COOKED_PORK, [160, 100, 60]);
  meatTile(TILES.RAW_BEEF, [190, 60, 60]);
  meatTile(TILES.COOKED_BEEF, [140, 80, 40]);

  // ---- LEATHER (42) -----------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.LEATHER);
    for (let y = 3; y <= 13; y++) {
      for (let x = 4; x <= 12; x++) {
        const n = (rng() * 2 - 1) * 12;
        setpx(ox + x, oy + y, 148 + n, 96 + n, 52 + n);
      }
    }
  }

  // ---- WOOL (43) --------------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.WOOL);
    for (let y = 3; y <= 13; y++) {
      for (let x = 3; x <= 13; x++) {
        const n = (rng() * 2 - 1) * 10;
        setpx(ox + x, oy + y, 232 + n, 224 + n, 208 + n);
      }
    }
    for (let y = 4; y <= 12; y += 2) {
      for (let x = 4; x <= 12; x += 2) {
        if (rng() > 0.5) setpx(ox + x, oy + y, 242, 238, 226);
      }
    }
  }

  // ---- ARMOR (44-47) ----------------------------------------------------------
  const helmetTile = (index, base) => {
    const { ox, oy } = toolTile(index);
    for (let y = 2; y <= 9; y++) {
      const w = y < 4 ? (y + 1) : 5;
      for (let x = 8 - w; x <= 7 + w; x++) {
        if (y >= 7 && x > 3 && x < 12) continue;
        const n = (rng() * 2 - 1) * 10;
        setpx(ox + x, oy + y, base[0] + n, base[1] + n, base[2] + n);
      }
    }
  };
  const chestTile = (index, base) => {
    const { ox, oy } = toolTile(index);
    for (let y = 2; y <= 13; y++) {
      for (let x = 3; x <= 12; x++) {
        if (y < 4 && (x < 5 || x > 10)) continue;
        if (y >= 4 && y <= 5 && x > 5 && x < 10) continue;
        const n = (rng() * 2 - 1) * 10;
        setpx(ox + x, oy + y, base[0] + n, base[1] + n, base[2] + n);
      }
    }
  };
  helmetTile(TILES.LEATHER_HELMET, [148, 96, 52]);
  chestTile(TILES.LEATHER_CHEST, [148, 96, 52]);
  helmetTile(TILES.IRON_HELMET, [190, 190, 196]);
  chestTile(TILES.IRON_CHEST, [190, 190, 196]);

  // ---- IRON TOOLS (48-51) ----------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.IRON_PICKAXE);
    drawHandle(ox, oy);
    for (let x = 3; x <= 12; x++) {
      setpx(ox + x, oy + 3, 204, 204, 210);
      setpx(ox + x, oy + 4, 150, 150, 158);
    }
    setpx(ox + 2, oy + 4, 116, 116, 124);
    setpx(ox + 13, oy + 4, 116, 116, 124);
  }
  {
    const { ox, oy } = toolTile(TILES.IRON_AXE);
    drawHandle(ox, oy);
    for (let y = 2; y <= 7; y++) {
      for (let x = 3; x <= 8; x++) {
        if (x + y < 8 || x - y > 3) continue;
        setpx(ox + x, oy + y, 202, 202, 208);
      }
    }
    for (let y = 3; y <= 6; y++) setpx(ox + 8, oy + y, 126, 126, 134);
  }
  {
    const { ox, oy } = toolTile(TILES.IRON_SHOVEL);
    drawHandle(ox, oy);
    for (let y = 2; y <= 7; y++) {
      for (let x = 5; x <= 10; x++) {
        const dx = Math.abs(x - 7.5);
        if (dx + Math.abs(y - 4.5) > 4.2) continue;
        setpx(ox + x, oy + y, 204, 204, 210);
      }
    }
    setpx(ox + 7, oy + 7, 116, 116, 124);
    setpx(ox + 8, oy + 7, 116, 116, 124);
  }
  swordTile(TILES.IRON_SWORD, [212, 212, 220], [126, 126, 134]);

  // ---- LEGGINGS / BOOTS (52-55) --------------------------------------------
  const leggingsTile = (index, base) => {
    const { ox, oy } = toolTile(index);
    for (let y = 2; y <= 13; y++) {
      for (let x = 4; x <= 11; x++) {
        if (y > 5 && x > 6 && x < 9) continue;
        const n = (rng() * 2 - 1) * 10;
        setpx(ox + x, oy + y, base[0] + n, base[1] + n, base[2] + n);
      }
    }
  };
  const bootsTile = (index, base) => {
    const { ox, oy } = toolTile(index);
    for (let y = 7; y <= 12; y++) {
      for (let x = 3; x <= 6; x++) {
        const n = (rng() * 2 - 1) * 10;
        setpx(ox + x, oy + y, base[0] + n, base[1] + n, base[2] + n);
      }
      for (let x = 9; x <= 12; x++) {
        const n = (rng() * 2 - 1) * 10;
        setpx(ox + x, oy + y, base[0] + n, base[1] + n, base[2] + n);
      }
    }
    for (let x = 2; x <= 6; x++) setpx(ox + x, oy + 13, base[0] - 26, base[1] - 26, base[2] - 26);
    for (let x = 9; x <= 13; x++) setpx(ox + x, oy + 13, base[0] - 26, base[1] - 26, base[2] - 26);
  };
  leggingsTile(TILES.LEATHER_LEGS, [148, 96, 52]);
  bootsTile(TILES.LEATHER_BOOTS, [148, 96, 52]);
  leggingsTile(TILES.IRON_LEGS, [190, 190, 196]);
  bootsTile(TILES.IRON_BOOTS, [190, 190, 196]);

  // ---- STORAGE BLOCKS / CACTUS (56-59) --------------------------------------
  {
    const { ox, oy } = speckle(TILES.IRON_BLOCK, [188, 188, 194], 8);
    for (let i = 1; i < TILE_PX - 1; i++) {
      setpx(ox + i, oy + 1, 224, 224, 230);
      setpx(ox + 1, oy + i, 224, 224, 230);
      setpx(ox + i, oy + 14, 128, 128, 136);
      setpx(ox + 14, oy + i, 128, 128, 136);
    }
  }
  {
    const { ox, oy } = speckle(TILES.GOLD_BLOCK, [218, 178, 54], 10);
    for (let i = 1; i < TILE_PX - 1; i++) {
      setpx(ox + i, oy + 1, 248, 224, 92);
      setpx(ox + 1, oy + i, 248, 224, 92);
      setpx(ox + i, oy + 14, 142, 98, 24);
      setpx(ox + 14, oy + i, 142, 98, 24);
    }
  }
  {
    const { ox, oy } = speckle(TILES.REDSTONE_BLOCK, [158, 34, 34], 12);
    for (let i = 2; i < TILE_PX - 2; i++) {
      setpx(ox + i, oy + 2, 220, 60, 50);
      setpx(ox + 2, oy + i, 220, 60, 50);
      setpx(ox + i, oy + 13, 92, 12, 16);
      setpx(ox + 13, oy + i, 92, 12, 16);
    }
  }
  {
    const { ox, oy } = speckle(TILES.CACTUS, [44, 132, 72], 16);
    for (let y = 0; y < TILE_PX; y++) {
      setpx(ox + 3, oy + y, 32, 96, 52);
      setpx(ox + 12, oy + y, 76, 166, 88);
      if (y % 5 === 2) {
        setpx(ox + 1, oy + y, 228, 232, 180);
        setpx(ox + 14, oy + y, 228, 232, 180);
      }
    }
  }

  // ---- TORCH (60) ---------------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.TORCH);
    for (let y = 3; y <= 12; y++) {
      const n = (rng() * 2 - 1) * 8;
      setpx(ox + 7, oy + y, 142 + n, 102 + n, 52 + n);
      setpx(ox + 8, oy + y, 126 + n, 88 + n, 44 + n);
    }
    setpx(ox + 7, oy + 2, 255, 200, 60);
    setpx(ox + 8, oy + 2, 255, 180, 40);
    setpx(ox + 7, oy + 1, 255, 240, 120);
    setpx(ox + 8, oy + 1, 255, 220, 80);
  }

  // ---- DOOR_TOP (61), DOOR_BOTTOM (62) ------------------------------------------
  {
    const { ox, oy } = speckle(TILES.DOOR_TOP, [160, 120, 72], 8);
    for (let y = 0; y < TILE_PX; y++) {
      setpx(ox + 0, oy + y, 96, 64, 38);
      setpx(ox + 15, oy + y, 96, 64, 38);
    }
    for (let x = 3; x <= 12; x++) {
      for (let y = 3; y <= 9; y++) setpx(ox + x, oy + y, 120, 160, 200);
    }
  }
  {
    const { ox, oy } = speckle(TILES.DOOR_BOTTOM, [160, 120, 72], 8);
    for (let y = 0; y < TILE_PX; y++) {
      setpx(ox + 0, oy + y, 96, 64, 38);
      setpx(ox + 15, oy + y, 96, 64, 38);
    }
    for (let y = 3; y <= 6; y++) {
      for (let x = 5; x <= 10; x++) setpx(ox + x, oy + y, 128, 84, 48);
    }
  }

  // ---- LADDER (63) --------------------------------------------------------------
  {
    const col = TILES.LADDER % ATLAS_COLS;
    const row = Math.floor(TILES.LADDER / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) {
      setpx(ox + 3, oy + y, 128, 88, 46);
      setpx(ox + 12, oy + y, 128, 88, 46);
    }
    for (let row2 = 2; row2 < TILE_PX; row2 += 4) {
      for (let x = 3; x <= 12; x++) {
        setpx(ox + x, oy + row2, 148, 106, 58);
      }
    }
  }

  // ---- CHEST (64-66) ------------------------------------------------------------
  {
    const { ox, oy } = speckle(TILES.CHEST_FRONT, [142, 96, 42], 10);
    for (let y = 6; y <= 9; y++) for (let x = 6; x <= 9; x++) setpx(ox + x, oy + y, 68, 68, 72);
    setpx(ox + 7, oy + 7, 200, 180, 60);
    setpx(ox + 8, oy + 7, 200, 180, 60);
  }
  speckle(TILES.CHEST_SIDE, [136, 92, 38], 10);
  {
    const { ox, oy } = speckle(TILES.CHEST_TOP, [126, 82, 34], 8);
    for (let i = 2; i < 14; i++) {
      setpx(ox + i, oy + 2, 90, 58, 28);
      setpx(ox + i, oy + 13, 90, 58, 28);
    }
  }

  // ---- BED (67-68) --------------------------------------------------------------
  {
    const { ox, oy } = speckle(TILES.BED_TOP, [160, 40, 40], 12);
    for (let x = 2; x < 14; x++) for (let y = 2; y < 14; y++) {
      const n = (rng() * 2 - 1) * 8;
      setpx(ox + x, oy + y, 180 + n, 50 + n, 50 + n);
    }
  }
  {
    const { ox, oy } = speckle(TILES.BED_SIDE, [160, 120, 72], 8);
    for (let x = 0; x < TILE_PX; x++) {
      setpx(ox + x, oy + 0, 180, 50, 50);
      setpx(ox + x, oy + 1, 160, 40, 40);
    }
  }

  // ---- FLOWERS + TALL_GRASS (69-71) ---------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.FLOWER_RED);
    for (let y = 8; y <= 14; y++) { setpx(ox + 7, oy + y, 56, 140, 40); setpx(ox + 8, oy + y, 46, 120, 34); }
    for (let y = 3; y <= 7; y++) for (let x = 5; x <= 10; x++) {
      if (Math.abs(x - 7.5) + Math.abs(y - 5) < 3.5) setpx(ox + x, oy + y, 210, 40, 40);
    }
  }
  {
    const { ox, oy } = toolTile(TILES.FLOWER_YELLOW);
    for (let y = 8; y <= 14; y++) { setpx(ox + 7, oy + y, 56, 140, 40); setpx(ox + 8, oy + y, 46, 120, 34); }
    for (let y = 3; y <= 7; y++) for (let x = 5; x <= 10; x++) {
      if (Math.abs(x - 7.5) + Math.abs(y - 5) < 3.5) setpx(ox + x, oy + y, 240, 220, 40);
    }
  }
  {
    const { ox, oy } = toolTile(TILES.TALL_GRASS);
    for (let i = 0; i < 6; i++) {
      const bx = 3 + Math.floor(rng() * 10);
      for (let y = 3; y <= 13; y++) {
        const n = (rng() * 2 - 1) * 16;
        setpx(ox + bx, oy + y, 68 + n, 148 + n, 52 + n);
      }
    }
  }

  // ---- DIAMOND_ORE (72) ---------------------------------------------------------
  oreTexture(TILES.DIAMOND_ORE, [80, 220, 240]);

  // ---- DIAMOND_BLOCK (73) -------------------------------------------------------
  {
    const { ox, oy } = speckle(TILES.DIAMOND_BLOCK, [80, 210, 225], 12);
    for (let i = 1; i < TILE_PX - 1; i++) {
      setpx(ox + i, oy + 1, 140, 240, 255);
      setpx(ox + 1, oy + i, 140, 240, 255);
      setpx(ox + i, oy + 14, 40, 140, 160);
      setpx(ox + 14, oy + i, 40, 140, 160);
    }
  }

  // ---- DIAMOND item (74) --------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.DIAMOND);
    const cx = 7.5, cy = 7;
    for (let y = 3; y <= 12; y++) {
      for (let x = 4; x <= 11; x++) {
        const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
        if (dx * 1.2 + dy < 5.5) {
          const n = (rng() * 2 - 1) * 12;
          setpx(ox + x, oy + y, 90 + n, 220 + n * 0.5, 240 + n * 0.3);
        }
      }
    }
  }

  // ---- DIAMOND TOOLS (75-78) ----------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.DIAMOND_PICKAXE);
    drawHandle(ox, oy);
    for (let x = 3; x <= 12; x++) {
      setpx(ox + x, oy + 3, 100, 228, 240);
      setpx(ox + x, oy + 4, 60, 180, 200);
    }
    setpx(ox + 2, oy + 4, 50, 150, 170);
    setpx(ox + 13, oy + 4, 50, 150, 170);
  }
  {
    const { ox, oy } = toolTile(TILES.DIAMOND_AXE);
    drawHandle(ox, oy);
    for (let y = 2; y <= 7; y++) {
      for (let x = 3; x <= 8; x++) {
        if (x + y < 8 || x - y > 3) continue;
        setpx(ox + x, oy + y, 100, 228, 240);
      }
    }
    for (let y = 3; y <= 6; y++) setpx(ox + 8, oy + y, 60, 180, 200);
  }
  {
    const { ox, oy } = toolTile(TILES.DIAMOND_SHOVEL);
    drawHandle(ox, oy);
    for (let y = 2; y <= 7; y++) {
      for (let x = 5; x <= 10; x++) {
        const dx = Math.abs(x - 7.5);
        if (dx + Math.abs(y - 4.5) > 4.2) continue;
        setpx(ox + x, oy + y, 100, 228, 240);
      }
    }
    setpx(ox + 7, oy + 7, 50, 150, 170);
    setpx(ox + 8, oy + 7, 50, 150, 170);
  }
  swordTile(TILES.DIAMOND_SWORD, [100, 228, 240], [60, 180, 200]);

  // ---- DIAMOND ARMOR (79-82) ----------------------------------------------------
  helmetTile(TILES.DIAMOND_HELMET, [80, 210, 225]);
  chestTile(TILES.DIAMOND_CHEST, [80, 210, 225]);
  leggingsTile(TILES.DIAMOND_LEGS, [80, 210, 225]);
  bootsTile(TILES.DIAMOND_BOOTS, [80, 210, 225]);

  // ---- BONE (83) ----------------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.BONE);
    for (let i = 3; i < 13; i++) {
      const n = (rng() * 2 - 1) * 8;
      setpx(ox + i, oy + 7, 228 + n, 222 + n, 210 + n);
      setpx(ox + i, oy + 8, 210 + n, 204 + n, 192 + n);
    }
    for (let y = 5; y <= 10; y++) { setpx(ox + 3, oy + y, 220, 214, 200); setpx(ox + 12, oy + y, 220, 214, 200); }
  }

  // ---- ARROW (84) ---------------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.ARROW);
    for (let i = 3; i < 13; i++) setpx(ox + i, oy + 8, 128, 88, 46);
    setpx(ox + 12, oy + 7, 160, 160, 168); setpx(ox + 13, oy + 7, 160, 160, 168);
    setpx(ox + 12, oy + 9, 160, 160, 168); setpx(ox + 13, oy + 9, 160, 160, 168);
    setpx(ox + 2, oy + 7, 200, 200, 200); setpx(ox + 2, oy + 9, 200, 200, 200);
  }

  // ---- STRING (85) --------------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.STRING);
    for (let y = 3; y <= 13; y++) {
      const x = 7 + Math.floor(Math.sin(y * 0.8) * 2);
      setpx(ox + x, oy + y, 220, 220, 220);
    }
  }

  // ---- GUNPOWDER (86) -----------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.GUNPOWDER);
    for (let y = 5; y <= 12; y++) {
      for (let x = 5; x <= 11; x++) {
        if (rng() > 0.55) {
          const n = (rng() * 2 - 1) * 12;
          setpx(ox + x, oy + y, 72 + n, 72 + n, 72 + n);
        }
      }
    }
  }

  // ---- RAW_CHICKEN (87), COOKED_CHICKEN (88) ------------------------------------
  meatTile(TILES.RAW_CHICKEN, [220, 170, 150]);
  meatTile(TILES.COOKED_CHICKEN, [160, 110, 50]);

  // ---- FEATHER (89) -------------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.FEATHER);
    for (let y = 2; y <= 13; y++) {
      const w = y < 5 ? 1 : (y < 10 ? 2 : 1);
      for (let x = 7 - w; x <= 8 + w; x++) {
        const n = (rng() * 2 - 1) * 8;
        setpx(ox + x, oy + y, 230 + n, 230 + n, 240 + n);
      }
    }
    for (let y = 5; y <= 12; y++) setpx(ox + 8, oy + y, 100, 96, 88);
  }

  // ---- DOOR_ITEM (90) -----------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.DOOR_ITEM);
    for (let y = 2; y <= 13; y++) {
      for (let x = 5; x <= 10; x++) {
        const n = (rng() * 2 - 1) * 8;
        setpx(ox + x, oy + y, 156 + n, 116 + n, 68 + n);
      }
    }
    for (let x = 6; x <= 9; x++) for (let y = 4; y <= 7; y++) setpx(ox + x, oy + y, 120, 160, 200);
  }

  // ---- BED_ITEM (91) ------------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.BED_ITEM);
    for (let y = 8; y <= 12; y++) for (let x = 3; x <= 12; x++) {
      const n = (rng() * 2 - 1) * 8;
      setpx(ox + x, oy + y, 156 + n, 116 + n, 68 + n);
    }
    for (let x = 3; x <= 12; x++) for (let y = 6; y <= 8; y++) setpx(ox + x, oy + y, 180, 50, 50);
  }

  // ---- TORCH_ITEM (92) ----------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.TORCH_ITEM);
    for (let y = 4; y <= 13; y++) {
      const n = (rng() * 2 - 1) * 8;
      setpx(ox + 7, oy + y, 142 + n, 102 + n, 52 + n);
      setpx(ox + 8, oy + y, 126 + n, 88 + n, 44 + n);
    }
    setpx(ox + 7, oy + 3, 255, 200, 60); setpx(ox + 8, oy + 3, 255, 180, 40);
    setpx(ox + 7, oy + 2, 255, 240, 120); setpx(ox + 8, oy + 2, 255, 220, 80);
  }

  // ---- LADDER_ITEM (93) ---------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.LADDER_ITEM);
    for (let y = 2; y < 14; y++) { setpx(ox + 5, oy + y, 128, 88, 46); setpx(ox + 10, oy + y, 128, 88, 46); }
    for (let row3 = 4; row3 < 14; row3 += 3) for (let x = 5; x <= 10; x++) setpx(ox + x, oy + row3, 148, 106, 58);
  }

  // ---- CHEST_ITEM (94) ----------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.CHEST_ITEM);
    for (let y = 4; y <= 12; y++) for (let x = 4; x <= 11; x++) {
      const n = (rng() * 2 - 1) * 8;
      setpx(ox + x, oy + y, 142 + n, 96 + n, 42 + n);
    }
    setpx(ox + 7, oy + 8, 200, 180, 60); setpx(ox + 8, oy + 8, 200, 180, 60);
  }

  // ---- ENCHANT_TOP (95) ---------------------------------------------------------
  {
    const col = TILES.ENCHANT_TOP % ATLAS_COLS;
    const row = Math.floor(TILES.ENCHANT_TOP / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      const n = (rng() * 2 - 1) * 10;
      setpx(ox + x, oy + y, 30 + n, 20 + n, 40 + n);
    }
    // Diamond inlay pattern
    const sym = [[7,3],[8,3],[6,4],[9,4],[5,5],[10,5],[4,6],[11,6],[4,7],[11,7],[5,8],[10,8],[6,9],[9,9],[7,10],[8,10],[7,7],[8,7],[7,8],[8,8]];
    for (const [px, py] of sym) {
      setpx(ox + px, oy + py, 100 + (rng() * 30 | 0), 200 + (rng() * 40 | 0), 220 + (rng() * 30 | 0));
    }
  }

  // ---- COBBLESTONE (96) ---------------------------------------------------------
  {
    const col = TILES.COBBLESTONE % ATLAS_COLS;
    const row = Math.floor(TILES.COBBLESTONE / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      const n = (rng() * 2 - 1) * 18;
      const crack = ((x + y * 3) % 7 === 0) ? -20 : 0;
      setpx(ox + x, oy + y, 110 + n + crack, 110 + n + crack, 112 + n + crack);
    }
  }

  // ---- MOSSY_STONE (97) ---------------------------------------------------------
  {
    const col = TILES.MOSSY_STONE % ATLAS_COLS;
    const row = Math.floor(TILES.MOSSY_STONE / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      const n = (rng() * 2 - 1) * 14;
      const mossy = (rng() < 0.3) ? 25 : 0;
      setpx(ox + x, oy + y, 95 + n - mossy * 0.5, 105 + n + mossy, 95 + n);
    }
  }

  // ---- BRICK (98) ---------------------------------------------------------------
  {
    const col = TILES.BRICK % ATLAS_COLS;
    const row = Math.floor(TILES.BRICK / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      const isMortar = (y % 4 === 0) || ((x + (y < 4 || (y >= 8 && y < 12) ? 0 : 8)) % 16 === 0 && y % 4 !== 0);
      const n = (rng() * 2 - 1) * 8;
      if (isMortar) setpx(ox + x, oy + y, 180 + n, 175 + n, 165 + n);
      else setpx(ox + x, oy + y, 155 + n, 75 + n, 60 + n);
    }
  }

  // ---- OBSIDIAN (99) ------------------------------------------------------------
  {
    const col = TILES.OBSIDIAN % ATLAS_COLS;
    const row = Math.floor(TILES.OBSIDIAN / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      const n = (rng() * 2 - 1) * 8;
      const sheen = rng() < 0.08 ? 20 : 0;
      setpx(ox + x, oy + y, 20 + n + sheen, 15 + n, 30 + n + sheen);
    }
  }

  // ---- GLASS_PANE (100) ---------------------------------------------------------
  {
    const col = TILES.GLASS_PANE % ATLAS_COLS;
    const row = Math.floor(TILES.GLASS_PANE / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      const edge = x === 0 || x === 15 || y === 0 || y === 15;
      const n = (rng() * 2 - 1) * 5;
      if (edge) setpx(ox + x, oy + y, 180 + n, 210 + n, 220 + n);
      else setpx(ox + x, oy + y, 200 + n, 225 + n, 235 + n);
    }
  }

  // ---- FENCE (101) --------------------------------------------------------------
  // Cutout texture: only the post + two rails are painted; the rest stays
  // transparent (alpha 0) and is discarded by the opaque pass alphaTest.
  {
    const col = TILES.FENCE % ATLAS_COLS;
    const row = Math.floor(TILES.FENCE / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      const post = (x >= 6 && x <= 9);
      const rail = (y >= 3 && y <= 5) || (y >= 10 && y <= 12);
      if (!post && !rail) continue;
      const n = (rng() * 2 - 1) * 10;
      const edge = post && (x === 6 || x === 9);
      setpx(ox + x, oy + y, (edge ? 140 : 160) + n, (edge ? 102 : 120) + n, (edge ? 58 : 70) + n);
    }
  }

  // ---- BOOKSHELF (102) ----------------------------------------------------------
  {
    const col = TILES.BOOKSHELF % ATLAS_COLS;
    const row = Math.floor(TILES.BOOKSHELF / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      const n = (rng() * 2 - 1) * 8;
      const shelf = y === 0 || y === 5 || y === 10 || y === 15;
      if (shelf) setpx(ox + x, oy + y, 160 + n, 120 + n, 60 + n);
      else {
        const bookColor = ((x + y) * 7) % 3;
        if (bookColor === 0) setpx(ox + x, oy + y, 140 + n, 40 + n, 30 + n);
        else if (bookColor === 1) setpx(ox + x, oy + y, 30 + n, 80 + n, 130 + n);
        else setpx(ox + x, oy + y, 50 + n, 120 + n, 50 + n);
      }
    }
  }

  // ---- TNT_SIDE (103) -----------------------------------------------------------
  {
    const col = TILES.TNT_SIDE % ATLAS_COLS;
    const row = Math.floor(TILES.TNT_SIDE / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      const n = (rng() * 2 - 1) * 8;
      const band = y >= 5 && y <= 10;
      if (band) setpx(ox + x, oy + y, 200 + n, 50 + n, 40 + n);
      else setpx(ox + x, oy + y, 180 + n, 155 + n, 110 + n);
    }
  }

  // ---- TNT_TOP (104) ------------------------------------------------------------
  {
    const col = TILES.TNT_TOP % ATLAS_COLS;
    const row = Math.floor(TILES.TNT_TOP / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      const n = (rng() * 2 - 1) * 10;
      const center = Math.hypot(x - 7.5, y - 7.5) < 4;
      if (center) setpx(ox + x, oy + y, 50 + n, 50 + n, 50 + n);
      else setpx(ox + x, oy + y, 180 + n, 155 + n, 110 + n);
    }
  }

  // ---- STONE_BRICK (105) --------------------------------------------------------
  {
    const col = TILES.STONE_BRICK % ATLAS_COLS;
    const row = Math.floor(TILES.STONE_BRICK / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      const n = (rng() * 2 - 1) * 10;
      const mortar = (y % 8 === 0) || ((x + (y < 8 ? 0 : 8)) % 16 === 0 && y % 8 !== 0);
      if (mortar) setpx(ox + x, oy + y, 145 + n, 145 + n, 145 + n);
      else setpx(ox + x, oy + y, 120 + n, 120 + n, 124 + n);
    }
  }

  // ---- GRAVEL (106) -------------------------------------------------------------
  {
    const col = TILES.GRAVEL % ATLAS_COLS;
    const row = Math.floor(TILES.GRAVEL / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      const n = (rng() * 2 - 1) * 22;
      setpx(ox + x, oy + y, 130 + n, 125 + n, 120 + n);
    }
  }

  // ---- CLAY (107) ---------------------------------------------------------------
  {
    const col = TILES.CLAY % ATLAS_COLS;
    const row = Math.floor(TILES.CLAY / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      const n = (rng() * 2 - 1) * 8;
      setpx(ox + x, oy + y, 160 + n, 165 + n, 175 + n);
    }
  }

  // ---- REDSTONE_WIRE (108) ------------------------------------------------------
  {
    const col = TILES.REDSTONE_WIRE % ATLAS_COLS;
    const row = Math.floor(TILES.REDSTONE_WIRE / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      const onLine = (x === 7 || x === 8) || (y === 7 || y === 8);
      const n = (rng() * 2 - 1) * 10;
      if (onLine) setpx(ox + x, oy + y, 180 + n, 20 + n, 20 + n);
    }
  }

  // ---- LEVER (109) --------------------------------------------------------------
  {
    const col = TILES.LEVER % ATLAS_COLS;
    const row = Math.floor(TILES.LEVER / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      const n = (rng() * 2 - 1) * 8;
      const isStick = (x >= 7 && x <= 8 && y >= 3 && y <= 12);
      const isBase = (x >= 5 && x <= 10 && y >= 12 && y <= 14);
      if (isStick) setpx(ox + x, oy + y, 140 + n, 100 + n, 50 + n);
      else if (isBase) setpx(ox + x, oy + y, 100 + n, 100 + n, 105 + n);
    }
  }

  // ---- REDSTONE_TORCH (110) -----------------------------------------------------
  {
    const col = TILES.REDSTONE_TORCH % ATLAS_COLS;
    const row = Math.floor(TILES.REDSTONE_TORCH / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) {
      const n = (rng() * 2 - 1) * 8;
      const isStick = (x >= 7 && x <= 8 && y >= 6 && y <= 14);
      const isHead = (x >= 6 && x <= 9 && y >= 2 && y <= 6);
      if (isHead) setpx(ox + x, oy + y, 200 + n, 40 + n, 30 + n);
      else if (isStick) setpx(ox + x, oy + y, 130 + n, 90 + n, 45 + n);
    }
  }

  // ---- BOW (111) ----------------------------------------------------------------
  {
    const col = TILES.BOW % ATLAS_COLS;
    const row = Math.floor(TILES.BOW / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    // Wooden arc bending from top-right to bottom-right, string on the left.
    for (let y = 2; y <= 13; y++) {
      const t = (y - 2) / 11;                          // 0..1 along the bow
      const bend = Math.round(Math.sin(t * Math.PI) * 4); // how far the wood bows out
      const x = 9 + bend;
      const n = (rng() * 2 - 1) * 10;
      setpx(ox + x, oy + y, 150 + n, 108 + n, 58 + n);
      setpx(ox + x - 1, oy + y, 128 + n, 90 + n, 46 + n);
    }
    // String: straight vertical line joining the bow tips.
    for (let y = 2; y <= 13; y++) setpx(ox + 8, oy + y, 225, 225, 225);
    // Grip wrap in the middle of the wood.
    setpx(ox + 13, oy + 7, 96, 66, 34);
    setpx(ox + 13, oy + 8, 96, 66, 34);
  }

  // ---- FARMLAND (112) : dark tilled soil with furrow rows -----------------------
  {
    const { ox, oy } = speckle(TILES.FARMLAND, [104, 72, 48], 14);
    for (let y = 1; y < TILE_PX; y += 4) {
      for (let x = 0; x < TILE_PX; x++) {
        const n = (rng() * 2 - 1) * 8;
        setpx(ox + x, oy + y, 70 + n, 46 + n, 30 + n);
        setpx(ox + x, oy + y + 1, 62 + n, 40 + n, 26 + n);
      }
    }
  }

  // ---- WHEAT STAGES (113-116) : sprouts growing into golden stalks --------------
  const wheatStage = (index, height, color) => {
    const { ox, oy } = toolTile(index);
    for (let i = 0; i < 8; i++) {
      const bx = 1 + Math.floor(rng() * 14);
      for (let y = TILE_PX - 1; y >= TILE_PX - height; y--) {
        const n = (rng() * 2 - 1) * 16;
        setpx(ox + bx, oy + y, color[0] + n, color[1] + n, color[2] + n);
      }
    }
  };
  wheatStage(TILES.WHEAT_STAGE_0, 4, [70, 150, 60]);
  wheatStage(TILES.WHEAT_STAGE_1, 8, [86, 156, 56]);
  wheatStage(TILES.WHEAT_STAGE_2, 12, [140, 160, 60]);
  {
    // Mature wheat: tall golden stalks with heavy grain heads at the top.
    const { ox, oy } = toolTile(TILES.WHEAT_STAGE_3);
    for (let i = 0; i < 8; i++) {
      const bx = 1 + Math.floor(rng() * 14);
      for (let y = TILE_PX - 1; y >= 2; y--) {
        const n = (rng() * 2 - 1) * 14;
        setpx(ox + bx, oy + y, 208 + n, 176 + n, 72 + n);
      }
      setpx(ox + bx, oy + 1, 226, 196, 96);
      if (bx + 1 < TILE_PX) setpx(ox + bx + 1, oy + 2, 218, 188, 88);
    }
  }

  // ---- SEEDS (117) ---------------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.SEEDS);
    for (let i = 0; i < 10; i++) {
      const x = 4 + Math.floor(rng() * 8);
      const y = 4 + Math.floor(rng() * 8);
      setpx(ox + x, oy + y, 118, 168, 70);
      setpx(ox + x, oy + y + 1, 96, 140, 56);
    }
  }

  // ---- WHEAT_ITEM (118) : golden sheaf -------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.WHEAT_ITEM);
    for (let i = -2; i <= 2; i++) {
      const bx = 8 + i * 2;
      for (let y = 3; y <= 13; y++) {
        const n = (rng() * 2 - 1) * 12;
        setpx(ox + bx, oy + y, 210 + n, 178 + n, 74 + n);
      }
      setpx(ox + bx, oy + 2, 228, 198, 98);
    }
    for (let x = 4; x <= 12; x++) setpx(ox + x, oy + 10, 150, 116, 48); // binding twine
  }

  // ---- BREAD (119) ---------------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.BREAD);
    for (let y = 5; y <= 11; y++) {
      for (let x = 2; x <= 13; x++) {
        const dy = Math.abs(y - 8);
        if (dy > 3 - (x < 4 || x > 11 ? 1 : 0)) continue;
        const n = (rng() * 2 - 1) * 10;
        const crust = y <= 6 ? 20 : 0;
        setpx(ox + x, oy + y, 188 + crust + n, 132 + crust * 0.5 + n, 62 + n);
      }
    }
    for (let x = 4; x <= 11; x += 3) setpx(ox + x, oy + 6, 226, 190, 130); // score marks
  }

  // ---- HOES (120-122) : handle + short top bar -------------------------------------
  const hoeTile = (index, head) => {
    const { ox, oy } = toolTile(index);
    drawHandle(ox, oy);
    for (let x = 6; x <= 11; x++) setpx(ox + x, oy + 3, head[0], head[1], head[2]);
    setpx(ox + 6, oy + 4, head[0] - 30, head[1] - 30, head[2] - 30);
    setpx(ox + 6, oy + 5, head[0] - 30, head[1] - 30, head[2] - 30);
  };
  hoeTile(TILES.WOODEN_HOE, [156, 114, 66]);
  hoeTile(TILES.STONE_HOE, [150, 150, 154]);
  hoeTile(TILES.IRON_HOE, [204, 204, 210]);

  // ---- BONE_MEAL (123) : small white powder pile ---------------------------------
  {
    const { ox, oy } = toolTile(TILES.BONE_MEAL);
    for (let y = 7; y <= 12; y++) {
      const w = 12 - y + 2;
      for (let x = 8 - w; x <= 7 + w; x++) {
        if (rng() > 0.8) continue;
        const n = (rng() * 2 - 1) * 12;
        setpx(ox + x, oy + y, 232 + n, 230 + n, 218 + n);
      }
    }
  }

  // ---- CARROT STAGES (124-126) : leafy tops, orange root peeking when mature ------
  const carrotStage = (index, height, showRoot) => {
    const { ox, oy } = toolTile(index);
    for (let i = 0; i < 7; i++) {
      const bx = 2 + Math.floor(rng() * 12);
      for (let y = TILE_PX - 1; y >= TILE_PX - height; y--) {
        const n = (rng() * 2 - 1) * 14;
        setpx(ox + bx, oy + y, 52 + n, 138 + n, 46 + n);
      }
      if (showRoot) {
        setpx(ox + bx, oy + TILE_PX - 1, 224, 120, 32);
        setpx(ox + bx, oy + TILE_PX - 2, 208, 106, 26);
      }
    }
  };
  carrotStage(TILES.CARROT_STAGE_0, 4, false);
  carrotStage(TILES.CARROT_STAGE_1, 8, false);
  carrotStage(TILES.CARROT_STAGE_2, 11, true);

  // ---- CARROT item (127) -----------------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.CARROT);
    for (let y = 5; y <= 13; y++) {
      const w = Math.max(0, Math.round(2.5 - (y - 5) * 0.3));
      for (let x = 8 - w; x <= 8 + w; x++) {
        const n = (rng() * 2 - 1) * 10;
        setpx(ox + x, oy + y, 226 + n, 122 + n, 34 + n);
      }
    }
    setpx(ox + 7, oy + 3, 60, 140, 50);
    setpx(ox + 9, oy + 3, 60, 140, 50);
    setpx(ox + 8, oy + 4, 70, 150, 56);
  }

  // ---- RAIL_STRAIGHT (128) : two iron rails on wooden sleepers (transparent bg) ----
  {
    const { ox, oy } = toolTile(TILES.RAIL_STRAIGHT);
    for (let y = 1; y < TILE_PX; y += 4) {          // sleepers
      for (let x = 1; x <= 14; x++) {
        const n = (rng() * 2 - 1) * 10;
        setpx(ox + x, oy + y, 120 + n, 86 + n, 50 + n);
        setpx(ox + x, oy + y + 1, 104 + n, 74 + n, 42 + n);
      }
    }
    for (let y = 0; y < TILE_PX; y++) {             // rails
      const n = (rng() * 2 - 1) * 8;
      setpx(ox + 3, oy + y, 176 + n, 176 + n, 184 + n);
      setpx(ox + 12, oy + y, 176 + n, 176 + n, 184 + n);
    }
  }

  // ---- RAIL_CURVE (129) : rail bending from south edge to east edge ----------------
  {
    const { ox, oy } = toolTile(TILES.RAIL_CURVE);
    for (let i = 0; i < 3; i++) {                   // diagonal sleepers
      const d = 3 + i * 4;
      for (let k = -1; k <= 4; k++) {
        const x = d + k, y = TILE_PX - 1 - d + k;
        if (x >= 0 && x < TILE_PX && y >= 0 && y < TILE_PX) {
          const n = (rng() * 2 - 1) * 10;
          setpx(ox + x, oy + y, 120 + n, 86 + n, 50 + n);
        }
      }
    }
    // Two concentric quarter-arc rails from bottom edge to right edge.
    for (let t = 0; t <= 20; t++) {
      const a = (t / 20) * Math.PI / 2;
      for (const r of [5, 11]) {
        const x = Math.round(15 - Math.cos(a) * r);
        const y = Math.round(15 - Math.sin(a) * r);
        if (x >= 0 && x < TILE_PX && y >= 0 && y < TILE_PX) {
          setpx(ox + x, oy + y, 176, 176, 184);
        }
      }
    }
  }

  // ---- POWERED_RAIL / _ON (130, 131) : golden rails, redstone spine ---------------
  const poweredRailTile = (index, lit) => {
    const { ox, oy } = toolTile(index);
    for (let y = 1; y < TILE_PX; y += 4) {
      for (let x = 1; x <= 14; x++) {
        const n = (rng() * 2 - 1) * 10;
        setpx(ox + x, oy + y, 120 + n, 86 + n, 50 + n);
        setpx(ox + x, oy + y + 1, 104 + n, 74 + n, 42 + n);
      }
    }
    for (let y = 0; y < TILE_PX; y++) {
      const n = (rng() * 2 - 1) * 8;
      setpx(ox + 3, oy + y, 214 + n, 178 + n, 60 + n);   // gold rails
      setpx(ox + 12, oy + y, 214 + n, 178 + n, 60 + n);
      if (y % 2 === 0) {                                  // redstone spine
        setpx(ox + 7, oy + y, lit ? 255 : 96, lit ? 60 : 20, lit ? 40 : 16);
        setpx(ox + 8, oy + y, lit ? 235 : 84, lit ? 50 : 16, lit ? 34 : 12);
      }
    }
  };
  poweredRailTile(TILES.POWERED_RAIL, false);
  poweredRailTile(TILES.POWERED_RAIL_ON, true);

  // ---- PISTON_SIDE (132) : plank head strip over smooth stone body -----------------
  {
    const { ox, oy } = speckle(TILES.PISTON_SIDE, [110, 110, 116], 10);
    for (let y = 0; y <= 3; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const n = (rng() * 2 - 1) * 10;
        setpx(ox + x, oy + y, 178 + n, 138 + n, 86 + n);
      }
    }
    for (let x = 0; x < TILE_PX; x++) setpx(ox + x, oy + 4, 70, 70, 76);
  }

  // ---- PISTON_FACE (133) : full plank face with nailed border ----------------------
  {
    const { ox, oy } = speckle(TILES.PISTON_FACE, [178, 138, 86], 10);
    for (let i = 0; i < TILE_PX; i++) {
      setpx(ox + i, oy, 130, 96, 56);
      setpx(ox + i, oy + TILE_PX - 1, 130, 96, 56);
      setpx(ox, oy + i, 130, 96, 56);
      setpx(ox + TILE_PX - 1, oy + i, 130, 96, 56);
    }
    setpx(ox + 2, oy + 2, 110, 82, 48); setpx(ox + 13, oy + 2, 110, 82, 48);
    setpx(ox + 2, oy + 13, 110, 82, 48); setpx(ox + 13, oy + 13, 110, 82, 48);
  }

  // ---- PISTON_BACK (134) : stone with a dark socket --------------------------------
  {
    const { ox, oy } = speckle(TILES.PISTON_BACK, [110, 110, 116], 10);
    for (let y = 5; y <= 10; y++) {
      for (let x = 5; x <= 10; x++) setpx(ox + x, oy + y, 58, 58, 64);
    }
  }

  // ---- BUTTON (135) : full stone tile with a raised stud highlight -----------------
  {
    const { ox, oy } = speckle(TILES.BUTTON, [128, 128, 132], 12);
    for (let y = 5; y <= 10; y++) {
      for (let x = 4; x <= 11; x++) {
        const n = (rng() * 2 - 1) * 8;
        const hi = (y === 5 || x === 4) ? 26 : (y === 10 || x === 11) ? -26 : 8;
        setpx(ox + x, oy + y, 138 + hi + n, 138 + hi + n, 142 + hi + n);
      }
    }
  }

  // ---- PRESSURE_PLATE (136) : full stone tile with a bevelled slab ------------------
  {
    const { ox, oy } = speckle(TILES.PRESSURE_PLATE, [120, 120, 124], 10);
    for (let y = 2; y <= 13; y++) {
      for (let x = 2; x <= 13; x++) {
        const n = (rng() * 2 - 1) * 10;
        const hi = (y === 2 || x === 2) ? 20 : (y === 13 || x === 13) ? -20 : 6;
        setpx(ox + x, oy + y, 132 + hi + n, 132 + hi + n, 136 + hi + n);
      }
    }
  }

  // ---- REPEATER / _ON (137, 138) : stone slab, torch dots, arrow line --------------
  const repeaterTile = (index, lit) => {
    const { ox, oy } = speckle(index, [148, 148, 152], 8);
    const dot = (cx, cy) => {
      setpx(ox + cx, oy + cy, lit ? 255 : 120, lit ? 70 : 30, lit ? 50 : 24);
      setpx(ox + cx + 1, oy + cy, lit ? 235 : 104, lit ? 58 : 24, lit ? 42 : 20);
      setpx(ox + cx, oy + cy + 1, lit ? 235 : 104, lit ? 58 : 24, lit ? 42 : 20);
    };
    dot(7, 3);
    dot(7, 10);
    for (let y = 5; y <= 9; y++) setpx(ox + 8, oy + y, lit ? 230 : 96, lit ? 56 : 22, lit ? 40 : 18);
  };
  repeaterTile(TILES.REPEATER, false);
  repeaterTile(TILES.REPEATER_ON, true);

  // ---- REDSTONE_LAMP / _ON (139, 140) : amber cells in a dark frame ----------------
  const lampTile = (index, lit) => {
    const { ox, oy } = speckle(index, lit ? [232, 178, 72] : [92, 64, 36], lit ? 14 : 10);
    for (let i = 0; i < TILE_PX; i++) {
      setpx(ox + i, oy, 52, 38, 26); setpx(ox + i, oy + TILE_PX - 1, 52, 38, 26);
      setpx(ox, oy + i, 52, 38, 26); setpx(ox + TILE_PX - 1, oy + i, 52, 38, 26);
    }
    for (let i = 1; i < TILE_PX - 1; i++) {
      setpx(ox + i, oy + 8, lit ? 200 : 64, lit ? 146 : 46, lit ? 56 : 30);
      setpx(ox + 8, oy + i, lit ? 200 : 64, lit ? 146 : 46, lit ? 56 : 30);
    }
    if (lit) {
      setpx(ox + 4, oy + 4, 255, 224, 140); setpx(ox + 11, oy + 4, 255, 224, 140);
      setpx(ox + 4, oy + 11, 255, 224, 140); setpx(ox + 11, oy + 11, 255, 224, 140);
    }
  };
  lampTile(TILES.REDSTONE_LAMP, false);
  lampTile(TILES.REDSTONE_LAMP_ON, true);

  // ---- NETHERRACK (141) : dark crimson mottle --------------------------------------
  {
    const { ox, oy } = speckle(TILES.NETHERRACK, [110, 42, 38], 20);
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        if (rng() > 0.82) setpx(ox + x, oy + y, 74, 22, 22);
        else if (rng() > 0.9) setpx(ox + x, oy + y, 150, 66, 56);
      }
    }
  }

  // ---- SOUL_SAND (142) : dull brown with dark hollow "faces" -----------------------
  {
    const { ox, oy } = speckle(TILES.SOUL_SAND, [96, 74, 56], 14);
    for (let i = 0; i < 4; i++) {
      const fx = 2 + Math.floor(rng() * 11);
      const fy = 2 + Math.floor(rng() * 11);
      setpx(ox + fx, oy + fy, 52, 38, 28);
      setpx(ox + fx + 2, oy + fy, 52, 38, 28);
      setpx(ox + fx + 1, oy + fy + 2, 58, 42, 30);
    }
  }

  // ---- GLOWSTONE (143) : bright crystal clusters -----------------------------------
  {
    const { ox, oy } = speckle(TILES.GLOWSTONE, [214, 168, 86], 18);
    for (let i = 0; i < 10; i++) {
      const gx = 1 + Math.floor(rng() * 14);
      const gy = 1 + Math.floor(rng() * 14);
      setpx(ox + gx, oy + gy, 255, 232, 150);
      setpx(ox + gx + (rng() > 0.5 ? 1 : -1), oy + gy, 244, 214, 120);
    }
  }

  // ---- NETHER_PORTAL (144) : swirling purple ---------------------------------------
  {
    const { ox, oy } = speckle(TILES.NETHER_PORTAL, [96, 32, 160], 24);
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const s = Math.sin((x + y * 1.7) * 0.8) + Math.sin(x * 0.5 - y * 0.9);
        if (s > 1.0) setpx(ox + x, oy + y, 178, 96, 244);
        else if (s < -1.2) setpx(ox + x, oy + y, 52, 12, 96);
      }
    }
  }

  // ---- NETHER_BRICK (145) : dark red bricks ----------------------------------------
  {
    const { ox, oy } = speckle(TILES.NETHER_BRICK, [66, 26, 30], 10);
    for (let y = 0; y < TILE_PX; y++) {
      if (y % 4 === 0) {
        for (let x = 0; x < TILE_PX; x++) setpx(ox + x, oy + y, 36, 14, 16);
      } else {
        const off = (Math.floor(y / 4) % 2) * 4;
        for (let x = 0; x < TILE_PX; x += 8) {
          const bx = (x + off) % TILE_PX;
          setpx(ox + bx, oy + y, 36, 14, 16);
        }
      }
    }
  }

  // ---- LAVA (146) : molten orange with bright veins --------------------------------
  {
    const { ox, oy } = speckle(TILES.LAVA, [214, 92, 22], 22);
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const s = Math.sin(x * 0.9 + y * 0.4) + Math.sin(y * 1.1 - x * 0.3);
        if (s > 1.1) {
          const n = (rng() * 2 - 1) * 12;
          setpx(ox + x, oy + y, 252, 200 + n, 66 + n);
        } else if (s < -1.3) {
          setpx(ox + x, oy + y, 150, 44, 12);
        }
      }
    }
  }

  // ---- MOB_SPAWNER (147) : dark cage lattice (holes transparent) -------------------
  {
    const { ox, oy } = toolTile(TILES.MOB_SPAWNER);
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const bar = x % 4 === 0 || y % 4 === 0 || x === TILE_PX - 1 || y === TILE_PX - 1;
        if (bar) {
          const n = (rng() * 2 - 1) * 8;
          setpx(ox + x, oy + y, 40 + n, 46 + n, 52 + n);
        }
      }
    }
  }

  // ---- FLINT_AND_STEEL (148) : steel arc over a flint shard ------------------------
  {
    const { ox, oy } = toolTile(TILES.FLINT_AND_STEEL);
    for (let t = 0; t <= 14; t++) {                 // steel C-arc
      const a = Math.PI * 0.25 + (t / 14) * Math.PI;
      const x = Math.round(8 + Math.cos(a) * 4.5);
      const y = Math.round(6 + Math.sin(a) * 4.5);
      setpx(ox + x, oy + y, 198, 198, 206);
      setpx(ox + x, oy + y + 1, 150, 150, 158);
    }
    for (let y = 9; y <= 13; y++) {                 // flint shard
      for (let x = 8; x <= 12; x++) {
        if (x - 8 > 13 - y) continue;
        setpx(ox + x, oy + y, 74, 70, 68);
      }
    }
    setpx(ox + 9, oy + 8, 255, 214, 100);           // spark
  }

  // ---- MINECART_ITEM (149) : grey cart side view -----------------------------------
  {
    const { ox, oy } = toolTile(TILES.MINECART_ITEM);
    for (let y = 5; y <= 11; y++) {
      for (let x = 2; x <= 13; x++) {
        const rim = y === 5 || x === 2 || x === 13;
        const n = (rng() * 2 - 1) * 8;
        setpx(ox + x, oy + y, (rim ? 148 : 106) + n, (rim ? 148 : 106) + n, (rim ? 154 : 112) + n);
      }
    }
    for (let y = 6; y <= 9; y++) for (let x = 4; x <= 11; x++) setpx(ox + x, oy + y, 66, 66, 72);
    setpx(ox + 4, oy + 12, 40, 40, 44); setpx(ox + 5, oy + 12, 40, 40, 44);
    setpx(ox + 10, oy + 12, 40, 40, 44); setpx(ox + 11, oy + 12, 40, 40, 44);
  }

  // ---- ENDER_PEARL (150) : deep teal orb -------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.ENDER_PEARL);
    const cx = 7.5, cy = 7.5;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < 5.5) {
          const n = (rng() * 2 - 1) * 12;
          const hi = x < cx && y < cy ? 30 : 0;
          setpx(ox + x, oy + y, 18 + hi + n, 96 + hi + n, 86 + hi + n);
        }
      }
    }
    setpx(ox + 6, oy + 5, 150, 236, 214);
  }

  // ---- SPIDER_EYE (151) : red eye with dark pupil ----------------------------------
  {
    const { ox, oy } = toolTile(TILES.SPIDER_EYE);
    for (let y = 4; y <= 11; y++) {
      for (let x = 3; x <= 12; x++) {
        const d = Math.hypot((x - 7.5) * 0.8, y - 7.5);
        if (d < 3.8) {
          const n = (rng() * 2 - 1) * 14;
          setpx(ox + x, oy + y, 168 + n, 34 + n, 44 + n);
        }
      }
    }
    setpx(ox + 7, oy + 7, 30, 8, 12); setpx(ox + 8, oy + 7, 30, 8, 12);
    setpx(ox + 7, oy + 8, 30, 8, 12); setpx(ox + 8, oy + 8, 30, 8, 12);
  }

  // ---- GLOWSTONE_DUST (152) : glowing yellow pile ----------------------------------
  {
    const { ox, oy } = toolTile(TILES.GLOWSTONE_DUST);
    for (let y = 7; y <= 12; y++) {
      const w = y - 5;
      for (let x = 8 - w; x <= 7 + w; x++) {
        if (rng() > 0.85) continue;
        const n = (rng() * 2 - 1) * 16;
        setpx(ox + x, oy + y, 240 + n, 208 + n, 96 + n);
      }
    }
    setpx(ox + 6, oy + 6, 255, 240, 160);
    setpx(ox + 10, oy + 8, 255, 240, 160);
  }

  // ---- NETHER_STAR (153) : white four-pointed star ---------------------------------
  {
    const { ox, oy } = toolTile(TILES.NETHER_STAR);
    for (let i = 0; i <= 5; i++) {
      const f = 255 - i * 12;
      setpx(ox + 8, oy + 2 + i, f, f, 255);          // top ray
      setpx(ox + 8, oy + 13 - i, f, f, 255);         // bottom ray
      setpx(ox + 2 + i, oy + 8, f, f, 255);          // left ray
      setpx(ox + 13 - i, oy + 8, f, f, 255);         // right ray
    }
    setpx(ox + 7, oy + 7, 220, 228, 255); setpx(ox + 9, oy + 7, 220, 228, 255);
    setpx(ox + 7, oy + 9, 220, 228, 255); setpx(ox + 9, oy + 9, 220, 228, 255);
    setpx(ox + 8, oy + 8, 255, 255, 255);
  }

  // ---- BLAZE_ROD (154) : golden rod -------------------------------------------------
  {
    const { ox, oy } = toolTile(TILES.BLAZE_ROD);
    for (let i = 2; i < 14; i++) {
      const n = (rng() * 2 - 1) * 14;
      setpx(ox + i, oy + (TILE_PX - 1 - i), 238 + n, 178 + n, 60 + n);
      setpx(ox + i, oy + (TILE_PX - 2 - i), 214 + n, 148 + n, 40 + n);
    }
    setpx(ox + 4, oy + 11, 255, 226, 130);
    setpx(ox + 11, oy + 4, 255, 226, 130);
  }

  // ---- BOSS_SIGIL (155) : purple rune diamond --------------------------------------
  {
    const { ox, oy } = toolTile(TILES.BOSS_SIGIL);
    for (let y = 2; y <= 13; y++) {
      const w = 6 - Math.abs(y - 7.5);
      for (let x = Math.round(8 - w); x <= Math.round(7 + w); x++) {
        const n = (rng() * 2 - 1) * 16;
        setpx(ox + x, oy + y, 96 + n, 30 + n, 150 + n);
      }
    }
    for (let y = 5; y <= 10; y++) setpx(ox + 8, oy + y, 220, 140, 255); // rune stroke
    setpx(ox + 6, oy + 7, 220, 140, 255); setpx(ox + 10, oy + 8, 220, 140, 255);
  }

  // ---- GOLDEN_APPLE (156) : gilded apple -------------------------------------------
  {
    const col = TILES.GOLDEN_APPLE % ATLAS_COLS;
    const row = Math.floor(TILES.GOLDEN_APPLE / ATLAS_COLS);
    const ox = col * TILE_PX, oy = row * TILE_PX;
    const cx = TILE_PX / 2 - 0.5, cy = TILE_PX / 2 + 0.5;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const d = Math.sqrt((x - cx) ** 2 + ((y - cy) * 0.9) ** 2);
        if (d < 6) {
          const shade = x < cx ? 24 : 0;
          const n = (rng() * 2 - 1) * 10;
          setpx(ox + x, oy + y, 232 + shade + n, 186 + shade + n, 52 + n);
        }
      }
    }
    setpx(ox + (cx | 0), oy + 2, 120, 84, 40);
    setpx(ox + (cx | 0), oy + 3, 120, 84, 40);
    setpx(ox + 5, oy + 6, 255, 236, 150);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false; // matches tileUV() convention in config.js (v0 = top edge)
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
