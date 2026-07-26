// =============================================================================
// end.js — The End dimension: a single end-stone island floating in the void,
// ringed by eight obsidian pillars that carry the dragon's healing crystals.
//
// Extends World like nether.js does: same chunk streaming / edits / lighting
// machinery, no skylight (dim.hasSky false), custom generator. There is no
// bedrock floor — everything outside the island is VOID and falling below the
// world kills (main.js).
// =============================================================================

import { World } from './world.js';
import { CHUNK_SIZE, CHUNK_HEIGHT, BLOCK, DIMENSIONS } from './config.js';

// Island shape constants (see islandSurface/islandThickness below).
const SURFACE_Y = 60;       // nominal island surface height
const CORE_RADIUS = 90;     // fully solid out to here...
const EDGE_RADIUS = 110;    // ...tapering to nothing by here

// Obsidian pillars: 8 on a ring of radius 35, heights 15-30 above the surface
// (deterministic per index, no noise involved so main.js can place crystals).
const PILLAR_RING_RADIUS = 35;
const PILLAR_COUNT = 8;

// Where arriving players materialise: a 5x5 obsidian platform near the island
// edge (built by main.js on first travel; constant so saves stay aligned).
export const END_SPAWN = { x: 95, y: 48, z: 0 };

const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export class EndWorld extends World {
  constructor(scene, atlasTexture) {
    super(scene, atlasTexture, 1); // gen profile irrelevant; keep the V1 noise fields
    this.dim = DIMENSIONS.end;
  }

  // 0..1 island density: 1 inside the core, easing to 0 at the edge radius.
  _taper(wx, wz) {
    const r = Math.hypot(wx, wz);
    if (r >= EDGE_RADIUS) return 0;
    if (r <= CORE_RADIUS) return 1;
    return smooth01((EDGE_RADIUS - r) / (EDGE_RADIUS - CORE_RADIUS));
  }

  // Undulating island surface height for a column (only meaningful where
  // _taper > 0). Deterministic via the shared seeded noise fields.
  islandSurface(wx, wz) {
    const n = this.noise.fbm2D(wx + 9000, wz + 9000, { frequency: 0.02, octaves: 3 });
    return Math.floor(SURFACE_Y + n * 4 * this._taper(wx, wz));
  }

  // The 8 pillar specs: centre column, top Y. Pure/deterministic, used both by
  // generateChunk and by main.js to perch the end crystals.
  pillarSpecs() {
    const specs = [];
    for (let i = 0; i < PILLAR_COUNT; i++) {
      const ang = (i / PILLAR_COUNT) * Math.PI * 2;
      const x = Math.round(Math.cos(ang) * PILLAR_RING_RADIUS);
      const z = Math.round(Math.sin(ang) * PILLAR_RING_RADIUS);
      const height = 15 + ((i * 7 + (this.terrain.seed % 5)) % 16); // 15..30
      specs.push({ x, z, topY: this.islandSurface(x, z) + height });
    }
    return specs;
  }

  generateChunk(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = ox + x, wz = oz + z;
        const taper = this._taper(wx, wz);
        if (taper <= 0) continue; // the void: no blocks at all

        const top = this.islandSurface(wx, wz);
        const thick = this.noise.fbm2D(wx - 6000, wz + 6000, { frequency: 0.025, octaves: 2 });
        const thickness = Math.max(1, Math.floor((18 + thick * 10) * taper));
        const bottom = Math.max(1, top - thickness);
        for (let y = bottom; y <= top && y < CHUNK_HEIGHT; y++) {
          chunk.setBlockLocal(x, y, z, BLOCK.END_STONE);
        }
      }
    }

    // Obsidian pillars: 3x3 columns rising from the island surface.
    for (const p of this.pillarSpecs()) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const wx = p.x + dx, wz = p.z + dz;
          const lx = wx - ox, lz = wz - oz;
          if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
          const base = Math.max(1, this.islandSurface(wx, wz) - 2);
          for (let y = base; y <= p.topY && y < CHUNK_HEIGHT; y++) {
            chunk.setBlockLocal(lx, y, lz, BLOCK.OBSIDIAN);
          }
        }
      }
    }

    this.applyPending(chunk);
    this.applyEdits(chunk);
  }

  // No overworld biome/river logic here.
  biomeAt() { return 0; }
  riverAt() { return false; }

  // Nominal ground height: island surface inside the island, the void floor
  // (0) outside — mobs.js/minimap treat missing columns gracefully.
  columnHeight(x, z) {
    return this._taper(x, z) > 0 ? this.islandSurface(x, z) : 0;
  }

  // Where dimension travel drops entities (main.js overrides with END_SPAWN
  // for the player; this keeps World.findSpawn callers sane).
  findSpawn() {
    return { x: 0, z: 0, h: this.islandSurface(0, 0) };
  }
}
