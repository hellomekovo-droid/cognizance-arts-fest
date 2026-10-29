/**
 * Cognizance Arts Fest ’26 — Signature Atmospheric Preloader
 * Handles smooth progress animation, milestone statuses, and theatrical curtain reveal.
 */
(function initCognizancePreloader() {
  'use strict';

  const preloader = document.getElementById('cognizance-preloader');
  if (!preloader) return;

  const barFill = document.getElementById('preloader-fill');
  const percentText = document.getElementById('preloader-percent');
  const statusText = document.getElementById('preloader-status');

  const milestones = [
    { threshold: 0, text: 'Curating festival moments...' },
    { threshold: 28, text: 'Setting up stage & spotlights...' },
    { threshold: 58, text: 'Tuning programs & art lineups...' },
    { threshold: 85, text: 'Unlocking infinite possibilities...' },
    { threshold: 99, text: 'Welcome to Cognizance ’26! ✦' }
  ];

  let currentPercent = 0;
  let targetPercent = 15;
  let isWindowLoaded = false;
  let isCompleted = false;
  let animationFrameId = null;
  const startTime = performance.now();
  const minDurationMs = 1400; // minimum duration for cinematic delight
  const maxTimeoutMs = 3800;  // failsafe duration

  function updateStatusText(percent) {
    if (!statusText) return;
    let chosenText = milestones[0].text;
    for (let i = 0; i < milestones.length; i++) {
      if (percent >= milestones[i].threshold) {
        chosenText = milestones[i].text;
      }
    }
    if (statusText.textContent !== chosenText) {
      statusText.style.opacity = '0';
      statusText.style.transform = 'translateY(4px)';
      setTimeout(() => {
        statusText.textContent = chosenText;
        statusText.style.opacity = '1';
        statusText.style.transform = 'translateY(0)';
      }, 120);
    }
  }

  function finishPreloader() {
    if (isCompleted) return;
    isCompleted = true;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    // Ensure 100% is displayed
    if (barFill) barFill.style.width = '100%';
    if (percentText) percentText.textContent = '100%';
    if (statusText) statusText.textContent = 'Welcome to Cognizance ’26! ✦';

    // Theatrical curtain sequence
    setTimeout(() => {
      preloader.classList.add('is-finished');
      document.body.classList.remove('preloader-active');
      window.dispatchEvent(new CustomEvent('cognizance:loaded'));

      setTimeout(() => {
        preloader.classList.add('is-hidden');
        preloader.setAttribute('aria-hidden', 'true');
        setTimeout(() => {
          preloader.style.display = 'none';
        }, 400);
      }, 850);
    }, 240);
  }

  function tick() {
    if (isCompleted) return;

    const elapsed = performance.now() - startTime;
    const timeProgress = Math.min(elapsed / minDurationMs, 1);

    if (isWindowLoaded && elapsed >= minDurationMs) {
      targetPercent = 100;
    } else if (isWindowLoaded) {
      // Scale target up to 98% smoothly until min duration reached
      targetPercent = Math.max(targetPercent, 60 + timeProgress * 38);
    } else {
      // Natural progression while waiting for load
      if (currentPercent < 40) {
        targetPercent += 0.8;
      } else if (currentPercent < 75) {
        targetPercent += 0.35;
      } else if (currentPercent < 92) {
        targetPercent += 0.12;
      }
    }

    // Smooth lerp toward target
    const easeRate = isWindowLoaded ? 0.15 : 0.08;
    currentPercent += (targetPercent - currentPercent) * easeRate;

    if (targetPercent >= 100 && (100 - currentPercent) < 0.8) {
      currentPercent = 100;
    }

    const rounded = Math.min(Math.floor(currentPercent), 100);

    if (barFill) barFill.style.width = `${rounded}%`;
    if (percentText) percentText.textContent = `${rounded}%`;
    updateStatusText(rounded);

    if (rounded >= 100) {
      finishPreloader();
      return;
    }

    animationFrameId = requestAnimationFrame(tick);
  }

  // Check window load
  if (document.readyState === 'complete') {
    isWindowLoaded = true;
  } else {
    window.addEventListener('load', () => {
      isWindowLoaded = true;
    });
  }

  // Safety fallback timeout
  setTimeout(() => {
    isWindowLoaded = true;
    targetPercent = 100;
    finishPreloader();
  }, maxTimeoutMs);

  // Quick skip on user interaction (Escape key or click preloader after 1s)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !isCompleted) {
      finishPreloader();
    }
  });

  preloader.addEventListener('click', () => {
    if (performance.now() - startTime > 1000) {
      finishPreloader();
    }
  });

  // Start loop
  animationFrameId = requestAnimationFrame(tick);
})();
