// =============================================================================
// mobs.js - All mob behaviour: spawning, AI, damage, breeding/taming, spawner
// blocks and the boss. Per-type DATA (hp, speed, drops, spawn tables, sounds,
// xp) lives in the MOB_DEFS registry (mobdefs.js); this module owns the
// three.js meshes and the AI handler implementations dispatched via
// AI_HANDLERS[def.ai].
// =============================================================================

import * as THREE from 'three';
import { BLOCK, ITEM, SEA_LEVEL, BIOME, NETHER_HEIGHT, CHUNK_HEIGHT, isSolid } from './config.js';
import {
  MOB_DEFS, AI_NAMES, mobDef, spawnCandidates, weightedPick, rollMobDrops,
  xpForMob, breedFoodOf, HORSE_ARMOR,
} from './mobdefs.js';
import { professionForPos, tradeTierFromUses, MAX_TRADE_TIER } from './trades.js';

const MAX_HOSTILE = 5;
const MAX_PASSIVE = 4;
const SPAWN_INTERVAL = 6;
const DESPAWN_DISTANCE = 48;
const ATTACK_DISTANCE = 1.15;
const ATTACK_INTERVAL = 1.1;
const PASSIVE_SPEED = 1.0;
const HIT_RADIUS = 0.72;
const HIT_HEIGHT = 0.95;

const WANDER_INTERVAL = 4;
const FLEE_DURATION = 2.0;
const FLEE_SPEED = 3.0;

const CREEPER_FUSE_TIME = 1.5;
const CREEPER_EXPLODE_RADIUS = 3;
const LOVE_DURATION = 20;
const BREED_COOLDOWN = 60;
const BABY_GROW_TIME = 120;
const MAX_WOLVES = 4;
const SPAWNER_INTERVAL = 5;
const SPAWNER_RANGE = 16;
const SPAWNER_CAP = 3;
// Phase 8: villages. Within VILLAGE_RADIUS of a well centre villager spawn
// weight is multiplied, night hostile pressure doubles (zombie-siege lite),
// and every GOLEM_CHECK_INTERVAL a village with >= 2 villagers and no golem
// within GOLEM_HOME_RADIUS of its well musters one iron golem.
const VILLAGE_RADIUS = 48;
const VILLAGER_VILLAGE_WEIGHT = 4;
const GOLEM_CHECK_INTERVAL = 60;
const GOLEM_HOME_RADIUS = 32;

export class MobManager {
  constructor(scene, world, state = null) {
    this.scene = scene;
    this.world = world;
    this.mobs = [];
    this.spawnTimer = 2;
    this.passiveSpawnTimer = 3;
    // Injected by main.js: onShoot(originVec3, targetVec3) fires a real arrow
    // entity; onExplode(centerVec3, radius) runs the shared explosion.
    this.onShoot = null;
    this.onExplode = null;
    this.materials = {
      skin: new THREE.MeshLambertMaterial({ color: 0x4f9b58 }),
      shirt: new THREE.MeshLambertMaterial({ color: 0x2f6f96 }),
      pants: new THREE.MeshLambertMaterial({ color: 0x3b3f8f }),
      hurt: new THREE.MeshLambertMaterial({ color: 0xd96a5e, emissive: 0x3a0907 }),
      pigBody: new THREE.MeshLambertMaterial({ color: 0xe8a0a0 }),
      pigLeg: new THREE.MeshLambertMaterial({ color: 0xd48080 }),
      pigSnout: new THREE.MeshLambertMaterial({ color: 0xd09090 }),
      cowBody: new THREE.MeshLambertMaterial({ color: 0x6b4226 }),
      cowLeg: new THREE.MeshLambertMaterial({ color: 0x4a2a10 }),
      cowPatch: new THREE.MeshLambertMaterial({ color: 0xe8e0d0 }),
      sheepBody: new THREE.MeshLambertMaterial({ color: 0xe8e0d0 }),
      sheepLeg: new THREE.MeshLambertMaterial({ color: 0x8b7355 }),
      sheepHead: new THREE.MeshLambertMaterial({ color: 0x8b7355 }),
      chickenBody: new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }),
      chickenLeg: new THREE.MeshLambertMaterial({ color: 0xd4a017 }),
      chickenBeak: new THREE.MeshLambertMaterial({ color: 0xd4a017 }),
      chickenComb: new THREE.MeshLambertMaterial({ color: 0xcc2222 }),
      skeletonBone: new THREE.MeshLambertMaterial({ color: 0xe8e0d0 }),
      skeletonDark: new THREE.MeshLambertMaterial({ color: 0x2a2a2a }),
      creeperBody: new THREE.MeshLambertMaterial({ color: 0x50a848 }),
      creeperFace: new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
      villagerRobe: new THREE.MeshLambertMaterial({ color: 0x8b5e3c }),
      villagerHead: new THREE.MeshLambertMaterial({ color: 0xd4a574 }),
      villagerNose: new THREE.MeshLambertMaterial({ color: 0xb8906a }),
      // Phase 8: per-profession villager robe tints (shared materials).
      robeFarmer: new THREE.MeshLambertMaterial({ color: 0xc9a24b }),      // straw
      robeLibrarian: new THREE.MeshLambertMaterial({ color: 0xe4e2da }),   // white
      robeBlacksmith: new THREE.MeshLambertMaterial({ color: 0x44444c }),  // dark gray
      robeCleric: new THREE.MeshLambertMaterial({ color: 0x7a3fa0 }),      // purple
      robeButcher: new THREE.MeshLambertMaterial({ color: 0x94503a }),     // red-brown
      spiderBody: new THREE.MeshLambertMaterial({ color: 0x2a2226 }),
      spiderEye: new THREE.MeshLambertMaterial({ color: 0xc42222, emissive: 0x550808 }),
      endermanBody: new THREE.MeshLambertMaterial({ color: 0x161018 }),
      endermanEye: new THREE.MeshLambertMaterial({ color: 0xcc66ee, emissive: 0x7722aa }),
      wolfBody: new THREE.MeshLambertMaterial({ color: 0xb8b2a8 }),
      wolfDark: new THREE.MeshLambertMaterial({ color: 0x8a8378 }),
      wolfCollar: new THREE.MeshLambertMaterial({ color: 0xcc2222 }),
      pigmanSkin: new THREE.MeshLambertMaterial({ color: 0xd8a0a0 }),
      pigmanGold: new THREE.MeshLambertMaterial({ color: 0xd4b032 }),
      impBody: new THREE.MeshLambertMaterial({ color: 0x7a2818 }),
      impGlow: new THREE.MeshLambertMaterial({ color: 0xe8a030, emissive: 0x883c08 }),
      bossBody: new THREE.MeshLambertMaterial({ color: 0x241028 }),
      bossCore: new THREE.MeshLambertMaterial({ color: 0xd05018, emissive: 0x882808 }),
      bossEye: new THREE.MeshLambertMaterial({ color: 0xf0d020, emissive: 0x907808 }),
      // Phase 4 mobs
      ghastBody: new THREE.MeshLambertMaterial({ color: 0xe8e8ee }),
      ghastDark: new THREE.MeshLambertMaterial({ color: 0x606068 }),
      blazeCore: new THREE.MeshLambertMaterial({ color: 0xd88418, emissive: 0x7a4408 }),
      blazeRod: new THREE.MeshLambertMaterial({ color: 0xe8b040, emissive: 0x5a3808 }),
      blazeSmoke: new THREE.MeshLambertMaterial({ color: 0x3a3026 }),
      slimeBody: new THREE.MeshLambertMaterial({ color: 0x58c04a, transparent: true, opacity: 0.85 }),
      slimeCore: new THREE.MeshLambertMaterial({ color: 0x3a8a30 }),
      slimeEye: new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
      magmaBody: new THREE.MeshLambertMaterial({ color: 0x4a1c12 }),
      magmaCore: new THREE.MeshLambertMaterial({ color: 0xd85818, emissive: 0x882808 }),
      witchRobe: new THREE.MeshLambertMaterial({ color: 0x522a6e }),
      witchHat: new THREE.MeshLambertMaterial({ color: 0x2a1638 }),
      ironBody: new THREE.MeshLambertMaterial({ color: 0xd0d0d4 }),
      ironDark: new THREE.MeshLambertMaterial({ color: 0x94949c }),
      witherBone: new THREE.MeshLambertMaterial({ color: 0x3a3a3e }),
      witherDark: new THREE.MeshLambertMaterial({ color: 0x1c1c20 }),
      silverfishBody: new THREE.MeshLambertMaterial({ color: 0x9aa2ac }),
      silverfishDark: new THREE.MeshLambertMaterial({ color: 0x5e666e }),
      squidBody: new THREE.MeshLambertMaterial({ color: 0x35455e }),
      squidLight: new THREE.MeshLambertMaterial({ color: 0x5a6e8c }),
      horseBody: new THREE.MeshLambertMaterial({ color: 0x8a5a2e }),
      horseDark: new THREE.MeshLambertMaterial({ color: 0x5e3c1c }),
      saddle: new THREE.MeshLambertMaterial({ color: 0x703820 }),
      // Phase 9: the End
      dragonBody: new THREE.MeshLambertMaterial({ color: 0x18101e }),
      dragonWing: new THREE.MeshLambertMaterial({ color: 0x241a2e, side: THREE.DoubleSide }),
      dragonEye: new THREE.MeshLambertMaterial({ color: 0xd06ae8, emissive: 0x8822aa }),
      crystalBase: new THREE.MeshLambertMaterial({ color: 0x3a3a40 }),
      crystalCore: new THREE.MeshLambertMaterial({ color: 0xe89ae0, emissive: 0x8a2a80 }),
    };
    // One shared material for dragon-to-crystal healing beams.
    this.beamMaterial = new THREE.LineBasicMaterial({ color: 0xff9ae8, transparent: true, opacity: 0.85 });

    // AI dispatch table: MOB_DEFS[type].ai -> handler. Handlers for hostile
    // types receive (m, ctx) from the shared _hostileAI prelude and return
    // true when the mob removed itself (creeper explosion).
    this.aiHandlers = {
      zombie: (m, ctx) => this._aiZombie(m, ctx),
      skeleton: (m, ctx) => this._aiSkeleton(m, ctx),
      creeper: (m, ctx) => this._aiCreeper(m, ctx),
      spider: (m, ctx) => this._aiSpider(m, ctx),
      enderman: (m, ctx) => this._aiEnderman(m, ctx),
      pigman: (m, ctx) => this._aiPigman(m, ctx),
      fireImp: (m, ctx) => this._aiFireImp(m, ctx),
      wolf: (m, ctx) => { this._wolfAI(m, ctx.dt, ctx.dist, ctx.dx, ctx.dz, ctx.playerPos); return false; },
      passive: (m, ctx) => { this._aiPassive(m, ctx.dt); return false; },
      boss: (m, ctx) => { this._bossAI(m, ctx.dt, ctx.player, ctx.survival, ctx.playerPos); return false; },
      ghast: (m, ctx) => this._aiGhast(m, ctx),
      blaze: (m, ctx) => this._aiBlaze(m, ctx),
      slime: (m, ctx) => this._aiSlime(m, ctx),
      witch: (m, ctx) => this._aiWitch(m, ctx),
      silverfish: (m, ctx) => this._aiSilverfish(m, ctx),
      golem: (m, ctx) => { this._aiGolem(m, ctx.dt); return false; },
      squid: (m, ctx) => { this._aiSquid(m, ctx.dt); return false; },
      dragon: (m, ctx) => { this._dragonAI(m, ctx.dt, ctx.player, ctx.survival, ctx.playerPos); return false; },
      crystal: (m, ctx) => { this._crystalAI(m, ctx.dt); return false; },
    };
    for (const name of AI_NAMES) {
      if (!this.aiHandlers[name]) console.error(`[mobs] missing AI handler for '${name}'`);
    }

    // Mesh dispatch table: MOB_DEFS[type].mesh -> builder.
    this.meshBuilders = {
      zombie: () => this.makeZombieMesh(),
      pig: () => this.makeQuadrupedMesh(this.materials.pigBody, this.materials.pigLeg, this.materials.pigBody, (g, part) => {
        part(new THREE.BoxGeometry(0.22, 0.16, 0.12), this.materials.pigSnout, 0, 0.88, 0.78);
      }),
      cow: () => this.makeQuadrupedMesh(this.materials.cowBody, this.materials.cowLeg, this.materials.cowBody, (g, part) => {
        part(new THREE.BoxGeometry(0.5, 0.35, 0.6), this.materials.cowPatch, 0, 0.78, -0.1);
      }),
      sheep: () => this.makeQuadrupedMesh(this.materials.sheepBody, this.materials.sheepLeg, this.materials.sheepHead),
      chicken: () => this.makeChickenMesh(),
      skeleton: () => this.makeSkeletonMesh(),
      creeper: () => this.makeCreeperMesh(),
      villager: (extra) => this.makeVillagerMesh(extra && extra.profession),
      spider: () => this.makeSpiderMesh(),
      enderman: () => this.makeEndermanMesh(),
      wolf: () => this.makeWolfMesh(),
      pigman: () => this.makePigmanMesh(),
      imp: () => this.makeImpMesh(),
      boss: () => this.makeBossMesh(),
      ghast: () => this.makeGhastMesh(),
      blaze: () => this.makeBlazeMesh(),
      slime: () => this.makeSlimeMesh(this.materials.slimeBody, this.materials.slimeCore),
      magmaCube: () => this.makeSlimeMesh(this.materials.magmaBody, this.materials.magmaCore),
      witch: () => this.makeWitchMesh(),
      golem: () => this.makeGolemMesh(),
      witherSkeleton: () => this.makeWitherSkeletonMesh(),
      silverfish: () => this.makeSilverfishMesh(),
      squid: () => this.makeSquidMesh(),
      horse: () => this.makeHorseMesh(),
      dragon: () => this.makeDragonMesh(),
      crystal: () => this.makeCrystalMesh(),
    };

    // Static weighted spawn lists derived from the registry.
    this.spawnLists = {
      overworldNight: spawnCandidates({ dim: 'overworld', time: 'night' }),
      overworldDay: spawnCandidates({ dim: 'overworld', time: 'day' }),
      nether: spawnCandidates({ dim: 'nether' }),
      end: spawnCandidates({ dim: 'end' }),
    };

    if (Array.isArray(state)) {
      for (const m of state) {
        if (m && Number.isFinite(m.x) && Number.isFinite(m.z)) {
          this.addMob(new THREE.Vector3(m.x, m.y || 0, m.z), m.type || 'zombie', m.health, {
            baby: !!m.baby,
            growTimer: m.growTimer || 0,
            breedCooldown: m.breedCooldown || 0,
            tame: !!m.tame,
            sitting: !!m.sitting,
            vy: Number.isFinite(m.vy) ? m.vy : 0,
            size: m.size || 0,
            saddled: !!m.saddled,
            horseArmor: m.horseArmor || null,
            effects: Array.isArray(m.effects) ? m.effects : null,
            // Phase 8: villager profession/tier survive save-load (missing
            // fields re-roll deterministically from position in addMob).
            profession: m.profession || null,
            tradeTier: m.tradeTier || 1,
            tradeUses: m.tradeUses || 0,
          });
        }
      }
    }
    // Injected by main.js: onEffect(name, pos) plays particles/sounds for
    // teleports, hearts, taming; onShootFire(from, to) fires an imp fireball;
    // onShootFlask(from, to) throws a witch flask; onEnvKill(result) routes
    // environmental deaths (falls, golem punches) through the loot/xp path.
    this.onEffect = null;
    this.onShootFire = null;
    this.onShootFlask = null;
    this.onEnvKill = null;
    this.waterSpawnTimer = 8;
    // The mob the player most recently attacked (tamed wolves assist).
    this.playerTarget = null;
    // Set by main.js while the player is in creative mode: hostile mobs stop
    // targeting/attacking (they just wander), projectiles are never aimed and
    // the boss stops its volleys/slams. Wandering, taming and breeding still work.
    this.playerInvulnerable = false;
    this._spawnerCooldowns = new Map();
    this._spawnerTimer = 0;
  }

  isNight(t) {
    return t < 0.22 || t > 0.78;
  }

  makeZombieMesh() {
    const g = new THREE.Group();
    const part = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.baseMaterial = mat;
      mesh.position.set(x, y, z);
      g.add(mesh);
    };
    part(new THREE.BoxGeometry(0.55, 0.55, 0.55), this.materials.skin, 0, 1.55, 0);
    part(new THREE.BoxGeometry(0.62, 0.78, 0.35), this.materials.shirt, 0, 0.9, 0);
    part(new THREE.BoxGeometry(0.24, 0.62, 0.24), this.materials.pants, -0.16, 0.2, 0);
    part(new THREE.BoxGeometry(0.24, 0.62, 0.24), this.materials.pants, 0.16, 0.2, 0);
    part(new THREE.BoxGeometry(0.18, 0.68, 0.18), this.materials.skin, -0.43, 0.9, 0);
    part(new THREE.BoxGeometry(0.18, 0.68, 0.18), this.materials.skin, 0.43, 0.9, 0);
    return g;
  }

  makeQuadrupedMesh(bodyMat, legMat, headMat, extraParts) {
    const g = new THREE.Group();
    const part = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.baseMaterial = mat;
      mesh.position.set(x, y, z);
      g.add(mesh);
    };
    part(new THREE.BoxGeometry(0.7, 0.55, 1.0), bodyMat, 0, 0.7, 0);
    part(new THREE.BoxGeometry(0.2, 0.4, 0.2), legMat, -0.2, 0.2, -0.3);
    part(new THREE.BoxGeometry(0.2, 0.4, 0.2), legMat, 0.2, 0.2, -0.3);
    part(new THREE.BoxGeometry(0.2, 0.4, 0.2), legMat, -0.2, 0.2, 0.3);
    part(new THREE.BoxGeometry(0.2, 0.4, 0.2), legMat, 0.2, 0.2, 0.3);
    part(new THREE.BoxGeometry(0.4, 0.4, 0.35), headMat, 0, 0.95, 0.55);
    if (extraParts) extraParts(g, part);
    return g;
  }

  makeMobMesh(type, extra = {}) {
    const def = mobDef(type);
    const builder = this.meshBuilders[def.mesh] || this.meshBuilders.zombie;
    return builder(extra);
  }

  makeChickenMesh() {
    const g = new THREE.Group();
    const part = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.baseMaterial = mat;
      mesh.position.set(x, y, z);
      g.add(mesh);
    };
    part(new THREE.BoxGeometry(0.4, 0.35, 0.5), this.materials.chickenBody, 0, 0.45, 0);
    part(new THREE.BoxGeometry(0.25, 0.25, 0.2), this.materials.chickenBody, 0, 0.72, 0.2);
    part(new THREE.BoxGeometry(0.12, 0.06, 0.1), this.materials.chickenBeak, 0, 0.68, 0.38);
    part(new THREE.BoxGeometry(0.08, 0.1, 0.06), this.materials.chickenComb, 0, 0.82, 0.22);
    part(new THREE.BoxGeometry(0.06, 0.25, 0.06), this.materials.chickenLeg, -0.08, 0.13, 0);
    part(new THREE.BoxGeometry(0.06, 0.25, 0.06), this.materials.chickenLeg, 0.08, 0.13, 0);
    return g;
  }

  makeSkeletonMesh() {
    const g = new THREE.Group();
    const part = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.baseMaterial = mat;
      mesh.position.set(x, y, z);
      g.add(mesh);
    };
    part(new THREE.BoxGeometry(0.5, 0.5, 0.5), this.materials.skeletonBone, 0, 1.55, 0);
    part(new THREE.BoxGeometry(0.15, 0.15, 0.15), this.materials.skeletonDark, -0.12, 1.6, 0.18);
    part(new THREE.BoxGeometry(0.15, 0.15, 0.15), this.materials.skeletonDark, 0.12, 1.6, 0.18);
    part(new THREE.BoxGeometry(0.45, 0.7, 0.22), this.materials.skeletonBone, 0, 0.95, 0);
    part(new THREE.BoxGeometry(0.12, 0.6, 0.12), this.materials.skeletonBone, -0.12, 0.2, 0);
    part(new THREE.BoxGeometry(0.12, 0.6, 0.12), this.materials.skeletonBone, 0.12, 0.2, 0);
    part(new THREE.BoxGeometry(0.1, 0.6, 0.1), this.materials.skeletonBone, -0.35, 0.95, 0);
    part(new THREE.BoxGeometry(0.1, 0.6, 0.1), this.materials.skeletonBone, 0.35, 0.95, 0);
    return g;
  }

  makeCreeperMesh() {
    const g = new THREE.Group();
    const part = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.baseMaterial = mat;
      mesh.position.set(x, y, z);
      g.add(mesh);
    };
    part(new THREE.BoxGeometry(0.5, 0.5, 0.5), this.materials.creeperBody, 0, 1.45, 0);
    part(new THREE.BoxGeometry(0.2, 0.2, 0.05), this.materials.creeperFace, 0, 1.45, 0.26);
    part(new THREE.BoxGeometry(0.5, 0.7, 0.35), this.materials.creeperBody, 0, 0.85, 0);
    part(new THREE.BoxGeometry(0.2, 0.5, 0.2), this.materials.creeperBody, -0.15, 0.25, -0.08);
    part(new THREE.BoxGeometry(0.2, 0.5, 0.2), this.materials.creeperBody, 0.15, 0.25, -0.08);
    part(new THREE.BoxGeometry(0.2, 0.5, 0.2), this.materials.creeperBody, -0.15, 0.25, 0.08);
    part(new THREE.BoxGeometry(0.2, 0.5, 0.2), this.materials.creeperBody, 0.15, 0.25, 0.08);
    return g;
  }

  // Phase 8: the robe is tinted by profession (shared per-profession
  // materials); unknown/absent professions keep the classic brown robe.
  villagerRobeMaterial(profession) {
    const map = {
      farmer: this.materials.robeFarmer,
      librarian: this.materials.robeLibrarian,
      blacksmith: this.materials.robeBlacksmith,
      cleric: this.materials.robeCleric,
      butcher: this.materials.robeButcher,
    };
    return map[profession] || this.materials.villagerRobe;
  }

  makeVillagerMesh(profession = null) {
    const g = new THREE.Group();
    const part = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.baseMaterial = mat;
      mesh.position.set(x, y, z);
      g.add(mesh);
    };
    const robe = this.villagerRobeMaterial(profession);
    part(new THREE.BoxGeometry(0.5, 0.5, 0.5), this.materials.villagerHead, 0, 1.55, 0);
    part(new THREE.BoxGeometry(0.14, 0.18, 0.12), this.materials.villagerNose, 0, 1.46, 0.3);
    part(new THREE.BoxGeometry(0.55, 0.75, 0.4), robe, 0, 0.95, 0);
    part(new THREE.BoxGeometry(0.18, 0.6, 0.18), robe, -0.22, 0.3, 0);
    part(new THREE.BoxGeometry(0.18, 0.6, 0.18), robe, 0.22, 0.3, 0);
    return g;
  }

  makeSpiderMesh() {
    const g = new THREE.Group();
    const part = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.baseMaterial = mat;
      mesh.position.set(x, y, z);
      g.add(mesh);
    };
    part(new THREE.BoxGeometry(0.9, 0.45, 1.1), this.materials.spiderBody, 0, 0.5, -0.1);   // abdomen
    part(new THREE.BoxGeometry(0.55, 0.4, 0.5), this.materials.spiderBody, 0, 0.5, 0.6);    // head
    part(new THREE.BoxGeometry(0.1, 0.1, 0.06), this.materials.spiderEye, -0.14, 0.58, 0.86);
    part(new THREE.BoxGeometry(0.1, 0.1, 0.06), this.materials.spiderEye, 0.14, 0.58, 0.86);
    for (let i = 0; i < 4; i++) {
      const z = -0.45 + i * 0.3;
      part(new THREE.BoxGeometry(0.5, 0.1, 0.1), this.materials.spiderBody, -0.65, 0.35, z);
      part(new THREE.BoxGeometry(0.5, 0.1, 0.1), this.materials.spiderBody, 0.65, 0.35, z);
    }
    return g;
  }

  makeEndermanMesh() {
    const g = new THREE.Group();
    const part = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.baseMaterial = mat;
      mesh.position.set(x, y, z);
      g.add(mesh);
    };
    part(new THREE.BoxGeometry(0.45, 0.45, 0.45), this.materials.endermanBody, 0, 2.55, 0); // head
    part(new THREE.BoxGeometry(0.34, 0.08, 0.05), this.materials.endermanEye, -0.09, 2.58, 0.23);
    part(new THREE.BoxGeometry(0.34, 0.08, 0.05), this.materials.endermanEye, 0.09, 2.58, 0.23);
    part(new THREE.BoxGeometry(0.5, 0.9, 0.3), this.materials.endermanBody, 0, 1.85, 0);    // torso
    part(new THREE.BoxGeometry(0.12, 1.4, 0.12), this.materials.endermanBody, -0.16, 0.7, 0); // legs
    part(new THREE.BoxGeometry(0.12, 1.4, 0.12), this.materials.endermanBody, 0.16, 0.7, 0);
    part(new THREE.BoxGeometry(0.1, 1.1, 0.1), this.materials.endermanBody, -0.36, 1.6, 0);  // arms
    part(new THREE.BoxGeometry(0.1, 1.1, 0.1), this.materials.endermanBody, 0.36, 1.6, 0);
    return g;
  }

  makeWolfMesh() {
    const g = this.makeQuadrupedMesh(this.materials.wolfBody, this.materials.wolfDark, this.materials.wolfBody, (grp, part) => {
      part(new THREE.BoxGeometry(0.18, 0.14, 0.3), this.materials.wolfDark, 0, 0.88, 0.78);  // snout
      part(new THREE.BoxGeometry(0.1, 0.16, 0.08), this.materials.wolfDark, -0.13, 1.18, 0.5); // ears
      part(new THREE.BoxGeometry(0.1, 0.16, 0.08), this.materials.wolfDark, 0.13, 1.18, 0.5);
      part(new THREE.BoxGeometry(0.14, 0.14, 0.5), this.materials.wolfBody, 0, 0.75, -0.7);  // tail
      // Collar, shown only once tamed (toggled via userData.collar).
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.4), this.materials.wolfCollar);
      collar.userData.baseMaterial = this.materials.wolfCollar;
      collar.position.set(0, 0.95, 0.4);
      collar.visible = false;
      grp.userData.collar = collar;
      grp.add(collar);
    });
    return g;
  }

  makePigmanMesh() {
    const g = new THREE.Group();
    const part = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.baseMaterial = mat;
      mesh.position.set(x, y, z);
      g.add(mesh);
    };
    part(new THREE.BoxGeometry(0.55, 0.55, 0.55), this.materials.pigmanSkin, 0, 1.55, 0);
    part(new THREE.BoxGeometry(0.2, 0.12, 0.08), this.materials.pigBody, 0, 1.45, 0.3);     // snout
    part(new THREE.BoxGeometry(0.62, 0.78, 0.35), this.materials.pigmanGold, 0, 0.9, 0);    // gold tunic
    part(new THREE.BoxGeometry(0.24, 0.62, 0.24), this.materials.pigmanSkin, -0.16, 0.2, 0);
    part(new THREE.BoxGeometry(0.24, 0.62, 0.24), this.materials.pigmanSkin, 0.16, 0.2, 0);
    part(new THREE.BoxGeometry(0.18, 0.68, 0.18), this.materials.pigmanSkin, -0.43, 0.9, 0);
    part(new THREE.BoxGeometry(0.18, 0.68, 0.18), this.materials.pigmanSkin, 0.43, 0.9, 0);
    return g;
  }

  makeImpMesh() {
    const g = new THREE.Group();
    const part = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.baseMaterial = mat;
      mesh.position.set(x, y, z);
      g.add(mesh);
    };
    part(new THREE.BoxGeometry(0.45, 0.45, 0.45), this.materials.impBody, 0, 1.0, 0);       // head/body
    part(new THREE.BoxGeometry(0.16, 0.12, 0.05), this.materials.impGlow, 0, 1.05, 0.24);   // glowing eyes
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      part(new THREE.BoxGeometry(0.1, 0.5, 0.1), this.materials.impGlow, Math.cos(a) * 0.32, 0.55, Math.sin(a) * 0.32); // floating rods
    }
    return g;
  }

  makeBossMesh() {
    const g = new THREE.Group();
    const part = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.baseMaterial = mat;
      mesh.position.set(x, y, z);
      g.add(mesh);
    };
    part(new THREE.BoxGeometry(1.8, 1.8, 1.8), this.materials.bossBody, 0, 1.6, 0);          // core body
    part(new THREE.BoxGeometry(0.7, 0.7, 0.7), this.materials.bossCore, 0, 1.6, 0.85);       // molten core
    part(new THREE.BoxGeometry(0.4, 0.25, 0.1), this.materials.bossEye, -0.45, 2.1, 0.95);
    part(new THREE.BoxGeometry(0.4, 0.25, 0.1), this.materials.bossEye, 0.45, 2.1, 0.95);
    part(new THREE.BoxGeometry(0.5, 1.6, 0.5), this.materials.bossBody, -1.3, 1.3, 0);       // shoulder pylons
    part(new THREE.BoxGeometry(0.5, 1.6, 0.5), this.materials.bossBody, 1.3, 1.3, 0);
    part(new THREE.BoxGeometry(0.3, 0.3, 0.3), this.materials.bossCore, -1.3, 2.3, 0);
    part(new THREE.BoxGeometry(0.3, 0.3, 0.3), this.materials.bossCore, 1.3, 2.3, 0);
    return g;
  }

  _partHelper(g) {
    return (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.baseMaterial = mat;
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
  }

  // Ghast: large white cube with nine short tentacles.
  makeGhastMesh() {
    const g = new THREE.Group();
    const part = this._partHelper(g);
    part(new THREE.BoxGeometry(1.4, 1.4, 1.4), this.materials.ghastBody, 0, 1.7, 0);
    part(new THREE.BoxGeometry(0.18, 0.12, 0.05), this.materials.ghastDark, -0.3, 1.9, 0.71); // eyes
    part(new THREE.BoxGeometry(0.18, 0.12, 0.05), this.materials.ghastDark, 0.3, 1.9, 0.71);
    part(new THREE.BoxGeometry(0.5, 0.1, 0.05), this.materials.ghastDark, 0, 1.4, 0.71);      // mouth
    for (let ix = -1; ix <= 1; ix++) {
      for (let iz = -1; iz <= 1; iz++) {
        part(new THREE.BoxGeometry(0.16, 0.7, 0.16), this.materials.ghastBody, ix * 0.45, 0.72, iz * 0.45);
      }
    }
    return g;
  }

  // Blaze: golden core with a spinning cluster of rods (rotated in its AI).
  makeBlazeMesh() {
    const g = new THREE.Group();
    const part = this._partHelper(g);
    part(new THREE.BoxGeometry(0.42, 0.42, 0.42), this.materials.blazeCore, 0, 1.35, 0);   // head
    part(new THREE.BoxGeometry(0.3, 0.08, 0.05), this.materials.blazeSmoke, 0, 1.4, 0.22); // eyes
    const rods = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? 0.42 : 0.55;
      const rod = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.12), this.materials.blazeRod);
      rod.userData.baseMaterial = this.materials.blazeRod;
      rod.position.set(Math.cos(a) * r, i % 2 === 0 ? 0.85 : 0.45, Math.sin(a) * r);
      rods.add(rod);
    }
    g.add(rods);
    g.userData.rods = rods;
    return g;
  }

  // Slime / magma cube: translucent shell around a darker core, scaled by size.
  makeSlimeMesh(shellMat, coreMat) {
    const g = new THREE.Group();
    const part = this._partHelper(g);
    part(new THREE.BoxGeometry(0.95, 0.95, 0.95), shellMat, 0, 0.5, 0);
    part(new THREE.BoxGeometry(0.55, 0.55, 0.55), coreMat, 0, 0.45, 0);
    part(new THREE.BoxGeometry(0.14, 0.14, 0.06), this.materials.slimeEye, -0.2, 0.62, 0.46);
    part(new THREE.BoxGeometry(0.14, 0.14, 0.06), this.materials.slimeEye, 0.2, 0.62, 0.46);
    return g;
  }

  // Witch: purple-robed villager silhouette with a pointy hat.
  makeWitchMesh() {
    const g = new THREE.Group();
    const part = this._partHelper(g);
    part(new THREE.BoxGeometry(0.5, 0.5, 0.5), this.materials.villagerHead, 0, 1.55, 0);
    part(new THREE.BoxGeometry(0.14, 0.18, 0.12), this.materials.villagerNose, 0, 1.46, 0.3);
    part(new THREE.BoxGeometry(0.55, 0.75, 0.4), this.materials.witchRobe, 0, 0.95, 0);
    part(new THREE.BoxGeometry(0.18, 0.6, 0.18), this.materials.witchRobe, -0.22, 0.3, 0);
    part(new THREE.BoxGeometry(0.18, 0.6, 0.18), this.materials.witchRobe, 0.22, 0.3, 0);
    part(new THREE.BoxGeometry(0.7, 0.08, 0.7), this.materials.witchHat, 0, 1.84, 0);   // brim
    part(new THREE.BoxGeometry(0.4, 0.25, 0.4), this.materials.witchHat, 0, 2.0, 0);
    part(new THREE.BoxGeometry(0.22, 0.25, 0.22), this.materials.witchHat, 0.05, 2.24, 0);
    return g;
  }

  // Iron golem: broad iron torso, long arms.
  makeGolemMesh() {
    const g = new THREE.Group();
    const part = this._partHelper(g);
    part(new THREE.BoxGeometry(0.95, 1.1, 0.55), this.materials.ironBody, 0, 1.4, 0);   // torso
    part(new THREE.BoxGeometry(0.5, 0.45, 0.45), this.materials.ironBody, 0, 2.2, 0.05); // head
    part(new THREE.BoxGeometry(0.1, 0.1, 0.06), this.materials.ghastDark, -0.12, 2.25, 0.3);
    part(new THREE.BoxGeometry(0.1, 0.1, 0.06), this.materials.ghastDark, 0.12, 2.25, 0.3);
    part(new THREE.BoxGeometry(0.16, 0.3, 0.2), this.materials.ironDark, 0, 2.0, 0.28);  // nose plate
    part(new THREE.BoxGeometry(0.28, 1.2, 0.32), this.materials.ironDark, -0.68, 1.25, 0); // arms
    part(new THREE.BoxGeometry(0.28, 1.2, 0.32), this.materials.ironDark, 0.68, 1.25, 0);
    part(new THREE.BoxGeometry(0.32, 0.85, 0.34), this.materials.ironDark, -0.24, 0.42, 0); // legs
    part(new THREE.BoxGeometry(0.32, 0.85, 0.34), this.materials.ironDark, 0.24, 0.42, 0);
    return g;
  }

  // Wither skeleton: taller, coal-black skeleton.
  makeWitherSkeletonMesh() {
    const g = new THREE.Group();
    const part = this._partHelper(g);
    part(new THREE.BoxGeometry(0.5, 0.5, 0.5), this.materials.witherBone, 0, 1.95, 0);     // head
    part(new THREE.BoxGeometry(0.14, 0.14, 0.15), this.materials.witherDark, -0.12, 2.0, 0.19);
    part(new THREE.BoxGeometry(0.14, 0.14, 0.15), this.materials.witherDark, 0.12, 2.0, 0.19);
    part(new THREE.BoxGeometry(0.45, 0.8, 0.22), this.materials.witherBone, 0, 1.3, 0);    // torso
    part(new THREE.BoxGeometry(0.13, 0.85, 0.13), this.materials.witherBone, -0.13, 0.42, 0); // legs
    part(new THREE.BoxGeometry(0.13, 0.85, 0.13), this.materials.witherBone, 0.13, 0.42, 0);
    part(new THREE.BoxGeometry(0.11, 0.8, 0.11), this.materials.witherBone, -0.35, 1.3, 0);   // arms
    part(new THREE.BoxGeometry(0.11, 0.8, 0.11), this.materials.witherBone, 0.35, 1.3, 0);
    return g;
  }

  // Silverfish: small segmented grey bug.
  makeSilverfishMesh() {
    const g = new THREE.Group();
    const part = this._partHelper(g);
    part(new THREE.BoxGeometry(0.28, 0.22, 0.42), this.materials.silverfishBody, 0, 0.14, 0);    // thorax
    part(new THREE.BoxGeometry(0.22, 0.18, 0.22), this.materials.silverfishDark, 0, 0.12, 0.32); // head
    part(new THREE.BoxGeometry(0.2, 0.16, 0.3), this.materials.silverfishDark, 0, 0.11, -0.34);  // tail
    part(new THREE.BoxGeometry(0.1, 0.1, 0.18), this.materials.silverfishBody, 0, 0.08, -0.55);  // tail tip
    part(new THREE.BoxGeometry(0.06, 0.06, 0.05), this.materials.witherDark, -0.07, 0.16, 0.44);
    part(new THREE.BoxGeometry(0.06, 0.06, 0.05), this.materials.witherDark, 0.07, 0.16, 0.44);
    return g;
  }

  // Squid: boxy head-body with eight hanging tentacles.
  makeSquidMesh() {
    const g = new THREE.Group();
    const part = this._partHelper(g);
    part(new THREE.BoxGeometry(0.75, 0.85, 0.75), this.materials.squidBody, 0, 0.85, 0);
    part(new THREE.BoxGeometry(0.16, 0.16, 0.05), this.materials.ghastBody, -0.2, 0.9, 0.39); // eyes
    part(new THREE.BoxGeometry(0.16, 0.16, 0.05), this.materials.ghastBody, 0.2, 0.9, 0.39);
    part(new THREE.BoxGeometry(0.07, 0.07, 0.05), this.materials.witherDark, -0.2, 0.9, 0.41);
    part(new THREE.BoxGeometry(0.07, 0.07, 0.05), this.materials.witherDark, 0.2, 0.9, 0.41);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      part(new THREE.BoxGeometry(0.12, 0.55, 0.12), this.materials.squidLight, Math.cos(a) * 0.26, 0.2, Math.sin(a) * 0.26);
    }
    return g;
  }

  // Horse: chestnut box-horse (body, four legs, neck + head, tail) with an
  // optional saddle box toggled via userData.saddle.
  makeHorseMesh() {
    const g = new THREE.Group();
    const part = this._partHelper(g);
    part(new THREE.BoxGeometry(0.9, 0.7, 1.5), this.materials.horseBody, 0, 1.05, 0);          // body
    part(new THREE.BoxGeometry(0.22, 0.72, 0.22), this.materials.horseDark, -0.3, 0.36, -0.55); // legs
    part(new THREE.BoxGeometry(0.22, 0.72, 0.22), this.materials.horseDark, 0.3, 0.36, -0.55);
    part(new THREE.BoxGeometry(0.22, 0.72, 0.22), this.materials.horseDark, -0.3, 0.36, 0.55);
    part(new THREE.BoxGeometry(0.22, 0.72, 0.22), this.materials.horseDark, 0.3, 0.36, 0.55);
    part(new THREE.BoxGeometry(0.3, 0.7, 0.32), this.materials.horseBody, 0, 1.65, 0.62);       // neck
    part(new THREE.BoxGeometry(0.34, 0.34, 0.7), this.materials.horseBody, 0, 2.02, 0.85);      // head
    part(new THREE.BoxGeometry(0.1, 0.16, 0.08), this.materials.horseDark, -0.1, 2.26, 0.62);   // ears
    part(new THREE.BoxGeometry(0.1, 0.16, 0.08), this.materials.horseDark, 0.1, 2.26, 0.62);
    part(new THREE.BoxGeometry(0.12, 0.55, 0.14), this.materials.horseDark, 0, 1.15, -0.85);    // tail
    part(new THREE.BoxGeometry(0.1, 0.45, 0.3), this.materials.horseDark, 0, 1.62, 0.42);       // mane
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.5), this.materials.saddle);
    saddle.userData.baseMaterial = this.materials.saddle;
    saddle.position.set(0, 1.46, -0.05);
    saddle.visible = false;
    g.userData.saddle = saddle;
    g.add(saddle);
    // Phase 10: horse-armor plate — a thin shell over the body, hidden until a
    // tier is equipped (material swapped per tier in applyHorseArmor).
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 1.58), this.materials.horseDark);
    plate.userData.baseMaterial = this.materials.horseDark;
    plate.position.set(0, 0.98, 0);
    plate.visible = false;
    g.userData.armorPlate = plate;
    g.add(plate);
    return g;
  }

  // Phase 9: the Ender Dragon — a large dark box-build (body, neck, head, two
  // wide flat wings, tapering tail). Wing tips span ~8 blocks.
  makeDragonMesh() {
    const g = new THREE.Group();
    const part = this._partHelper(g);
    part(new THREE.BoxGeometry(1.4, 1.2, 3.4), this.materials.dragonBody, 0, 1.2, 0);      // body
    part(new THREE.BoxGeometry(0.7, 0.7, 1.4), this.materials.dragonBody, 0, 1.7, 2.2);    // neck
    part(new THREE.BoxGeometry(0.9, 0.7, 1.1), this.materials.dragonBody, 0, 2.0, 3.2);    // head
    part(new THREE.BoxGeometry(0.5, 0.25, 0.7), this.materials.dragonBody, 0, 1.72, 3.6);  // jaw
    part(new THREE.BoxGeometry(0.16, 0.16, 0.1), this.materials.dragonEye, -0.28, 2.15, 3.7); // eyes
    part(new THREE.BoxGeometry(0.16, 0.16, 0.1), this.materials.dragonEye, 0.28, 2.15, 3.7);
    part(new THREE.BoxGeometry(4.0, 0.14, 1.6), this.materials.dragonWing, -2.6, 1.75, -0.2); // wings
    part(new THREE.BoxGeometry(4.0, 0.14, 1.6), this.materials.dragonWing, 2.6, 1.75, -0.2);
    part(new THREE.BoxGeometry(0.7, 0.6, 1.6), this.materials.dragonBody, 0, 1.15, -2.3);  // tail 1
    part(new THREE.BoxGeometry(0.5, 0.45, 1.5), this.materials.dragonBody, 0, 1.1, -3.7);  // tail 2
    part(new THREE.BoxGeometry(0.32, 0.3, 1.4), this.materials.dragonBody, 0, 1.05, -5.0); // tail 3
    return g;
  }

  // End crystal: a bedrock-toned base slab carrying a spinning pink cube.
  makeCrystalMesh() {
    const g = new THREE.Group();
    const part = this._partHelper(g);
    part(new THREE.BoxGeometry(0.95, 0.3, 0.95), this.materials.crystalBase, 0, 0.15, 0);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), this.materials.crystalCore);
    core.userData.baseMaterial = this.materials.crystalCore;
    core.position.set(0, 1.05, 0);
    core.rotation.set(Math.PI / 5, Math.PI / 4, 0);
    g.add(core);
    g.userData.core = core;
    return g;
  }

  addMob(pos, type = 'zombie', health, extra = {}) {
    const def = mobDef(type);
    // Phase 8: villagers roll a deterministic profession from their spawn
    // position unless one was passed (restore / debug spawns).
    if (type === 'villager' && !extra.profession) {
      extra = { ...extra, profession: professionForPos(pos.x, pos.z) };
    }
    // Sized mobs (slimes/magma cubes): per-size hp, mesh scale 3/2/1.
    const size = def.sizes ? (def.sizes[extra.size] ? extra.size : 3) : 0;
    const maxHp = size ? def.sizes[size].hp : def.hp;
    const mesh = this.makeMobMesh(type, extra);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const mob = {
      mesh,
      type,
      maxHealth: maxHp,
      health: Number.isFinite(health) ? Math.max(1, Math.min(maxHp, health)) : maxHp,
      attackTimer: Math.random() * ATTACK_INTERVAL,
      hurtTimer: 0,
      velocity: new THREE.Vector3(),
      wanderDir: new THREE.Vector2((Math.random() - 0.5), (Math.random() - 0.5)).normalize(),
      wanderTimer: Math.random() * WANDER_INTERVAL,
      fleeTimer: 0,
      fleeDir: new THREE.Vector2(),
      fuseTimer: 0,
      fusing: false,
      // Extended state (breeding / taming / anger / spawner tag / boss).
      baby: !!extra.baby,
      growTimer: extra.growTimer || 0,
      loveTimer: 0,
      breedCooldown: extra.breedCooldown || 0,
      tame: !!extra.tame,
      sitting: !!extra.sitting,
      aggroTimer: 0,
      teleportTimer: 0,
      spawnerKey: extra.spawnerKey || null,
      boss: type === 'boss',
      bossAngle: Math.random() * Math.PI * 2,
      summonTimer: 0,
      // Vertical physics (Phase 4): velocity, ground contact and fall tracking.
      vy: Number.isFinite(extra.vy) ? extra.vy : 0,
      onGround: true,
      fallPeak: null,
      // Phase 4 extras: slime size, horse saddle, rider flag.
      size: size || 0,
      saddled: !!extra.saddled,
      ridden: false,
      // Phase 10: equipped horse-armor tier key ('iron'|'gold'|'diamond') or null.
      horseArmor: null,
      // Phase 7: lightweight status effects [{ id, amp, t, tick }].
      effects: Array.isArray(extra.effects)
        ? extra.effects.filter((e) => e && e.id && e.t > 0).map((e) => ({ id: e.id, amp: e.amp || 1, t: e.t, tick: 0 }))
        : [],
      // Phase 8: villager trading state (null/0 for every other type).
      profession: extra.profession || null,
      tradeTier: Math.max(1, Math.min(MAX_TRADE_TIER, extra.tradeTier || 1)),
      tradeUses: Math.max(0, extra.tradeUses || 0),
    };
    if (mob.baby) mesh.scale.setScalar(0.5);
    if (size) mesh.scale.setScalar(0.35 + 0.32 * size); // 1 -> 0.67, 2 -> 0.99, 3 -> 1.31
    if (mob.tame && mesh.userData.collar) mesh.userData.collar.visible = true;
    if (mob.saddled && mesh.userData.saddle) mesh.userData.saddle.visible = true;
    if (extra.horseArmor) this.applyHorseArmor(mob, extra.horseArmor);
    this.mobs.push(mob);
    return mob;
  }

  // Equip a horse-armor tier: remembers the key (persisted) and colours the
  // plate mesh. Tier materials are created lazily and shared across horses.
  applyHorseArmor(mob, tier) {
    if (!HORSE_ARMOR[tier]) return false;
    mob.horseArmor = tier;
    const plate = mob.mesh.userData.armorPlate;
    if (plate) {
      if (!this._horseArmorMats) this._horseArmorMats = {};
      if (!this._horseArmorMats[tier]) {
        this._horseArmorMats[tier] = new THREE.MeshLambertMaterial({ color: HORSE_ARMOR[tier].color });
      }
      plate.material = this._horseArmorMats[tier];
      plate.userData.baseMaterial = this._horseArmorMats[tier];
      plate.visible = true;
    }
    return true;
  }

  removeAt(i) {
    const m = this.mobs[i];
    if (m.beamLine) { // dragon healing beam (Phase 9)
      this.scene.remove(m.beamLine);
      m.beamLine.geometry.dispose();
      m.beamLine = null;
    }
    this.scene.remove(m.mesh);
    this.mobs.splice(i, 1);
  }

  isHostile(type) {
    return !!mobDef(type).hostile;
  }

  // The current boss-bar mob: the Nether Overlord or the Ender Dragon.
  getBoss() {
    for (const m of this.mobs) if (m.boss || m.type === 'ender_dragon') return m;
    return null;
  }

  countType(isPassive) {
    let n = 0;
    for (const m of this.mobs) {
      if (!this.isHostile(m.type) === isPassive) n++;
    }
    return n;
  }

  spawnNear(playerPos, type, extra = {}) {
    const def = mobDef(type);
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 15 + Math.random() * 12;
      const x = Math.floor(playerPos.x + Math.cos(a) * r);
      const z = Math.floor(playerPos.z + Math.sin(a) * r);
      const fromY = this.world.skyless ? playerPos.y : null;
      const h = this.groundY(x, z, fromY);
      if (!this.world.skyless && h <= SEA_LEVEL) continue;
      if (this.world.skyless && this.world.getBlock(x, h, z) === BLOCK.LAVA) continue;
      // The End: never spawn over the void (the downward scan bottoms out at
      // y 1 in empty columns — require real ground under the spot).
      if (this.world.dim && this.world.dim.id === 'end' &&
          !isSolid(this.world.getBlock(x, h, z))) continue;
      if (!this.isHostile(type)) {
        const block = this.world.getBlock(x, h, z);
        if (block !== BLOCK.GRASS && block !== BLOCK.SNOW) continue;
      }
      // Biome-restricted spawns (wolves in forest/snow; later slimes/horses).
      if (def.spawn && def.spawn.biomes && !this.world.skyless) {
        const biome = this.world.biomeAt(x, z);
        if (!def.spawn.biomes.includes(biome)) continue;
      }
      if (!this.canStandAt(type, x + 0.5, z + 0.5, fromY)) continue;
      return this.addMob(new THREE.Vector3(x + 0.5, h + 1, z + 0.5), type, undefined, extra);
    }
    return null;
  }

  groundY(x, z, fromY = null) {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    // In roofed worlds (the nether) a top-down scan would put mobs on the
    // ceiling: search downward from the mob's current height instead.
    if (this.world.skyless && fromY != null) {
      // Roofed worlds are NETHER_HEIGHT tall; never start the scan on the
      // roof. The End is skyless but full-height (no roof to avoid).
      const cap = this.world.dim && this.world.dim.id === 'end' ? CHUNK_HEIGHT - 2 : NETHER_HEIGHT - 2;
      let y = Math.min(cap, Math.floor(fromY) + 2);
      while (y > 1 && !isSolid(this.world.getBlock(bx, y, bz))) y--;
      return y;
    }
    return typeof this.world.surfaceHeight === 'function'
      ? this.world.surfaceHeight(bx, bz)
      : this.world.getHeight(bx, bz);
  }

  canStandAt(type, x, z, fromY = null) {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const h = this.groundY(bx, bz, fromY);
    if (!this.world.skyless && h <= SEA_LEVEL) return false;
    // Spiders climb: they accept much taller steps while chasing (def.maxStep).
    // Only UPWARD steps are limited — mobs may always walk off a ledge and let
    // gravity take them down (they fall into pits now).
    const maxStep = mobDef(type).maxStep || 1.15;
    if (fromY != null && h - fromY > maxStep) return false;
    if (this.world.getBlock(bx, h + 1, bz) === BLOCK.WATER) return false;
    if (isSolid(this.world.getBlock(bx, h + 1, bz))) return false;
    if (this.isHostile(type) && isSolid(this.world.getBlock(bx, h + 2, bz))) return false;
    return true;
  }

  tryMove(m, vx, vz, dt) {
    // Slowness (splash potion) scales every kind of mob movement here — the
    // single gate all AI handlers move through.
    const slow = this.mobEffectLevel(m, 'slowness');
    if (slow > 0) {
      const mul = Math.max(0.1, 1 - 0.15 * slow);
      vx *= mul;
      vz *= mul;
    }
    const p = m.mesh.position;
    const curY = this.groundY(p.x, p.z, p.y);
    const nx = p.x + vx * dt;
    const nz = p.z + vz * dt;
    if (this.canStandAt(m.type, nx, nz, curY)) {
      p.x = nx;
      p.z = nz;
      return true;
    }
    if (this.canStandAt(m.type, nx, p.z, curY)) {
      p.x = nx;
      return true;
    }
    if (this.canStandAt(m.type, p.x, nz, curY)) {
      p.z = nz;
      return true;
    }
    // Fully blocked while standing on the ground and actually trying to move:
    // hop, so 1-block walls are climbable (auto-step handles <= 1-block ledges,
    // the jump covers exact walls the step rejects).
    if (m.onGround && (m.vy || 0) === 0 && !mobDef(m.type).flies &&
        Math.hypot(vx, vz) > 1.2) {
      m.vy = 7.5;
      m.onGround = false;
    }
    return false;
  }

  // Per-frame vertical physics, replacing the old ground snap: gravity + floor
  // landing (with fall damage), ceiling clamp, water buoyancy and hover for
  // flying mobs. Returns true if the mob died (removed) from fall damage.
  _applyVertical(m, def, dt) {
    const p = m.mesh.position;
    const groundTop = this.groundY(p.x, p.z, p.y) + 1;
    // Flying mobs ease toward their hover height and ignore gravity.
    if (def.flies) {
      m.vy = 0;
      m.onGround = true;
      m.fallPeak = null;
      const target = Math.min(groundTop + (def.hover || 0), 60);
      const dy = target - p.y;
      // Never rise into a solid ceiling (the nether roof would otherwise trick
      // the downward ground scan into chasing ever-higher targets).
      if (dy > 0 && isSolid(this.world.getBlock(Math.floor(p.x), Math.floor(p.y + 2.2), Math.floor(p.z)))) {
        return false;
      }
      p.y += dy * Math.min(1, dt * 2.5);
      return false;
    }
    // Buoyancy: in water mobs ease toward a slow sink instead of plummeting.
    const bx = Math.floor(p.x), bz = Math.floor(p.z);
    if (this.world.getBlock(bx, Math.floor(p.y + 0.1), bz) === BLOCK.WATER) {
      m.vy = (m.vy || 0) + (-0.4 - (m.vy || 0)) * Math.min(1, dt * 4);
      p.y = Math.max(groundTop, p.y + m.vy * dt);
      m.onGround = p.y <= groundTop + 0.01;
      m.fallPeak = null;
      return false;
    }
    m.vy = (m.vy || 0) - 22 * dt;
    // Ceiling clamp while moving up.
    if (m.vy > 0 && isSolid(this.world.getBlock(bx, Math.floor(p.y + 1.9), bz))) {
      m.vy = 0;
    }
    let ny = p.y + m.vy * dt;
    if (ny <= groundTop) {
      // Landed (or auto-stepped: tryMove walked onto ground above us).
      if (m.fallPeak != null) {
        const fall = m.fallPeak - groundTop;
        m.fallPeak = null;
        if (fall > 3) {
          const res = this.damageMob(m, Math.max(1, Math.floor(fall - 3)), p);
          if (res && res.killed) {
            if (this.onEnvKill) this.onEnvKill(res);
            return true;
          }
        }
      }
      ny = groundTop;
      m.vy = 0;
      m.onGround = true;
    } else {
      m.onGround = false;
      m.fallPeak = m.fallPeak == null ? Math.max(p.y, ny) : Math.max(m.fallPeak, ny);
    }
    p.y = ny;
    return false;
  }

  hasLineOfSight(from, to) {
    const dir = to.clone().sub(from);
    const dist = dir.length();
    if (dist <= 0.01) return true;
    dir.multiplyScalar(1 / dist);
    const hit = this.world.raycastVoxel(from, dir, dist);
    return !hit || hit.distance >= dist - 0.45;
  }

  raycast(origin, dir, maxDist = 4) {
    let best = null;
    for (const mob of this.mobs) {
      const center = mob.mesh.position.clone().add(new THREE.Vector3(0, HIT_HEIGHT, 0));
      const toCenter = center.clone().sub(origin);
      const t = toCenter.dot(dir);
      if (t < 0 || t > maxDist) continue;
      const closest = origin.clone().addScaledVector(dir, t);
      const miss = closest.distanceTo(center);
      if (miss > HIT_RADIUS) continue;
      if (!best || t < best.distance) best = { mob, distance: t };
    }
    return best;
  }

  // Table-driven drops (MOB_DEFS[type].drops).
  mobDrops(mob) {
    return rollMobDrops(mob);
  }

  damageMob(mob, amount, fromPos) {
    if (!mob || amount <= 0) return null;
    // The dragon only takes full damage while perched (vanilla-flavoured):
    // hits on the wing are halved. Crystals die to any hit (hp 1).
    if (mob.type === 'ender_dragon' && mob.dragonState !== 'perch') {
      amount = Math.max(1, Math.round(amount * 0.5));
    }
    // Horse armor absorbs a fraction of every hit (Phase 10).
    if (mob.horseArmor && HORSE_ARMOR[mob.horseArmor]) {
      amount = Math.max(1, Math.round(amount * (1 - HORSE_ARMOR[mob.horseArmor].reduction)));
    }
    mob.health -= amount;
    mob.hurtTimer = 0.22;
    for (const child of mob.mesh.children) child.material = this.materials.hurt;

    const p = mob.mesh.position;
    const dx = p.x - fromPos.x;
    const dz = p.z - fromPos.z;
    const len = Math.hypot(dx, dz) || 1;
    if (!mob.boss && mob.type !== 'ender_dragon' && mob.type !== 'crystal') {
      mob.velocity.x += (dx / len) * 4.2;
      mob.velocity.z += (dz / len) * 4.2;
    }

    // Retaliation and pack anger.
    if (mob.type === 'spider' || mob.type === 'enderman') {
      mob.aggroTimer = 15;
      if (mob.type === 'enderman') mob.teleportTimer = 0.01; // teleport out immediately
    } else if (mob.type === 'zombie_pigman') {
      for (const other of this.mobs) {
        if (other.type === 'zombie_pigman' && other.mesh.position.distanceTo(p) < 16) {
          other.aggroTimer = 15;
        }
      }
    } else if (mob.type === 'wolf' && !mob.tame) {
      for (const other of this.mobs) {
        if (other.type === 'wolf' && !other.tame && other.mesh.position.distanceTo(p) < 16) {
          other.aggroTimer = 15;
        }
      }
    } else if (!this.isHostile(mob.type) && mob.type !== 'wolf') {
      mob.fleeTimer = FLEE_DURATION;
      mob.fleeDir.set(dx / len, dz / len);
    }

    if (mob.health > 0) return { killed: false, position: p.clone() };

    const deathPos = p.clone();
    const allDrops = this.mobDrops(mob);
    const xp = xpForMob(mob);
    const i = this.mobs.indexOf(mob);
    if (i >= 0) this.removeAt(i);
    // Slimes/magma cubes split into 2-3 smaller ones on death.
    const def = mobDef(mob.type);
    if (def.split && mob.size > 1) {
      const n = 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + Math.random();
        const child = this.addMob(
          new THREE.Vector3(deathPos.x + Math.cos(a) * 0.4, deathPos.y + 0.3, deathPos.z + Math.sin(a) * 0.4),
          mob.type, undefined, { size: mob.size - 1, spawnerKey: mob.spawnerKey },
        );
        child.vy = 4 + Math.random() * 2;
        child.onGround = false;
        child.velocity.x = Math.cos(a) * 2.5;
        child.velocity.z = Math.sin(a) * 2.5;
      }
    }
    return { killed: true, position: deathPos, drops: allDrops, type: mob.type, xp };
  }

  update(dt, player, survival, dayT) {
    const playerPos = player.getObject().position;
    const night = this.isNight(dayT);
    const dimId = this.world.dim ? this.world.dim.id : 'overworld';
    // `nether` kept as "roofed/skyless" for the legacy branches below; the End
    // is skyless too but gets its own spawn branch keyed on dimId.
    const nether = !!this.world.skyless;

    // Despawn hostile mobs at dawn (overworld only; the boss, dungeon spawner
    // mobs and persistent mobs stay).
    if (!night && !nether) {
      for (let i = this.mobs.length - 1; i >= 0; i--) {
        const m = this.mobs[i];
        if (this.isHostile(m.type) && !m.boss && !m.spawnerKey && !mobDef(m.type).persist) this.removeAt(i);
      }
    }

    if (!survival.alive) {
      // The death wipe clears the field so hostiles cannot camp the respawn —
      // but keepsakes (tamed wolves, saddled/armored horses, golems) survive
      // it, matching how they also never distance-despawn (Phase 10).
      for (let i = this.mobs.length - 1; i >= 0; i--) {
        const m = this.mobs[i];
        if (m.tame || m.saddled || m.horseArmor || mobDef(m.type).persist) continue;
        this.removeAt(i);
      }
      this.spawnTimer = 2;
      this.passiveSpawnTimer = 3;
      return;
    }

    // Ambient spawning (weighted lists derived from MOB_DEFS.spawn).
    if (dimId === 'end') {
      // Endermen only, day and night (the End has no daylight cycle).
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = SPAWN_INTERVAL;
        const endermen = this.mobs.filter((m) => m.type === 'enderman').length;
        if (endermen < 4) {
          const pick = weightedPick(this.spawnLists.end);
          if (pick) this.spawnNear(playerPos, pick.type);
        }
      }
    } else if (nether) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = SPAWN_INTERVAL;
        if (this.countType(false) < 6) {
          const pick = weightedPick(this.spawnLists.nether);
          if (pick) this.spawnNear(playerPos, pick.type);
        }
      }
    } else if (night) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        // Zombie-siege lite (Phase 8): hostile spawn pressure doubles while
        // the player is within VILLAGE_RADIUS of a village centre at night
        // (spawn attempts come twice as often; the cap is unchanged).
        const siege = !!this.nearestVillageCenter(playerPos, VILLAGE_RADIUS);
        this.spawnTimer = siege ? SPAWN_INTERVAL / 2 : SPAWN_INTERVAL;
        if (this.countType(false) < MAX_HOSTILE) {
          const pick = weightedPick(this.spawnLists.overworldNight);
          if (pick) this.spawnNear(playerPos, pick.type);
        }
      }
    }
    // Water mobs (squid) spawn day or night in the overworld.
    if (!nether) {
      this.waterSpawnTimer -= dt;
      if (this.waterSpawnTimer <= 0) {
        this.waterSpawnTimer = SPAWN_INTERVAL + 4;
        const squids = this.mobs.filter((m) => m.type === 'squid').length;
        if (squids < 3) this._spawnWaterMob(playerPos, 'squid');
      }
    }
    if (!night && !nether) {
      this.passiveSpawnTimer -= dt;
      if (this.passiveSpawnTimer <= 0) {
        this.passiveSpawnTimer = SPAWN_INTERVAL + 2;
        const wolves = this.mobs.filter((w) => w.type === 'wolf').length;
        if (Math.random() < 0.12 && wolves < MAX_WOLVES) {
          this.spawnNear(playerPos, 'wolf');
        } else if (this.countType(true) < MAX_PASSIVE) {
          // Phase 8: near a village centre villagers dominate the passive
          // picks (weight x4); horses/wolves keep their normal weights.
          let dayList = this.spawnLists.overworldDay;
          if (this.nearestVillageCenter(playerPos, VILLAGE_RADIUS)) {
            dayList = dayList.map((c) => (c.type === 'villager'
              ? { ...c, weight: c.weight * VILLAGER_VILLAGE_WEIGHT } : c));
          }
          const pick = weightedPick(dayList);
          if (pick) {
            const group = (pick.def.spawn && pick.def.spawn.group) || 1;
            const first = this.spawnNear(playerPos, pick.type);
            for (let g = 1; first && g < group; g++) {
              this.addMob(first.mesh.position.clone().add(new THREE.Vector3(1, 0, 1)), pick.type);
            }
          }
        }
      }
    }

    this._updateSpawners(dt, playerPos);
    this._updateBreeding(dt);
    if (!nether) this._updateVillageGolems(dt, playerPos);

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      const p = m.mesh.position;
      const def = mobDef(m.type);

      if (m.hurtTimer > 0) {
        m.hurtTimer -= dt;
        if (m.hurtTimer <= 0) {
          for (const child of m.mesh.children) child.material = child.userData.baseMaterial;
          if (m.tame && m.mesh.userData.collar) m.mesh.userData.collar.visible = true;
        }
      }
      if (m.aggroTimer > 0) m.aggroTimer -= dt;
      // Status effects (poison may kill the mob's mesh entry via damageMob —
      // but poison floors at 1 HP, so the mob always survives the tick).
      this._tickMobEffects(m, dt);
      if (m.loveTimer > 0) {
        m.loveTimer -= dt;
        if (this.onEffect && Math.random() < dt * 2) this.onEffect('hearts', p.clone());
      }
      if (m.breedCooldown > 0) m.breedCooldown -= dt;
      if (m.baby) {
        m.growTimer -= dt;
        if (m.growTimer <= 0) {
          m.baby = false;
          m.mesh.scale.setScalar(1);
        }
      }

      const dx = playerPos.x - p.x;
      const dz = playerPos.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > DESPAWN_DISTANCE && !m.boss && !m.tame && !def.persist && !m.saddled) {
        this.removeAt(i);
        continue;
      }

      // A ridden horse is steered by main.js; only physics applies here.
      if (m.ridden) {
        this._applyVertical(m, def, dt);
        continue;
      }

      this.tryMove(m, m.velocity.x, m.velocity.z, dt);
      m.velocity.x *= Math.pow(0.08, dt);
      m.velocity.z *= Math.pow(0.08, dt);

      if (m.boss) {
        this._bossAI(m, dt, player, survival, playerPos);
        continue; // the boss flies: it owns its y position
      }

      // Phase 9: dragon and crystals own their vertical position entirely.
      if (def.ai === 'dragon') {
        this._dragonAI(m, dt, player, survival, playerPos);
        continue;
      }
      if (def.ai === 'crystal') {
        this._crystalAI(m, dt);
        continue;
      }
      // Anything that wanders off the End island falls forever: cull it.
      if (dimId === 'end' && p.y < -10) {
        this.removeAt(i);
        continue;
      }

      if (def.hostile) {
        const removed = this._hostileAI(m, def, dt, dist, dx, dz, player, survival, playerPos, night);
        if (removed) continue;
      } else if (def.ai === 'wolf') {
        this._wolfAI(m, dt, dist, dx, dz, playerPos);
      } else if (def.ai === 'golem') {
        this._aiGolem(m, dt);
      } else if (def.ai === 'squid') {
        const r = this._aiSquid(m, dt);
        if (r === true) continue;        // suffocated (removed)
        if (r === 'swimming') continue;  // owns its own y in water
      } else {
        // Passive mob AI: flee or wander
        if (m.fleeTimer > 0) {
          m.fleeTimer -= dt;
          if (!this.tryMove(m, m.fleeDir.x * FLEE_SPEED, m.fleeDir.y * FLEE_SPEED, dt)) {
            m.fleeTimer = 0;
          }
          m.mesh.rotation.y = Math.atan2(-m.fleeDir.x, -m.fleeDir.y);
        } else {
          m.wanderTimer -= dt;
          if (m.wanderTimer <= 0) {
            m.wanderTimer = WANDER_INTERVAL + Math.random() * 3;
            const angle = Math.random() * Math.PI * 2;
            m.wanderDir.set(Math.cos(angle), Math.sin(angle));
          }
          if (!this.tryMove(m, m.wanderDir.x * def.speed, m.wanderDir.y * def.speed, dt)) {
            m.wanderTimer = 0;
          }
          m.mesh.rotation.y = Math.atan2(m.wanderDir.x, m.wanderDir.y);
        }
      }

      // Gravity / hover / buoyancy (replaces the old per-frame ground snap).
      if (this._applyVertical(m, def, dt)) continue; // killed by fall damage
    }
  }

  _wander(m, dt, speed = PASSIVE_SPEED) {
    m.wanderTimer -= dt;
    if (m.wanderTimer <= 0) {
      m.wanderTimer = WANDER_INTERVAL + Math.random() * 2;
      const angle = Math.random() * Math.PI * 2;
      m.wanderDir.set(Math.cos(angle), Math.sin(angle));
    }
    this.tryMove(m, m.wanderDir.x * speed, m.wanderDir.y * speed, dt);
    m.mesh.rotation.y = Math.atan2(m.wanderDir.x, m.wanderDir.y);
  }

  // Standalone passive behaviour is shared with the update-loop inline branch;
  // used by the AI table for completeness.
  _aiPassive(m, dt) {
    this._wander(m, dt, mobDef(m.type).speed);
  }

  // Melee hit on the player when adjacent, on the shared attack timer.
  // Passes the mob's position as the damage source (shield blocking checks
  // the frontal hemisphere); a weakened mob (splash potion) hits for less.
  _tryMelee(m, dist, playerPos, canSeePlayer, survival, damage, label, dt) {
    m.attackTimer -= dt;
    const vertical = Math.abs((playerPos.y - 1.62) - m.mesh.position.y);
    if (dist < ATTACK_DISTANCE + (m.type === 'boss' ? 2 : 0) && vertical < 2 && canSeePlayer && m.attackTimer <= 0) {
      m.attackTimer = ATTACK_INTERVAL;
      const weak = this.mobEffectLevel(m, 'weakness');
      survival.damage(Math.max(1, damage - 2 * weak), label, m.mesh.position);
      return true;
    }
    return false;
  }

  // ---- Phase 7: lightweight mob status effects --------------------------------
  // Mobs carry a plain array m.effects = [{ id, amp, t, tick }] — only
  // poison (periodic damage), slowness (tryMove scale) and weakness (melee
  // reduction) are honoured; everything else is ignored by design.
  addMobEffect(m, id, amp = 1, dur = 15) {
    if (!m.effects) m.effects = [];
    const cur = m.effects.find((e) => e.id === id);
    if (cur) {
      cur.amp = Math.max(cur.amp, amp);
      cur.t = Math.max(cur.t, dur);
    } else {
      m.effects.push({ id, amp, t: dur, tick: 0 });
    }
  }

  mobEffectLevel(m, id) {
    if (!m.effects) return 0;
    const e = m.effects.find((x) => x.id === id);
    return e ? e.amp : 0;
  }

  // Tick a mob's effect timers; poison damages on its interval but never
  // kills (floor 1 HP, vanilla rule).
  _tickMobEffects(m, dt) {
    if (!m.effects || m.effects.length === 0) return;
    for (let i = m.effects.length - 1; i >= 0; i--) {
      const e = m.effects[i];
      e.t -= dt;
      if (e.t <= 0) {
        m.effects.splice(i, 1);
        continue;
      }
      if (e.id === 'poison') {
        e.tick = (e.tick || 0) + dt;
        if (e.tick >= 1.25 / e.amp) {
          e.tick = 0;
          if (m.health > 1) this.damageMob(m, 1, m.mesh.position);
        }
      }
    }
  }

  // Shared hostile prelude (creative check + line of sight), then dispatch to
  // AI_HANDLERS[def.ai]. Returns true if the mob removed itself.
  _hostileAI(m, def, dt, dist, dx, dz, player, survival, playerPos, night) {
    const p = m.mesh.position;
    // Creative player: hostiles ignore them entirely and just wander.
    if (this.playerInvulnerable) {
      if (m.type === 'creeper' && (m.fusing || m.fuseTimer > 0)) {
        m.fusing = false;
        m.fuseTimer = 0;
        if (m.hurtTimer <= 0) {
          for (const child of m.mesh.children) child.material = child.userData.baseMaterial;
        }
      }
      this._wander(m, dt);
      return false;
    }
    const eye = p.clone().add(new THREE.Vector3(0, 1.1, 0));
    const target = playerPos.clone().add(new THREE.Vector3(0, -0.25, 0));
    const canSeePlayer = dist < 26 && this.hasLineOfSight(eye, target);
    const handler = this.aiHandlers[def.ai];
    if (!handler) { this._wander(m, dt); return false; }
    return !!handler(m, {
      def, dt, dist, dx, dz, player, survival, playerPos, night, canSeePlayer, p,
    });
  }

  _aiZombie(m, { def, dt, dist, dx, dz, survival, playerPos, canSeePlayer, p }) {
    const speed = def.speed;
    if (dist > 0.01 && canSeePlayer) {
      const moved = this.tryMove(m, (dx / dist) * speed, (dz / dist) * speed, dt);
      if (!moved) {
        const side = Math.sign(Math.sin(performance.now() * 0.001 + p.x + p.z)) || 1;
        this.tryMove(m, (-dz / dist) * speed * side, (dx / dist) * speed * side, dt);
      }
      m.mesh.rotation.y = Math.atan2(dx, dz);
    } else {
      this._wander(m, dt, PASSIVE_SPEED * 0.75);
    }
    this._tryMelee(m, dist, playerPos, canSeePlayer, survival, def.melee.damage, def.melee.label, dt);
    return false;
  }

  _aiSkeleton(m, { def, dt, dist, dx, dz, playerPos, canSeePlayer, p }) {
    m.mesh.rotation.y = Math.atan2(dx, dz);
    if (canSeePlayer && dist < def.shootRange) {
      if (dist < 5) {
        this.tryMove(m, (-dx / dist) * def.speed, (-dz / dist) * def.speed, dt);
      } else if (dist > 10) {
        this.tryMove(m, (dx / dist) * def.speed, (dz / dist) * def.speed, dt);
      }
      m.attackTimer -= dt;
      if (m.attackTimer <= 0) {
        m.attackTimer = def.shootInterval;
        if (this.onShoot) {
          const from = p.clone().add(new THREE.Vector3(0, 1.45, 0));
          const to = playerPos.clone().add(new THREE.Vector3(0, -0.55, 0));
          this.onShoot(from, to);
        }
      }
    } else {
      this._wander(m, dt);
    }
    return false;
  }

  _aiCreeper(m, { def, dt, dist, dx, dz, survival, playerPos, canSeePlayer }) {
    m.mesh.rotation.y = Math.atan2(dx, dz);
    if (canSeePlayer && dist < 12) {
      this.tryMove(m, (dx / dist) * def.speed, (dz / dist) * def.speed, dt);
      if (dist < 2.5) {
        m.fusing = true;
        m.fuseTimer += dt;
        const flash = Math.sin(m.fuseTimer * 12) > 0;
        for (const child of m.mesh.children) {
          child.material = flash ? this.materials.hurt : child.userData.baseMaterial;
        }
        if (m.fuseTimer >= CREEPER_FUSE_TIME) {
          const idx = this.mobs.indexOf(m);
          if (idx >= 0) this.removeAt(idx);
          this._creeperExplode(m, playerPos, survival);
          return true;
        }
      } else if (m.fusing) {
        m.fusing = false;
        m.fuseTimer = Math.max(0, m.fuseTimer - dt * 2);
        for (const child of m.mesh.children) child.material = child.userData.baseMaterial;
      }
    } else {
      m.fusing = false;
      m.fuseTimer = 0;
      this._wander(m, dt);
    }
    return false;
  }

  _aiSpider(m, { def, dt, dist, dx, dz, survival, playerPos, canSeePlayer, night, p }) {
    // Hostile in darkness or when provoked; neutral in daylight.
    const aggressive = (night || this.world.skyless || m.aggroTimer > 0);
    if (aggressive && canSeePlayer && dist > 0.01) {
      const moved = this.tryMove(m, (dx / dist) * def.speed, (dz / dist) * def.speed, dt);
      if (!moved) {
        const side = Math.sign(Math.sin(performance.now() * 0.0013 + p.x)) || 1;
        this.tryMove(m, (-dz / dist) * def.speed * side, (dx / dist) * def.speed * side, dt);
      }
      m.mesh.rotation.y = Math.atan2(dx, dz);
      this._tryMelee(m, dist, playerPos, canSeePlayer, survival, def.melee.damage, def.melee.label, dt);
    } else {
      this._wander(m, dt);
    }
    return false;
  }

  _aiEnderman(m, { def, dt, dist, dx, dz, player, survival, playerPos, canSeePlayer, p }) {
    // Neutral until stared at (or hit). Staring = the player looks straight
    // at it from within 20 blocks with a clear line of sight.
    if (m.aggroTimer <= 0 && dist < 20 && canSeePlayer && player.camera) {
      const camDir = new THREE.Vector3();
      player.camera.getWorldDirection(camDir);
      const toMob = p.clone().add(new THREE.Vector3(0, 2.2, 0)).sub(playerPos).normalize();
      if (camDir.dot(toMob) > 0.985) {
        m.aggroTimer = 20;
        if (this.onEffect) this.onEffect('warp', p.clone());
      }
    }
    if (m.aggroTimer > 0) {
      m.teleportTimer -= dt;
      if (m.teleportTimer <= 0) {
        m.teleportTimer = 3 + Math.random() * 2;
        this._teleportNear(m, playerPos);
      }
      if (dist > 0.01) {
        this.tryMove(m, (dx / dist) * def.speed, (dz / dist) * def.speed, dt);
        m.mesh.rotation.y = Math.atan2(dx, dz);
      }
      this._tryMelee(m, dist, playerPos, true, survival, def.melee.damage, def.melee.label, dt);
    } else {
      this._wander(m, dt, PASSIVE_SPEED * 0.6);
    }
    return false;
  }

  _aiPigman(m, { def, dt, dist, dx, dz, survival, playerPos, canSeePlayer }) {
    // Neutral until the pack is provoked.
    if (m.aggroTimer > 0 && dist > 0.01) {
      this.tryMove(m, (dx / dist) * def.speed, (dz / dist) * def.speed, dt);
      m.mesh.rotation.y = Math.atan2(dx, dz);
      this._tryMelee(m, dist, playerPos, canSeePlayer, survival, def.melee.damage, def.melee.label, dt);
    } else {
      this._wander(m, dt, PASSIVE_SPEED * 0.7);
    }
    return false;
  }

  _aiFireImp(m, { def, dt, dist, dx, dz, playerPos, canSeePlayer, p }) {
    m.mesh.rotation.y = Math.atan2(dx, dz);
    // Hovering bob.
    m.mesh.children[0].position.y = 1.0 + Math.sin(performance.now() * 0.003 + p.x) * 0.15;
    if (canSeePlayer && dist < def.shootRange) {
      if (dist < 4) this.tryMove(m, (-dx / dist) * def.speed, (-dz / dist) * def.speed, dt);
      m.attackTimer -= dt;
      if (m.attackTimer <= 0) {
        m.attackTimer = def.shootInterval;
        if (this.onShootFire) {
          const from = p.clone().add(new THREE.Vector3(0, 1.2, 0));
          const to = playerPos.clone().add(new THREE.Vector3(0, -0.4, 0));
          this.onShootFire(from, to, 4);
        }
      }
    } else {
      this._wander(m, dt, PASSIVE_SPEED * 0.8);
    }
    return false;
  }

  // Ghast: high-altitude drifter lobbing fireballs from long range.
  _aiGhast(m, { def, dt, dist, dx, dz, playerPos, canSeePlayer, p }) {
    this._wander(m, dt, def.speed);
    m.mesh.rotation.y = Math.atan2(dx, dz);
    m.attackTimer -= dt;
    if (canSeePlayer && dist < def.shootRange && m.attackTimer <= 0) {
      m.attackTimer = def.shootInterval;
      if (this.onShootFire) {
        const from = p.clone().add(new THREE.Vector3(0, 1.2, 0));
        const to = playerPos.clone().add(new THREE.Vector3(0, -0.4, 0));
        this.onShootFire(from, to, 5);
      }
    }
    return false;
  }

  // Blaze: hovers low, spins its rods, fires triple bursts.
  _aiBlaze(m, { def, dt, dist, dx, dz, playerPos, canSeePlayer, p }) {
    if (m.mesh.userData.rods) m.mesh.userData.rods.rotation.y += dt * 4;
    m.mesh.rotation.y = Math.atan2(dx, dz);
    if (canSeePlayer && dist < def.shootRange) {
      if (dist > 9) this.tryMove(m, (dx / dist) * def.speed, (dz / dist) * def.speed, dt);
      m.attackTimer -= dt;
      if (m.attackTimer <= 0) {
        m.attackTimer = def.shootInterval;
        if (this.onShootFire) {
          for (let i = -1; i <= 1; i++) {
            const from = p.clone().add(new THREE.Vector3(0, 1.3, 0));
            const to = playerPos.clone().add(new THREE.Vector3(i * 0.9, -0.4, i * 0.9));
            this.onShootFire(from, to, 3);
          }
        }
      }
    } else {
      this._wander(m, dt, def.speed * 0.6);
    }
    return false;
  }

  // Slime / magma cube: hops every 1-2 s, moves only while airborne, contact
  // damage scales with size (size 1 is harmless).
  _aiSlime(m, { def, dt, dist, dx, dz, survival, playerPos, canSeePlayer }) {
    m.hopTimer = (m.hopTimer != null ? m.hopTimer : Math.random()) - dt;
    const sz = m.size || 1;
    if (m.onGround) {
      m.hopDir = null;
      if (m.hopTimer <= 0) {
        m.hopTimer = 1 + Math.random();
        let hx, hz;
        if (canSeePlayer && dist > 0.01) { hx = dx / dist; hz = dz / dist; }
        else { const a = Math.random() * Math.PI * 2; hx = Math.cos(a); hz = Math.sin(a); }
        m.hopDir = { x: hx, z: hz };
        m.vy = 5.5 + sz * 0.7;
        m.onGround = false;
        m.mesh.rotation.y = Math.atan2(hx, hz);
      }
    } else if (m.hopDir) {
      const sp = def.speed + sz * 0.5;
      this.tryMove(m, m.hopDir.x * sp, m.hopDir.z * sp, dt);
    }
    const dmg = def.sizes && def.sizes[sz] ? def.sizes[sz].damage : def.melee.damage;
    if (dmg > 0) this._tryMelee(m, dist, playerPos, canSeePlayer, survival, dmg, def.melee.label, dt);
    return false;
  }

  // Witch: keeps 8-10 blocks of distance and throws poison flasks.
  _aiWitch(m, { def, dt, dist, dx, dz, playerPos, canSeePlayer, p }) {
    m.mesh.rotation.y = Math.atan2(dx, dz);
    if (canSeePlayer && dist < def.shootRange) {
      if (dist < 8) this.tryMove(m, (-dx / dist) * def.speed, (-dz / dist) * def.speed, dt);
      else if (dist > 10) this.tryMove(m, (dx / dist) * def.speed, (dz / dist) * def.speed, dt);
      m.attackTimer -= dt;
      if (m.attackTimer <= 0) {
        m.attackTimer = def.shootInterval;
        if (this.onShootFlask) {
          const from = p.clone().add(new THREE.Vector3(0, 1.6, 0));
          const to = playerPos.clone().add(new THREE.Vector3(0, -0.4, 0));
          this.onShootFlask(from, to);
        }
      }
    } else {
      this._wander(m, dt);
    }
    return false;
  }

  // Silverfish: fast, erratic zig-zag rushes.
  _aiSilverfish(m, { def, dt, dist, dx, dz, survival, playerPos, canSeePlayer }) {
    if (canSeePlayer && dist > 0.01) {
      m.jitterTimer = (m.jitterTimer || 0) - dt;
      if (m.jitterTimer <= 0 || !m.jitterDir) {
        m.jitterTimer = 0.25 + Math.random() * 0.35;
        const ang = Math.atan2(dx, dz) + (Math.random() - 0.5) * 1.6;
        m.jitterDir = { x: Math.sin(ang), z: Math.cos(ang) };
      }
      this.tryMove(m, m.jitterDir.x * def.speed, m.jitterDir.z * def.speed, dt);
      m.mesh.rotation.y = Math.atan2(m.jitterDir.x, m.jitterDir.z);
      this._tryMelee(m, dist, playerPos, canSeePlayer, survival, def.melee.damage, def.melee.label, dt);
    } else {
      this._wander(m, dt, def.speed * 0.4);
    }
    return false;
  }

  // Iron golem: guards its home turf — attacks hostiles within 16 blocks,
  // wanders otherwise, never follows the player.
  _aiGolem(m, dt) {
    const def = mobDef(m.type);
    const p = m.mesh.position;
    let best = null;
    let bestD = 16;
    for (const o of this.mobs) {
      if (o === m || !this.isHostile(o.type) || o.boss) continue;
      const d = o.mesh.position.distanceTo(p);
      if (d < bestD) { best = o; bestD = d; }
    }
    if (best) {
      const tdx = best.mesh.position.x - p.x;
      const tdz = best.mesh.position.z - p.z;
      const td = Math.hypot(tdx, tdz) || 1;
      this.tryMove(m, (tdx / td) * def.speed, (tdz / td) * def.speed, dt);
      m.mesh.rotation.y = Math.atan2(tdx, tdz);
      m.attackTimer -= dt;
      if (td < 1.7 && m.attackTimer <= 0) {
        m.attackTimer = ATTACK_INTERVAL;
        const res = this.damageMob(best, def.melee.damage, p);
        if (res && !res.killed) {
          // Heavy blow launches the target.
          best.vy = 7;
          best.onGround = false;
        } else if (res && res.killed && this.onEnvKill) {
          this.onEnvKill(res);
        }
      }
    } else {
      this._wander(m, dt, def.speed * 0.55);
    }
  }

  // Squid: drifts in 3D through water; beached squids flop and suffocate.
  // Returns true while it owns its own y (swimming) or if it died.
  _aiSquid(m, dt) {
    const def = mobDef(m.type);
    const p = m.mesh.position;
    const bx = Math.floor(p.x), bz = Math.floor(p.z);
    const inWater = this.world.getBlock(bx, Math.floor(p.y + 0.3), bz) === BLOCK.WATER;
    if (!inWater) {
      // Beached: flop about and slowly suffocate. Gravity still applies.
      m.suffocateTimer = (m.suffocateTimer || 0) + dt;
      if (m.onGround && Math.random() < dt * 1.5) {
        m.vy = 3.5;
        m.onGround = false;
        const a = Math.random() * Math.PI * 2;
        m.velocity.x += Math.cos(a) * 1.5;
        m.velocity.z += Math.sin(a) * 1.5;
      }
      if (m.suffocateTimer >= 2) {
        m.suffocateTimer = 0;
        const res = this.damageMob(m, 1, p);
        if (res && res.killed) {
          if (this.onEnvKill) this.onEnvKill(res);
          return true;
        }
      }
      return false;
    }
    m.suffocateTimer = 0;
    m.swimTimer = (m.swimTimer || 0) - dt;
    if (m.swimTimer <= 0 || !m.swimDir) {
      m.swimTimer = 2 + Math.random() * 2;
      const a = Math.random() * Math.PI * 2;
      m.swimDir = { x: Math.cos(a) * 0.9, y: (Math.random() - 0.45) * 0.7, z: Math.sin(a) * 0.9 };
    }
    const d = m.swimDir;
    const nx = p.x + d.x * def.speed * dt;
    const ny = p.y + d.y * def.speed * dt;
    const nz = p.z + d.z * def.speed * dt;
    // A squid never swims out of water.
    if (this.world.getBlock(Math.floor(nx), Math.floor(ny + 0.3), Math.floor(nz)) === BLOCK.WATER) {
      p.set(nx, ny, nz);
    } else {
      m.swimTimer = 0;
    }
    m.mesh.rotation.y = Math.atan2(d.x, d.z);
    m.vy = 0;
    m.onGround = true;
    m.fallPeak = null;
    return 'swimming';
  }

  // Water-mob spawning: squids appear in water columns at least 2 deep.
  _spawnWaterMob(playerPos, type) {
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 12 + Math.random() * 16;
      const x = Math.floor(playerPos.x + Math.cos(a) * r);
      const z = Math.floor(playerPos.z + Math.sin(a) * r);
      // Find the surface water cell around sea level.
      let top = -1;
      for (let y = SEA_LEVEL + 2; y >= SEA_LEVEL - 2; y--) {
        if (this.world.getBlock(x, y, z) === BLOCK.WATER &&
            this.world.getBlock(x, y + 1, z) !== BLOCK.WATER) { top = y; break; }
      }
      if (top < 0) continue;
      if (this.world.getBlock(x, top - 1, z) !== BLOCK.WATER) continue; // needs >= 2 deep
      return this.addMob(new THREE.Vector3(x + 0.5, top - 0.6, z + 0.5), type);
    }
    return null;
  }

  _teleportNear(m, playerPos) {
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 5;
      const x = Math.floor(playerPos.x + Math.cos(a) * r) + 0.5;
      const z = Math.floor(playerPos.z + Math.sin(a) * r) + 0.5;
      if (!this.canStandAt('enderman', x, z, m.mesh.position.y)) continue;
      if (this.onEffect) this.onEffect('warp', m.mesh.position.clone());
      const h = this.groundY(x, z, m.mesh.position.y);
      m.mesh.position.set(x, h + 1, z);
      m.vy = 0;
      m.fallPeak = null;
      if (this.onEffect) this.onEffect('warp', m.mesh.position.clone());
      return;
    }
  }

  _wolfAI(m, dt, dist, dx, dz, playerPos) {
    const p = m.mesh.position;
    const speed = mobDef('wolf').speed;
    if (m.tame) {
      if (m.sitting) {
        m.mesh.rotation.y = Math.atan2(dx, dz);
        return;
      }
      // Assist: attack whatever the player last hit.
      const target = this.playerTarget;
      if (target && this.mobs.includes(target) && target !== m &&
          target.mesh.position.distanceTo(p) < 20) {
        const tdx = target.mesh.position.x - p.x;
        const tdz = target.mesh.position.z - p.z;
        const tdist = Math.hypot(tdx, tdz) || 1;
        this.tryMove(m, (tdx / tdist) * speed, (tdz / tdist) * speed, dt);
        m.mesh.rotation.y = Math.atan2(tdx, tdz);
        m.attackTimer -= dt;
        if (tdist < 1.3 && m.attackTimer <= 0) {
          m.attackTimer = ATTACK_INTERVAL;
          const result = this.damageMob(target, 4, p);
          if (result && result.killed) {
            this.playerTarget = null;
            if (this.onKillByWolf) this.onKillByWolf(result);
          }
        }
        return;
      }
      // Follow the owner.
      if (dist > 16) {
        // Teleport to catch up.
        const h = this.groundY(playerPos.x + 1, playerPos.z + 1, playerPos.y);
        p.set(playerPos.x + 1, h + 1, playerPos.z + 1);
        m.vy = 0;
        m.fallPeak = null;
      } else if (dist > 3) {
        this.tryMove(m, (dx / dist) * speed, (dz / dist) * speed, dt);
        m.mesh.rotation.y = Math.atan2(dx, dz);
      } else {
        m.mesh.rotation.y = Math.atan2(dx, dz);
      }
    } else if (m.aggroTimer > 0 && !this.playerInvulnerable) {
      // Provoked wild pack hunts the player.
      if (dist > 0.01) {
        this.tryMove(m, (dx / dist) * speed, (dz / dist) * speed, dt);
        m.mesh.rotation.y = Math.atan2(dx, dz);
      }
      m.attackTimer -= dt;
      if (dist < ATTACK_DISTANCE && m.attackTimer <= 0) {
        m.attackTimer = ATTACK_INTERVAL;
        if (this.onWolfBite) this.onWolfBite(3, m.mesh.position);
      }
    } else {
      this._wander(m, dt);
    }
  }

  _bossAI(m, dt, player, survival, playerPos) {
    const p = m.mesh.position;
    // Orbit the player, hovering above the ground.
    m.bossAngle += dt * 0.5;
    const radius = 9 + Math.sin(m.bossAngle * 0.7) * 3;
    const tx = playerPos.x + Math.cos(m.bossAngle) * radius;
    const tz = playerPos.z + Math.sin(m.bossAngle) * radius;
    const ty = playerPos.y + 2.5 + Math.sin(m.bossAngle * 1.7) * 1.2;
    p.x += (tx - p.x) * Math.min(1, dt * 1.2);
    p.y += (ty - p.y) * Math.min(1, dt * 1.5);
    p.z += (tz - p.z) * Math.min(1, dt * 1.2);
    m.mesh.rotation.y = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);

    // Creative player: the boss keeps circling but never attacks.
    if (this.playerInvulnerable) return;

    // Triple fireball volley.
    m.attackTimer -= dt;
    if (m.attackTimer <= 0) {
      m.attackTimer = 2.5;
      if (this.onShootFire) {
        for (let i = -1; i <= 1; i++) {
          const from = p.clone().add(new THREE.Vector3(0, 0.8, 0));
          const to = playerPos.clone().add(new THREE.Vector3(i * 1.5, -0.4, i * 1.5));
          this.onShootFire(from, to, 5);
        }
      }
    }
    // Below half health: summon fire imps.
    if (m.health < m.maxHealth * 0.5) {
      m.summonTimer -= dt;
      if (m.summonTimer <= 0) {
        m.summonTimer = 10;
        const imps = this.mobs.filter((x) => x.type === 'fire_imp').length;
        if (imps < 4) {
          for (let k = 0; k < 2; k++) this.spawnNear(playerPos, 'fire_imp');
        }
      }
    }
    // Slam when the player gets close, on its own cooldown.
    const dist = p.distanceTo(playerPos);
    if (dist < 3.2) {
      m.slamTimer = (m.slamTimer || 0) - dt;
      if (m.slamTimer <= 0) {
        m.slamTimer = 1.5;
        survival.damage(6, 'Overlord slam', p);
        const away = playerPos.clone().sub(p).normalize();
        player.velocity.x += away.x * 9;
        player.velocity.y += 5;
        player.velocity.z += away.z * 9;
      }
    }
  }

  // Summon the boss at a position (called when the sigil is used).
  spawnBoss(pos) {
    if (this.getBoss()) return null;
    return this.addMob(pos.clone(), 'boss');
  }

  // ---- Phase 9: the Ender Dragon --------------------------------------------------
  // State machine: CIRCLE (orbit the island centre at pillar height), STRAFE
  // (dive at the player every ~12 s: 10 dmg + big knockback on contact), PERCH
  // (land on the island centre every ~45 s for 8 s — the only time it takes
  // full damage; a breath aura ticks 1 dmg/s within 4 blocks). While any end
  // crystal lives the dragon regenerates 1 HP/s and a beam links them.
  _dragonAI(m, dt, player, survival, playerPos) {
    const p = m.mesh.position;
    if (m.dragonState == null) {
      m.dragonState = 'circle';
      m.strafeTimer = 12;
      m.perchTimer = 45;
      m.stateT = 0;
      m.perchY = this.world.columnHeight ? this.world.columnHeight(0, 0) + 1 : 61;
    }
    m.stateT += dt;

    // Crystal healing: nearest living crystal regenerates the dragon and gets
    // a visible beam (a two-point THREE.Line updated in place).
    let crystal = null;
    let bestD = Infinity;
    for (const o of this.mobs) {
      if (o.type !== 'crystal') continue;
      const d = o.mesh.position.distanceTo(p);
      if (d < bestD) { bestD = d; crystal = o; }
    }
    if (crystal) {
      m.health = Math.min(m.maxHealth, m.health + 1 * dt);
      if (!m.beamLine) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        m.beamLine = new THREE.Line(geo, this.beamMaterial);
        m.beamLine.frustumCulled = false;
        this.scene.add(m.beamLine);
      }
      const arr = m.beamLine.geometry.attributes.position.array;
      arr[0] = p.x; arr[1] = p.y + 1.5; arr[2] = p.z;
      const c = crystal.mesh.position;
      arr[3] = c.x; arr[4] = c.y + 1.05; arr[5] = c.z;
      m.beamLine.geometry.attributes.position.needsUpdate = true;
    } else if (m.beamLine) {
      this.scene.remove(m.beamLine);
      m.beamLine.geometry.dispose();
      m.beamLine = null;
    }

    const attack = !this.playerInvulnerable; // creative: fly the pattern, never harm

    if (m.dragonState === 'circle') {
      m.bossAngle += dt * 0.22;
      const tx = Math.cos(m.bossAngle) * 40;
      const tz = Math.sin(m.bossAngle) * 40;
      const ty = 84 + Math.sin(m.bossAngle * 2.3) * 4;
      p.x += (tx - p.x) * Math.min(1, dt * 1.1);
      p.y += (ty - p.y) * Math.min(1, dt * 1.1);
      p.z += (tz - p.z) * Math.min(1, dt * 1.1);
      // Face along the orbit tangent.
      m.mesh.rotation.y = Math.atan2(-Math.sin(m.bossAngle), Math.cos(m.bossAngle)) + Math.PI / 2;

      m.strafeTimer -= dt;
      m.perchTimer -= dt;
      if (m.perchTimer <= 0) {
        m.dragonState = 'perchApproach';
        m.stateT = 0;
      } else if (attack && m.strafeTimer <= 0) {
        m.dragonState = 'strafe';
        m.stateT = 0;
        m.strafeTarget = playerPos.clone();
        m.strafeHit = false;
      }
    } else if (m.dragonState === 'strafe') {
      // Dive through the captured player position at speed; contact deals 10
      // damage and a big knockback, then it climbs back to the circle.
      const target = m.strafeTarget;
      const dir = target.clone().sub(p);
      const dist = dir.length();
      if (dist > 0.01) {
        dir.multiplyScalar(1 / dist);
        p.addScaledVector(dir, Math.min(dist, 18 * dt));
        m.mesh.rotation.y = Math.atan2(dir.x, dir.z);
      }
      if (attack && !m.strafeHit && p.distanceTo(playerPos) < 3) {
        m.strafeHit = true;
        survival.damage(10, 'Dragon strike', p);
        const away = playerPos.clone().sub(p);
        away.y = 0;
        away.normalize();
        player.velocity.x += away.x * 14;
        player.velocity.y += 8;
        player.velocity.z += away.z * 14;
      }
      if (dist < 2 || m.stateT > 6) {
        m.dragonState = 'circle';
        m.strafeTimer = 12;
      }
    } else if (m.dragonState === 'perchApproach') {
      const target = new THREE.Vector3(0.5, m.perchY, 0.5);
      const dir = target.clone().sub(p);
      const dist = dir.length();
      if (dist > 0.01) {
        dir.multiplyScalar(1 / dist);
        p.addScaledVector(dir, Math.min(dist, 12 * dt));
        m.mesh.rotation.y = Math.atan2(dir.x, dir.z);
      }
      if (dist < 1.2 || m.stateT > 10) {
        m.dragonState = 'perch';
        m.stateT = 0;
        m.breathTick = 0;
      }
    } else if (m.dragonState === 'perch') {
      p.set(0.5, m.perchY, 0.5);
      m.mesh.rotation.y = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
      // Breath aura: 1 dmg/s to players within 4 blocks.
      if (attack) {
        m.breathTick = (m.breathTick || 0) + dt;
        if (m.breathTick >= 1) {
          m.breathTick -= 1;
          if (playerPos.distanceTo(p) < 4) survival.damage(1, 'Dragon breath', p);
        }
      }
      if (m.stateT >= 8) {
        m.dragonState = 'circle';
        m.perchTimer = 45;
        m.strafeTimer = Math.max(m.strafeTimer, 4);
      }
    }
  }

  // End crystals: hold position, spin the core, bob gently. Death (any hit,
  // hp 1) is handled by the shared damageMob path; main.js adds the blast.
  _crystalAI(m, dt) {
    const core = m.mesh.userData.core;
    if (core) {
      core.rotation.y += dt * 1.6;
      core.position.y = 1.05 + Math.sin((m.stateT = (m.stateT || 0) + dt) * 2) * 0.08;
    }
  }

  // ---- Phase 8: villages -------------------------------------------------------

  // Nearest registered village well centre within maxDist (XZ distance), or
  // null. Centres live in world.villageCenters (rebuilt on chunk generation).
  nearestVillageCenter(pos, maxDist = VILLAGE_RADIUS) {
    const centers = this.world.villageCenters;
    if (!centers || centers.size === 0) return null;
    let best = null;
    let bestD = maxDist;
    for (const c of centers.values()) {
      const d = Math.hypot(c.x + 0.5 - pos.x, c.z + 0.5 - pos.z);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  // A completed trade: bump the villager's lifetime trade count and unlock
  // the next tier every TRADE_TIER_USES trades. Returns true on a tier-up.
  recordTrade(m) {
    if (!m || m.type !== 'villager') return false;
    m.tradeUses = (m.tradeUses || 0) + 1;
    const tier = tradeTierFromUses(m.tradeUses);
    if (tier > (m.tradeTier || 1)) {
      m.tradeTier = tier;
      return true;
    }
    return false;
  }

  // Every GOLEM_CHECK_INTERVAL: a village centre near the player with >= 2
  // villagers and no iron golem within GOLEM_HOME_RADIUS musters one golem by
  // the well. The golem's guard AI (attack hostiles within 16) does the rest.
  _updateVillageGolems(dt, playerPos) {
    this._golemTimer = (this._golemTimer == null ? 10 : this._golemTimer) - dt;
    if (this._golemTimer > 0) return;
    this._golemTimer = GOLEM_CHECK_INTERVAL;
    const centers = this.world.villageCenters;
    if (!centers) return;
    for (const c of centers.values()) {
      // Only villages near the player (loaded chunks / active mobs).
      if (Math.hypot(c.x - playerPos.x, c.z - playerPos.z) > DESPAWN_DISTANCE + GOLEM_HOME_RADIUS) continue;
      let villagers = 0;
      let hasGolem = false;
      for (const m of this.mobs) {
        const d = Math.hypot(m.mesh.position.x - (c.x + 0.5), m.mesh.position.z - (c.z + 0.5));
        if (d > GOLEM_HOME_RADIUS) continue;
        if (m.type === 'villager') villagers++;
        else if (m.type === 'iron_golem') hasGolem = true;
      }
      if (villagers < 2 || hasGolem) continue;
      // Muster next to the well (the gravel apron keeps a clear 3x3 there).
      for (let tries = 0; tries < 8; tries++) {
        const x = c.x + Math.floor(Math.random() * 9) - 4 + 0.5;
        const z = c.z + Math.floor(Math.random() * 9) - 4 + 0.5;
        if (!this.canStandAt('iron_golem', x, z, c.y)) continue;
        const h = this.groundY(x, z, c.y);
        this.addMob(new THREE.Vector3(x, h + 1, z), 'iron_golem');
        if (this.onEffect) this.onEffect('smoke', new THREE.Vector3(x, h + 1.5, z));
        break;
      }
    }
  }

  // ---- Spawner blocks (dungeons / fortresses) --------------------------------
  _updateSpawners(dt, playerPos) {
    this._spawnerTimer -= dt;
    if (this._spawnerTimer > 0) return;
    this._spawnerTimer = 1;
    if (!this.world.structureSpawners) return;
    for (const [key, type] of this.world.structureSpawners) {
      const [x, y, z] = key.split(',').map(Number);
      const d = Math.hypot(x + 0.5 - playerPos.x, y + 0.5 - playerPos.y, z + 0.5 - playerPos.z);
      if (d > SPAWNER_RANGE) continue;
      if (this.world.getBlock(x, y, z) !== BLOCK.MOB_SPAWNER) {
        this.world.structureSpawners.delete(key);
        continue;
      }
      const cd = this._spawnerCooldowns.get(key) || 0;
      if (cd > 0) { this._spawnerCooldowns.set(key, cd - 1); continue; }
      let tagged = 0;
      for (const m of this.mobs) if (m.spawnerKey === key) tagged++;
      if (tagged >= SPAWNER_CAP) continue;
      // Find a stand spot around the spawner.
      for (let tries = 0; tries < 6; tries++) {
        const sx = x + Math.floor(Math.random() * 7) - 3 + 0.5;
        const sz = z + Math.floor(Math.random() * 7) - 3 + 0.5;
        if (!this.canStandAt(type, sx, sz, y)) continue;
        const h = this.groundY(sx, sz, y);
        this.addMob(new THREE.Vector3(sx, h + 1, sz), type, undefined, { spawnerKey: key });
        this._spawnerCooldowns.set(key, SPAWNER_INTERVAL);
        break;
      }
    }
  }

  // ---- Breeding / taming ------------------------------------------------------

  // Feed an animal its breeding food. Returns true if it entered love mode.
  feedAnimal(mob, itemId) {
    if (!mob || mob.baby || mob.breedCooldown > 0 || mob.loveTimer > 0) return false;
    if (breedFoodOf(mob.type) !== itemId) return false;
    mob.loveTimer = LOVE_DURATION;
    if (this.onEffect) this.onEffect('hearts', mob.mesh.position.clone());
    return true;
  }

  _updateBreeding(dt) {
    for (let i = 0; i < this.mobs.length; i++) {
      const a = this.mobs[i];
      if (a.loveTimer <= 0 || a.baby) continue;
      for (let j = i + 1; j < this.mobs.length; j++) {
        const b = this.mobs[j];
        if (b.loveTimer <= 0 || b.baby || b.type !== a.type) continue;
        if (a.mesh.position.distanceTo(b.mesh.position) > 4) continue;
        // A baby is born between the parents.
        const mid = a.mesh.position.clone().add(b.mesh.position).multiplyScalar(0.5);
        this.addMob(mid, a.type, undefined, { baby: true, growTimer: BABY_GROW_TIME });
        a.loveTimer = 0; b.loveTimer = 0;
        a.breedCooldown = BREED_COOLDOWN; b.breedCooldown = BREED_COOLDOWN;
        if (this.onEffect) this.onEffect('hearts', mid);
        if (this.onBreed) this.onBreed(a.type);
        break;
      }
    }
  }

  // Attempt to tame a wild wolf with a bone. Returns 'tamed', 'failed' or null.
  tryTame(mob) {
    if (!mob || mob.type !== 'wolf' || mob.tame) return null;
    if (Math.random() < 0.34) {
      mob.tame = true;
      mob.aggroTimer = 0;
      mob.sitting = false;
      if (mob.mesh.userData.collar) mob.mesh.userData.collar.visible = true;
      if (this.onEffect) this.onEffect('hearts', mob.mesh.position.clone());
      return 'tamed';
    }
    if (this.onEffect) this.onEffect('smoke', mob.mesh.position.clone());
    return 'failed';
  }

  // Toggle a tamed wolf between sitting (stay) and following.
  toggleSit(mob) {
    if (!mob || mob.type !== 'wolf' || !mob.tame) return false;
    mob.sitting = !mob.sitting;
    return true;
  }

  _creeperExplode(m, playerPos, survival) {
    const p = m.mesh.position;
    if (this.onExplode) {
      // Shared explosion path: block destruction with drops, container
      // cleanup, chained TNT and player/mob damage all live in main.js.
      this.onExplode(p.clone().add(new THREE.Vector3(0, 0.8, 0)), CREEPER_EXPLODE_RADIUS);
      return;
    }
    // Fallback (no handler injected): old direct block clearing.
    this.lastExplosion = true;
    this.lastExplosionPos = p.clone();
    const r = CREEPER_EXPLODE_RADIUS;
    for (let bx = -r; bx <= r; bx++) {
      for (let by = -r; by <= r; by++) {
        for (let bz = -r; bz <= r; bz++) {
          if (bx * bx + by * by + bz * bz > r * r) continue;
          const wx = Math.floor(p.x) + bx;
          const wy = Math.floor(p.y) + by;
          const wz = Math.floor(p.z) + bz;
          const block = this.world.getBlock(wx, wy, wz);
          if (block !== BLOCK.AIR && block !== BLOCK.WATER && block !== BLOCK.BEDROCK) {
            this.world.setBlock(wx, wy, wz, BLOCK.AIR);
          }
        }
      }
    }
    const dist = playerPos.distanceTo(p);
    if (dist < r + 2) {
      const dmg = Math.max(1, Math.round(12 * (1 - dist / (r + 3))));
      survival.damage(dmg, 'Creeper explosion', p);
    }
  }

  serialize() {
    // The boss intentionally despawns on save/load (documented in the README).
    return this.mobs.filter((m) => !m.boss).map((m) => {
      const o = {
        x: m.mesh.position.x,
        y: m.mesh.position.y,
        z: m.mesh.position.z,
        health: m.health,
        type: m.type,
      };
      if (m.baby) { o.baby = true; o.growTimer = m.growTimer; }
      if (m.breedCooldown > 0) o.breedCooldown = m.breedCooldown;
      if (m.tame) o.tame = true;
      if (m.sitting) o.sitting = true;
      if (m.vy) o.vy = m.vy; // optional; restores mid-air mobs (defaults to 0)
      if (m.size) o.size = m.size;      // slimes / magma cubes
      if (m.saddled) o.saddled = true;  // horses
      if (m.horseArmor) o.horseArmor = m.horseArmor;
      if (m.profession) {               // villagers (Phase 8)
        o.profession = m.profession;
        o.tradeTier = m.tradeTier || 1;
        o.tradeUses = m.tradeUses || 0;
      }
      if (m.effects && m.effects.length) {
        o.effects = m.effects.map((e) => ({ id: e.id, amp: e.amp, t: e.t }));
      }
      return o;
    });
  }
}
