export function createWindowedCarousel({
  track,
  activeSlide,
  getItems,
  getCurrent,
  renderSlide,
  layoutSlides,
  commit,
  maxSlides = 9,
  duration = 340,
}) {
  let animating = false;
  let swipe = null;
  let suppressClickUntil = 0;
  let transitionRevision = 0;

  const windowIndices = () => {
    const items = getItems();
    const current = getCurrent();
    const count = Math.min(maxSlides, items.length);
    const start = Math.max(0, Math.min(current - Math.floor(count / 2), items.length - count));
    return Array.from({ length: count }, (_, offset) => start + offset);
  };

  function render() {
    const items = getItems();
    const current = getCurrent();
    const indices = windowIndices();
    const fragment = document.createDocumentFragment();
    const revision = ++transitionRevision;
    track.classList.add('no-transition');
    for (const index of indices) {
      if (index === current) {
        activeSlide.dataset.index = String(index);
        fragment.append(activeSlide);
      } else {
        fragment.append(renderSlide(items[index], index, items.length));
      }
    }
    track.replaceChildren(fragment);
    layoutSlides();
    track.style.transform = `translate3d(${-indices.indexOf(current) * 100}%, 0, 0)`;
    // Commit the rebased DOM and transform while transitions are disabled.
    // Without this forced layout, browsers can animate from the pre-rebase
    // transform and produce a brief reverse slide after a successful switch.
    void track.offsetWidth;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (revision === transitionRevision) track.classList.remove('no-transition');
    }));
  }

  function go(index) {
    const items = getItems();
    if (!items.length || animating) return;
    const current = getCurrent();
    const target = (index + items.length) % items.length;
    if (target === current) return;
    const slides = [...track.children];
    const slot = slides.findIndex(slide => Number(slide.dataset.index) === target);
    if (slot < 0) {
      commit(target, false);
      return;
    }
    animating = true;
    transitionRevision += 1;
    track.classList.remove('no-transition');
    track.style.transform = `translate3d(${-slot * 100}%, 0, 0)`;
    setTimeout(() => {
      animating = false;
      commit(target, true);
    }, duration + 20);
  }

  function bindSwipe(surfaces, shouldIgnore) {
    const begin = event => {
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      if (shouldIgnore?.(event)) return;
      swipe = { id: event.pointerId, x: event.clientX };
    };
    surfaces.forEach(surface => surface.addEventListener('pointerdown', begin));
    window.addEventListener('pointerup', event => {
      if (!swipe || swipe.id !== event.pointerId) return;
      const distance = event.clientX - swipe.x;
      swipe = null;
      if (Math.abs(distance) < 28) return;
      suppressClickUntil = performance.now() + 450;
      go(getCurrent() + (distance < 0 ? 1 : -1));
    });
    window.addEventListener('pointercancel', event => {
      if (swipe?.id === event.pointerId) swipe = null;
    });
  }

  function reset() {
    animating = false;
    transitionRevision += 1;
    activeSlide.dataset.index = '';
    track.replaceChildren(activeSlide);
    track.classList.add('no-transition');
    track.style.transform = 'translate3d(0, 0, 0)';
  }

  return {
    render,
    go,
    reset,
    bindSwipe,
    suppressesClick: () => performance.now() < suppressClickUntil,
  };
}
