// =============================================================================
// weather.js - Rain and snow particle effects driven by biome and time.
// =============================================================================

import * as THREE from 'three';
import { BIOME } from './config.js';

const MAX_PARTICLES = 600;
const RAIN_SPEED = 18;
const SNOW_SPEED = 3.5;
const SPAWN_RADIUS = 24;
const SPAWN_HEIGHT = 20;
const WEATHER_CYCLE = 180;
const TRANSITION_TIME = 8;

export class Weather {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.intensity = 0;
    this.timer = 30 + Math.random() * WEATHER_CYCLE;
    this.duration = 0;
    this.particles = [];
    this.type = 'rain';

    this.rainMat = new THREE.MeshBasicMaterial({ color: 0x8899cc, transparent: true, opacity: 0.5 });
    this.snowMat = new THREE.MeshBasicMaterial({ color: 0xeeeeff, transparent: true, opacity: 0.8 });
    this.rainGeo = new THREE.BoxGeometry(0.04, 0.35, 0.04);
    this.snowGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);

    this.fogColorClear = new THREE.Color(0x87ceeb);
    this.fogColorRain = new THREE.Color(0x7a8a9a);
  }

  update(dt, playerPos, biomeAtFn) {
    this.timer -= dt;
    if (!this.active && this.timer <= 0) {
      this.active = true;
      this.duration = 40 + Math.random() * 80;
      this.timer = this.duration;
    } else if (this.active && this.timer <= 0) {
      this.active = false;
      this.timer = 60 + Math.random() * WEATHER_CYCLE;
    }

    const target = this.active ? 1 : 0;
    const speed = dt / TRANSITION_TIME;
    this.intensity += (target - this.intensity) * Math.min(1, speed * 3);

    if (this.intensity < 0.01) {
      this._clearParticles();
      return;
    }

    const biome = biomeAtFn(Math.floor(playerPos.x), Math.floor(playerPos.z));
    // Snow biome + mountains precipitate snow; deserts stay dry; everything
    // else (taiga included) rains.
    this.type = (biome === BIOME.SNOW || biome === BIOME.MOUNTAINS) ? 'snow'
      : (biome === BIOME.DESERT ? 'none' : 'rain');
    if (this.type === 'none') {
      this._clearParticles();
      return;
    }

    const count = Math.floor(MAX_PARTICLES * this.intensity);
    const isSnow = this.type === 'snow';
    const mat = isSnow ? this.snowMat : this.rainMat;
    const geo = isSnow ? this.snowGeo : this.rainGeo;

    while (this.particles.length < count) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        playerPos.x + (Math.random() - 0.5) * SPAWN_RADIUS * 2,
        playerPos.y + Math.random() * SPAWN_HEIGHT,
        playerPos.z + (Math.random() - 0.5) * SPAWN_RADIUS * 2
      );
      if (isSnow) {
        mesh.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      }
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vx: isSnow ? (Math.random() - 0.5) * 1.5 : (Math.random() - 0.5) * 0.4,
        vz: isSnow ? (Math.random() - 0.5) * 1.5 : (Math.random() - 0.5) * 0.4,
        isSnow,
      });
    }
    while (this.particles.length > count) {
      const p = this.particles.pop();
      this.scene.remove(p.mesh);
    }

    for (const p of this.particles) {
      const speed = p.isSnow ? SNOW_SPEED : RAIN_SPEED;
      p.mesh.position.y -= speed * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.z += p.vz * dt;

      if (p.isSnow) {
        p.mesh.rotation.x += dt * 1.5;
        p.mesh.rotation.z += dt * 1.2;
        p.vx += (Math.random() - 0.5) * dt * 2;
        p.vz += (Math.random() - 0.5) * dt * 2;
      }

      if (p.mesh.position.y < playerPos.y - 10) {
        p.mesh.position.set(
          playerPos.x + (Math.random() - 0.5) * SPAWN_RADIUS * 2,
          playerPos.y + SPAWN_HEIGHT + Math.random() * 5,
          playerPos.z + (Math.random() - 0.5) * SPAWN_RADIUS * 2
        );
      }

      const dx = p.mesh.position.x - playerPos.x;
      const dz = p.mesh.position.z - playerPos.z;
      if (Math.abs(dx) > SPAWN_RADIUS || Math.abs(dz) > SPAWN_RADIUS) {
        p.mesh.position.x = playerPos.x + (Math.random() - 0.5) * SPAWN_RADIUS * 2;
        p.mesh.position.z = playerPos.z + (Math.random() - 0.5) * SPAWN_RADIUS * 2;
        p.mesh.position.y = playerPos.y + SPAWN_HEIGHT * Math.random();
      }
    }
  }

  getFogColor(baseFog) {
    if (this.intensity < 0.01) return baseFog;
    const c = baseFog.clone();
    c.lerp(this.fogColorRain, this.intensity * 0.5);
    return c;
  }

  _clearParticles() {
    for (const p of this.particles) this.scene.remove(p.mesh);
    this.particles.length = 0;
  }

  serialize() {
    return {
      active: this.active,
      timer: this.timer,
      duration: this.duration,
    };
  }

  restore(state) {
    if (!state) return;
    this.active = !!state.active;
    this.timer = state.timer || 60;
    this.duration = state.duration || 0;
  }
}
