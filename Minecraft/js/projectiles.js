// =============================================================================
// projectiles.js - Arrow entities: gravity, block collision, mob/player hits.
// Arrows are shot by the player's bow and by skeletons. update() returns a list
// of hit events; main.js applies damage/drops so this module stays decoupled.
// =============================================================================

import * as THREE from 'three';
import { isSolid } from './config.js';

const ARROW_GRAVITY = 13;
const STUCK_LIFETIME = 4;   // seconds an arrow stays stuck in a block
const MAX_LIFETIME = 20;    // absolute lifetime cap for flying arrows
const MOB_HIT_RADIUS = 0.75;
const PLAYER_HIT_RADIUS = 0.7;

let arrowGeo = null;
let shaftMat = null;
let headMat = null;
let fireMat = null;
let flaskMat = null;
let flaskCapMat = null;

function getArrowMesh() {
  if (!arrowGeo) {
    arrowGeo = new THREE.BoxGeometry(0.045, 0.045, 0.42);
    shaftMat = new THREE.MeshLambertMaterial({ color: 0x8a6034 });
    headMat = new THREE.MeshLambertMaterial({ color: 0xb8b8c0 });
  }
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(arrowGeo, shaftMat);
  group.add(shaft);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.09), headMat);
  head.position.z = -0.24;
  group.add(head);
  return group;
}

function getFireballMesh() {
  if (!fireMat) {
    fireMat = new THREE.MeshLambertMaterial({ color: 0xff8a20, emissive: 0xaa4400 });
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), fireMat));
  return group;
}

let eyeMat = null;
let eyeIrisMat = null;

function getEyeMesh() {
  if (!eyeMat) {
    eyeMat = new THREE.MeshLambertMaterial({ color: 0x1e4a3a, emissive: 0x0a2418 });
    eyeIrisMat = new THREE.MeshLambertMaterial({ color: 0x66e8a0, emissive: 0x2a8a50 });
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), eyeMat));
  const iris = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), eyeIrisMat);
  iris.position.y = 0.1;
  group.add(iris);
  return group;
}

function getFlaskMesh() {
  if (!flaskMat) {
    flaskMat = new THREE.MeshLambertMaterial({ color: 0x9a40c8, emissive: 0x3a1050 });
    flaskCapMat = new THREE.MeshLambertMaterial({ color: 0xd8d8e0 });
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.22), flaskMat));
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), flaskCapMat);
  cap.position.y = 0.16;
  group.add(cap);
  return group;
}

export class ProjectileManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.arrows = [];
  }

  // dir must be normalized. fromPlayer arrows hit mobs; others hit the player.
  shootArrow(origin, dir, speed, damage, fromPlayer) {
    const mesh = getArrowMesh();
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.arrows.push({
      mesh,
      velocity: dir.clone().multiplyScalar(speed),
      damage,
      fromPlayer,
      stuck: false,
      life: 0,
      kind: 'arrow',
    });
  }

  // Hostile fireball (fire imps / the boss): flatter arc, vanishes on impact.
  shootFireball(origin, dir, speed, damage) {
    const mesh = getFireballMesh();
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.arrows.push({
      mesh,
      velocity: dir.clone().multiplyScalar(speed),
      damage,
      fromPlayer: false,
      stuck: false,
      life: 0,
      kind: 'fire',
    });
  }

  // Potion flask (witch attacks AND player-thrown splash potions): arrow-like
  // arc, shatters on any impact into a 'flaskBreak' event carrying `payload`
  // ({ effect, amp, dur } or { instant, amount }) — main.js applies the AoE.
  // Flasks deal no direct damage; `damage` is kept for legacy plain flasks.
  shootFlask(origin, dir, speed, damage, opts = {}) {
    const mesh = getFlaskMesh();
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.arrows.push({
      mesh,
      velocity: dir.clone().multiplyScalar(speed),
      damage,
      fromPlayer: !!opts.fromPlayer,
      payload: opts.payload || null,
      stuck: false,
      life: 0,
      kind: 'flask',
    });
  }

  // Phase 9: a thrown eye of ender. Ghostly — ignores all collision — it
  // climbs while drifting toward `target` (the stronghold) for ~3 s, then
  // fires an 'eyeExpired' event (main.js drops the item back 80% of the time).
  shootEye(origin, target) {
    const mesh = getEyeMesh();
    mesh.position.copy(origin);
    this.scene.add(mesh);
    const dir = new THREE.Vector3(target.x - origin.x, 0, target.z - origin.z);
    if (dir.lengthSq() > 0.001) dir.normalize();
    const velocity = dir.multiplyScalar(9);
    velocity.y = 6;
    this.arrows.push({
      mesh,
      velocity,
      damage: 0,
      fromPlayer: true,
      stuck: false,
      life: 0,
      kind: 'eye',
    });
  }

  _remove(i) {
    this.scene.remove(this.arrows[i].mesh);
    this.arrows.splice(i, 1);
  }

  // Returns hit events:
  //   { type: 'mob', mob, damage, pos }     - player arrow struck a mob
  //   { type: 'player', damage }            - hostile arrow struck the player
  //   { type: 'stuckExpired', pos, fromPlayer } - stuck arrow despawned
  update(dt, playerPos, mobs) {
    const events = [];
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life += dt;

      if (a.stuck) {
        if (a.life > STUCK_LIFETIME) {
          events.push({ type: 'stuckExpired', pos: a.mesh.position.clone(), fromPlayer: a.fromPlayer });
          this._remove(i);
        }
        continue;
      }

      if (a.life > MAX_LIFETIME) {
        this._remove(i);
        continue;
      }

      // Eye of ender: ghostly (no gravity, no collision) — it climbs while
      // drifting toward the stronghold, then expires after ~3 s.
      if (a.kind === 'eye') {
        a.velocity.y *= Math.max(0, 1 - dt * 1.4);
        a.mesh.position.addScaledVector(a.velocity, dt);
        a.mesh.rotation.y += dt * 4;
        if (a.life >= 3) {
          events.push({ type: 'eyeExpired', pos: a.mesh.position.clone() });
          this._remove(i);
        }
        continue;
      }

      a.velocity.y -= (a.kind === 'fire' ? 1.5 : ARROW_GRAVITY) * dt;
      const p = a.mesh.position;
      p.addScaledVector(a.velocity, dt);
      // Point the arrow along its velocity.
      if (a.kind === 'arrow' && a.velocity.lengthSq() > 0.001) {
        const look = p.clone().sub(a.velocity);
        a.mesh.lookAt(look);
      }
      if (a.kind === 'fire' || a.kind === 'flask') {
        a.mesh.rotation.x += dt * 6;
        a.mesh.rotation.y += dt * 5;
      }

      // Block collision: arrows stick; fireballs burst; flasks shatter.
      const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
      if (isSolid(this.world.getBlock(bx, by, bz))) {
        if (a.kind === 'fire') {
          events.push({ type: 'fireBurst', pos: p.clone() });
          this._remove(i);
          continue;
        }
        if (a.kind === 'flask') {
          events.push({ type: 'flaskBreak', pos: p.clone(), payload: a.payload, fromPlayer: a.fromPlayer });
          this._remove(i);
          continue;
        }
        p.addScaledVector(a.velocity, -dt * 0.6);
        a.stuck = true;
        a.life = 0;
        a.velocity.set(0, 0, 0);
        continue;
      }

      // Mob hits (player projectiles only). Player-thrown flasks shatter on
      // the mob into a flaskBreak (the AoE hits it); arrows deal direct damage.
      if (a.fromPlayer && mobs) {
        let hitMob = null;
        for (const mob of mobs) {
          const c = mob.mesh.position;
          const dx = c.x - p.x, dy = c.y + 0.95 - p.y, dz = c.z - p.z;
          if (dx * dx + dy * dy + dz * dz < MOB_HIT_RADIUS * MOB_HIT_RADIUS) {
            hitMob = mob;
            break;
          }
        }
        if (hitMob) {
          if (a.kind === 'flask') {
            events.push({ type: 'flaskBreak', pos: p.clone(), payload: a.payload, fromPlayer: true });
          } else {
            events.push({ type: 'mob', mob: hitMob, damage: a.damage, pos: p.clone() });
          }
          this._remove(i);
          continue;
        }
      }

      // Player hit (hostile projectiles only). Compare against the body centre
      // (eye height minus ~0.8) so shots at the torso connect. Hostile flasks
      // shatter into a flaskBreak (AoE, no direct damage) like block impacts.
      if (!a.fromPlayer) {
        const dx = playerPos.x - p.x;
        const dy = playerPos.y - 0.8 - p.y;
        const dz = playerPos.z - p.z;
        if (dx * dx + dy * dy + dz * dz < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
          if (a.kind === 'flask') {
            events.push({ type: 'flaskBreak', pos: p.clone(), payload: a.payload, fromPlayer: false });
          } else {
            events.push({ type: 'player', damage: a.damage, kind: a.kind, pos: p.clone() });
          }
          this._remove(i);
        }
      }
    }
    return events;
  }
}
