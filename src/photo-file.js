export async function independentPhotoFile(source, timeout = 30000) {
  let timer;
  try {
    if (!(source instanceof Blob) || !source.size) throw new Error('图片文件为空');
    const bytes = await Promise.race([
      source.arrayBuffer(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('图片读取超时')), timeout); }),
    ]);
    if (bytes.byteLength !== source.size) throw new Error('图片数据不完整');
    // Copy bytes, not the original File/Blob reference retained by Safari.
    return new File([bytes], source.name || 'photograph.bin', {
      type: source.type || 'application/octet-stream',
      lastModified: source.lastModified ?? Date.now(),
    });
  } catch (cause) {
    const error = new Error('无法读取照片数据，请重新选择原照片');
    error.name = 'PhotoReadError';
    error.cause = cause;
    throw error;
  } finally { clearTimeout(timer); }
}
