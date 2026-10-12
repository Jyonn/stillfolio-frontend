import './debug-log.css';

const KEY = 'stillfolio-debug-log-v1';
let lines = [];
try { lines = JSON.parse(sessionStorage.getItem(KEY) || '[]').filter(line => typeof line === 'string').slice(-300); } catch {}
let output;
let sequence = 0;
export function debugError(error) {
  const clean = value => String(value || '').replace(/https?:\/\/[^\s)]+/g, '[URL]').replace(/(?:Bearer\s+\S+|(?:key|token|password|secret)\s*[=:]\s*[^\s,;]+)/gi, '[已隐藏]').replace(/\b\d{6,}\b/g, '[数字已隐藏]').slice(0, 1000);
  return {type: error?.name || 'Error', message: clean(error?.message || error), stack: clean(error?.stack)};
}
export function debugFile(file) {
  const result = {};
  for (const [key, read] of Object.entries({kind: () => Object.prototype.toString.call(file), blob: () => file instanceof Blob, file: () => file instanceof File, bytes: () => file?.size, mime: () => file?.type, hasName: () => Boolean(file?.name), slice: () => typeof file?.slice})) {
    try { result[key] = read(); } catch (error) { result[key] = debugError(error).message; }
  }
  return result;
}
export function debugLog(event, details = {}) {
  // Callers supply only timings, counts, states and sanitized paths; never payloads.
  lines.push(`${new Date().toISOString()} ${event} ${JSON.stringify(details)}`);
  lines = lines.slice(-300);
  try { sessionStorage.setItem(KEY, JSON.stringify(lines)); } catch {}
  if (output) { output.value = report(); output.scrollTop = output.scrollHeight; }
}
export function debugId() { return ++sequence; }
function report() {
  return `StillFolio 调试日志\n页面: ${location.pathname}\n浏览器: ${navigator.userAgent}\n在线: ${navigator.onLine}  视口: ${innerWidth}×${innerHeight}\n\n${lines.join('\n')}`;
}

function mount() {
  const root = document.createElement('div');
  root.className = 'debug-tools';
  root.innerHTML = `<button class="debug-float" aria-label="打开同步调试日志" type="button">DEBUG</button>
    <section class="debug-panel" role="dialog" aria-label="同步调试日志" hidden>
      <header><strong>同步调试日志</strong><button type="button" data-debug-close aria-label="关闭日志">×</button></header>
      <p>记录请求和本地保存阶段，不包含密钥或照片内容。刷新后日志保留，最多 300 条。</p>
      <textarea readonly aria-label="可复制的调试日志" spellcheck="false"></textarea>
      <footer><button type="button" data-debug-clear>清空日志</button><button type="button" data-debug-inspect>检测图片缓存</button><button type="button" data-debug-copy>复制全部</button></footer>
      <span class="debug-copy-status" role="status"></span>
    </section>`;
  document.body.append(root);
  const button = root.querySelector('.debug-float');
  const panel = root.querySelector('.debug-panel');
  output = root.querySelector('textarea');
  const status = root.querySelector('.debug-copy-status');
  let drag, suppressClick = false;
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const rect = button.getBoundingClientRect();
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false};
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 5) drag.moved = true;
    if (!drag.moved) return;
    button.style.left = `${Math.max(4, Math.min(innerWidth - button.offsetWidth - 4, drag.left + dx))}px`;
    button.style.top = `${Math.max(4, Math.min(innerHeight - button.offsetHeight - 4, drag.top + dy))}px`;
    button.style.right = button.style.bottom = 'auto';
  });
  button.addEventListener('pointerup', () => { suppressClick = Boolean(drag?.moved); drag = null; });
  button.addEventListener('pointercancel', () => { drag = null; suppressClick = true; });
  button.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    panel.hidden = !panel.hidden;
    output.value = report();
    if (!panel.hidden) root.querySelector('[data-debug-close]').focus();
  });
  root.querySelector('[data-debug-close]').onclick = () => { panel.hidden = true; button.focus(); };
  root.querySelector('[data-debug-clear]').onclick = () => { lines = []; debugLog('日志已清空'); };
  root.querySelector('[data-debug-inspect]').onclick = async event => {
    const target = event.currentTarget;
    target.disabled = true;
    status.textContent = '正在只读检测当前作品集，请保持页面打开…';
    try {
      if (!window.stillfolioInspectPhotos) throw new Error('请在作品集编辑页运行检测');
      await window.stillfolioInspectPhotos();
      status.textContent = '检测完成，请复制全部日志';
    } catch (error) { debugLog('缓存检测异常', debugError(error)); status.textContent = '检测异常，请复制日志'; }
    finally { target.disabled = false; }
  };
  root.querySelector('[data-debug-copy]').onclick = async () => {
    try { await navigator.clipboard.writeText(report()); status.textContent = '已复制，可直接粘贴发送'; }
    catch { output.focus(); output.select(); status.textContent = '请长按已选中的日志，选择复制'; }
  };
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { panel.hidden = true; button.focus(); } });
  debugLog('页面启动');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true});
else mount();
window.addEventListener('unhandledrejection', event => debugLog('未处理异常', debugError(event.reason)));
window.addEventListener('error', event => { if (event.error) debugLog('脚本异常', {...debugError(event.error), line: event.lineno}); });
window.addEventListener('online', () => debugLog('网络恢复'));
window.addEventListener('offline', () => debugLog('网络断开'));
document.addEventListener('visibilitychange', () => debugLog('页面可见性', {state: document.visibilityState}));
