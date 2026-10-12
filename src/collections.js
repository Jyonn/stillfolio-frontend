import { cloneDisplaySettings } from './display-settings.js';

const COLLECTIONS_KEY = 'jyonn-collections-v1';
const ACTIVE_COLLECTION_KEY = 'jyonn-active-collection-v1';

function id() {
  return crypto.randomUUID();
}

export function createCollection(name, settings, collectionId = id()) {
  return {
    id: collectionId,
    name: String(name || '未命名作品集').trim() || '未命名作品集',
    description: '',
    settings: cloneDisplaySettings(settings),
    autoSyncNewPhotos: true,
    createdAt: Date.now(),
  };
}

export function loadCollectionState(fallbackSettings) {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLECTIONS_KEY));
    if (Array.isArray(saved) && saved.length) {
      const collections = saved.filter(item => item?.id).map(item => ({
        ...item,
        name: String(item.name || '未命名作品集'),
        settings: cloneDisplaySettings(item.settings || fallbackSettings),
        autoSyncNewPhotos: item.autoSyncNewPhotos !== false,
        createdAt: Number(item.createdAt),
      }));
      if (collections.length) {
        const requested = localStorage.getItem(ACTIVE_COLLECTION_KEY);
        return { collections, activeId: collections.some(item => item.id === requested) ? requested : collections[0].id };
      }
    }
  } catch { /* Invalid local data falls back to a new local workspace. */ }

  const initial = createCollection('光抵达的地方', fallbackSettings, 'default');
  return { collections: [initial], activeId: initial.id };
}

export function saveCollectionState(collections, activeId) {
  localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
  localStorage.setItem(ACTIVE_COLLECTION_KEY, activeId);
}
