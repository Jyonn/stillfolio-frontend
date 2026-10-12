import { debugLog, debugId } from './debug-log.js';
const DB_NAME = 'jyonn-photo-archive';
const DB_VERSION = 2;
const STORE = 'photos';
const ASSET_STORE = 'assets';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(ASSET_STORE)) db.createObjectStore(ASSET_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => debugLog('IndexedDB 打开被阻塞');
  });
}

async function transaction(mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    callback(store);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export function photoId(file, collectionId = 'default') {
  return `${collectionId}:${file.name}:${file.size}:${file.lastModified}`;
}

export async function savePhoto(item) {
  const trace = debugId(), start = performance.now();
  debugLog('照片本地保存开始', {trace, state: item.cloudSyncStatus || 'local', bytes: item.file?.size});
  const slow = setTimeout(() => debugLog('照片本地保存等待超过15秒', {trace}), 15000);
  const record = {
    id: item.id,
    collectionId: item.collectionId,
    file: item.file,
    width: item.width,
    height: item.height,
    exif: item.exif,
    place: item.place || '',
    places: item.places || {},
    placeEdited: Boolean(item.placeEdited),
    placeEditedByService: item.placeEditedByService || {},
    placeService: item.placeService || '',
    locationSource: item.locationSource || '',
    cropY: Number.isFinite(item.cropY) ? item.cropY : 50,
    cropX: Number.isFinite(item.cropX) ? item.cropX : 50,
    cropMode: item.cropMode || 'window',
    cloudSyncStatus: item.cloudSyncStatus || '',
    cloudUpdatedAt: Number(item.cloudUpdatedAt) || 0,
    cloudDeleted: Boolean(item.cloudDeleted),
    createdAt: item.createdAt,
  };
  try {
    await transaction('readwrite', store => store.put(record));
    debugLog('照片本地保存完成', {trace, ms: Math.round(performance.now() - start)});
  } catch (error) { debugLog('照片本地保存失败', {trace, type: error.name}); throw error; }
  finally { clearTimeout(slow); }
}

export async function removePhoto(id) {
  await transaction('readwrite', store => store.delete(id));
}

export async function loadPhotos() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => a.createdAt - b.createdAt));
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function saveAsset(id, blob) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, 'readwrite');
    tx.objectStore(ASSET_STORE).put({ id, blob, updatedAt: Date.now() });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function loadAsset(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, 'readonly');
    const request = tx.objectStore(ASSET_STORE).get(id);
    request.onsuccess = () => resolve(request.result?.blob || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function loadAssets(prefix = '') {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, 'readonly');
    const request = tx.objectStore(ASSET_STORE).getAll();
    request.onsuccess = () => resolve(request.result
      .filter(asset => asset.id.startsWith(prefix))
      .sort((a, b) => a.updatedAt - b.updatedAt));
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function removeAsset(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, 'readwrite');
    tx.objectStore(ASSET_STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
