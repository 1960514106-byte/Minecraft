// =============================================================================
// feedback.js - Small visual/audio feedback layer for mining and item pickup.
// =============================================================================

import * as THREE from 'three';
import { BLOCK } from './config.js';

const COLORS = {
  [BLOCK.GRASS]: 0x5f9e40,
  [BLOCK.DIRT]: 0x876044,
  [BLOCK.STONE]: 0x808084,
  [BLOCK.SAND]: 0xdbcb96,
  [BLOCK.WOOD]: 0x6e5032,
  [BLOCK.LEAVES]: 0x2e6e2c,
  [BLOCK.SNOW]: 0xeef2fa,
  [BLOCK.PLANK]: 0xb28a56,
  [BLOCK.COAL_ORE]: 0x4f4f54,
  [BLOCK.IRON_ORE]: 0xc98f66,
  [BLOCK.CRAFTING_TABLE]: 0xa67438,
  [BLOCK.FURNACE]: 0x787880,
  [BLOCK.FURNACE_LIT]: 0x9a6838,
  [BLOCK.GLASS]: 0xc8dce6,
  [BLOCK.GOLD_ORE]: 0xe2c438,
  [BLOCK.REDSTONE_ORE]: 0xc42a2a,
  [BLOCK.IRON_BLOCK]: 0xbcbcc2,
  [BLOCK.GOLD_BLOCK]: 0xdab236,
  [BLOCK.REDSTONE_BLOCK]: 0x9e2222,
  [BLOCK.CACTUS]: 0x2c8448,
  [BLOCK.COBBLESTONE]: 0x6e6e72,
  [BLOCK.MOSSY_STONE]: 0x5f6e5f,
  [BLOCK.BRICK]: 0x9b4b3c,
  [BLOCK.OBSIDIAN]: 0x1a1028,
  [BLOCK.GRAVEL]: 0x827d78,
  [BLOCK.CLAY]: 0xa0a5af,
  [BLOCK.STONE_BRICK]: 0x787880,
  [BLOCK.BOOKSHELF]: 0x8e6024,
  [BLOCK.TNT]: 0xc83228,
};

export class Feedback {
  constructor(scene) {
    this.scene = scene;
    this.audio = null;
    this.volume = 1;
    this.particles = [];
    this.particleGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    this.particleMaterials = new Map();
    this.smallGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);

    // Ambient sound state
    this._ambientInit = false;
    this._windGain = null;
    this._waterGain = null;
    this._caveGain = null;
    this._cricketOsc = null;
    this._cricketGain = null;
    this._musicTimer = 15 + Math.random() * 30;
    this._musicPlaying = false;
    this._birdTimer = 5 + Math.random() * 10;
  }

  _initAmbient() {
    if (this._ambientInit || !this.audio) return;
    this._ambientInit = true;
    const ctx = this.audio;

    // Rain: filtered pink-ish noise
    const rainBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const rainData = rainBuf.getChannelData(0);
    for (let i = 0; i < rainData.length; i++) rainData[i] = (Math.random() * 2 - 1) * 0.2;
    this._rainSrc = ctx.createBufferSource();
    this._rainSrc.buffer = rainBuf;
    this._rainSrc.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 1800;
    rainFilter.Q.value = 0.5;
    this._rainGain = ctx.createGain();
    this._rainGain.gain.value = 0;
    this._rainSrc.connect(rainFilter).connect(this._rainGain).connect(ctx.destination);
    this._rainSrc.start();

    // Wind: filtered white noise
    const windBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const windData = windBuf.getChannelData(0);
    for (let i = 0; i < windData.length; i++) windData[i] = (Math.random() * 2 - 1) * 0.3;
    this._windSrc = ctx.createBufferSource();
    this._windSrc.buffer = windBuf;
    this._windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 400;
    this._windGain = ctx.createGain();
    this._windGain.gain.value = 0;
    this._windSrc.connect(windFilter).connect(this._windGain).connect(ctx.destination);
    this._windSrc.start();

    // Water: filtered noise, different character
    const waterBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const waterData = waterBuf.getChannelData(0);
    for (let i = 0; i < waterData.length; i++) waterData[i] = (Math.random() * 2 - 1) * 0.25;
    this._waterSrc = ctx.createBufferSource();
    this._waterSrc.buffer = waterBuf;
    this._waterSrc.loop = true;
    const waterFilter = ctx.createBiquadFilter();
    waterFilter.type = 'bandpass';
    waterFilter.frequency.value = 600;
    waterFilter.Q.value = 0.8;
    this._waterGain = ctx.createGain();
    this._waterGain.gain.value = 0;
    this._waterSrc.connect(waterFilter).connect(this._waterGain).connect(ctx.destination);
    this._waterSrc.start();

    // Cave: low rumble
    const caveBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const caveData = caveBuf.getChannelData(0);
    for (let i = 0; i < caveData.length; i++) caveData[i] = (Math.random() * 2 - 1) * 0.15;
    this._caveSrc = ctx.createBufferSource();
    this._caveSrc.buffer = caveBuf;
    this._caveSrc.loop = true;
    const caveFilter = ctx.createBiquadFilter();
    caveFilter.type = 'lowpass';
    caveFilter.frequency.value = 120;
    this._caveGain = ctx.createGain();
    this._caveGain.gain.value = 0;
    this._caveSrc.connect(caveFilter).connect(this._caveGain).connect(ctx.destination);
    this._caveSrc.start();

    // Crickets: quiet oscillator pair
    this._cricketGain = ctx.createGain();
    this._cricketGain.gain.value = 0;
    this._cricketGain.connect(ctx.destination);
    const c1 = ctx.createOscillator();
    c1.type = 'sine';
    c1.frequency.value = 4200;
    const c1g = ctx.createGain();
    c1g.gain.value = 0.012;
    c1.connect(c1g).connect(this._cricketGain);
    c1.start();
    const c2 = ctx.createOscillator();
    c2.type = 'sine';
    c2.frequency.value = 4800;
    const c2g = ctx.createGain();
    c2g.gain.value = 0.008;
    c2.connect(c2g).connect(this._cricketGain);
    c2.start();
    // Modulate cricket volume with LFO for chirp effect
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 3.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(c1g.gain);
    lfo.start();
  }

  setRainVolume(intensity) {
    if (!this.audio) return;
    this._initAmbient();
    if (this._rainGain) {
      const target = intensity * 0.08 * Math.max(0, Math.min(1, this.volume));
      this._rainGain.gain.value += (target - this._rainGain.gain.value) * 0.05;
    }
  }

  updateAmbient(dt, playerPos, world, isNight, surfaceY) {
    if (!this.audio) return;
    this._initAmbient();
    const vol = Math.max(0, Math.min(1, this.volume));
    if (vol <= 0) {
      if (this._windGain) this._windGain.gain.value = 0;
      if (this._waterGain) this._waterGain.gain.value = 0;
      if (this._caveGain) this._caveGain.gain.value = 0;
      if (this._cricketGain) this._cricketGain.gain.value = 0;
      return;
    }
    const smooth = 0.04;
    const lerp = (cur, target) => cur + (target - cur) * smooth;

    // Wind: louder at altitude
    if (this._windGain) {
      const altFactor = Math.max(0, Math.min(1, (playerPos.y - 30) / 30));
      const target = altFactor * 0.06 * vol;
      this._windGain.gain.value = lerp(this._windGain.gain.value, target);
    }

    // Water: check nearby blocks for water
    if (this._waterGain) {
      let waterCount = 0;
      const px = Math.floor(playerPos.x), py = Math.floor(playerPos.y), pz = Math.floor(playerPos.z);
      for (let dy = -2; dy <= 1; dy++) {
        for (let dz = -3; dz <= 3; dz++) {
          for (let dx = -3; dx <= 3; dx++) {
            if (world.getBlock(px + dx, py + dy, pz + dz) === BLOCK.WATER) waterCount++;
          }
        }
      }
      const target = Math.min(1, waterCount / 20) * 0.07 * vol;
      this._waterGain.gain.value = lerp(this._waterGain.gain.value, target);
    }

    // Cave: underground rumble
    if (this._caveGain) {
      const underground = playerPos.y < surfaceY - 5 && surfaceY > 25;
      const target = underground ? 0.04 * vol : 0;
      this._caveGain.gain.value = lerp(this._caveGain.gain.value, target);
    }

    // Crickets: night time, above ground
    if (this._cricketGain) {
      const above = playerPos.y >= surfaceY - 2;
      const target = (isNight && above) ? 0.6 * vol : 0;
      this._cricketGain.gain.value = lerp(this._cricketGain.gain.value, target);
    }

    // Birds: daytime chirps
    if (!isNight && playerPos.y >= surfaceY - 2) {
      this._birdTimer -= dt;
      if (this._birdTimer <= 0) {
        this._birdTimer = 4 + Math.random() * 12;
        this._playBirdChirp(vol);
      }
    }

    // Procedural music: occasional gentle phrases
    this._musicTimer -= dt;
    if (this._musicTimer <= 0 && !this._musicPlaying) {
      this._musicTimer = 40 + Math.random() * 50;
      this._playMusicPhrase();
    }
  }

  _playMusicPhrase() {
    if (!this.audio || this._musicPlaying) return;
    const vol = Math.max(0, Math.min(1, this.volume));
    if (vol <= 0) return;
    this._musicPlaying = true;
    const ctx = this.audio;
    const now = ctx.currentTime;

    const scales = [
      [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3],
      [220.0, 246.9, 277.2, 329.6, 370.0, 440.0, 493.9],
      [196.0, 220.0, 261.6, 293.7, 329.6, 392.0, 440.0],
    ];
    const notes = scales[Math.floor(Math.random() * scales.length)];
    const noteCount = 6 + Math.floor(Math.random() * 6);
    const noteLen = 0.5 + Math.random() * 0.4;
    const gap = 0.08 + Math.random() * 0.12;

    for (let i = 0; i < noteCount; i++) {
      const freq = notes[Math.floor(Math.random() * notes.length)];
      const t = now + i * (noteLen + gap);
      const osc = ctx.createOscillator();
      osc.type = i % 3 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.016 * vol, t + 0.08);
      gain.gain.setValueAtTime(0.016 * vol, t + noteLen * 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, t + noteLen);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + noteLen + 0.01);
    }

    // Soft pad harmony underneath
    const padFreq = notes[0] * 0.5;
    const padDur = noteCount * (noteLen + gap);
    const padOsc = ctx.createOscillator();
    padOsc.type = 'sine';
    padOsc.frequency.value = padFreq;
    const padGain = ctx.createGain();
    padGain.gain.setValueAtTime(0, now);
    padGain.gain.linearRampToValueAtTime(0.008 * vol, now + 0.5);
    padGain.gain.setValueAtTime(0.008 * vol, now + padDur - 0.5);
    padGain.gain.exponentialRampToValueAtTime(0.001, now + padDur);
    padOsc.connect(padGain).connect(ctx.destination);
    padOsc.start(now);
    padOsc.stop(now + padDur + 0.01);

    setTimeout(() => { this._musicPlaying = false; }, padDur * 1000 + 500);
  }

  _playBirdChirp(vol) {
    if (!this.audio) return;
    if (vol <= 0) return;
    const ctx = this.audio;
    const now = ctx.currentTime;
    const chirps = 2 + Math.floor(Math.random() * 4);
    const baseFreq = 1800 + Math.random() * 1400;
    for (let i = 0; i < chirps; i++) {
      const t = now + i * (0.08 + Math.random() * 0.06);
      const freq = baseFreq + (Math.random() - 0.5) * 400;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(freq + 200 + Math.random() * 300, t + 0.04);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.012 * vol, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.07);
    }
  }

  ensureAudio() {
    if (!this.audio) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) this.audio = new Ctx();
    }
    if (this.audio && this.audio.state === 'suspended') this.audio.resume();
  }

  play(type) {
    this.ensureAudio();
    if (!this.audio) return;
    const volume = Math.max(0, Math.min(1, this.volume));
    if (volume <= 0) return;
    const now = this.audio.currentTime;

    if (type === 'pickup') {
      this._tone('sine', 520, 880, 0.08, 0.035 * volume, 0.12);
      return;
    }

    if (type === 'hit' || type === 'mobDeath') {
      const f = type === 'hit' ? 180 : 120;
      const f2 = type === 'hit' ? 90 : 48;
      this._tone('square', f, f2, 0.11, (type === 'hit' ? 0.035 : 0.05) * volume, 0.14);
      return;
    }

    if (type === 'walk') {
      this._noise(0.02 * volume, 0.06);
      return;
    }

    if (type === 'fall') {
      this._tone('sawtooth', 200, 60, 0.15, 0.06 * volume, 0.2);
      return;
    }

    if (type === 'explode') {
      this._noise(0.12 * volume, 0.4);
      this._tone('sawtooth', 60, 25, 0.3, 0.08 * volume, 0.45);
      return;
    }

    if (type === 'door') {
      this._tone('square', 280, 200, 0.05, 0.03 * volume, 0.08);
      return;
    }

    if (type === 'eat') {
      this._tone('sine', 350, 420, 0.06, 0.025 * volume, 0.1);
      setTimeout(() => this._tone('sine', 400, 480, 0.06, 0.025 * volume, 0.1), 120);
      return;
    }

    if (type === 'zombieGrunt') {
      this._tone('sawtooth', 85, 55, 0.2, 0.03 * volume, 0.35);
      setTimeout(() => this._tone('sawtooth', 75, 45, 0.15, 0.02 * volume, 0.25), 150);
      return;
    }

    if (type === 'creeperHiss') {
      this._noise(0.04 * volume, 0.6);
      this._tone('sine', 2200, 3800, 0.3, 0.02 * volume, 0.5);
      return;
    }

    if (type === 'skeletonRattle') {
      this._tone('square', 800, 400, 0.03, 0.025 * volume, 0.06);
      setTimeout(() => this._tone('square', 600, 300, 0.03, 0.02 * volume, 0.05), 60);
      setTimeout(() => this._tone('square', 900, 500, 0.03, 0.018 * volume, 0.05), 120);
      return;
    }

    if (type === 'animalSqueal') {
      this._tone('sine', 380, 500, 0.08, 0.025 * volume, 0.12);
      return;
    }

    if (type === 'levelUp') {
      this._tone('sine', 440, 880, 0.12, 0.04 * volume, 0.2);
      setTimeout(() => this._tone('sine', 660, 1320, 0.1, 0.035 * volume, 0.15), 120);
      return;
    }

    if (type === 'bowShoot') {
      // Quick string twang + whoosh
      this._tone('triangle', 480, 140, 0.09, 0.04 * volume, 0.12);
      this._noise(0.02 * volume, 0.12);
      return;
    }

    if (type === 'fuse') {
      this._noise(0.03 * volume, 0.25);
      this._tone('sawtooth', 3200, 2400, 0.2, 0.015 * volume, 0.25);
      return;
    }

    if (type === 'click') {
      this._tone('square', 720, 520, 0.03, 0.03 * volume, 0.05);
      return;
    }

    if (type === 'piston') {
      this._noise(0.03 * volume, 0.12);
      this._tone('sawtooth', 160, 60, 0.12, 0.04 * volume, 0.16);
      return;
    }

    if (type === 'portal') {
      this._tone('sine', 120, 640, 0.8, 0.05 * volume, 1.0);
      this._tone('sine', 80, 320, 0.9, 0.04 * volume, 1.1);
      return;
    }

    if (type === 'warp') {
      this._tone('sine', 900, 200, 0.18, 0.04 * volume, 0.22);
      return;
    }

    if (type === 'minecart') {
      this._noise(0.015 * volume, 0.08);
      return;
    }

    if (type === 'wolfBark') {
      this._tone('square', 420, 240, 0.07, 0.035 * volume, 0.1);
      setTimeout(() => this._tone('square', 460, 260, 0.06, 0.03 * volume, 0.09), 120);
      return;
    }

    if (type === 'bossRoar') {
      this._tone('sawtooth', 110, 40, 0.5, 0.09 * volume, 0.8);
      this._noise(0.06 * volume, 0.7);
      return;
    }

    if (type === 'fireShoot') {
      this._noise(0.03 * volume, 0.18);
      this._tone('sawtooth', 500, 180, 0.15, 0.03 * volume, 0.2);
      return;
    }

    // place / mine
    const isPlace = type === 'place';
    this._tone(
      isPlace ? 'triangle' : 'sawtooth',
      isPlace ? 170 : 115,
      isPlace ? 95 : 55,
      0.08,
      (isPlace ? 0.03 : 0.045) * volume,
      0.09,
    );
  }

  _tone(wave, f1, f2, sweep, vol, decay) {
    if (!this.audio) return;
    const now = this.audio.currentTime;
    const osc = this.audio.createOscillator();
    const gain = this.audio.createGain();
    osc.connect(gain);
    gain.connect(this.audio.destination);
    osc.type = wave;
    osc.frequency.setValueAtTime(f1, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f2), now + sweep);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + decay);
    osc.start(now);
    osc.stop(now + decay + 0.01);
  }

  _noise(vol, duration) {
    if (!this.audio) return;
    const now = this.audio.currentTime;
    const bufSize = Math.floor(this.audio.sampleRate * duration);
    const buf = this.audio.createBuffer(1, bufSize, this.audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const src = this.audio.createBufferSource();
    src.buffer = buf;
    const gain = this.audio.createGain();
    src.connect(gain);
    gain.connect(this.audio.destination);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.start(now);
    src.stop(now + duration + 0.01);
  }

  burst(blockId, pos) {
    const color = COLORS[blockId] || 0xffffff;
    let material = this.particleMaterials.get(color);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color });
      this.particleMaterials.set(color, material);
    }
    for (let i = 0; i < 18; i++) {
      const scale = 0.6 + Math.random() * 0.8;
      const mesh = new THREE.Mesh(this.particleGeo, material);
      mesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.7,
        pos.y + (Math.random() - 0.5) * 0.7,
        pos.z + (Math.random() - 0.5) * 0.7,
      );
      mesh.scale.setScalar(scale);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        life: 0.4 + Math.random() * 0.25,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 2.5,
          1.0 + Math.random() * 2.8,
          (Math.random() - 0.5) * 2.5,
        ),
      });
    }
  }

  placeBurst(blockId, pos) {
    const color = COLORS[blockId] || 0xffffff;
    let material = this.particleMaterials.get(color);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color });
      this.particleMaterials.set(color, material);
    }
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(this.smallGeo, material);
      mesh.position.copy(pos);
      mesh.scale.setScalar(0.5 + Math.random() * 0.5);
      this.scene.add(mesh);
      const a = Math.random() * Math.PI * 2;
      const spd = 1.2 + Math.random() * 1.5;
      this.particles.push({
        mesh,
        life: 0.2 + Math.random() * 0.15,
        velocity: new THREE.Vector3(Math.cos(a) * spd, 0.5 + Math.random() * 1.5, Math.sin(a) * spd),
      });
    }
  }

  explosionBurst(pos, radius) {
    const expColors = [0xff6600, 0xff9900, 0xffcc00, 0x888888, 0x555555, 0x333333];
    for (let i = 0; i < 40; i++) {
      const color = expColors[Math.floor(Math.random() * expColors.length)];
      let mat = this.particleMaterials.get(color);
      if (!mat) { mat = new THREE.MeshBasicMaterial({ color }); this.particleMaterials.set(color, mat); }
      const scale = 0.8 + Math.random() * 1.5;
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.position.set(
        pos.x + (Math.random() - 0.5) * radius * 0.5,
        pos.y + (Math.random() - 0.5) * radius * 0.5,
        pos.z + (Math.random() - 0.5) * radius * 0.5,
      );
      mesh.scale.setScalar(scale);
      this.scene.add(mesh);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
      const spd = 3 + Math.random() * 6;
      this.particles.push({
        mesh,
        life: 0.5 + Math.random() * 0.6,
        velocity: dir.multiplyScalar(spd),
      });
    }
  }

  pickupSparkle(pos) {
    const sparkColor = 0xffffa0;
    let mat = this.particleMaterials.get(sparkColor);
    if (!mat) { mat = new THREE.MeshBasicMaterial({ color: sparkColor }); this.particleMaterials.set(sparkColor, mat); }
    for (let i = 0; i < 5; i++) {
      const mesh = new THREE.Mesh(this.smallGeo, mat);
      mesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.4,
        pos.y + Math.random() * 0.3,
        pos.z + (Math.random() - 0.5) * 0.4,
      );
      mesh.scale.setScalar(0.4 + Math.random() * 0.3);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        life: 0.25 + Math.random() * 0.2,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 0.8),
        noGravity: true,
      });
    }
  }

  torchParticle(pos) {
    const flameColors = [0xff6600, 0xff9900, 0xffcc00];
    const color = flameColors[Math.floor(Math.random() * flameColors.length)];
    let mat = this.particleMaterials.get(color);
    if (!mat) { mat = new THREE.MeshBasicMaterial({ color }); this.particleMaterials.set(color, mat); }
    const mesh = new THREE.Mesh(this.smallGeo, mat);
    mesh.position.set(
      pos.x + (Math.random() - 0.5) * 0.1,
      pos.y + 0.35,
      pos.z + (Math.random() - 0.5) * 0.1,
    );
    mesh.scale.setScalar(0.3 + Math.random() * 0.25);
    this.scene.add(mesh);
    this.particles.push({
      mesh,
      life: 0.3 + Math.random() * 0.3,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3),
      noGravity: true,
    });
  }

  // Generic drifting puff of coloured particles (hearts, warps, smoke...).
  _puff(color, pos, count, spread, riseSpeed) {
    let mat = this.particleMaterials.get(color);
    if (!mat) { mat = new THREE.MeshBasicMaterial({ color }); this.particleMaterials.set(color, mat); }
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.smallGeo, mat);
      mesh.position.set(
        pos.x + (Math.random() - 0.5) * spread,
        pos.y + Math.random() * spread,
        pos.z + (Math.random() - 0.5) * spread,
      );
      mesh.scale.setScalar(0.4 + Math.random() * 0.3);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        life: 0.4 + Math.random() * 0.3,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.6,
          riseSpeed + Math.random() * 0.8,
          (Math.random() - 0.5) * 0.6,
        ),
        noGravity: true,
      });
    }
  }

  // Pink hearts above breeding / tamed animals.
  hearts(pos) {
    this._puff(0xff5f9e, pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 4, 0.7, 0.9);
  }

  // Purple burst for enderman teleports and portal travel.
  warpBurst(pos) {
    this._puff(0xaa55ee, pos.clone().add(new THREE.Vector3(0, 1.0, 0)), 10, 1.2, 0.6);
    this._puff(0x5511aa, pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 6, 0.8, 0.4);
  }

  // Grey smoke, e.g. a failed taming attempt.
  smokePuff(pos) {
    this._puff(0x777777, pos.clone().add(new THREE.Vector3(0, 1.0, 0)), 6, 0.6, 0.7);
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (!p.noGravity) p.velocity.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 5;
      p.mesh.rotation.y += dt * 4;
      p.mesh.scale.setScalar(Math.max(0.05, p.life * 1.8));
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }
}
