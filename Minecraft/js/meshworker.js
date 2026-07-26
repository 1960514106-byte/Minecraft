// =============================================================================
// meshworker.js — Web Worker wrapper around meshcore.js. Receives a 3x3-chunk
// block/meta snapshot, computes voxel lighting + the centre chunk's geometry
// arrays and posts them back with transferables. Pure compute: no three.js,
// no DOM, no world access.
//
// Job message:   { jobId, blocks: Uint16Array, meta: Uint8Array, skyless }
// Reply message: { jobId, arrays: { op, wa }, lightSky, lightBlock }
// =============================================================================

import {
  computeLightField, extractCenterLight, buildMeshArrays, meshTransferables,
  SNAP_VOL,
} from './meshcore.js';

// Light scratch fields reused across jobs (each worker has its own).
const sky = new Uint8Array(SNAP_VOL);
const blk = new Uint8Array(SNAP_VOL);

self.onmessage = (e) => {
  const { jobId, blocks, meta, skyless } = e.data;
  computeLightField(blocks, skyless, sky, blk);
  const arrays = buildMeshArrays(blocks, meta, sky, blk, skyless);
  const { lightSky, lightBlock } = extractCenterLight(sky, blk);
  const transfer = meshTransferables(arrays);
  transfer.push(lightSky.buffer, lightBlock.buffer);
  self.postMessage({ jobId, arrays, lightSky, lightBlock }, transfer);
};

// Tell the main thread the module loaded fine (worker pool readiness probe).
self.postMessage({ ready: true });
