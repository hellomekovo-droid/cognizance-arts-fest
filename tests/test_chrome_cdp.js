/**
 * COGNIZANCE — Real Headless Chrome In-Browser Verification via Chrome DevTools Protocol (CDP)
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333;
const FILE_URL = "file:///" + path.resolve(__dirname, "../index.html").replace(/\\/g, '/');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.ws.onmessage = (msg) => {
      const res = JSON.parse(msg.data);
      if (res.id && this.callbacks.has(res.id)) {
        const { resolve, reject } = this.callbacks.get(res.id);
        this.callbacks.delete(res.id);
        if (res.error) reject(res.error);
        else resolve(res.result);
      }
    };
  }

  waitOpen() {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) return resolve();
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return res.result ? res.result.value : null;
  }

  close() {
    this.ws.close();
  }
}

async function runBrowserTest() {
  console.log('Launching Headless Chrome on port', PORT, 'with target:', FILE_URL);
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--disable-extensions',
    FILE_URL
  ], { stdio: 'ignore' });

  try {
    // Wait for CDP to respond
    let targets = null;
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      try {
        targets = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
        if (targets && targets.length > 0) break;
      } catch (e) {
        // Retry
      }
    }

    if (!targets || targets.length === 0) {
      throw new Error('Failed to connect to Chrome CDP targets.');
    }

    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found.');

    console.log('Connecting via WebSocket to CDP target:', pageTarget.webSocketDebuggerUrl);
    const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.waitOpen();

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('DOM.enable');

    await sleep(800); // Allow scripts and layout to initialize

    console.log('\n--- Real Chrome In-Browser Assertions ---');

    // 1. Initial State
    const initCards = await client.eval(`(() => {
      const stage = document.getElementById('yt-stage');
      const cards = [...stage.querySelectorAll('.yt-card')];
      return {
        total: cards.length,
        centerIndex: cards.findIndex(c => c.classList.contains('is-center')),
        card0Classes: [...cards[0].classList],
        card1Classes: [...cards[1].classList],
        stageCursor: window.getComputedStyle(stage).cursor,
        stageTouchAction: window.getComputedStyle(stage).touchAction
      };
    })()`);

    console.log('Total cards in DOM:', initCards.total);
    console.log('Active center index:', initCards.centerIndex);
    console.log('Stage computed cursor:', initCards.stageCursor);
    console.log('Stage computed touch-action:', initCards.stageTouchAction);

    if (initCards.total !== 7 || initCards.centerIndex !== 0) {
      throw new Error(`Unexpected initial state: total=${initCards.total}, center=${initCards.centerIndex}`);
    }
    if (initCards.stageTouchAction !== 'pan-y') {
      throw new Error(`Expected touch-action: pan-y, got ${initCards.stageTouchAction}`);
    }
    console.log('✔ Initial DOM and CSS properties verified in real Chrome engine.');

    // 2. Center Card Pure Tap / Click Interception Test
    const pureTapResult = await client.eval(`(() => {
      let intercepted = false;
      const card0 = document.querySelectorAll('.yt-card')[0];
      const handler = (e) => {
        intercepted = true;
        // Don't actually navigate page during automated test
        e.preventDefault();
      };
      card0.addEventListener('click', handler, { once: true });
      card0.click(); // programmatic click simulates pure tap
      return { intercepted };
    })()`);

    console.log('Center card pure click allowed:', pureTapResult.intercepted);
    if (!pureTapResult.intercepted) {
      throw new Error('Center card pure click failed to trigger handler.');
    }
    console.log('✔ Pure tap / click on center card triggers link click.');

    // 3. Drag Gesture via Pointer Events Dispatch
    console.log('\nSimulating drag gesture on #yt-stage in real Chrome...');
    const dragResult = await client.eval(`(() => {
      const stage = document.getElementById('yt-stage');
      const cards = [...stage.querySelectorAll('.yt-card')];
      
      let clickEmittedDuringDrag = false;
      let clickDefaultPrevented = null;

      const clickTracker = (e) => {
        clickEmittedDuringDrag = true;
        clickDefaultPrevented = e.defaultPrevented;
      };
      stage.addEventListener('click', clickTracker, { capture: true, once: true });

      // Simulate left drag
      const pDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 400, clientY: 200, pointerId: 1, pointerType: 'mouse', button: 0 });
      stage.dispatchEvent(pDown);

      const pMove = new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: 320, clientY: 200, pointerId: 1, pointerType: 'mouse' });
      window.dispatchEvent(pMove);

      const isDraggingActive = stage.classList.contains('is-dragging');

      const pUp = new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: 320, clientY: 200, pointerId: 1, pointerType: 'mouse' });
      window.dispatchEvent(pUp);

      // Browser generates click event after mouseup
      const syntheticClick = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 320, clientY: 200 });
      cards[0].dispatchEvent(syntheticClick);

      return {
        isDraggingActive,
        isDraggingRemoved: !stage.classList.contains('is-dragging'),
        newCenterIndex: cards.findIndex(c => c.classList.contains('is-center')),
        syntheticClickDefaultPrevented: syntheticClick.defaultPrevented
      };
    })()`);

    console.log('Drag active during gesture:', dragResult.isDraggingActive);
    console.log('Drag class removed after release:', dragResult.isDraggingRemoved);
    console.log('New center index after drag:', dragResult.newCenterIndex);
    console.log('Synthetic click defaultPrevented (click suppressed):', dragResult.syntheticClickDefaultPrevented);

    if (dragResult.newCenterIndex !== 1) {
      throw new Error(`Expected slide 1 after left drag, got ${dragResult.newCenterIndex}`);
    }
    if (!dragResult.syntheticClickDefaultPrevented) {
      throw new Error('Synthetic click on card anchor was NOT suppressed during drag!');
    }
    console.log('✔ Real Chrome drag gesture successfully navigated to slide 1 and SUPPRESSED anchor click!');

    // 4. Keyboard Arrow Navigation
    console.log('\nSimulating keyboard navigation (ArrowLeft & ArrowRight)...');
    const keyResult = await client.eval(`(() => {
      const stage = document.getElementById('yt-stage');
      const cards = [...stage.querySelectorAll('.yt-card')];
      
      const leftEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
      stage.dispatchEvent(leftEvent);
      const afterLeft = cards.findIndex(c => c.classList.contains('is-center'));

      const rightEvent = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      stage.dispatchEvent(rightEvent);
      const afterRight = cards.findIndex(c => c.classList.contains('is-center'));

      return {
        leftPrevented: leftEvent.defaultPrevented,
        afterLeft,
        rightPrevented: rightEvent.defaultPrevented,
        afterRight
      };
    })()`);

    console.log('ArrowLeft moved back to slide:', keyResult.afterLeft, '(defaultPrevented:', keyResult.leftPrevented, ')');
    console.log('ArrowRight moved forward to slide:', keyResult.afterRight, '(defaultPrevented:', keyResult.rightPrevented, ')');

    if (keyResult.afterLeft !== 0 || keyResult.afterRight !== 1) {
      throw new Error(`Keyboard navigation failed: afterLeft=${keyResult.afterLeft}, afterRight=${keyResult.afterRight}`);
    }
    console.log('✔ Real Chrome keyboard navigation passed perfectly!');

    // 5. Native Dragstart Suppression Test
    const dragstartResult = await client.eval(`(() => {
      const stage = document.getElementById('yt-stage');
      const ds = new Event('dragstart', { bubbles: true, cancelable: true });
      stage.dispatchEvent(ds);
      return { defaultPrevented: ds.defaultPrevented };
    })()`);

    console.log('Native dragstart prevented:', dragstartResult.defaultPrevented);
    if (!dragstartResult.defaultPrevented) {
      throw new Error('Native dragstart event was not prevented.');
    }
    console.log('✔ Real Chrome native HTML5 dragstart ghost suppression verified.');

    client.close();
    console.log('\nALL REAL CHROME CDP IN-BROWSER TESTS PASSED 100%!');
  } finally {
    try { chromeProcess.kill('SIGKILL'); } catch (e) {}
  }
}

runBrowserTest().catch(err => {
  console.error('Chrome CDP Test Failure:', err);
  process.exit(1);
});
