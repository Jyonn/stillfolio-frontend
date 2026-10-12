import { cloudAccountRepository } from './cloud.js';

class CloudSyncRepository {
  listLogos() { return cloudAccountRepository.request('/sync/logos'); }
  listCollections() { return cloudAccountRepository.request('/sync/collections'); }

  uploadLogo(sourceId, blob) {
    const body = new FormData();
    body.append('source_id', sourceId);
    body.append('file', blob, blob.name || `${sourceId}.bin`);
    return cloudAccountRepository.request('/sync/logos', { method: 'POST', body });
  }

  downloadAsset(asset) {
    return cloudAccountRepository.request(asset.content_url.replace('/api/v1', ''), { raw: true });
  }

  deleteAsset(assetId) {
    return cloudAccountRepository.request(`/sync/assets/${assetId}`, { method: 'DELETE' });
  }

  deleteSource(kind, sourceId) {
    return cloudAccountRepository.request(`/sync/assets/source/${kind}?source_id=${encodeURIComponent(sourceId)}`, { method: 'DELETE' });
  }

  syncCollection(collection) {
    return cloudAccountRepository.request('/sync/collections', {
      method: 'POST',
      body: JSON.stringify({ client_id: collection.id, name: collection.name, display_settings: collection.settings }),
    });
  }

  updateCollection(collection) {
    return cloudAccountRepository.request(`/sync/collections/${collection.cloudId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: collection.name, display_settings: collection.settings }),
    });
  }

  deleteCollection(collectionId) {
    return cloudAccountRepository.request(`/sync/collections/${collectionId}`, { method: 'DELETE' });
  }

  syncCandidates(collectionId, candidates) {
    return cloudAccountRepository.request(`/sync/collections/${collectionId}/candidates`, {
      method: 'PUT', body: JSON.stringify({ candidates }),
    });
  }

  shareCollection(collectionId) {
    return cloudAccountRepository.request(`/sync/collections/${collectionId}/share`, { method: 'POST' });
  }

  uploadPhoto(collectionId, photo) {
    const body = new FormData();
    body.append('source_id', photo.id);
    body.append('metadata', JSON.stringify(this.photoMetadata(photo)));
    body.append('file', photo.file, photo.file?.name || 'photograph.bin');
    return cloudAccountRepository.request(`/sync/collections/${collectionId}/photos`, { method: 'POST', body });
  }

  updatePhotoMetadata(collectionId, photo) {
    return cloudAccountRepository.request(`/sync/collections/${collectionId}/photos`, {
      method: 'PATCH',
      body: JSON.stringify({ source_id: photo.id, metadata: this.photoMetadata(photo) }),
    });
  }

  photoMetadata(photo) {
    return {
      width: photo.width, height: photo.height, exif: photo.exif, places: photo.places,
      place: photo.place, placeEdited: Boolean(photo.placeEdited),
      placeEditedByService: photo.placeEditedByService || {}, placeService: photo.placeService || '',
      locationSource: photo.locationSource || '', cropX: photo.cropX, cropY: photo.cropY,
      cropMode: photo.cropMode, fileName: photo.file?.name || '',
      lastModified: photo.file?.lastModified || 0, createdAt: photo.createdAt || Date.now(),
    };
  }
}

export const cloudSyncRepository = new CloudSyncRepository();
