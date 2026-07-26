// =============================================================================
// noise.js — Seeded 2D Perlin noise with fractal Brownian motion (fbm).
// Deterministic for a given seed so the world regenerates identically.
// =============================================================================

// Small, fast seeded PRNG (mulberry32) used to shuffle the permutation table.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + t * (b - a); }

export class Noise {
  constructor(seed = 0) {
    const rand = mulberry32(seed >>> 0);
    // Build and shuffle a 0..255 permutation table.
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    // Duplicate so we can index up to 511 without wrapping math.
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  // Gradient: maps a hash to one of 8 directions and dots it with (x,y).
  _grad(hash, x, y) {
    switch (hash & 7) {
      case 0: return  x + y;
      case 1: return  x - y;
      case 2: return -x + y;
      case 3: return -x - y;
      case 4: return  x;
      case 5: return -x;
      case 6: return  y;
      default: return -y;
    }
  }

  // 2D Perlin noise, output roughly in [-1, 1].
  noise2D(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const X = xi & 255, Y = yi & 255;
    const xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const p = this.perm;
    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];
    const x1 = lerp(this._grad(aa, xf, yf),     this._grad(ba, xf - 1, yf),     u);
    const x2 = lerp(this._grad(ab, xf, yf - 1), this._grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  }

  // Fractal Brownian motion: sums several octaves, normalized to ~[-1, 1].
  fbm2D(x, y, { octaves = 4, frequency = 0.01, amplitude = 1, lacunarity = 2, persistence = 0.5 } = {}) {
    let freq = frequency, amp = amplitude, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise2D(x * freq, y * freq);
      norm += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  }
}
