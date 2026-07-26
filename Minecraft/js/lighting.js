// =============================================================================
// lighting.js — Per-chunk voxel light fields, BFS-flooded.
//
// Two channels, each 0..15 per block:
//   sky:   column sunlight (15 where the sky is visible straight up), spread
//          sideways/downwards with -1 falloff so cave mouths glow inward.
//   block: emitted by light-source blocks (torch, glowstone, lava, ...),
//          spread in all directions with -1 falloff, stopped by opaque blocks.
//
// Each chunk's fields are computed from the 3x3 chunk neighbourhood, so two
// adjacent chunks independently agree on their shared border (light reaches at
// most 15 < CHUNK_SIZE blocks). The mesh builder bakes the values into vertex
// colors; day/night is applied in the shader, so time of day needs NO remesh.
//
// The nether has no sky: pass skyless=true (world.skyless) to skip sun seeding.
// =============================================================================

import { CHUNK_SIZE, CHUNK_HEIGHT, isTransparent, lightLevel } from './config.js';

const W = CHUNK_SIZE * 3;              // local working volume: 48 x 64 x 48
const H = CHUNK_HEIGHT;
const VOL = W * W * H;
const VOLUME = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE;

const localIndex = (x, y, z) => x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
const idx = (x, y, z) => x + W * (z + W * y);

// Scratch buffers reused across calls (single-threaded main loop / worker).
let blocks = new Uint8Array(VOL);
let sky = new Uint8Array(VOL);
let blk = new Uint8Array(VOL);
let queue = new Int32Array(VOL);

// Fill `blocks` from the 3x3 neighbourhood around (cx,cz). Missing chunks are
// generated data-only (cheap; meshes stay untouched).
function gatherBlocks(world, cx, cz) {
  for (let dcz = -1; dcz <= 1; dcz++) {
    for (let dcx = -1; dcx <= 1; dcx++) {
      const chunk = world.getOrCreateChunk(cx + dcx, cz + dcz);
      const ox = (dcx + 1) * CHUNK_SIZE;
      const oz = (dcz + 1) * CHUNK_SIZE;
      for (let y = 0; y < H; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
          const src = localIndex(0, y, z);
          const dst = idx(ox, y, oz + z);
          for (let x = 0; x < CHUNK_SIZE; x++) {
            blocks[dst + x] = chunk.data[src + x];
          }
        }
      }
    }
  }
}

// One BFS flood over `field` from the pre-seeded queue of length `qlen`.
// Light spreads to transparent neighbours at level-1.
function flood(field, qlen) {
  let head = 0;
  while (head < qlen) {
    const i = queue[head++];
    const level = field[i];
    if (level <= 1) continue;
    const y = (i / (W * W)) | 0;
    const rem = i - y * W * W;
    const z = (rem / W) | 0;
    const x = rem - z * W;
    const next = level - 1;

    // -X / +X
    if (x > 0) { const j = i - 1; if (field[j] < next && isTransparent(blocks[j])) { field[j] = next; queue[qlen++] = j; } }
    if (x < W - 1) { const j = i + 1; if (field[j] < next && isTransparent(blocks[j])) { field[j] = next; queue[qlen++] = j; } }
    // -Z / +Z
    if (z > 0) { const j = i - W; if (field[j] < next && isTransparent(blocks[j])) { field[j] = next; queue[qlen++] = j; } }
    if (z < W - 1) { const j = i + W; if (field[j] < next && isTransparent(blocks[j])) { field[j] = next; queue[qlen++] = j; } }
    // -Y / +Y
    if (y > 0) { const j = i - W * W; if (field[j] < next && isTransparent(blocks[j])) { field[j] = next; queue[qlen++] = j; } }
    if (y < H - 1) { const j = i + W * W; if (field[j] < next && isTransparent(blocks[j])) { field[j] = next; queue[qlen++] = j; } }
  }
}

// Compute and install `chunk.lightSky` / `chunk.lightBlock` for the chunk at
// (cx,cz). Pure w.r.t. block data in the 3x3 neighbourhood.
export function computeChunkLight(world, cx, cz) {
  const chunk = world.getOrCreateChunk(cx, cz);
  gatherBlocks(world, cx, cz);

  sky.fill(0);
  blk.fill(0);

  // --- Sky seeding: straight-down sunlight columns -------------------------
  let qlen = 0;
  if (!world.skyless) {
    for (let z = 0; z < W; z++) {
      for (let x = 0; x < W; x++) {
        for (let y = H - 1; y >= 0; y--) {
          const i = idx(x, y, z);
          if (!isTransparent(blocks[i])) break;   // first opaque block stops the sun
          sky[i] = 15;
          queue[qlen++] = i;
        }
      }
    }
    flood(sky, qlen);
  }

  // --- Block-light seeding: every emitter in the neighbourhood -------------
  qlen = 0;
  for (let i = 0; i < VOL; i++) {
    const ll = lightLevel(blocks[i]);
    if (ll > 0 && ll > blk[i]) {
      blk[i] = ll;
      queue[qlen++] = i;
    }
  }
  flood(blk, qlen);

  // --- Copy the central chunk out -------------------------------------------
  if (!chunk.lightSky) chunk.lightSky = new Uint8Array(VOLUME);
  if (!chunk.lightBlock) chunk.lightBlock = new Uint8Array(VOLUME);
  for (let y = 0; y < H; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const s = idx(x + CHUNK_SIZE, y, z + CHUNK_SIZE);
        const d = localIndex(x, y, z);
        chunk.lightSky[d] = sky[s];
        chunk.lightBlock[d] = blk[s];
      }
    }
  }
  chunk.lightDirty = false;
}

// Light lookup in WORLD coordinates. Reads only already-loaded chunks; outside
// the world (or unlit chunks) it assumes full sky / no block light so border
// faces of freshly streamed chunks never render black.
export function lightAtWorld(world, wx, wy, wz) {
  if (wy < 0) return { sky: 0, block: 0 };
  if (wy >= CHUNK_HEIGHT) return { sky: world.skyless ? 0 : 15, block: 0 };
  const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
  const entry = world.chunks.get(cx + ',' + cz);
  if (!entry || !entry.chunk.lightSky) return { sky: world.skyless ? 4 : 15, block: 0 };
  const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const i = localIndex(lx, wy, lz);
  return { sky: entry.chunk.lightSky[i], block: entry.chunk.lightBlock[i] };
}

// After a block edit at (x,y,z), mark every chunk whose light field can be
// affected (light radius 15) as dirty. Returns the set of "cx,cz" keys so the
// caller can recompute + remesh them.
export function chunksAffectedByEdit(x, z) {
  const keys = new Set();
  const R = 15;
  const minCx = Math.floor((x - R) / CHUNK_SIZE), maxCx = Math.floor((x + R) / CHUNK_SIZE);
  const minCz = Math.floor((z - R) / CHUNK_SIZE), maxCz = Math.floor((z + R) / CHUNK_SIZE);
  for (let cz = minCz; cz <= maxCz; cz++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      keys.add(cx + ',' + cz);
    }
  }
  return keys;
}
