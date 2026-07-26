// =============================================================================
// storage.js - IndexedDB save-game persistence with legacy localStorage import.
// =============================================================================

import { professionForPos, tradeTierFromUses } from './trades.js';

const DB_NAME = 'voxelcraft';
const DB_VERSION = 1;
const STORE = 'saves';
const SAVE_KEY = 'main';
const LEGACY_KEY = 'voxelcraft.save.v1';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getSaveFromDb(db) {
  const tx = db.transaction(STORE, 'readonly');
  return requestToPromise(tx.objectStore(STORE).get(SAVE_KEY));
}

async function putSaveToDb(db, state) {
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(state, SAVE_KEY);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function loadLegacySave() {
  try {
    const s = localStorage.getItem(LEGACY_KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    console.warn('[storage] legacy load failed:', e);
    return null;
  }
}

function clearLegacySave() {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch (e) {
    console.warn('[storage] legacy clear failed:', e);
  }
}

// ---- Save migrations ----------------------------------------------------------
// MIGRATIONS[v] upgrades a version-v save one step; migrateSave() chains them
// until the save is current. loadGame() runs the chain before returning, so the
// rest of the game only ever sees the latest format.

// v7 -> v8: item ids moved from the 100+ range to 1000+ (freeing 78-999 for
// future block ids), and the single `otherDimension` parked-entity bucket
// became a `parked` map keyed by dimension id.
const V8_ITEM_SHIFT = 900;

function remapItemId(id) {
  return typeof id === 'number' && id >= 100 && id < 200 ? id + V8_ITEM_SHIFT : id;
}

// Remap one stack ({ id, count, ... }) in place; tolerates null/absent slots.
function remapStack(s) {
  if (s && typeof s === 'object' && s.id != null) s.id = remapItemId(s.id);
  return s;
}

function remapStackArray(arr) {
  if (Array.isArray(arr)) for (const s of arr) remapStack(s);
  return arr;
}

function v7to8(save) {
  // Inventory + armor (legacy armor slots may hold a bare item id).
  remapStackArray(save.inventory);
  if (save.survival && save.survival.armor) {
    for (const slot of ['head', 'chest', 'legs', 'feet']) {
      const v = save.survival.armor[slot];
      if (typeof v === 'number') save.survival.armor[slot] = remapItemId(v);
      else remapStack(v);
    }
  }
  // Per-block containers: chests (27-slot sparse arrays) and furnaces.
  if (save.chests) for (const key in save.chests) remapStackArray(save.chests[key]);
  if (save.furnaces) {
    for (const key in save.furnaces) {
      const f = save.furnaces[key];
      if (f) { remapStack(f.input); remapStack(f.fuel); remapStack(f.output); }
    }
  }
  // Loose dropped-item entities in the active dimension.
  remapStackArray(save.drops);
  // Parked entities of the inactive dimension: remap the drops and fold the
  // single bucket into the per-dimension `parked` map used from v8 on.
  if (save.otherDimension) {
    remapStackArray(save.otherDimension.drops);
    const otherId = save.dimension === 'nether' ? 'overworld' : 'nether';
    save.parked = { [otherId]: save.otherDimension };
    delete save.otherDimension;
  }
  // Block ids (< 78) and world edits are unchanged by this migration.
  save.version = 8;
  return save;
}

// v8 -> v9: saves gained a game-mode field ('survival' | 'creative'). Every
// pre-v9 world was necessarily survival.
function v8to9(save) {
  save.mode = 'survival';
  save.version = 9;
  return save;
}

// v9 -> v10: Phase 3 added the flowing-fluid sim (pending-cell state) and
// boats. Both default to empty for older worlds — worldgen water is already
// all sources (meta 0) so no block data needs rewriting.
function v9to10(save) {
  if (!save.fluids) save.fluids = { active: [] };
  if (!Array.isArray(save.boats)) save.boats = [];
  save.version = 10;
  return save;
}

// v10 -> v11: Phase 4 mob registry + new mobs. Saved mob entries gained
// optional fields (vy, size for slimes, saddled for horses) that default when
// absent, so existing saves need no rewriting — only the version advances.
function v10to11(save) {
  save.version = 11;
  return save;
}

// v11 -> v12: Phase 6 redstone completion. Two new per-block container maps
// (dispensers+droppers share one, hoppers the other) default to empty. The
// redstone side-table gained torches/observers/dispensers/notes fields, but
// Redstone.restore() defaults those when absent so nothing else changes.
function v11to12(save) {
  if (!save.dispensers) save.dispensers = {};
  if (!save.hoppers) save.hoppers = {};
  save.version = 12;
  return save;
}

// v12 -> v13: Phase 7 status effects + brewing. The player effect list and the
// per-block brewing-stand map default to empty; potion stacks and mob effect
// arrays are new optional fields that default when absent.
function v12to13(save) {
  if (!Array.isArray(save.effects)) save.effects = [];
  if (!save.brewingStands) save.brewingStands = {};
  save.version = 13;
  return save;
}

// v13 -> v14: Phase 5 worldgen 2.0. Saves gained a `genVersion` terrain
// profile: every pre-v14 world was generated by the legacy algorithm, so it is
// stamped genVersion 1 (GEN_V1 regenerates its terrain bit-identically — the
// world height raise to 128 only adds empty air above). New worlds get
// genVersion 2 (continentalness worldgen) at creation time in main.js.
function v13to14(save) {
  if (typeof save.genVersion !== 'number') save.genVersion = 1;
  save.version = 14;
  return save;
}

// v14 -> v15: Phase 8 villager professions + leveled trades. Saved villagers
// gain a deterministic profession (hashed from their saved position — the
// same roll addMob would make) plus tradeTier/tradeUses defaults. The old
// global TRADES table was pure code, so nothing else needs rewriting.
function v14to15(save) {
  if (Array.isArray(save.mobs)) {
    for (const m of save.mobs) {
      if (!m || m.type !== 'villager') continue;
      if (!m.profession) m.profession = professionForPos(m.x || 0, m.z || 0);
      if (!Number.isFinite(m.tradeUses) || m.tradeUses < 0) m.tradeUses = 0;
      if (!Number.isFinite(m.tradeTier)) m.tradeTier = tradeTierFromUses(m.tradeUses);
    }
  }
  save.version = 15;
  return save;
}

const MIGRATIONS = {
  7: v7to8, 8: v8to9, 9: v9to10, 10: v10to11, 11: v11to12, 12: v12to13, 13: v13to14,
  14: v14to15,
};

export function migrateSave(save) {
  if (!save || typeof save.version !== 'number') return save;
  // Versions 1-6 used the same item ids and shapes v7 tolerated via optional
  // fields, so they enter the chain at the v7 step.
  if (save.version >= 1 && save.version < 7) save.version = 7;
  while (save && MIGRATIONS[save.version]) save = MIGRATIONS[save.version](save);
  return save;
}

// Persist a JSON-able state object. Returns true on success.
export async function saveGame(state) {
  try {
    const db = await openDb();
    await putSaveToDb(db, state);
    db.close();
    return true;
  } catch (e) {
    console.warn('[storage] IndexedDB save failed:', e);
    return false;
  }
}

// Load the saved state, or null if absent / unreadable. On first IndexedDB load,
// import the old localStorage save if present so existing worlds keep working.
export async function loadGame() {
  try {
    const db = await openDb();
    let save = await getSaveFromDb(db);
    if (!save) {
      save = loadLegacySave();
      if (save) {
        await putSaveToDb(db, save);
        clearLegacySave();
      }
    }
    db.close();
    return migrateSave(save || null);
  } catch (e) {
    console.warn('[storage] IndexedDB load failed:', e);
    return migrateSave(loadLegacySave());
  }
}

// Delete the save (used by "reset world").
export async function clearGame() {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(SAVE_KEY);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('[storage] IndexedDB clear failed:', e);
  }
  clearLegacySave();
}
