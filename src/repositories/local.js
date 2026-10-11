import { createCollection as makeCollection, loadCollectionState, saveCollectionState } from '../collections.js';
import { loadAsset, loadAssets, loadPhotos, photoId, removeAsset, removePhoto, saveAsset, savePhoto } from '../storage.js';

const PROFILE_KEY = 'stillfolio-local-profile-v1';

export class LocalCollectionRepository {
  load(fallbackSettings) { return loadCollectionState(fallbackSettings); }
  save(collections, activeId) { saveCollectionState(collections, activeId); }
  create(name, settings, collectionId) { return makeCollection(name, settings, collectionId); }
}

export class LocalPhotoRepository {
  id(file, collectionId) { return photoId(file, collectionId); }
  list() { return loadPhotos(); }
  save(photo) { return savePhoto(photo); }
  remove(id) { return removePhoto(id); }
}

export class LocalAssetRepository {
  get(id) { return loadAsset(id); }
  list(prefix) { return loadAssets(prefix); }
  save(id, blob) { return saveAsset(id, blob); }
  remove(id) { return removeAsset(id); }
}

export class LocalProfileRepository {
  load() {
    try {
      const profile = JSON.parse(localStorage.getItem(PROFILE_KEY));
      return profile?.nickname ? profile : null;
    } catch {
      return null;
    }
  }

  save(profile) {
    const normalized = {
      nickname: String(profile.nickname || '').trim().slice(0, 24),
      avatarType: profile.avatarType === 'custom' ? 'custom' : 'sprite',
      avatarValue: String(profile.avatarValue ?? ''),
      completedAt: profile.completedAt || new Date().toISOString(),
    };
    if (!normalized.nickname) throw new Error('昵称不能为空');
    localStorage.setItem(PROFILE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  clear() {
    localStorage.removeItem(PROFILE_KEY);
  }
}

export const localRepositories = {
  collections: new LocalCollectionRepository(),
  photos: new LocalPhotoRepository(),
  assets: new LocalAssetRepository(),
  profile: new LocalProfileRepository(),
};

export const createCollection = (...args) => localRepositories.collections.create(...args);
export const loadCollections = (...args) => localRepositories.collections.load(...args);
export const saveCollections = (...args) => localRepositories.collections.save(...args);
export { loadAsset, loadAssets, loadPhotos, photoId, removeAsset, removePhoto, saveAsset, savePhoto };
