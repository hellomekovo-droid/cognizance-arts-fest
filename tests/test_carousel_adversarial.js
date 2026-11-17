/**
 * COGNIZANCE — Adversarial Stress Test Suite for 3D Video Carousel
 * Focus: Pointer gestures, drag thresholds, click suppression, keyboard navigation, and edge cases.
 */

const fs = require('fs');
const path = require('path');

// ── Event & DOM Simulation Engine ──

class DOMNode {
  constructor(name) {
    this.nodeName = name.toUpperCase();
    this.id = '';
    this._classes = new Set();
    this.classList = {
      add: (...cls) => cls.forEach(c => this._classes.add(c)),
      remove: (...cls) => cls.forEach(c => this._classes.delete(c)),
      contains: (c) => this._classes.has(c),
      toggle: (c) => {
        if (this._classes.has(c)) { this._classes.delete(c); return false; }
        else { this._classes.add(c); return true; }
      }
    };
    this.attributes = {};
    this._listeners = { capture: {}, bubble: {} };
    this.parentElement = null;
    this.children = [];
  }

  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] !== undefined ? this.attributes[k] : null; }
  hasAttribute(k) { return k in this.attributes; }

  addEventListener(type, fn, opts) {
    const isCapture = typeof opts === 'boolean' ? opts : !!(opts && opts.capture);
    const phase = isCapture ? 'capture' : 'bubble';
    if (!this._listeners[phase][type]) this._listeners[phase][type] = [];
    this._listeners[phase][type].push(fn);
  }

  removeEventListener(type, fn, opts) {
    const isCapture = typeof opts === 'boolean' ? opts : !!(opts && opts.capture);
    const phase = isCapture ? 'capture' : 'bubble';
    if (this._listeners[phase][type]) {
      this._listeners[phase][type] = this._listeners[phase][type].filter(f => f !== fn);
    }
  }

  dispatchEvent(e) {
    e.target = this;
    const path = [];
    let cur = this;
    while (cur) {
      path.push(cur);
      cur = cur.parentElement;
    }
    if (typeof global.window !== 'undefined' && !path.includes(global.window)) {
      path.push(global.window);
    }

    // 1. Capture Phase: window down to target's parent
    for (let i = path.length - 1; i > 0; i--) {
      e.eventPhase = 1; // CAPTURING_PHASE
      e.currentTarget = path[i];
      const list = (path[i]._listeners.capture[e.type] || []).slice();
      for (const fn of list) {
        if (e._immediateStopped) break;
        fn.call(path[i], e);
      }
      if (e._stopped || e._immediateStopped) return !e.defaultPrevented;
    }

    // 2. Target Phase: target node
    e.eventPhase = 2; // AT_TARGET
    e.currentTarget = this;
    const targetCapture = (this._listeners.capture[e.type] || []).slice();
    for (const fn of targetCapture) {
      if (e._immediateStopped) break;
      fn.call(this, e);
    }
    if (e._stopped || e._immediateStopped) return !e.defaultPrevented;

    const targetBubble = (this._listeners.bubble[e.type] || []).slice();
    for (const fn of targetBubble) {
      if (e._immediateStopped) break;
      fn.call(this, e);
    }
    if (e._stopped || e._immediateStopped) return !e.defaultPrevented;

    // 3. Bubble Phase: target's parent up to window (if bubbles)
    if (e.bubbles) {
      for (let i = 1; i < path.length; i++) {
        e.eventPhase = 3; // BUBBLING_PHASE
        e.currentTarget = path[i];
        const list = (path[i]._listeners.bubble[e.type] || []).slice();
        for (const fn of list) {
          if (e._immediateStopped) break;
          fn.call(path[i], e);
        }
        if (e._stopped || e._immediateStopped) return !e.defaultPrevented;
      }
    }

    return !e.defaultPrevented;
  }
}

class DOMEvent {
  constructor(type, opts = {}) {
    this.type = type;
    this.bubbles = opts.bubbles !== false;
    this.cancelable = opts.cancelable !== false;
    this.defaultPrevented = false;
    this._stopped = false;
    this._immediateStopped = false;
    this.target = null;
    this.currentTarget = null;
    this.eventPhase = 0;
  }
  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }
  stopPropagation() { this._stopped = true; }
  stopImmediatePropagation() {
    this._stopped = true;
    this._immediateStopped = true;
  }
}

class DOMPointerEvent extends DOMEvent {
  constructor(type, opts = {}) {
    super(type, opts);
    this.clientX = opts.clientX || 0;
    this.clientY = opts.clientY || 0;
    this.pointerId = opts.pointerId !== undefined ? opts.pointerId : 1;
    this.pointerType = opts.pointerType || 'mouse';
    this.button = opts.button !== undefined ? opts.button : 0;
  }
}

class DOMMouseEvent extends DOMEvent {
  constructor(type, opts = {}) {
    super(type, opts);
    this.clientX = opts.clientX || 0;
    this.clientY = opts.clientY || 0;
    this.button = opts.button !== undefined ? opts.button : 0;
  }
}

class DOMKeyboardEvent extends DOMEvent {
  constructor(type, opts = {}) {
    super(type, opts);
    this.key = opts.key || '';
  }
}

// ── Test Harness & Setup ──

let passCount = 0;
let failCount = 0;
const failures = [];

function assert(description, condition, details = '') {
  if (condition) {
    passCount++;
    console.log(`  [PASS] ${description}`);
  } else {
    failCount++;
    console.error(`  [FAIL] ${description} ${details ? '(' + details + ')' : ''}`);
    failures.push({ description, details });
  }
}

function setupEnvironment(prefersReducedMotion = false) {
  const win = new DOMNode('window');
  global.window = win;
  global.window.addEventListener = win.addEventListener.bind(win);
  global.window.removeEventListener = win.removeEventListener.bind(win);
  global.window.dispatchEvent = win.dispatchEvent.bind(win);
  global.window.matchMedia = (query) => ({
    matches: query.includes('prefers-reduced-motion') ? prefersReducedMotion : false
  });

  const stage = new DOMNode('div');
  stage.id = 'yt-stage';
  stage.parentElement = win;

  const prevBtn = new DOMNode('button');
  prevBtn.id = 'yt-prev';
  prevBtn.parentElement = win;

  const nextBtn = new DOMNode('button');
  nextBtn.id = 'yt-next';
  nextBtn.parentElement = win;

  const cards = [];
  const totalCards = 7;
  for (let i = 0; i < totalCards; i++) {
    const card = new DOMNode('a');
    card.classList.add('yt-card');
    card.setAttribute('data-index', i);
    card.setAttribute('href', `https://youtu.be/video${i}`);
    card.parentElement = stage;
    stage.children.push(card);
    cards.push(card);
  }

  stage.querySelectorAll = (sel) => (sel === '.yt-card' ? cards : []);

  global.document = {
    getElementById: (id) => {
      if (id === 'yt-stage') return stage;
      if (id === 'yt-prev') return prevBtn;
      if (id === 'yt-next') return nextBtn;
      return null;
    }
  };

  // Read code fresh
  const code = fs.readFileSync(path.resolve(__dirname, '../assets/js/yt-carousel.js'), 'utf8');
  eval(code);

  return { win, stage, prevBtn, nextBtn, cards };
}

function getCenterIndex(cards) {
  return cards.findIndex(c => c.classList.contains('is-center'));
}

// ── Test Execution ──

console.log('================================================================');
console.log('COGNIZANCE 3D CAROUSEL EMPIRICAL ADVERSARIAL STRESS TEST SUITE');
console.log('================================================================\n');

// ── Suite 1: Initialization & Class States ──
console.log('Test Suite 1: Initial Coverflow State & Class Mapping');
{
  const { cards } = setupEnvironment();
  assert('Card 0 is initially is-center', cards[0].classList.contains('is-center'));
  assert('Card 0 has tabindex=0 and aria-hidden=false', cards[0].getAttribute('tabindex') === '0' && cards[0].getAttribute('aria-hidden') === 'false');
  assert('Card 1 is is-right-1', cards[1].classList.contains('is-right-1'));
  assert('Card 2 is is-right-2', cards[2].classList.contains('is-right-2'));
  assert('Card 3 is is-right-hidden', cards[3].classList.contains('is-right-hidden'));
  assert('Card 3 has tabindex=-1 and aria-hidden=true', cards[3].getAttribute('tabindex') === '-1' && cards[3].getAttribute('aria-hidden') === 'true');
  assert('Card 4 is is-left-hidden', cards[4].classList.contains('is-left-hidden'));
  assert('Card 5 is is-left-2', cards[5].classList.contains('is-left-2'));
  assert('Card 6 is is-left-1', cards[6].classList.contains('is-left-1'));
}

// ── Suite 2: HTML5 Native Dragstart Suppression ──
console.log('\nTest Suite 2: HTML5 Dragstart Ghost Suppression');
{
  const { stage, cards } = setupEnvironment();
  const ds1 = new DOMEvent('dragstart', { cancelable: true });
  stage.dispatchEvent(ds1);
  assert('dragstart on #yt-stage is preventDefaulted', ds1.defaultPrevented === true);

  const ds2 = new DOMEvent('dragstart', { cancelable: true, bubbles: true });
  cards[0].dispatchEvent(ds2);
  assert('dragstart bubbling from card thumb is preventDefaulted at stage', ds2.defaultPrevented === true);
}

// ── Suite 3: Desktop Mouse Dragging & Buttons ──
console.log('\nTest Suite 3: Desktop Mouse Dragging & Non-Primary Button Rejection');
{
  const { win, stage, cards } = setupEnvironment();

  // Test 3.1: Right-click drag rejection
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { button: 2, pointerType: 'mouse', pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 200, clientY: 0, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 200, clientY: 0, pointerId: 1 }));
  assert('Right-click drag ignored: slide index remains 0', getCenterIndex(cards) === 0);

  // Test 3.2: Middle-click drag rejection
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { button: 1, pointerType: 'mouse', pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: -200, clientY: 0, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: -200, clientY: 0, pointerId: 1 }));
  assert('Middle-click drag ignored: slide index remains 0', getCenterIndex(cards) === 0);

  // Test 3.3: Primary left-click drag left (swipe left -> next slide)
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 300, clientY: 100, button: 0, pointerType: 'mouse', pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 240, clientY: 100, pointerId: 1 }));
  assert('Stage has is-dragging class during move', stage.classList.contains('is-dragging'));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 240, clientY: 100, pointerId: 1 }));
  assert('Stage removed is-dragging on pointerup', !stage.classList.contains('is-dragging'));
  assert('Slide navigated to 1 after left drag (deltaX = -60px)', getCenterIndex(cards) === 1);

  // Test 3.4: Primary left-click drag right (swipe right -> prev slide)
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 200, clientY: 100, button: 0, pointerType: 'mouse', pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 260, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 260, clientY: 100, pointerId: 1 }));
  assert('Slide navigated back to 0 after right drag (deltaX = +60px)', getCenterIndex(cards) === 0);
}

// ── Suite 4: Mobile Touch & Stylus Swiping ──
console.log('\nTest Suite 4: Mobile Touch and Pen Gestures');
{
  const { win, stage, cards } = setupEnvironment();

  // Test 4.1: Touch swipe left
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 250, clientY: 100, pointerType: 'touch', pointerId: 2 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 190, clientY: 100, pointerType: 'touch', pointerId: 2 }));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 190, clientY: 100, pointerType: 'touch', pointerId: 2 }));
  assert('Mobile touch swipe advances to slide 1', getCenterIndex(cards) === 1);

  // Test 4.2: Stylus/pen swipe right
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'pen', pointerId: 3 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 160, clientY: 100, pointerType: 'pen', pointerId: 3 }));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 160, clientY: 100, pointerType: 'pen', pointerId: 3 }));
  assert('Stylus pen swipe advances back to slide 0', getCenterIndex(cards) === 0);
}

// ── Suite 5: Click vs Drag Boundaries (8px threshold) ──
console.log('\nTest Suite 5: Exact Drag Boundary Stress (0px, 5px, 7px, 8px, 9px, 15px)');
{
  const { win, stage, cards } = setupEnvironment();

  // Test 5.1: Pure tap (delta = 0px) on center card
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 100, clientY: 100, pointerId: 1 }));
  const tapClick = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
  cards[0].dispatchEvent(tapClick);
  assert('Pure tap (0px) on center card: click NOT prevented (YouTube opens)', tapClick.defaultPrevented === false);

  // Test 5.2: Jitter movement of 5px on center card (5 <= 8px threshold)
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 105, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 105, clientY: 100, pointerId: 1 }));
  const jitter5Click = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
  cards[0].dispatchEvent(jitter5Click);
  assert('Micro-jitter (5px) on center card: click NOT prevented', jitter5Click.defaultPrevented === false);

  // Test 5.3: Jitter movement of 7px on center card (7 <= 8px threshold)
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 107, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 107, clientY: 100, pointerId: 1 }));
  const jitter7Click = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
  cards[0].dispatchEvent(jitter7Click);
  assert('Micro-jitter (7px) on center card: click NOT prevented', jitter7Click.defaultPrevented === false);

  // Test 5.4: Boundary movement of EXACTLY 8.0px (Math.hypot(8,0) = 8.0, 8.0 > 8 is FALSE)
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 108, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 108, clientY: 100, pointerId: 1 }));
  const boundary8Click = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
  cards[0].dispatchEvent(boundary8Click);
  assert('Exact 8.0px boundary: click NOT prevented (tap threshold preserved)', boundary8Click.defaultPrevented === false);

  // Test 5.5: Movement of 9.0px (Math.hypot(9,0) = 9.0, 9.0 > 8 is TRUE)
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 109, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 109, clientY: 100, pointerId: 1 }));
  const drag9Click = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
  cards[0].dispatchEvent(drag9Click);
  assert('Threshold crossed at 9px: click IS PREVENTED (click suppressed)', drag9Click.defaultPrevented === true);
  assert('Threshold crossed at 9px: propagation stopped', drag9Click._stopped === true);

  // Test 5.6: Movement of 15px (< 20px flick, < 35px full swipe)
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 115, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 115, clientY: 100, pointerId: 1 }));
  assert('15px twitch does NOT advance slide', getCenterIndex(cards) === 0);
  const drag15Click = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
  cards[0].dispatchEvent(drag15Click);
  assert('15px twitch DOES suppress click (link never opened)', drag15Click.defaultPrevented === true);

  // Test 5.7: Diagonal boundary test (dx=6, dy=5 -> hypot 7.81 <= 8: tap)
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 106, clientY: 105, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 106, clientY: 105, pointerId: 1 }));
  const diagTapClick = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
  cards[0].dispatchEvent(diagTapClick);
  assert('Diagonal 7.81px within threshold: click NOT prevented', diagTapClick.defaultPrevented === false);

  // Test 5.8: Diagonal boundary test (dx=6, dy=6 -> hypot 8.49 > 8: drag)
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 106, clientY: 106, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 106, clientY: 106, pointerId: 1 }));
  const diagDragClick = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
  cards[0].dispatchEvent(diagDragClick);
  assert('Diagonal 8.49px over threshold: click IS PREVENTED', diagDragClick.defaultPrevented === true);
}

// ── Suite 6: Accidental Drag on Card <a> NEVER Opens YouTube ──
console.log('\nTest Suite 6: Accidental Drag on .yt-card a Link Interception');
{
  const { win, stage, cards } = setupEnvironment();

  // Test 6.1: Drag left starting on center card
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 300, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 200, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 200, clientY: 100, pointerId: 1 }));

  // Browser fires synthetic click at end of gesture on the original card
  const syntheticClick = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
  cards[0].dispatchEvent(syntheticClick);
  assert('Synthetic click on center card during drag left is preventDefaulted', syntheticClick.defaultPrevented === true);
  assert('Synthetic click propagation is stopped at stage capture', syntheticClick._stopped === true);

  // Test 6.2: Drag right starting on center card
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 200, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 300, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 300, clientY: 100, pointerId: 1 }));

  const syntheticClickRight = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
  cards[1].dispatchEvent(syntheticClickRight);
  assert('Synthetic click on center card during drag right is preventDefaulted', syntheticClickRight.defaultPrevented === true);
}

// ── Suite 7: Side Card Clicks vs Side Card Drags ──
console.log('\nTest Suite 7: Side Card Pure Clicks vs Side Card Drags');
{
  const { win, stage, cards } = setupEnvironment();
  // Currently center is card 0

  // Test 7.1: Pure click on side card 2 brings it to center
  const sideClick = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
  cards[2].dispatchEvent(sideClick);
  assert('Pure click on side card 2 has defaultPrevented=true (prevents link)', sideClick.defaultPrevented === true);
  assert('Pure click on side card 2 brings card 2 to center', getCenterIndex(cards) === 2);

  // Test 7.2: Pure click on side card 5 brings card 5 to center
  const sideClick5 = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
  cards[5].dispatchEvent(sideClick5);
  assert('Pure click on side card 5 brings card 5 to center', getCenterIndex(cards) === 5);

  // Test 7.3: Drag starting on side card 6
  // Should swipe carousel by 1 slide rather than jumping to card 6!
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 300, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 220, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 220, clientY: 100, pointerId: 1 }));
  assert('Swipe from card advances to slide 6 (5 + 1)', getCenterIndex(cards) === 6);

  // Synthetic click on card 6 should NOT trigger erratic snap-back!
  const postSwipeClick = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
  cards[6].dispatchEvent(postSwipeClick);
  assert('Post-swipe click on card 6 is suppressed', postSwipeClick.defaultPrevented === true);
  assert('Carousel center remains at 6 without jump', getCenterIndex(cards) === 6);
}

// ── Suite 8: Return-to-Start Drag Gesture ──
console.log('\nTest Suite 8: Return-to-Start Gesture (Drag away > 8px then return)');
{
  const { win, stage, cards } = setupEnvironment();

  // User drags mouse 60px away (crossing 8px drag threshold), then returns back to starting point (delta = 2px)
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 160, clientY: 100, pointerId: 1 })); // 60px away
  assert('is-dragging became true during move', stage.classList.contains('is-dragging'));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 102, clientY: 100, pointerId: 1 })); // returned to 2px away
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 102, clientY: 100, pointerId: 1 }));

  // Center should NOT change because deltaX was only 2px
  assert('Slide does not change after return-to-start gesture', getCenterIndex(cards) === 0);

  // BUT synthetic click MUST be suppressed because user was dragging!
  const returnClick = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
  cards[0].dispatchEvent(returnClick);
  assert('Return-to-start gesture suppresses click (YouTube never accidentally opens)', returnClick.defaultPrevented === true);
}

// ── Suite 9: Fast Flicks vs Sluggish Drags ──
console.log('\nTest Suite 9: Fast Flicks (<300ms, >20px) and Sluggish Drags');
{
  const { win, stage, cards } = setupEnvironment();

  // Test 9.1: Fast flick left (deltaX = -22px, duration < 300ms)
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 78, clientY: 100, pointerId: 1 })); // -22px
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 78, clientY: 100, pointerId: 1 }));
  assert('Fast flick (-22px) advances slide to 1', getCenterIndex(cards) === 1);

  // Test 9.2: Fast flick right (deltaX = +24px, duration < 300ms)
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 124, clientY: 100, pointerId: 1 })); // +24px
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 124, clientY: 100, pointerId: 1 }));
  assert('Fast flick (+24px) advances slide back to 0', getCenterIndex(cards) === 0);

  // Test 9.3: Too small flick (deltaX = 18px < 20px FLICK_DISTANCE)
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 118, clientY: 100, pointerId: 1 })); // 18px
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 118, clientY: 100, pointerId: 1 }));
  assert('18px flick below 20px threshold does NOT advance slide', getCenterIndex(cards) === 0);

  // Test 9.4: Full swipe (deltaX = 40px > 35px SWIPE_THRESHOLD)
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 200, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 155, clientY: 100, pointerId: 1 })); // -45px
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 155, clientY: 100, pointerId: 1 }));
  assert('Full swipe (-45px) advances slide to 1', getCenterIndex(cards) === 1);
}

// ── Suite 10: Window Drag Release & Out-of-Bounds Moves ──
console.log('\nTest Suite 10: Out-of-Bounds Moves & Window Drag Release');
{
  const { win, stage, cards } = setupEnvironment();

  // Test 10.1: Pointer down on stage, pointer moves far outside window (e.g. -500), released on window
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 200, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: -500, clientY: -300, pointerId: 1 }));
  assert('Stage has is-dragging class during far drag', stage.classList.contains('is-dragging'));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: -500, clientY: -300, pointerId: 1 }));
  assert('is-dragging cleanly removed after window pointerup', !stage.classList.contains('is-dragging'));
  assert('Window drag release successfully advanced slide', getCenterIndex(cards) === 1);

  // Test 10.2: Window listeners are cleanly unbound
  assert('Window pointermove listeners count is 0 after cleanup', !win._listeners.bubble['pointermove'] || win._listeners.bubble['pointermove'].length === 0);
  assert('Window pointerup listeners count is 0 after cleanup', !win._listeners.bubble['pointerup'] || win._listeners.bubble['pointerup'].length === 0);
  assert('Window pointercancel listeners count is 0 after cleanup', !win._listeners.bubble['pointercancel'] || win._listeners.bubble['pointercancel'].length === 0);
}

// ── Suite 11: Pointer Cancellation (Vertical Scroll Interruption) ──
console.log('\nTest Suite 11: Pointer Cancellation (Mobile Vertical Scroll / Interrupt)');
{
  const { win, stage, cards } = setupEnvironment();

  // Test 11.1: Mobile vertical scroll triggers pointercancel
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch', pointerId: 5 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 110, clientY: 160, pointerType: 'touch', pointerId: 5 }));
  win.dispatchEvent(new DOMPointerEvent('pointercancel', { pointerId: 5 }));

  assert('Stage removes is-dragging on pointercancel', !stage.classList.contains('is-dragging'));
  assert('Slide does NOT change on pointercancel', getCenterIndex(cards) === 0);
  assert('Window pointer listeners cleanly detached on cancel', !win._listeners.bubble['pointermove'] || win._listeners.bubble['pointermove'].length === 0);

  // Subsequent click should not be blocked after cancel
  const normalClick = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
  cards[0].dispatchEvent(normalClick);
  assert('Subsequent tap after pointercancel is NOT blocked', normalClick.defaultPrevented === false);
}

// ── Suite 12: Concurrent Pointer Discrimination ──
console.log('\nTest Suite 12: Multi-touch & Concurrent Pointer Discrimination');
{
  const { win, stage, cards } = setupEnvironment();

  // Primary pointer touches down
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 200, clientY: 100, pointerId: 10 }));

  // Secondary pointer touches down concurrently
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 300, clientY: 100, pointerId: 11 }));

  // Secondary pointer moves
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 100, clientY: 100, pointerId: 11 }));

  // Primary pointer moves by -60px
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 140, clientY: 100, pointerId: 10 }));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 140, clientY: 100, pointerId: 10 }));

  assert('Primary pointer tracked while secondary ignored: slide advanced to 1', getCenterIndex(cards) === 1);
}

// ── Suite 13: Click Suppression 120ms Timeout Recovery ──
console.log('\nTest Suite 13: Click Suppression Timeout Recovery (No Click Fired)');
{
  const { win, stage, cards } = setupEnvironment();

  // 15px drag: >8px drag threshold so suppressClick=true, but <20px flick so slide DOES NOT change (card 0 remains center)
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 115, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 115, clientY: 100, pointerId: 1 }));
  assert('Card 0 is still center after 15px drag', getCenterIndex(cards) === 0);

  // Assume NO click event fired (e.g. pointer release outside document).
  // Wait > 120ms for timeout to clear suppressClick.
  setTimeout(() => {
    // Now perform a clean tap on center card 0
    const centerCard = cards[getCenterIndex(cards)];
    const freshTap = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
    centerCard.dispatchEvent(freshTap);
    assert('After 150ms timeout, fresh click on center card is NOT suppressed (opens link)', freshTap.defaultPrevented === false);
  }, 150);
}

// ── Suite 14: Keyboard Navigation & Accessibility ──
console.log('\nTest Suite 14: Keyboard Navigation (ArrowLeft, ArrowRight)');
{
  const { stage, cards } = setupEnvironment();

  // Test 14.1: ArrowRight advances slide
  const keyRight = new DOMKeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
  stage.dispatchEvent(keyRight);
  assert('ArrowRight advances slide to 1', getCenterIndex(cards) === 1);
  assert('ArrowRight default was prevented (no page scroll)', keyRight.defaultPrevented === true);

  // Test 14.2: ArrowLeft goes to previous slide
  const keyLeft = new DOMKeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
  stage.dispatchEvent(keyLeft);
  assert('ArrowLeft moves slide back to 0', getCenterIndex(cards) === 0);
  assert('ArrowLeft default was prevented', keyLeft.defaultPrevented === true);

  // Test 14.3: Unrelated key (ArrowDown, Tab, Enter)
  const keyDown = new DOMKeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
  stage.dispatchEvent(keyDown);
  assert('ArrowDown does NOT change slide', getCenterIndex(cards) === 0);
  assert('ArrowDown default is NOT prevented', keyDown.defaultPrevented === false);

  // Test 14.4: Loop wrap-around with ArrowLeft from slide 0
  stage.dispatchEvent(new DOMKeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
  assert('ArrowLeft from slide 0 wraps around to slide 6', getCenterIndex(cards) === 6);

  // Test 14.5: Loop wrap-around with ArrowRight from slide 6
  stage.dispatchEvent(new DOMKeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
  assert('ArrowRight from slide 6 wraps around to slide 0', getCenterIndex(cards) === 0);
}

// ── Suite 15: Prev and Next Navigation Buttons ──
console.log('\nTest Suite 15: Prev & Next Navigation Buttons');
{
  const { prevBtn, nextBtn, cards } = setupEnvironment();

  const nextClick = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
  nextBtn.dispatchEvent(nextClick);
  assert('Next button advances slide to 1', getCenterIndex(cards) === 1);
  assert('Next button click defaultPrevented', nextClick.defaultPrevented === true);

  const prevClick = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
  prevBtn.dispatchEvent(prevClick);
  assert('Prev button advances slide back to 0', getCenterIndex(cards) === 0);
  assert('Prev button click defaultPrevented', prevClick.defaultPrevented === true);
}

// ── Suite 16: CSS Verification ──
console.log('\nTest Suite 16: CSS Properties & Performance Verification');
{
  const css = fs.readFileSync(path.resolve(__dirname, '../assets/css/yt-carousel.css'), 'utf8');

  assert('touch-action: pan-y present in yt-carousel.css', css.includes('touch-action: pan-y;'));
  assert('-webkit-user-drag: none present in yt-carousel.css', css.includes('-webkit-user-drag: none;'));
  assert('user-drag: none present in yt-carousel.css', css.includes('user-drag: none;'));
  assert('cursor: grabbing present for is-dragging', css.includes('cursor: grabbing !important;'));
  assert('3D translateZ transforms present for is-center', css.includes('translateZ(60px)'));
  assert('GPU compositing will-change present', css.includes('will-change: transform, opacity, box-shadow, z-index;'));
  assert('prefers-reduced-motion media query present', css.includes('@media (prefers-reduced-motion: reduce)'));
}

// ── Suite 17: Dominant Vertical Drag (Mobile Scroll Pass-Through) ──
console.log('\nTest Suite 17: Dominant Vertical Drag (Vertical Page Scroll Immunity)');
{
  const { win, stage, cards } = setupEnvironment();

  // User drags vertically: deltaX = 15px, deltaY = 80px (dominant vertical)
  stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }));
  win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 115, clientY: 180, pointerId: 1 }));

  // Stage should NOT have is-dragging because |deltaX| < |deltaY|
  assert('Stage does NOT set is-dragging during vertical drag', !stage.classList.contains('is-dragging'));

  win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 115, clientY: 180, pointerId: 1 }));
  assert('Vertical drag does NOT trigger slide navigation (carousel intact)', getCenterIndex(cards) === 0);
}

// ── Suite 18: Full 7-Step Carousel Rotation Invariant Audit ──
console.log('\nTest Suite 18: Invariant Audit Across Full 7-Step Cycle');
{
  const { stage, cards } = setupEnvironment();

  const expectedOffsets = [
    { name: 'is-center', tabindex: '0', ariaHidden: 'false' },
    { name: 'is-right-1', tabindex: '0', ariaHidden: 'false' },
    { name: 'is-right-2', tabindex: '-1', ariaHidden: 'false' },
    { name: 'is-right-hidden', tabindex: '-1', ariaHidden: 'true' },
    { name: 'is-left-hidden', tabindex: '-1', ariaHidden: 'true' },
    { name: 'is-left-2', tabindex: '-1', ariaHidden: 'false' },
    { name: 'is-left-1', tabindex: '0', ariaHidden: 'false' }
  ];

  let allInvariantsHold = true;

  for (let step = 0; step < 7; step++) {
    const centerIdx = getCenterIndex(cards);
    if (centerIdx !== step) {
      allInvariantsHold = false;
      break;
    }

    // Check each card's class and attributes
    for (let i = 0; i < 7; i++) {
      let diff = (i - step) % 7;
      if (diff > 3) diff -= 7;
      if (diff < -3) diff += 7;

      const card = cards[i];
      let expectedClass = '';
      let expTabindex = '-1';
      let expAria = 'true';

      if (diff === 0) { expectedClass = 'is-center'; expTabindex = '0'; expAria = 'false'; }
      else if (diff === 1) { expectedClass = 'is-right-1'; expTabindex = '0'; expAria = 'false'; }
      else if (diff === 2) { expectedClass = 'is-right-2'; expTabindex = '-1'; expAria = 'false'; }
      else if (diff >= 3) { expectedClass = 'is-right-hidden'; expTabindex = '-1'; expAria = 'true'; }
      else if (diff === -1) { expectedClass = 'is-left-1'; expTabindex = '0'; expAria = 'false'; }
      else if (diff === -2) { expectedClass = 'is-left-2'; expTabindex = '-1'; expAria = 'false'; }
      else if (diff <= -3) { expectedClass = 'is-left-hidden'; expTabindex = '-1'; expAria = 'true'; }

      if (!card.classList.contains(expectedClass) ||
          card.getAttribute('tabindex') !== expTabindex ||
          card.getAttribute('aria-hidden') !== expAria) {
        allInvariantsHold = false;
      }
    }

    // Step forward
    stage.dispatchEvent(new DOMKeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
  }

  assert('All 7 rotation states strictly maintain correct classes, tabindex, and aria-hidden', allInvariantsHold);
  assert('Wrapped back to start slide 0 after 7 steps', getCenterIndex(cards) === 0);
}

// ── Suite 19: Rapid 100-Swipe Fuzzing & Resilience ──
console.log('\nTest Suite 19: Rapid 100-Swipe Fuzzing & Chaos Test');
{
  const { win, stage, cards } = setupEnvironment();

  let chaosOk = true;
  for (let i = 0; i < 100; i++) {
    const dir = (i % 2 === 0) ? -50 : 50;
    stage.dispatchEvent(new DOMPointerEvent('pointerdown', { clientX: 200, clientY: 100, pointerId: 1 }));
    win.dispatchEvent(new DOMPointerEvent('pointermove', { clientX: 200 + dir, clientY: 100, pointerId: 1 }));
    win.dispatchEvent(new DOMPointerEvent('pointerup', { clientX: 200 + dir, clientY: 100, pointerId: 1 }));

    // Intervening synthetic click
    const click = new DOMMouseEvent('click', { bubbles: true, cancelable: true });
    cards[getCenterIndex(cards)].dispatchEvent(click);
    if (!click.defaultPrevented) {
      chaosOk = false;
    }
  }

  assert('Rapid 100-swipe stress test completed with zero desyncs and 100% click suppression', chaosOk);
}

// ── Final Summary ──
setTimeout(() => {
  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) {
    console.error('FAILURES:');
    failures.forEach(f => console.error(`- ${f.description}: ${f.details}`));
    process.exit(1);
  } else {
    console.log('ALL ADVERSARIAL STRESS TESTS COMPLETED SUCCESSFULLY (VERDICT: APPROVE)');
    process.exit(0);
  }
}, 250);
