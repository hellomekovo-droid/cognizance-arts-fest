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
const motion = $('#motion-toggle'); const reduced = matchMedia('(prefers-reduced-motion: reduce)'); let paused = reduced.matches;
function applyMotion() {document.documentElement.classList.toggle('no-motion', paused); motion.setAttribute('aria-pressed', String(paused)); motion.textContent = paused ? 'Decorative motion off' : 'Pause decorative motion'; if (paused) $$('.reveal-ready').forEach(item => item.classList.add('revealed'));}
motion.addEventListener('click', () => {paused = !paused; applyMotion();}); reduced.addEventListener('change', event => {paused = event.matches; applyMotion();}); applyMotion();
if ('IntersectionObserver' in window && !reduced.matches) {const reveals = new IntersectionObserver(entries => entries.forEach(entry => {if (entry.isIntersecting) {entry.target.classList.add('revealed'); reveals.unobserve(entry.target);}}), {threshold: .12}); $$('.about-content, .program-card, .results-panel, .standings, .photo-tile, .video-placeholder').forEach(item => {if(item.getBoundingClientRect().top > innerHeight) {item.classList.add('reveal-ready'); reveals.observe(item);}});}
if ('IntersectionObserver' in window) {const activeSections = new IntersectionObserver(entries => entries.forEach(entry => {if (entry.isIntersecting) {$$('.desktop-nav a, .mobile-quick a').forEach(link => {const active = link.hash === '#' + entry.target.id; link.classList.toggle('current', active); if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');});}}), {rootMargin:'-20% 0px -55% 0px', threshold:0}); $$('main section[id]').forEach(section => activeSections.observe(section));}
filterPrograms();
