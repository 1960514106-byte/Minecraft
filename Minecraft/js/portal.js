// =============================================================================
// portal.js — Nether portal frames: validation, lighting and collapse.
//
// A frame is a flat rectangle of OBSIDIAN around an interior of air, standing
// in the X/Y or Z/Y plane. Interior size 2x3 up to 4x5. Lighting the interior
// with flint and steel fills it with NETHER_PORTAL blocks; breaking any frame
// obsidian collapses the connected portal blocks.
// =============================================================================

import { BLOCK } from './config.js';

const MIN_W = 2, MAX_W = 4;
const MIN_H = 3, MAX_H = 5;

// Try to light a portal from an ignition point (the clicked air cell, or the
// cell above a clicked obsidian block). Returns the list of filled portal
// cells, or null if no valid frame surrounds the point.
export function tryLightPortal(world, x, y, z) {
  for (const axis of ['x', 'z']) {
    const cells = validateFrame(world, x, y, z, axis);
    if (cells) {
      for (const c of cells) world.setBlock(c.x, c.y, c.z, BLOCK.NETHER_PORTAL);
      return cells;
    }
  }
  return null;
}

// Validate the frame containing (x,y,z) in the given plane. Returns interior
// cells or null.
function validateFrame(world, x, y, z, axis) {
  // Flood-collect connected air cells restricted to the plane through (x,y,z).
  const key = (cx, cy, cz) => `${cx},${cy},${cz}`;
  const seen = new Set([key(x, y, z)]);
  const cells = [{ x, y, z }];
  const stack = [{ x, y, z }];
  if (world.getBlock(x, y, z) !== BLOCK.AIR) return null;

  const planeDirs = axis === 'x'
    ? [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]
    : [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];

  while (stack.length) {
    if (cells.length > MAX_W * MAX_H) return null; // too big to be a frame
    const c = stack.pop();
    for (const [dx, dy, dz] of planeDirs) {
      const nx = c.x + dx, ny = c.y + dy, nz = c.z + dz;
      const k = key(nx, ny, nz);
      if (seen.has(k)) continue;
      const b = world.getBlock(nx, ny, nz);
      if (b === BLOCK.AIR) {
        seen.add(k);
        const cell = { x: nx, y: ny, z: nz };
        cells.push(cell);
        stack.push(cell);
      } else if (b !== BLOCK.OBSIDIAN) {
        return null; // interior touches something that isn't frame
      }
    }
  }

  // The collected air region must be a solid WxH rectangle in the plane.
  let minU = Infinity, maxU = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of cells) {
    const u = axis === 'x' ? c.x : c.z;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }
  const w = maxU - minU + 1;
  const h = maxY - minY + 1;
  if (w < MIN_W || w > MAX_W || h < MIN_H || h > MAX_H) return null;
  if (cells.length !== w * h) return null; // not a filled rectangle

  return cells;
}

// Collapse any portal blocks connected to (x,y,z) — called when frame
// obsidian or a portal block is removed.
export function collapsePortalAt(world, x, y, z) {
  const removed = [];
  const stack = [[x, y, z]];
  const seen = new Set();
  while (stack.length) {
    const [cx, cy, cz] = stack.pop();
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const nx = cx + dx, ny = cy + dy, nz = cz + dz;
      const k = `${nx},${ny},${nz}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (world.getBlock(nx, ny, nz) === BLOCK.NETHER_PORTAL) {
        world.setBlock(nx, ny, nz, BLOCK.AIR);
        removed.push({ x: nx, y: ny, z: nz });
        stack.push([nx, ny, nz]);
      }
    }
  }
  return removed;
}

// Build a small ready-lit return portal at the destination (used when arriving
// in a dimension with no portal nearby). Writes through world.setBlock so it
// persists as edits.
export function buildArrivalPortal(world, x, y, z) {
  // Platform under and around the frame.
  for (let dx = -2; dx <= 3; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      world.setBlock(x + dx, y - 1, z + dz, world.skyless ? BLOCK.NETHERRACK : BLOCK.STONE);
    }
  }
  // Frame in the X/Y plane: interior 2 wide (dx 0..1) by 3 tall (dy 0..2).
  for (let dx = -1; dx <= 2; dx++) {
    for (let dy = -1; dy <= 3; dy++) {
      const isFrame = dx === -1 || dx === 2 || dy === -1 || dy === 3;
      world.setBlock(x + dx, y + dy, z, isFrame ? BLOCK.OBSIDIAN : BLOCK.NETHER_PORTAL);
    }
  }
  // Clear space on both sides so the player can step out.
  for (let dx = 0; dx <= 1; dx++) {
    for (let dy = 0; dy <= 2; dy++) {
      for (const dz of [-1, 1]) {
        world.setBlock(x + dx, y + dy, z + dz, BLOCK.AIR);
      }
    }
  }
  return { x: x + 0.5, y: y + 0.1, z: z + 1.5 };
}

// Find a lit portal cell near (x,y,z) within `radius` (searches loaded state
// via world.getBlock, which generates as needed — keep radius modest).
export function findPortalNear(world, x, y, z, radius = 12) {
  for (let r = 0; r <= radius; r += 2) {
    for (let dy = -8; dy <= 8; dy += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        for (let dz = -r; dz <= r; dz += 2) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) < r - 1) continue;
          const cy = y + dy;
          if (cy < 1 || cy > 62) continue;
          if (world.getBlock(x + dx, cy, z + dz) === BLOCK.NETHER_PORTAL) {
            return { x: x + dx + 0.5, y: cy + 0.1, z: z + dz + 0.5 };
          }
        }
      }
    }
  }
  return null;
}
