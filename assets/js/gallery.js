(() => {
  'use strict';

  // A future backend can set window.COGNIZANCE_GALLERY_PHOTOS before this deferred script.
  // This preview uses only local photos; it does not connect to a backend.
  // Photo cards intentionally show no category labels or captions.
  const fallbackPhotoItems = [
    {
      src: 'assets/images/photos/fest-stage-photo.jpg',
      alt: 'Performers in white clothing hold microphones on a stage beneath a Cognizance ’25 backdrop.',
      width: 1024,
      height: 682
    },
    {
      src: 'assets/images/photos/fest-campus-photo.jpg',
      alt: 'Rows of red chairs beneath a decorated thatched pavilion at Mahlara Campus, Mavoor.',
      width: 1024,
      height: 682
    },
    {
      src: 'assets/images/photos/28a36a459404da25df3ae0f9_IMG-20251004-WA0081.jpg',
      alt: 'Young performers holding frame drums onstage beneath a Cognizance ’25 backdrop.',
      width: 2560,
      height: 1706
    },
    {
      src: 'assets/images/photos/94e13c19523b14bd77d13f40_IMG-20251004-WA0071.jpg',
      alt: 'Performers dance with long ribbons on a blue-lit Cognizance ’25 stage.',
      width: 2560,
      height: 1706
    }
  ];
  const configuredPhotoItems = window.COGNIZANCE_GALLERY_PHOTOS;
  const photoItems = Array.isArray(configuredPhotoItems)
    ? configuredPhotoItems.filter(item => item && typeof item.src === 'string' && item.src.trim())
    : fallbackPhotoItems;

  function initGalleryCarousel(items) {
    const carousel = document.querySelector('.gallery-carousel');
    if (!carousel) return;
    if (!items.length) {
      carousel.hidden = true;
      return;
    }

    const track = carousel.querySelector('.gallery-track');
    const previous = carousel.querySelector('#gallery-prev');
    const next = carousel.querySelector('#gallery-next');
    const status = carousel.querySelector('#gallery-status');
    const ribbonTrack = document.querySelector('.criss-ribbon--red .criss-ribbon__track');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fallbackGlideDuration = 22000;
    const cycleStart = items.length;
    const cycleEnd = items.length * 2;
    let positions = [];
    let cycleDistance = 0;
    let pixelsPerSecond = 0;
    let index = 0;
    let virtualIndex = cycleStart;
    let animationFrame = 0;
    let lastFrameTime = 0;
    let motionPosition = 0;
    let settleTimer = 0;
    let hovered = false;
    let focused = false;
    let userInteracting = false;
    let pointerActive = false;
    let touchActive = false;
    let inView = !('IntersectionObserver' in window);
    let initialized = false;

    function measureRibbonSpeed() {
      if (ribbonTrack) {
        const durationValue = getComputedStyle(ribbonTrack).animationDuration.split(',')[0].trim();
        const durationMatch = durationValue.match(/^([\d.]+)(ms|s)$/);
        const durationSeconds = durationMatch
          ? Number(durationMatch[1]) / (durationMatch[2] === 'ms' ? 1000 : 1)
          : 0;
        // The top ribbon moves half of its duplicated track each animation cycle.
        const ribbonTravelDistance = ribbonTrack.scrollWidth / 2;
        pixelsPerSecond = durationSeconds > 0 ? ribbonTravelDistance / durationSeconds : 0;
      }
      if (!pixelsPerSecond && cycleDistance > 0) {
        pixelsPerSecond = (cycleDistance / items.length) / (fallbackGlideDuration / 1000);
      }
    }

    // Render three copies and start in the middle one. The outer copies are inert,
    // so the visual strip can loop seamlessly without duplicate screen-reader slides.
    const renderedItems = items.length > 1
      ? [0, 1, 2].flatMap(cycle => items.map((item, itemIndex) => ({
        ...item,
        isLoopClone: cycle !== 1,
        logicalIndex: itemIndex
      })))
      : items.map((item, itemIndex) => ({ ...item, isLoopClone: false, logicalIndex: itemIndex }));
    const fragment = document.createDocumentFragment();
    renderedItems.forEach(item => {
      const card = document.createElement('div');
      card.className = `gallery-photo${item.isLoopClone ? ' gallery-photo--loop-clone' : ''}`;
      if (item.isLoopClone) {
        card.setAttribute('aria-hidden', 'true');
        card.inert = true;
      } else {
        card.setAttribute('role', 'group');
        card.setAttribute('aria-roledescription', 'slide');
        card.setAttribute('aria-label', `${item.logicalIndex + 1} of ${items.length}`);
      }
      const image = document.createElement('img');
      image.src = item.src;
      image.alt = item.isLoopClone ? '' : (item.alt || '');
      image.width = item.width || 1024;
      image.height = item.height || 682;
      image.loading = 'eager';
      image.decoding = 'async';
      card.append(image);
      fragment.append(card);
    });
    track.replaceChildren(fragment);
    carousel.dataset.photoCount = String(items.length);
    const cards = [...track.children];
    const hasSteps = () => items.length > 1 && cycleDistance > 0;

    if (motion.matches) {
      status.textContent = 'Automatic movement is off because reduced motion is enabled.';
    }

    function clearSettleTimer() {
      window.clearTimeout(settleTimer);
      settleTimer = 0;
    }

    function stopGliding() {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      lastFrameTime = 0;
    }

    function updateControls() {
      const canMove = hasSteps();
      previous.disabled = !canMove;
      next.disabled = !canMove;
    }

    function nearestPositionIndex() {
      if (!positions.length) return 0;
      let nearest = 0;
      positions.forEach((position, positionIndex) => {
        if (Math.abs(position - track.scrollLeft) < Math.abs(positions[nearest] - track.scrollLeft)) {
          nearest = positionIndex;
        }
      });
      return nearest;
    }

    function normalizeLoopPosition() {
      if (!hasSteps() || positions.length <= cycleEnd) return;
      let left = track.scrollLeft;
      const start = positions[cycleStart];
      const end = positions[cycleEnd];
      while (left >= end) left -= cycleDistance;
      while (left < start) left += cycleDistance;
      if (Math.abs(left - track.scrollLeft) > 0.5) {
        track.scrollTo({ left, behavior: 'instant' });
      }
    }

    function syncPosition() {
      normalizeLoopPosition();
      const nearest = nearestPositionIndex();
      virtualIndex = nearest;
      index = items.length > 1 ? nearest % items.length : 0;
      updateControls();
    }

    function canAutoplay() {
      return !motion.matches && !hovered && !focused && !userInteracting &&
        inView && !document.hidden && hasSteps();
    }

    function glide(timestamp) {
      if (!canAutoplay()) {
        stopGliding();
        return;
      }
      if (lastFrameTime) {
        const elapsed = Math.min(timestamp - lastFrameTime, 48);
        motionPosition += pixelsPerSecond * elapsed / 1000;
        const loopStart = positions[cycleStart];
        const loopEnd = positions[cycleEnd];
        while (motionPosition >= loopEnd) motionPosition -= cycleDistance;
        while (motionPosition < loopStart) motionPosition += cycleDistance;
        track.scrollLeft = motionPosition;
        syncPosition();
      }
      lastFrameTime = timestamp;
      animationFrame = window.requestAnimationFrame(glide);
    }

    function schedule() {
      if (!canAutoplay()) {
        stopGliding();
        return;
      }
      if (!animationFrame) {
        motionPosition = track.scrollLeft;
        lastFrameTime = 0;
        animationFrame = window.requestAnimationFrame(glide);
      }
    }

    function settleInteraction() {
      clearSettleTimer();
      settleTimer = window.setTimeout(() => {
        settleTimer = 0;
        if (pointerActive || touchActive) return;
        userInteracting = false;
        syncPosition();
        schedule();
      }, 220);
    }

    function goToVirtual(targetVirtual, announce = true) {
      if (!positions.length) return;
      stopGliding();
      if (targetVirtual < 0) targetVirtual += items.length;
      if (targetVirtual >= positions.length) targetVirtual -= items.length;
      targetVirtual = Math.max(0, Math.min(targetVirtual, positions.length - 1));
      virtualIndex = targetVirtual;
      index = items.length > 1 ? targetVirtual % items.length : 0;
      const targetLeft = positions[targetVirtual];
      track.scrollTo({ left: targetLeft, behavior: motion.matches ? 'instant' : 'smooth' });
      updateControls();
      if (announce) status.textContent = `Photo position ${index + 1} of ${items.length}.`;
      if (Math.abs(track.scrollLeft - targetLeft) < 1) {
        syncPosition();
        schedule();
      }
    }

    function navigate(direction) {
      if (!hasSteps()) return;
      const current = nearestPositionIndex();
      goToVirtual(current + direction);
    }

    function goToLogical(target) {
      if (!hasSteps()) return;
      const logicalTarget = (target + items.length) % items.length;
      const candidates = positions.map((_, positionIndex) => positionIndex)
        .filter(positionIndex => positionIndex % items.length === logicalTarget);
      const targetVirtual = candidates.reduce((best, candidate) =>
        Math.abs(positions[candidate] - track.scrollLeft) < Math.abs(positions[best] - track.scrollLeft)
          ? candidate
          : best, candidates[0]);
      goToVirtual(targetVirtual);
    }

    previous.addEventListener('click', () => navigate(-1));
    next.addEventListener('click', () => navigate(1));

    carousel.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        navigate(event.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        goToLogical(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        goToLogical(items.length - 1);
      }
    });
    carousel.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      hovered = true;
      stopGliding();
    });
    carousel.addEventListener('pointerleave', () => {
      hovered = false;
      schedule();
    });
    carousel.addEventListener('focusin', () => {
      focused = true;
      stopGliding();
    });
    carousel.addEventListener('focusout', event => {
      focused = carousel.contains(event.relatedTarget);
      schedule();
    });
    carousel.addEventListener('pointerdown', event => {
      pointerActive = true;
      if (event.pointerType === 'touch') {
        touchActive = true;
        hovered = false;
      }
      userInteracting = true;
      clearSettleTimer();
      stopGliding();
    }, { passive: true });
    carousel.addEventListener('pointerup', () => {
      pointerActive = false;
      settleInteraction();
    }, { passive: true });
    carousel.addEventListener('pointercancel', () => {
      pointerActive = false;
      settleInteraction();
    }, { passive: true });
    carousel.addEventListener('touchstart', () => {
      touchActive = true;
      hovered = false;
      userInteracting = true;
      clearSettleTimer();
      stopGliding();
    }, { passive: true });
    carousel.addEventListener('touchend', () => {
      touchActive = false;
      pointerActive = false;
      settleInteraction();
    }, { passive: true });
    carousel.addEventListener('touchcancel', () => {
      touchActive = false;
      pointerActive = false;
      settleInteraction();
    }, { passive: true });
    track.addEventListener('scroll', () => {
      if (animationFrame) return;
      userInteracting = true;
      stopGliding();
      if (!pointerActive) settleInteraction();
    }, { passive: true });
    document.addEventListener('visibilitychange', schedule);
    motion.addEventListener('change', () => {
      stopGliding();
      measureRibbonSpeed();
      if (motion.matches && positions.length) {
        track.scrollTo({ left: positions[virtualIndex], behavior: 'instant' });
        status.textContent = 'Automatic movement is off because reduced motion is enabled.';
      } else {
        status.textContent = 'Automatic movement is on.';
      }
      updateControls();
      schedule();
    });

    function measure() {
      const origin = track.getBoundingClientRect().left;
      positions = cards.map(card => card.getBoundingClientRect().left - origin + track.scrollLeft);
      cycleDistance = items.length > 1 && positions.length > cycleEnd
        ? positions[cycleEnd] - positions[cycleStart]
        : 0;
      measureRibbonSpeed();
      if (!positions.length) positions = [0];

      if (!initialized) {
        const initialPosition = items.length > 1 ? positions[cycleStart] : positions[0];
        track.scrollTo({ left: initialPosition, behavior: 'instant' });
        initialized = true;
      } else if (items.length > 1 && cycleDistance > 0) {
        track.scrollTo({ left: positions[cycleStart + index], behavior: 'instant' });
      }
      syncPosition();
      updateControls();
      schedule();
    }

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        inView = entries[0].isIntersecting;
        schedule();
      }, { threshold: 0.25 });
      observer.observe(track);
    }
    if ('ResizeObserver' in window) {
      new ResizeObserver(measure).observe(track);
      if (ribbonTrack) new ResizeObserver(measureRibbonSpeed).observe(ribbonTrack);
    } else {
      window.addEventListener('resize', measure);
    }
    measure();
  }

  initGalleryCarousel(photoItems);
})();
