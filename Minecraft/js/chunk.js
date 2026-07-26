// =============================================================================
// chunk.js — A CHUNK_SIZE x CHUNK_HEIGHT x CHUNK_SIZE column of blocks plus the
// mesh assembly. Since Phase 5 the actual geometry generation lives in
// meshcore.js (pure typed-array functions shared with meshworker.js); this
// module keeps the block/meta storage, the shared materials and the
// arrays -> THREE.BufferGeometry upload.
//
// Lighting: every vertex carries THREE channels in its vertex color —
//   r = block light (torches/glowstone/lava, BFS-flooded)
//   g = sky light   (sunlight columns + flood)
//   b = ambient-occlusion brightness
// The shader combines them: skylight is scaled by the scene lights (which the
// day/night cycle already drives), block light is added as emissive so torches
// glow at night, AO darkens inner corners. Day/night therefore needs NO remesh.
//
// All opaque terrain shares ONE atlas material and draws as ONE mesh per chunk:
// each vertex carries a `tile` index that a small shader override uses to wrap
// the tiled UVs into that tile's atlas sub-rectangle (see getOpaqueMaterial).
// =============================================================================

import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT, ATLAS_COLS, ATLAS_ROWS, BLOCK } from './config.js';
import { buildMeshArrays } from './meshcore.js';

const VOLUME = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE;

// Flat-array index for local coords. Matches the contract in config.js.
function localIndex(x, y, z) {
  return x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
}

// Two materials shared by every chunk (all sample the same atlas).
let opaqueMaterial = null;
let waterMaterial = null;

// Shared time uniform driving the water's surface wave.
const WATER_UNIFORMS = { uTime: { value: 0 } };
export function setWaterTime(t) { WATER_UNIFORMS.uTime.value = t; }

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
        .replace(
          '#include <color_fragment>',
          `float voxBlk = vColor.r;
  float voxSky = vColor.g;
  float voxAo  = vColor.b;
  diffuseColor.rgb *= voxAo * max(voxSky, 0.06);`,
        )
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
    // Light fields installed by lighting.js computeChunkLight() (sync path) or
    // copied back from a mesh worker's snapshot computation.
    this.lightSky = null;
    this.lightBlock = null;
    this.lightDirty = true;
    // Post-generation revision counter: bumped by world edits / cross-chunk
    // tree patches so in-flight worker mesh jobs can detect stale snapshots.
    this.rev = 0;
    // Non-null while a worker mesh job for this chunk is in flight.
    this.meshJobId = null;
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
  // one opaque mesh and one translucent water mesh — SYNCHRONOUS path.
  // The world supplies a 3x3 snapshot (blocks/meta plus the cached per-chunk
  // light fields assembled into snapshot space); meshcore does the geometry.
  // Expects light around the chunk to be up to date (world handles that).
  buildMesh(world, atlasTexture) {
    const snap = world.gatherMeshSnapshot(this.cx, this.cz, true);
    const arrays = buildMeshArrays(snap.blocks, snap.meta, snap.sky, snap.blk, world.skyless);
    return this.buildMeshFromArrays(arrays, atlasTexture);
  }

  // Upload prebuilt geometry arrays (from meshcore, possibly via a worker).
  buildMeshFromArrays(arrays, atlasTexture) {
    const toMesh = (buf, material) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(buf.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(buf.normals, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(buf.uvs, 2));
      geometry.setAttribute('color', new THREE.BufferAttribute(buf.colors, 3));
      if (buf.tiles) {
        geometry.setAttribute('tile', new THREE.BufferAttribute(buf.tiles, 1));
      }
      geometry.setIndex(new THREE.BufferAttribute(buf.indices, 1));
      return new THREE.Mesh(geometry, material);
    };

    const group = new THREE.Group();
    if (arrays.op.indices.length) group.add(toMesh(arrays.op, getOpaqueMaterial(atlasTexture)));
    if (arrays.wa.indices.length) {
      const water = toMesh(arrays.wa, getWaterMaterial(atlasTexture));
      water.renderOrder = 1; // draw water after opaque terrain
      group.add(water);
    }
    group.position.set(this.cx * CHUNK_SIZE, 0, this.cz * CHUNK_SIZE);
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
