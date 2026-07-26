// =============================================================================
// main.js - Entry point: renderer, scene, world/player setup, pointer lock,
// hotbar, block interaction, HUD, survival UI, saving and the animation loop.
// =============================================================================

import * as THREE from 'three';
import { World } from './world.js';
import { NetherWorld } from './nether.js';
import { setWaterTime } from './chunk.js';
import { Player } from './player.js';
import { createAtlasTexture } from './textures.js';
import { DayNightCycle } from './sky.js';
import { saveGame, loadGame, clearGame } from './storage.js';
import { Survival } from './survival.js';
import { Inventory } from './inventory.js';
import { DropManager } from './drops.js';
import { Feedback } from './feedback.js';
import { MobManager } from './mobs.js';
import { MOB_DEFS, mobDef } from './mobdefs.js';
import { FurnaceManager } from './furnace.js';
import { ChestManager, CHEST_SLOTS } from './chest.js';
import { craftResult, craftCost, SHAPELESS, SHAPED_2, SHAPED_3 } from './crafting.js';
import { AchievementManager } from './achievements.js';
import { Minimap } from './minimap.js';
import { Weather } from './weather.js';
import { XPManager } from './xp.js';
import { Redstone } from './redstone.js';
import { ProjectileManager } from './projectiles.js';
import { MinecartManager } from './minecart.js';
import { BoatManager } from './boat.js';
import { FluidSim } from './fluids.js';
import { rollLoot } from './structures.js';
import { tryLightPortal, collapsePortalAt, buildArrivalPortal, findPortalNear } from './portal.js';
import { getMode, setMode, isCreative, setOnModeChange } from './gamemode.js';
import {
  biomeDef, itemDef, isBlockItem, foodValue, blockDrop, attackDamage,
  breakDuration, itemStackMax, armorPoints, armorSlotOf, fuelValue, smeltResult, SMELT_TIME,
  BLOCK, ITEM, BLOCKS, ITEMS, WORLD_SEED, ATLAS_COLS, ATLAS_ROWS,
  HOTBAR_SIZE, INVENTORY_SIZE, APPLE_DROP_CHANCE,
  SEED_DROP_CHANCE, WHEAT_GROW_CHANCE, CANE_GROW_CHANCE, toolKind, nextCropStage, isCropBlock,
  itemMaxDurability, placeableBlock, isClimbable, isSolid, isRail, stackEnchant,
  xpFromMining, xpFromKill, isEnchantable, ENCHANTMENTS, decodeEditId, blockModel,
  fluidLevel,
} from './config.js';

// ---- Renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ---- Scene / camera / lights ------------------------------------------------
const SKY = 0x87ceeb;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 45, 95);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const frustum = new THREE.Frustum();
const frustumMatrix = new THREE.Matrix4();
const chunkSphere = new THREE.Sphere(new THREE.Vector3(), 22);

const hemi = new THREE.HemisphereLight(0xffffff, 0x556b2f, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 0.75);
sun.position.set(50, 100, 30);
scene.add(sun);

const dayNight = new DayNightCycle(scene, sun, hemi);
const feedback = new Feedback(scene);

const SETTINGS_KEY = 'voxelcraft.settings.v1';
const settings = loadSettings();
feedback.volume = settings.volume;

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      volume: Number.isFinite(parsed.volume) ? Math.max(0, Math.min(1, parsed.volume)) : 1,
      sensitivity: Number.isFinite(parsed.sensitivity) ? Math.max(0.3, Math.min(1.8, parsed.sensitivity)) : 1,
      showHud: parsed.showHud !== false,
    };
  } catch (e) {
    return { volume: 1, sensitivity: 1, showHud: true };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('[settings] save failed:', e);
  }
}

// ---- World & player ---------------------------------------------------------
const atlas = createAtlasTexture();
const overworld = new World(scene, atlas);
let netherWorld = null;          // created lazily on first portal use / load
let world = overworld;           // the ACTIVE dimension

// Redstone side-tables key by position, so each dimension gets its own engine.
const redstoneOver = new Redstone(overworld);
let redstoneNether = null;
let redstone = redstoneOver;     // engine of the ACTIVE dimension

// Fluid sims mirror the redstone pattern: one per dimension, `fluids` is the
// engine of the ACTIVE dimension (rebinds in switchDimension).
function fluidEffect(x, y, z) {
  feedback.play('place');
  feedback.smokePuff(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5));
}
const fluidsOver = new FluidSim(overworld);
fluidsOver.onEffect = fluidEffect;
let fluidsNether = null;
let fluids = fluidsOver;         // sim of the ACTIVE dimension

function ensureNether() {
  if (!netherWorld) {
    netherWorld = new NetherWorld(scene, atlas);
    redstoneNether = new Redstone(netherWorld);
    redstoneNether.onIgnite = (x, y, z) => igniteTNT(x, y, z);
    redstoneNether.onSound = (name) => feedback.play(name);
    if (save && save.netherRedstone) redstoneNether.restore(save.netherRedstone);
    fluidsNether = new FluidSim(netherWorld);
    fluidsNether.onEffect = fluidEffect;
    if (save && save.netherFluids) fluidsNether.restore(save.netherFluids);
  }
  return netherWorld;
}

const SAVE_VERSION = 11;
// loadGame() already ran the storage.js migration chain, so any accepted save
// is in the current format regardless of the version it was written with.
const save = await loadGame();
const hasSave = !!(save && save.version === SAVE_VERSION && save.seed === WORLD_SEED);
if (hasSave) setMode(save.mode || 'survival');
if (hasSave && save.edits) overworld.loadEdits(save.edits);
if (hasSave && save.netherEdits) ensureNether().loadEdits(save.netherEdits);
if (hasSave && save.dimension === 'nether') {
  world = ensureNether();
  redstone = redstoneNether;
  fluids = fluidsNether;
  dayNight.setNether(true);
}
if (hasSave && typeof save.time === 'number') dayNight.t = save.time;

// Per-dimension entity buckets keyed by dimension id: drops and minecarts of
// every INACTIVE dimension are parked here and swapped on portal travel (the
// active dimension's entities live in the drops/minecarts managers instead).
const parkedByDim = new Map();
if (hasSave && save.parked) {
  for (const dimId in save.parked) parkedByDim.set(dimId, save.parked[dimId]);
}
// Where the player last stood in each dimension (portal return points).
let portalCooldown = 0;
let portalTimer = 0;

const player = new Player(camera, renderer.domElement, world);
player.controls.pointerSpeed = settings.sensitivity;
if (hasSave && save.player) {
  player.restore(save.player);
} else {
  const spawn = world.findSpawn(8, 8);
  player.spawn(spawn.x + 0.5, spawn.h + 1 + 1.62 + 0.1, spawn.z + 0.5);
}
scene.add(player.getObject());
world.update(player.getObject().position);

const survival = new Survival(hasSave ? save.survival : null);

// Survival inventory. New games get a small starter kit so the player can build
// and reach the first crafting recipes without grinding.
const inventory = new Inventory(hasSave ? save.inventory : null);
if (!hasSave) {
  inventory.add(BLOCK.WOOD, 8);
  inventory.add(BLOCK.DIRT, 16);
}
let drops = new DropManager(scene, world, atlas, hasSave ? save.drops : null);
const mobs = new MobManager(scene, world, hasSave ? save.mobs : null);
const furnaces = new FurnaceManager(hasSave ? save.furnaces : null);
const chests = new ChestManager(hasSave ? save.chests : null);
const achievements = new AchievementManager(hasSave ? save.achievements : null);
const minimap = new Minimap(document.body);
const weather = new Weather(scene);
if (hasSave && save.weather) weather.restore(save.weather);
const xpManager = new XPManager(scene, hasSave ? save.xp : null);
if (hasSave && save.redstone) redstoneOver.restore(save.redstone);
if (hasSave && save.fluids) fluidsOver.restore(save.fluids);
const projectiles = new ProjectileManager(scene, world);
let minecarts = new MinecartManager(scene, world, hasSave ? save.minecarts : null);
let ridingCart = null;
let boats = new BoatManager(scene, world, hasSave ? save.boats : null);
let ridingBoat = null;
let ridingHorse = null;   // a saddled horse mob currently carrying the player

// Skeletons fire real arrow entities the player can see and dodge.
mobs.onShoot = (from, to) => {
  const dir = to.clone().sub(from);
  dir.x += (Math.random() - 0.5) * 0.8;
  dir.y += (Math.random() - 0.5) * 0.4;
  dir.z += (Math.random() - 0.5) * 0.8;
  dir.normalize();
  projectiles.shootArrow(from, dir, 17, 3, false);
  feedback.play('bowShoot');
};
// Fire imps and the boss lob fireballs through the same projectile system.
mobs.onShootFire = (from, to, damage) => {
  const dir = to.clone().sub(from).normalize();
  projectiles.shootFireball(from, dir, 11, damage);
  feedback.play('fireShoot');
};
// Witch flasks arc like arrows but shatter on impact (real poison waits for
// the Phase 7 effect system; for now the flask deals direct damage).
mobs.onShootFlask = (from, to) => {
  const dir = to.clone().sub(from);
  dir.y += 0.25; // slight lob
  dir.normalize();
  projectiles.shootFlask(from, dir, 13, 3);
  feedback.play('bowShoot');
};
// Creeper blasts and redstone-triggered TNT run through the shared explosion.
mobs.onExplode = (center, radius) => explodeAt(center, radius);
// Mob visual/audio effects (teleports, breeding hearts, failed taming).
mobs.onEffect = (name, pos) => {
  if (name === 'hearts') feedback.hearts(pos);
  else if (name === 'warp') { feedback.warpBurst(pos); feedback.play('warp'); }
  else if (name === 'smoke') feedback.smokePuff(pos);
};
mobs.onWolfBite = (dmg) => survival.damage(dmg, 'Wolf bite');
mobs.onKillByWolf = (result) => handleMobKill(result);
// Environmental deaths (fall damage) drop loot through the same path.
mobs.onEnvKill = (result) => handleMobKill(result);
mobs.onBreed = () => achievements.trigger({ type: 'breed' });
redstoneOver.onIgnite = (x, y, z) => igniteTNT(x, y, z);
redstoneOver.onSound = (name) => feedback.play(name);

// Per-block containers (furnaces/chests) key by position; the nether prefixes
// its keys so the two dimensions can't collide on the same coordinates.
function dimKey(x, y, z) {
  return world.dim.editKeyPrefix + `${x},${y},${z}`;
}
function parseDimKey(key) {
  const isNether = key.startsWith('N|');
  const [x, y, z] = (isNether ? key.slice(2) : key).split(',').map(Number);
  return { isNether, x, y, z };
}

// ---- Explosions & TNT fuses ---------------------------------------------------
const tntFuses = [];
const fuseKeys = new Set();
const fuseGeo = new THREE.BoxGeometry(1.04, 1.04, 1.04);

function igniteTNT(x, y, z, fuseTime = 1.5) {
  const key = `${x},${y},${z}`;
  if (fuseKeys.has(key)) return;
  if (world.getBlock(x, y, z) !== BLOCK.TNT) return;
  fuseKeys.add(key);
  const mesh = new THREE.Mesh(
    fuseGeo,
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  scene.add(mesh);
  tntFuses.push({ x, y, z, key, t: fuseTime, mesh });
  feedback.play('fuse');
}

function updateFuses(dt) {
  for (let i = tntFuses.length - 1; i >= 0; i--) {
    const f = tntFuses[i];
    f.t -= dt;
    f.mesh.material.opacity = Math.sin(f.t * 18) > 0 ? 0.55 : 0.05;
    if (f.t <= 0) {
      scene.remove(f.mesh);
      f.mesh.material.dispose();
      tntFuses.splice(i, 1);
      fuseKeys.delete(f.key);
      if (world.getBlock(f.x, f.y, f.z) === BLOCK.TNT) {
        world.setBlock(f.x, f.y, f.z, BLOCK.AIR);
        fluids.wake(f.x, f.y, f.z);
        explodeAt(new THREE.Vector3(f.x + 0.5, f.y + 0.5, f.z + 0.5), 3);
      }
    }
  }
}

// Shared mob-kill bookkeeping: loot, XP orb and the kill achievement.
function handleMobKill(result) {
  const dropPos = result.position.clone();
  dropPos.y += 0.8;
  if (result.drops) for (const d of result.drops) drops.spawn(d.id, d.count, dropPos);
  // XP comes from the mob registry (damageMob attaches it); config.xpFromKill
  // stays as the fallback for results that predate the registry field.
  xpManager.spawnOrb(dropPos, result.xp != null ? result.xp : xpFromKill(result.type));
  achievements.trigger({ type: 'kill', hostile: mobs.isHostile(result.type), mob: result.type });
  if (result.type === 'boss') {
    achievements.trigger({ type: 'boss' });
    feedback.play('bossRoar');
    feedback.explosionBurst(result.position, 4);
    survival._setMessage('The Nether Overlord has fallen!', 5);
  }
}

// ---- Dimension travel ---------------------------------------------------------

// Park the active dimension's meshes and loose entities, then activate
// `target` and rebind every world-holding subsystem to it.
function switchDimension(target) {
  if (target === world) return;
  // Hide the old dimension's chunk meshes (data stays; remeshed on return).
  for (const [, entry] of world.chunks) {
    if (entry.mesh) {
      scene.remove(entry.mesh);
      entry.chunk.dispose();
      entry.mesh = null;
    }
  }
  // Park loose entities per dimension and restore the target's bucket.
  parkedByDim.set(world.dim.id, {
    drops: drops.serialize(),
    minecarts: minecarts.serialize(),
    boats: boats.serialize(),
  });
  const parked = parkedByDim.get(target.dim.id) || { drops: null, minecarts: null, boats: null };
  parkedByDim.delete(target.dim.id);
  const parkedDrops = parked.drops;
  const parkedCarts = parked.minecarts;
  const parkedBoats = parked.boats;
  for (let i = drops.drops.length - 1; i >= 0; i--) drops.removeAt(i);
  for (let i = minecarts.carts.length - 1; i >= 0; i--) minecarts.remove(minecarts.carts[i]);
  for (let i = boats.boats.length - 1; i >= 0; i--) boats.remove(boats.boats[i]);
  // Mobs don't travel between dimensions.
  for (let i = mobs.mobs.length - 1; i >= 0; i--) mobs.removeAt(i);
  ridingCart = null;
  ridingBoat = null;
  ridingHorse = null;
  player.riding = null;

  world = target;
  player.world = world;
  mobs.world = world;
  redstone = target === overworld ? redstoneOver : redstoneNether;
  fluids = target === overworld ? fluidsOver : fluidsNether;
  projectiles.world = world;
  drops = new DropManager(scene, world, atlas, parkedDrops);
  minecarts = new MinecartManager(scene, world, parkedCarts);
  boats = new BoatManager(scene, world, parkedBoats);
  dayNight.setNether(!!world.skyless);
  if (world.skyless) {
    weather.active = false;
    weather.intensity = 0;
    weather._clearParticles();
    feedback.setRainVolume(0);
  }
}

// Standing inside a portal block long enough carries the player across.
// Nether coordinates are 1:4 overworld coordinates.
function travelThroughPortal() {
  const p = player.getObject().position;
  const goingToNether = !world.skyless;
  const target = goingToNether ? ensureNether() : overworld;
  const tx = goingToNether ? Math.floor(p.x / 4) : Math.floor(p.x * 4);
  const tz = goingToNether ? Math.floor(p.z / 4) : Math.floor(p.z * 4);

  switchDimension(target);

  // Prefer an existing portal near the destination.
  const probeY = goingToNether ? target.landingHeight(tx, tz) : target.columnHeight(tx, tz);
  let dest = findPortalNear(target, tx, probeY, tz, 12);
  if (!dest) {
    const groundY = goingToNether
      ? target.landingHeight(tx, tz) + 1
      : Math.max(target.columnHeight(tx, tz) + 1, 22);
    dest = buildArrivalPortal(target, tx, groundY, tz);
  }
  player.spawn(dest.x, dest.y + 1.62 + 0.1, dest.z);
  world.update(player.getObject().position);
  portalCooldown = 4;
  feedback.play('portal');
  feedback.warpBurst(player.getObject().position.clone());
  if (goingToNether) achievements.trigger({ type: 'portal' });
  survival._setMessage(goingToNether ? 'Entering the Nether...' : 'Returning home...', 3);
  scheduleSave();
}

// One shared explosion used by creepers and TNT: clears blocks in bulk (one
// mesh rebuild per chunk), rolls a drop chance per block, spills furnace/chest
// contents, chains nearby TNT with short fuses and damages player and mobs.
function explodeAt(center, radius) {
  const cx = Math.floor(center.x), cy = Math.floor(center.y), cz = Math.floor(center.z);
  const edits = [];
  const r = Math.ceil(radius);
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dy * dy + dz * dz > radius * radius) continue;
        const bx = cx + dx, by = cy + dy, bz = cz + dz;
        const id = world.getBlock(bx, by, bz);
        if (id === BLOCK.AIR || id === BLOCK.WATER || id === BLOCK.BEDROCK) continue;
        if (id === BLOCK.TNT) {
          igniteTNT(bx, by, bz, 0.25 + Math.random() * 0.5);
          continue;
        }
        const key = `${bx},${by},${bz}`;
        const dropPos = new THREE.Vector3(bx + 0.5, by + 0.55, bz + 0.5);
        if (id === BLOCK.FURNACE || id === BLOCK.FURNACE_LIT) {
          for (const d of furnaces.remove(dimKey(bx, by, bz))) drops.spawn(d.id, d.count, dropPos);
        } else if (id === BLOCK.CHEST) {
          for (const d of chests.remove(dimKey(bx, by, bz))) drops.spawn(d.id, d.count, dropPos);
          if (world.structureLoot) world.structureLoot.delete(key);
        } else if (id === BLOCK.LEVER || id === BLOCK.BUTTON || id === BLOCK.REPEATER ||
                   id === BLOCK.REPEATER_ON || id === BLOCK.PISTON || id === BLOCK.REDSTONE_WIRE ||
                   id === BLOCK.REDSTONE_TORCH || id === BLOCK.REDSTONE_BLOCK) {
          redstone.onBlockRemoved(bx, by, bz, id);
        } else if (id === BLOCK.MOB_SPAWNER && world.structureSpawners) {
          world.structureSpawners.delete(key);
        }
        if (Math.random() < 0.3) {
          for (const d of blockDrop(id)) drops.spawn(d.id, d.count, dropPos);
        }
        edits.push({ x: bx, y: by, z: bz, id: BLOCK.AIR });
      }
    }
  }
  world.setBlocks(edits);
  // Cleared blocks may have opened paths for nearby liquids.
  for (const e of edits) fluids.wake(e.x, e.y, e.z);

  const pd = player.getObject().position.distanceTo(center);
  if (pd < radius + 2) {
    survival.damage(Math.max(1, Math.round(14 * (1 - pd / (radius + 3)))), 'Explosion');
  }
  for (let i = mobs.mobs.length - 1; i >= 0; i--) {
    const m = mobs.mobs[i];
    const md = m.mesh.position.distanceTo(center);
    if (md < radius + 2) {
      const result = mobs.damageMob(m, Math.max(1, Math.round(14 * (1 - md / (radius + 3)))), center);
      if (result && result.killed) handleMobKill(result);
    }
  }
  feedback.play('explode');
  feedback.explosionBurst(center, radius);
  scheduleSave();
}
const achievementContainer = document.createElement('div');
achievementContainer.id = 'achievements';
achievementContainer.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:60;pointer-events:none;';
document.body.appendChild(achievementContainer);

// ---- Pointer lock / overlay -------------------------------------------------
const overlay = document.getElementById('overlay');
let settingsOpen = false;
function startGame() {
  feedback.ensureAudio();
  if (survival.alive) player.controls.lock();
}
overlay.addEventListener('click', startGame);
// Enter also starts the game while the "click to play" overlay is showing.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && !overlay.classList.contains('hidden')) startGame();
});
player.controls.addEventListener('lock', () => overlay.classList.add('hidden'));
player.controls.addEventListener('unlock', () => {
  if (!invOpen && !furnaceOpen && !chestOpen && !settingsOpen && !enchantOpen && !tradeOpen) {
    overlay.classList.remove('hidden');
  }
});

// ---- Item icons -------------------------------------------------------------
// Reuse the procedurally painted atlas canvas as a CSS sprite sheet. Each slot
// is sized to one tile; background-position selects the tile by (col,row).
const atlasURL = atlas.image.toDataURL();

function iconStyle(el, id, px) {
  if (id == null) {
    el.style.backgroundImage = 'none';
    return;
  }
  const tile = itemDef(id).tile;
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  el.style.backgroundImage = `url(${atlasURL})`;
  el.style.backgroundSize = `${ATLAS_COLS * px}px ${ATLAS_ROWS * px}px`;
  el.style.backgroundPosition = `-${col * px}px -${row * px}px`;
}

const ROMAN = ['', 'I', 'II', 'III'];

function stackTip(stack) {
  if (!stack) return '';
  const name = itemDef(stack.id).name;
  let tip = stack.count > 1 ? `${name}\nx${stack.count}` : name;
  if (stack.enchantments) {
    for (const [key, lvl] of Object.entries(stack.enchantments)) {
      const e = ENCHANTMENTS[key];
      if (e && lvl > 0) tip += `\n${e.name} ${ROMAN[Math.min(3, lvl)]}`;
    }
  }
  const maxDur = itemMaxDurability(stack.id);
  if (maxDur > 0 && stack.durability != null && stack.durability < maxDur) {
    tip += `\n${stack.durability}/${maxDur}`;
  }
  return tip;
}

function setTooltip(el, stack) {
  const tip = stackTip(stack);
  if (tip) el.dataset.tip = tip;
  else delete el.dataset.tip;
}

const tooltipEl = document.getElementById('tooltip');
document.addEventListener('mousemove', (e) => {
  const target = e.target instanceof Element ? e.target.closest('[data-tip]') : null;
  const tip = target ? target.dataset.tip : '';
  if (!tip) {
    tooltipEl.style.display = 'none';
    return;
  }
  tooltipEl.textContent = tip;
  tooltipEl.style.display = 'block';
  const pad = 14;
  const rect = tooltipEl.getBoundingClientRect();
  const x = Math.min(window.innerWidth - rect.width - 8, e.clientX + pad);
  const y = Math.min(window.innerHeight - rect.height - 8, e.clientY + pad);
  tooltipEl.style.left = `${Math.max(8, x)}px`;
  tooltipEl.style.top = `${Math.max(8, y)}px`;
});
document.addEventListener('mouseleave', () => { tooltipEl.style.display = 'none'; });

// ---- Hotbar -----------------------------------------------------------------
const hotbarEl = document.getElementById('hotbar');
let selected = 0;

// Bow charge state (declared early: setSelected below cancels a draw).
let bowCharging = false;
let bowCharge = 0;
const BOW_CHARGE_TIME = 1.0;
const BASE_FOV = 70;

function cancelBowCharge() {
  if (!bowCharging) return;
  bowCharging = false;
  bowCharge = 0;
  camera.fov = BASE_FOV;
  camera.updateProjectionMatrix();
}

const hotbarSlots = [];
for (let i = 0; i < HOTBAR_SIZE; i++) {
  const div = document.createElement('div');
  div.className = 'slot';
  div.innerHTML = `<span class="num">${i + 1}</span><span class="count"></span>`;
  hotbarEl.appendChild(div);
  hotbarSlots.push(div);
}

const ICON_PX = 40; // tile render size inside a 46px hotbar / 44px inventory cell

function refreshHotbar() {
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const el = hotbarSlots[i];
    const stack = inventory.get(i);
    iconStyle(el, stack ? stack.id : null, ICON_PX);
    setTooltip(el, stack);
    el.querySelector('.count').textContent = stack && stack.count > 1 ? stack.count : '';
    el.classList.toggle('active', i === selected);
    el.classList.toggle('enchanted', !!(stack && stack.enchantments));
    // Durability bar
    let durBar = el.querySelector('.durbar');
    const maxDur = stack ? itemMaxDurability(stack.id) : 0;
    if (maxDur > 0 && stack.durability != null && stack.durability < maxDur) {
      if (!durBar) {
        durBar = document.createElement('div');
        durBar.className = 'durbar';
        el.appendChild(durBar);
      }
      const ratio = stack.durability / maxDur;
      const r = Math.round(255 * (1 - ratio));
      const g = Math.round(255 * ratio);
      durBar.style.cssText = `position:absolute;bottom:2px;left:4px;right:4px;height:2px;background:rgb(${r},${g},0);`;
    } else if (durBar) {
      durBar.remove();
    }
  }
}

function setSelected(i) {
  selected = ((i % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
  cancelBowCharge();
  refreshHotbar();
}
setSelected(hasSave && typeof save.slot === 'number' ? save.slot : 0);

// ---- Save / load ------------------------------------------------------------
let saveToast = 0;

function gatherState() {
  return {
    version: SAVE_VERSION,
    seed: WORLD_SEED,
    time: dayNight.t,
    mode: getMode(),
    slot: selected,
    dimension: world.dim.id,
    player: player.serialize(),
    edits: overworld.serializeEdits(),
    netherEdits: netherWorld ? netherWorld.serializeEdits() : undefined,
    parked: Object.fromEntries(parkedByDim),
    survival: survival.serialize(),
    inventory: inventory.serialize(),
    drops: drops.serialize(),
    minecarts: minecarts.serialize(),
    boats: boats.serialize(),
    mobs: mobs.serialize(),
    furnaces: furnaces.serialize(),
    chests: chests.serialize(),
    achievements: achievements.serialize(),
    weather: weather.serialize(),
    xp: xpManager.serialize(),
    redstone: redstoneOver.serialize(),
    netherRedstone: redstoneNether ? redstoneNether.serialize() : undefined,
    fluids: fluidsOver.serialize(),
    netherFluids: fluidsNether ? fluidsNether.serialize() : undefined,
  };
}

async function doSave() {
  if (await saveGame(gatherState())) saveToast = 1.2;
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 1200);
}

setInterval(doSave, 20000);
window.addEventListener('beforeunload', () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveGame(gatherState());
});

window.addEventListener('keydown', async (e) => {
  // Typing into a text field (creative item filter): don't trigger hotkeys.
  if (e.target instanceof HTMLInputElement && e.target.type === 'text') {
    if (e.code === 'Escape') {
      e.target.blur();
      if (invOpen) closeInventory();
    }
    return;
  }
  if (e.code === 'F4') { e.preventDefault(); toggleGameMode(); return; }
  if (e.code === 'KeyO') { e.preventDefault(); toggleSettings(); return; }
  if (settingsOpen) {
    if (e.code === 'Escape') closeSettings();
    return;
  }
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= HOTBAR_SIZE) setSelected(n - 1);
  if (e.code === 'KeyE') { e.preventDefault(); toggleInventory(); }
  if (e.code === 'KeyM') minimap.toggle();
  if (e.code === 'KeyJ') { e.preventDefault(); toggleAchievements(); }
  if (e.code === 'Escape' && achievementsOpen) toggleAchievements();
  if (e.code === 'Escape' && invOpen) closeInventory();
  if (e.code === 'Escape' && furnaceOpen) closeFurnace();
  if (e.code === 'Escape' && chestOpen) closeChest();
  if (e.code === 'Escape' && enchantOpen) closeEnchantScreen();
  if (e.code === 'Escape' && tradeOpen) closeTradeScreen();
  if (e.code === 'KeyT') dayNight.skip(1 / 24);
  if (e.code === 'KeyP') dayNight.togglePause();
  if (e.code === 'KeyK') {
    if (confirm('Reset the world? This permanently deletes your saved changes.')) {
      await clearGame();
      location.reload();
    }
  }
});

window.addEventListener('wheel', (e) => {
  if (!player.controls.isLocked || !survival.alive) return;
  setSelected(selected + (e.deltaY > 0 ? 1 : -1));
});

// ---- Targeted-block highlight ----------------------------------------------
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 }),
);
highlight.visible = false;
scene.add(highlight);

function createCrackTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(0,0,0,0.82)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  const paths = [
    [[31, 5], [27, 18], [34, 29], [28, 42], [30, 59]],
    [[28, 18], [13, 12], [7, 22]],
    [[34, 29], [51, 24], [58, 31]],
    [[28, 42], [14, 49], [7, 58]],
    [[31, 42], [45, 51], [53, 62]],
  ];
  for (const path of paths) {
    ctx.beginPath();
    ctx.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

const crackMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1.008, 1.008, 1.008),
  new THREE.MeshBasicMaterial({
    map: createCrackTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  }),
);
crackMesh.visible = false;
scene.add(crackMesh);

// ---- Block interaction ------------------------------------------------------
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
// Interaction rays also hit open door halves (non-solid) so they can be
// closed with a right click or broken by mining.
const INTERACT_HIT = (id) => isSolid(id) || id === BLOCK.DOOR_BOTTOM_OPEN || id === BLOCK.DOOR_TOP_OPEN;
function castFromCamera() {
  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_dir);
  return world.raycastVoxel(_origin, _dir, 6, INTERACT_HIT);
}
// Liquid-aware variant for buckets and boat placement: the default hit test
// skips WATER/LAVA, but scooping/launching needs to target the liquid itself.
const LIQUID_HIT = (id) => INTERACT_HIT(id) || id === BLOCK.WATER || id === BLOCK.LAVA;
function castFromCameraLiquid() {
  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_dir);
  return world.raycastVoxel(_origin, _dir, 6, LIQUID_HIT);
}

function intersectsPlayer(bx, by, bz) {
  const pos = player.getObject().position;
  const fx = pos.x;
  const fy = pos.y - 1.62;
  const fz = pos.z;
  return (
    bx + 1 > fx - 0.3 && bx < fx + 0.3 &&
    by + 1 > fy && by < fy + 1.8 &&
    bz + 1 > fz - 0.3 && bz < fz + 0.3
  );
}

const breakProgressEl = document.getElementById('breakProgress');
const breakProgressFillEl = breakProgressEl.querySelector('.fill');
let primaryDown = false;
let mining = null;
let attackCooldown = 0;
const ATTACK_RANGE = 4.2;
const ATTACK_COOLDOWN = 0.45;

function hitKey(hit) {
  return hit ? `${hit.x},${hit.y},${hit.z}` : '';
}

function tryAttackMob() {
  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_dir);
  const mobHit = mobs.raycast(_origin, _dir, ATTACK_RANGE);
  if (!mobHit) return false;

  const blockHit = world.raycastVoxel(_origin, _dir, ATTACK_RANGE);
  if (blockHit && blockHit.distance < mobHit.distance) return false;
  if (attackCooldown > 0) return true;

  const heldStack = inventory.get(selected);
  const heldId = heldStack ? heldStack.id : null;
  const damage = attackDamage(heldId) + 2 * stackEnchant(heldStack, 'sharpness');
  const result = mobs.damageMob(mobHit.mob, damage, player.getObject().position);
  // Tamed wolves join in on whatever their owner is fighting.
  if (!result || !result.killed) mobs.playerTarget = mobHit.mob;
  else mobs.playerTarget = null;
  attackCooldown = ATTACK_COOLDOWN;
  consumeDurability(selected, 2);
  feedback.play(result && result.killed ? 'mobDeath' : 'hit');

  if (result && result.killed) handleMobKill(result);
  scheduleSave();
  return true;
}

function consumeDurability(slot, amount = 1) {
  if (isCreative()) return; // tools never wear in creative
  const stack = inventory.get(slot);
  if (!stack) return;
  const maxDur = itemMaxDurability(stack.id);
  if (maxDur <= 0) return;
  // Unbreaking: level N skips durability loss N times out of N+1.
  const unb = stackEnchant(stack, 'unbreaking');
  if (unb > 0 && Math.random() < unb / (unb + 1)) return;
  if (stack.durability == null) stack.durability = maxDur;
  stack.durability -= amount;
  if (stack.durability <= 0) {
    inventory.slots[slot] = null;
    feedback.play('break');
  }
  refreshHotbar();
}

function breakBlock(hit, toolId = null) {
  const id = world.getBlock(hit.x, hit.y, hit.z);
  // Creative breaks everything (even bedrock); portal blocks are never mined
  // directly (beginMining filters them; breaking frame obsidian collapses them).
  const creative = isCreative();
  if (id === BLOCK.BEDROCK && !creative) return;
  const center = new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
  fluids.wake(hit.x, hit.y, hit.z); // adjacent liquids may flow into the gap
  feedback.burst(id, center);
  feedback.play('break');
  achievements.trigger({ type: 'mine', block: id });
  const dropPos = new THREE.Vector3(hit.x + 0.5, hit.y + 0.55, hit.z + 0.5);
  // Creative: blocks vanish with no drops and no mining XP (vanilla behavior).
  // Container CONTENTS still spill below so items are never silently destroyed.
  if (!creative) {
    const xpGain = xpFromMining(id);
    if (xpGain > 0) xpManager.spawnOrb(center, xpGain);
    for (const d of blockDrop(id, toolId)) drops.spawn(d.id, d.count, dropPos);
    if (id === BLOCK.LEAVES && hash01(hit.x, hit.y, hit.z) < APPLE_DROP_CHANCE) {
      drops.spawn(ITEM.APPLE, 1, dropPos);
    }
    if (id === BLOCK.TALL_GRASS && hash01(hit.x, hit.y, hit.z) < SEED_DROP_CHANCE) {
      drops.spawn(ITEM.WHEAT_SEEDS, 1, dropPos);
    }
  }
  // Breaking the support block under a crop pops the crop too.
  const above = world.getBlock(hit.x, hit.y + 1, hit.z);
  if (isCropBlock(above)) {
    world.setBlock(hit.x, hit.y + 1, hit.z, BLOCK.AIR);
    if (!creative) {
      const cropPos = new THREE.Vector3(hit.x + 0.5, hit.y + 1.55, hit.z + 0.5);
      for (const d of blockDrop(above)) drops.spawn(d.id, d.count, cropPos);
    }
  }
  // Sugar cane: breaking a segment (or its support block) pops every segment above.
  for (let caneY = hit.y + 1; world.getBlock(hit.x, caneY, hit.z) === BLOCK.SUGAR_CANE; caneY++) {
    world.setBlock(hit.x, caneY, hit.z, BLOCK.AIR);
    if (!creative) drops.spawn(BLOCK.SUGAR_CANE, 1, new THREE.Vector3(hit.x + 0.5, caneY + 0.55, hit.z + 0.5));
  }
  if (id === BLOCK.FURNACE || id === BLOCK.FURNACE_LIT) {
    for (const d of furnaces.remove(dimKey(hit.x, hit.y, hit.z))) drops.spawn(d.id, d.count, dropPos);
  }
  if (id === BLOCK.CHEST) {
    for (const d of chests.remove(dimKey(hit.x, hit.y, hit.z))) drops.spawn(d.id, d.count, dropPos);
    // A generated loot chest destroyed unopened loses its loot.
    if (world.structureLoot) world.structureLoot.delete(`${hit.x},${hit.y},${hit.z}`);
  }
  // Mining a spawner disables it.
  if (id === BLOCK.MOB_SPAWNER && world.structureSpawners) {
    world.structureSpawners.delete(`${hit.x},${hit.y},${hit.z}`);
  }
  // Breaking frame obsidian collapses any portal it held.
  if (id === BLOCK.OBSIDIAN) {
    const removed = collapsePortalAt(world, hit.x, hit.y, hit.z);
    if (removed.length) feedback.play('warp');
  }
  // Remove the paired half of doors and beds so no floating halves remain.
  if (id === BLOCK.DOOR_BOTTOM || id === BLOCK.DOOR_BOTTOM_OPEN) {
    const above = world.getBlock(hit.x, hit.y + 1, hit.z);
    if (above === BLOCK.DOOR_TOP || above === BLOCK.DOOR_TOP_OPEN) world.setBlock(hit.x, hit.y + 1, hit.z, BLOCK.AIR);
  } else if (id === BLOCK.DOOR_TOP || id === BLOCK.DOOR_TOP_OPEN) {
    const below = world.getBlock(hit.x, hit.y - 1, hit.z);
    if (below === BLOCK.DOOR_BOTTOM || below === BLOCK.DOOR_BOTTOM_OPEN) world.setBlock(hit.x, hit.y - 1, hit.z, BLOCK.AIR);
  } else if (id === BLOCK.BED_HEAD || id === BLOCK.BED_FOOT) {
    const other = id === BLOCK.BED_HEAD ? BLOCK.BED_FOOT : BLOCK.BED_HEAD;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (world.getBlock(hit.x + dx, hit.y, hit.z + dz) === other) {
        world.setBlock(hit.x + dx, hit.y, hit.z + dz, BLOCK.AIR);
        break;
      }
    }
  }
  redstone.onBlockRemoved(hit.x, hit.y, hit.z, id);
  scheduleSave();
}

function cancelMining() {
  mining = null;
  breakProgressEl.classList.remove('active');
  breakProgressFillEl.style.transform = 'scaleX(0)';
  crackMesh.visible = false;
  crackMesh.material.opacity = 0;
}

function updateCrack(hit, progress) {
  crackMesh.visible = true;
  crackMesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  crackMesh.material.opacity = 0.12 + progress * 0.58;
}

const CREATIVE_BREAK_TIME = 0.05;

function beginMining(hit) {
  if (!hit) return cancelMining();
  const id = world.getBlock(hit.x, hit.y, hit.z);
  const heldStack = inventory.get(selected);
  const toolId = heldStack ? heldStack.id : null;
  // Creative: near-instant break for everything (bedrock included) EXCEPT
  // portal blocks — punching a portal out of existence leaves odd half-portal
  // state, so the frame must be broken instead (same as survival).
  let duration;
  if (isCreative()) {
    if (id === BLOCK.NETHER_PORTAL) return cancelMining();
    duration = CREATIVE_BREAK_TIME;
  } else {
    duration = breakDuration(id, toolId, stackEnchant(heldStack, 'efficiency'));
    if (!Number.isFinite(duration)) return cancelMining();
  }
  mining = { key: hitKey(hit), id, toolId, elapsed: 0, duration, hit: { ...hit } };
  breakProgressEl.classList.add('active');
  updateCrack(hit, 0);
}

function updateMining(dt) {
  if (!primaryDown || invOpen || furnaceOpen || chestOpen || !player.controls.isLocked || !survival.alive) {
    cancelMining();
    return;
  }
  const hit = castFromCamera();
  if (!hit) return cancelMining();

  const heldStack = inventory.get(selected);
  const toolId = heldStack ? heldStack.id : null;
  const id = world.getBlock(hit.x, hit.y, hit.z);
  if (!mining || mining.key !== hitKey(hit) || mining.id !== id || mining.toolId !== toolId) {
    beginMining(hit);
    return;
  }

  mining.elapsed += dt;
  const progress = Math.min(1, mining.elapsed / mining.duration);
  breakProgressFillEl.style.transform = `scaleX(${progress})`;
  updateCrack(hit, progress);
  if (progress >= 1) {
    breakBlock(hit, toolId);
    consumeDurability(selected, 1);
    cancelMining();
    if (primaryDown) beginMining(castFromCamera());
  }
}

// Middle-click pick block: what a picked technical/state block turns into.
const PICK_REMAP = {
  [BLOCK.FURNACE_LIT]: BLOCK.FURNACE,
  [BLOCK.DOOR_TOP]: BLOCK.DOOR_BOTTOM,
  [BLOCK.DOOR_TOP_OPEN]: BLOCK.DOOR_BOTTOM,
  [BLOCK.DOOR_BOTTOM_OPEN]: BLOCK.DOOR_BOTTOM,
  [BLOCK.BED_HEAD]: BLOCK.BED_FOOT,
  [BLOCK.PISTON_HEAD]: BLOCK.PISTON,
  [BLOCK.POWERED_RAIL_ON]: BLOCK.POWERED_RAIL,
  [BLOCK.REPEATER_ON]: BLOCK.REPEATER,
  [BLOCK.REDSTONE_LAMP_ON]: BLOCK.REDSTONE_LAMP,
  [BLOCK.WHEAT_1]: BLOCK.WHEAT_0,
  [BLOCK.WHEAT_2]: BLOCK.WHEAT_0,
  [BLOCK.WHEAT_3]: BLOCK.WHEAT_0,
  [BLOCK.CARROT_1]: BLOCK.CARROT_0,
  [BLOCK.CARROT_2]: BLOCK.CARROT_0,
};

// Creative middle-click: put the targeted block in the hotbar. If a hotbar
// stack of it already exists select it; otherwise replace the current slot
// with a full stack. Survival: does nothing (no free blocks).
function pickBlockUnderCrosshair() {
  if (!isCreative()) return;
  const hit = castFromCamera();
  if (!hit) return;
  let id = world.getBlock(hit.x, hit.y, hit.z);
  id = PICK_REMAP[id] !== undefined ? PICK_REMAP[id] : id;
  if (id === BLOCK.AIR || id === BLOCK.NETHER_PORTAL || !BLOCKS[id]) return;
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const s = inventory.get(i);
    if (s && s.id === id) {
      setSelected(i);
      return;
    }
  }
  inventory.slots[selected] = { id, count: itemStackMax(id) };
  refreshHotbar();
}

window.addEventListener('contextmenu', (e) => e.preventDefault());
// Middle mouse button anywhere in the page: never autoscroll.
window.addEventListener('mousedown', (e) => {
  if (e.button === 1) e.preventDefault();
});
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 1) {
    e.preventDefault();
    if (!invOpen && !furnaceOpen && !chestOpen && player.controls.isLocked && survival.alive) {
      pickBlockUnderCrosshair();
    }
    return;
  }
  if (invOpen || furnaceOpen || chestOpen || !player.controls.isLocked || !survival.alive) return;
  feedback.ensureAudio();

  if (e.button === 0) {
    triggerSwing();
    if (tryAttackMob()) return;
    // Punching a boat pops it back into an item (like knocking a cart loose).
    camera.getWorldPosition(_origin);
    camera.getWorldDirection(_dir);
    const boatHit = boats.raycast(_origin, _dir, ATTACK_RANGE);
    if (boatHit) {
      const blockHit = world.raycastVoxel(_origin, _dir, ATTACK_RANGE);
      if (!blockHit || blockHit.distance > boatHit.distance) {
        if (ridingBoat === boatHit.boat) dismountBoat();
        const pos = new THREE.Vector3(boatHit.boat.x, boatHit.boat.y + 0.6, boatHit.boat.z);
        boats.remove(boatHit.boat);
        if (!isCreative()) drops.spawn(ITEM.BOAT, 1, pos);
        feedback.play('break');
        scheduleSave();
        return;
      }
    }
    primaryDown = true;
    beginMining(castFromCamera());
    return;
  }

  const hit = castFromCamera();

  if (e.button === 2) {
    // Mob interactions: trade, tame, sit, feed (breeding).
    camera.getWorldPosition(_origin);
    camera.getWorldDirection(_dir);
    const mobHit = mobs.raycast(_origin, _dir, 4);
    if (mobHit) {
      const m = mobHit.mob;
      const heldNow = inventory.get(selected);
      if (m.type === 'villager') {
        openTradeScreen();
        return;
      }
      if (m.type === 'wolf' && !m.tame && heldNow && heldNow.id === ITEM.BONE) {
        if (!isCreative()) inventory.removeOneAt(selected);
        const res = mobs.tryTame(m);
        if (res === 'tamed') {
          achievements.trigger({ type: 'tame' });
          feedback.play('wolfBark');
          survival._setMessage('Wolf tamed!');
        } else {
          survival._setMessage('The wolf ignores you...');
        }
        triggerSwing();
        refreshHotbar();
        scheduleSave();
        return;
      }
      if (m.type === 'wolf' && m.tame && !heldNow) {
        mobs.toggleSit(m);
        feedback.play('wolfBark');
        survival._setMessage(m.sitting ? 'Wolf sits' : 'Wolf follows');
        return;
      }
      // Horses: saddle with a saddle item, then right-click to mount.
      if (m.type === 'horse') {
        if (!m.saddled && heldNow && heldNow.id === ITEM.SADDLE) {
          m.saddled = true;
          if (m.mesh.userData.saddle) m.mesh.userData.saddle.visible = true;
          if (!isCreative()) inventory.removeOneAt(selected);
          triggerSwing();
          feedback.play('place');
          survival._setMessage('Horse saddled!');
          refreshHotbar();
          scheduleSave();
          return;
        }
        if (m.saddled && !ridingHorse && !ridingCart && !ridingBoat) {
          mountHorse(m);
          return;
        }
      }
      if (heldNow && mobs.feedAnimal(m, heldNow.id)) {
        if (!isCreative()) inventory.removeOneAt(selected);
        triggerSwing();
        feedback.play('eat');
        refreshHotbar();
        scheduleSave();
        return;
      }
    }
    // Mount a nearby minecart or boat when not aiming at a close block.
    if (!ridingCart && !ridingBoat) {
      const cart = minecarts.nearest(_origin.clone().addScaledVector(_dir, 1.6), 2.0);
      if (cart && (!hit || hit.distance > 2.2)) {
        mountCart(cart);
        return;
      }
      const boat = boats.nearest(_origin.clone().addScaledVector(_dir, 1.6), 2.2);
      if (boat && (!hit || hit.distance > 2.2)) {
        mountBoat(boat);
        return;
      }
    }
    if (hit && world.getBlock(hit.x, hit.y, hit.z) === BLOCK.CRAFTING_TABLE) {
      openInventory(3);
      return;
    }
    if (hit && (world.getBlock(hit.x, hit.y, hit.z) === BLOCK.FURNACE || world.getBlock(hit.x, hit.y, hit.z) === BLOCK.FURNACE_LIT)) {
      openFurnace(hit.x, hit.y, hit.z);
      return;
    }
    if (hit && world.getBlock(hit.x, hit.y, hit.z) === BLOCK.CHEST) {
      openChest(hit.x, hit.y, hit.z);
      return;
    }
    if (hit && world.getBlock(hit.x, hit.y, hit.z) === BLOCK.ENCHANTING_TABLE) {
      openEnchantScreen();
      return;
    }
    // Bed: set respawn point; at night also sleep straight through to morning.
    const hitBlock = hit && world.getBlock(hit.x, hit.y, hit.z);
    if (hitBlock === BLOCK.BED_HEAD || hitBlock === BLOCK.BED_FOOT) {
      const pos = player.getObject().position;
      survival.spawnPoint = { x: hit.x + 0.5, y: hit.y + 1 + 1.62, z: hit.z + 0.5 };
      const isNight = dayNight.t >= 0.78 || dayNight.t < 0.22;
      if (isNight) {
        dayNight.t = 0.28; // just after sunrise
        dayNight.apply(player.getObject().position);
        survival._setMessage('You slept through the night');
      } else {
        survival._setMessage('Respawn point set');
      }
      achievements.trigger({ type: 'bed' });
      scheduleSave();
      return;
    }
    // Door: toggle between closed (solid) and open (walk-through) halves.
    if (hitBlock === BLOCK.DOOR_BOTTOM || hitBlock === BLOCK.DOOR_TOP ||
        hitBlock === BLOCK.DOOR_BOTTOM_OPEN || hitBlock === BLOCK.DOOR_TOP_OPEN) {
      const isBottom = hitBlock === BLOCK.DOOR_BOTTOM || hitBlock === BLOCK.DOOR_BOTTOM_OPEN;
      const bottomY = isBottom ? hit.y : hit.y - 1;
      const open = hitBlock === BLOCK.DOOR_BOTTOM_OPEN || hitBlock === BLOCK.DOOR_TOP_OPEN;
      world.setBlock(hit.x, bottomY, hit.z, open ? BLOCK.DOOR_BOTTOM : BLOCK.DOOR_BOTTOM_OPEN);
      world.setBlock(hit.x, bottomY + 1, hit.z, open ? BLOCK.DOOR_TOP : BLOCK.DOOR_TOP_OPEN);
      feedback.play('door');
      scheduleSave();
      return;
    }

    // TNT: ignite with a held torch (regular or redstone).
    if (hitBlock === BLOCK.TNT) {
      const lighter = inventory.get(selected);
      if (lighter && (lighter.id === ITEM.TORCH || lighter.id === BLOCK.REDSTONE_TORCH || lighter.id === BLOCK.TORCH)) {
        igniteTNT(hit.x, hit.y, hit.z);
        return;
      }
    }

    // Lever: toggle redstone power
    if (hitBlock === BLOCK.LEVER) {
      redstone.toggleLever(hit.x, hit.y, hit.z);
      feedback.play('door');
      scheduleSave();
      return;
    }

    // Button: a redstone pulse.
    if (hitBlock === BLOCK.BUTTON) {
      redstone.pressButton(hit.x, hit.y, hit.z);
      return;
    }

    // Repeater: right click cycles its delay (1-4 ticks).
    if (hitBlock === BLOCK.REPEATER || hitBlock === BLOCK.REPEATER_ON) {
      const d = redstone.cycleRepeater(hit.x, hit.y, hit.z);
      survival._setMessage(`Repeater delay: ${d} tick${d > 1 ? 's' : ''}`);
      return;
    }

    // Bow: start drawing (the arrow is released on mouseup).
    const held = inventory.get(selected);

    // Flint and steel: ignite TNT, or light a nether portal frame.
    if (held && held.id === ITEM.FLINT_AND_STEEL && hit) {
      if (hitBlock === BLOCK.TNT) {
        igniteTNT(hit.x, hit.y, hit.z);
        consumeDurability(selected, 1);
        return;
      }
      const ix = hit.x + hit.nx, iy = hit.y + hit.ny, iz = hit.z + hit.nz;
      if (tryLightPortal(world, ix, iy, iz)) {
        consumeDurability(selected, 1);
        feedback.play('portal');
        feedback.warpBurst(new THREE.Vector3(ix + 0.5, iy + 1, iz + 0.5));
        triggerSwing();
        scheduleSave();
        return;
      }
    }

    // Minecart item: place a cart on a rail.
    if (held && held.id === ITEM.MINECART && hit && isRail(hitBlock)) {
      if (minecarts.spawn(hit.x + 0.5, hit.y, hit.z + 0.5)) {
        if (!isCreative()) inventory.removeOneAt(selected);
        triggerSwing();
        feedback.play('place');
        refreshHotbar();
        scheduleSave();
      }
      return;
    }

    // Iron golem: right-click the TOP iron block of a T (one block below the
    // clicked one + two arms beside it) while holding an iron ingot. The four
    // iron blocks are consumed; the ingot is kept (it only "animates" the T).
    if (held && held.id === ITEM.IRON_INGOT && hit && hitBlock === BLOCK.IRON_BLOCK) {
      const isIron = (a, b, c) => world.getBlock(a, b, c) === BLOCK.IRON_BLOCK;
      let arms = null;
      if (isIron(hit.x - 1, hit.y, hit.z) && isIron(hit.x + 1, hit.y, hit.z)) {
        arms = [[hit.x - 1, hit.y, hit.z], [hit.x + 1, hit.y, hit.z]];
      } else if (isIron(hit.x, hit.y, hit.z - 1) && isIron(hit.x, hit.y, hit.z + 1)) {
        arms = [[hit.x, hit.y, hit.z - 1], [hit.x, hit.y, hit.z + 1]];
      }
      if (arms && isIron(hit.x, hit.y - 1, hit.z)) {
        world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
        world.setBlock(hit.x, hit.y - 1, hit.z, BLOCK.AIR);
        for (const [ax, ay, az] of arms) world.setBlock(ax, ay, az, BLOCK.AIR);
        mobs.addMob(new THREE.Vector3(hit.x + 0.5, hit.y - 1, hit.z + 0.5), 'iron_golem');
        achievements.trigger({ type: 'golem' });
        feedback.play('place');
        feedback.smokePuff(new THREE.Vector3(hit.x + 0.5, hit.y, hit.z + 0.5));
        survival._setMessage('Iron Golem constructed!', 4);
        triggerSwing();
        scheduleSave();
        return;
      }
    }

    // Overlord Sigil: summon the boss on nether bricks, in the nether.
    if (held && held.id === ITEM.BOSS_SIGIL && hit && hitBlock === BLOCK.NETHER_BRICK) {
      if (!world.skyless) {
        survival._setMessage('The sigil only answers in the Nether');
        return;
      }
      if (mobs.getBoss()) {
        survival._setMessage('The Overlord already walks');
        return;
      }
      if (!isCreative()) inventory.removeOneAt(selected);
      mobs.spawnBoss(new THREE.Vector3(hit.x + 0.5, hit.y + 7, hit.z + 0.5));
      achievements.trigger({ type: 'summon' });
      feedback.play('bossRoar');
      survival._setMessage('The Nether Overlord awakens!', 4);
      refreshHotbar();
      scheduleSave();
      return;
    }

    // Ender pearl: short-range teleport toward whatever you aim at.
    if (held && held.id === ITEM.ENDER_PEARL) {
      camera.getWorldPosition(_origin);
      camera.getWorldDirection(_dir);
      const tp = world.raycastVoxel(_origin, _dir, 24);
      if (tp) {
        if (!isCreative()) inventory.removeOneAt(selected);
        feedback.warpBurst(player.getObject().position.clone());
        const lx = tp.x + tp.nx, ly = tp.y + tp.ny, lz = tp.z + tp.nz;
        player.spawn(lx + 0.5, ly + 1.62 + 0.1, lz + 0.5);
        survival.damage(2, 'Teleport strain');
        feedback.play('warp');
        feedback.warpBurst(player.getObject().position.clone());
        refreshHotbar();
        scheduleSave();
      }
      return;
    }

    // Hoe: till grass/dirt into farmland when the block above is clear.
    if (held && toolKind(held.id) === 'hoe' &&
        (hitBlock === BLOCK.GRASS || hitBlock === BLOCK.DIRT) &&
        hit && world.getBlock(hit.x, hit.y + 1, hit.z) === BLOCK.AIR) {
      world.setBlock(hit.x, hit.y, hit.z, BLOCK.FARMLAND);
      consumeDurability(selected, 1);
      triggerSwing();
      feedback.play('place');
      scheduleSave();
      return;
    }

    // Seeds / carrots: plant a crop on top of farmland.
    const plantAs = held && (held.id === ITEM.WHEAT_SEEDS ? BLOCK.WHEAT_0 : held.id === ITEM.CARROT ? BLOCK.CARROT_0 : 0);
    if (plantAs && hitBlock === BLOCK.FARMLAND &&
        hit && world.getBlock(hit.x, hit.y + 1, hit.z) === BLOCK.AIR) {
      world.setBlock(hit.x, hit.y + 1, hit.z, plantAs);
      if (!isCreative()) inventory.removeOneAt(selected);
      triggerSwing();
      feedback.play('place');
      refreshHotbar();
      scheduleSave();
      return;
    }

    // Bone meal: instantly advance a growing crop one stage.
    if (held && held.id === ITEM.BONE_MEAL && hit) {
      const next = nextCropStage(hitBlock);
      if (next) {
        world.setBlock(hit.x, hit.y, hit.z, next);
        if (!isCreative()) inventory.removeOneAt(selected);
        triggerSwing();
        feedback.play('place');
        feedback.placeBurst(next, new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5));
        refreshHotbar();
        scheduleSave();
        return;
      }
    }

    // Empty bucket: scoop a liquid SOURCE cell (raycast must hit liquids).
    if (held && held.id === ITEM.BUCKET) {
      const lh = castFromCameraLiquid();
      if (lh) {
        const lid = world.getBlock(lh.x, lh.y, lh.z);
        if ((lid === BLOCK.WATER || lid === BLOCK.LAVA) &&
            fluidLevel(world.getMeta(lh.x, lh.y, lh.z)) === 0) {
          world.setBlock(lh.x, lh.y, lh.z, BLOCK.AIR);
          fluids.wake(lh.x, lh.y, lh.z);
          if (!isCreative()) {
            const filled = lid === BLOCK.WATER ? ITEM.WATER_BUCKET : ITEM.LAVA_BUCKET;
            if (held.count === 1) {
              inventory.slots[selected] = { id: filled, count: 1 };
            } else {
              held.count -= 1;
              if (inventory.add(filled, 1) > 0) {
                drops.spawn(filled, 1, player.getObject().position.clone());
              }
            }
          }
          triggerSwing();
          feedback.play('place');
          refreshHotbar();
          scheduleSave();
        }
      }
      return;
    }

    // Filled bucket: pour a source into the cell in front of the clicked face.
    if (held && (held.id === ITEM.WATER_BUCKET || held.id === ITEM.LAVA_BUCKET) && hit) {
      const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
      const target = world.getBlock(px, py, pz);
      const pourable = target === BLOCK.AIR || target === BLOCK.TALL_GRASS ||
                       target === BLOCK.FLOWER_RED || target === BLOCK.FLOWER_YELLOW;
      if (pourable) {
        world.setBlock(px, py, pz, held.id === ITEM.WATER_BUCKET ? BLOCK.WATER : BLOCK.LAVA, 0);
        fluids.wake(px, py, pz);
        if (!isCreative()) inventory.slots[selected] = { id: ITEM.BUCKET, count: 1 };
        triggerSwing();
        feedback.play('place');
        refreshHotbar();
        scheduleSave();
      }
      return;
    }

    // Boat item: launch onto a water surface.
    if (held && held.id === ITEM.BOAT) {
      const lh = castFromCameraLiquid();
      if (lh && world.getBlock(lh.x, lh.y, lh.z) === BLOCK.WATER) {
        if (boats.spawn(lh.x + 0.5, lh.z + 0.5)) {
          if (!isCreative()) inventory.removeOneAt(selected);
          triggerSwing();
          feedback.play('place');
          refreshHotbar();
          scheduleSave();
        }
      } else {
        survival._setMessage('Boats need water');
      }
      return;
    }

    // Fishing rod: cast the bobber, or reel in whatever is out there.
    if (held && held.id === ITEM.FISHING_ROD) {
      if (bobber) reelInBobber();
      else castBobber();
      triggerSwing();
      return;
    }

    if (held && held.id === ITEM.BOW) {
      if (isCreative() || inventory.count(ITEM.ARROW) > 0) {
        bowCharging = true;
        bowCharge = 0;
      } else {
        survival._setMessage('No arrows');
      }
      return;
    }

    // Right-click with food selected eats it when no usable block is targeted.
    // Eating is disabled in creative (hunger is pinned at max).
    if (!isCreative() && held && foodValue(held.id) > 0) {
      if (survival.eat(foodValue(held.id))) {
        if (held.id === ITEM.GOLDEN_APPLE) survival.heal(20); // full golden-apple heal
        inventory.removeOneAt(selected);
        feedback.play('eat');
        triggerSwing();
        refreshHotbar();
        scheduleSave();
      }
      return;
    }
  }

  if (!hit) return;

  if (e.button === 2) {
    // Place: consumes one of the selected stack; block items and placeable items.
    const held = inventory.get(selected);
    if (!held) return;
    const blockId = isBlockItem(held.id) ? held.id : placeableBlock(held.id);
    if (!blockId) return;
    const px = hit.x + hit.nx;
    const py = hit.y + hit.ny;
    const pz = hit.z + hit.nz;
    // Rails and redstone fixtures need solid ground beneath them.
    if ((blockId === BLOCK.RAIL || blockId === BLOCK.POWERED_RAIL ||
         blockId === BLOCK.PRESSURE_PLATE || blockId === BLOCK.BUTTON ||
         blockId === BLOCK.REPEATER) && !isSolid(world.getBlock(px, py - 1, pz))) {
      return;
    }
    // Sugar cane: needs sand/dirt/grass below (or stacks on cane, max 3) and
    // water horizontally adjacent to the supporting block.
    if (blockId === BLOCK.SUGAR_CANE) {
      const below = world.getBlock(px, py - 1, pz);
      let caneOk = false;
      if (below === BLOCK.SUGAR_CANE) {
        let height = 1;
        while (world.getBlock(px, py - 1 - height, pz) === BLOCK.SUGAR_CANE) height++;
        caneOk = height < 3;
      } else if (below === BLOCK.SAND || below === BLOCK.DIRT || below === BLOCK.GRASS) {
        caneOk = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(
          ([dx, dz]) => world.getBlock(px + dx, py - 1, pz + dz) === BLOCK.WATER,
        );
      }
      if (!caneOk) {
        survival._setMessage('Sugar cane needs sand/dirt beside water');
        return;
      }
    }
    // Slabs and stairs keep their orientation in per-voxel meta.
    let placeMeta = 0;
    const placeModel = blockModel(blockId);
    if (placeModel === 'slab' || placeModel === 'stairs') {
      camera.getWorldPosition(_origin);
      camera.getWorldDirection(_dir);
      // Clicking a block's bottom face (or the upper half of a side face)
      // yields the top-slab / upside-down variant. The raycast hit point is
      // origin + dir * distance; its fractional Y inside the hit cell tells
      // which half of a side face was clicked.
      const hitFracY = _origin.y + _dir.y * hit.distance - hit.y;
      const upper = hit.ny === -1 || (hit.ny === 0 && hitFracY > 0.5);
      if (placeModel === 'slab') {
        placeMeta = upper ? 1 : 0;
      } else {
        // Stairs ascend away from the player: facing follows the camera yaw.
        const facing = Math.abs(_dir.x) >= Math.abs(_dir.z)
          ? (_dir.x >= 0 ? 0 : 2)
          : (_dir.z >= 0 ? 1 : 3);
        placeMeta = facing | (upper ? 4 : 0);
      }
    }
    if (!intersectsPlayer(px, py, pz)) {
      world.setBlock(px, py, pz, blockId, placeMeta);
      fluids.wake(px, py, pz); // placing may displace/block nearby liquids
      // Place paired blocks (door top, bed head)
      if (blockId === BLOCK.DOOR_BOTTOM) {
        world.setBlock(px, py + 1, pz, BLOCK.DOOR_TOP);
      } else if (blockId === BLOCK.BED_FOOT) {
        camera.getWorldDirection(_dir);
        const dx = Math.abs(_dir.x) >= Math.abs(_dir.z) ? Math.sign(_dir.x) : 0;
        const dz = dx === 0 ? Math.sign(_dir.z) : 0;
        world.setBlock(px + dx, py, pz + dz, BLOCK.BED_HEAD);
      }
      if (!isCreative()) inventory.removeOneAt(selected); // placing is free in creative
      triggerSwing();
      feedback.play('place');
      feedback.placeBurst(blockId, new THREE.Vector3(px + 0.5, py + 0.5, pz + 0.5));
      // Pistons and repeaters remember which way the player was facing.
      let placeOpts;
      if (blockId === BLOCK.PISTON || blockId === BLOCK.REPEATER) {
        camera.getWorldDirection(_dir);
        let d;
        if (blockId === BLOCK.PISTON && _dir.y < -0.75) d = [0, -1, 0];
        else if (blockId === BLOCK.PISTON && _dir.y > 0.75) d = [0, 1, 0];
        else if (Math.abs(_dir.x) >= Math.abs(_dir.z)) d = [Math.sign(_dir.x) || 1, 0, 0];
        else d = [0, 0, Math.sign(_dir.z) || 1];
        placeOpts = { dir: d };
      }
      redstone.onBlockPlaced(px, py, pz, blockId, placeOpts);
      refreshHotbar();
      scheduleSave();
    }
  }
});
// Release a drawn bow: spend one arrow, damage/speed scale with charge time.
function releaseBow() {
  if (!bowCharging) return;
  const charge = Math.min(1, bowCharge / BOW_CHARGE_TIME);
  cancelBowCharge();
  if (charge < 0.15) return;                 // tap = no shot, arrow kept
  const heldStack = inventory.get(selected);
  if (!heldStack || heldStack.id !== ITEM.BOW) return;
  // Creative never consumes arrows (and can fire without any).
  if (!isCreative() && inventory.remove(ITEM.ARROW, 1) <= 0) return;
  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_dir);
  const damage = Math.round(2 + charge * 7);
  projectiles.shootArrow(
    _origin.clone().addScaledVector(_dir, 0.4),
    _dir.clone(),
    13 + charge * 18,
    damage,
    true,
  );
  consumeDurability(selected, 1);
  feedback.play('bowShoot');
  triggerSwing();
  refreshHotbar();
}

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    primaryDown = false;
    cancelMining();
  }
  if (e.button === 2) releaseBow();
});
window.addEventListener('blur', () => {
  primaryDown = false;
  cancelMining();
  cancelBowCharge();
});

// Deterministic 0..1 from a voxel position, for the apple drop roll. Mixed with
// a salt so it differs from the terrain hashes.
function hash01(x, y, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2246822519) + 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---- Resize -----------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Settings ---------------------------------------------------------------
const settingsEl = document.getElementById('settings');
const volumeRangeEl = document.getElementById('volumeRange');
const volumeValueEl = document.getElementById('volumeValue');
const sensitivityRangeEl = document.getElementById('sensitivityRange');
const sensitivityValueEl = document.getElementById('sensitivityValue');
const showHudToggleEl = document.getElementById('showHudToggle');
const settingsCloseEl = document.getElementById('settingsClose');

function applySettings(persist = true) {
  feedback.volume = settings.volume;
  player.controls.pointerSpeed = settings.sensitivity;
  document.body.classList.toggle('hide-hud', !settings.showHud);
  volumeRangeEl.value = Math.round(settings.volume * 100);
  volumeValueEl.textContent = volumeRangeEl.value;
  sensitivityRangeEl.value = Math.round(settings.sensitivity * 100);
  sensitivityValueEl.textContent = sensitivityRangeEl.value;
  showHudToggleEl.checked = settings.showHud;
  if (persist) saveSettings();
}

function openSettings() {
  if (invOpen) closeInventory();
  if (furnaceOpen) closeFurnace();
  settingsOpen = true;
  if (player.controls.isLocked) player.controls.unlock();
  overlay.classList.add('hidden');
  settingsEl.classList.remove('hidden');
  applySettings(false);
}

function closeSettings() {
  settingsOpen = false;
  settingsEl.classList.add('hidden');
  if (survival.alive) overlay.classList.remove('hidden');
}

function toggleSettings() {
  if (settingsOpen) closeSettings();
  else openSettings();
}

volumeRangeEl.addEventListener('input', () => {
  settings.volume = Number(volumeRangeEl.value) / 100;
  applySettings();
});
sensitivityRangeEl.addEventListener('input', () => {
  settings.sensitivity = Number(sensitivityRangeEl.value) / 100;
  applySettings();
});
showHudToggleEl.addEventListener('change', () => {
  settings.showHud = showHudToggleEl.checked;
  applySettings();
});
settingsCloseEl.addEventListener('click', closeSettings);
applySettings(false);

// ---- Game mode (survival / creative) ------------------------------------------
const modeSurvivalBtn = document.getElementById('modeSurvivalBtn');
const modeCreativeBtn = document.getElementById('modeCreativeBtn');

function updateModeButtons() {
  modeSurvivalBtn.classList.toggle('active', !isCreative());
  modeCreativeBtn.classList.toggle('active', isCreative());
}

function toggleGameMode() {
  setMode(isCreative() ? 'survival' : 'creative');
}

modeSurvivalBtn.addEventListener('click', () => setMode('survival'));
modeCreativeBtn.addEventListener('click', () => setMode('creative'));
updateModeButtons();

// Refresh everything that depends on the mode when it flips (settings buttons,
// the inventory screen layout, flight, mob targeting).
setOnModeChange((m) => {
  if (m !== 'creative') player.flying = false;
  mobs.playerInvulnerable = isCreative();
  updateModeButtons();
  if (invOpen) {
    applyInventoryMode();
    refreshInventory();
  }
  survival._setMessage(m === 'creative' ? 'Game mode: Creative' : 'Game mode: Survival', 2.5);
  scheduleSave();
});

// ---- HUD and survival UI ----------------------------------------------------
const hud = document.getElementById('hud');
const underwaterEl = document.getElementById('underwater');
const lavaTintEl = document.getElementById('lavaTint');
const bossBarEl = document.getElementById('bossBar');
const bossBarFillEl = document.getElementById('bossBarFill');
const damageFlashEl = document.getElementById('damageFlash');
const deathScreenEl = document.getElementById('deathScreen');
const deathReasonEl = document.getElementById('deathReason');
const respawnButtonEl = document.getElementById('respawnButton');
const healthFillEl = document.getElementById('healthFill');
const hungerFillEl = document.getElementById('hungerFill');
const airFillEl = document.getElementById('airFill');
const healthTextEl = document.getElementById('healthText');
const hungerTextEl = document.getElementById('hungerText');
const airTextEl = document.getElementById('airText');
const airRowEl = document.getElementById('airRow');
const statusMessageEl = document.getElementById('statusMessage');

function fmtStat(v) {
  return Math.ceil(v).toString();
}

const armorRowEl = document.getElementById('armorRow');
const armorFillEl = document.getElementById('armorFill');
const armorTextEl = document.getElementById('armorText');
const xpFillEl = document.getElementById('xpFill');
const xpLevelEl = document.getElementById('xpLevel');
const enchantScreenEl = document.getElementById('enchantScreen');
const enchantListEl = document.getElementById('enchantList');
const enchantItemEl = document.getElementById('enchantItem');
const enchantLevelEl = document.getElementById('enchantLevel');

function updateSurvivalHud() {
  const r = survival.ratios;
  healthFillEl.style.transform = `scaleX(${r.health})`;
  hungerFillEl.style.transform = `scaleX(${r.hunger})`;
  airFillEl.style.transform = `scaleX(${r.air})`;
  healthTextEl.textContent = fmtStat(survival.health);
  hungerTextEl.textContent = fmtStat(survival.hunger);
  airTextEl.textContent = fmtStat(survival.air);
  airRowEl.classList.toggle('hidden', survival.air >= 9.95 && !player.underwater);
  const totalArmor = survival.armorTotal();
  armorRowEl.classList.toggle('hidden', totalArmor <= 0);
  armorFillEl.style.transform = `scaleX(${Math.min(1, totalArmor / 15)})`;
  armorTextEl.textContent = String(totalArmor);
  statusMessageEl.textContent = survival.messageTime > 0 ? survival.message : '';
  damageFlashEl.style.opacity = String(survival.damageFlash * 0.7);

  deathScreenEl.classList.toggle('hidden', survival.alive);
  if (!survival.alive) {
    deathReasonEl.textContent = `${survival.message || 'You died'}. Respawn to continue.`;
  }

  // XP bar
  xpFillEl.style.transform = `scaleX(${xpManager.ratio})`;
  xpLevelEl.textContent = xpManager.level > 0 ? `Lv ${xpManager.level}` : '';
}

function respawnAtSpawn() {
  // Dying in the nether sends you home.
  if (world.skyless) switchDimension(overworld);
  const spawn = world.findSpawn(8, 8);
  survival.respawn(player, spawn);
  world.update(player.getObject().position);
  doSave();
  player.controls.lock();
}

respawnButtonEl.addEventListener('click', respawnAtSpawn);

// ---- Inventory & crafting screen -------------------------------------------
const inventoryEl = document.getElementById('inventory');
const craftTitleEl = document.getElementById('craftTitle');
const craftGridEl = document.getElementById('craftGrid');
const craftOutEl = document.getElementById('craftOut');
const backpackGridEl = document.getElementById('backpackGrid');
const invHotbarGridEl = document.getElementById('invHotbarGrid');
const heldStackEl = document.getElementById('heldStack');
const heldCountEl = heldStackEl.querySelector('.count');

let invOpen = false;
let held = null;                 // the stack on the cursor: { id, count } | null
let craftSize = 2;               // 2 = inventory crafting, 3 = crafting table
const craft = new Array(9).fill(null);

// Build the cell DOM once; refreshInventory() repaints their contents.
const backpackCells = [];
const hotbarCells = [];
const craftCells = [];

function makeCell(onClick) {
  const c = document.createElement('div');
  c.className = 'cell';
  c.innerHTML = '<span class="count"></span>';
  c.addEventListener('mousedown', (e) => { e.preventDefault(); onClick(e); });
  return c;
}

function paintCell(cell, stack) {
  iconStyle(cell, stack ? stack.id : null, ICON_PX);
  setTooltip(cell, stack);
  cell.querySelector('.count').textContent = stack && stack.count > 1 ? stack.count : '';
}

// 3x3 DOM; inventory crafting hides the cells outside the top-left 2x2 area.
for (let i = 0; i < 9; i++) {
  const cell = makeCell((e) => onCraftCellClick(i, e));
  craftCells.push(cell);
  craftGridEl.appendChild(cell);
}
craftOutEl.innerHTML = '<span class="count"></span>'; // paintCell expects a count span
craftOutEl.addEventListener('mousedown', (e) => { e.preventDefault(); onTakeOutput(); });

// Backpack rows (slots HOTBAR_SIZE..INVENTORY_SIZE-1) then the hotbar row.
for (let i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) {
  const cell = makeCell((e) => onSlotClick(i, e));
  backpackCells.push(cell);
  backpackGridEl.appendChild(cell);
}
for (let i = 0; i < HOTBAR_SIZE; i++) {
  const cell = makeCell((e) => onSlotClick(i, e));
  hotbarCells.push(cell);
  invHotbarGridEl.appendChild(cell);
}

function refreshInventory() {
  for (let i = 0; i < HOTBAR_SIZE; i++) paintCell(hotbarCells[i], inventory.get(i));
  for (let i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) paintCell(backpackCells[i - HOTBAR_SIZE], inventory.get(i));
  for (let i = 0; i < 9; i++) paintCell(craftCells[i], craft[i]);
  paintCell(craftOutEl, craftResult(craft, craftSize));
  paintArmorSlots();
  paintHeld();
}

function isCraftCellActive(i) {
  return craftSize === 3 || (i % 3 < 2 && Math.floor(i / 3) < 2);
}

function setCraftSize(size) {
  craftSize = size;
  craftTitleEl.textContent = size === 3 ? 'CRAFTING TABLE' : 'CRAFTING';
  craftGridEl.classList.toggle('grid2', size === 2);
  craftGridEl.classList.toggle('grid3', size === 3);
  for (let i = 0; i < 9; i++) {
    const active = isCraftCellActive(i);
    craftCells[i].classList.toggle('hiddenCraft', !active);
    if (!active && craft[i]) {
      inventory.addStack(craft[i]);
      craft[i] = null;
    }
  }
}

function paintHeld() {
  if (held) {
    iconStyle(heldStackEl, held.id, 36);
    heldCountEl.textContent = held.count > 1 ? held.count : '';
    heldStackEl.classList.add('active');
  } else {
    heldStackEl.classList.remove('active');
  }
}

document.addEventListener('mousemove', (e) => {
  if (!invOpen && !furnaceOpen && !chestOpen) return;
  heldStackEl.style.left = `${e.clientX}px`;
  heldStackEl.style.top = `${e.clientY}px`;
});

// Click on an inventory slot: classic pick-up / drop / merge / swap.
function onSlotClick(i, e) {
  const slot = inventory.get(i);
  if (e && e.button === 2) {
    if (held) {
      if (!slot) {
        inventory.slots[i] = { id: held.id, count: 1 };
        held.count -= 1;
        if (held.count <= 0) held = null;
      } else if (slot.id === held.id && slot.count < itemStackMax(slot.id)) {
        slot.count += 1;
        held.count -= 1;
        if (held.count <= 0) held = null;
      }
    } else if (slot) {
      const take = Math.ceil(slot.count / 2);
      held = { id: slot.id, count: take };
      slot.count -= take;
      if (slot.count <= 0) inventory.slots[i] = null;
    }
    refreshInventory();
    scheduleSave();
    return;
  }

  if (held && slot && slot.id === held.id) {
    const room = itemStackMax(slot.id) - slot.count; // merge onto same item
    const move = Math.min(room, held.count);
    slot.count += move;
    held.count -= move;
    if (held.count <= 0) held = null;
  } else {
    inventory.slots[i] = held;                     // place / swap / pick up
    held = slot;
  }
  refreshInventory();
  scheduleSave();
}

// Click on a crafting-grid cell: same pick-up / drop against the 2x2 grid.
function onCraftCellClick(i, e) {
  if (!isCraftCellActive(i)) return;
  const slot = craft[i];
  if (e && e.button === 2) {
    if (held) {
      if (!slot) {
        craft[i] = { id: held.id, count: 1 };
        held.count -= 1;
        if (held.count <= 0) held = null;
      } else if (slot.id === held.id && slot.count < itemStackMax(slot.id)) {
        slot.count += 1;
        held.count -= 1;
        if (held.count <= 0) held = null;
      }
    } else if (slot) {
      const take = Math.ceil(slot.count / 2);
      held = { id: slot.id, count: take };
      slot.count -= take;
      if (slot.count <= 0) craft[i] = null;
    }
    refreshInventory();
    return;
  }

  if (held && slot && slot.id === held.id) {
    const move = Math.min(itemStackMax(slot.id) - slot.count, held.count);
    slot.count += move;
    held.count -= move;
    if (held.count <= 0) held = null;
  } else {
    craft[i] = held;
    held = slot;
  }
  refreshInventory();
}

// Click the output cell: craft one batch if the cursor can hold the result.
function onTakeOutput() {
  const out = craftResult(craft, craftSize);
  if (!out) return;
  if (held && (held.id !== out.id || held.count + out.count > itemStackMax(out.id))) return;
  const cost = craftCost(craft, craftSize);
  for (const k in cost) {
    let need = cost[k];
    for (let i = 0; i < 9 && need > 0; i++) {
      const c = craft[i];
      if (c && c.id === Number(k)) {
        const take = Math.min(c.count, need);
        c.count -= take;
        need -= take;
        if (c.count <= 0) craft[i] = null;
      }
    }
  }
  if (held) held.count += out.count;
  else {
    held = { id: out.id, count: out.count };
    const maxDur = itemMaxDurability(out.id);
    if (maxDur) held.durability = maxDur;
  }
  achievements.trigger({ type: 'craft', item: out.id });
  refreshInventory();
  scheduleSave();
}

// ---- Creative item picker -----------------------------------------------------
// In creative the crafting grid + recipe list are replaced by a scrollable
// "all items" panel with a text filter. Backpack + hotbar grids stay live.
const creativePanelEl = document.getElementById('creativePanel');
const creativeGridEl = document.getElementById('creativeGrid');
const creativeFilterEl = document.getElementById('creativeFilter');
const craftRowEl = document.getElementById('craftRow');
const recipesTitleEl = document.getElementById('recipesTitle');
const recipeListEl = document.getElementById('recipeList');

// Blocks that are internal state rather than givable things: paired halves
// (door top / bed head / piston head), lit or powered variants, crop growth
// stages and the portal interior. Their base form IS givable. WHEAT_0/CARROT_0
// stay (plantable seedlings) and MOB_SPAWNER stays available for fun.
const CREATIVE_EXCLUDED = new Set([
  BLOCK.AIR, BLOCK.FURNACE_LIT, BLOCK.DOOR_TOP, BLOCK.DOOR_TOP_OPEN,
  BLOCK.DOOR_BOTTOM_OPEN, BLOCK.BED_HEAD, BLOCK.PISTON_HEAD, BLOCK.REPEATER_ON,
  BLOCK.POWERED_RAIL_ON, BLOCK.REDSTONE_LAMP_ON, BLOCK.NETHER_PORTAL,
  BLOCK.WHEAT_1, BLOCK.WHEAT_2, BLOCK.WHEAT_3, BLOCK.CARROT_1, BLOCK.CARROT_2,
]);

const CREATIVE_IDS = [
  ...Object.keys(BLOCKS).map(Number).filter((id) => !CREATIVE_EXCLUDED.has(id)),
  ...Object.keys(ITEMS).map(Number),
];

// Click: full stack on the cursor. Shift-click: full stack straight into the
// inventory. Right-click: a single item (stacks onto a matching cursor stack).
function onCreativeEntryClick(id, e) {
  if (e.button === 2) {
    if (held && held.id === id && held.count < itemStackMax(id)) held.count += 1;
    else held = { id, count: 1 };
  } else if (e.shiftKey) {
    inventory.addStack({ id, count: itemStackMax(id) });
  } else {
    held = { id, count: itemStackMax(id) };
  }
  refreshInventory();
}

function rebuildCreativeGrid() {
  const filter = creativeFilterEl.value.trim().toLowerCase();
  creativeGridEl.innerHTML = '';
  for (const id of CREATIVE_IDS) {
    if (filter && !itemDef(id).name.toLowerCase().includes(filter)) continue;
    const cell = makeCell((e) => onCreativeEntryClick(id, e));
    paintCell(cell, { id, count: 1 });
    creativeGridEl.appendChild(cell);
  }
}

creativeFilterEl.addEventListener('input', rebuildCreativeGrid);

// ---- Data-driven recipe list ---------------------------------------------------
// The RECIPES panel is generated from the crafting.js tables at startup, so the
// list can never drift from the real recipes again. Grouped by where a recipe
// fits: anything needing at most 4 items works in the 2x2 grid, the rest needs
// a crafting table.
function shapeCostOf(shape) {
  const cost = {};
  for (const id of shape) {
    if (id != null) cost[id] = (cost[id] || 0) + 1;
  }
  return cost;
}

function recipeEntry(out, cost) {
  const div = document.createElement('div');
  div.className = 'recipeEntry';
  if (out.count > 1) div.append(`${out.count}× `);
  const icon = document.createElement('span');
  icon.className = 'ric';
  iconStyle(icon, out.id, 16);
  div.appendChild(icon);
  const parts = Object.entries(cost)
    .map(([id, n]) => `${n} ${itemDef(Number(id)).name}`)
    .join(' + ');
  div.append(`${itemDef(out.id).name} ← ${parts}`);
  return div;
}

function buildRecipeList() {
  recipeListEl.innerHTML = '';
  const header = (label) => {
    const h = document.createElement('div');
    h.className = 'rhead';
    h.textContent = label;
    recipeListEl.appendChild(h);
  };
  const totalOf = (cost) => Object.values(cost).reduce((a, b) => a + b, 0);
  const small = [];   // fits the 2x2 inventory grid
  const large = [];   // needs the crafting table
  for (const r of SHAPELESS) (totalOf(r.need) <= 4 ? small : large).push([r.out, r.need]);
  for (const r of SHAPED_2) small.push([r.out, shapeCostOf(r.shape)]);
  for (const r of SHAPED_3) large.push([r.out, shapeCostOf(r.shape)]);
  header('2x2 GRID');
  for (const [out, cost] of small) recipeListEl.appendChild(recipeEntry(out, cost));
  header('CRAFTING TABLE (3x3)');
  for (const [out, cost] of large) recipeListEl.appendChild(recipeEntry(out, cost));
}
buildRecipeList();

// ---- Debug handle ----------------------------------------------------------------
// With ?debug=1 the page exposes the live world/player for automated browser
// checks (Playwright) and manual console poking. `world` rebinds on dimension
// travel, hence the getter.
if (new URLSearchParams(location.search).has('debug')) {
  window.__game = {
    get world() { return world; },
    player,
    inventory,
    BLOCK,
    ITEM,
    get fluids() { return fluids; },
    get boats() { return boats; },
    get drops() { return drops; },
    get mobs() { return mobs; },
    dayNight,
    survival,
    MOB_DEFS,
    // Horse riding, callable from automated checks.
    mountHorse: (m) => mountHorse(m),
    dismountHorse: () => dismountHorse(),
    get ridingHorse() { return ridingHorse; },
    // Debug edits also wake the fluid sim, matching player place/break.
    setBlock: (x, y, z, id, meta = 0) => {
      world.setBlock(x, y, z, id, meta);
      fluids.wake(x, y, z);
    },
  };
}

// Show the crafting UI (survival) or the item picker (creative). In creative
// the picker also replaces the crafting-table screen: everything is free, so
// there is nothing to craft for.
function applyInventoryMode() {
  const creative = isCreative();
  craftTitleEl.classList.toggle('hidden', creative);
  craftRowEl.classList.toggle('hidden', creative);
  recipesTitleEl.classList.toggle('hidden', creative);
  recipeListEl.classList.toggle('hidden', creative);
  creativePanelEl.classList.toggle('hidden', !creative);
  if (creative) {
    // Return anything parked in the (now hidden) craft grid.
    for (let i = 0; i < 9; i++) {
      if (craft[i]) { inventory.addStack(craft[i]); craft[i] = null; }
    }
    rebuildCreativeGrid();
  }
}

function openInventory(size = 2) {
  if (!survival.alive) return;
  invOpen = true;
  setCraftSize(size);
  applyInventoryMode();
  if (player.controls.isLocked) player.controls.unlock();
  inventoryEl.classList.remove('hidden');
  refreshInventory();
}

// Return any items left in the cursor / craft grid to the inventory so nothing
// is lost when the screen closes.
function closeInventory() {
  invOpen = false;
  if (held) { inventory.addStack(held); held = null; }
  for (let i = 0; i < 9; i++) {
    if (craft[i]) { inventory.addStack(craft[i]); craft[i] = null; }
  }
  inventoryEl.classList.add('hidden');
  heldStackEl.classList.remove('active');
  if (survival.alive) overlay.classList.remove('hidden'); // click to re-lock
  refreshHotbar();
  scheduleSave();
}

function toggleInventory() {
  if (furnaceOpen) { closeFurnace(); return; }
  if (chestOpen) { closeChest(); return; }
  if (invOpen) closeInventory();
  else openInventory();
}

// ---- Armor slots in inventory -----------------------------------------------
const armorHeadEl = document.getElementById('armorHead');
const armorChestEl = document.getElementById('armorChest');
const armorLegsEl = document.getElementById('armorLegs');
const armorFeetEl = document.getElementById('armorFeet');
armorHeadEl.innerHTML = '<span class="count"></span>';
armorChestEl.innerHTML = '<span class="count"></span>';
armorLegsEl.innerHTML = '<span class="count"></span>';
armorFeetEl.innerHTML = '<span class="count"></span>';

function paintArmorSlots() {
  paintCell(armorHeadEl, survival.armor.head);
  paintCell(armorChestEl, survival.armor.chest);
  paintCell(armorLegsEl, survival.armor.legs);
  paintCell(armorFeetEl, survival.armor.feet);
}

// Armor slots hold full stacks so enchanted/damaged pieces keep their state.
function onArmorSlotClick(slot, e) {
  const current = survival.armor[slot];
  if (held) {
    if (armorSlotOf(held.id) !== slot || held.count !== 1) return;
    survival.armor[slot] = held;
    held = current || null;
  } else if (current) {
    held = current;
    survival.armor[slot] = null;
  }
  refreshInventory();
  scheduleSave();
}

armorHeadEl.addEventListener('mousedown', (e) => { e.preventDefault(); onArmorSlotClick('head', e); });
armorChestEl.addEventListener('mousedown', (e) => { e.preventDefault(); onArmorSlotClick('chest', e); });
armorLegsEl.addEventListener('mousedown', (e) => { e.preventDefault(); onArmorSlotClick('legs', e); });
armorFeetEl.addEventListener('mousedown', (e) => { e.preventDefault(); onArmorSlotClick('feet', e); });

// ---- Furnace screen ---------------------------------------------------------
const furnaceScreenEl = document.getElementById('furnaceScreen');
const furnaceInputEl = document.getElementById('furnaceInput');
const furnaceOutputEl = document.getElementById('furnaceOutput');
const furnaceFuelEl = document.getElementById('furnaceFuel');
const furnaceFlameEl = document.getElementById('furnaceFlame');
const furnaceProgressEl = document.getElementById('furnaceProgress');
const furnaceBackpackGridEl = document.getElementById('furnaceBackpackGrid');
const furnaceHotbarGridEl = document.getElementById('furnaceHotbarGrid');

furnaceInputEl.innerHTML = '<span class="count"></span>';
furnaceOutputEl.innerHTML = '<span class="count"></span>';
furnaceFuelEl.innerHTML = '<span class="count"></span>';

let furnaceOpen = false;
let openFurnaceKey = null;

const furnaceBackpackCells = [];
const furnaceHotbarCells = [];

for (let i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) {
  const cell = makeCell((e) => onFurnaceInvClick(i, e));
  furnaceBackpackCells.push(cell);
  furnaceBackpackGridEl.appendChild(cell);
}
for (let i = 0; i < HOTBAR_SIZE; i++) {
  const cell = makeCell((e) => onFurnaceInvClick(i, e));
  furnaceHotbarCells.push(cell);
  furnaceHotbarGridEl.appendChild(cell);
}

function refreshFurnace() {
  if (!openFurnaceKey) return;
  const s = furnaces.getOrCreate(openFurnaceKey);
  paintCell(furnaceInputEl, s.input);
  paintCell(furnaceFuelEl, s.fuel);
  paintCell(furnaceOutputEl, s.output);
  furnaceFlameEl.classList.toggle('active', s.burn > 0);
  const pct = s.burn > 0 && s.cook > 0 ? Math.floor((s.cook / SMELT_TIME) * 100) : 0;
  furnaceProgressEl.textContent = s.burn > 0 ? `${pct}%` : '';
  for (let i = 0; i < HOTBAR_SIZE; i++) paintCell(furnaceHotbarCells[i], inventory.get(i));
  for (let i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) paintCell(furnaceBackpackCells[i - HOTBAR_SIZE], inventory.get(i));
  paintHeld();
}

function onFurnaceSlotClick(slotName, e) {
  if (!openFurnaceKey) return;
  const s = furnaces.getOrCreate(openFurnaceKey);
  const slot = s[slotName];
  const isOutput = slotName === 'output';

  if (isOutput) {
    if (!slot) return;
    if (held && (held.id !== slot.id || held.count + slot.count > itemStackMax(slot.id))) return;
    if (held) held.count += slot.count;
    else held = { id: slot.id, count: slot.count };
    achievements.trigger({ type: 'smelt', item: slot.id });
    s.output = null;
    refreshFurnace();
    scheduleSave();
    return;
  }

  if (e && e.button === 2) {
    if (held) {
      if (slotName === 'fuel' && fuelValue(held.id) <= 0) return;
      if (slotName === 'input' && !smeltResult(held.id)) return;
      if (!slot) {
        s[slotName] = { id: held.id, count: 1 };
        held.count -= 1;
        if (held.count <= 0) held = null;
      } else if (slot.id === held.id && slot.count < itemStackMax(slot.id)) {
        slot.count += 1;
        held.count -= 1;
        if (held.count <= 0) held = null;
      }
    } else if (slot) {
      const take = Math.ceil(slot.count / 2);
      held = { id: slot.id, count: take };
      slot.count -= take;
      if (slot.count <= 0) s[slotName] = null;
    }
    refreshFurnace();
    scheduleSave();
    return;
  }

  if (held && slot && slot.id === held.id) {
    const room = itemStackMax(slot.id) - slot.count;
    const move = Math.min(room, held.count);
    slot.count += move;
    held.count -= move;
    if (held.count <= 0) held = null;
  } else {
    if (held && slotName === 'fuel' && fuelValue(held.id) <= 0) { /* can't place non-fuel */ }
    else if (held && slotName === 'input' && !smeltResult(held.id)) { /* can't place non-smeltable */ }
    else {
      s[slotName] = held;
      held = slot;
    }
  }
  refreshFurnace();
  scheduleSave();
}

function onFurnaceInvClick(i, e) {
  const slot = inventory.get(i);
  if (e && e.button === 2) {
    if (held) {
      if (!slot) {
        inventory.slots[i] = { id: held.id, count: 1 };
        held.count -= 1;
        if (held.count <= 0) held = null;
      } else if (slot.id === held.id && slot.count < itemStackMax(slot.id)) {
        slot.count += 1;
        held.count -= 1;
        if (held.count <= 0) held = null;
      }
    } else if (slot) {
      const take = Math.ceil(slot.count / 2);
      held = { id: slot.id, count: take };
      slot.count -= take;
      if (slot.count <= 0) inventory.slots[i] = null;
    }
    refreshFurnace();
    scheduleSave();
    return;
  }
  if (held && slot && slot.id === held.id) {
    const room = itemStackMax(slot.id) - slot.count;
    const move = Math.min(room, held.count);
    slot.count += move;
    held.count -= move;
    if (held.count <= 0) held = null;
  } else {
    inventory.slots[i] = held;
    held = slot;
  }
  refreshFurnace();
  scheduleSave();
}

furnaceInputEl.addEventListener('mousedown', (e) => { e.preventDefault(); onFurnaceSlotClick('input', e); });
furnaceFuelEl.addEventListener('mousedown', (e) => { e.preventDefault(); onFurnaceSlotClick('fuel', e); });
furnaceOutputEl.addEventListener('mousedown', (e) => { e.preventDefault(); onFurnaceSlotClick('output', e); });

function openFurnace(x, y, z) {
  if (!survival.alive) return;
  openFurnaceKey = dimKey(x, y, z);
  furnaceOpen = true;
  invOpen = false;
  chestOpen = false;
  inventoryEl.classList.add('hidden');
  chestScreenEl.classList.add('hidden');
  if (player.controls.isLocked) player.controls.unlock();
  furnaceScreenEl.classList.remove('hidden');
  refreshFurnace();
}

function closeFurnace() {
  furnaceOpen = false;
  if (held) { inventory.addStack(held); held = null; }
  openFurnaceKey = null;
  furnaceScreenEl.classList.add('hidden');
  heldStackEl.classList.remove('active');
  if (survival.alive) overlay.classList.remove('hidden');
  refreshHotbar();
  scheduleSave();
}

function syncFurnaceBlock(key, burning) {
  // Furnace keys may belong to either dimension ("N|x,y,z" = nether).
  const { isNether, x: fx, y: fy, z: fz } = parseDimKey(key);
  const w = isNether ? netherWorld : overworld;
  if (!w) return;
  const cur = w.getBlock(fx, fy, fz);
  if (burning && cur === BLOCK.FURNACE) w.setBlock(fx, fy, fz, BLOCK.FURNACE_LIT);
  else if (!burning && cur === BLOCK.FURNACE_LIT) w.setBlock(fx, fy, fz, BLOCK.FURNACE);
}

// ---- Chest screen -----------------------------------------------------------
const chestScreenEl = document.getElementById('chestScreen');
const chestGridEl = document.getElementById('chestGrid');
const chestBackpackGridEl = document.getElementById('chestBackpackGrid');
const chestHotbarGridEl = document.getElementById('chestHotbarGrid');

let chestOpen = false;
let openChestKey = null;

const chestCells = [];
const chestBackpackCells = [];
const chestHotbarCells = [];

for (let i = 0; i < CHEST_SLOTS; i++) {
  const cell = makeCell((e) => onChestSlotClick(i, e));
  chestCells.push(cell);
  chestGridEl.appendChild(cell);
}
for (let i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) {
  const cell = makeCell((e) => onChestInvClick(i, e));
  chestBackpackCells.push(cell);
  chestBackpackGridEl.appendChild(cell);
}
for (let i = 0; i < HOTBAR_SIZE; i++) {
  const cell = makeCell((e) => onChestInvClick(i, e));
  chestHotbarCells.push(cell);
  chestHotbarGridEl.appendChild(cell);
}

function refreshChest() {
  if (!openChestKey) return;
  const slots = chests.getOrCreate(openChestKey);
  for (let i = 0; i < CHEST_SLOTS; i++) paintCell(chestCells[i], slots[i]);
  for (let i = 0; i < HOTBAR_SIZE; i++) paintCell(chestHotbarCells[i], inventory.get(i));
  for (let i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) paintCell(chestBackpackCells[i - HOTBAR_SIZE], inventory.get(i));
  paintHeld();
}

function onChestSlotClick(i, e) {
  if (!openChestKey) return;
  const slots = chests.getOrCreate(openChestKey);
  const slot = slots[i];
  if (e && e.button === 2) {
    if (held) {
      if (!slot) {
        slots[i] = { id: held.id, count: 1 };
        held.count -= 1;
        if (held.count <= 0) held = null;
      } else if (slot.id === held.id && slot.count < itemStackMax(slot.id)) {
        slot.count += 1;
        held.count -= 1;
        if (held.count <= 0) held = null;
      }
    } else if (slot) {
      const take = Math.ceil(slot.count / 2);
      held = { id: slot.id, count: take };
      slot.count -= take;
      if (slot.count <= 0) slots[i] = null;
    }
    refreshChest();
    scheduleSave();
    return;
  }
  if (held && slot && slot.id === held.id) {
    const room = itemStackMax(slot.id) - slot.count;
    const move = Math.min(room, held.count);
    slot.count += move;
    held.count -= move;
    if (held.count <= 0) held = null;
  } else {
    slots[i] = held;
    held = slot;
  }
  refreshChest();
  scheduleSave();
}

function onChestInvClick(i, e) {
  const slot = inventory.get(i);
  if (e && e.button === 2) {
    if (held) {
      if (!slot) {
        inventory.slots[i] = { id: held.id, count: 1 };
        held.count -= 1;
        if (held.count <= 0) held = null;
      } else if (slot.id === held.id && slot.count < itemStackMax(slot.id)) {
        slot.count += 1;
        held.count -= 1;
        if (held.count <= 0) held = null;
      }
    } else if (slot) {
      const take = Math.ceil(slot.count / 2);
      held = { id: slot.id, count: take };
      slot.count -= take;
      if (slot.count <= 0) inventory.slots[i] = null;
    }
    refreshChest();
    scheduleSave();
    return;
  }
  if (held && slot && slot.id === held.id) {
    const room = itemStackMax(slot.id) - slot.count;
    const move = Math.min(room, held.count);
    slot.count += move;
    held.count -= move;
    if (held.count <= 0) held = null;
  } else {
    inventory.slots[i] = held;
    held = slot;
  }
  refreshChest();
  scheduleSave();
}

function openChest(x, y, z) {
  if (!survival.alive) return;
  openChestKey = dimKey(x, y, z);
  // First open of a naturally-generated chest: roll its loot table.
  const posKey = `${x},${y},${z}`;
  if (!chests.chests.has(openChestKey) && world.structureLoot && world.structureLoot.has(posKey)) {
    const kind = world.structureLoot.get(posKey);
    world.structureLoot.delete(posKey);
    let seed = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2246822519) ^ 0x5bf03635) | 0;
    const stream = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) / 4294967296;
    };
    const loot = rollLoot(kind, stream);
    const slots = chests.getOrCreate(openChestKey);
    for (let i = 0; i < slots.length && i < loot.length; i++) slots[i] = loot[i];
    achievements.trigger({ type: 'structure', kind });
    scheduleSave();
  }
  chestOpen = true;
  invOpen = false;
  furnaceOpen = false;
  inventoryEl.classList.add('hidden');
  furnaceScreenEl.classList.add('hidden');
  if (player.controls.isLocked) player.controls.unlock();
  chestScreenEl.classList.remove('hidden');
  refreshChest();
}

function closeChest() {
  chestOpen = false;
  if (held) { inventory.addStack(held); held = null; }
  openChestKey = null;
  chestScreenEl.classList.add('hidden');
  heldStackEl.classList.remove('active');
  if (survival.alive) overlay.classList.remove('hidden');
  refreshHotbar();
  scheduleSave();
}

// ---- Enchanting screen --------------------------------------------------------
let enchantOpen = false;

function openEnchantScreen() {
  enchantOpen = true;
  if (player.controls.isLocked) player.controls.unlock();
  overlay.classList.add('hidden');
  enchantScreenEl.classList.remove('hidden');
  refreshEnchantScreen();
}

function closeEnchantScreen() {
  enchantOpen = false;
  enchantScreenEl.classList.add('hidden');
  if (survival.alive) overlay.classList.remove('hidden');
}

function refreshEnchantScreen() {
  const heldStack = inventory.get(selected);
  if (!heldStack || !isEnchantable(heldStack.id)) {
    enchantItemEl.textContent = 'Hold an enchantable item in the hotbar.';
    enchantListEl.innerHTML = '';
    enchantLevelEl.textContent = `Level: ${xpManager.level}`;
    return;
  }
  const def = itemDef(heldStack.id);
  enchantItemEl.textContent = `Item: ${def.name}`;
  enchantLevelEl.textContent = `Level: ${xpManager.level} (cost: 3 levels per enchantment)`;
  const available = xpManager.getAvailableEnchantments(heldStack.id);
  enchantListEl.innerHTML = '';
  for (const ench of available) {
    const curLevel = (heldStack.enchantments && heldStack.enchantments[ench.key]) || 0;
    const maxed = curLevel >= ench.maxLevel;
    const canAfford = xpManager.level >= 3;
    const div = document.createElement('div');
    div.className = 'ench-option' + (maxed || !canAfford ? ' disabled' : '');
    div.innerHTML = `<span>${ench.name} ${curLevel > 0 ? 'Lv' + curLevel + ' → Lv' + (curLevel + 1) : 'I'}</span><span>${maxed ? 'MAX' : '3 Lv'}</span>`;
    if (!maxed && canAfford) {
      div.onclick = () => {
        if (xpManager.enchant(heldStack, ench.key)) {
          achievements.trigger({ type: 'enchant' });
          feedback.play('pickup');
          refreshEnchantScreen();
          refreshHotbar();
          scheduleSave();
        }
      };
    }
    enchantListEl.appendChild(div);
  }
}

enchantScreenEl.addEventListener('click', (e) => {
  if (e.target === enchantScreenEl) closeEnchantScreen();
});

// ---- Trading screen -----------------------------------------------------------
const tradeScreenEl = document.getElementById('tradeScreen');
const tradeListEl = document.getElementById('tradeList');
let tradeOpen = false;

const TRADES = [
  { give: { id: ITEM.COAL, count: 10 }, get: { id: ITEM.IRON_INGOT, count: 1 } },
  { give: { id: ITEM.RAW_IRON, count: 4 }, get: { id: ITEM.GOLD_INGOT, count: 1 } },
  { give: { id: ITEM.IRON_INGOT, count: 3 }, get: { id: ITEM.DIAMOND, count: 1 } },
  { give: { id: ITEM.LEATHER, count: 4 }, get: { id: ITEM.IRON_INGOT, count: 1 } },
  { give: { id: ITEM.STRING, count: 8 }, get: { id: ITEM.IRON_INGOT, count: 1 } },
  { give: { id: ITEM.GOLD_INGOT, count: 2 }, get: { id: ITEM.APPLE, count: 8 } },
  { give: { id: ITEM.DIAMOND, count: 1 }, get: { id: BLOCK.ENCHANTING_TABLE, count: 1 } },
];

function openTradeScreen() {
  tradeOpen = true;
  if (player.controls.isLocked) player.controls.unlock();
  overlay.classList.add('hidden');
  tradeScreenEl.classList.remove('hidden');
  refreshTradeScreen();
}

function closeTradeScreen() {
  tradeOpen = false;
  tradeScreenEl.classList.add('hidden');
  if (survival.alive) overlay.classList.remove('hidden');
}

function refreshTradeScreen() {
  tradeListEl.innerHTML = '';
  for (const trade of TRADES) {
    const giveName = itemDef(trade.give.id).name;
    const getName = itemDef(trade.get.id).name;
    const hasEnough = inventory.count(trade.give.id) >= trade.give.count;
    const div = document.createElement('div');
    div.className = 'trade-option' + (hasEnough ? '' : ' disabled');
    div.innerHTML = `<span>${trade.give.count}x ${giveName}</span><span>→ ${trade.get.count}x ${getName}</span>`;
    if (hasEnough) {
      div.onclick = () => {
        inventory.remove(trade.give.id, trade.give.count);
        inventory.add(trade.get.id, trade.get.count);
        achievements.trigger({ type: 'trade' });
        feedback.play('pickup');
        refreshTradeScreen();
        refreshHotbar();
        scheduleSave();
      };
    }
    tradeListEl.appendChild(div);
  }
}

tradeScreenEl.addEventListener('click', (e) => {
  if (e.target === tradeScreenEl) closeTradeScreen();
});

// ---- Minecart riding ----------------------------------------------------------
function mountCart(cart) {
  ridingCart = cart;
  cart.ridden = true;
  player.riding = cart;
  achievements.trigger({ type: 'ride' });
  survival._setMessage('Riding (Space to hop off)');
}

function dismountCart() {
  if (!ridingCart) return;
  ridingCart.ridden = false;
  const cart = ridingCart;
  ridingCart = null;
  player.riding = null;
  // Hop straight up off the cart — the rail cell itself is always open.
  player.getObject().position.set(cart.x, cart.railY + 1 + 1.62, cart.z);
  player.velocity.set(0, 4, 0);
}

// ---- Boat riding (mirrors minecart riding) --------------------------------------
function mountBoat(boat) {
  ridingBoat = boat;
  boat.ridden = true;
  player.riding = boat;
  achievements.trigger({ type: 'ride' });
  survival._setMessage('Boarding (Space to hop off)');
}

function dismountBoat() {
  if (!ridingBoat) return;
  ridingBoat.ridden = false;
  const boat = ridingBoat;
  ridingBoat = null;
  player.riding = null;
  player.getObject().position.set(boat.x, boat.y + 1 + 1.62, boat.z);
  player.velocity.set(0, 4, 0);
}

// ---- Horse riding (boat pattern, but the mount is a mob) ------------------------
// Space JUMPS (the horse has real gravity), so Shift dismounts instead.
function mountHorse(horse) {
  ridingHorse = horse;
  horse.ridden = true;
  player.riding = horse;
  achievements.trigger({ type: 'ride' });
  survival._setMessage('Riding (WASD to steer, Space jumps, Shift dismounts)');
}

function dismountHorse() {
  if (!ridingHorse) return;
  const horse = ridingHorse;
  horse.ridden = false;
  ridingHorse = null;
  player.riding = null;
  const hp = horse.mesh.position;
  player.getObject().position.set(hp.x + 0.9, hp.y + 1 + 1.62, hp.z);
  player.velocity.set(0, 3, 0);
}

// ---- Fishing -----------------------------------------------------------------
// A single per-player bobber: cast on right click, floats when it lands in
// water, "bites" after a random 5-15 s wait (short dip + sound cue). Reeling
// during the bite window lands a raw fish that flies toward the player.
let bobber = null;

function makeBobberMesh() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.08, 0.14),
    new THREE.MeshLambertMaterial({ color: 0xd8352a }),
  );
  top.position.y = 0.04;
  g.add(top);
  const bottom = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.08, 0.14),
    new THREE.MeshLambertMaterial({ color: 0xf2f2f4 }),
  );
  bottom.position.y = -0.04;
  g.add(bottom);
  return g;
}

function removeBobber() {
  if (!bobber) return;
  scene.remove(bobber.mesh);
  bobber.mesh.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  bobber = null;
}

function castBobber() {
  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_dir);
  const mesh = makeBobberMesh();
  mesh.position.copy(_origin).addScaledVector(_dir, 0.5);
  scene.add(mesh);
  bobber = {
    mesh,
    vel: _dir.clone().multiplyScalar(11).add(new THREE.Vector3(0, 2.5, 0)),
    state: 'fly',           // 'fly' -> 'float' -> 'bite' -> back to 'float'
    t: 0,
    wait: 0,
    bite: 0,
    baseY: 0,
  };
  feedback.play('bowShoot');
}

function reelInBobber() {
  const wasBite = bobber.state === 'bite';
  const pos = bobber.mesh.position.clone();
  removeBobber();
  consumeDurability(selected, 1);
  if (wasBite) {
    drops.spawn(ITEM.RAW_FISH, 1, pos);
    const d = drops.drops[drops.drops.length - 1];
    if (d) {
      // The catch flies out of the water toward the player.
      const to = player.getObject().position.clone().sub(pos);
      to.y = 0;
      to.normalize();
      d.velocity.set(to.x * 7, 6.5, to.z * 7);
    }
    survival._setMessage('Caught a fish!');
    feedback.play('pickup');
  }
  refreshHotbar();
  scheduleSave();
}

function updateFishing(dt) {
  if (!bobber) return;
  const heldStack = inventory.get(selected);
  // Switching items, dying or wandering off abandons the line.
  if (!heldStack || heldStack.id !== ITEM.FISHING_ROD || !survival.alive) {
    removeBobber();
    return;
  }
  const b = bobber;
  const p = b.mesh.position;
  b.t += dt;
  if (b.state === 'fly') {
    b.vel.y -= 9 * dt;               // gentle arc
    p.addScaledVector(b.vel, dt);
    const cell = world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    if (cell === BLOCK.WATER) {
      // Snap to the water surface of this column and start waiting.
      let wy = Math.floor(p.y);
      while (world.getBlock(Math.floor(p.x), wy + 1, Math.floor(p.z)) === BLOCK.WATER) wy++;
      b.baseY = wy + 0.8;
      b.state = 'float';
      b.wait = 5 + Math.random() * 10;
      feedback.placeBurst(BLOCK.WATER, p.clone());
    } else if (isSolid(cell) || p.y < -4 || b.t > 12) {
      removeBobber();               // hit land / lost: line snaps back silently
      return;
    }
  } else if (b.state === 'float') {
    p.y = b.baseY + Math.sin(b.t * 2.2) * 0.04;
    b.wait -= dt;
    if (b.wait <= 0) {
      b.state = 'bite';
      b.bite = 0.8;                 // reel within this window to land the fish
      feedback.play('pickup');
      feedback.placeBurst(BLOCK.WATER, p.clone());
    }
  } else if (b.state === 'bite') {
    p.y = b.baseY - 0.25;           // the dip is the visual cue
    b.bite -= dt;
    if (b.bite <= 0) {
      b.state = 'float';
      b.wait = 5 + Math.random() * 10;
    }
  }
  if (p.distanceTo(player.getObject().position) > 40) removeBobber();
}

// ---- Achievements page ----------------------------------------------------------
const achievementsScreenEl = document.getElementById('achievementsScreen');
const achievementsListEl = document.getElementById('achievementsList');
const achievementsProgressEl = document.getElementById('achievementsProgress');
const achievementsCloseEl = document.getElementById('achievementsClose');
let achievementsOpen = false;

function refreshAchievementsScreen() {
  const all = achievements.getAll();
  const unlocked = all.filter((a) => a.unlocked).length;
  achievementsProgressEl.textContent = `${unlocked} / ${all.length} unlocked`;
  achievementsListEl.innerHTML = '';
  for (const a of all) {
    const div = document.createElement('div');
    div.className = 'achv' + (a.unlocked ? '' : ' locked');
    div.innerHTML = `<div class="name">${a.unlocked ? '🏆 ' : '🔒 '}${a.name}</div><div class="desc">${a.desc}</div>`;
    achievementsListEl.appendChild(div);
  }
}

function toggleAchievements() {
  achievementsOpen = !achievementsOpen;
  achievementsScreenEl.classList.toggle('hidden', !achievementsOpen);
  if (achievementsOpen) {
    refreshAchievementsScreen();
    if (player.controls.isLocked) player.controls.unlock();
    overlay.classList.add('hidden');
  } else if (survival.alive) {
    overlay.classList.remove('hidden');
  }
}

achievementsCloseEl.addEventListener('click', toggleAchievements);
achievementsScreenEl.addEventListener('click', (e) => {
  if (e.target === achievementsScreenEl) toggleAchievements();
});

// ---- Mobile touch controls --------------------------------------------------
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (isTouchDevice) {
  const joystick = document.getElementById('touch-joystick');
  const knob = joystick && joystick.querySelector('.knob');
  let joystickActive = false;
  let joyX = 0, joyY = 0;

  if (joystick) {
    joystick.addEventListener('touchstart', (e) => { joystickActive = true; e.preventDefault(); });
    joystick.addEventListener('touchmove', (e) => {
      const rect = joystick.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const t = e.touches[0];
      const dx = (t.clientX - cx) / (rect.width / 2);
      const dy = (t.clientY - cy) / (rect.height / 2);
      const len = Math.hypot(dx, dy);
      joyX = len > 1 ? dx / len : dx;
      joyY = len > 1 ? dy / len : dy;
      if (knob) knob.style.transform = `translate(calc(-50% + ${joyX * 30}px), calc(-50% + ${joyY * 30}px))`;
      e.preventDefault();
    });
    const endJoy = () => { joystickActive = false; joyX = 0; joyY = 0; if (knob) knob.style.transform = 'translate(-50%,-50%)'; };
    joystick.addEventListener('touchend', endJoy);
    joystick.addEventListener('touchcancel', endJoy);
  }

  // Feed joystick into player keys
  const origUpdate = player.update.bind(player);
  player.update = function(dt) {
    if (joystickActive) {
      this.keys['KeyW'] = joyY < -0.3;
      this.keys['KeyS'] = joyY > 0.3;
      this.keys['KeyA'] = joyX < -0.3;
      this.keys['KeyD'] = joyX > 0.3;
    }
    origUpdate(dt);
    if (joystickActive) {
      this.keys['KeyW'] = false; this.keys['KeyS'] = false;
      this.keys['KeyA'] = false; this.keys['KeyD'] = false;
    }
  };

  const jumpBtn = document.getElementById('touch-jump');
  if (jumpBtn) {
    jumpBtn.addEventListener('touchstart', (e) => { player.keys['Space'] = true; e.preventDefault(); });
    jumpBtn.addEventListener('touchend', () => { player.keys['Space'] = false; });
    jumpBtn.addEventListener('touchcancel', () => { player.keys['Space'] = false; });
  }

  const mineBtn = document.getElementById('touch-mine');
  if (mineBtn) {
    mineBtn.addEventListener('touchstart', (e) => {
      renderer.domElement.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
      e.preventDefault();
    });
    mineBtn.addEventListener('touchend', () => {
      renderer.domElement.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    });
  }

  const placeBtn = document.getElementById('touch-place');
  if (placeBtn) {
    placeBtn.addEventListener('touchstart', (e) => {
      renderer.domElement.dispatchEvent(new MouseEvent('mousedown', { button: 2 }));
      e.preventDefault();
    });
  }

  const invBtn = document.getElementById('touch-inv');
  if (invBtn) {
    invBtn.addEventListener('touchstart', (e) => { toggleInventory(); e.preventDefault(); });
  }

  // Touch look (right half of screen)
  let lookTouch = null;
  renderer.domElement.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (t.clientX > window.innerWidth * 0.4 && !lookTouch) {
        lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }
  });
  renderer.domElement.addEventListener('touchmove', (e) => {
    if (!lookTouch) return;
    for (const t of e.changedTouches) {
      if (t.identifier === lookTouch.id) {
        const dx = t.clientX - lookTouch.x;
        const dy = t.clientY - lookTouch.y;
        lookTouch.x = t.clientX;
        lookTouch.y = t.clientY;
        const euler = new THREE.Euler(0, 0, 0, 'YXZ');
        euler.setFromQuaternion(camera.quaternion);
        euler.y -= dx * 0.004;
        euler.x -= dy * 0.004;
        euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
        camera.quaternion.setFromEuler(euler);
      }
    }
    e.preventDefault();
  });
  const endLook = (e) => {
    for (const t of e.changedTouches) {
      if (lookTouch && t.identifier === lookTouch.id) lookTouch = null;
    }
  };
  renderer.domElement.addEventListener('touchend', endLook);
  renderer.domElement.addEventListener('touchcancel', endLook);

  // Auto-lock on touch (bypass pointer lock prompt)
  renderer.domElement.addEventListener('touchstart', () => {
    if (!player.controls.isLocked) {
      player.controls.isLocked = true;
      overlay.classList.add('hidden');
    }
  }, { once: true });
}

// ---- First-person held item ---------------------------------------------------
// A small mesh parented to the camera shows what the player is holding, with a
// swing animation on attack/mine/place and a draw pose while charging the bow.
const handGroup = new THREE.Group();
camera.add(handGroup);
const HAND_POS = { x: 0.42, y: -0.36, z: -0.72 };
handGroup.position.set(HAND_POS.x, HAND_POS.y, HAND_POS.z);
handGroup.rotation.set(-0.1, 0.3, 0.05);

const tileTexCache = new Map();
function tileTexture(tile) {
  let tex = tileTexCache.get(tile);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d');
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  ctx.drawImage(atlas.image, col * 16, row * 16, 16, 16, 0, 0, 16, 16);
  tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tileTexCache.set(tile, tex);
  return tex;
}

let handMesh = null;
let handItemId = undefined; // undefined = force first build (null = bare hand)
const armMaterial = new THREE.MeshLambertMaterial({ color: 0xd8a582, depthTest: false });

function updateHandItem() {
  const stack = inventory.get(selected);
  const id = stack ? stack.id : null;
  if (id === handItemId) return;
  handItemId = id;
  if (handMesh) {
    handGroup.remove(handMesh);
    if (handMesh.material !== armMaterial) handMesh.material.dispose();
    handMesh.geometry.dispose();
  }
  if (id == null) {
    // Bare arm
    handMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.16), armMaterial);
    handMesh.rotation.set(0.6, 0, -0.15);
    handMesh.position.set(0.05, -0.1, 0.1);
  } else if (isBlockItem(id)) {
    const mat = new THREE.MeshLambertMaterial({ map: tileTexture(itemDef(id).tile), depthTest: false });
    handMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), mat);
    handMesh.rotation.set(0.1, 0.8, 0);
    handMesh.position.set(0, 0, 0);
  } else {
    const mat = new THREE.MeshBasicMaterial({
      map: tileTexture(itemDef(id).tile),
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    handMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.44), mat);
    handMesh.rotation.set(0, -0.4, -0.7);
    handMesh.position.set(0, 0.05, 0);
  }
  handMesh.renderOrder = 999;
  handGroup.add(handMesh);
}

let swingT = 0;
const SWING_TIME = 0.26;
function triggerSwing() {
  swingT = SWING_TIME;
}

function updateHand(dt) {
  updateHandItem();
  if (swingT > 0) swingT = Math.max(0, swingT - dt);
  // Keep swinging while mining is held down.
  if (primaryDown && mining && swingT <= 0) swingT = SWING_TIME;
  const s = swingT > 0 ? Math.sin((1 - swingT / SWING_TIME) * Math.PI) : 0;
  const bob = player.isMoving && player.onGround ? Math.sin(waterTime * 8) * 0.014 : 0;
  const draw = bowCharging ? Math.min(1, bowCharge / BOW_CHARGE_TIME) : 0;
  handGroup.rotation.x = -0.1 - s * 0.85;
  handGroup.rotation.y = 0.3 + draw * 0.25;
  handGroup.position.set(
    HAND_POS.x - draw * 0.1,
    HAND_POS.y + bob - s * 0.06,
    HAND_POS.z - s * 0.12 + draw * 0.16,
  );
  handGroup.visible = player.controls.isLocked && survival.alive;
}

// ---- Main loop --------------------------------------------------------------
const clock = new THREE.Clock();
let frames = 0;
let fpsAccum = 0;
let fps = 0;
let waterTime = 0;
let stepTimer = 0;
let mobSoundTimer = 3;
let cropTickTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  let dt = clock.getDelta();
  if (dt > 0.05) dt = 0.05;
  if (attackCooldown > 0) attackCooldown = Math.max(0, attackCooldown - dt);

  const p = player.getObject().position;

  waterTime += dt;
  setWaterTime(waterTime);

  player.update(dt);
  // Footstep sounds
  if (player.isMoving && player.onGround && player.controls.isLocked) {
    stepTimer += dt;
    if (stepTimer >= (player.isSprinting ? 0.3 : 0.42)) {
      stepTimer = 0;
      feedback.play('walk');
    }
  } else {
    stepTimer = 0;
  }
  if (player.landedThisFrame && player.lastFallDistance > 1.5) feedback.play('fall');
  survival.update(dt, player, player.controls.isLocked);
  if (!survival.alive && player.controls.isLocked) player.controls.unlock();
  updateMining(dt);

  // Bow drawing: charge while the right button is held, zoom in slightly and
  // show the charge on the progress bar. Cancelled by UI screens or death.
  if (bowCharging) {
    const heldStack = inventory.get(selected);
    if (!player.controls.isLocked || !survival.alive || invOpen || furnaceOpen || chestOpen ||
        !heldStack || heldStack.id !== ITEM.BOW) {
      cancelBowCharge();
    } else {
      bowCharge += dt;
      const charge = Math.min(1, bowCharge / BOW_CHARGE_TIME);
      camera.fov = BASE_FOV - 12 * charge;
      camera.updateProjectionMatrix();
      breakProgressEl.classList.add('active');
      breakProgressFillEl.style.transform = `scaleX(${charge})`;
    }
  }

  // TNT fuses and flying arrows.
  updateFuses(dt);
  const arrowEvents = projectiles.update(dt, p, mobs.mobs);
  for (const ev of arrowEvents) {
    if (ev.type === 'player') {
      survival.damage(ev.damage, ev.kind === 'fire' ? 'Fireball' : ev.kind === 'flask' ? 'Witch flask' : 'Arrow hit');
    } else if (ev.type === 'flaskBreak') {
      feedback.smokePuff(ev.pos);
    } else if (ev.type === 'mob') {
      const result = mobs.damageMob(ev.mob, ev.damage, ev.pos);
      feedback.play(result && result.killed ? 'mobDeath' : 'hit');
      if (result && result.killed) handleMobKill(result);
      scheduleSave();
    } else if (ev.type === 'fireBurst') {
      feedback.placeBurst(BLOCK.LAVA, ev.pos);
    } else if (ev.type === 'stuckExpired' && ev.fromPlayer && Math.random() < 0.5) {
      // Half of the player's landed arrows can be picked back up.
      drops.spawn(ITEM.ARROW, 1, ev.pos);
    }
  }

  updateHand(dt);

  // Redstone tick engine (buttons, plates, repeaters, pistons, lamps, rails).
  redstone.update(dt, p, mobs.mobs, minecarts.carts);

  // Flowing liquids (5 Hz cellular automaton; writes persist as world edits).
  if (fluids.update(dt)) scheduleSave();

  // Fishing bobber (cast/float/bite state machine).
  updateFishing(dt);

  // Minecarts: physics + riding.
  const cartEvents = minecarts.update(dt, p, mobs.mobs);
  for (const ev of cartEvents) {
    if (ev.type === 'hitMob') {
      const result = mobs.damageMob(ev.mob, ev.damage, ev.pos);
      if (result && result.killed) handleMobKill(result);
    }
  }
  if (ridingCart) {
    // WASD nudges the cart along its axis; Space hops off.
    if (player.keys['Space']) {
      dismountCart();
    } else {
      camera.getWorldDirection(_dir);
      const along = _dir.x * ridingCart.dir[0] + _dir.z * ridingCart.dir[1];
      const fwd = along >= 0 ? 1 : -1;
      if (player.keys['KeyW']) minecarts.push(ridingCart, fwd, dt);
      if (player.keys['KeyS']) minecarts.push(ridingCart, -fwd, dt);
      player.getObject().position.set(ridingCart.x, ridingCart.visualY + 0.5 + 1.35, ridingCart.z);
      if (Math.abs(ridingCart.v) > 1 && Math.random() < dt * 6) feedback.play('minecart');
    }
  }

  // Boats: floating physics + riding (WASD relative to the camera yaw).
  boats.update(dt, p);
  if (ridingBoat) {
    if (player.keys['Space']) {
      dismountBoat();
    } else {
      camera.getWorldDirection(_dir);
      const fx = _dir.x, fz = _dir.z;
      const fl = Math.hypot(fx, fz) || 1;
      const fwdX = fx / fl, fwdZ = fz / fl;
      const rightX = -fwdZ, rightZ = fwdX;
      let ix = 0, iz = 0;
      if (player.keys['KeyW']) { ix += fwdX; iz += fwdZ; }
      if (player.keys['KeyS']) { ix -= fwdX; iz -= fwdZ; }
      if (player.keys['KeyD']) { ix += rightX; iz += rightZ; }
      if (player.keys['KeyA']) { ix -= rightX; iz -= rightZ; }
      const il = Math.hypot(ix, iz);
      if (il > 0) boats.drive(ridingBoat, ix / il, iz / il, dt);
      player.getObject().position.set(ridingBoat.x, ridingBoat.y + 0.55 + 1.1, ridingBoat.z);
    }
  }

  // Horses: camera-relative steering at ride speed; Space jumps (real mob
  // gravity from mobs.js applies), Shift dismounts.
  if (ridingHorse) {
    if (!mobs.mobs.includes(ridingHorse)) {
      // The horse died or was removed out from under the rider.
      ridingHorse = null;
      player.riding = null;
    } else if (player.keys['ShiftLeft'] || player.keys['ShiftRight']) {
      dismountHorse();
    } else {
      const horse = ridingHorse;
      const hdef = mobDef('horse');
      camera.getWorldDirection(_dir);
      const fx = _dir.x, fz = _dir.z;
      const fl = Math.hypot(fx, fz) || 1;
      const fwdX = fx / fl, fwdZ = fz / fl;
      const rightX = -fwdZ, rightZ = fwdX;
      let ix = 0, iz = 0;
      if (player.keys['KeyW']) { ix += fwdX; iz += fwdZ; }
      if (player.keys['KeyS']) { ix -= fwdX; iz -= fwdZ; }
      if (player.keys['KeyD']) { ix += rightX; iz += rightZ; }
      if (player.keys['KeyA']) { ix -= rightX; iz -= rightZ; }
      const il = Math.hypot(ix, iz);
      if (il > 0) {
        mobs.tryMove(horse, (ix / il) * (hdef.rideSpeed || 9), (iz / il) * (hdef.rideSpeed || 9), dt);
        horse.mesh.rotation.y = Math.atan2(ix / il, iz / il);
      }
      if (player.keys['Space'] && horse.onGround && (horse.vy || 0) === 0) {
        horse.vy = hdef.jumpSpeed || 8.5;
        horse.onGround = false;
      }
      const hp = horse.mesh.position;
      player.getObject().position.set(hp.x, hp.y + 1.35 + 1.15, hp.z);
    }
  }

  // Nether portals: standing inside one for a moment travels between worlds.
  if (portalCooldown > 0) portalCooldown -= dt;
  {
    const feetBlock = world.getBlock(Math.floor(p.x), Math.floor(p.y - 1.0), Math.floor(p.z));
    if (feetBlock === BLOCK.NETHER_PORTAL && portalCooldown <= 0 && !ridingCart && !ridingBoat && !ridingHorse) {
      portalTimer += dt;
      if (Math.random() < dt * 4) feedback.warpBurst(p.clone().add(new THREE.Vector3(0, -1, 0)));
      if (portalTimer >= 1.2) {
        portalTimer = 0;
        travelThroughPortal();
      }
    } else {
      portalTimer = 0;
    }
  }

  world.update(player.getObject().position);
  dayNight.update(dt, player.getObject().position);
  mobs.playerInvulnerable = isCreative();
  mobs.update(dt, player, survival, dayNight.t);
  if (mobs.lastExplosion) {
    feedback.play('explode');
    if (mobs.lastExplosionPos) feedback.explosionBurst(mobs.lastExplosionPos, 3);
    mobs.lastExplosion = false;
    mobs.lastExplosionPos = null;
  }

  // Mob ambient sounds
  mobSoundTimer -= dt;
  if (mobSoundTimer <= 0) {
    mobSoundTimer = 3 + Math.random() * 5;
    for (const m of mobs.mobs) {
      // Ambient sounds are data in the mob registry: { name, range, prob }.
      const snd = mobDef(m.type).sound;
      if (!snd) continue;
      const d = m.mesh.position.distanceTo(p);
      if (d < snd.range && (snd.prob >= 1 || Math.random() < snd.prob)) {
        feedback.play(snd.name);
        break;
      }
    }
  }

  // Crop growth: planted crops only exist as player edits, so scan the edit
  // map once a second and give each growing stage a chance to advance.
  cropTickTimer += dt;
  if (cropTickTimer >= 1) {
    cropTickTimer = 0;
    const grow = [];
    for (const [ck, inner] of world.edits) {
      for (const [lk, v] of inner) {
        const editId = decodeEditId(v);
        const next = nextCropStage(editId);
        if (next && Math.random() < WHEAT_GROW_CHANCE) {
          const [cx, cz] = ck.split(',').map(Number);
          const [lx, y, lz] = lk.split(',').map(Number);
          grow.push({ x: cx * 16 + lx, y, z: cz * 16 + lz, id: next });
        } else if (editId === BLOCK.SUGAR_CANE && Math.random() < CANE_GROW_CHANCE) {
          // Player-planted cane grows a segment: air above, under 3 tall,
          // water still adjacent to the supporting block.
          const [cx, cz] = ck.split(',').map(Number);
          const [lx, y, lz] = lk.split(',').map(Number);
          const x = cx * 16 + lx, z = cz * 16 + lz;
          if (world.getBlock(x, y + 1, z) !== BLOCK.AIR) continue;
          let height = 1;
          while (height < 3 && world.getBlock(x, y - height, z) === BLOCK.SUGAR_CANE) height++;
          if (height >= 3) continue;
          const baseY = y - height;   // the supporting block under the stack
          const wet = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(
            ([dx, dz]) => world.getBlock(x + dx, baseY, z + dz) === BLOCK.WATER,
          );
          if (wet) grow.push({ x, y: y + 1, z, id: BLOCK.SUGAR_CANE });
        }
      }
    }
    if (grow.length) {
      for (const g of grow) world.setBlock(g.x, g.y, g.z, g.id);
      scheduleSave();
    }
  }

  // Tick every known furnace so smelting continues after the UI is closed.
  const furnaceChanges = furnaces.tickAll(dt);
  if (furnaceChanges.length) {
    let needsSave = false;
    for (const change of furnaceChanges) {
      if (change.burnChanged) syncFurnaceBlock(change.key, change.burning);
      if (change.stateChanged || change.burnChanged) needsSave = true;
    }
    if (needsSave) scheduleSave();
    if (furnaceOpen) refreshFurnace();
  }

  if (drops.update(dt, player.getObject().position, inventory)) {
    feedback.play('pickup');
    feedback.pickupSparkle(player.getObject().position.clone().add(new THREE.Vector3(0, -1, 0)));
    for (const id of drops.lastPickedUp) achievements.trigger({ type: 'pickup', item: id });
    refreshHotbar();
    if (invOpen) refreshInventory();
    if (furnaceOpen) refreshFurnace();
    if (chestOpen) refreshChest();
    scheduleSave();
  }
  feedback.update(dt);

  // Weather system (overworld only). Muffle the rain sound underground.
  if (!world.skyless) {
    weather.update(dt, p, (x, z) => world.biomeAt(x, z));
    const surfY = world.getHeight(Math.floor(p.x), Math.floor(p.z));
    const underground = p.y < surfY - 5;
    if (weather.intensity > 0.01 && weather.type === 'rain') {
      feedback.setRainVolume(weather.intensity * (underground ? 0.15 : 1));
    } else {
      feedback.setRainVolume(0);
    }
  }

  // XP orbs
  if (xpManager.update(dt, p)) {
    feedback.play('pickup');
    if (xpManager.leveledUp) {
      feedback.play('levelUp');
      achievements.trigger({ type: 'level', level: xpManager.level });
    }
  }

  // Ambient sounds and music
  {
    const t = dayNight.t;
    const isNight = t < 0.22 || t > 0.78;
    const surfY = world.getHeight(Math.floor(p.x), Math.floor(p.z));
    feedback.updateAmbient(dt, p, world, isNight, surfY);
  }

  // Torch flame particles for nearby torches
  if (Math.random() < dt * 3) {
    const px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
    for (let dy = -4; dy <= 4; dy++) {
      for (let dz = -6; dz <= 6; dz++) {
        for (let dx = -6; dx <= 6; dx++) {
          const bx = px + dx, by = py + dy, bz = pz + dz;
          if (world.getBlock(bx, by, bz) === BLOCK.TORCH && Math.random() < 0.15) {
            feedback.torchParticle(new THREE.Vector3(bx + 0.5, by, bz + 0.5));
          }
        }
      }
    }
  }

  achievements.update(dt);
  achievements.render(achievementContainer);
  minimap.update(dt, player.getObject().position, world);
  const hit = survival.alive ? castFromCamera() : null;
  if (hit) {
    highlight.visible = true;
    highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  } else {
    highlight.visible = false;
  }

  frames++;
  fpsAccum += dt;
  if (fpsAccum >= 0.5) {
    fps = Math.round(frames / fpsAccum);
    frames = 0;
    fpsAccum = 0;
  }

  const inLava = world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.12), Math.floor(p.z)) === BLOCK.LAVA;
  lavaTintEl.classList.toggle('active', inLava);
  underwaterEl.classList.toggle('active', player.underwater && !inLava);
  updateSurvivalHud();

  // Boss health bar + lava tint.
  {
    const boss = mobs.getBoss();
    bossBarEl.classList.toggle('active', !!boss);
    if (boss) bossBarFillEl.style.transform = `scaleX(${Math.max(0, boss.health / boss.maxHealth)})`;
  }

  if (saveToast > 0) saveToast -= dt;
  const biome = biomeDef(world.biomeAt(Math.floor(p.x), Math.floor(p.z))).name;
  const heldStack = inventory.get(selected);
  const heldName = heldStack ? `${itemDef(heldStack.id).name} x${heldStack.count}` : 'empty';
  hud.textContent =
    `FPS ${fps}\n` +
    `XYZ ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}\n` +
    `Biome ${biome}\n` +
    `Time ${dayNight.clock()}${dayNight.paused ? ' (paused)' : ''}\n` +
    `Mode ${getMode()}\n` +
    `State ${player.flying ? 'Flying' : player.inWater ? 'Swimming' : 'Walking'}\n` +
    `Held: ${heldName}` +
    (saveToast > 0 ? '\nSaved' : '');

  // Frustum culling: hide chunk meshes outside the camera frustum
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  for (const [, entry] of world.chunks) {
    if (entry.mesh) {
      const p = entry.mesh.position;
      chunkSphere.center.set(p.x + 8, 32, p.z + 8);
      entry.mesh.visible = frustum.intersectsSphere(chunkSphere);
    }
  }

  // Weather fog blending. dayNight.update() already wrote this frame's fog
  // colour earlier in animate(), so blend from THAT (not the static day sky)
  // or night fog would turn day-blue. Darken the sky background a touch too.
  if (weather.intensity >= 0.01 && weather.type !== 'none') {
    if (scene.fog) scene.fog.color.copy(weather.getFogColor(scene.fog.color));
    if (scene.background && scene.background.isColor) {
      scene.background.lerp(weather.fogColorRain, weather.intensity * 0.35);
    }
  }

  renderer.render(scene, camera);
}

animate();
