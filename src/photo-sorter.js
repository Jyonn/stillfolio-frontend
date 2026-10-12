import './photo-sorter.css';
import {photoThemeColor, sortByCoordinates, sortByTime, sortMultidimensional} from './photo-order.js';

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));

export function createPhotoSorter({trigger, getPhotos, getCollection, commit}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'photo-sorter';
  dialog.setAttribute('aria-labelledby', 'photo-sorter-title');
  dialog.innerHTML = `<header class="sorter-heading"><div><h2 id="photo-sorter-title">照片排序</h2><p class="sorter-collection"></p></div><button class="sorter-close" type="button" aria-label="取消排序">×</button></header>
    <div class="sorter-tools" aria-label="自动排序"><button type="button" data-sort="time">时间 ↑</button><button type="button" data-sort="color">色系</button><button type="button" data-sort="coordinates">坐标</button><button type="button" data-sort="reverse" aria-label="反转照片顺序">反转</button></div>
    <p class="sorter-status" role="status" aria-live="polite">拖动照片下方手柄调整顺序，保存后生效。</p>
    <div class="sorter-scroll"><div class="sorter-grid" role="list" aria-label="照片顺序"></div></div>
    <footer class="sorter-footer"><span class="sorter-count"></span><button class="sorter-save" type="button">保存顺序</button></footer>`;
  document.body.append(dialog);
  const grid = dialog.querySelector('.sorter-grid');
  const scroll = dialog.querySelector('.sorter-scroll');
  const status = dialog.querySelector('.sorter-status');
  const save = dialog.querySelector('.sorter-save');
  let draft = [], colors = {}, collectionId = '', revision = 0, busy = false, descending = false;
  let drag = null, ghost = null, scrollFrame = 0;

  function render() {
    grid.innerHTML = draft.map((photo, index) => `<div class="sorter-photo" role="listitem" data-photo-id="${escape(photo.id)}">
      <img src="${escape(photo.url)}" alt="${escape(photo.file?.name || '照片')}" loading="lazy" decoding="async" draggable="false">
      <button type="button" class="sorter-handle" aria-label="第 ${index + 1} 张，拖动调整顺序，或用方向键移动" title="拖动调整顺序 · 方向键移动">
        <span>${String(index + 1).padStart(2, '0')}</span>${Array.isArray(colors[photo.id]) ? `<i style="background:rgb(${colors[photo.id].join(',')})" aria-label="主题色"></i>` : ''}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3h.01M11 3h.01M5 8h.01M11 8h.01M5 13h.01M11 13h.01"/></svg>
      </button></div>`).join('');
    dialog.querySelector('.sorter-count').textContent = `${draft.length} 张照片`;
  }

  function setBusy(value) {
    busy = value;
    save.disabled = value;
    dialog.querySelectorAll('[data-sort]').forEach(button => { button.disabled = value; });
    grid.classList.toggle('sorter-busy', value);
    grid.setAttribute('aria-busy', String(value));
  }

  function endDrag() {
    cancelAnimationFrame(scrollFrame);
    ghost?.remove(); ghost = null;
    grid.querySelector('.sorter-dragging')?.classList.remove('sorter-dragging');
    if (drag && grid.hasPointerCapture(drag.pointerId)) grid.releasePointerCapture(drag.pointerId);
    drag = null;
  }

  function move(from, to) {
    if (from === to || from < 0 || to < 0 || to >= draft.length) return;
    const [photo] = draft.splice(from, 1);
    draft.splice(to, 0, photo);
    render();
    status.textContent = `已移动到第 ${to + 1} 张，保存后生效。`;
  }

  function updateDrag() {
    if (!drag?.moving) return;
    ghost.style.transform = `translate3d(${drag.x - drag.offsetX}px,${drag.y - drag.offsetY}px,0)`;
    const target = document.elementFromPoint(drag.x, drag.y)?.closest('.sorter-photo');
    const index = draft.findIndex(photo => photo.id === drag.id);
    const targetIndex = target ? draft.findIndex(photo => photo.id === target.dataset.photoId) : -1;
    if (targetIndex >= 0 && index !== targetIndex) move(index, targetIndex);
    grid.querySelector(`[data-photo-id="${CSS.escape(drag.id)}"]`)?.classList.add('sorter-dragging');
  }

  grid.addEventListener('pointerdown', event => {
    if (busy || !event.isPrimary || event.button !== 0) return;
    if (event.pointerType !== 'mouse' && !event.target.closest('.sorter-handle')) return;
    const card = event.target.closest('.sorter-photo');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    drag = {pointerId: event.pointerId, id: card.dataset.photoId, startX: event.clientX, startY: event.clientY,
      x: event.clientX, y: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, rect, moving: false};
    grid.setPointerCapture(event.pointerId);
  });
  grid.addEventListener('pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.moving && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 5) {
      drag.moving = true;
      ghost = grid.querySelector(`[data-photo-id="${CSS.escape(drag.id)}"]`).cloneNode(true);
      ghost.classList.add('sorter-ghost');
      ghost.style.width = `${drag.rect.width}px`;
      ghost.setAttribute('aria-hidden', 'true');
      dialog.append(ghost);
      const autoScroll = () => {
        if (!drag?.moving) return;
        const rect = scroll.getBoundingClientRect();
        const speed = drag.y < rect.top + 48 ? -10 : drag.y > rect.bottom - 48 ? 10 : 0;
        if (speed) { scroll.scrollTop += speed; updateDrag(); }
        scrollFrame = requestAnimationFrame(autoScroll);
      };
      scrollFrame = requestAnimationFrame(autoScroll);
    }
    updateDrag();
  });
  grid.addEventListener('pointerup', endDrag);
  grid.addEventListener('pointercancel', endDrag);
  grid.addEventListener('lostpointercapture', endDrag);
  grid.addEventListener('keydown', event => {
    if (busy || !event.target.closest('.sorter-handle')) return;
    const offset = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4}[event.key];
    if (!offset) return;
    event.preventDefault();
    const id = event.target.closest('.sorter-photo').dataset.photoId;
    const from = draft.findIndex(photo => photo.id === id);
    move(from, from + offset);
    grid.querySelector(`[data-photo-id="${CSS.escape(id)}"] .sorter-handle`)?.focus();
  });

  dialog.querySelector('.sorter-tools').addEventListener('click', async event => {
    const button = event.target.closest('[data-sort]');
    if (!button || busy) return;
    endDrag();
    const mode = button.dataset.sort;
    if (mode === 'time') {
      draft = sortByTime(draft, descending);
      status.textContent = `按拍摄时间${descending ? '从新到旧' : '从旧到新'}排序，缺少时间的照片排在末尾。`;
      descending = !descending;
      button.textContent = descending ? '时间 ↓' : '时间 ↑';
    } else if (mode === 'coordinates') {
      draft = sortByCoordinates(draft);
      status.textContent = '按相近地点排序，缺少完整坐标的照片排在末尾。';
    } else if (mode === 'reverse') {
      draft.reverse();
      status.textContent = '已反转照片顺序，保存后生效。';
    } else {
      const token = revision;
      setBusy(true);
      let failures = 0;
      for (let index = 0; index < draft.length; index++) {
        if (token !== revision || !dialog.open) return;
        status.textContent = `计算主题色 ${index + 1}/${draft.length}…`;
        const photo = draft[index];
        if (!Array.isArray(colors[photo.id])) {
          try {
            const rgb = await photoThemeColor(photo.url);
            if (rgb) colors[photo.id] = rgb;
            else failures++;
          }
          catch { failures++; }
        }
        // Allow UI/pointer events between images; do not decode the collection
        // in parallel on memory-constrained phones.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (token !== revision || !dialog.open) return;
      draft = sortMultidimensional(draft, photo => colors[photo.id], [[0, 255], [0, 255], [0, 255]]);
      setBusy(false);
      status.textContent = failures ? `${failures} 张无法读取主题色，已排在末尾。其他照片按色系排序。` : '已按相近色系排序，保存后生效。';
    }
    render();
  });

  function close() { revision++; endDrag(); dialog.close(); }
  dialog.querySelector('.sorter-close').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  save.addEventListener('click', () => {
    if (busy || getCollection()?.id !== collectionId) return;
    try { commit(draft.map(photo => photo.id), colors, collectionId); close(); }
    catch (error) { status.textContent = `保存失败：${error.message}`; }
  });
  trigger.addEventListener('click', () => {
    const collection = getCollection();
    draft = [...getPhotos()];
    if (!collection || !draft.length) return;
    collectionId = collection.id;
    colors = {...collection.photoColors};
    revision++; descending = false; setBusy(false);
    dialog.querySelector('[data-sort="time"]').textContent = '时间 ↑';
    dialog.querySelector('.sorter-collection').textContent = collection.name;
    status.textContent = '拖动照片下方手柄调整顺序，保存后生效。';
    render(); dialog.showModal(); scroll.scrollTop = 0;
  });
  return {isOpen: () => dialog.open};
}
