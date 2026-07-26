// =============================================================================
// nether.js — The nether dimension: a roofed netherrack cavern world with a
// lava sea, glowstone clusters, soul sand patches and brick fortresses
// (fortresses come from structures.js via the skyless branch).
//
// Extends World: same chunk streaming / edits / lighting machinery, different
// terrain generator and no skylight. Coordinates map 1:4 to the overworld
// (handled by portal travel in main.js).
// =============================================================================

import { World } from './world.js';
import { decorateStructures } from './structures.js';
import { CHUNK_SIZE, CHUNK_HEIGHT, BLOCK } from './config.js';

const LAVA_LEVEL = 12;

export class NetherWorld extends World {
  constructor(scene, atlasTexture) {
    super(scene, atlasTexture);
    this.skyless = true;
  }

  netherFloor(wx, wz) {
    const n = this.noise.fbm2D(wx + 5000, wz - 5000, { frequency: 0.02, octaves: 3 });
    return Math.max(4, Math.min(24, Math.floor(14 + n * 8)));
  }

  netherCeiling(wx, wz) {
    const n = this.noise.fbm2D(wx - 8000, wz + 8000, { frequency: 0.025, octaves: 3 });
    return Math.max(42, Math.min(CHUNK_HEIGHT - 2, Math.floor(52 + n * 7)));
  }

  generateChunk(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = ox + x, wz = oz + z;
        const floorH = this.netherFloor(wx, wz);
        const ceilH = this.netherCeiling(wx, wz);

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let id = BLOCK.AIR;
          if (y === 0 || y === CHUNK_HEIGHT - 1) {
            id = BLOCK.BEDROCK;
          } else if (y <= floorH) {
            id = BLOCK.NETHERRACK;
          } else if (y >= ceilH) {
            id = BLOCK.NETHERRACK;
          } else if (y <= LAVA_LEVEL) {
            id = BLOCK.LAVA;
          }
          if (id !== BLOCK.AIR) chunk.setBlockLocal(x, y, z, id);
        }

        // Surface variety on the floor: soul sand bogs and gravel patches.
        if (floorH > LAVA_LEVEL) {
          const s = this.hash01_3(wx, floorH, wz, 2001);
          if (s < 0.10) chunk.setBlockLocal(x, floorH, z, BLOCK.SOUL_SAND);
          else if (s < 0.16) chunk.setBlockLocal(x, floorH, z, BLOCK.GRAVEL);
        }

        // Glowstone clusters hanging from the ceiling.
        if (this.hash01_3(wx, 0, wz, 2003) < 0.006) {
          const drop = 1 + Math.floor(this.hash01_3(wx, 1, wz, 2004) * 3);
          for (let d = 0; d < drop; d++) {
            chunk.setBlockLocal(x, ceilH - 1 - d, z, BLOCK.GLOWSTONE);
          }
        }

        // Occasional lava pockets embedded in the floor glow through caves.
        if (floorH > LAVA_LEVEL + 3 && this.hash01_3(wx, floorH - 2, wz, 2005) < 0.01) {
          chunk.setBlockLocal(x, floorH, z, BLOCK.LAVA);
        }
      }
    }

    decorateStructures(this, chunk);
    this.applyPending(chunk);
    this.applyEdits(chunk);
  }

  // No rivers or biome logic in the nether.
  biomeAt() { return 0; }
  riverAt() { return false; }

  // Where a portal drops the player: the nether floor at (x,z).
  landingHeight(x, z) {
    let h = this.netherFloor(x, z);
    // If generation placed something extra there, scan up a little.
    let y = h;
    for (let i = 0; i < 8; i++) {
      const above = this.getBlock(x, y + 1, z);
      if (above === BLOCK.AIR) break;
      y++;
    }
    return y;
  }
}
