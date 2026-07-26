// =============================================================================
// sky.js — Day/night cycle. Drives the sun (a directional light) along an arc,
// cross-fades the sky + fog colour through dawn/day/dusk/night, dims the
// ambient hemisphere light, and shows a moon on the far side of the sun.
// Self-contained: construct with the scene + lights, then call update(dt).
// =============================================================================

import * as THREE from 'three';
import { CHUNK_HEIGHT } from './config.js';

// Full cycle length in seconds (a comfortable ~4 min day for a prototype).
const DAY_LENGTH = 240;

// Key colours sampled around the cycle. `t` is the fraction of the day (0..1),
// with 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
// Each stop carries the sky/fog tint and the sun light colour + intensity.
const STOPS = [
  { t: 0.00, sky: 0x05070f, sun: 0x223046, sunI: 0.04, hemiI: 0.18 }, // midnight
  { t: 0.22, sky: 0x0b1430, sun: 0x2a3550, sunI: 0.10, hemiI: 0.25 }, // pre-dawn
  { t: 0.27, sky: 0xff8c52, sun: 0xffb27a, sunI: 0.65, hemiI: 0.55 }, // sunrise
  { t: 0.35, sky: 0x9fd0ee, sun: 0xffe8c2, sunI: 0.85, hemiI: 0.85 }, // morning
  { t: 0.50, sky: 0x87ceeb, sun: 0xffffff, sunI: 0.95, hemiI: 0.95 }, // noon
  { t: 0.65, sky: 0x9fd0ee, sun: 0xffe8c2, sunI: 0.85, hemiI: 0.85 }, // afternoon
  { t: 0.73, sky: 0xff7a45, sun: 0xff9e5c, sunI: 0.60, hemiI: 0.55 }, // sunset
  { t: 0.78, sky: 0x162247, sun: 0x2a3550, sunI: 0.10, hemiI: 0.25 }, // dusk
  { t: 1.00, sky: 0x05070f, sun: 0x223046, sunI: 0.04, hemiI: 0.18 }, // back to midnight
];

const _a = new THREE.Color();
const _b = new THREE.Color();

// Paint a seamless, tileable cloud texture (soft white blobs on transparent) to
// an offscreen canvas. Blobs near an edge are redrawn wrapped to the opposite
// side so the texture tiles without visible seams when repeated across the sky.
function makeCloudTexture() {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, S, S);

  // Deterministic PRNG so the sky looks the same every run.
  let a = 0x9e3779b9;
  const rand = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const blob = (x, y, r) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };

  for (let i = 0; i < 26; i++) {
    const x = rand() * S, y = rand() * S, r = 16 + rand() * 40;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) blob(x + ox * S, y + oy * S, r);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Linearly interpolate the STOPS table at fraction t (0..1), wrapping at 1.
function sample(t) {
  let i = 0;
  while (i < STOPS.length - 1 && t > STOPS[i + 1].t) i++;
  const s0 = STOPS[i], s1 = STOPS[Math.min(i + 1, STOPS.length - 1)];
  const span = s1.t - s0.t || 1;
  const f = THREE.MathUtils.clamp((t - s0.t) / span, 0, 1);

  _a.setHex(s0.sky); _b.setHex(s1.sky);
  const sky = _a.clone().lerp(_b, f);
  _a.setHex(s0.sun); _b.setHex(s1.sun);
  const sun = _a.clone().lerp(_b, f);
  const sunI = THREE.MathUtils.lerp(s0.sunI, s1.sunI, f);
  const hemiI = THREE.MathUtils.lerp(s0.hemiI, s1.hemiI, f);
  return { sky, sun, sunI, hemiI };
}

export class DayNightCycle {
  // scene: THREE.Scene (its background + fog are updated)
  // sun:   THREE.DirectionalLight
  // hemi:  THREE.HemisphereLight
  // startT: initial day fraction (default 0.32 ≈ early morning)
  constructor(scene, sun, hemi, startT = 0.32) {
    this.scene = scene;
    this.sun = sun;
    this.hemi = hemi;
    this.t = startT;
    this.paused = false;
    this.radius = 220; // how far the sun/moon orbit sits from the origin

    // A faint moon disc that rides opposite the sun.
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(8, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xdfe7ff, fog: false }),
    );
    scene.add(this.moon);

    // A bright sun disc that rides with the sun light. fog:false keeps it crisp
    // against the sky; it's hidden while the sun is below the horizon.
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(11, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xfff2cc, fog: false }),
    );
    scene.add(this.sunMesh);

    // Drifting cloud layer: one large plane that re-centres on the player every
    // frame, with its UVs offset by the player's world position (so clouds stay
    // world-anchored) plus a slow wind scroll. depthWrite off so it never
    // occludes terrain; fog:false so it doesn't get tinted by ground fog.
    this.cloudT = 0;
    this.cloudSize = 700;
    this.cloudRepeat = 5;
    const cloudTex = makeCloudTexture();
    cloudTex.repeat.set(this.cloudRepeat, this.cloudRepeat);
    this.cloudMat = new THREE.MeshBasicMaterial({
      map: cloudTex, transparent: true, opacity: 0.85,
      depthWrite: false, fog: false, side: THREE.DoubleSide,
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(this.cloudSize, this.cloudSize), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;         // lay flat
    this.clouds.position.y = CHUNK_HEIGHT + 32;    // well above the tallest terrain
    this.clouds.renderOrder = -1;          // behind translucent water etc.
    scene.add(this.clouds);

    this.baseHemi = hemi ? hemi.color.clone() : null;
    this.apply();
  }

  // Skip the cycle forward by a day fraction (e.g. +0.5 to flip day<->night).
  skip(df) { this.t = (this.t + df) % 1; if (this.t < 0) this.t += 1; this.apply(); }
  togglePause() { this.paused = !this.paused; }

  // Nether mode: constant oppressive dark-red sky, no sun/moon/clouds. Time
  // still advances underneath so the overworld picks up where it left off.
  setNether(on) {
    this.nether = on;
    this.moon.visible = !on && this.moon.visible;
    if (this.sunMesh) this.sunMesh.visible = !on && this.sunMesh.visible;
    if (this.clouds) this.clouds.visible = !on;
    this.apply();
  }

  // Human-readable 24h clock derived from the day fraction (0 = 00:00).
  clock() {
    const mins = Math.floor(this.t * 24 * 60);
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Advance time and re-apply lighting/colours. Pass the camera/player position
  // as `centre` so the sun/moon orbit stays centred on the viewer.
  update(dt, centre) {
    if (!this.paused) {
      this.t += dt / DAY_LENGTH;
      if (this.t >= 1) this.t -= 1;
    }
    this.cloudT += dt; // wind scroll keeps moving even when time is paused
    this.apply(centre);
  }

  // Position the sun/moon and push colours into the scene + lights.
  // The directional sun only cares about its direction (position − target at the
  // origin), so it orbits the origin. The moon is a real mesh, so it orbits the
  // camera `centre` to stay "infinitely" far away as the player moves.
  apply(centre) {
    if (this.nether) {
      const sky = _a.setHex(0x2a0d0a);
      if (this.scene.background) this.scene.background.copy(sky);
      else this.scene.background = sky.clone();
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0x3a120c);
        this.scene.fog.near = 18;
        this.scene.fog.far = 60;
      }
      this.sun.color.setHex(0xff8855);
      this.sun.intensity = 0.25;
      this.sun.position.set(30, 80, 20);
      this.moon.visible = false;
      if (this.sunMesh) this.sunMesh.visible = false;
      if (this.clouds) this.clouds.visible = false;
      if (this.hemi) {
        this.hemi.intensity = 0.4;
        this.hemi.color.setHex(0xcc7755);
      }
      return;
    }
    if (this.scene.fog) {
      this.scene.fog.near = 45;
      this.scene.fog.far = 95;
    }
    if (this.clouds) this.clouds.visible = true;
    const { sky, sun, sunI, hemiI } = sample(this.t);

    if (this.scene.background) this.scene.background.copy(sky);
    else this.scene.background = sky.clone();
    if (this.scene.fog) this.scene.fog.color.copy(sky);

    // Sun arc: angle 0 at sunrise (east, +X), PI at sunset (west, -X).
    const ang = (this.t - 0.25) * Math.PI * 2;
    const sx = Math.cos(ang) * this.radius;
    const sy = Math.sin(ang) * this.radius;
    const sz = Math.cos(ang) * this.radius * 0.35; // slight tilt off due-east

    // Direction only — keep the light orbiting the origin (target = 0,0,0).
    this.sun.position.set(sx, sy, sz);
    this.sun.color.copy(sun);
    this.sun.intensity = sunI;

    // Moon is a visible mesh, so ride it around the player, opposite the sun.
    const cx = centre ? centre.x : 0;
    const cy = centre ? centre.y : 0;
    const cz = centre ? centre.z : 0;
    this.moon.position.set(cx - sx, cy - sy, cz - sz);
    this.moon.visible = sy < 0; // only show the moon while the sun is below

    // Sun disc rides on the same side as the sun light, hidden once it sets.
    if (this.sunMesh) {
      this.sunMesh.position.set(cx + sx, cy + sy, cz + sz);
      this.sunMesh.visible = sy > -10;
    }

    // Clouds: follow the player in XZ, scroll their UVs by world position + wind
    // so they read as world-anchored, and dim from white toward a dusky grey as
    // the sun sets (tracking the sun intensity).
    if (this.clouds) {
      this.clouds.position.x = cx;
      this.clouds.position.z = cz;
      const uvPerWorld = this.cloudRepeat / this.cloudSize;
      const wind = this.cloudT * 0.004;
      this.cloudMat.map.offset.set(cx * uvPerWorld + wind, cz * uvPerWorld + wind * 0.6);
      const shade = 0.35 + 0.65 * THREE.MathUtils.clamp(sunI, 0, 1); // grey at night
      this.cloudMat.color.setRGB(shade, shade, shade);
      this.cloudMat.opacity = 0.55 + 0.3 * THREE.MathUtils.clamp(sunI, 0, 1);
    }

    if (this.hemi) {
      this.hemi.intensity = hemiI;
      // Tint the ambient sky-colour of the hemisphere toward the current sky.
      if (this.baseHemi) this.hemi.color.copy(this.baseHemi).lerp(sky, 0.5);
    }
  }
}
