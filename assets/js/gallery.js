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
  async function bootstrapGallery() {
    let items = fallbackPhotoItems;

    if (Array.isArray(window.COGNIZANCE_GALLERY_PHOTOS) && window.COGNIZANCE_GALLERY_PHOTOS.length > 0) {
      items = window.COGNIZANCE_GALLERY_PHOTOS.filter(item => item && typeof item.src === 'string' && item.src.trim());
    } else if (window.CognizanceAPI && window.CognizanceAPI.isSupabaseConfigured()) {
      try {
        const livePhotos = await window.CognizanceAPI.fetchGalleryPhotos();
        if (Array.isArray(livePhotos) && livePhotos.length > 0) {
          items = livePhotos.map(p => ({
            src: p.image_url,
            alt: p.alt_text || '',
            width: p.width || 1024,
            height: p.height || 682
          }));
        }
      } catch (err) {
        console.warn('[Cognizance Gallery] Could not load live photos, falling back to defaults:', err);
      }
    }

    initGalleryCarousel(items);
  }

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
    let focused = false;
    let userInteracting = false;
    let pointerActive = false;
    let touchActive = false;
    let isPointerDown = false;
    let pointerStartX = 0;
    let pointerStartScroll = 0;
    let isDragging = false;
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

    function isKeyboardFocused() {
      if (!focused) return false;
      const active = document.activeElement;
      if (!active || !carousel.contains(active)) return false;
      try {
        return active.matches(':focus-visible');
      } catch (_) {
        return false;
      }
    }

    function canAutoplay() {
      return !motion.matches && !isKeyboardFocused() && !userInteracting &&
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

    carousel.addEventListener('focusin', event => {
      if (isPointerDown || pointerActive || touchActive) return;
      try {
        if (event.target && event.target.matches && !event.target.matches(':focus-visible')) {
          return;
        }
      } catch (_) {}
      focused = true;
      stopGliding();
    });

    carousel.addEventListener('focusout', event => {
      focused = carousel.contains(event.relatedTarget);
      schedule();
    });

    function handlePress(event) {
      if (event && event.button !== undefined && event.button !== 0) return;

      isPointerDown = true;
      pointerActive = true;
      touchActive = event ? event.pointerType === 'touch' : false;
      userInteracting = true;
      isDragging = false;
      pointerStartX = (event && typeof event.clientX === 'number') ? event.clientX : 0;
      pointerStartScroll = track.scrollLeft;

      clearSettleTimer();
      stopGliding();

      if (event && event.pointerType === 'mouse' && event.pointerId !== undefined) {
        try {
          track.setPointerCapture(event.pointerId);
        } catch (_) {}
      }
    }

    function handleRelease(event) {
      if (!isPointerDown && !pointerActive && !touchActive && !userInteracting) return;

      if (event && event.pointerType === 'mouse' && event.pointerId !== undefined) {
        try {
          if (track.hasPointerCapture && track.hasPointerCapture(event.pointerId)) {
            track.releasePointerCapture(event.pointerId);
          }
        } catch (_) {}
      }

      isPointerDown = false;
      pointerActive = false;
      touchActive = false;
      isDragging = false;
      userInteracting = false;
      focused = false;
      clearSettleTimer();
      stopGliding();

      // If track was focused due to mouse/touch interaction rather than keyboard tab, blur it
      if (document.activeElement === track) {
        try {
          if (!track.matches || !track.matches(':focus-visible')) {
            track.blur();
          }
        } catch (_) {
          track.blur();
        }
      }

      // Immediately sync to the exact current position and start motion without delay
      normalizeLoopPosition();
      motionPosition = track.scrollLeft;
      syncPosition();
      schedule();
    }

    // Touch & pointer interaction: stop immediately on touch/click
    carousel.addEventListener('pointerdown', handlePress, { passive: true });
    carousel.addEventListener('touchstart', handlePress, { passive: true });

    // Desktop mouse drag support
    carousel.addEventListener('pointermove', event => {
      if (!isPointerDown) return;
      if (event.pointerType === 'mouse') {
        const dx = event.clientX - pointerStartX;
        if (Math.abs(dx) > 2) {
          isDragging = true;
        }
        if (isDragging) {
          track.scrollLeft = pointerStartScroll - dx;
          motionPosition = track.scrollLeft;
        }
      }
    }, { passive: true });

    // Release triggers immediately on window so releasing outside carousel is never lost
    window.addEventListener('pointerup', handleRelease, { passive: true });
    window.addEventListener('pointercancel', handleRelease, { passive: true });
    window.addEventListener('touchend', handleRelease, { passive: true });
    window.addEventListener('touchcancel', handleRelease, { passive: true });
    window.addEventListener('blur', handleRelease);

    // Distinguish programmatic glide scroll from genuine user swipe/touchpad scroll
    track.addEventListener('scroll', () => {
      if (isGlidingScroll) {
        isGlidingScroll = false;
        return;
      }

      // If user is currently touching or holding the mouse down, keep motion stopped
      if (isPointerDown || pointerActive || touchActive) {
        userInteracting = true;
        stopGliding();
        clearSettleTimer();
        return;
      }

      // Standalone scroll (trackpad gesture, mouse wheel, or mobile inertial coasting)
      motionPosition = track.scrollLeft;
      clearSettleTimer();

      // Short debounce (60ms) after inertia/trackpad stops to immediately resume smooth glide
      scrollEndTimer = window.setTimeout(() => {
        if (isPointerDown || pointerActive || touchActive) return;
        normalizeLoopPosition();
        motionPosition = track.scrollLeft;
        syncPosition();
        userInteracting = false;
        schedule();
      }, 60);
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopGliding();
      } else {
        handleRelease();
      }
    });

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

  bootstrapGallery();
})();
