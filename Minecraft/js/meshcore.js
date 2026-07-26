// =============================================================================
// meshcore.js — PURE light + mesh functions over a 3x3-chunk block snapshot.
// No three.js, no World: everything operates on typed arrays, so the exact
// same code runs on the main thread (sync fallback) and inside meshworker.js.
//
// Snapshot layout: a 48 x CHUNK_HEIGHT x 48 volume centred on the chunk being
// meshed (the same shape lighting.js always used), indexed
//   idx(x, y, z) = x + 48 * (z + 48 * y)
// with the centre chunk occupying x,z in [16, 32). blocks is Uint16Array,
// meta Uint8Array; light fields are Uint8Array 0..15.
//
// The geometry produced for the opaque pass is IDENTICAL to the pre-Phase-5
// chunk.js mesher (same iteration order, same greedy merging, same AO/light
// keys). The water pass now greedy-merges the TOP faces of source cells
// (meta 0) so a flat ocean surface is a handful of quads instead of one per
// cell; flowing water and side/bottom faces stay per-face.
// =============================================================================

import {
  CHUNK_SIZE, CHUNK_HEIGHT, BLOCK, TILES,
  isTransparent, isSolid, faceTile, tileUV, FACES, blockModel, isRail,
  fluidLevel, isFluidFalling, lightLevel,
} from './config.js';

export const SNAP_W = CHUNK_SIZE * 3;                    // 48
export const SNAP_VOL = SNAP_W * SNAP_W * CHUNK_HEIGHT;  // snapshot cells
export const CHUNK_VOL = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE;

const W = SNAP_W;
const H = CHUNK_HEIGHT;
const idx = (x, y, z) => x + W * (z + W * y);
const localIndex = (x, y, z) => x + CHUNK_SIZE * (z + CHUNK_SIZE * y);

// ---- Light computation (ported from lighting.js, snapshot-based) -------------
// Scratch queue reused across calls (each thread has its own module instance).
let lightQueue = new Int32Array(SNAP_VOL);

function flood(field, blocks, qlen) {
  const queue = lightQueue;
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
    if (x > 0) { const j = i - 1; if (field[j] < next && isTransparent(blocks[j])) { field[j] = next; queue[qlen++] = j; } }
    if (x < W - 1) { const j = i + 1; if (field[j] < next && isTransparent(blocks[j])) { field[j] = next; queue[qlen++] = j; } }
    if (z > 0) { const j = i - W; if (field[j] < next && isTransparent(blocks[j])) { field[j] = next; queue[qlen++] = j; } }
    if (z < W - 1) { const j = i + W; if (field[j] < next && isTransparent(blocks[j])) { field[j] = next; queue[qlen++] = j; } }
    if (y > 0) { const j = i - W * W; if (field[j] < next && isTransparent(blocks[j])) { field[j] = next; queue[qlen++] = j; } }
    if (y < H - 1) { const j = i + W * W; if (field[j] < next && isTransparent(blocks[j])) { field[j] = next; queue[qlen++] = j; } }
  }
}

// Compute sky + block light over the whole snapshot. Because light travels at
// most 15 blocks and the mesher only samples cells within 1 block of the
// centre chunk, these values agree exactly with per-chunk fields computed by
// lighting.js (nothing outside the 3x3 can reach the sampled cells).
export function computeLightField(blocks, skyless, sky = null, blk = null) {
  sky = sky || new Uint8Array(SNAP_VOL);
  blk = blk || new Uint8Array(SNAP_VOL);
  sky.fill(0);
  blk.fill(0);

  let qlen = 0;
  if (!skyless) {
    for (let z = 0; z < W; z++) {
      for (let x = 0; x < W; x++) {
        for (let y = H - 1; y >= 0; y--) {
          const i = idx(x, y, z);
          if (!isTransparent(blocks[i])) break;
          sky[i] = 15;
          lightQueue[qlen++] = i;
        }
      }
    }
    flood(sky, blocks, qlen);
  }

  qlen = 0;
  for (let i = 0; i < SNAP_VOL; i++) {
    const ll = lightLevel(blocks[i]);
    if (ll > 0 && ll > blk[i]) {
      blk[i] = ll;
      lightQueue[qlen++] = i;
    }
  }
  flood(blk, blocks, qlen);
  return { sky, blk };
}

// Copy the centre chunk's light out of snapshot fields (for chunk.lightSky /
// chunk.lightBlock, which mobs/drops/spawning read via lightAtWorld).
export function extractCenterLight(sky, blk) {
  const lightSky = new Uint8Array(CHUNK_VOL);
  const lightBlock = new Uint8Array(CHUNK_VOL);
  for (let y = 0; y < H; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const dst = localIndex(0, y, z);
      const src = idx(CHUNK_SIZE, y, z + CHUNK_SIZE);
      for (let x = 0; x < CHUNK_SIZE; x++) {
        lightSky[dst + x] = sky[src + x];
        lightBlock[dst + x] = blk[src + x];
      }
    }
  }
  return { lightSky, lightBlock };
}

// ---- AO tables (identical to chunk.js) ---------------------------------------
const AO_OFFSETS = FACES.map((face) => {
  const dir = face.dir;
  const tangents = [0, 1, 2].filter((a) => dir[a] === 0);
  const [a1, a2] = tangents;
  return face.corners.map((corner) => {
    const sgnA1 = corner[a1] * 2 - 1;
    const sgnA2 = corner[a2] * 2 - 1;
    const side1 = [...dir]; side1[a1] += sgnA1;
    const side2 = [...dir]; side2[a2] += sgnA2;
    const cornr = [...dir]; cornr[a1] += sgnA1; cornr[a2] += sgnA2;
    return [side1, side2, cornr];
  });
});

const AO_BRIGHT = [0.5, 0.7, 0.86, 1.0];

function aoLevel(s1, s2, cor) {
  if (s1 && s2) return 0;
  return 3 - (s1 + s2 + cor);
}

// ---- Mesh building -------------------------------------------------------------
// Builds the geometry arrays for the centre chunk of the snapshot. Coordinates
// are LOCAL to the chunk (the caller positions the mesh at the chunk origin).
// Returns plain typed arrays, transferable across a worker boundary:
//   { op: { positions, normals, uvs, tiles, colors, indices },
//     wa: { positions, normals, uvs, colors, indices } }
export function buildMeshArrays(blocks, meta, sky, blk, skyless) {
  const op = { positions: [], normals: [], uvs: [], colors: [], tiles: [], indices: [], vbase: 0 };
  const wa = { positions: [], normals: [], uvs: [], colors: [], indices: [], vbase: 0 };

  // Block lookup with LOCAL chunk coords dx,dz in [-16, 32) (never further).
  const blockAt = (dx, y, dz) => {
    if (y < 0 || y >= H) return BLOCK.AIR;
    return blocks[idx(dx + CHUNK_SIZE, y, dz + CHUNK_SIZE)];
  };
  // Centre-chunk-only lookup: AIR outside the chunk (mirrors getBlockLocal).
  const centerBlockAt = (x, y, z) => {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= H) return BLOCK.AIR;
    return blocks[idx(x + CHUNK_SIZE, y, z + CHUNK_SIZE)];
  };
  const metaAtLocal = (x, y, z) => meta[idx(x + CHUNK_SIZE, y, z + CHUNK_SIZE)];

  const lightAt = (dx, y, dz) => {
    if (y < 0) return { sky: 0, block: 0 };
    if (y >= H) return { sky: skyless ? 0 : 15, block: 0 };
    const i = idx(dx + CHUNK_SIZE, y, dz + CHUNK_SIZE);
    return { sky: sky[i], block: blk[i] };
  };
  const faceLightPacked = (dx, y, dz) => {
    const l = lightAt(dx, y, dz);
    return (l.sky << 4) | l.block;
  };

  const occludes = (dx, y, dz) => (isTransparent(blockAt(dx, y, dz)) ? 0 : 1);

  const sameMask = (a, b) => a && b && a.tile === b.tile && a.ao === b.ao && a.lp === b.lp;
  const dims = [CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE];

  const faceAO = (f, dx, y, dz) => {
    const offs = AO_OFFSETS[f];
    const ao = [0, 0, 0, 0];
    for (let c = 0; c < 4; c++) {
      const o = offs[c];
      const s1 = occludes(dx + o[0][0], y + o[0][1], dz + o[0][2]);
      const s2 = occludes(dx + o[1][0], y + o[1][1], dz + o[1][2]);
      const cr = occludes(dx + o[2][0], y + o[2][1], dz + o[2][2]);
      ao[c] = aoLevel(s1, s2, cr);
    }
    return ao;
  };
  const packAO = (ao) => ao[0] | (ao[1] << 2) | (ao[2] << 4) | (ao[3] << 6);

  const addGreedyFace = (face, base, w, h, tile, aoPacked, lp, uAxis, vAxis) => {
    const buf = op;
    const extent = [1, 1, 1];
    extent[uAxis] = w;
    extent[vAxis] = h;
    const ao = [aoPacked & 3, (aoPacked >> 2) & 3, (aoPacked >> 4) & 3, (aoPacked >> 6) & 3];
    const blkL = (lp & 15) / 15;
    const skyL = (lp >> 4) / 15;
    for (let c = 0; c < 4; c++) {
      const corner = face.corners[c];
      const vx = base[0] + corner[0] * extent[0];
      const vy = base[1] + corner[1] * extent[1];
      const vz = base[2] + corner[2] * extent[2];
      buf.positions.push(vx, vy, vz);
      buf.normals.push(face.dir[0], face.dir[1], face.dir[2]);
      const sel = face.uv[c];
      buf.uvs.push(sel[0] === 0 ? 0 : w, sel[1] === 0 ? 0 : h);
      buf.tiles.push(tile);
      buf.colors.push(blkL, skyL, AO_BRIGHT[ao[c]]);
    }
    const v = buf.vbase;
    if (ao[0] + ao[2] > ao[1] + ao[3]) {
      buf.indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
    } else {
      buf.indices.push(v + 1, v + 2, v + 3, v + 1, v + 3, v);
    }
    buf.vbase += 4;
  };

  // ---- Greedy opaque cube pass (order identical to the old chunk.js) --------
  for (let f = 0; f < FACES.length; f++) {
    const face = FACES[f];
    const nAxis = face.dir.findIndex((v) => v !== 0);
    const [uAxis, vAxis] = [0, 1, 2].filter((a) => a !== nAxis);
    const uLen = dims[uAxis];
    const vLen = dims[vAxis];
    const nLen = dims[nAxis];

    for (let n = 0; n < nLen; n++) {
      const mask = new Array(uLen * vLen).fill(null);
      for (let v = 0; v < vLen; v++) {
        for (let u = 0; u < uLen; u++) {
          const coord = [0, 0, 0];
          coord[nAxis] = n;
          coord[uAxis] = u;
          coord[vAxis] = v;
          const id = centerBlockAt(coord[0], coord[1], coord[2]);
          if (id === BLOCK.AIR || id === BLOCK.WATER) continue;
          if (blockModel(id) !== 'cube') continue;

          const ndx = coord[0] + face.dir[0];
          const ny = coord[1] + face.dir[1];
          const ndz = coord[2] + face.dir[2];
          const neighbour = blockAt(ndx, ny, ndz);
          if (!isTransparent(neighbour)) continue;

          const ao = faceAO(f, coord[0], coord[1], coord[2]);
          mask[u + v * uLen] = {
            tile: faceTile(id, face.tile),
            ao: packAO(ao),
            lp: faceLightPacked(ndx, ny, ndz),
          };
        }
      }

      for (let v = 0; v < vLen; v++) {
        for (let u = 0; u < uLen;) {
          const rec = mask[u + v * uLen];
          if (!rec) { u++; continue; }

          let w = 1;
          while (u + w < uLen && sameMask(rec, mask[u + w + v * uLen])) w++;

          let h = 1;
          outer:
          while (v + h < vLen) {
            for (let k = 0; k < w; k++) {
              if (!sameMask(rec, mask[u + k + (v + h) * uLen])) break outer;
            }
            h++;
          }

          const base = [0, 0, 0];
          base[nAxis] = n;
          base[uAxis] = u;
          base[vAxis] = v;
          addGreedyFace(face, base, w, h, rec.tile, rec.ao, rec.lp, uAxis, vAxis);

          for (let yy = 0; yy < h; yy++) {
            for (let xx = 0; xx < w; xx++) mask[u + xx + (v + yy) * uLen] = null;
          }
          u += w;
        }
      }
    }
  }

  // ---- Non-cube models (identical geometry to the old chunk.js) -------------
  const cellLightRG = (x, y, z) => {
    const l = lightAt(x, y, z);
    return [l.block / 15, l.sky / 15];
  };
  const pushBoxOp = (x0, y0, z0, x1, y1, z1, boxTile, rg, sideV = null) => {
    const boxFaces = [
      [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]],
      [[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1]],
      [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0]],
      [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0]],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]],
    ];
    for (let bi = 0; bi < boxFaces.length; bi++) {
      const bf = boxFaces[bi];
      const n = bf[4];
      const v0 = sideV && bi < 4 ? sideV[0] : 0;
      const v1 = sideV && bi < 4 ? sideV[1] : 1;
      for (let c = 0; c < 4; c++) {
        op.positions.push(bf[c][0], bf[c][1], bf[c][2]);
        op.normals.push(n[0], n[1], n[2]);
        op.uvs.push(c === 0 || c === 3 ? 0 : 1, c < 2 ? v0 : v1);
        op.tiles.push(boxTile);
        op.colors.push(rg[0], rg[1], 1);
      }
      op.indices.push(op.vbase, op.vbase + 1, op.vbase + 2, op.vbase, op.vbase + 2, op.vbase + 3);
      op.vbase += 4;
    }
  };
  const pushQuadOp = (verts, normal, quadTile, rg, doubleSided = true) => {
    for (let c = 0; c < 4; c++) {
      op.positions.push(verts[c][0], verts[c][1], verts[c][2]);
      op.normals.push(normal[0], normal[1], normal[2]);
      op.uvs.push(c === 0 || c === 3 ? 0 : 1, c < 2 ? 1 : 0);
      op.tiles.push(quadTile);
      op.colors.push(rg[0], rg[1], 1);
    }
    const vi = op.vbase;
    op.indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    if (doubleSided) op.indices.push(vi + 2, vi + 1, vi, vi + 3, vi + 2, vi);
    op.vbase += 4;
  };

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const id = centerBlockAt(x, y, z);
        if (id === BLOCK.AIR || id === BLOCK.WATER) continue;
        const model = blockModel(id);
        if (model === 'cube') continue;

        const tile = faceTile(id, 'side');

        if (model === 'cross') {
          const crossVerts = [
            [x, y, z], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z],
            [x + 1, y, z], [x, y, z + 1], [x, y + 1, z + 1], [x + 1, y + 1, z],
          ];
          const crossUVs = [[0, 0], [1, 0], [1, 1], [0, 1]];
          const rg = cellLightRG(x, y, z);
          for (let q = 0; q < 2; q++) {
            const base = q * 4;
            for (let c = 0; c < 4; c++) {
              const v = crossVerts[base + c];
              op.positions.push(v[0], v[1], v[2]);
              op.normals.push(q === 0 ? -0.707 : 0.707, 0, q === 0 ? 0.707 : 0.707);
              op.uvs.push(crossUVs[c][0], crossUVs[c][1]);
              op.tiles.push(tile);
              op.colors.push(rg[0], rg[1], 1);
            }
            const vi = op.vbase;
            op.indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
            op.indices.push(vi + 2, vi + 1, vi, vi + 3, vi + 2, vi);
            op.vbase += 4;
          }
        } else if (model === 'torch') {
          const inset = 0.4375;
          const w = 0.125;
          const rg = cellLightRG(x, y, z);
          const torchFaces = [
            [[inset, 0, inset], [inset + w, 0, inset], [inset + w, 0.625, inset], [inset, 0.625, inset], [0, 0, -1]],
            [[inset + w, 0, inset + w], [inset, 0, inset + w], [inset, 0.625, inset + w], [inset + w, 0.625, inset + w], [0, 0, 1]],
            [[inset, 0, inset + w], [inset, 0, inset], [inset, 0.625, inset], [inset, 0.625, inset + w], [-1, 0, 0]],
            [[inset + w, 0, inset], [inset + w, 0, inset + w], [inset + w, 0.625, inset + w], [inset + w, 0.625, inset], [1, 0, 0]],
          ];
          for (const tf of torchFaces) {
            const n = tf[4];
            for (let c = 0; c < 4; c++) {
              op.positions.push(x + tf[c][0], y + tf[c][1], z + tf[c][2]);
              op.normals.push(n[0], n[1], n[2]);
              const u = c === 0 || c === 3 ? 0 : 1;
              const v = c < 2 ? 0 : 1;
              op.uvs.push(u, v);
              op.tiles.push(tile);
              op.colors.push(rg[0], rg[1], 1);
            }
            const vi = op.vbase;
            op.indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
            op.vbase += 4;
          }
          for (let c = 0; c < 4; c++) {
            const cx2 = c === 0 || c === 3 ? inset : inset + w;
            const cz2 = c < 2 ? inset : inset + w;
            op.positions.push(x + cx2, y + 0.625, z + cz2);
            op.normals.push(0, 1, 0);
            op.uvs.push(c === 0 || c === 3 ? 0 : 1, c < 2 ? 0 : 1);
            op.tiles.push(tile);
            op.colors.push(rg[0], rg[1], 1);
          }
          const vi = op.vbase;
          op.indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
          op.vbase += 4;
        } else if (model === 'door' || model === 'doorOpen') {
          const thick = 0.1875;
          const closedFaces = [
            [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, -1]],
            [[1, 0, thick], [0, 0, thick], [0, 1, thick], [1, 1, thick], [0, 0, 1]],
            [[0, 0, thick], [0, 0, 0], [0, 1, 0], [0, 1, thick], [-1, 0, 0]],
            [[1, 0, 0], [1, 0, thick], [1, 1, thick], [1, 1, 0], [1, 0, 0]],
            [[0, 1, 0], [1, 1, 0], [1, 1, thick], [0, 1, thick], [0, 1, 0]],
          ];
          const openFaces = [
            [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1], [-1, 0, 0]],
            [[thick, 0, 0], [thick, 0, 1], [thick, 1, 1], [thick, 1, 0], [1, 0, 0]],
            [[0, 0, 0], [thick, 0, 0], [thick, 1, 0], [0, 1, 0], [0, 0, -1]],
            [[thick, 0, 1], [0, 0, 1], [0, 1, 1], [thick, 1, 1], [0, 0, 1]],
            [[0, 1, 0], [thick, 1, 0], [thick, 1, 1], [0, 1, 1], [0, 1, 0]],
          ];
          const doorFaces = model === 'door' ? closedFaces : openFaces;
          const rg = cellLightRG(x, y, z);
          for (const df of doorFaces) {
            const n = df[4];
            for (let c = 0; c < 4; c++) {
              op.positions.push(x + df[c][0], y + df[c][1], z + df[c][2]);
              op.normals.push(n[0], n[1], n[2]);
              const u = c === 0 || c === 3 ? 0 : 1;
              const v = c < 2 ? 0 : 1;
              op.uvs.push(u, v);
              op.tiles.push(tile);
              op.colors.push(rg[0], rg[1], 1);
            }
            const vi2 = op.vbase;
            op.indices.push(vi2, vi2 + 1, vi2 + 2, vi2, vi2 + 2, vi2 + 3);
            op.vbase += 4;
          }
        } else if (model === 'fence') {
          const rg = cellLightRG(x, y, z);
          const p0 = 0.375, p1 = 0.625;
          pushBoxOp(x + p0, y, z + p0, x + p1, y + 1, z + p1, tile, rg);
          const linksTo = (dx, dz) => {
            const nb = blockAt(x + dx, y, z + dz);
            return nb === id || (isSolid(nb) && blockModel(nb) === 'cube');
          };
          const railY = [[0.375, 0.5625], [0.6875, 0.875]];
          for (const [ry0, ry1] of railY) {
            if (linksTo(1, 0)) pushBoxOp(x + p1, y + ry0, z + 0.4375, x + 1, y + ry1, z + 0.5625, tile, rg);
            if (linksTo(-1, 0)) pushBoxOp(x, y + ry0, z + 0.4375, x + p0, y + ry1, z + 0.5625, tile, rg);
            if (linksTo(0, 1)) pushBoxOp(x + 0.4375, y + ry0, z + p1, x + 0.5625, y + ry1, z + 1, tile, rg);
            if (linksTo(0, -1)) pushBoxOp(x + 0.4375, y + ry0, z, x + 0.5625, y + ry1, z + p0, tile, rg);
          }
        } else if (model === 'pane') {
          const rg = cellLightRG(x, y, z);
          const t0 = 0.4375, t1 = 0.5625;
          const linksTo = (dx, dz) => {
            const nb = blockAt(x + dx, y, z + dz);
            return nb === id || (isSolid(nb) && blockModel(nb) === 'cube');
          };
          const l = linksTo(-1, 0), r = linksTo(1, 0), b = linksTo(0, -1), f = linksTo(0, 1);
          const anyLink = l || r || b || f;
          if (!anyLink) {
            pushBoxOp(x + t0, y, z + t0, x + t1, y + 1, z + t1, tile, rg);
          } else {
            if (b || f) {
              pushBoxOp(x + t0, y, z + (b ? 0 : t0), x + t1, y + 1, z + (f ? 1 : t1), tile, rg);
            }
            if (l || r) {
              pushBoxOp(x + (l ? 0 : t0), y, z + t0, x + (r ? 1 : t1), y + 1, z + t1, tile, rg);
            }
          }
        } else if (model === 'rail') {
          const rg = cellLightRG(x, y, z);
          const railAt = (dx, dy, dz) => isRail(blockAt(x + dx, y + dy, z + dz));
          const n = railAt(0, 0, -1) || railAt(0, 1, -1) || railAt(0, -1, -1);
          const s = railAt(0, 0, 1) || railAt(0, 1, 1) || railAt(0, -1, 1);
          const e = railAt(1, 0, 0) || railAt(1, 1, 0) || railAt(1, -1, 0);
          const w2 = railAt(-1, 0, 0) || railAt(-1, 1, 0) || railAt(-1, -1, 0);
          const yb = y + 0.0625;
          const upN = railAt(0, 1, -1), upS = railAt(0, 1, 1), upE = railAt(1, 1, 0), upW = railAt(-1, 1, 0);
          const isCurve = id === BLOCK.RAIL && ((n && e) || (n && w2) || (s && e) || (s && w2)) && !(n && s) && !(e && w2);

          if (upN || upS || upE || upW) {
            let verts;
            if (upN) verts = [[x, yb + 1, z], [x + 1, yb + 1, z], [x + 1, yb, z + 1], [x, yb, z + 1]];
            else if (upS) verts = [[x, yb, z], [x + 1, yb, z], [x + 1, yb + 1, z + 1], [x, yb + 1, z + 1]];
            else if (upE) verts = [[x, yb, z], [x + 1, yb + 1, z], [x + 1, yb + 1, z + 1], [x, yb, z + 1]];
            else verts = [[x + 1, yb, z + 1], [x, yb + 1, z + 1], [x, yb + 1, z], [x + 1, yb, z]];
            pushQuadOp(verts, [0, 1, 0], faceTile(id, 'top'), rg);
          } else if (isCurve) {
            let verts;
            if (s && e) verts = [[x, yb, z], [x + 1, yb, z], [x + 1, yb, z + 1], [x, yb, z + 1]];
            else if (s && w2) verts = [[x + 1, yb, z], [x + 1, yb, z + 1], [x, yb, z + 1], [x, yb, z]];
            else if (n && w2) verts = [[x + 1, yb, z + 1], [x, yb, z + 1], [x, yb, z], [x + 1, yb, z]];
            else verts = [[x, yb, z + 1], [x, yb, z], [x + 1, yb, z], [x + 1, yb, z + 1]];
            pushQuadOp(verts, [0, 1, 0], TILES.RAIL_CURVE, rg);
          } else {
            const ew = (e || w2) && !(n || s);
            const verts = ew
              ? [[x, yb, z], [x, yb, z + 1], [x + 1, yb, z + 1], [x + 1, yb, z]]
              : [[x, yb, z], [x + 1, yb, z], [x + 1, yb, z + 1], [x, yb, z + 1]];
            pushQuadOp(verts, [0, 1, 0], faceTile(id, 'top'), rg);
          }
        } else if (model === 'slab') {
          const rg = cellLightRG(x, y, z);
          const m = metaAtLocal(x, y, z);
          const top = (m & 1) === 1;
          pushBoxOp(
            x, top ? y + 0.5 : y, z, x + 1, top ? y + 1 : y + 0.5, z + 1,
            tile, rg, top ? [0, 0.5] : [0.5, 1],
          );
        } else if (model === 'stairs') {
          const rg = cellLightRG(x, y, z);
          const m = metaAtLocal(x, y, z);
          const facing = m & 3;
          const flip = (m & 4) !== 0;
          pushBoxOp(
            x, flip ? y + 0.5 : y, z, x + 1, flip ? y + 1 : y + 0.5, z + 1,
            tile, rg, flip ? [0, 0.5] : [0.5, 1],
          );
          let bx0 = x, bx1 = x + 1, bz0 = z, bz1 = z + 1;
          if (facing === 0) bx0 = x + 0.5;
          else if (facing === 1) bz0 = z + 0.5;
          else if (facing === 2) bx1 = x + 0.5;
          else bz1 = z + 0.5;
          pushBoxOp(
            bx0, flip ? y : y + 0.5, bz0, bx1, flip ? y + 0.5 : y + 1, bz1,
            tile, rg, flip ? [0.5, 1] : [0, 0.5],
          );
        } else if (model === 'plate') {
          const rg = cellLightRG(x, y, z);
          pushBoxOp(x + 0.0625, y, z + 0.0625, x + 0.9375, y + 0.0625, z + 0.9375, tile, rg);
        } else if (model === 'button') {
          const rg = cellLightRG(x, y, z);
          pushBoxOp(x + 0.3125, y, z + 0.375, x + 0.6875, y + 0.125, z + 0.625, tile, rg);
        } else if (model === 'portal') {
          const rg = cellLightRG(x, y, z);
          const alongX =
            centerBlockAt(x - 1, y, z) === BLOCK.NETHER_PORTAL ||
            centerBlockAt(x + 1, y, z) === BLOCK.NETHER_PORTAL ||
            blockAt(x - 1, y, z) === BLOCK.OBSIDIAN ||
            blockAt(x + 1, y, z) === BLOCK.OBSIDIAN;
          if (alongX) {
            pushBoxOp(x, y, z + 0.375, x + 1, y + 1, z + 0.625, tile, rg);
          } else {
            pushBoxOp(x + 0.375, y, z, x + 0.625, y + 1, z + 1, tile, rg);
          }
        }
      }
    }
  }

  // ---- Water pass ------------------------------------------------------------
  // Top faces of SOURCE cells (meta 0: level 0, not falling) merge greedily per
  // y-layer — a flat ocean becomes a few large quads. The single atlas tile
  // stretches across a merged quad (water is near-uniform, documented). All
  // other water faces stay per-face.
  const waterAO = (f, x, y, z) => {
    const offs = AO_OFFSETS[f];
    const ao = [0, 0, 0, 0];
    for (let c = 0; c < 4; c++) {
      const o = offs[c];
      const s1 = occludes(x + o[0][0], y + o[0][1], z + o[0][2]);
      const s2 = occludes(x + o[1][0], y + o[1][1], z + o[1][2]);
      const cr = occludes(x + o[2][0], y + o[2][1], z + o[2][2]);
      ao[c] = aoLevel(s1, s2, cr);
    }
    return ao;
  };
  const pushWaterFace = (f, x, y, z, topH, t, blkL, skyL, ao) => {
    const face = FACES[f];
    for (let c = 0; c < 4; c++) {
      const corner = face.corners[c];
      wa.positions.push(x + corner[0], y + corner[1] * topH, z + corner[2]);
      wa.normals.push(face.dir[0], face.dir[1], face.dir[2]);
      const sel = face.uv[c];
      wa.uvs.push(sel[0] === 0 ? t.u0 : t.u1, sel[1] === 0 ? t.v0 : t.v1);
      wa.colors.push(blkL, skyL, AO_BRIGHT[ao[c]]);
    }
    const v = wa.vbase;
    if (ao[0] + ao[2] > ao[1] + ao[3]) {
      wa.indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
    } else {
      wa.indices.push(v + 1, v + 2, v + 3, v + 1, v + 3, v);
    }
    wa.vbase += 4;
  };

  const TOP_F = 2; // FACES[2] is +Y
  const waterTile = tileUV(faceTile(BLOCK.WATER, 'top'));
  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    // Greedy top-face mask for this layer (source cells with air above only).
    const mask = new Array(CHUNK_SIZE * CHUNK_SIZE).fill(null);
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        if (centerBlockAt(x, y, z) !== BLOCK.WATER) continue;
        if (metaAtLocal(x, y, z) !== 0) continue;      // sources only merge
        if (blockAt(x, y + 1, z) !== BLOCK.AIR) continue;
        const ao = waterAO(TOP_F, x, y, z);
        const l = lightAt(x, y + 1, z);
        mask[x + z * CHUNK_SIZE] = {
          ao: packAO(ao), lp: (l.sky << 4) | l.block,
        };
      }
    }
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE;) {
        const rec = mask[x + z * CHUNK_SIZE];
        if (!rec) { x++; continue; }
        let w = 1;
        while (x + w < CHUNK_SIZE && sameWater(rec, mask[x + w + z * CHUNK_SIZE])) w++;
        let h = 1;
        outer:
        while (z + h < CHUNK_SIZE) {
          for (let k = 0; k < w; k++) {
            if (!sameWater(rec, mask[x + k + (z + h) * CHUNK_SIZE])) break outer;
          }
          h++;
        }
        // Emit one merged top quad (+Y face corners with extent w x h).
        const ao = [rec.ao & 3, (rec.ao >> 2) & 3, (rec.ao >> 4) & 3, (rec.ao >> 6) & 3];
        const blkL = (rec.lp & 15) / 15;
        const skyL = (rec.lp >> 4) / 15;
        const face = FACES[TOP_F];
        for (let c = 0; c < 4; c++) {
          const corner = face.corners[c];
          wa.positions.push(x + corner[0] * w, y + 1, z + corner[2] * h);
          wa.normals.push(0, 1, 0);
          const sel = face.uv[c];
          wa.uvs.push(sel[0] === 0 ? waterTile.u0 : waterTile.u1, sel[1] === 0 ? waterTile.v0 : waterTile.v1);
          wa.colors.push(blkL, skyL, AO_BRIGHT[ao[c]]);
        }
        const v = wa.vbase;
        if (ao[0] + ao[2] > ao[1] + ao[3]) {
          wa.indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
        } else {
          wa.indices.push(v + 1, v + 2, v + 3, v + 1, v + 3, v);
        }
        wa.vbase += 4;
        for (let zz = 0; zz < h; zz++) {
          for (let xx = 0; xx < w; xx++) mask[x + xx + (z + zz) * CHUNK_SIZE] = null;
        }
        x += w;
      }
    }

    // Per-face pass for everything else.
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const id = centerBlockAt(x, y, z);
        if (id !== BLOCK.WATER) continue;

        const m = metaAtLocal(x, y, z);
        const lvl = fluidLevel(m);
        const topH = (lvl === 0 || isFluidFalling(m)) ? 1 : Math.max(0.14, 1 - lvl * 0.11);
        const mergedTop = m === 0; // top face already emitted by the greedy pass

        for (let f = 0; f < FACES.length; f++) {
          if (f === TOP_F && mergedTop) continue;
          const face = FACES[f];
          const ndx = x + face.dir[0];
          const ny = y + face.dir[1];
          const ndz = z + face.dir[2];
          const neighbour = blockAt(ndx, ny, ndz);
          if (neighbour !== BLOCK.AIR) continue;

          const t = tileUV(faceTile(id, face.tile));
          const wl = lightAt(ndx, ny, ndz);
          pushWaterFace(f, x, y, z, topH, t, wl.block / 15, wl.sky / 15, waterAO(f, x, y, z));
        }
      }
    }
  }

  return {
    op: {
      positions: new Float32Array(op.positions),
      normals: new Float32Array(op.normals),
      uvs: new Float32Array(op.uvs),
      colors: new Float32Array(op.colors),
      tiles: new Float32Array(op.tiles),
      indices: new Uint32Array(op.indices),
    },
    wa: {
      positions: new Float32Array(wa.positions),
      normals: new Float32Array(wa.normals),
      uvs: new Float32Array(wa.uvs),
      colors: new Float32Array(wa.colors),
      indices: new Uint32Array(wa.indices),
    },
  };
}

function sameWater(a, b) {
  return a && b && a.ao === b.ao && a.lp === b.lp;
}

// Every transferable ArrayBuffer inside a buildMeshArrays result (for
// postMessage transfer lists).
export function meshTransferables(arrays) {
  const out = [];
  for (const part of [arrays.op, arrays.wa]) {
    for (const key of Object.keys(part)) out.push(part[key].buffer);
  }
  return out;
}
