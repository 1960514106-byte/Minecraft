// =============================================================================
// chunk.js — A CHUNK_SIZE x CHUNK_HEIGHT x CHUNK_SIZE column of blocks plus the
// face-culled mesh builder. Geometry is built in LOCAL coordinates and returned
// as a Group (opaque mesh + translucent water mesh) positioned at the chunk's
// world origin by buildMesh().
//
// Lighting: every vertex carries THREE channels in its vertex color —
//   r = block light (torches/glowstone/lava, BFS-flooded by lighting.js)
//   g = sky light   (sunlight columns + flood)
//   b = ambient-occlusion brightness
// The shader combines them: skylight is scaled by the scene lights (which the
// day/night cycle already drives), block light is added as emissive so torches
// glow at night, AO darkens inner corners. Day/night therefore needs NO remesh.
//
// All opaque terrain shares ONE atlas material and draws as ONE mesh per chunk:
// each vertex carries a `tile` index that a small shader override uses to wrap
// the tiled UVs into that tile's atlas sub-rectangle (see getOpaqueMaterial).
// The greedy mesher only merges faces whose tile, AO pattern AND light match.
// =============================================================================

import * as THREE from 'three';
import {
  CHUNK_SIZE, CHUNK_HEIGHT, ATLAS_COLS, ATLAS_ROWS, BLOCK, TILES,
  isTransparent, isSolid, faceTile, tileUV, FACES, blockModel, isRail,
  fluidLevel, isFluidFalling,
} from './config.js';
import { lightAtWorld } from './lighting.js';

const VOLUME = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE;

// Flat-array index for local coords. Matches the contract in config.js.
function localIndex(x, y, z) {
  return x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
}

// ---- Ambient-occlusion lookup tables ---------------------------------------
// For every face and every one of its 4 corners, precompute the integer offsets
// (relative to the block cell) of the three neighbour cells that can occlude
// that vertex: the two edge neighbours in the face plane plus the diagonal
// corner — all stepped one block out along the face normal (the air side).
const AO_OFFSETS = FACES.map((face) => {
  const dir = face.dir;
  const tangents = [0, 1, 2].filter((a) => dir[a] === 0);
  const [a1, a2] = tangents;
  return face.corners.map((corner) => {
    const sgnA1 = corner[a1] * 2 - 1; // 0 -> -1, 1 -> +1
    const sgnA2 = corner[a2] * 2 - 1;
    const side1 = [...dir]; side1[a1] += sgnA1;
    const side2 = [...dir]; side2[a2] += sgnA2;
    const cornr = [...dir]; cornr[a1] += sgnA1; cornr[a2] += sgnA2;
    return [side1, side2, cornr];
  });
});

// Brightness for each AO level 0..3 (0 = most occluded corner, 3 = open).
const AO_BRIGHT = [0.5, 0.7, 0.86, 1.0];

// Classic vertex-AO level: fully dark when both edges are blocked, otherwise
// one step darker per occluding neighbour.
function aoLevel(s1, s2, cor) {
  if (s1 && s2) return 0;
  return 3 - (s1 + s2 + cor);
}

// Two materials shared by every chunk (all sample the same atlas).
let opaqueMaterial = null;
let waterMaterial = null;

// Shared time uniform driving the water's surface wave.
const WATER_UNIFORMS = { uTime: { value: 0 } };
export function setWaterTime(t) { WATER_UNIFORMS.uTime.value = t; }

// GLSL snippet shared by both materials: turns the (block, sky, ao) vertex
// color into a brightness factor. Skylit faces inherit the scene lighting
// (day/night drives hemi+sun intensity), caves fall to a small ambient floor.
const VOXEL_COLOR_FRAGMENT = `
  float voxBlk = vColor.r;
  float voxSky = vColor.g;
  float voxAo  = vColor.b;
  diffuseColor.rgb *= voxAo * max(voxSky, 0.06);
`;

function getOpaqueMaterial(atlas) {
  if (opaqueMaterial) return opaqueMaterial;
  // alphaTest turns this into a cutout pass: unpainted (alpha 0) atlas pixels
  // on cross/torch/rail models are discarded instead of rendering black.
  opaqueMaterial = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 });
  opaqueMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uAtlasCols = { value: ATLAS_COLS };
    shader.uniforms.uAtlasRows = { value: ATLAS_ROWS };
    shader.vertexShader =
      'attribute float tile;\nvarying float vTile;\n' +
      shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vTile = tile;');
    shader.fragmentShader =
      'uniform float uAtlasCols;\nuniform float uAtlasRows;\nvarying float vTile;\n' +
      shader.fragmentShader
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
             // Round the interpolated tile index: precision wobble in the
             // varying (e.g. 184.0 arriving as 183.9999) would otherwise flip
             // mod/floor into the NEIGHBOURING tile on some fragments.
             float tIdx = floor(vTile + 0.5);
             float tcol = mod(tIdx, uAtlasCols);
             float trow = floor(tIdx / uAtlasCols);
             // fract() tiles the texture across a multi-block greedy quad; the
             // tiny inset keeps NearestFilter from bleeding into neighbour tiles.
             vec2 cell = fract(vMapUv);
             cell = clamp(cell, 0.0008, 0.9992);
             vec2 atlasUv = (vec2(tcol, trow) + cell) / vec2(uAtlasCols, uAtlasRows);
             vec4 sampledDiffuseColor = texture2D(map, atlasUv);
             diffuseColor *= sampledDiffuseColor;
           #endif`,
        )
        .replace('#include <color_fragment>', VOXEL_COLOR_FRAGMENT)
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           #ifdef USE_MAP
             // Block light glows on its own, independent of the sun: torches
             // stay bright at night and inside caves.
             totalEmissiveRadiance += sampledDiffuseColor.rgb * voxAo * (voxBlk * voxBlk) * 0.95;
           #endif`,
        );
  };
  opaqueMaterial.customProgramCacheKey = () => 'voxel-opaque-atlas-lit';
  return opaqueMaterial;
}

function getWaterMaterial(atlas) {
  if (!waterMaterial) {
    waterMaterial = new THREE.MeshLambertMaterial({
      map: atlas, vertexColors: true, transparent: true, opacity: 0.72,
      depthWrite: false, side: THREE.DoubleSide,
    });
    waterMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = WATER_UNIFORMS.uTime;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec3 wpos = (modelMatrix * vec4(transformed, 1.0)).xyz;
         float wave = sin(wpos.x * 0.6 + uTime * 1.6) * 0.05
                    + sin(wpos.z * 0.5 - uTime * 1.2) * 0.05;
         transformed.y += wave - 0.06;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `float wBlk = vColor.r;
         float wSky = vColor.g;
         float wAo  = vColor.b;
         diffuseColor.rgb *= wAo * max(max(wSky, wBlk * 0.9), 0.06);`,
      );
    };
    waterMaterial.customProgramCacheKey = () => 'voxel-water-lit';
  }
  return waterMaterial;
}

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.data = new Uint16Array(VOLUME); // all AIR (0) initially
    // Per-block metadata parallel to `data` (geometry state: stair facing,
    // slab half, log axis, fluid level...). 0 for plain blocks.
    this.meta = new Uint8Array(VOLUME);
    this.mesh = null;
    // Light fields installed by lighting.js computeChunkLight().
    this.lightSky = null;
    this.lightBlock = null;
    this.lightDirty = true;
  }

  getBlockLocal(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) {
      return BLOCK.AIR;
    }
    return this.data[localIndex(x, y, z)];
  }

  setBlockLocal(x, y, z, id) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) {
      return;
    }
    this.data[localIndex(x, y, z)] = id;
  }

  getMetaLocal(x, y, z) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) {
      return 0;
    }
    return this.meta[localIndex(x, y, z)];
  }

  setMetaLocal(x, y, z, v) {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT) {
      return;
    }
    this.meta[localIndex(x, y, z)] = v;
  }

  // Build (and return) the chunk's mesh as a Group with up to two children:
  // one opaque mesh and one translucent water mesh. `world` is used to query
  // neighbouring blocks across chunk borders so shared faces are culled too.
  // Expects this.lightSky/lightBlock to be up to date (world handles that).
  buildMesh(world, atlasTexture) {
    const op = { positions: [], normals: [], uvs: [], colors: [], tiles: [], indices: [], vbase: 0 };
    const wa = { positions: [], normals: [], uvs: [], colors: [], indices: [], vbase: 0 };

    const ox = this.cx * CHUNK_SIZE;
    const oz = this.cz * CHUNK_SIZE;

    // Light lookup in world coords with a fast path for cells in this chunk.
    const lightAt = (wx, wy, wz) => {
      if (wy < 0) return { sky: 0, block: 0 };
      if (wy >= CHUNK_HEIGHT) return { sky: world.skyless ? 0 : 15, block: 0 };
      const lx = wx - ox, lz = wz - oz;
      if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE && this.lightSky) {
        const i = localIndex(lx, wy, lz);
        return { sky: this.lightSky[i], block: this.lightBlock[i] };
      }
      return lightAtWorld(world, wx, wy, wz);
    };
    // Packed (sky<<4 | block) light of the AIR cell a face looks into.
    const faceLightPacked = (wx, wy, wz) => {
      const l = lightAt(wx, wy, wz);
      return (l.sky << 4) | l.block;
    };

    // Does a block one cell away occlude an AO sample?
    const occludes = (wx, wy, wz) => (isTransparent(world.getBlock(wx, wy, wz)) ? 0 : 1);

    const sameMask = (a, b) => a && b && a.tile === b.tile && a.ao === b.ao && a.lp === b.lp;
    const dims = [CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE];

    // Per-corner AO for a single block face (levels 0..3 per corner).
    const faceAO = (f, ox2, y2, oz2) => {
      const offs = AO_OFFSETS[f];
      const ao = [0, 0, 0, 0];
      for (let c = 0; c < 4; c++) {
        const o = offs[c];
        const s1 = occludes(ox2 + o[0][0], y2 + o[0][1], oz2 + o[0][2]);
        const s2 = occludes(ox2 + o[1][0], y2 + o[1][1], oz2 + o[1][2]);
        const cr = occludes(ox2 + o[2][0], y2 + o[2][1], oz2 + o[2][2]);
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
      // Flip the triangle split so the shared diagonal joins the two brighter
      // corners — avoids the asymmetric-shading artifact across AO gradients.
      if (ao[0] + ao[2] > ao[1] + ao[3]) {
        buf.indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
      } else {
        buf.indices.push(v + 1, v + 2, v + 3, v + 1, v + 3, v);
      }
      buf.vbase += 4;
    };

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
            const id = this.data[localIndex(coord[0], coord[1], coord[2])];
            if (id === BLOCK.AIR || id === BLOCK.WATER) continue;
            if (blockModel(id) !== 'cube') continue;

            const nwx = ox + coord[0] + face.dir[0];
            const nwy = coord[1] + face.dir[1];
            const nwz = oz + coord[2] + face.dir[2];
            const neighbour = world.getBlock(nwx, nwy, nwz);
            if (!isTransparent(neighbour)) continue;

            const ao = faceAO(f, ox + coord[0], coord[1], oz + coord[2]);
            mask[u + v * uLen] = {
              tile: faceTile(id, face.tile),
              ao: packAO(ao),
              lp: faceLightPacked(nwx, nwy, nwz),
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

    // ---- Non-cube block geometry (cross, torch, door, fence, pane, rail,
    // plate, button, portal). Lit by the light of the cell they sit in.
    const cellLightRG = (x, y, z) => {
      const l = lightAt(ox + x, y, oz + z);
      return [l.block / 15, l.sky / 15];
    };
    // Push an axis-aligned box (all 6 faces) into the opaque buffer. `sideV`
    // optionally narrows the vertical texture range of the four SIDE faces
    // ([v0, v1] in 0..1) so half-height boxes (slabs, stair steps) sample half
    // the tile instead of stretching it; top/bottom faces keep the full tile.
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
    // Push a free quad (two triangles, optionally double-sided).
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
          const id = this.data[localIndex(x, y, z)];
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
            const inset = 0.4375; // 7/16
            const w = 0.125;      // 2/16
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
            // Top cap
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
            const p0 = 0.375, p1 = 0.625; // 6/16..10/16 post
            pushBoxOp(x + p0, y, z + p0, x + p1, y + 1, z + p1, tile, rg);
            const linksTo = (dx, dz) => {
              const nb = world.getBlock(ox + x + dx, y, oz + z + dz);
              return nb === id || (isSolid(nb) && blockModel(nb) === 'cube');
            };
            const railY = [[0.375, 0.5625], [0.6875, 0.875]]; // two rails
            for (const [ry0, ry1] of railY) {
              if (linksTo(1, 0)) pushBoxOp(x + p1, y + ry0, z + 0.4375, x + 1, y + ry1, z + 0.5625, tile, rg);
              if (linksTo(-1, 0)) pushBoxOp(x, y + ry0, z + 0.4375, x + p0, y + ry1, z + 0.5625, tile, rg);
              if (linksTo(0, 1)) pushBoxOp(x + 0.4375, y + ry0, z + p1, x + 0.5625, y + ry1, z + 1, tile, rg);
              if (linksTo(0, -1)) pushBoxOp(x + 0.4375, y + ry0, z, x + 0.5625, y + ry1, z + p0, tile, rg);
            }
          } else if (model === 'pane') {
            const rg = cellLightRG(x, y, z);
            const t0 = 0.4375, t1 = 0.5625; // 7/16..9/16 (2px thick)
            const linksTo = (dx, dz) => {
              const nb = world.getBlock(ox + x + dx, y, oz + z + dz);
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
            // Flat plate 1/16 above the floor. Shape from neighbouring rails:
            // straight (NS/EW), curve (two perpendicular neighbours, plain rail
            // only) or slope (neighbouring rail one block up).
            const rg = cellLightRG(x, y, z);
            const railAt = (dx, dy, dz) => isRail(world.getBlock(ox + x + dx, y + dy, oz + z + dz));
            const n = railAt(0, 0, -1) || railAt(0, 1, -1) || railAt(0, -1, -1);
            const s = railAt(0, 0, 1) || railAt(0, 1, 1) || railAt(0, -1, 1);
            const e = railAt(1, 0, 0) || railAt(1, 1, 0) || railAt(1, -1, 0);
            const w2 = railAt(-1, 0, 0) || railAt(-1, 1, 0) || railAt(-1, -1, 0);
            const yb = y + 0.0625;
            // Slope: raise the far edge toward an uphill neighbour.
            const upN = railAt(0, 1, -1), upS = railAt(0, 1, 1), upE = railAt(1, 1, 0), upW = railAt(-1, 1, 0);
            const isCurve = id === BLOCK.RAIL && ((n && e) || (n && w2) || (s && e) || (s && w2)) && !(n && s) && !(e && w2);

            if (upN || upS || upE || upW) {
              // Sloped quad rising one block toward the uphill side.
              let verts;
              if (upN) verts = [[x, yb + 1, z], [x + 1, yb + 1, z], [x + 1, yb, z + 1], [x, yb, z + 1]];
              else if (upS) verts = [[x, yb, z], [x + 1, yb, z], [x + 1, yb + 1, z + 1], [x, yb + 1, z + 1]];
              else if (upE) verts = [[x, yb, z], [x + 1, yb + 1, z], [x + 1, yb + 1, z + 1], [x, yb, z + 1]];
              else verts = [[x + 1, yb, z + 1], [x, yb + 1, z + 1], [x, yb + 1, z], [x + 1, yb, z]];
              pushQuadOp(verts, [0, 1, 0], faceTile(id, 'top'), rg);
            } else if (isCurve) {
              // Curve tile, rotated so the arc joins the two neighbours.
              // Base arc joins south (bottom) to east (right).
              let verts;
              if (s && e) verts = [[x, yb, z], [x + 1, yb, z], [x + 1, yb, z + 1], [x, yb, z + 1]];
              else if (s && w2) verts = [[x + 1, yb, z], [x + 1, yb, z + 1], [x, yb, z + 1], [x, yb, z]];
              else if (n && w2) verts = [[x + 1, yb, z + 1], [x, yb, z + 1], [x, yb, z], [x + 1, yb, z]];
              else verts = [[x, yb, z + 1], [x, yb, z], [x + 1, yb, z], [x + 1, yb, z + 1]];
              pushQuadOp(verts, [0, 1, 0], TILES.RAIL_CURVE, rg);
            } else {
              // Straight: default NS; rotate 90° when linked E/W.
              const ew = (e || w2) && !(n || s);
              const verts = ew
                ? [[x, yb, z], [x, yb, z + 1], [x + 1, yb, z + 1], [x + 1, yb, z]]
                : [[x, yb, z], [x + 1, yb, z], [x + 1, yb, z + 1], [x, yb, z + 1]];
              pushQuadOp(verts, [0, 1, 0], faceTile(id, 'top'), rg);
            }
          } else if (model === 'slab') {
            // Half-height box; meta bit0 picks the half (0 bottom, 1 top).
            const rg = cellLightRG(x, y, z);
            const meta = this.meta[localIndex(x, y, z)];
            const top = (meta & 1) === 1;
            pushBoxOp(
              x, top ? y + 0.5 : y, z, x + 1, top ? y + 1 : y + 0.5, z + 1,
              tile, rg, top ? [0, 0.5] : [0.5, 1],
            );
          } else if (model === 'stairs') {
            // Two boxes: a full-footprint half slab + a half-depth riser
            // against the facing direction. Meta bits0-1 = facing
            // (0=+X, 1=+Z, 2=-X, 3=-Z), bit2 = upside-down (both boxes flip).
            const rg = cellLightRG(x, y, z);
            const meta = this.meta[localIndex(x, y, z)];
            const facing = meta & 3;
            const flip = (meta & 4) !== 0;
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
            // Thin 1/16 plate, 14/16 wide, centred (pressure plate, repeater).
            const rg = cellLightRG(x, y, z);
            pushBoxOp(x + 0.0625, y, z + 0.0625, x + 0.9375, y + 0.0625, z + 0.9375, tile, rg);
          } else if (model === 'button') {
            // Small stud in the middle of the floor.
            const rg = cellLightRG(x, y, z);
            pushBoxOp(x + 0.3125, y, z + 0.375, x + 0.6875, y + 0.125, z + 0.625, tile, rg);
          } else if (model === 'portal') {
            // Vertical sheet along the axis of the surrounding frame.
            const rg = cellLightRG(x, y, z);
            const alongX =
              this.getBlockLocal(x - 1, y, z) === BLOCK.NETHER_PORTAL ||
              this.getBlockLocal(x + 1, y, z) === BLOCK.NETHER_PORTAL ||
              world.getBlock(ox + x - 1, y, oz + z) === BLOCK.OBSIDIAN ||
              world.getBlock(ox + x + 1, y, oz + z) === BLOCK.OBSIDIAN;
            if (alongX) {
              pushBoxOp(x, y, z + 0.375, x + 1, y + 1, z + 0.625, tile, rg);
            } else {
              pushBoxOp(x + 0.375, y, z, x + 0.625, y + 1, z + 1, tile, rg);
            }
          }
        }
      }
    }

    // ---- Water pass ----------------------------------------------------------
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const id = this.data[localIndex(x, y, z)];
          if (id !== BLOCK.WATER) continue;

          // Flowing water (meta level > 0) renders with a lowered top; sources
          // and falling-column cells keep the full cell (the shader still dips
          // every water vertex slightly and adds the wave). Side faces shorten
          // to the same height so the surface reads as a sloping sheet.
          const meta = this.meta[localIndex(x, y, z)];
          const lvl = fluidLevel(meta);
          const topH = (lvl === 0 || isFluidFalling(meta)) ? 1 : Math.max(0.14, 1 - lvl * 0.11);

          for (let f = 0; f < FACES.length; f++) {
            const face = FACES[f];
            const nwx = ox + x + face.dir[0];
            const nwy = y + face.dir[1];
            const nwz = oz + z + face.dir[2];
            const neighbour = world.getBlock(nwx, nwy, nwz);

            // Water shows a face only against air (its visible surface/edges).
            if (neighbour !== BLOCK.AIR) continue;

            const t = tileUV(faceTile(id, face.tile));
            const wl = lightAt(nwx, nwy, nwz);
            const blkL = wl.block / 15;
            const skyL = wl.sky / 15;

            const offs = AO_OFFSETS[f];
            const ao = [0, 0, 0, 0];
            for (let c = 0; c < 4; c++) {
              ao[c] = 3;
              const o = offs[c];
              const s1 = occludes(ox + x + o[0][0], y + o[0][1], oz + z + o[0][2]);
              const s2 = occludes(ox + x + o[1][0], y + o[1][1], oz + z + o[1][2]);
              const cr = occludes(ox + x + o[2][0], y + o[2][1], oz + z + o[2][2]);
              ao[c] = aoLevel(s1, s2, cr);
            }

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
          }
        }
      }
    }

    // Assemble a geometry + mesh from one filled buffer.
    const toMesh = (buf, material) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uvs, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
      if (buf.tiles) {
        geometry.setAttribute('tile', new THREE.Float32BufferAttribute(buf.tiles, 1));
      }
      geometry.setIndex(buf.indices);
      return new THREE.Mesh(geometry, material);
    };

    const group = new THREE.Group();
    if (op.indices.length) group.add(toMesh(op, getOpaqueMaterial(atlasTexture)));
    if (wa.indices.length) {
      const water = toMesh(wa, getWaterMaterial(atlasTexture));
      water.renderOrder = 1; // draw water after opaque terrain
      group.add(water);
    }
    group.position.set(ox, 0, oz);
    this.mesh = group;
    return group;
  }

  // Free the GPU geometry of every child mesh. Materials/atlas are shared and
  // intentionally kept.
  dispose() {
    if (this.mesh) {
      this.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      this.mesh = null;
    }
  }
}
