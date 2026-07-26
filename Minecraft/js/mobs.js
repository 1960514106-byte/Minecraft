// =============================================================================
// mobs.js - Hostile zombies (night) + passive animals (day): pig, cow, sheep.
// =============================================================================

import * as THREE from 'three';
import { BLOCK, ITEM, SEA_LEVEL, BIOME, isSolid } from './config.js';

const MAX_HOSTILE = 5;
const MAX_PASSIVE = 4;
const SPAWN_INTERVAL = 6;
const DESPAWN_DISTANCE = 48;
const ATTACK_DISTANCE = 1.15;
const ATTACK_INTERVAL = 1.1;
const ZOMBIE_SPEED = 2.15;
const PASSIVE_SPEED = 1.0;
const MAX_HEALTH_ZOMBIE = 10;
const MAX_HEALTH_SKELETON = 10;
const MAX_HEALTH_CREEPER = 10;
const MAX_HEALTH_PASSIVE = 8;
const HIT_RADIUS = 0.72;
const HIT_HEIGHT = 0.95;

const WANDER_INTERVAL = 4;
const FLEE_DURATION = 2.0;
const FLEE_SPEED = 3.0;

const SKELETON_SHOOT_RANGE = 14;
const SKELETON_SHOOT_INTERVAL = 2.2;
const SKELETON_SPEED = 1.8;
const CREEPER_FUSE_TIME = 1.5;
const CREEPER_EXPLODE_RADIUS = 3;
const CREEPER_SPEED = 2.5;

const SPIDER_SPEED = 2.6;
const ENDERMAN_SPEED = 3.2;
const WOLF_SPEED = 3.0;
const IMP_SHOOT_RANGE = 12;
const IMP_SHOOT_INTERVAL = 2.6;
const LOVE_DURATION = 20;
const BREED_COOLDOWN = 60;
const BABY_GROW_TIME = 120;
const MAX_WOLVES = 4;
const SPAWNER_INTERVAL = 5;
const SPAWNER_RANGE = 16;
const SPAWNER_CAP = 3;

// What each animal eats to enter love mode (breeding).
const BREED_FOOD = {
  pig: ITEM.CARROT,
  cow: ITEM.WHEAT,
  sheep: ITEM.WHEAT,
  chicken: ITEM.WHEAT_SEEDS,
};

const PASSIVE_TYPES = ['pig', 'cow', 'sheep', 'chicken'];
const HOSTILE_TYPES = ['zombie', 'skeleton', 'creeper', 'spider'];
const NETHER_TYPES = ['zombie_pigman', 'zombie_pigman', 'fire_imp'];
const VILLAGER_TYPES = ['villager'];

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
          });
        }
      }
    }
    // Injected by main.js: onEffect(name, pos) plays particles/sounds for
    // teleports, hearts, taming; onShootFire(from, to) fires an imp fireball.
    this.onEffect = null;
    this.onShootFire = null;
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

  makeMobMesh(type) {
    switch (type) {
      case 'pig':
        return this.makeQuadrupedMesh(this.materials.pigBody, this.materials.pigLeg, this.materials.pigBody, (g, part) => {
          part(new THREE.BoxGeometry(0.22, 0.16, 0.12), this.materials.pigSnout, 0, 0.88, 0.78);
        });
      case 'cow':
        return this.makeQuadrupedMesh(this.materials.cowBody, this.materials.cowLeg, this.materials.cowBody, (g, part) => {
          part(new THREE.BoxGeometry(0.5, 0.35, 0.6), this.materials.cowPatch, 0, 0.78, -0.1);
        });
      case 'sheep':
        return this.makeQuadrupedMesh(this.materials.sheepBody, this.materials.sheepLeg, this.materials.sheepHead);
      case 'chicken':
        return this.makeChickenMesh();
      case 'skeleton':
        return this.makeSkeletonMesh();
      case 'creeper':
        return this.makeCreeperMesh();
      case 'villager':
        return this.makeVillagerMesh();
      case 'spider':
        return this.makeSpiderMesh();
      case 'enderman':
        return this.makeEndermanMesh();
      case 'wolf':
        return this.makeWolfMesh();
      case 'zombie_pigman':
        return this.makePigmanMesh();
      case 'fire_imp':
        return this.makeImpMesh();
      case 'boss':
        return this.makeBossMesh();
      default:
        return this.makeZombieMesh();
    }
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

  makeVillagerMesh() {
    const g = new THREE.Group();
    const part = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.baseMaterial = mat;
      mesh.position.set(x, y, z);
      g.add(mesh);
    };
    part(new THREE.BoxGeometry(0.5, 0.5, 0.5), this.materials.villagerHead, 0, 1.55, 0);
    part(new THREE.BoxGeometry(0.14, 0.18, 0.12), this.materials.villagerNose, 0, 1.46, 0.3);
    part(new THREE.BoxGeometry(0.55, 0.75, 0.4), this.materials.villagerRobe, 0, 0.95, 0);
    part(new THREE.BoxGeometry(0.18, 0.6, 0.18), this.materials.villagerRobe, -0.22, 0.3, 0);
    part(new THREE.BoxGeometry(0.18, 0.6, 0.18), this.materials.villagerRobe, 0.22, 0.3, 0);
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

  addMob(pos, type = 'zombie', health, extra = {}) {
    const maxHp = type === 'zombie' ? MAX_HEALTH_ZOMBIE
      : type === 'skeleton' ? MAX_HEALTH_SKELETON
      : type === 'creeper' ? MAX_HEALTH_CREEPER
      : type === 'villager' ? 20
      : type === 'spider' ? 14
      : type === 'enderman' ? 40
      : type === 'wolf' ? 20
      : type === 'zombie_pigman' ? 14
      : type === 'fire_imp' ? 16
      : type === 'boss' ? 200
      : MAX_HEALTH_PASSIVE;
    const mesh = this.makeMobMesh(type);
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
    };
    if (mob.baby) mesh.scale.setScalar(0.5);
    if (mob.tame && mesh.userData.collar) mesh.userData.collar.visible = true;
    this.mobs.push(mob);
    return mob;
  }

  removeAt(i) {
    const m = this.mobs[i];
    this.scene.remove(m.mesh);
    this.mobs.splice(i, 1);
  }

  isHostile(type) {
    return type === 'zombie' || type === 'skeleton' || type === 'creeper' ||
      type === 'spider' || type === 'enderman' || type === 'zombie_pigman' ||
      type === 'fire_imp' || type === 'boss';
  }

  getBoss() {
    for (const m of this.mobs) if (m.boss) return m;
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
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 15 + Math.random() * 12;
      const x = Math.floor(playerPos.x + Math.cos(a) * r);
      const z = Math.floor(playerPos.z + Math.sin(a) * r);
      const fromY = this.world.skyless ? playerPos.y : null;
      const h = this.groundY(x, z, fromY);
      if (!this.world.skyless && h <= SEA_LEVEL) continue;
      if (this.world.skyless && this.world.getBlock(x, h, z) === BLOCK.LAVA) continue;
      if (!this.isHostile(type)) {
        const block = this.world.getBlock(x, h, z);
        if (block !== BLOCK.GRASS && block !== BLOCK.SNOW) continue;
        // Wolves only roam forests and snowy regions.
        if (type === 'wolf') {
          const biome = this.world.biomeAt(x, z);
          if (biome !== BIOME.FOREST && biome !== BIOME.SNOW && biome !== BIOME.FLOWER_FOREST) continue;
        }
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
      let y = Math.min(62, Math.floor(fromY) + 2);
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
    // Spiders climb: they accept much taller steps while chasing.
    const maxStep = type === 'spider' ? 3.2 : 1.15;
    if (fromY != null && Math.abs(h - fromY) > maxStep) return false;
    if (this.world.getBlock(bx, h + 1, bz) === BLOCK.WATER) return false;
    if (isSolid(this.world.getBlock(bx, h + 1, bz))) return false;
    if (this.isHostile(type) && isSolid(this.world.getBlock(bx, h + 2, bz))) return false;
    return true;
  }

  tryMove(m, vx, vz, dt) {
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

  mobDrops(mob) {
    switch (mob.type) {
      case 'pig': {
        const count = 1 + (Math.random() < 0.5 ? 1 : 0);
        return [{ id: ITEM.RAW_PORK, count }];
      }
      case 'cow': {
        const drops = [{ id: ITEM.RAW_BEEF, count: 1 + (Math.random() < 0.5 ? 1 : 0) }];
        if (Math.random() < 0.6) drops.push({ id: ITEM.LEATHER, count: 1 });
        return drops;
      }
      case 'sheep': {
        const drops = [{ id: ITEM.WOOL, count: 1 }];
        if (Math.random() < 0.3) drops.push({ id: ITEM.RAW_BEEF, count: 1 });
        return drops;
      }
      case 'chicken': {
        const drops = [{ id: ITEM.RAW_CHICKEN, count: 1 }];
        if (Math.random() < 0.6) drops.push({ id: ITEM.FEATHER, count: 1 + (Math.random() < 0.3 ? 1 : 0) });
        return drops;
      }
      case 'skeleton': {
        const drops = [];
        if (Math.random() < 0.7) drops.push({ id: ITEM.BONE, count: 1 + (Math.random() < 0.3 ? 1 : 0) });
        if (Math.random() < 0.5) drops.push({ id: ITEM.ARROW, count: 1 + (Math.random() < 0.4 ? 1 : 0) });
        return drops;
      }
      case 'creeper': {
        if (Math.random() < 0.7) return [{ id: ITEM.GUNPOWDER, count: 1 + (Math.random() < 0.3 ? 1 : 0) }];
        return [];
      }
      case 'villager': {
        // Villagers drop a little of what they trade — no incentive to farm them.
        if (Math.random() < 0.3) return [{ id: ITEM.APPLE, count: 1 }];
        return [];
      }
      case 'spider': {
        const drops = [{ id: ITEM.STRING, count: 1 + (Math.random() < 0.5 ? 1 : 0) }];
        if (Math.random() < 0.3) drops.push({ id: ITEM.SPIDER_EYE, count: 1 });
        return drops;
      }
      case 'enderman': {
        const n = Math.random() < 0.7 ? 1 + (Math.random() < 0.3 ? 1 : 0) : 0;
        return n > 0 ? [{ id: ITEM.ENDER_PEARL, count: n }] : [];
      }
      case 'wolf':
        return [];
      case 'zombie_pigman': {
        const drops = [];
        if (Math.random() < 0.2) drops.push({ id: ITEM.GOLD_INGOT, count: 1 });
        if (Math.random() < 0.4) drops.push({ id: ITEM.STICK, count: 1 });
        return drops;
      }
      case 'fire_imp': {
        if (Math.random() < 0.6) return [{ id: ITEM.BLAZE_ROD, count: 1 }];
        return [];
      }
      case 'boss':
        return [{ id: ITEM.NETHER_STAR, count: 1 }, { id: ITEM.DIAMOND, count: 3 }];
      case 'zombie': {
        const drops = [];
        if (Math.random() < 0.45) drops.push({ id: ITEM.STICK, count: 1 + (Math.random() < 0.25 ? 1 : 0) });
        if (Math.random() < 0.2) drops.push({ id: ITEM.CARROT, count: 1 });
        return drops;
      }
      default: {
        if (Math.random() < 0.45) return [{ id: ITEM.STICK, count: 1 + (Math.random() < 0.25 ? 1 : 0) }];
        if (Math.random() < 0.35) return [{ id: ITEM.COAL, count: 1 }];
        return [];
      }
    }
  }

  damageMob(mob, amount, fromPos) {
    if (!mob || amount <= 0) return null;
    mob.health -= amount;
    mob.hurtTimer = 0.22;
    for (const child of mob.mesh.children) child.material = this.materials.hurt;

    const p = mob.mesh.position;
    const dx = p.x - fromPos.x;
    const dz = p.z - fromPos.z;
    const len = Math.hypot(dx, dz) || 1;
    if (!mob.boss) {
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
    const i = this.mobs.indexOf(mob);
    if (i >= 0) this.removeAt(i);
    return { killed: true, position: deathPos, drops: allDrops, type: mob.type };
  }

  update(dt, player, survival, dayT) {
    const playerPos = player.getObject().position;
    const night = this.isNight(dayT);
    const nether = !!this.world.skyless;

    // Despawn hostile mobs at dawn (overworld only; the boss and dungeon
    // spawner mobs stay).
    if (!night && !nether) {
      for (let i = this.mobs.length - 1; i >= 0; i--) {
        const m = this.mobs[i];
        if (this.isHostile(m.type) && !m.boss && !m.spawnerKey) this.removeAt(i);
      }
    }

    if (!survival.alive) {
      for (let i = this.mobs.length - 1; i >= 0; i--) this.removeAt(i);
      this.spawnTimer = 2;
      this.passiveSpawnTimer = 3;
      return;
    }

    // Ambient spawning.
    if (nether) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = SPAWN_INTERVAL;
        if (this.countType(false) < 6) {
          const type = NETHER_TYPES[Math.floor(Math.random() * NETHER_TYPES.length)];
          this.spawnNear(playerPos, type);
        }
      }
    } else if (night) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = SPAWN_INTERVAL;
        if (this.countType(false) < MAX_HOSTILE) {
          const type = Math.random() < 0.1 ? 'enderman'
            : HOSTILE_TYPES[Math.floor(Math.random() * HOSTILE_TYPES.length)];
          this.spawnNear(playerPos, type);
        }
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
          const type = Math.random() < 0.15 ? 'villager' : PASSIVE_TYPES[Math.floor(Math.random() * PASSIVE_TYPES.length)];
          this.spawnNear(playerPos, type);
        }
      }
    }

    this._updateSpawners(dt, playerPos);
    this._updateBreeding(dt);

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      const p = m.mesh.position;

      if (m.hurtTimer > 0) {
        m.hurtTimer -= dt;
        if (m.hurtTimer <= 0) {
          for (const child of m.mesh.children) child.material = child.userData.baseMaterial;
          if (m.tame && m.mesh.userData.collar) m.mesh.userData.collar.visible = true;
        }
      }
      if (m.aggroTimer > 0) m.aggroTimer -= dt;
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
      if (dist > DESPAWN_DISTANCE && !m.boss && !m.tame) {
        this.removeAt(i);
        continue;
      }

      this.tryMove(m, m.velocity.x, m.velocity.z, dt);
      m.velocity.x *= Math.pow(0.08, dt);
      m.velocity.z *= Math.pow(0.08, dt);

      if (m.boss) {
        this._bossAI(m, dt, player, survival, playerPos);
        continue; // the boss flies: it owns its y position
      }

      if (this.isHostile(m.type)) {
        const removed = this._hostileAI(m, dt, dist, dx, dz, player, survival, playerPos, night);
        if (removed) continue;
      } else if (m.type === 'wolf') {
        this._wolfAI(m, dt, dist, dx, dz, playerPos);
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
          if (!this.tryMove(m, m.wanderDir.x * PASSIVE_SPEED, m.wanderDir.y * PASSIVE_SPEED, dt)) {
            m.wanderTimer = 0;
          }
          m.mesh.rotation.y = Math.atan2(m.wanderDir.x, m.wanderDir.y);
        }
      }

      const h = this.groundY(p.x, p.z, p.y);
      p.y = h + 1;
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

  // Melee hit on the player when adjacent, on the shared attack timer.
  _tryMelee(m, dist, playerPos, canSeePlayer, survival, damage, label, dt) {
    m.attackTimer -= dt;
    const vertical = Math.abs((playerPos.y - 1.62) - m.mesh.position.y);
    if (dist < ATTACK_DISTANCE + (m.type === 'boss' ? 2 : 0) && vertical < 2 && canSeePlayer && m.attackTimer <= 0) {
      m.attackTimer = ATTACK_INTERVAL;
      survival.damage(damage, label);
      return true;
    }
    return false;
  }

  // Returns true if the mob removed itself (creeper explosion).
  _hostileAI(m, dt, dist, dx, dz, player, survival, playerPos, night) {
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

    if (m.type === 'zombie') {
      if (dist > 0.01 && canSeePlayer) {
        const moved = this.tryMove(m, (dx / dist) * ZOMBIE_SPEED, (dz / dist) * ZOMBIE_SPEED, dt);
        if (!moved) {
          const side = Math.sign(Math.sin(performance.now() * 0.001 + p.x + p.z)) || 1;
          this.tryMove(m, (-dz / dist) * ZOMBIE_SPEED * side, (dx / dist) * ZOMBIE_SPEED * side, dt);
        }
        m.mesh.rotation.y = Math.atan2(dx, dz);
      } else {
        this._wander(m, dt, PASSIVE_SPEED * 0.75);
      }
      this._tryMelee(m, dist, playerPos, canSeePlayer, survival, 2, 'Zombie attack', dt);
    } else if (m.type === 'skeleton') {
      m.mesh.rotation.y = Math.atan2(dx, dz);
      if (canSeePlayer && dist < SKELETON_SHOOT_RANGE) {
        if (dist < 5) {
          this.tryMove(m, (-dx / dist) * SKELETON_SPEED, (-dz / dist) * SKELETON_SPEED, dt);
        } else if (dist > 10) {
          this.tryMove(m, (dx / dist) * SKELETON_SPEED, (dz / dist) * SKELETON_SPEED, dt);
        }
        m.attackTimer -= dt;
        if (m.attackTimer <= 0) {
          m.attackTimer = SKELETON_SHOOT_INTERVAL;
          if (this.onShoot) {
            const from = p.clone().add(new THREE.Vector3(0, 1.45, 0));
            const to = playerPos.clone().add(new THREE.Vector3(0, -0.55, 0));
            this.onShoot(from, to);
          }
        }
      } else {
        this._wander(m, dt);
      }
    } else if (m.type === 'creeper') {
      m.mesh.rotation.y = Math.atan2(dx, dz);
      if (canSeePlayer && dist < 12) {
        this.tryMove(m, (dx / dist) * CREEPER_SPEED, (dz / dist) * CREEPER_SPEED, dt);
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
    } else if (m.type === 'spider') {
      // Hostile in darkness or when provoked; neutral in daylight.
      const aggressive = (night || this.world.skyless || m.aggroTimer > 0);
      if (aggressive && canSeePlayer && dist > 0.01) {
        const moved = this.tryMove(m, (dx / dist) * SPIDER_SPEED, (dz / dist) * SPIDER_SPEED, dt);
        if (!moved) {
          const side = Math.sign(Math.sin(performance.now() * 0.0013 + p.x)) || 1;
          this.tryMove(m, (-dz / dist) * SPIDER_SPEED * side, (dx / dist) * SPIDER_SPEED * side, dt);
        }
        m.mesh.rotation.y = Math.atan2(dx, dz);
        this._tryMelee(m, dist, playerPos, canSeePlayer, survival, 3, 'Spider bite', dt);
      } else {
        this._wander(m, dt);
      }
    } else if (m.type === 'enderman') {
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
          this.tryMove(m, (dx / dist) * ENDERMAN_SPEED, (dz / dist) * ENDERMAN_SPEED, dt);
          m.mesh.rotation.y = Math.atan2(dx, dz);
        }
        this._tryMelee(m, dist, playerPos, true, survival, 4, 'Enderman strike', dt);
      } else {
        this._wander(m, dt, PASSIVE_SPEED * 0.6);
      }
    } else if (m.type === 'zombie_pigman') {
      // Neutral until the pack is provoked.
      if (m.aggroTimer > 0 && dist > 0.01) {
        this.tryMove(m, (dx / dist) * ZOMBIE_SPEED, (dz / dist) * ZOMBIE_SPEED, dt);
        m.mesh.rotation.y = Math.atan2(dx, dz);
        this._tryMelee(m, dist, playerPos, canSeePlayer, survival, 3, 'Pigman attack', dt);
      } else {
        this._wander(m, dt, PASSIVE_SPEED * 0.7);
      }
    } else if (m.type === 'fire_imp') {
      m.mesh.rotation.y = Math.atan2(dx, dz);
      // Hovering bob.
      m.mesh.children[0].position.y = 1.0 + Math.sin(performance.now() * 0.003 + p.x) * 0.15;
      if (canSeePlayer && dist < IMP_SHOOT_RANGE) {
        if (dist < 4) this.tryMove(m, (-dx / dist) * PASSIVE_SPEED, (-dz / dist) * PASSIVE_SPEED, dt);
        m.attackTimer -= dt;
        if (m.attackTimer <= 0) {
          m.attackTimer = IMP_SHOOT_INTERVAL;
          if (this.onShootFire) {
            const from = p.clone().add(new THREE.Vector3(0, 1.2, 0));
            const to = playerPos.clone().add(new THREE.Vector3(0, -0.4, 0));
            this.onShootFire(from, to, 4);
          }
        }
      } else {
        this._wander(m, dt, PASSIVE_SPEED * 0.8);
      }
    }
    return false;
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
      if (this.onEffect) this.onEffect('warp', m.mesh.position.clone());
      return;
    }
  }

  _wolfAI(m, dt, dist, dx, dz, playerPos) {
    const p = m.mesh.position;
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
        this.tryMove(m, (tdx / tdist) * WOLF_SPEED, (tdz / tdist) * WOLF_SPEED, dt);
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
      } else if (dist > 3) {
        this.tryMove(m, (dx / dist) * WOLF_SPEED, (dz / dist) * WOLF_SPEED, dt);
        m.mesh.rotation.y = Math.atan2(dx, dz);
      } else {
        m.mesh.rotation.y = Math.atan2(dx, dz);
      }
    } else if (m.aggroTimer > 0 && !this.playerInvulnerable) {
      // Provoked wild pack hunts the player.
      if (dist > 0.01) {
        this.tryMove(m, (dx / dist) * WOLF_SPEED, (dz / dist) * WOLF_SPEED, dt);
        m.mesh.rotation.y = Math.atan2(dx, dz);
      }
      m.attackTimer -= dt;
      if (dist < ATTACK_DISTANCE && m.attackTimer <= 0) {
        m.attackTimer = ATTACK_INTERVAL;
        if (this.onWolfBite) this.onWolfBite(3);
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
        survival.damage(6, 'Overlord slam');
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
    if (BREED_FOOD[mob.type] !== itemId) return false;
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
      survival.damage(dmg, 'Creeper explosion');
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
      return o;
    });
  }
}
