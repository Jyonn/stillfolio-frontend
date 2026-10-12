const KEY = 'stillfolio-cloud-mutations-v1';

function read() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function write(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export const cloudMutationQueue = {
  list(ownerId) {
    return read().filter(item => String(item.ownerId) === String(ownerId));
  },
  has(ownerId, key) {
    return this.list(ownerId).some(item => item.key === key);
  },
  put(ownerId, key, type, payload) {
    const items = read();
    const next = { ownerId: String(ownerId), key, type, payload, updatedAt: Date.now() };
    const index = items.findIndex(item => String(item.ownerId) === String(ownerId) && item.key === key);
    if (index >= 0) items[index] = next;
    else items.push(next);
    write(items);
    return next;
  },
  remove(ownerId, key, expectedUpdatedAt = null) {
    write(read().filter(item => {
      const matches = String(item.ownerId) === String(ownerId) && item.key === key;
      if (!matches) return true;
      return expectedUpdatedAt != null && item.updatedAt !== expectedUpdatedAt;
    }));
  },
};
