// =============================================================================
// terrain.js — Pure (three-free) terrain math for the overworld, split out of
// world.js so the Node smoke suite can assert GEN_V1 bit-fidelity headlessly.
//
// Two terrain profiles:
//   GEN_V1 — the pre-Phase-5 generator, preserved EXACTLY (same noise fields,
//            same formulas) so old saves regenerate identical surfaces and all
//            existing player edits stay aligned. The only difference at height
//            128 is more empty air above.
//   GEN_V2 — new worlds: a continentalness field C = fbm(x·0.0015, z·0.0015)
//            drives a C1-continuous base/amplitude spline (ocean floors 8-14 →
//            coast/plains 21-26 → hills 26-40 → mountains 40-95, ridged peaks
//            to ~110), coherent biomes (ocean/beach/mountains layered on the
//            temperature/moisture cascade plus birch forest, taiga, swamp),
//            cave entrances (the V1 worm caves without the surface seal),
//            noodle caves (two ridged 3D fields) and ravines (2D crack field).
// =============================================================================

import { Noise } from './noise.js';
import {
  CHUNK_HEIGHT, BASE_HEIGHT, HEIGHT_AMP, SEA_LEVEL, BIOME, BLOCK,
} from './config.js';

const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;

// GEN_V2 continentalness spline control points: C -> { base height, detail
// amplitude }. Interpolated with smoothstep per segment (zero slope at every
// knot), so the height field is C1-continuous — no cliffs at region borders.
const SPLINE = [
  { c: -1.00, base: 8, amp: 2 },   // deep ocean floor
  { c: -0.45, base: 10, amp: 2 },
  { c: -0.25, base: 14, amp: 3 },  // ocean edge rising toward the coast
  { c: -0.10, base: 21, amp: 4 },  // coast
  { c: 0.10, base: 26, amp: 6 },   // plains
  { c: 0.55, base: 40, amp: 14 },  // hills
  { c: 0.75, base: 68, amp: 24 },  // mountain flanks
  { c: 1.00, base: 95, amp: 30 },  // high mountains
];

export class TerrainGen {
  constructor(seed, genVersion = 2) {
    this.seed = seed;
    this.genVersion = genVersion;
    // Same seeds/fields as the pre-Phase-5 World constructor (V1 fidelity).
    this.noise = new Noise(seed);
    this.tempNoise = new Noise(seed + 101);
    this.moistNoise = new Noise(seed + 211);
    this.riverNoise = new Noise(seed + 301);
    // GEN_V2-only fields.
    this.contNoise = new Noise(seed + 401);
    this.ridgeNoise = new Noise(seed + 501);
  }

  // ---- Shared deterministic hashes (identical to world.js's copies) --------
  hash01_3(x, y, z, salt = 0) {
    let h = (
      Math.imul(x, 374761393) ^
      Math.imul(y, 668265263) ^
      Math.imul(z, 2246822519) ^
      Math.imul(this.seed + salt, 1442695041)
    ) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  valueNoise3(x, y, z, frequency, salt) {
    const sx = x * frequency;
    const sy = y * frequency;
    const sz = z * frequency;
    const ix = Math.floor(sx), iy = Math.floor(sy), iz = Math.floor(sz);
    const fx = sx - ix, fy = sy - iy, fz = sz - iz;
    const ux = smooth01(fx), uy = smooth01(fy), uz = smooth01(fz);

    const c000 = this.hash01_3(ix, iy, iz, salt);
    const c100 = this.hash01_3(ix + 1, iy, iz, salt);
    const c010 = this.hash01_3(ix, iy + 1, iz, salt);
    const c110 = this.hash01_3(ix + 1, iy + 1, iz, salt);
    const c001 = this.hash01_3(ix, iy, iz + 1, salt);
    const c101 = this.hash01_3(ix + 1, iy, iz + 1, salt);
    const c011 = this.hash01_3(ix, iy + 1, iz + 1, salt);
    const c111 = this.hash01_3(ix + 1, iy + 1, iz + 1, salt);

    const x00 = lerp(c000, c100, ux);
    const x10 = lerp(c010, c110, ux);
    const x01 = lerp(c001, c101, ux);
    const x11 = lerp(c011, c111, ux);
    return lerp(lerp(x00, x10, uy), lerp(x01, x11, uy), uz);
  }

  // ---- Heights --------------------------------------------------------------
  // GEN_V1: bit-identical to the pre-Phase-5 World.columnHeight (heights never
  // came near the old 63 clamp, so raising the ceiling changes nothing).
  columnHeightV1(x, z) {
    const n = this.noise.fbm2D(x, z, { frequency: 0.012, octaves: 4 });
    let h = Math.floor(BASE_HEIGHT + HEIGHT_AMP * n);
    if (h < 1) h = 1;
    if (h > CHUNK_HEIGHT - 1) h = CHUNK_HEIGHT - 1;
    return h;
  }

  // Continentalness in ~[-1, 1]; very low frequency = continent-sized regions.
  // Normalised fbm compresses toward 0 (empirically ~[-0.58, 0.59] for this
  // seed), so stretch by 1.8 to make deep oceans and high mountains actually
  // occur, then clamp to the spline's domain.
  contC(x, z) {
    const c = this.contNoise.fbm2D(x, z, { frequency: 0.0015, octaves: 3 }) * 1.8;
    return c < -1 ? -1 : c > 1 ? 1 : c;
  }

  // Spline lookup: { base, amp } for a continentalness value.
  splineAt(c) {
    if (c <= SPLINE[0].c) return { base: SPLINE[0].base, amp: SPLINE[0].amp };
    for (let i = 0; i < SPLINE.length - 1; i++) {
      const a = SPLINE[i], b = SPLINE[i + 1];
      if (c <= b.c) {
        const t = smooth01((c - a.c) / (b.c - a.c));
        return { base: lerp(a.base, b.base, t), amp: lerp(a.amp, b.amp, t) };
      }
    }
    const last = SPLINE[SPLINE.length - 1];
    return { base: last.base, amp: last.amp };
  }

  columnHeightV2(x, z) {
    const c = this.contC(x, z);
    const { base, amp } = this.splineAt(c);
    // Detail reuses the V1 terrain field (same character, scaled by amp).
    const d = this.noise.fbm2D(x, z, { frequency: 0.01, octaves: 4 });
    let h = base + amp * d;
    // Ridged bonus fades in above C 0.55: |fbm| ridges make sharp peaks.
    if (c > 0.55) {
      const r = 1 - Math.abs(this.ridgeNoise.fbm2D(x, z, { frequency: 0.008, octaves: 2 }));
      const w = smooth01((c - 0.55) / 0.45);
      h += w * r * r * 18; // peaks reach ~110
    }
    h = Math.floor(h);
    if (h < 1) h = 1;
    if (h > CHUNK_HEIGHT - 1) h = CHUNK_HEIGHT - 1;
    return h;
  }

  columnHeight(x, z) {
    return this.genVersion >= 2 ? this.columnHeightV2(x, z) : this.columnHeightV1(x, z);
  }

  // The smooth (pre-detail) base height — used by rivers so they only carve
  // through coast/plains/hills terrain, never mountains or the ocean floor.
  baseHeightV2(x, z) {
    return this.splineAt(this.contC(x, z)).base;
  }

  // ---- Biomes ---------------------------------------------------------------
  // GEN_V1 cascade, exactly as before Phase 5.
  biomeAtV1(x, z) {
    const t = this.tempNoise.fbm2D(x, z, { frequency: 0.0035, octaves: 2 });
    const m = this.moistNoise.fbm2D(x, z, { frequency: 0.0040, octaves: 2 });
    if (t > 0.33) return BIOME.DESERT;
    if (t < -0.33) return BIOME.SNOW;
    if (t > 0.05 && m > 0.25) return BIOME.JUNGLE;
    if (m < -0.3 && t < 0.05 && t > -0.2) return BIOME.MUSHROOM;
    if (m > 0.1) {
      const detail = this.moistNoise.fbm2D(x + 1000, z + 1000, { frequency: 0.008, octaves: 1 });
      if (detail > 0.15) return BIOME.FLOWER_FOREST;
      return BIOME.FOREST;
    }
    return BIOME.PLAINS;
  }

  // GEN_V2: continentalness picks ocean/beach/mountains so biome and height
  // always agree; the temperature/moisture cascade colours everything between,
  // extended with taiga, swamp and a birch-forest split.
  biomeAtV2(x, z) {
    const c = this.contC(x, z);
    if (c < -0.35) return BIOME.OCEAN;
    if (c < -0.25) return BIOME.BEACH;
    if (c > 0.6) return BIOME.MOUNTAINS;
    const t = this.tempNoise.fbm2D(x, z, { frequency: 0.0035, octaves: 2 });
    const m = this.moistNoise.fbm2D(x, z, { frequency: 0.0040, octaves: 2 });
    if (t > 0.33) return BIOME.DESERT;
    if (t < -0.33) return BIOME.SNOW;
    if (t < -0.1 && m > 0.1) return BIOME.TAIGA;
    if (m > 0.45 && Math.abs(t) < 0.2) return BIOME.SWAMP;
    if (t > 0.05 && m > 0.25) return BIOME.JUNGLE;
    if (m < -0.3 && t < 0.05 && t > -0.2) return BIOME.MUSHROOM;
    if (m > 0.1) {
      const detail = this.moistNoise.fbm2D(x + 1000, z + 1000, { frequency: 0.008, octaves: 1 });
      if (detail > 0.15) return BIOME.FLOWER_FOREST;
      const split = this.moistNoise.fbm2D(x - 1500, z + 2500, { frequency: 0.006, octaves: 1 });
      if (split > 0.12) return BIOME.BIRCH_FOREST;
      return BIOME.FOREST;
    }
    return BIOME.PLAINS;
  }

  biomeAt(x, z) {
    return this.genVersion >= 2 ? this.biomeAtV2(x, z) : this.biomeAtV1(x, z);
  }

  // ---- Rivers ---------------------------------------------------------------
  riverField(x, z) {
    const v = this.riverNoise.fbm2D(x, z, { frequency: 0.006, octaves: 3 });
    const width = 0.028 + this.riverNoise.fbm2D(x + 500, z + 500, { frequency: 0.012, octaves: 2 }) * 0.015;
    return Math.abs(v) < width;
  }

  riverAtV1(x, z) {
    if (this.biomeAtV1(x, z) === BIOME.DESERT) return false;
    return this.riverField(x, z);
  }

  // V2 rivers only carve where the smooth base terrain is river-compatible
  // (coast..low hills); mountains and oceans are left alone.
  riverAtV2(x, z) {
    const biome = this.biomeAtV2(x, z);
    if (biome === BIOME.DESERT || biome === BIOME.OCEAN || biome === BIOME.MOUNTAINS) return false;
    const base = this.baseHeightV2(x, z);
    if (base < SEA_LEVEL - 2 || base > SEA_LEVEL + 15) return false;
    return this.riverField(x, z);
  }

  riverAt(x, z) {
    return this.genVersion >= 2 ? this.riverAtV2(x, z) : this.riverAtV1(x, z);
  }

  // ---- Caves ----------------------------------------------------------------
  // GEN_V1 worm caves (sealed 6 blocks below the surface), exactly as before.
  caveAtV1(x, y, z, surfaceY) {
    if (y < 5 || y > surfaceY - 6) return false;
    const openBias = y < 12 ? -0.04 : 0;
    const broad = this.valueNoise3(x, y * 1.35, z, 0.075, 73);
    const detail = this.valueNoise3(x + 1000, y * 1.8, z - 1000, 0.135, 97);
    const cavern = this.valueNoise3(x - 700, y * 0.8, z + 700, 0.035, 149);
    return broad + detail * 0.42 + openBias > 0.92 || (cavern > 0.88 && detail > 0.62);
  }

  // V2 worm caves: same fields but allowed to break the surface (y up to
  // surfaceY+1) so cave mouths appear on hillsides.
  wormCaveV2(x, y, z, surfaceY) {
    if (y < 5 || y > surfaceY + 1) return false;
    const openBias = y < 12 ? -0.04 : 0;
    const broad = this.valueNoise3(x, y * 1.35, z, 0.075, 73);
    const detail = this.valueNoise3(x + 1000, y * 1.8, z - 1000, 0.135, 97);
    const cavern = this.valueNoise3(x - 700, y * 0.8, z + 700, 0.035, 149);
    return broad + detail * 0.42 + openBias > 0.92 || (cavern > 0.88 && detail > 0.62);
  }

  // Noodle caves: thin winding tunnels where two independent ridged 3D fields
  // are BOTH near their zero surface.
  noodleCaveV2(x, y, z, surfaceY) {
    if (y < 5 || y > surfaceY + 1) return false;
    const a = Math.abs(this.valueNoise3(x, y * 1.4, z, 0.02, 71) * 2 - 1);
    if (a >= 0.08) return false; // early out: second field rarely needed
    const b = Math.abs(this.valueNoise3(x - 4000, y * 1.4, z + 4000, 0.02, 79) * 2 - 1);
    return a + b < 0.08;
  }

  // Ravines: a rare 2D crack field; returns carve depth (15-25) or 0.
  ravineDepthV2(x, z) {
    const v = this.ridgeNoise.fbm2D(x + 9000, z - 9000, { frequency: 0.004, octaves: 2 });
    if (Math.abs(v) >= 0.015) return 0;
    return 15 + Math.floor(this.hash01_3(Math.floor(x / 8), 0, Math.floor(z / 8), 811) * 11);
  }

  // Combined V2 carve test for one cell. Never eats bedrock or anything below
  // y 5 (a lava-floor pass is future work; the guard keeps floors intact).
  carveV2(x, y, z, surfaceY, ravineDepth) {
    if (y < 5) return false;
    if (ravineDepth > 0 && y <= surfaceY + 1 && y > surfaceY - ravineDepth) return true;
    return this.wormCaveV2(x, y, z, surfaceY) || this.noodleCaveV2(x, y, z, surfaceY);
  }
}
