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
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cycleStart = items.length;
    const cycleEnd = items.length * 2;

    let positions = [];
    let cycleDistance = 0;
    // Balanced middle speed: lively & engaging, yet smooth and completely lag-free
    const defaultSpeed = window.innerWidth <= 768 ? 75 : 85;
    let pixelsPerSecond = typeof window.COGNIZANCE_GALLERY_SPEED === 'number'
      ? window.COGNIZANCE_GALLERY_SPEED
      : defaultSpeed;
    let index = 0;
    let virtualIndex = cycleStart;
    let animationFrame = 0;
    let lastFrameTime = 0;
    let motionPosition = 0;
    let settleTimer = 0;
    let scrollEndTimer = 0;
    let hovered = false;
    let focused = false;
    let userInteracting = false;
    let pointerActive = false;
    let touchActive = false;
    let inView = !('IntersectionObserver' in window);
    let initialized = false;
    let isGlidingScroll = false;
    let lastMeasuredWidth = 0;

    // Render three copies and start in the middle one. The outer copies are inert,
    // so the visual strip can loop seamlessly without duplicate screen-reader slides.
    const renderedItems = items.length > 1
      ? [0, 1, 2].flatMap(cycle => items.map((item, itemIndex) => ({
        ...item,
        isLoopClone: cycle !== 1,
        logicalIndex: itemIndex,
        isInitialInView: cycle === 1 && itemIndex < 2
      })))
      : items.map((item, itemIndex) => ({
        ...item,
        isLoopClone: false,
        logicalIndex: itemIndex,
        isInitialInView: true
      }));

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
      // Only eager-load images visible on first paint to conserve mobile VRAM & bandwidth
      image.loading = item.isInitialInView ? 'eager' : 'lazy';
      image.decoding = 'async';
      card.append(image);
      fragment.append(card);
    });
    track.replaceChildren(fragment);
    carousel.dataset.photoCount = String(items.length);
    const cards = [...track.children];
    const hasSteps = () => items.length > 1 && cycleDistance > 0;

    if (motion.matches && status) {
      status.textContent = 'Automatic movement is off because reduced motion is enabled.';
    }

    function clearSettleTimer() {
      if (settleTimer) {
        window.clearTimeout(settleTimer);
        settleTimer = 0;
      }
      if (scrollEndTimer) {
        window.clearTimeout(scrollEndTimer);
        scrollEndTimer = 0;
      }
    }

    function stopGliding() {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
      lastFrameTime = 0;
    }

    function updateControls() {
      const canMove = hasSteps();
      if (previous) previous.disabled = !canMove;
      if (next) next.disabled = !canMove;
    }

    function nearestPositionIndex() {
      if (!positions.length) return 0;
      const currentScroll = track.scrollLeft;
      let nearest = 0;
      let minDiff = Infinity;
      for (let i = 0; i < positions.length; i++) {
        const diff = Math.abs(positions[i] - currentScroll);
        if (diff < minDiff) {
          minDiff = diff;
          nearest = i;
        }
      }
      return nearest;
    }

    function normalizeLoopPosition() {
      if (!hasSteps() || positions.length <= cycleEnd) return;
      let left = track.scrollLeft;
      const start = positions[cycleStart];
      const end = positions[cycleEnd];
      if (left >= end) {
        while (left >= end) left -= cycleDistance;
        track.scrollTo({ left, behavior: 'instant' });
      } else if (left < start) {
        while (left < start) left += cycleDistance;
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

    // Hardware-composited smooth glide without layout thrashing
    function glide(timestamp) {
      if (!canAutoplay()) {
        stopGliding();
        return;
      }
      if (lastFrameTime) {
        const elapsed = Math.min(timestamp - lastFrameTime, 48);
        motionPosition += (pixelsPerSecond * elapsed) / 1000;

        const loopStart = positions[cycleStart];
        const loopEnd = positions[cycleEnd];
        if (motionPosition >= loopEnd) {
          motionPosition -= cycleDistance;
        } else if (motionPosition < loopStart) {
          motionPosition += cycleDistance;
        }

        // Set scroll position directly without reading layout back
        isGlidingScroll = true;
        track.scrollLeft = motionPosition;
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
      if (announce && status) {
        status.textContent = `Photo position ${index + 1} of ${items.length}.`;
      }

      clearSettleTimer();
      settleTimer = window.setTimeout(() => {
        syncPosition();
        motionPosition = track.scrollLeft;
        userInteracting = false;
        schedule();
      }, 700);
    }

    function navigate(direction) {
      if (!hasSteps()) return;
      userInteracting = true;
      stopGliding();
      clearSettleTimer();
      const current = nearestPositionIndex();
      goToVirtual(current + direction);
    }

    function goToLogical(target) {
      if (!hasSteps()) return;
      userInteracting = true;
      stopGliding();
      clearSettleTimer();
      const logicalTarget = (target + items.length) % items.length;
      const candidates = positions.map((_, posIdx) => posIdx)
        .filter(posIdx => posIdx % items.length === logicalTarget);
      const targetVirtual = candidates.reduce((best, candidate) =>
        Math.abs(positions[candidate] - track.scrollLeft) < Math.abs(positions[best] - track.scrollLeft)
          ? candidate
          : best, candidates[0]);
      goToVirtual(targetVirtual);
    }

    if (previous) previous.addEventListener('click', () => navigate(-1));
    if (next) next.addEventListener('click', () => navigate(1));

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

    // Handle touch & pointer events cleanly without hijacking browser scrolling
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
      touchActive = false;
    }, { passive: true });

    carousel.addEventListener('pointercancel', () => {
      pointerActive = false;
      touchActive = false;
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
    }, { passive: true });

    carousel.addEventListener('touchcancel', () => {
      touchActive = false;
      pointerActive = false;
    }, { passive: true });

    // Distinguish programmatic glide scroll from genuine user swipe/touchpad scroll
    track.addEventListener('scroll', () => {
      if (isGlidingScroll) {
        isGlidingScroll = false;
        return;
      }

      // Real user scroll (touch swipe, trackpad, mouse wheel, or scrollbar drag)
      userInteracting = true;
      stopGliding();
      clearSettleTimer();

      // Debounce scroll settle to let mobile inertia/momentum finish completely
      scrollEndTimer = window.setTimeout(() => {
        if (pointerActive || touchActive) return;
        normalizeLoopPosition();
        motionPosition = track.scrollLeft;
        syncPosition();
        userInteracting = false;
        schedule();
      }, 750);
    }, { passive: true });

    document.addEventListener('visibilitychange', schedule);

    motion.addEventListener('change', () => {
      stopGliding();
      if (motion.matches && positions.length) {
        track.scrollTo({ left: positions[virtualIndex], behavior: 'instant' });
        if (status) status.textContent = 'Automatic movement is off because reduced motion is enabled.';
      } else {
        if (status) status.textContent = 'Automatic movement is on.';
      }
      updateControls();
      schedule();
    });

    function measure() {
      const currentWidth = track.clientWidth;
      const widthChanged = Math.abs(currentWidth - lastMeasuredWidth) > 2;

      // Avoid jumping when only viewport height changes (e.g. mobile address bar show/hide)
      if (initialized && !widthChanged) return;
      lastMeasuredWidth = currentWidth;

      const origin = track.getBoundingClientRect().left;
      positions = cards.map(card => card.getBoundingClientRect().left - origin + track.scrollLeft);
      cycleDistance = items.length > 1 && positions.length > cycleEnd
        ? positions[cycleEnd] - positions[cycleStart]
        : 0;

      if (typeof window.COGNIZANCE_GALLERY_SPEED !== 'number') {
        pixelsPerSecond = window.innerWidth <= 768 ? 75 : 85;
      }

      if (!positions.length) positions = [0];

      if (!initialized) {
        const initialPosition = items.length > 1 ? positions[cycleStart] : positions[0];
        track.scrollTo({ left: initialPosition, behavior: 'instant' });
        motionPosition = initialPosition;
        initialized = true;
      } else if (items.length > 1 && cycleDistance > 0) {
        const targetPos = positions[cycleStart + index] || positions[cycleStart];
        track.scrollTo({ left: targetPos, behavior: 'instant' });
        motionPosition = targetPos;
      }

      syncPosition();
      updateControls();
      schedule();
    }

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        inView = entries[0].isIntersecting;
        schedule();
      }, { threshold: 0.15 });
      observer.observe(carousel);
    }

    if ('ResizeObserver' in window) {
      new ResizeObserver(measure).observe(track);
    } else {
      window.addEventListener('resize', measure);
    }

    measure();
  }

  initGalleryCarousel(photoItems);
})();
