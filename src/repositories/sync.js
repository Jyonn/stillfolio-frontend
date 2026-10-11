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

  uploadPhoto(collectionId, photo) {
    const body = new FormData();
    body.append('source_id', photo.id);
    body.append('metadata', JSON.stringify({
      width: photo.width, height: photo.height, exif: photo.exif, places: photo.places,
      place: photo.place, cropX: photo.cropX, cropY: photo.cropY, cropMode: photo.cropMode,
      fileName: photo.file?.name || '', lastModified: photo.file?.lastModified || 0,
      createdAt: photo.createdAt || Date.now(),
    }));
    body.append('file', photo.file, photo.file?.name || 'photograph.bin');
    return cloudAccountRepository.request(`/sync/collections/${collectionId}/photos`, { method: 'POST', body });
  }
}

export const cloudSyncRepository = new CloudSyncRepository();
