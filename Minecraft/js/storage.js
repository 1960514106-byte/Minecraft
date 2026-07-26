// =============================================================================
// storage.js - IndexedDB save-game persistence with legacy localStorage import.
// =============================================================================

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

const MIGRATIONS = { 7: v7to8, 8: v8to9 };

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
