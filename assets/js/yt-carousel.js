/* =====================================================================
   COGNIZANCE — 3D Coverflow Video Carousel Controller
   Smooth 3D stacked coverflow navigation with interactive card selection,
   infinite wrap-around, responsive mobile touch gestures, and buttons
   ===================================================================== */
'use strict';

(function init3DCoverflow() {
  const stage = document.getElementById('yt-stage');
  const prevBtn = document.getElementById('yt-prev');
  const nextBtn = document.getElementById('yt-next');
  if (!stage) return;

  const cards = [...stage.querySelectorAll('.yt-card')];
  const totalCards = cards.length;
  if (totalCards === 0) return;

  let currentIndex = 0;
  let autoPlayTimer = null;
  const AUTO_PLAY_MS = 4500;

  const POSITION_CLASSES = [
    'is-center',
    'is-left-1',
    'is-right-1',
    'is-left-2',
    'is-right-2',
    'is-left-hidden',
    'is-right-hidden'
  ];

  function updateCoverflow() {
    cards.forEach((card, i) => {
      // Calculate shortest distance on circular loop
      let diff = (i - currentIndex) % totalCards;
      if (diff > totalCards / 2) diff -= totalCards;
      if (diff < -totalCards / 2) diff += totalCards;

      // Clean existing state classes
      card.classList.remove(...POSITION_CLASSES);

      // Assign position class based on step offset
      if (diff === 0) {
        card.classList.add('is-center');
        card.setAttribute('aria-hidden', 'false');
        card.setAttribute('tabindex', '0');
      } else if (diff === 1) {
        card.classList.add('is-right-1');
        card.setAttribute('aria-hidden', 'false');
        card.setAttribute('tabindex', '0');
      } else if (diff === 2) {
        card.classList.add('is-right-2');
        card.setAttribute('aria-hidden', 'false');
        card.setAttribute('tabindex', '-1');
      } else if (diff >= 3) {
        card.classList.add('is-right-hidden');
        card.setAttribute('aria-hidden', 'true');
        card.setAttribute('tabindex', '-1');
      } else if (diff === -1) {
        card.classList.add('is-left-1');
        card.setAttribute('aria-hidden', 'false');
        card.setAttribute('tabindex', '0');
      } else if (diff === -2) {
        card.classList.add('is-left-2');
        card.setAttribute('aria-hidden', 'false');
        card.setAttribute('tabindex', '-1');
      } else if (diff <= -3) {
        card.classList.add('is-left-hidden');
        card.setAttribute('aria-hidden', 'true');
        card.setAttribute('tabindex', '-1');
      }
    });
  }

  function nextSlide() {
    currentIndex = (currentIndex + 1) % totalCards;
    updateCoverflow();
    resetAutoPlay();
  }

  function prevSlide() {
    currentIndex = (currentIndex - 1 + totalCards) % totalCards;
    updateCoverflow();
    resetAutoPlay();
  }

  function goToSlide(idx) {
    currentIndex = (idx + totalCards) % totalCards;
    updateCoverflow();
    resetAutoPlay();
  }

  // Navigation button clicks
  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.preventDefault();
      nextSlide();
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.preventDefault();
      prevSlide();
    });
  }

  // Card interaction:
  // - Clicking a side card brings it smoothly to the center
  // - Clicking the active center card opens the YouTube link
  cards.forEach((card, idx) => {
    card.addEventListener('click', (e) => {
      if (idx !== currentIndex) {
        e.preventDefault();
        goToSlide(idx);
      }
    });
  });

  // Keyboard navigation on stage
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevSlide();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextSlide();
    }
  });

  // Mobile Touch Gestures (reliable swipe detection)
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  stage.addEventListener('touchstart', (e) => {
    if (!e.touches || !e.touches[0]) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    if (autoPlayTimer) clearInterval(autoPlayTimer);
  }, { passive: true });

  stage.addEventListener('touchend', (e) => {
    if (!e.changedTouches || !e.changedTouches[0]) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX;
    const deltaY = e.changedTouches[0].clientY - touchStartY;
    const duration = Date.now() - touchStartTime;

    // Detect horizontal swipe (horizontal distance > vertical and > 30px)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30 && duration < 800) {
      if (deltaX < 0) nextSlide();
      else prevSlide();
    }
    setTimeout(startAutoPlay, 2000);
  }, { passive: true });

  // Auto-play timer
  function startAutoPlay() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (autoPlayTimer) clearInterval(autoPlayTimer);
    autoPlayTimer = setInterval(() => {
      currentIndex = (currentIndex + 1) % totalCards;
      updateCoverflow();
    }, AUTO_PLAY_MS);
  }

  function resetAutoPlay() {
    if (autoPlayTimer) clearInterval(autoPlayTimer);
    startAutoPlay();
  }

  // Pause on hover or focus
  stage.addEventListener('mouseenter', () => { if (autoPlayTimer) clearInterval(autoPlayTimer); });
  stage.addEventListener('mouseleave', () => startAutoPlay());
  stage.addEventListener('focusin', () => { if (autoPlayTimer) clearInterval(autoPlayTimer); });
  stage.addEventListener('focusout', () => startAutoPlay());

  // Initialize Coverflow state
  updateCoverflow();
  startAutoPlay();
})();
