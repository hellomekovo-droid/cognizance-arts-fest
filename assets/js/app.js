'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const menuButton = $('.menu-toggle');
const menu = $('#mobile-menu');
function closeMenu(returnFocus = false) {menu.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); if (returnFocus) menuButton.focus();}
menuButton.addEventListener('click', () => {const open = menu.hidden; menu.hidden = !open; menuButton.setAttribute('aria-expanded', String(open));});
$$('a', menu).forEach(link => link.addEventListener('click', () => closeMenu()));
document.addEventListener('keydown', event => {if (event.key === 'Escape' && !menu.hidden) closeMenu(true);});
matchMedia('(min-width: 761px)').addEventListener('change', event => {if (event.matches) closeMenu();});
let category = 'all';
function filterPrograms() {const query = $('#program-search').value.trim().toLowerCase(); let count = 0; $$('.program-card').forEach(card => {const visible = (category === 'all' || category === card.dataset.category) && card.textContent.toLowerCase().includes(query); card.hidden = !visible; if (visible) count++;}); $('#program-count').textContent = `${count} sample program${count === 1 ? '' : 's'} · official lineup coming soon`; $('#program-empty').hidden = count !== 0;}
$$('[data-program]').forEach(button => button.addEventListener('click', () => {category = button.dataset.program; $$('[data-program]').forEach(item => {const selected = item === button; item.classList.toggle('active', selected); item.setAttribute('aria-pressed', String(selected));}); filterPrograms();}));
$('#program-search').addEventListener('input', filterPrograms);
$('#clear-program').addEventListener('click', () => {$('#program-search').value = ''; $('[data-program="all"]').click(); $('#program-search').focus();});
$('#result-search').addEventListener('input', event => {const searching = event.target.value.trim().length > 0; $('#result-message').textContent = searching ? 'No official results are available to search yet.' : 'Their moment is worth waiting for.'; $('#result-detail').textContent = searching ? 'The row above is a labeled placeholder, not a published result. Verified results will be searchable once approved.' : 'Verified results will appear here once approved by the organizing team.';});
let galleryFilter = 'all';
$$('[data-gallery]').forEach(button => button.addEventListener('click', () => {galleryFilter = button.dataset.gallery; $$('[data-gallery]').forEach(item => {const selected = item === button; item.classList.toggle('active', selected); item.setAttribute('aria-pressed', String(selected));}); let count = 0; $$('.photo-tile').forEach(tile => {tile.hidden = galleryFilter !== 'all' && tile.dataset.category !== galleryFilter; if (!tile.hidden) count++;}); $('#photo-count').textContent = `${count} sample photo space${count === 1 ? '' : 's'}`;}));
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
if ('IntersectionObserver' in window && !reduced.matches) {const reveals = new IntersectionObserver(entries => entries.forEach(entry => {if (entry.isIntersecting) {entry.target.classList.add('revealed'); reveals.unobserve(entry.target);}}), {threshold: .12}); $$('.about-content, .program-card, .results-panel, .standings, .photo-tile, .video-placeholder').forEach(item => {if(item.getBoundingClientRect().top > innerHeight) {item.classList.add('reveal-ready'); reveals.observe(item);}});}
if ('IntersectionObserver' in window) {const activeSections = new IntersectionObserver(entries => entries.forEach(entry => {if (entry.isIntersecting) {$$('.desktop-nav a, .mobile-quick a, .mobile-menu a').forEach(link => {const active = link.hash === '#' + entry.target.id; link.classList.toggle('current', active); if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');});}}), {rootMargin:'-20% 0px -55% 0px', threshold:0}); $$('main section[id]').forEach(section => activeSections.observe(section));}
filterPrograms();


// ==============================================================
// CINEMATIC SCROLL-REVEAL TEXT MOTION
// Detects scrolling into each section, waits a moment, then smoothly reveals text
// ==============================================================
function initScrollReveal() {
  if (!('IntersectionObserver' in window)) return;

  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px'
  });

  const sections = $$('main > section, .quick-strip, footer');
  
  sections.forEach((section) => {
    const targets = $$(
      '.section-heading, .eyebrow, h1, h2, h3, .hero-description, .hero-actions, .event-note, ' +
      '.section-intro, .about-content > div, .about-content > h2, .quick-grid > p, .quick-grid > a, ' +
      '.program-toolbar, .program-card, .results-panel, .scores-grid > div, ' +
      '.gallery-toolbar, .photo-tile, .video-placeholder, .parent-guide details, .footer-top > div',
      section
    );

    targets.forEach((elem, idx) => {
      if (elem.classList.contains('scroll-reveal')) return;
      
      elem.classList.add('scroll-reveal');
      const delayTier = (idx % 5) + 1;
      elem.classList.add('delay-' + delayTier);

      const rect = elem.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        setTimeout(() => {
          elem.classList.add('is-visible');
        }, 150 + (idx * 120));
      } else {
        revealObserver.observe(elem);
      }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initScrollReveal);
} else {
  initScrollReveal();
}
