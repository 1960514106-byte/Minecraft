// =============================================================================
// fluids.js — Flowing water & lava as a budgeted cellular automaton.
//
// Liquid cells reuse BLOCK.WATER / BLOCK.LAVA with their flow state in per-voxel
// meta (see the fluid helpers in config.js): bits 0-2 = level (0 = source,
// 1..7 = flowing), bit 3 = falling-column flag. Rules (simplified vanilla):
//   - a liquid flows DOWN first (below becomes a falling level-1 cell);
//   - grounded liquid spreads horizontally with level+1 (water to 7, lava to 3);
//   - a flowing cell with no supplier (same-type above, or a horizontal
//     same-type neighbour with a lower level) dries back to AIR;
//   - a water cell (or an empty cell) with >= 2 horizontal SOURCE neighbours
//     over solid ground / a source becomes a new source (infinite water);
//   - water touching lava hardens it: source lava -> obsidian, flowing -> cobble;
//   - lava only processes every other fluid tick (it is slower than water).
//
// The sim is driven by an active-cell set + FIFO queue: nothing ticks until
// wake() is called for an edit (main.js wakes cells on place/break/explosions
// and bucket use). Each 5 Hz tick processes a bounded batch and applies all of
// its writes through World.setBlocks, so remeshes coalesce per chunk and the
// changes land in the edit diff (they persist through save/reload for free).
// Serialisation only needs the pending cell keys — the liquid blocks themselves
// live in the world edits.
// =============================================================================

import {
  BLOCK, isSolid,
  fluidLevel, isFluidFalling, fluidMeta, fluidMaxLevel,
} from './config.js';

const TICK_INTERVAL = 0.2;   // seconds -> 5 Hz
const CELL_BUDGET = 96;      // cell updates per tick

const H4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const NEIGHBOURS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

function isFluidBlock(id) { return id === BLOCK.WATER || id === BLOCK.LAVA; }

// Cells a fluid may flow into (washing away loose plants).
function isFlowable(id) {
  return id === BLOCK.AIR || id === BLOCK.TALL_GRASS ||
         id === BLOCK.FLOWER_RED || id === BLOCK.FLOWER_YELLOW;
}

export class FluidSim {
  constructor(world) {
    this.world = world;
    this.active = new Set();   // keys "x,y,z" of cells pending an update
    this.queue = [];           // FIFO of the same keys
    this.acc = 0;
    this.tickIndex = 0;
    // Optional hook: called at (x,y,z) when lava hardens to obsidian/cobble so
    // main.js can play a sound + smoke puff without this module knowing about it.
    this.onEffect = null;
  }

  _push(x, y, z) {
    const key = x + ',' + y + ',' + z;
    if (!this.active.has(key)) {
      this.active.add(key);
      this.queue.push(key);
    }
  }

  // Wake a cell and any liquid neighbours after a world edit at (x,y,z).
  wake(x, y, z) {
    this._push(x, y, z);
    for (const [dx, dy, dz] of NEIGHBOURS6) {
      if (isFluidBlock(this.world.getBlock(x + dx, y + dy, z + dz))) {
        this._push(x + dx, y + dy, z + dz);
      }
    }
  }

  // Returns true if any tick applied changes (caller may schedule a save).
  update(dt) {
    this.acc += dt;
    let changed = false;
    while (this.acc >= TICK_INTERVAL) {
      this.acc -= TICK_INTERVAL;
      if (this.tick()) changed = true;
    }
    return changed;
  }

  tick() {
    if (!this.queue.length) return false;
    this.tickIndex++;
    const lavaTurn = this.tickIndex % 2 === 0;
    const batch = this.queue.splice(0, Math.min(this.queue.length, CELL_BUDGET));

    // Writes are collected per tick and applied in ONE setBlocks call. Reads
    // during the tick overlay the pending writes so cells in the same batch
    // see a consistent world.
    const writes = new Map(); // key -> { x, y, z, id, meta }
    const get = (x, y, z) => {
      const w = writes.get(x + ',' + y + ',' + z);
      if (w) return { id: w.id, meta: w.meta };
      return { id: this.world.getBlock(x, y, z), meta: this.world.getMeta(x, y, z) };
    };
    const set = (x, y, z, id, meta = 0) => {
      writes.set(x + ',' + y + ',' + z, { x, y, z, id, meta });
      // Re-examine the changed cell and its neighbourhood next tick. Neighbours
      // are pushed unconditionally (the overlay makes liquid checks unreliable
      // mid-tick); non-liquid cells fall out again after one cheap look.
      this._push(x, y, z);
      for (const [dx, dy, dz] of NEIGHBOURS6) this._push(x + dx, y + dy, z + dz);
    };

    // Lava<->water hardening. Returns true if the lava cell at (x,y,z) turned
    // to stone-kind (the caller should stop processing it).
    const hardenLavaIfWet = (x, y, z, meta) => {
      let wet = false;
      for (const [dx, dz] of H4) {
        if (get(x + dx, y, z + dz).id === BLOCK.WATER) { wet = true; break; }
      }
      if (!wet && get(x, y + 1, z).id === BLOCK.WATER) wet = true;
      if (!wet && get(x, y - 1, z).id === BLOCK.WATER) wet = true; // lava poured onto water
      if (!wet) return false;
      set(x, y, z, fluidLevel(meta) === 0 && !isFluidFalling(meta) ? BLOCK.OBSIDIAN : BLOCK.COBBLESTONE);
      if (this.onEffect) this.onEffect(x, y, z);
      return true;
    };

    // Infinite water: >= 2 horizontal SOURCE neighbours over solid ground (or a
    // source below) turns this cell into a new source. Lava never multiplies.
    const tryFormSource = (x, y, z) => {
      let sources = 0;
      for (const [dx, dz] of H4) {
        const nb = get(x + dx, y, z + dz);
        if (nb.id === BLOCK.WATER && fluidLevel(nb.meta) === 0 && !isFluidFalling(nb.meta)) sources++;
      }
      if (sources < 2) return false;
      const below = get(x, y - 1, z);
      if (!(isSolid(below.id) || (below.id === BLOCK.WATER && fluidLevel(below.meta) === 0))) return false;
      set(x, y, z, BLOCK.WATER, 0);
      return true;
    };

    const deferredLava = [];

    for (const key of batch) {
      this.active.delete(key);
      const parts = key.split(',');
      const x = +parts[0], y = +parts[1], z = +parts[2];
      const cell = get(x, y, z);
      const id = cell.id;

      if (!isFluidBlock(id)) {
        // An empty cell woken between two sources may itself become a source.
        if (isFlowable(id)) tryFormSource(x, y, z);
        continue;
      }
      if (id === BLOCK.LAVA && !lavaTurn) {
        // Lava runs at half the water rate: put it back for the next tick.
        deferredLava.push(key);
        continue;
      }

      const meta = cell.meta;
      const level = fluidLevel(meta);
      const falling = isFluidFalling(meta);
      const max = fluidMaxLevel(id);

      // 1) Water/lava contact hardens the LAVA cell.
      if (id === BLOCK.LAVA && hardenLavaIfWet(x, y, z, meta)) continue;
      if (id === BLOCK.WATER) {
        // Poke touching lava awake (it converts on its own turn) — covers water
        // flowing onto a lava surface from above.
        for (const [dx, dy, dz] of NEIGHBOURS6) {
          if (get(x + dx, y + dy, z + dz).id === BLOCK.LAVA) this._push(x + dx, y + dy, z + dz);
        }
      }

      // 2) Flowing cells: re-derive the level from suppliers; dry up without one.
      if (level > 0 || falling) {
        if (id === BLOCK.WATER && tryFormSource(x, y, z)) continue;
        const above = get(x, y + 1, z);
        let want = Infinity;
        let wantFalling = false;
        if (above.id === id) {
          want = 1;
          wantFalling = true;
        } else {
          for (const [dx, dz] of H4) {
            const nb = get(x + dx, y, z + dz);
            if (nb.id === id) {
              const supply = fluidLevel(nb.meta) + 1;
              if (supply < want) want = supply;
            }
          }
        }
        // No supplier at all (or only ones too weak to sustain any level):
        // the cell dries up. Otherwise it settles to the derived level.
        if (!wantFalling && want > max) { set(x, y, z, BLOCK.AIR, 0); continue; }
        const newMeta = wantFalling ? fluidMeta(1, true) : fluidMeta(want, false);
        if (newMeta !== meta) { set(x, y, z, id, newMeta); continue; }
      }

      // 3) Flow down first: below becomes a falling column cell.
      const below = get(x, y - 1, z);
      const fallMeta = fluidMeta(1, true);
      const belowFlowable =
        (y > 0) && (
          isFlowable(below.id) ||
          (below.id === id && fluidLevel(below.meta) > 0 && below.meta !== fallMeta)
        );
      if (belowFlowable) {
        set(x, y - 1, z, id, fallMeta);
        continue;
      }

      // 4) Grounded (solid floor) liquid spreads horizontally, one step weaker.
      if (!isSolid(below.id)) continue;   // resting on liquid: nothing to do
      if (level >= max) continue;
      const spreadLevel = falling ? 2 : level + 1;
      if (spreadLevel > max) continue;
      for (const [dx, dz] of H4) {
        const nb = get(x + dx, y, z + dz);
        if (isFlowable(nb.id)) {
          set(x + dx, y, z + dz, id, fluidMeta(spreadLevel, false));
        } else if (nb.id === id && fluidLevel(nb.meta) > spreadLevel && !isFluidFalling(nb.meta)) {
          this._push(x + dx, y, z + dz); // stronger supply arrived: let it re-derive
        }
      }
    }

    for (const key of deferredLava) {
      if (!this.active.has(key)) { this.active.add(key); this.queue.push(key); }
    }

    if (!writes.size) return false;
    const list = [...writes.values()];
    if (this.world.setBlocks) this.world.setBlocks(list);
    else for (const e of list) this.world.setBlock(e.x, e.y, e.z, e.id, e.meta);
    return true;
  }

  // Only the pending cells need saving; the liquid blocks themselves already
  // live in the world's edit diff.
  serialize() {
    return { active: [...this.active] };
  }

  restore(data) {
    if (!data || !Array.isArray(data.active)) return;
    for (const key of data.active) {
      if (typeof key !== 'string') continue;
      const [x, y, z] = key.split(',').map(Number);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) this._push(x, y, z);
    }
  }
}
