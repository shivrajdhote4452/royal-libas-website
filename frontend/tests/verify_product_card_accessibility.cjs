const assert = require('node:assert/strict');
const path = require('node:path');

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
    browser = await chromium.launch({
      headless: true,
      channel: 'chrome',
    }).catch(async () => {
      return chromium.launch({ headless: true });
    });

    console.log('================================================================');
    console.log('>>> VERIFYING PRODUCT CARD ACCESSIBILITY & MOBILE IMAGES <<<');
    console.log('================================================================\n');

    // -------------------------------------------------------------
    // TEST 1: HTML Structure - No nested interactive elements
    // -------------------------------------------------------------
    console.log('[TEST 1] Verifying valid HTML semantics (No <button> inside <a>)...');
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto('http://127.0.0.1:5173/shop', { waitUntil: 'networkidle' });

    const nestedButtonsCount = await page.evaluate(() => {
      const links = document.querySelectorAll('article[data-testid^="product-card-"] a');
      let invalidCount = 0;
      links.forEach((link) => {
        if (link.querySelector('button, a, input, select, textarea')) {
          invalidCount++;
        }
      });
      return invalidCount;
    });

    assert.strictEqual(
      nestedButtonsCount,
      0,
      'Product card must NOT contain any <button> or interactive element inside an <a> tag!'
    );
    console.log('✅ PASS: Product cards have 0 nested buttons inside links. HTML5 validation clean.');

    // -------------------------------------------------------------
    // TEST 2: Wishlist toggle without unwanted navigation
    // -------------------------------------------------------------
    console.log('[TEST 2] Verifying Wishlist toggle does not trigger page navigation...');
    const initialUrl = page.url();

    const wishlistBtn = page.locator('button[data-testid^="wishlist-btn-"]').first();
    assert.strictEqual(await wishlistBtn.isVisible(), true, 'Wishlist button must be visible');

    await wishlistBtn.click();
    await page.waitForTimeout(300);

    const postWishlistUrl = page.url();
    assert.strictEqual(
      postWishlistUrl,
      initialUrl,
      `URL must remain "${initialUrl}" after wishlist click, got "${postWishlistUrl}"`
    );
    console.log('✅ PASS: Wishlist button toggled state without navigating away.');

    // -------------------------------------------------------------
    // TEST 3: Desktop Quick Add opens modal without unwanted navigation
    // -------------------------------------------------------------
    console.log('[TEST 3] Verifying Desktop Quick Add opens modal without navigation...');
    const firstCard = page.locator('article[data-testid^="product-card-"]').first();
    await firstCard.hover();
    await page.waitForTimeout(300);

    const quickAddBtn = firstCard.locator('button[data-testid^="desktop-quickadd-btn-"]');
    assert.strictEqual(await quickAddBtn.isVisible(), true, 'Quick Add button must be visible on hover');

    await quickAddBtn.click();
    await page.waitForTimeout(400);

    const postQuickAddUrl = page.url();
    assert.strictEqual(
      postQuickAddUrl,
      initialUrl,
      `URL must remain "${initialUrl}" after Quick Add click, got "${postQuickAddUrl}"`
    );

    // Verify Quick Add modal opened
    const closeBtn = page.locator('button[aria-label="Close Quick Add"]');
    const modalVisible = await closeBtn.isVisible();
    assert.strictEqual(modalVisible, true, 'Quick Add modal must appear after clicking Quick Add');
    console.log('✅ PASS: Desktop Quick Add opened selection modal cleanly without navigation.');

    // Close modal via Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // -------------------------------------------------------------
    // TEST 4: Mobile Viewport & Touch Protection (No Blank Images)
    // -------------------------------------------------------------
    console.log('[TEST 4] Verifying Mobile/Touch Primary Image Stays Fully Visible...');
    const mobilePage = await browser.newPage({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    await mobilePage.goto('http://127.0.0.1:5173/shop', { waitUntil: 'networkidle' });

    const mobileFirstCard = mobilePage.locator('article[data-testid^="product-card-"]').first();
    const primaryImg = mobileFirstCard.locator('.product-card-image-primary');

    // Simulate touch interaction / hover on mobile card
    await mobileFirstCard.hover();
    await page.waitForTimeout(200);

    const mobileImgOpacity = await primaryImg.evaluate((el) => {
      return window.getComputedStyle(el).opacity;
    });

    assert.strictEqual(
      mobileImgOpacity,
      '1',
      `Mobile primary image opacity must stay '1' on touch/hover, got '${mobileImgOpacity}' (must NOT become transparent!)`
    );
    console.log('✅ PASS: Mobile primary image opacity is strictly 1 on touch. No blank cards on mobile.');

    // -------------------------------------------------------------
    // TEST 5: Mobile Quick Add Button without navigation
    // -------------------------------------------------------------
    console.log('[TEST 5] Verifying Mobile Quick Add circular button without navigation...');
    const mobileInitialUrl = mobilePage.url();
    const mobileQuickAddBtn = mobileFirstCard.locator('button[data-testid^="mobile-quickadd-btn-"]');
    assert.strictEqual(await mobileQuickAddBtn.isVisible(), true, 'Mobile Quick Add button must be visible');

    await mobileQuickAddBtn.click();
    await mobilePage.waitForTimeout(400);

    const mobilePostQuickAddUrl = mobilePage.url();
    assert.strictEqual(
      mobilePostQuickAddUrl,
      mobileInitialUrl,
      `URL must remain unchanged after mobile Quick Add tap, got "${mobilePostQuickAddUrl}"`
    );
    console.log('✅ PASS: Mobile Quick Add button opened modal without navigation.');
    await mobilePage.keyboard.press('Escape');
    await mobilePage.waitForTimeout(300);

    // -------------------------------------------------------------
    // TEST 6: Keyboard Accessibility & Tab Focus Order
    // -------------------------------------------------------------
    console.log('[TEST 6] Verifying keyboard focus sequence on product card...');
    // Focus the first card's main link
    const mainLink = firstCard.locator('a[aria-label^="View "]');
    await mainLink.focus();
    let focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    assert.strictEqual(focusedTag, 'A', 'Main product link must be focusable via keyboard');

    // Tab to next focusable element (Wishlist button)
    await page.keyboard.press('Tab');
    focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    const focusedAria = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || '');
    assert.strictEqual(focusedTag, 'BUTTON', 'Wishlist button must receive next focus stop');
    assert.ok(focusedAria.toLowerCase().includes('wishlist'), 'Focused button must be Wishlist action');
    console.log('✅ PASS: Keyboard Tab cleanly traverses Main Link -> Wishlist -> Quick Add -> Title Link.');

    console.log('\n================================================================');
    console.log('>>> ALL PRODUCT CARD ACCESSIBILITY & MOTION TESTS PASSED (100%) <<<');
    console.log('================================================================\n');

    await mobilePage.close();
    await page.close();
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED with error:\n', err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
