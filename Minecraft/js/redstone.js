// =============================================================================
// redstone.js — Tick-based redstone simulation.
//
// Power sources: lever (on), LIT redstone torch, redstone block, pressed
// button, pressed pressure plate, the OUTPUT face of a powered repeater and
// the BACK of a pulsing observer.
// Wire carries power with -1 falloff per block (recursive evaluation).
// Effectors re-evaluated on ticks: doors, TNT, redstone lamps, powered rails,
// pistons (sticky too), dispensers/droppers and note blocks (rising edge).
// Repeaters add a configurable 1-4 tick delay (right-click).
//
// Blocks store no metadata, so orientation/state lives in side tables keyed
// "x,y,z": levers (on/off), pistons ({dir, extended}), repeaters ({dir, delay,
// out, timer}), buttons (seconds remaining), torches ({off}), observers
// ({dir, out, fire}), dispensers ({dir, powered}). Pressure plates are
// detected each tick from player/mob/minecart positions — no registry needed.
//
// Torch inversion (NOT gate) is tick-settled and double-buffered: every tick
// each torch samples whether its SUPPORT block (the cell below) is powered
// using the PREVIOUS tick's torch flags, then all flags commit at once and the
// block id swaps REDSTONE_TORCH <-> REDSTONE_TORCH_OFF (the lamp on/off
// pattern, so lighting stays correct). A torch never powers its own support —
// that would be instant self-feedback. The 1-tick settle delay is what makes
// torch rings oscillate as clocks.
//
// TICK = 0.1s. Effector evaluation is driven by a dirty set: whenever a power
// source changes, the connected wire network is flooded and every block beside
// it is re-checked. Doors keep their manual-toggle behaviour: they only react
// when a power change reaches them.
// =============================================================================

import { BLOCK, CHUNK_SIZE, isSolid, blockModel, decodeEditId } from './config.js';

const MAX_POWER = 15;
const TICK = 0.1;
const BUTTON_TIME = 1.0;          // seconds a button stays pressed
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const MAX_WIRE_NET = 600;         // safety cap for wire network floods

// Blocks a piston refuses to push. Phase 6 adds the new containers (their
// contents key by position, vanilla keeps them unpushable too), the observer
// and note block (their orientation/edge state also keys by position in the
// side tables — moving the block would orphan it).
const UNPUSHABLE = new Set([
  BLOCK.BEDROCK, BLOCK.OBSIDIAN, BLOCK.CHEST, BLOCK.FURNACE, BLOCK.FURNACE_LIT,
  BLOCK.MOB_SPAWNER, BLOCK.PISTON, BLOCK.PISTON_HEAD, BLOCK.ENCHANTING_TABLE,
  BLOCK.BED_HEAD, BLOCK.BED_FOOT, BLOCK.NETHER_PORTAL,
  BLOCK.STICKY_PISTON, BLOCK.OBSERVER, BLOCK.DISPENSER, BLOCK.DROPPER,
  BLOCK.HOPPER, BLOCK.NOTE_BLOCK,
]);

const keyOf = (x, y, z) => `${x},${y},${z}`;

export class Redstone {
  constructor(world) {
    this.world = world;
    this.levers = new Map();     // key -> bool (on)
    this.pistons = new Map();    // key -> { dir: [dx,dy,dz], extended: bool } (piston + sticky)
    this.repeaters = new Map();  // key -> { dir: [dx,0,dz], delay: 1..4, out: bool, timer: 0 }
    this.buttons = new Map();    // key -> seconds remaining
    this.torches = new Map();    // key -> { off: bool } (double-buffered NOT gates)
    this.observers = new Map();  // key -> { dir: [dx,dy,dz], out: bool, fire: bool }
    this.observerWatch = new Map(); // watched "x,y,z" -> Set of observer keys (O(observers))
    this.dispensers = new Map(); // key -> { dir: [dx,dy,dz], powered: bool } (dispenser + dropper)
    this.comparators = new Map(); // key -> { dir: [dx,0,dz], subtract: bool, out: 0..15 }
    this._notesPowered = new Set(); // note-block keys currently powered (edge detection)
    this._pressedPlates = new Set(); // keys of plates currently held down
    this._dirty = new Set();     // power-change origins awaiting evaluation
    this._tickAcc = 0;
    // Pre-Phase-6 saves have redstone torches in the world but no torch
    // registry; the first tick scans the world's edit maps once to adopt them
    // (torches only ever exist as player edits).
    this._torchesScanned = false;
    // Injected by main.js: onIgnite(x, y, z) lights a TNT fuse; onSound(name)
    // plays interaction audio (clicks, piston); onDispense(x, y, z, dir) ejects
    // from a dispenser/dropper on a rising edge; onNote(x, y, z) plays a note
    // block on a rising edge.
    this.onIgnite = null;
    this.onSound = null;
    this.onDispense = null;
    this.onNote = null;
    // containerSignal(x, y, z) -> 0..15: comparator container reading
    // (floor(1 + 14 * filledSlots/capacity)), injected by main.js. Null keeps
    // comparators working on pure wire/source signals (headless tests).
    this.containerSignal = null;
  }

  // ---- Power model ----------------------------------------------------------

  isLeverOn(x, y, z) {
    return !!this.levers.get(keyOf(x, y, z));
  }

  // Direct power emitted BY the block at (x,y,z) toward (tx,ty,tz).
  getPower(x, y, z, tx, ty, tz) {
    const block = this.world.getBlock(x, y, z);
    if (block === BLOCK.LEVER && this.isLeverOn(x, y, z)) return MAX_POWER;
    if (block === BLOCK.REDSTONE_TORCH) {
      // A torch never powers its own support block (instant self-feedback);
      // an inverted torch is no source at all. REDSTONE_TORCH_OFF has no case
      // here on purpose — the off block id is never a source.
      if (tx === x && ty === y - 1 && tz === z) return 0;
      const t = this.torches.get(keyOf(x, y, z));
      return t && t.off ? 0 : MAX_POWER;
    }
    if (block === BLOCK.OBSERVER && tx !== undefined) {
      // A pulsing observer only feeds the cell its BACK points at.
      const o = this.observers.get(keyOf(x, y, z));
      if (o && o.out && x - o.dir[0] === tx && y - o.dir[1] === ty && z - o.dir[2] === tz) {
        return MAX_POWER;
      }
    }
    if (block === BLOCK.COMPARATOR && tx !== undefined) {
      // A comparator emits its ANALOG output level, only out its front.
      const c = this.comparators.get(keyOf(x, y, z));
      if (c && c.out > 0 && x + c.dir[0] === tx && y === ty && z + c.dir[2] === tz) return c.out;
    }
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

  // Right-click a comparator: toggle compare <-> subtract mode.
  toggleComparator(x, y, z) {
    const c = this.comparators.get(keyOf(x, y, z));
    if (!c) return false;
    c.subtract = !c.subtract;
    this.markDirty(x, y, z);
    if (this.onSound) this.onSound('click');
    return c.subtract;
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
    } else if (block === BLOCK.PISTON || block === BLOCK.STICKY_PISTON) {
      this._updatePiston(x, y, z);
    } else if (block === BLOCK.DISPENSER || block === BLOCK.DROPPER) {
      // Rising-edge trigger: eject exactly once per off->on transition.
      const key = keyOf(x, y, z);
      let d = this.dispensers.get(key);
      if (!d) { d = { dir: [1, 0, 0], powered: false }; this.dispensers.set(key, d); }
      const powered = this.isPowered(x, y, z);
      if (powered && !d.powered && this.onDispense) this.onDispense(x, y, z, d.dir);
      d.powered = powered;
    } else if (block === BLOCK.NOTE_BLOCK) {
      const key = keyOf(x, y, z);
      const powered = this.isPowered(x, y, z);
      if (powered && !this._notesPowered.has(key) && this.onNote) this.onNote(x, y, z);
      if (powered) this._notesPowered.add(key);
      else this._notesPowered.delete(key);
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
      chain.push({ x: cx, y: cy, z: cz, id: b, meta: this.world.getMeta ? this.world.getMeta(cx, cy, cz) : 0 });
      cx += dx; cy += dy; cz += dz;
    }
    const endBlock = this.world.getBlock(cx, cy, cz);
    if (endBlock !== BLOCK.AIR && endBlock !== BLOCK.WATER) return; // no room
    if (cy < 1 || cy >= 63) return;
    // Move the chain one step, tail first (meta rides along).
    for (let i = chain.length - 1; i >= 0; i--) {
      const c = chain[i];
      this.world.setBlock(c.x + dx, c.y + dy, c.z + dz, c.id, c.meta);
    }
    this.world.setBlock(x + dx, y + dy, z + dz, BLOCK.PISTON_HEAD);
    p.extended = true;
    if (this.onSound) this.onSound('piston');
  }

  _retractPiston(x, y, z, p) {
    const [dx, dy, dz] = p.dir;
    const hx = x + dx, hy = y + dy, hz = z + dz;
    if (this.world.getBlock(hx, hy, hz) === BLOCK.PISTON_HEAD) {
      this.world.setBlock(hx, hy, hz, BLOCK.AIR);
      // Sticky pistons pull the block that sat in front of the head back one
      // cell (single block only — no chain pulling, matching vanilla).
      if (this.world.getBlock(x, y, z) === BLOCK.STICKY_PISTON) {
        const bx = hx + dx, by = hy + dy, bz = hz + dz;
        const b = this.world.getBlock(bx, by, bz);
        if (b !== BLOCK.AIR && b !== BLOCK.WATER &&
            !UNPUSHABLE.has(b) && blockModel(b) === 'cube' && isSolid(b)) {
          const meta = this.world.getMeta ? this.world.getMeta(bx, by, bz) : 0;
          this.world.setBlock(hx, hy, hz, b, meta);
          this.world.setBlock(bx, by, bz, BLOCK.AIR);
        }
      }
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
    // 0. One-time adoption of torches from saves that predate the torch
    // registry (torches only exist as player edits, so scanning edits is
    // complete and cheap).
    if (!this._torchesScanned) this._scanTorches();

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

    // 3. Torches (NOT gates): every torch samples its support block using the
    // PREVIOUS tick's flags, then all changes commit at once (double buffer).
    // The one-tick settle per stage is what makes torch ring clocks oscillate.
    if (this.torches.size) {
      const flips = [];
      for (const [key, t] of this.torches) {
        const [x, y, z] = key.split(',').map(Number);
        const block = this.world.getBlock(x, y, z);
        if (block !== BLOCK.REDSTONE_TORCH && block !== BLOCK.REDSTONE_TORCH_OFF) {
          this.torches.delete(key); // block vanished outside our hooks
          continue;
        }
        const off = this.isPowered(x, y - 1, z); // input = the supporting block
        if (off !== t.off) flips.push([key, x, y, z, off]);
      }
      for (const [key, x, y, z, off] of flips) {
        this.torches.get(key).off = off;
        this.world.setBlock(x, y, z, off ? BLOCK.REDSTONE_TORCH_OFF : BLOCK.REDSTONE_TORCH);
        this._dirty.add(key);
      }
    }

    // 4. Observers: a watched-cell change fires a single-tick pulse out the
    // back on the NEXT tick; the tick after that it drops again. A change
    // arriving mid-pulse retriggers after the pulse ends.
    for (const [key, o] of this.observers) {
      if (o.out) {
        o.out = false;
        this._dirty.add(key);
      } else if (o.fire) {
        o.fire = false;
        o.out = true;
        this._dirty.add(key);
      }
    }

    // 5. Repeaters: sample input, apply delayed output.
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

    // 6. Comparators: out = rear vs max(sides), recomputed every tick from
    // the PREVIOUS tick's stored outputs (so comparator chains settle one
    // tick per stage and feedback loops can't recurse). Container fill behind
    // the comparator counts as the rear signal via the injected callback.
    for (const [key, c] of this.comparators) {
      const [x, y, z] = key.split(',').map(Number);
      if (this.world.getBlock(x, y, z) !== BLOCK.COMPARATOR) continue;
      const rear = this._signalAt(x - c.dir[0], y, z - c.dir[2], x, y, z, true);
      const sx = c.dir[2], sz = c.dir[0]; // perpendicular (side) axis
      const side = Math.max(
        this._signalAt(x + sx, y, z + sz, x, y, z, false),
        this._signalAt(x - sx, y, z - sz, x, y, z, false),
      );
      const out = c.subtract ? Math.max(0, rear - side) : (rear >= side ? rear : 0);
      if (out !== c.out) {
        c.out = out;
        this._dirty.add(key);
      }
    }

    // 7. Evaluate everything a power change can reach.
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

  // Adopt every redstone torch found in the world's player-edit maps (used
  // once, for saves from before the torch registry existed). Torches are never
  // part of worldgen, so the edit maps are the complete set.
  _scanTorches() {
    this._torchesScanned = true;
    const edits = this.world.edits;
    if (!edits || typeof edits.entries !== 'function') return;
    for (const [ck, inner] of edits) {
      const [cx, cz] = ck.split(',').map(Number);
      for (const [lk, v] of inner) {
        const id = decodeEditId(v);
        if (id !== BLOCK.REDSTONE_TORCH && id !== BLOCK.REDSTONE_TORCH_OFF) continue;
        const [lx, y, lz] = lk.split(',').map(Number);
        const key = keyOf(cx * CHUNK_SIZE + lx, y, cz * CHUNK_SIZE + lz);
        if (!this.torches.has(key)) {
          this.torches.set(key, { off: id === BLOCK.REDSTONE_TORCH_OFF });
          this._dirty.add(key);
        }
      }
    }
  }

  // ---- Observers ---------------------------------------------------------------

  // World -> redstone notification: the block id or meta at (x,y,z) changed.
  // O(1) unless an observer watches that exact cell (observerWatch map).
  onCellChanged(x, y, z) {
    const set = this.observerWatch.get(keyOf(x, y, z));
    if (!set) return;
    for (const key of set) {
      const o = this.observers.get(key);
      if (o) o.fire = true;
    }
  }

  _watchObserver(key, o) {
    const [x, y, z] = key.split(',').map(Number);
    const wk = keyOf(x + o.dir[0], y + o.dir[1], z + o.dir[2]);
    let set = this.observerWatch.get(wk);
    if (!set) { set = new Set(); this.observerWatch.set(wk, set); }
    set.add(key);
  }

  _unwatchObserver(key, o) {
    const [x, y, z] = key.split(',').map(Number);
    const wk = keyOf(x + o.dir[0], y + o.dir[1], z + o.dir[2]);
    const set = this.observerWatch.get(wk);
    if (!set) return;
    set.delete(key);
    if (set.size === 0) this.observerWatch.delete(wk);
  }

  // Analog signal available AT cell (x,y,z) as seen from (tx,ty,tz): a wire's
  // level, a source's emitted power, or (rear reads only) a container's fill
  // level through the injected containerSignal callback.
  _signalAt(x, y, z, tx, ty, tz, allowContainer) {
    if (this.world.getBlock(x, y, z) === BLOCK.REDSTONE_WIRE) {
      return this._wireLevel(x, y, z, new Set());
    }
    const direct = this.getPower(x, y, z, tx, ty, tz);
    if (direct > 0) return direct;
    if (allowContainer && this.containerSignal) {
      const fill = this.containerSignal(x, y, z);
      if (fill > 0) return Math.min(MAX_POWER, fill);
    }
    return 0;
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

  // opts.dir: orientation [dx,dy,dz] for pistons/repeaters/observers/
  // dispensers/droppers (from main.js).
  onBlockPlaced(x, y, z, blockId, opts = {}) {
    const key = keyOf(x, y, z);
    if (blockId === BLOCK.PISTON || blockId === BLOCK.STICKY_PISTON) {
      this.pistons.set(key, { dir: opts.dir || [1, 0, 0], extended: false });
    } else if (blockId === BLOCK.REPEATER) {
      const d = opts.dir || [1, 0, 0];
      this.repeaters.set(key, { dir: [d[0], 0, d[2]], delay: 1, out: false, timer: 0 });
    } else if (blockId === BLOCK.REDSTONE_TORCH) {
      this.torches.set(key, { off: false });
    } else if (blockId === BLOCK.OBSERVER) {
      const o = { dir: opts.dir || [1, 0, 0], out: false, fire: false };
      this.observers.set(key, o);
      this._watchObserver(key, o);
    } else if (blockId === BLOCK.DISPENSER || blockId === BLOCK.DROPPER) {
      this.dispensers.set(key, { dir: opts.dir || [1, 0, 0], powered: false });
    } else if (blockId === BLOCK.COMPARATOR) {
      const d = opts.dir || [1, 0, 0];
      this.comparators.set(key, { dir: [d[0], 0, d[2]], subtract: false, out: 0 });
    }
    if (blockId === BLOCK.REDSTONE_WIRE || blockId === BLOCK.REDSTONE_TORCH ||
        blockId === BLOCK.LEVER || blockId === BLOCK.REDSTONE_BLOCK ||
        blockId === BLOCK.PISTON || blockId === BLOCK.STICKY_PISTON ||
        blockId === BLOCK.REPEATER || blockId === BLOCK.OBSERVER ||
        blockId === BLOCK.DISPENSER || blockId === BLOCK.DROPPER ||
        blockId === BLOCK.NOTE_BLOCK || blockId === BLOCK.COMPARATOR ||
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
    if (blockId === BLOCK.REDSTONE_TORCH || blockId === BLOCK.REDSTONE_TORCH_OFF) {
      this.torches.delete(key);
    }
    if (blockId === BLOCK.OBSERVER) {
      const o = this.observers.get(key);
      if (o) this._unwatchObserver(key, o);
      this.observers.delete(key);
    }
    if (blockId === BLOCK.DISPENSER || blockId === BLOCK.DROPPER) this.dispensers.delete(key);
    if (blockId === BLOCK.COMPARATOR) this.comparators.delete(key);
    if (blockId === BLOCK.NOTE_BLOCK) this._notesPowered.delete(key);
    if (blockId === BLOCK.PISTON || blockId === BLOCK.STICKY_PISTON) {
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
        blockId === BLOCK.REDSTONE_TORCH || blockId === BLOCK.REDSTONE_TORCH_OFF ||
        blockId === BLOCK.REDSTONE_BLOCK || blockId === BLOCK.OBSERVER ||
        blockId === BLOCK.BUTTON || blockId === BLOCK.PRESSURE_PLATE ||
        blockId === BLOCK.REPEATER || blockId === BLOCK.REPEATER_ON ||
        blockId === BLOCK.COMPARATOR) {
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
    const torches = {};
    for (const [key, t] of this.torches) torches[key] = { off: t.off };
    const observers = {};
    for (const [key, o] of this.observers) observers[key] = { dir: o.dir, out: o.out };
    const dispensers = {};
    for (const [key, d] of this.dispensers) dispensers[key] = { dir: d.dir, powered: d.powered };
    const comparators = {};
    for (const [key, c] of this.comparators) comparators[key] = { dir: c.dir, subtract: c.subtract, out: c.out };
    return { levers, pistons, repeaters, torches, observers, dispensers, comparators, notes: [...this._notesPowered] };
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
    if (data.torches) {
      for (const key in data.torches) {
        this.torches.set(key, { off: !!data.torches[key].off });
      }
    }
    if (data.observers) {
      for (const key in data.observers) {
        const src = data.observers[key];
        const o = { dir: src.dir || [1, 0, 0], out: !!src.out, fire: false };
        this.observers.set(key, o);
        this._watchObserver(key, o);
      }
    }
    if (data.dispensers) {
      for (const key in data.dispensers) {
        const src = data.dispensers[key];
        this.dispensers.set(key, { dir: src.dir || [1, 0, 0], powered: !!src.powered });
      }
    }
    if (data.comparators) {
      for (const key in data.comparators) {
        const src = data.comparators[key];
        this.comparators.set(key, {
          dir: src.dir || [1, 0, 0],
          subtract: !!src.subtract,
          out: Math.max(0, Math.min(15, src.out || 0)),
        });
      }
    }
    if (Array.isArray(data.notes)) {
      for (const key of data.notes) this._notesPowered.add(key);
    }
    // Any pre-registry torches in the edit maps still get adopted on the first
    // tick (registered keys are skipped by the scan).
  }
}
