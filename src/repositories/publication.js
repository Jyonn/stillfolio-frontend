import { cloudAccountRepository } from './cloud.js';
import { cloudSyncRepository } from './sync.js';
import { createCollection, photoId, removeAsset, removePhoto, saveAsset, savePhoto } from './local.js';
import { independentPhotoFile } from '../photo-file.js';

async function sha256(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function publishAlbum(collection, photos, candidates, logo, onProgress, ensureOwner) {
  const path = `/sync/publications/${encodeURIComponent(collection.id)}`;
  ensureOwner();
  const previous = await cloudAccountRepository.request(path);
  const previousPhotos = new Map((previous?.photos || []).map(photo => [photo.source_id, photo]));
  const manifest = [];
  const publishedIds = new Map();
  const drafts = [];
  const displaySettings = { ...collection.settings };
  if (displaySettings.customLogoEnabled && !logo &&
      (!previous?.display_settings?.customLogoEnabled || previous.display_settings.customLogoId !== displaySettings.customLogoId)) {
    displaySettings.customLogoEnabled = false;
  }

  try {
    if (logo) {
      ensureOwner();
      await cloudSyncRepository.uploadLogo(logo.id, logo.blob);
    }
    onProgress(0, photos.length);
    for (const photo of photos) {
      const file = await independentPhotoFile(photo.file);
      const contentHash = await sha256(await file.arrayBuffer());
      // Keep legacy IDs for files already in this album. Hash new IDs so
      // long filenames and case-insensitive database comparisons are safe.
      const sourceId = previousPhotos.has(photo.id) ? photo.id
        : `photo:${await sha256(new TextEncoder().encode(photo.id))}`;
      publishedIds.set(photo.id, sourceId);
      const previousPhoto = previousPhotos.get(sourceId);
      let assetId = previousPhoto?.metadata?.contentHash === contentHash ? previousPhoto.id : '';
      if (!assetId) {
        const draftPath = `/sync/publication-drafts/${crypto.randomUUID()}`;
        drafts.push(draftPath);
        const body = new FormData();
        body.append('file', file, file.name);
        ensureOwner();
        assetId = (await cloudAccountRepository.request(draftPath, { method: 'PUT', body })).id;
      }
      manifest.push({
        source_id: sourceId,
        asset_id: assetId,
        metadata: { ...cloudSyncRepository.photoMetadata(photo), contentHash },
      });
      onProgress(manifest.length, photos.length);
    }
    ensureOwner();
    return await cloudAccountRepository.request(path, {
      method: 'PUT',
      body: JSON.stringify({
        version: previous?.version || 0,
        name: collection.name,
        description: collection.description,
        display_settings: displaySettings,
        photo_order: (collection.photoOrder || []).map(id => publishedIds.get(id)).filter(Boolean),
        photo_colors: Object.fromEntries(Object.entries(collection.photoColors || {})
          .filter(([id]) => publishedIds.has(id)).map(([id, color]) => [publishedIds.get(id), color])),
        photos: manifest,
        candidates,
      }),
    });
  } catch (error) {
    // If the final response was lost, a draft already promoted to a photo
    // cannot be removed through this endpoint.
    for (const draft of drafts) {
      try {
        ensureOwner();
        await cloudAccountRepository.request(draft, { method: 'DELETE', signal: AbortSignal.timeout(5000) });
      } catch { /* The last published version remains available. */ }
    }
    throw error;
  }
}

export async function restoreAlbumCopy(remote, onProgress, ensureOwner, saveCollection) {
  const collection = createCollection(remote.name, remote.display_settings);
  collection.description = remote.description || '';
  const ids = new Map();
  const usedIds = new Set();
  const photos = remote.photos || [];
  let savedLogoId;
  const candidatesKey = `metadata-candidates-v2:${collection.id}`;
  try {
    for (const asset of photos) {
      ensureOwner();
      const blob = await cloudSyncRepository.downloadAsset(asset);
      ensureOwner();
      const metadata = asset.metadata || {};
      const file = new File([blob], metadata.fileName || `photograph-${asset.id}`, {
        type: asset.mime_type || blob.type,
        lastModified: Number(metadata.lastModified) || Date.now(),
      });
      const sourceId = photoId(file, collection.id);
      const id = usedIds.has(sourceId) ? `${collection.id}:${crypto.randomUUID()}` : sourceId;
      await savePhoto({ ...metadata, id, collectionId: collection.id, file });
      usedIds.add(id);
      ids.set(asset.source_id, id);
      onProgress(ids.size, photos.length);
    }
    if (collection.settings.customLogoEnabled) {
      ensureOwner();
      const logos = await cloudSyncRepository.listLogos();
      const logo = logos.find(asset => asset.source_id === collection.settings.customLogoId);
      if (logo) {
        ensureOwner();
        const blob = await cloudSyncRepository.downloadAsset(logo);
        savedLogoId = `custom-logo:${crypto.randomUUID()}`;
        await saveAsset(savedLogoId, blob);
        collection.settings.customLogoId = savedLogoId;
      } else {
        collection.settings.customLogoEnabled = false;
        collection.settings.customLogoId = '';
      }
    }
    ensureOwner();
    collection.photoOrder = (remote.photo_order || []).map(id => ids.get(id)).filter(Boolean);
    collection.photoColors = Object.fromEntries(Object.entries(remote.photo_colors || {})
      .filter(([id]) => ids.has(id)).map(([id, color]) => [ids.get(id), color]));
    const candidates = { camera: [], location: [] };
    for (const candidate of remote.candidates || []) {
      if (Object.hasOwn(candidates, candidate.kind)) candidates[candidate.kind].push(candidate.payload);
    }
    localStorage.setItem(candidatesKey, JSON.stringify(candidates));
    saveCollection(collection);
    return collection;
  } catch (error) {
    localStorage.removeItem(candidatesKey);
    const cleanup = [...ids.values()].map(removePhoto);
    if (savedLogoId) cleanup.push(removeAsset(savedLogoId));
    await Promise.allSettled(cleanup);
    throw error;
  }
}
