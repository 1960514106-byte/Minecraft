// =============================================================================
// redstone.js — Tick-based redstone simulation.
//
// Power sources: lever (on), redstone torch, redstone block, pressed button,
// pressed pressure plate, and the OUTPUT face of a powered repeater.
// Wire carries power with -1 falloff per block (recursive evaluation).
// Effectors re-evaluated on ticks: doors, TNT, redstone lamps, powered rails
// and pistons. Repeaters add a configurable 1-4 tick delay (right-click).
//
// Blocks store no metadata, so orientation/state lives in side tables keyed
// "x,y,z": levers (on/off), pistons ({dir, extended}), repeaters ({dir, delay,
// out, timer}), buttons (seconds remaining). Pressure plates are detected each
// tick from player/mob/minecart positions — no registry needed.
//
// TICK = 0.1s. Effector evaluation is driven by a dirty set: whenever a power
// source changes, the connected wire network is flooded and every block beside
// it is re-checked. Doors keep their manual-toggle behaviour: they only react
// when a power change reaches them.
// =============================================================================

import { BLOCK, isSolid, blockModel } from './config.js';

const MAX_POWER = 15;
const TICK = 0.1;
const BUTTON_TIME = 1.0;          // seconds a button stays pressed
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const MAX_WIRE_NET = 600;         // safety cap for wire network floods

// Blocks a piston refuses to push.
const UNPUSHABLE = new Set([
  BLOCK.BEDROCK, BLOCK.OBSIDIAN, BLOCK.CHEST, BLOCK.FURNACE, BLOCK.FURNACE_LIT,
  BLOCK.MOB_SPAWNER, BLOCK.PISTON, BLOCK.PISTON_HEAD, BLOCK.ENCHANTING_TABLE,
  BLOCK.BED_HEAD, BLOCK.BED_FOOT, BLOCK.NETHER_PORTAL,
]);

const keyOf = (x, y, z) => `${x},${y},${z}`;

export class Redstone {
  constructor(world) {
    this.world = world;
    this.levers = new Map();     // key -> bool (on)
    this.pistons = new Map();    // key -> { dir: [dx,dy,dz], extended: bool }
    this.repeaters = new Map();  // key -> { dir: [dx,0,dz], delay: 1..4, out: bool, timer: 0 }
    this.buttons = new Map();    // key -> seconds remaining
    this._pressedPlates = new Set(); // keys of plates currently held down
    this._dirty = new Set();     // power-change origins awaiting evaluation
    this._tickAcc = 0;
    // Injected by main.js: onIgnite(x, y, z) lights a TNT fuse; onSound(name)
    // plays interaction audio (clicks, piston).
    this.onIgnite = null;
    this.onSound = null;
  }

  // ---- Power model ----------------------------------------------------------

  isLeverOn(x, y, z) {
    return !!this.levers.get(keyOf(x, y, z));
  }

  // Direct power emitted BY the block at (x,y,z) toward (tx,ty,tz).
  getPower(x, y, z, tx, ty, tz) {
    const block = this.world.getBlock(x, y, z);
    if (block === BLOCK.LEVER && this.isLeverOn(x, y, z)) return MAX_POWER;
    if (block === BLOCK.REDSTONE_TORCH) return MAX_POWER;
    if (block === BLOCK.REDSTONE_BLOCK) return MAX_POWER;
    if (block === BLOCK.BUTTON && this.buttons.has(keyOf(x, y, z))) return MAX_POWER;
    if (block === BLOCK.PRESSURE_PLATE && this._pressedPlates.has(keyOf(x, y, z))) return MAX_POWER;
    if (block === BLOCK.REPEATER_ON && tx !== undefined) {
      // A powered repeater only feeds the block its arrow points at.
      const r = this.repeaters.get(keyOf(x, y, z));
      if (r && x + r.dir[0] === tx && y === ty && z + r.dir[2] === tz) return MAX_POWER;
    }
    return 0;
  }

  isPowered(x, y, z) {
    for (const [dx, dy, dz] of DIRS) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (this.getPower(nx, ny, nz, x, y, z) > 0) return true;
      const nb = this.world.getBlock(nx, ny, nz);
      if (nb === BLOCK.REDSTONE_WIRE) {
        if (this._wireLevel(nx, ny, nz, new Set()) > 0) return true;
      }
    }
    return false;
  }

  _wireLevel(x, y, z, visited) {
    const key = keyOf(x, y, z);
    if (visited.has(key) || visited.size > MAX_WIRE_NET) return 0;
    visited.add(key);
    if (this.world.getBlock(x, y, z) !== BLOCK.REDSTONE_WIRE) return 0;

    let best = 0;
    for (const [dx, dy, dz] of DIRS) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const src = this.getPower(nx, ny, nz, x, y, z);
      if (src > best) best = src;
      if (this.world.getBlock(nx, ny, nz) === BLOCK.REDSTONE_WIRE) {
        const sub = this._wireLevel(nx, ny, nz, visited);
        if (sub - 1 > best) best = sub - 1;
      }
    }
    return Math.max(0, best);
  }

  // ---- Player interactions ---------------------------------------------------

  toggleLever(x, y, z) {
    const key = keyOf(x, y, z);
    const on = !this.levers.get(key);
    this.levers.set(key, on);
    this.markDirty(x, y, z);
    return on;
  }

  pressButton(x, y, z) {
    this.buttons.set(keyOf(x, y, z), BUTTON_TIME);
    this.markDirty(x, y, z);
    if (this.onSound) this.onSound('click');
  }

  // Right-click a repeater: cycle its delay 1 -> 2 -> 3 -> 4 -> 1 ticks.
  cycleRepeater(x, y, z) {
    const r = this.repeaters.get(keyOf(x, y, z));
    if (!r) return 1;
    r.delay = (r.delay % 4) + 1;
    if (this.onSound) this.onSound('click');
    return r.delay;
  }

  // ---- Dirty tracking / effector evaluation ----------------------------------

  markDirty(x, y, z) {
    this._dirty.add(keyOf(x, y, z));
  }

  // Collect every cell whose powered-state may have changed after a power
  // change at `key`: the origin's neighbours plus the whole connected wire
  // network and ITS neighbours.
  _collectAffected(key, out) {
    const [x, y, z] = key.split(',').map(Number);
    const stack = [[x, y, z]];
    const wires = new Set();
    out.add(key);
    while (stack.length) {
      const [cx, cy, cz] = stack.pop();
      for (const [dx, dy, dz] of DIRS) {
        const nx = cx + dx, ny = cy + dy, nz = cz + dz;
        const nkey = keyOf(nx, ny, nz);
        out.add(nkey);
        if (wires.size < MAX_WIRE_NET && !wires.has(nkey) &&
            this.world.getBlock(nx, ny, nz) === BLOCK.REDSTONE_WIRE) {
          wires.add(nkey);
          stack.push([nx, ny, nz]);
        }
      }
    }
  }

  _evalEffector(x, y, z) {
    const block = this.world.getBlock(x, y, z);
    if (block === BLOCK.DOOR_BOTTOM || block === BLOCK.DOOR_TOP ||
        block === BLOCK.DOOR_BOTTOM_OPEN || block === BLOCK.DOOR_TOP_OPEN) {
      this._updateDoor(x, y, z, block);
    } else if (block === BLOCK.TNT) {
      if (this.isPowered(x, y, z) && this.onIgnite) this.onIgnite(x, y, z);
    } else if (block === BLOCK.REDSTONE_LAMP) {
      if (this.isPowered(x, y, z)) this.world.setBlock(x, y, z, BLOCK.REDSTONE_LAMP_ON);
    } else if (block === BLOCK.REDSTONE_LAMP_ON) {
      if (!this.isPowered(x, y, z)) this.world.setBlock(x, y, z, BLOCK.REDSTONE_LAMP);
    } else if (block === BLOCK.POWERED_RAIL) {
      if (this.isPowered(x, y, z)) this.world.setBlock(x, y, z, BLOCK.POWERED_RAIL_ON);
    } else if (block === BLOCK.POWERED_RAIL_ON) {
      if (!this.isPowered(x, y, z)) this.world.setBlock(x, y, z, BLOCK.POWERED_RAIL);
    } else if (block === BLOCK.PISTON) {
      this._updatePiston(x, y, z);
    }
  }

  _updateDoor(x, y, z, block) {
    const powered = this.isPowered(x, y, z);
    const isBottom = block === BLOCK.DOOR_BOTTOM || block === BLOCK.DOOR_BOTTOM_OPEN;
    const bottomY = isBottom ? y : y - 1;
    const isOpen = block === BLOCK.DOOR_BOTTOM_OPEN || block === BLOCK.DOOR_TOP_OPEN;
    if (powered && !isOpen) {
      this.world.setBlock(x, bottomY, z, BLOCK.DOOR_BOTTOM_OPEN);
      this.world.setBlock(x, bottomY + 1, z, BLOCK.DOOR_TOP_OPEN);
      if (this.onSound) this.onSound('door');
    } else if (!powered && isOpen) {
      this.world.setBlock(x, bottomY, z, BLOCK.DOOR_BOTTOM);
      this.world.setBlock(x, bottomY + 1, z, BLOCK.DOOR_TOP);
      if (this.onSound) this.onSound('door');
    }
  }

  // ---- Pistons ---------------------------------------------------------------

  _updatePiston(x, y, z) {
    const key = keyOf(x, y, z);
    let p = this.pistons.get(key);
    if (!p) { p = { dir: [1, 0, 0], extended: false }; this.pistons.set(key, p); }
    const powered = this.isPowered(x, y, z);
    if (powered && !p.extended) this._extendPiston(x, y, z, p);
    else if (!powered && p.extended) this._retractPiston(x, y, z, p);
  }

  _extendPiston(x, y, z, p) {
    const [dx, dy, dz] = p.dir;
    // Build the push chain starting at the head cell.
    const chain = [];
    let cx = x + dx, cy = y + dy, cz = z + dz;
    for (let i = 0; i < 8; i++) {
      const b = this.world.getBlock(cx, cy, cz);
      if (b === BLOCK.AIR || b === BLOCK.WATER) break;      // room found
      if (UNPUSHABLE.has(b) || blockModel(b) !== 'cube' || !isSolid(b)) return; // blocked
      chain.push({ x: cx, y: cy, z: cz, id: b });
      cx += dx; cy += dy; cz += dz;
    }
    const endBlock = this.world.getBlock(cx, cy, cz);
    if (endBlock !== BLOCK.AIR && endBlock !== BLOCK.WATER) return; // no room
    if (cy < 1 || cy >= 63) return;
    // Move the chain one step, tail first.
    for (let i = chain.length - 1; i >= 0; i--) {
      const c = chain[i];
      this.world.setBlock(c.x + dx, c.y + dy, c.z + dz, c.id);
    }
    this.world.setBlock(x + dx, y + dy, z + dz, BLOCK.PISTON_HEAD);
    p.extended = true;
    if (this.onSound) this.onSound('piston');
  }

  _retractPiston(x, y, z, p) {
    const [dx, dy, dz] = p.dir;
    if (this.world.getBlock(x + dx, y + dy, z + dz) === BLOCK.PISTON_HEAD) {
      this.world.setBlock(x + dx, y + dy, z + dz, BLOCK.AIR);
    }
    p.extended = false;
    if (this.onSound) this.onSound('piston');
  }

  // ---- Tick loop ---------------------------------------------------------------

  // playerPos: THREE.Vector3 (eye position); mobs: array with .mesh.position;
  // minecarts: array with .x/.y/.z (may be empty).
  update(dt, playerPos, mobs = [], minecarts = []) {
    this._tickAcc += dt;
    while (this._tickAcc >= TICK) {
      this._tickAcc -= TICK;
      this._tick(playerPos, mobs, minecarts);
    }
  }

  _tick(playerPos, mobs, minecarts) {
    // 1. Buttons time out.
    for (const [key, t] of this.buttons) {
      const left = t - TICK;
      if (left <= 0) {
        this.buttons.delete(key);
        this._dirty.add(key);
        if (this.onSound) this.onSound('click');
      } else {
        this.buttons.set(key, left);
      }
    }

    // 2. Pressure plates: detect anything standing on one.
    const pressed = new Set();
    const check = (px, py, pz) => {
      const bx = Math.floor(px), bz = Math.floor(pz);
      for (const by of [Math.floor(py), Math.floor(py - 0.1)]) {
        if (this.world.getBlock(bx, by, bz) === BLOCK.PRESSURE_PLATE) {
          pressed.add(keyOf(bx, by, bz));
        }
      }
    };
    if (playerPos) check(playerPos.x, playerPos.y - 1.55, playerPos.z);
    for (const m of mobs) check(m.mesh.position.x, m.mesh.position.y + 0.1, m.mesh.position.z);
    for (const c of minecarts) check(c.x, c.y + 0.1, c.z);
    for (const key of pressed) {
      if (!this._pressedPlates.has(key)) { this._dirty.add(key); if (this.onSound) this.onSound('click'); }
    }
    for (const key of this._pressedPlates) {
      if (!pressed.has(key)) this._dirty.add(key);
    }
    this._pressedPlates = pressed;

    // 3. Repeaters: sample input, apply delayed output.
    for (const [key, r] of this.repeaters) {
      const [x, y, z] = key.split(',').map(Number);
      const block = this.world.getBlock(x, y, z);
      if (block !== BLOCK.REPEATER && block !== BLOCK.REPEATER_ON) continue;
      const input = this.isPoweredFromBehind(x, y, z, r.dir);
      if (input !== r.out) {
        r.timer += 1;
        if (r.timer >= r.delay) {
          r.timer = 0;
          r.out = input;
          this.world.setBlock(x, y, z, input ? BLOCK.REPEATER_ON : BLOCK.REPEATER);
          this._dirty.add(key);
        }
      } else {
        r.timer = 0;
      }
    }

    // 4. Evaluate everything a power change can reach.
    if (this._dirty.size) {
      const affected = new Set();
      for (const key of this._dirty) this._collectAffected(key, affected);
      this._dirty.clear();
      for (const key of affected) {
        const [x, y, z] = key.split(',').map(Number);
        this._evalEffector(x, y, z);
      }
    }
  }

  // Repeater input: power arriving at the cell BEHIND the repeater, i.e. from
  // pos - dir (wire, source, or another repeater pointing at it).
  isPoweredFromBehind(x, y, z, dir) {
    const bx = x - dir[0], by = y, bz = z - dir[2];
    if (this.getPower(bx, by, bz, x, y, z) > 0) return true;
    const b = this.world.getBlock(bx, by, bz);
    if (b === BLOCK.REDSTONE_WIRE) return this._wireLevel(bx, by, bz, new Set()) > 0;
    return false;
  }

  // ---- Placement / removal hooks ----------------------------------------------

  // opts.dir: orientation [dx,dy,dz] for pistons/repeaters (from main.js).
  onBlockPlaced(x, y, z, blockId, opts = {}) {
    const key = keyOf(x, y, z);
    if (blockId === BLOCK.PISTON) {
      this.pistons.set(key, { dir: opts.dir || [1, 0, 0], extended: false });
    } else if (blockId === BLOCK.REPEATER) {
      const d = opts.dir || [1, 0, 0];
      this.repeaters.set(key, { dir: [d[0], 0, d[2]], delay: 1, out: false, timer: 0 });
    }
    if (blockId === BLOCK.REDSTONE_WIRE || blockId === BLOCK.REDSTONE_TORCH ||
        blockId === BLOCK.LEVER || blockId === BLOCK.REDSTONE_BLOCK ||
        blockId === BLOCK.PISTON || blockId === BLOCK.REPEATER ||
        blockId === BLOCK.REDSTONE_LAMP || blockId === BLOCK.POWERED_RAIL ||
        blockId === BLOCK.BUTTON || blockId === BLOCK.PRESSURE_PLATE) {
      this.markDirty(x, y, z);
    }
  }

  onBlockRemoved(x, y, z, blockId) {
    const key = keyOf(x, y, z);
    if (blockId === BLOCK.LEVER) this.levers.delete(key);
    if (blockId === BLOCK.BUTTON) this.buttons.delete(key);
    if (blockId === BLOCK.REPEATER || blockId === BLOCK.REPEATER_ON) this.repeaters.delete(key);
    if (blockId === BLOCK.PISTON) {
      const p = this.pistons.get(key);
      if (p && p.extended) {
        const hx = x + p.dir[0], hy = y + p.dir[1], hz = z + p.dir[2];
        if (this.world.getBlock(hx, hy, hz) === BLOCK.PISTON_HEAD) {
          this.world.setBlock(hx, hy, hz, BLOCK.AIR);
        }
      }
      this.pistons.delete(key);
    }
    // Only a removed power component can change neighbouring effector state;
    // reacting to every broken block would slam manually opened doors shut.
    if (blockId === BLOCK.LEVER || blockId === BLOCK.REDSTONE_WIRE ||
        blockId === BLOCK.REDSTONE_TORCH || blockId === BLOCK.REDSTONE_BLOCK ||
        blockId === BLOCK.BUTTON || blockId === BLOCK.PRESSURE_PLATE ||
        blockId === BLOCK.REPEATER || blockId === BLOCK.REPEATER_ON) {
      this.markDirty(x, y, z);
    }
  }

  // ---- Persistence --------------------------------------------------------------

  serialize() {
    const pistons = {};
    for (const [key, p] of this.pistons) pistons[key] = { dir: p.dir, extended: p.extended };
    const repeaters = {};
    for (const [key, r] of this.repeaters) repeaters[key] = { dir: r.dir, delay: r.delay, out: r.out };
    const levers = [];
    for (const [key, on] of this.levers) if (on) levers.push(key);
    return { levers, pistons, repeaters };
  }

  restore(data) {
    if (!data) return;
    // Legacy format (SAVE_VERSION <= 6): a plain array of ON lever keys.
    if (Array.isArray(data)) {
      for (const key of data) this.levers.set(key, true);
      return;
    }
    if (Array.isArray(data.levers)) {
      for (const key of data.levers) this.levers.set(key, true);
    }
    if (data.pistons) {
      for (const key in data.pistons) {
        const p = data.pistons[key];
        this.pistons.set(key, { dir: p.dir || [1, 0, 0], extended: !!p.extended });
      }
    }
    if (data.repeaters) {
      for (const key in data.repeaters) {
        const r = data.repeaters[key];
        this.repeaters.set(key, {
          dir: r.dir || [1, 0, 0],
          delay: Math.max(1, Math.min(4, r.delay || 1)),
          out: !!r.out,
          timer: 0,
        });
      }
    }
  }
}
