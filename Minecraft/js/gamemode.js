// =============================================================================
// gamemode.js — Tiny holder for the current game mode ('survival' | 'creative').
// Kept dependency-free (no three.js, no other game modules) so that any module
// (survival.js, player.js, mobs.js, main.js) can import it without cycles.
// =============================================================================

const MODES = ['survival', 'creative'];

let mode = 'survival';
let onChange = null;

export function getMode() {
  return mode;
}

export function isCreative() {
  return mode === 'creative';
}

// Register the single onChange hook (main.js uses it to refresh UI when the
// mode flips). Called with the new mode after it is applied.
export function setOnModeChange(fn) {
  onChange = typeof fn === 'function' ? fn : null;
}

export function setMode(m) {
  const next = MODES.includes(m) ? m : 'survival';
  if (next === mode) return;
  mode = next;
  if (onChange) onChange(mode);
}
