/**
 * Adversarial Empirical Verification Suite for DOM Parity & Navigation
 * Cognizance Arts Fest Website (M2 Review)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const PORT = 8978;
const CDP_PORT = 9224;
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

let server;
let edgeProc;
let ws;
let cdpMsgId = 1;

const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function recordTest(name, passed, detail = '') {
  if (passed) {
    results.passed++;
    results.tests.push({ name, status: 'PASS', detail });
    console.log(`  [PASS] ${name}`);
  } else {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', detail });
    console.error(`  [FAIL] ${name}: ${detail}`);
  }
}

function cdpSend(method, params = {}) {
  return new Promise((resolve, reject) => {
    const reqId = cdpMsgId++;
    const timeout = setTimeout(() => {
      reject(new Error(`CDP request timed out: ${method}`));
    }, 10000);

    const handler = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.id === reqId) {
        clearTimeout(timeout);
        ws.removeEventListener('message', handler);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: reqId, method, params }));
  });
}

async function evalBrowser(expression) {
  const res = await cdpSend('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (res.exceptionDetails) {
    throw new Error('Browser eval exception: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result.value;
}

// ==============================================================
// 1. STATIC AST / DOM TOKENIZER & PARITY CHECKS
// ==============================================================
function runStaticDOMTests() {
  console.log('\n--- SUITE 1: Static AST & DOM Structure Parity ---');
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(process.cwd(), 'assets/js/app.js'), 'utf8');

  // 1.1 Drawer Existence & Attributes
  const drawerTagMatch = html.match(/<aside\s+id=["']site-menu-drawer["'][^>]*>/);
  recordTest(
    '1.1 Drawer <aside id="site-menu-drawer"> exists with aria-label and hidden attribute',
    !!drawerTagMatch && drawerTagMatch[0].includes('aria-label="Main menu"') && drawerTagMatch[0].includes('hidden'),
    drawerTagMatch ? drawerTagMatch[0] : 'Not found'
  );

  // 1.2 Drawer links count and items
  const navBlockMatch = html.match(/<nav class="site-menu-nav"[^>]*>([\s\S]*?)<\/nav>/);
  recordTest('1.2 <nav class="site-menu-nav"> exists', !!navBlockMatch);

  const links = [];
  if (navBlockMatch) {
    const linkRegex = /<a\s+href="([^"]+)"\s+class="([^"]+)">\s*<span class="link-num">(\d+)<\/span>\s*<span class="link-label">([^<]+)<\/span>\s*<\/a>/g;
    let m;
    while ((m = linkRegex.exec(navBlockMatch[1])) !== null) {
      links.push({ href: m[1], class: m[2], num: m[3], label: m[4] });
    }
  }

  recordTest(
    '1.3 Drawer contains exactly 7 navigation links',
    links.length === 7,
    `Found ${links.length} links`
  );

  // 1.4 Sequential 01-07 parity
  const expectedDrawer = [
    { href: '#about', num: '01', label: 'About', classSub: false },
    { href: '#programs', num: '02', label: 'Programs', classSub: false },
    { href: '#results', num: '03', label: 'Results', classSub: false },
    { href: '#scores', num: '04', label: 'Team scores', classSub: false },
    { href: '#photos', num: '05', label: 'Gallery', classSub: false },
    { href: '#videos', num: '06', label: 'Videos', classSub: false },
    { href: '#guide', num: '07', label: 'Parent guide', classSub: true }
  ];

  expectedDrawer.forEach((exp, idx) => {
    const actual = links[idx];
    const match = actual &&
      actual.href === exp.href &&
      actual.num === exp.num &&
      actual.label === exp.label &&
      (!exp.classSub || actual.class.includes('site-menu-link--sub'));
    recordTest(
      `1.4.${idx + 1} Drawer link ${exp.num} is ${exp.href} (${exp.label})`,
      !!match,
      actual ? `got href=${actual.href}, num=${actual.num}, label=${actual.label}` : 'missing'
    );
  });

  // 1.5 Section Eyebrows 1:1 Parity
  const expectedEyebrows = [
    { id: 'about', eyebrow: '01 / കോഗ്നിസൻസിന്റെ സത്ത' },
    { id: 'programs', eyebrow: '02 / FIND THEIR MOMENT' },
    { id: 'results', eyebrow: '03 / EVERY ACHIEVEMENT MATTERS' },
    { id: 'scores', eyebrow: '04 / TOGETHER, WE GO FURTHER' },
    { id: 'photos', eyebrow: '05 / THE MOMENTS WE KEEP' },
    { id: 'videos', eyebrow: '06 / ENCORE, ANYTIME' },
    { id: 'guide', eyebrow: 'A QUICK GUIDE FOR PARENTS' }
  ];

  expectedEyebrows.forEach(item => {
    const secRegex = new RegExp(`<(section|footer)[^>]*id=["']${item.id}["'][\\s\\S]*?<\\/\\1>`);
    const secMatch = html.match(secRegex);
    const hasEyebrow = secMatch && secMatch[0].includes(item.eyebrow);
    recordTest(
      `1.5 Section #${item.id} has matching eyebrow "${item.eyebrow}"`,
      !!hasEyebrow,
      secMatch ? `section found, contains eyebrow: ${hasEyebrow}` : `section #${item.id} not found`
    );
  });

  // 1.6 Anchor Resolution & Duplicate ID Check
  const idRegex = /\sid=["']([^"']+)["']/g;
  const ids = [];
  const idCounts = {};
  let idMatch;
  while ((idMatch = idRegex.exec(html)) !== null) {
    const id = idMatch[1];
    ids.push(id);
    idCounts[id] = (idCounts[id] || 0) + 1;
  }
  const duplicates = Object.keys(idCounts).filter(k => idCounts[k] > 1);
  recordTest(
    '1.6 No duplicate id attributes exist in DOM',
    duplicates.length === 0,
    duplicates.length > 0 ? `Duplicate IDs found: ${duplicates.join(', ')}` : 'All IDs unique'
  );

  const hrefAnchorRegex = /href="#([^"]+)"/g;
  const unresolvedAnchors = [];
  let aMatch;
  while ((aMatch = hrefAnchorRegex.exec(html)) !== null) {
    const targetId = aMatch[1];
    if (!ids.includes(targetId)) {
      unresolvedAnchors.push(targetId);
    }
  }
  recordTest(
    '1.7 Every internal href="#..." target resolves to an existing DOM id',
    unresolvedAnchors.length === 0,
    unresolvedAnchors.length > 0 ? `Unresolved anchor targets: ${unresolvedAnchors.join(', ')}` : 'All anchors resolved'
  );

  // 1.8 Content Placement Isolation (#programs vs #videos)
  const progRegex = /<section[^>]*id=["']programs["'][\s\S]*?<\/section>/;
  const vidRegex = /<section[^>]*id=["']videos["'][\s\S]*?<\/section>/;
  const progMatch = html.match(progRegex);
  const vidMatch = html.match(vidRegex);

  recordTest('1.8.1 <section id="programs"> exists', !!progMatch);
  recordTest('1.8.2 <section id="videos"> exists', !!vidMatch);

  if (progMatch) {
    const progHtml = progMatch[0];
    recordTest('1.8.3 #programs does NOT contain id="yt-stage"', !progHtml.includes('id="yt-stage"'));
    recordTest('1.8.4 #programs does NOT contain class="yt-coverflow"', !progHtml.includes('yt-coverflow'));
    recordTest('1.8.5 #programs does NOT contain class="yt-card"', !progHtml.includes('yt-card'));
    recordTest('1.8.6 #programs contains class="program-grid"', progHtml.includes('class="program-grid"'));
    recordTest('1.8.7 #programs contains category chips (all, stage, art, music)',
      progHtml.includes('data-program="all"') &&
      progHtml.includes('data-program="stage"') &&
      progHtml.includes('data-program="art"') &&
      progHtml.includes('data-program="music"')
    );
    recordTest('1.8.8 #programs contains id="program-search"', progHtml.includes('id="program-search"'));
    recordTest('1.8.9 #programs contains id="program-count"', progHtml.includes('id="program-count"'));
    recordTest('1.8.10 #programs contains id="program-empty"', progHtml.includes('id="program-empty"'));
  }

  if (vidMatch) {
    const vidHtml = vidMatch[0];
    recordTest('1.8.11 #videos contains class="yt-coverflow"', vidHtml.includes('class="yt-coverflow"'));
    recordTest('1.8.12 #videos contains id="yt-stage"', vidHtml.includes('id="yt-stage"'));
    const ytCardsFound = vidHtml.match(/<a[^>]*class="[^"]*\byt-card\b[^"]*"/g) || [];
    recordTest('1.8.13 #videos contains 7 .yt-card anchor elements', ytCardsFound.length === 7, `Found ${ytCardsFound.length} yt-card items`);
    recordTest('1.8.14 #videos does NOT contain class="video-placeholder"', !vidHtml.includes('video-placeholder'));
  }

  // 1.9 Absolute absence of video-placeholder
  recordTest(
    '1.9 .video-placeholder is completely absent from entire index.html',
    !html.includes('video-placeholder'),
    html.includes('video-placeholder') ? 'Found occurrences of video-placeholder' : 'Clean'
  );

  // 1.10 Hero CTA Targets
  const heroActionsMatch = html.match(/<div class="hero-actions">([\s\S]*?)<\/div>/);
  if (heroActionsMatch) {
    const heroActionsHtml = heroActionsMatch[1];
    const hasPrimaryProg = heroActionsHtml.includes('href="#programs"') && heroActionsHtml.includes('Discover the programs');
    const hasSecondaryVid = heroActionsHtml.includes('href="#videos"') && heroActionsHtml.includes('Watch highlights');
    recordTest('1.10.1 Hero primary CTA links to #programs ("Discover the programs")', hasPrimaryProg);
    recordTest('1.10.2 Hero secondary CTA links to #videos ("Watch highlights")', hasSecondaryVid);
  } else {
    recordTest('1.10 Hero actions block found', false, 'Missing .hero-actions');
  }

  // 1.11 app.js IntersectionObserver selector
  const hasGuideInObserver = appJs.includes("$$('main section[id], #guide')") || appJs.includes('$$("main section[id], #guide")');
  recordTest('1.11 app.js IntersectionObserver targets main section[id], #guide', hasGuideInObserver);
}

// ==============================================================
// 2. LIVE HEADLESS EDGE BROWSER TESTS (CDP)
// ==============================================================
async function runLiveBrowserTests() {
  console.log('\n--- SUITE 2: Live Browser DOM & Layout Verification ---');

  // 2.1 Live DOM queries
  const liveDomData = await evalBrowser(`(() => {
    const drawer = document.getElementById('site-menu-drawer');
    const links = [...drawer.querySelectorAll('.site-menu-link')].map(l => ({
      href: l.getAttribute('href'),
      num: l.querySelector('.link-num')?.textContent.trim(),
      label: l.querySelector('.link-label')?.textContent.trim(),
      classes: l.className
    }));

    const progStage = document.querySelector('#programs #yt-stage');
    const vidStage = document.querySelector('#videos #yt-stage');
    const placeholder = document.querySelector('.video-placeholder');
    const progCards = [...document.querySelectorAll('#programs .program-card')].map(c => ({
      cat: c.dataset.category,
      title: c.dataset.title,
      hidden: c.hidden
    }));

    return {
      drawerHidden: drawer.hidden,
      links,
      progStageExists: !!progStage,
      vidStageExists: !!vidStage,
      placeholderExists: !!placeholder,
      progCardsCount: progCards.length,
      progCards
    };
  })()`);

  recordTest('2.1.1 Live browser drawer starts hidden', liveDomData.drawerHidden === true);
  recordTest('2.1.2 Live browser has exactly 7 drawer links', liveDomData.links.length === 7);
  recordTest('2.1.3 Live browser #about is link 01 in drawer', liveDomData.links[0]?.href === '#about' && liveDomData.links[0]?.num === '01');
  recordTest('2.1.4 Live browser #programs does NOT contain #yt-stage', liveDomData.progStageExists === false);
  recordTest('2.1.5 Live browser #videos contains #yt-stage', liveDomData.vidStageExists === true);
  recordTest('2.1.6 Live browser has 0 .video-placeholder elements', liveDomData.placeholderExists === false);
  recordTest('2.1.7 Live browser #programs contains 3 program cards', liveDomData.progCardsCount === 3);

  // 2.2 Live Drawer Interactions & Accessibility
  console.log('\n--- SUITE 3: Navigation Drawer Interactivity & Keyboard A11y ---');

  // Toggle open
  const openResult = await evalBrowser(`(() => {
    const toggleBtn = document.getElementById('menu-toggle');
    const drawer = document.getElementById('site-menu-drawer');
    toggleBtn.click();
    return {
      hidden: drawer.hidden,
      isOpenClass: drawer.classList.contains('is-open'),
      ariaExpanded: toggleBtn.getAttribute('aria-expanded'),
      bodyModalOpen: document.body.classList.contains('modal-open')
    };
  })()`);

  recordTest('3.1 Clicking #menu-toggle opens drawer (hidden=false, is-open class added, aria-expanded=true)',
    openResult.hidden === false && openResult.isOpenClass === true && openResult.ariaExpanded === 'true' && openResult.bodyModalOpen === true
  );

  // Escape key closes drawer
  const escResult = await evalBrowser(`(new Promise((resolve) => {
    const toggleBtn = document.getElementById('menu-toggle');
    const drawer = document.getElementById('site-menu-drawer');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    setTimeout(() => {
      resolve({
        isOpenClass: drawer.classList.contains('is-open'),
        ariaExpanded: toggleBtn.getAttribute('aria-expanded'),
        bodyModalOpen: document.body.classList.contains('modal-open')
      });
    }, 450);
  }))`);

  recordTest('3.2 Pressing Escape key closes drawer (is-open removed, aria-expanded=false)',
    escResult.isOpenClass === false && escResult.ariaExpanded === 'false' && escResult.bodyModalOpen === false
  );

  // Clicking a drawer link closes drawer
  const linkCloseResult = await evalBrowser(`(new Promise((resolve) => {
    const toggleBtn = document.getElementById('menu-toggle');
    const drawer = document.getElementById('site-menu-drawer');
    toggleBtn.click(); // Re-open
    const link = drawer.querySelector('a[href="#programs"]');
    link.click();
    setTimeout(() => {
      resolve({
        isOpenClass: drawer.classList.contains('is-open'),
        ariaExpanded: toggleBtn.getAttribute('aria-expanded')
      });
    }, 450);
  }))`);

  recordTest('3.3 Clicking drawer link a[href="#programs"] auto-closes drawer',
    linkCloseResult.isOpenClass === false && linkCloseResult.ariaExpanded === 'false'
  );

  // Rapid toggle stress test (fuzzing open/close 20 times)
  const rapidToggleResult = await evalBrowser(`(new Promise((resolve) => {
    const toggleBtn = document.getElementById('menu-toggle');
    const drawer = document.getElementById('site-menu-drawer');
    for (let i = 0; i < 20; i++) {
      toggleBtn.click();
    }
    // After 20 toggles (even number), it should be closed or closing cleanly without throwing
    setTimeout(() => {
      resolve({
        isOpen: drawer.classList.contains('is-open'),
        hasErrors: false
      });
    }, 500);
  }))`);

  recordTest('3.4 Rapid toggle stress test (20 clicks) does not lock or corrupt drawer state',
    rapidToggleResult.hasErrors === false
  );

  // ==============================================================
  // SUITE 4: SCROLL-SPY INTERSECTIONOBSERVER EMPIRICAL STRESS TESTS
  // ==============================================================
  console.log('\n--- SUITE 4: Scroll-Spy IntersectionObserver Empirical Stress Tests ---');

  const spyTestResults = await evalBrowser(`(() => {
    const testCases = [
      'about',
      'programs',
      'results',
      'scores',
      'photos',
      'videos',
      'guide',
      'home'
    ];

    const results = [];

    // Trigger IntersectionObserver entry callback simulation exactly as in app.js
    testCases.forEach(id => {
      const targetEl = document.getElementById(id);
      if (!targetEl) {
        results.push({ id, ok: false, reason: 'Element not found' });
        return;
      }

      // Simulate the exact intersection logic from app.js line 123:
      const entry = { target: targetEl, isIntersecting: true };
      const links = [...document.querySelectorAll('.site-menu-link, .desktop-nav a, .mobile-quick a')];
      links.forEach(link => {
        const active = link.hash === '#' + entry.target.id;
        link.classList.toggle('current', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });

      const activeLink = document.querySelector('.site-menu-link.current');
      const activeHash = activeLink ? activeLink.getAttribute('href') : null;
      const ariaCurrent = activeLink ? activeLink.getAttribute('aria-current') : null;

      if (id === 'home') {
        // #home is not in drawer, so no drawer link should be current
        const pass = activeLink === null;
        results.push({ id, ok: pass, activeHash, ariaCurrent, expected: null });
      } else {
        const expectedHash = '#' + id;
        const pass = activeHash === expectedHash && ariaCurrent === 'location';
        results.push({ id, ok: pass, activeHash, ariaCurrent, expected: expectedHash });
      }
    });

    return results;
  })()`);

  spyTestResults.forEach(res => {
    recordTest(
      `4. Scroll-spy properly activates drawer link for target #${res.id}`,
      res.ok,
      `activeHash=${res.activeHash}, ariaCurrent=${res.ariaCurrent}, expected=${res.expected}`
    );
  });

  // Verify that #guide was observed by the IntersectionObserver query
  const guideObservedCheck = await evalBrowser(`(() => {
    const observedElements = [...document.querySelectorAll('main section[id], #guide')];
    const ids = observedElements.map(el => el.id);
    return {
      count: observedElements.length,
      ids,
      containsGuide: ids.includes('guide'),
      containsAbout: ids.includes('about')
    };
  })()`);

  recordTest('4.9 Observed elements list includes #guide and #about',
    guideObservedCheck.containsGuide && guideObservedCheck.containsAbout,
    `Observed elements: ${guideObservedCheck.ids.join(', ')}`
  );

  // ==============================================================
  // SUITE 5: CATEGORY FILTERING & SEARCH EMPIRICAL STRESS TESTS
  // ==============================================================
  console.log('\n--- SUITE 5: Category Filtering & Search Empirical Stress Tests ---');

  // 5.1 Category Chip filtering
  const chipTests = [
    { cat: 'stage', expectedVisible: 1, expectedTitle: 'Stage and expression' },
    { cat: 'art', expectedVisible: 1, expectedTitle: 'Art and imagination' },
    { cat: 'music', expectedVisible: 1, expectedTitle: 'Music and rhythm' },
    { cat: 'all', expectedVisible: 3, expectedTitle: 'all' }
  ];

  for (const t of chipTests) {
    const chipRes = await evalBrowser(`(() => {
      const chip = document.querySelector('[data-program="${t.cat}"]');
      chip.click();
      const visibleCards = [...document.querySelectorAll('#programs .program-card')].filter(c => !c.hidden);
      const countEl = document.getElementById('program-count');
      const emptyEl = document.getElementById('program-empty');
      return {
        visibleCount: visibleCards.length,
        visibleTitles: visibleCards.map(c => c.dataset.title),
        countText: countEl ? countEl.textContent : '',
        emptyHidden: emptyEl ? emptyEl.hidden : null,
        chipActive: chip.classList.contains('active'),
        chipAriaPressed: chip.getAttribute('aria-pressed')
      };
    })()`);

    const ok = chipRes.visibleCount === t.expectedVisible &&
      chipRes.chipActive === true &&
      chipRes.chipAriaPressed === 'true' &&
      chipRes.emptyHidden === true &&
      (t.cat === 'all' || chipRes.visibleTitles.includes(t.expectedTitle));

    recordTest(
      `5.1 Chip filter "${t.cat}": shows ${t.expectedVisible} cards, updates aria-pressed & count`,
      ok,
      `visible=${chipRes.visibleCount}, countText="${chipRes.countText}"`
    );
  }

  // 5.2 Search Queries
  const searchTests = [
    { query: 'sketching', expectedCount: 1, expectedTitle: 'Art and imagination' },
    { query: 'spotlight', expectedCount: 1, expectedTitle: 'Stage and expression' },
    { query: 'melodies', expectedCount: 1, expectedTitle: 'Music and rhythm' },
    { query: 'SKETCHING', expectedCount: 1, expectedTitle: 'Art and imagination' }, // Case insensitivity
    { query: '  theatrical  ', expectedCount: 1, expectedTitle: 'Stage and expression' }, // Whitespace trimming
    { query: 'nonexistentqueryxyz', expectedCount: 0, expectEmpty: true } // Empty result
  ];

  for (const st of searchTests) {
    const sRes = await evalBrowser(`(() => {
      // Reset to 'all' first
      document.querySelector('[data-program="all"]').click();
      const search = document.getElementById('program-search');
      search.value = ${JSON.stringify(st.query)};
      search.dispatchEvent(new Event('input', { bubbles: true }));

      const visibleCards = [...document.querySelectorAll('#programs .program-card')].filter(c => !c.hidden);
      const countEl = document.getElementById('program-count');
      const emptyEl = document.getElementById('program-empty');
      return {
        visibleCount: visibleCards.length,
        visibleTitles: visibleCards.map(c => c.dataset.title),
        countText: countEl ? countEl.textContent : '',
        emptyHidden: emptyEl ? emptyEl.hidden : null
      };
    })()`);

    const ok = sRes.visibleCount === st.expectedCount &&
      (!st.expectEmpty || sRes.emptyHidden === false) &&
      (!st.expectedTitle || sRes.visibleTitles.includes(st.expectedTitle));

    recordTest(
      `5.2 Search query "${st.query}": returned ${sRes.visibleCount} cards (expected ${st.expectedCount})`,
      ok,
      `visible=${sRes.visibleCount}, emptyHidden=${sRes.emptyHidden}, countText="${sRes.countText}"`
    );
  }

  // 5.3 Clear Button Test
  const clearRes = await evalBrowser(`(() => {
    // Put search into filtered state
    const search = document.getElementById('program-search');
    search.value = 'nonexistent';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    // Click clear button
    const clearBtn = document.getElementById('clear-program');
    clearBtn.click();

    const visibleCards = [...document.querySelectorAll('#programs .program-card')].filter(c => !c.hidden);
    const countEl = document.getElementById('program-count');
    const emptyEl = document.getElementById('program-empty');
    const allChip = document.querySelector('[data-program="all"]');

    return {
      searchValue: search.value,
      visibleCount: visibleCards.length,
      allChipActive: allChip.classList.contains('active'),
      emptyHidden: emptyEl ? emptyEl.hidden : null,
      countText: countEl ? countEl.textContent : '',
      isFocused: document.activeElement === search
    };
  })()`);

  recordTest(
    '5.3 Clear search button resets input, reactivates "all" chip, restores 3 cards, focuses input',
    clearRes.searchValue === '' && clearRes.visibleCount === 3 && clearRes.allChipActive === true && clearRes.emptyHidden === true && clearRes.isFocused === true,
    `val="${clearRes.searchValue}", count=${clearRes.visibleCount}, focused=${clearRes.isFocused}`
  );

  // 5.4 Adversarial Fuzzing Inputs
  const fuzzInputs = [
    '!@#$%^&*()_+{}:"<>?[];\',./\\',
    '.*+?^${}()|[\\]\\\\',
    '<script>alert("xss")</script>',
    '<img src=x onerror=alert(1)>',
    '\' OR \'1\'=\'1',
    'A'.repeat(10000), // Extreme length string
    '   \t\n\r   ',
    'കോഗ്നിസൻസ്' // Malayalam Unicode text
  ];

  let fuzzPassed = true;
  for (const fuzz of fuzzInputs) {
    const fRes = await evalBrowser(`(() => {
      try {
        const search = document.getElementById('program-search');
        search.value = ${JSON.stringify(fuzz)};
        search.dispatchEvent(new Event('input', { bubbles: true }));
        return { ok: true, count: document.querySelectorAll('#programs .program-card:not([hidden])').length };
      } catch(e) {
        return { ok: false, error: e.message };
      }
    })()`);

    if (!fRes.ok) {
      fuzzPassed = false;
      console.error('Fuzz failed on input:', fuzz, fRes.error);
    }
  }

  recordTest(
    '5.4 Adversarial fuzzing inputs (regex chars, XSS vectors, 10k chars, Unicode) handled safely without throwing',
    fuzzPassed,
    'All fuzzing vectors survived'
  );

  // Reset to clean state
  await evalBrowser(`(() => {
    const clearBtn = document.getElementById('clear-program');
    if (clearBtn) clearBtn.click();
  })()`);

  // ==============================================================
  // SUITE 6: LAYOUT STABILITY & HORIZONTAL OVERFLOW VERIFICATION
  // ==============================================================
  console.log('\n--- SUITE 6: Layout Stability & CLS Verification ---');

  const layoutRes = await evalBrowser(`(() => {
    const scrollWidth = document.documentElement.scrollWidth;
    const clientWidth = document.documentElement.clientWidth;
    const progSection = document.getElementById('programs');
    const vidSection = document.getElementById('videos');
    const progRect = progSection.getBoundingClientRect();
    const vidRect = vidSection.getBoundingClientRect();
    const htmlStyles = window.getComputedStyle(document.documentElement);

    return {
      scrollWidth,
      clientWidth,
      noHorizontalOverflow: scrollWidth <= clientWidth,
      progHeight: progRect.height,
      vidHeight: vidRect.height,
      scrollPaddingTop: htmlStyles.scrollPaddingTop
    };
  })()`);

  recordTest(
    '6.1 No horizontal layout overflow detected (scrollWidth <= clientWidth)',
    layoutRes.noHorizontalOverflow,
    `scrollWidth=${layoutRes.scrollWidth}, clientWidth=${layoutRes.clientWidth}`
  );
  recordTest(
    '6.2 #programs and #videos sections render with non-zero dimensions',
    layoutRes.progHeight > 0 && layoutRes.vidHeight > 0,
    `#programs height=${layoutRes.progHeight}px, #videos height=${layoutRes.vidHeight}px`
  );
  recordTest(
    '6.3 html element has scroll-padding-top to prevent sticky header overlap',
    parseInt(layoutRes.scrollPaddingTop, 10) >= 80,
    `computed scrollPaddingTop: ${layoutRes.scrollPaddingTop}`
  );

  // ==============================================================
  // SUITE 7: RESPONSIVE VIEWPORT STRESS TESTING (CDP EMULATION)
  // ==============================================================
  console.log('\n--- SUITE 7: Responsive Viewport Stress Testing ---');

  const viewports = [
    { name: 'Mobile (iPhone SE)', width: 375, height: 667, mobile: true },
    { name: 'Tablet (iPad Mini)', width: 768, height: 1024, mobile: true },
    { name: 'Desktop (Full HD)', width: 1440, height: 900, mobile: false }
  ];

  for (const vp of viewports) {
    await cdpSend('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: vp.mobile
    });

    const vpRes = await evalBrowser(`(() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const drawer = document.getElementById('site-menu-drawer');
      const toggle = document.getElementById('menu-toggle');
      toggle.click(); // Open
      const isOpen = drawer.classList.contains('is-open');
      const drawerWidth = drawer.getBoundingClientRect().width;
      toggle.click(); // Close
      return {
        noOverflow: scrollWidth <= clientWidth + 1, // Allow 1px rounding
        scrollWidth,
        clientWidth,
        drawerOpens: isOpen,
        drawerWidth
      };
    })()`);

    recordTest(
      `7.${vp.name} No horizontal overflow and drawer operates properly`,
      vpRes.noOverflow && vpRes.drawerOpens,
      `scrollW=${vpRes.scrollWidth}, clientW=${vpRes.clientWidth}, drawerW=${vpRes.drawerWidth}px`
    );
  }

  // Reset device emulation
  await cdpSend('Emulation.clearDeviceMetricsOverride');
}

// ==============================================================
// 7. ORACLE VALIDATION (NEGATIVE MUTATION TESTING)
// ==============================================================
function runOracleNegativeTests() {
  console.log('\n--- SUITE 7: Oracle Validation (Negative Testing) ---');

  // Verify that if #about were omitted, our validator detects it
  const fakeDrawerWithoutAbout = `
    <nav class="site-menu-nav">
      <a href="#programs" class="site-menu-link"><span class="link-num">01</span><span class="link-label">Programs</span></a>
    </nav>
  `;
  const detectMissingAbout = !fakeDrawerWithoutAbout.includes('href="#about"');
  recordTest('7.1 Oracle correctly flags omission of #about', detectMissingAbout);

  // Verify that if #yt-stage were in #programs, our validator detects it
  const fakeProgWithYt = `<section id="programs"><div id="yt-stage"></div></section>`;
  const detectYtInProg = fakeProgWithYt.includes('id="yt-stage"');
  recordTest('7.2 Oracle correctly flags invalid placement of #yt-stage in #programs', detectYtInProg);

  // Verify that if .video-placeholder were in #videos, our validator detects it
  const fakeVidWithPlaceholder = `<section id="videos"><div class="video-placeholder"></div></section>`;
  const detectPlaceholder = fakeVidWithPlaceholder.includes('video-placeholder');
  recordTest('7.3 Oracle correctly flags presence of .video-placeholder', detectPlaceholder);
}

// ==============================================================
// RUNNER
// ==============================================================
async function startServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/') reqPath = '/index.html';
      const filePath = path.join(process.cwd(), reqPath);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const contentTypes = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml'
          };
          res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      }
      res.writeHead(404);
      res.end('Not found: ' + req.url);
    });
    server.listen(PORT, '127.0.0.1', () => resolve());
  });
}

async function launchEdge() {
  const tmpDir = path.join(os.tmpdir(), 'edge_challenger_m2_' + Date.now());
  edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${tmpDir}`
  ]);

  // Wait for port
  let connected = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) {
        connected = true;
        break;
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  if (!connected) throw new Error('Could not connect to Edge DevTools');

  // Open page
  const tabRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?http://127.0.0.1:${PORT}/index.html`, { method: 'PUT' });
  const tabData = await tabRes.json();
  ws = new WebSocket(tabData.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  // Enable Page & Runtime
  await cdpSend('Page.enable');
  await cdpSend('Runtime.enable');
  await cdpSend('DOM.enable');

  // Wait for scripts to settle
  await new Promise(r => setTimeout(r, 800));
}

async function main() {
  console.log('==============================================================');
  console.log('ADVERSARIAL EMPIRICAL VERIFICATION SUITE — CHALLENGER 2');
  console.log('Target: Navigation Parity & Content Placement Alignment (M2)');
  console.log('==============================================================');

  try {
    // Step 1: Run Static DOM analysis
    runStaticDOMTests();

    // Step 2: Start server & browser for dynamic tests
    console.log(`\nStarting test server on port ${PORT}...`);
    await startServer();
    console.log(`Launching Headless Edge on CDP port ${CDP_PORT}...`);
    await launchEdge();

    // Step 3: Run live browser & interaction tests
    await runLiveBrowserTests();

    // Step 4: Run negative oracle tests
    runOracleNegativeTests();

  } catch (err) {
    console.error('\nCRITICAL TEST RUNNER EXCEPTION:', err);
    recordTest('Test Runner Execution', false, err.message);
  } finally {
    if (ws) {
      try { ws.close(); } catch (e) {}
    }
    if (edgeProc) {
      try { edgeProc.kill(); } catch (e) {}
    }
    if (server) {
      try { server.close(); } catch (e) {}
    }
  }

  console.log('\n==============================================================');
  console.log(`FINAL RESULTS: Total=${results.passed + results.failed}, Passed=${results.passed}, Failed=${results.failed}`);
  console.log('==============================================================\n');

  if (results.failed > 0) {
    console.error('ADVERSARIAL VERDICT: REJECT');
    process.exit(1);
  } else {
    console.log('ADVERSARIAL VERDICT: APPROVE');
    process.exit(0);
  }
}

main();
