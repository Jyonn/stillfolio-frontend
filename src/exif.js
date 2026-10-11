import exifr from 'exifr';

// exifr 7.1.3 rejects newer iPhone HEIC files whose FTYP box is 52+ bytes.
// Keep its brand validation, but read the real 32-bit box length without the old cap.
for (const format of ['heic', 'avif']) {
  const Parser = exifr.fileParsers.get(format);
  if (!Parser) continue;
  Parser.canHandle = function canHandleModernIsoBmff(file, firstTwoBytes) {
    if (firstTwoBytes !== 0 || file.byteLength < 16) return false;
    const ftypLength = Math.min(file.getUint32(0), file.byteLength);
    if (ftypLength < 16 || file.getString(4, 4) !== 'ftyp') return false;
    const brands = [file.getString(8, 4)];
    for (let offset = 16; offset + 4 <= ftypLength; offset += 4) brands.push(file.getString(offset, 4));
    return brands.includes(this.type);
  };
}

function dateValue(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = number => String(number).padStart(2, '0');
    return `${value.getFullYear()}:${pad(value.getMonth() + 1)}:${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
  return String(value);
}

export async function parseExif(file) {
  try {
    const data = await exifr.parse(file, {
      tiff: true, exif: true, gps: true,
      interop: false, ifd1: false, xmp: false, icc: false,
      iptc: false, jfif: false, reviveValues: true, translateValues: true,
      mergeOutput: true,
    });
    if (!data) return {};
    return {
      make: data.Make || '', model: data.Model || '', orientation: data.Orientation,
      modifiedAt: dateValue(data.ModifyDate || data.DateTime),
      exposure: data.ExposureTime, fNumber: data.FNumber, iso: data.ISO,
      takenAt: dateValue(data.DateTimeOriginal || data.CreateDate),
      exposureBias: data.ExposureCompensation ?? data.ExposureBiasValue,
      focalLength: data.FocalLength, focal35: data.FocalLengthIn35mmFormat,
      lens: data.LensModel || data.Lens || '',
      latitude: data.latitude, longitude: data.longitude,
    };
  } catch (error) {
    console.warn(`无法解析 ${file.name} 的 EXIF`, error);
    return {};
  }
}
