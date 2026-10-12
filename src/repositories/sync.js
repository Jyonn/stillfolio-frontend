import { cloudAccountRepository } from './cloud.js';
import { debugLog, debugFile, debugError } from '../debug-log.js';

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
      body: JSON.stringify({ client_id: collection.id, name: collection.name, description: collection.description || '', display_settings: collection.settings }),
    });
  }

  updateCollection(collection) {
    return cloudAccountRepository.request(`/sync/collections/${collection.cloudId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: collection.name, description: collection.description || '', display_settings: collection.settings }),
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

  async uploadPhoto(collectionId, photo) {
    debugLog('上传文件检查', {sourceIdPresent: Boolean(photo.id), ...debugFile(photo.file)});
    let timer;
    try {
      const bytes = await Promise.race([
        photo.file.slice(0, 1).arrayBuffer(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('文件读取探针超过3秒')), 3000); }),
      ]);
      debugLog('上传文件可读', {probeBytes: bytes.byteLength});
    } catch (error) { debugLog('上传文件读取异常', debugError(error)); }
    finally { clearTimeout(timer); }
    try {
    const body = new FormData();
    body.append('source_id', photo.id);
    body.append('metadata', JSON.stringify(this.photoMetadata(photo)));
    body.append('file', photo.file, photo.file?.name || 'photograph.bin');
    debugLog('FormData 文件检查', {sourceIdPresent: Boolean(body.get('source_id')), metadataLength: String(body.get('metadata')).length, ...debugFile(body.get('file'))});
    return cloudAccountRepository.request(`/sync/collections/${collectionId}/photos`, { method: 'POST', body });
    } catch (error) { debugLog('构造上传表单失败', debugError(error)); throw error; }
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
