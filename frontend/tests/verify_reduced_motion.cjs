const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// Resolves playwright portably
function getPlaywright() {
  try {
    return require('playwright');
  } catch {
    const fallbackDir = process.env.NODE_PATH || 'C:/Users/Shivraj Dhote/AppData/Roaming/npm/node_modules/omniroute/node_modules';
    return require(path.join(fallbackDir, 'playwright'));
  }
}

const { chromium } = getPlaywright();

(async () => {
  let browser;
  try {
    // Attempt standard chrome or bundled chromium launch
    browser = await chromium.launch({
      headless: true,
      channel: 'chrome',
    }).catch(async () => {
      return chromium.launch({ headless: true });
    });

    console.log('--- VERIFYING REDUCED MOTION ACCESSIBILITY ---');

    // 1. Desktop Viewport
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });

    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

    const isDesktopHeroVisible = await page
      .locator('.hidden.lg\\:block .hero-motion-image')
      .isVisible();
    assert.strictEqual(
      isDesktopHeroVisible,
      true,
      'Desktop hero image must be immediately visible under prefers-reduced-motion: reduce'
    );
    console.log('✅ PASS: Desktop hero image is immediately visible.');

    // 2. Mobile Viewport
    const mobilePage = await browser.newPage({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });

    await mobilePage.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

    const isMobileHeroVisible = await mobilePage
      .locator('.lg\\:hidden .hero-motion-image')
      .isVisible();
    assert.strictEqual(
      isMobileHeroVisible,
      true,
      'Mobile hero image must be immediately visible under prefers-reduced-motion: reduce'
    );
    console.log('✅ PASS: Mobile hero image is immediately visible.');

    // 3. Scroll Reveal Elements
    const reveals = await page.locator('.reveal-on-scroll').evaluateAll((els) => {
      return els.map(
        (el) => el.classList.contains('is-revealed') && !el.classList.contains('reveal-primed')
      );
    });

    assert.ok(reveals.length > 0, 'Page should contain reveal-on-scroll sections');
    assert.ok(
      reveals.every(Boolean),
      `All ${reveals.length} scroll reveal sections must be revealed immediately on load without delayed motion`
    );
    console.log(`✅ PASS: All ${reveals.length} scroll reveals are immediately unblocked and visible on load.`);

    console.log('>>> ALL REDUCED-MOTION ASSERTIONS PASSED! <<<');
  } catch (err) {
    console.error('❌ FAIL: Reduced motion check failed with error:', err.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
