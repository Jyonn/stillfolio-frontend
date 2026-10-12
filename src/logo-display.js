import QRCode from 'qrcode';

const codes = new Map();
export function shareQrUrl(path) { return codes.get(path)?.url || ''; }
export async function prepareShareQr(path) {
  if (!path) return '';
  if (!codes.has(path)) {
    const entry = {};
    entry.promise = QRCode.toDataURL(new URL(path, location.origin).href, {
      width: 256, margin: 2, errorCorrectionLevel: 'M',
      color: { dark: '#201f1b', light: '#f5f3ed' },
    }).then(url => (entry.url = url)).catch(error => { codes.delete(path); throw error; });
    codes.set(path, entry);
  }
  return codes.get(path).promise;
}
export function logoMarkup(logoUrl, qrUrl = '') {
  return qrUrl
    ? `<span class="logo-with-share"><img class="slot-logo" src="${logoUrl}" alt="LOGO"><img class="slot-share-qr" src="${qrUrl}" alt="作品集分享二维码"></span>`
    : `<img class="slot-logo" src="${logoUrl}" alt="LOGO">`;
}
