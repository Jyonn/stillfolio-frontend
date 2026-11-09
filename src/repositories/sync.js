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

  revokeShare(collectionId) {
    return cloudAccountRepository.request(`/sync/collections/${collectionId}/share`, { method: 'DELETE' });
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
