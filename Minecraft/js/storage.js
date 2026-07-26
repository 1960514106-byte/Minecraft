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
    return save || null;
  } catch (e) {
    console.warn('[storage] IndexedDB load failed:', e);
    return loadLegacySave();
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
