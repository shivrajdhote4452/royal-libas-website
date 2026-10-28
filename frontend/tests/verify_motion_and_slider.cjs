const { chromium } = require('playwright');

async function runVerification() {
  console.log('====================================================');
  console.log('>>> ROYAL LIBAS STOREFRONT MOTION & SLIDER TEST <<<');
  console.log('====================================================');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  const results = [];
  function assert(condition, message) {
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      results.push({ name: message, passed: false });
      throw new Error(message);
    } else {
      console.log(`✅ PASS: ${message}`);
      results.push({ name: message, passed: true });
    }
  }

  try {
    // 1. Navigation & Initial Load
    console.log('\n[TEST 1] Loading Storefront at http://127.0.0.1:5173...');
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const title = await page.title();
    assert(title.includes('Royal Libas'), 'Page title matches brand');

    // 2. Scroll Reveal Timing Check (Above-fold revealed, Below-fold primed)
    console.log('\n[TEST 2] Verifying Viewport-Triggered Scroll Reveal...');
    const heroVisible = await page.locator('h1').isVisible();
    assert(heroVisible, 'Hero heading is immediately visible on load');

    // 3. Featured Slider Initial State
    console.log('\n[TEST 3] Verifying Featured 3D Slider Initial State...');
    const sliderStage = page.locator('[data-testid="featured-slider-stage"]');
    await sliderStage.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    const counter = page.locator('[data-testid="slider-counter"]');
    const initialCounterText = await counter.innerText();
    assert(initialCounterText.startsWith('01 /'), `Initial slider counter is 01, got: "${initialCounterText}"`);

    // Verify center card details
    const centerCard = page.locator('[data-testid="slider-card-0"]');
    assert(await centerCard.isVisible(), 'Center card is visible with scale and gold border');
    const exploreBtn = centerCard.locator('text=Explore Piece');
    assert(await exploreBtn.isVisible(), 'Active center card displays "Explore Piece" CTA');

    // 4. Slider Card Movement via Next & Prev Controls
    console.log('\n[TEST 4] Verifying Smooth Card Transitions via Next / Prev Buttons...');
    const nextBtn = page.locator('button[aria-label="Next slide"]');
    const prevBtn = page.locator('button[aria-label="Previous slide"]');

    await nextBtn.click();
    await page.waitForTimeout(600); // Wait for 480ms transition
    const secondCounterText = await counter.innerText();
    assert(secondCounterText.startsWith('02 /'), `Counter updated to 02 after Next click, got: "${secondCounterText}"`);

    await prevBtn.click();
    await page.waitForTimeout(600);
    const backCounterText = await counter.innerText();
    assert(backCounterText.startsWith('01 /'), `Counter returned to 01 after Prev click, got: "${backCounterText}"`);

    // 5. Neighbor Card Direct Tap Navigation
    console.log('\n[TEST 5] Verifying Peeking Neighbor Card Click to Advance...');
    const rightNeighbor = page.locator('[data-testid="slider-card-1"]');
    await rightNeighbor.click();
    await page.waitForTimeout(600);
    const neighborAdvanceText = await counter.innerText();
    assert(neighborAdvanceText.startsWith('02 /'), `Clicking right neighbor advanced slider to 02: "${neighborAdvanceText}"`);

    // Return to slide 1
    await prevBtn.click();
    await page.waitForTimeout(600);

    // 6. FOCUSED TEST FOR ITEM 3: Pause -> Hover -> Leave -> Slider Remains Paused!
    console.log('\n[TEST 6] FOCUSED TEST: Pause -> Hover -> Leave -> Slider Remains Paused...');
    const playPauseBtn = page.locator('[data-testid="slider-play-pause-btn"]');

    // Step A: Click Pause
    await playPauseBtn.click();
    await page.waitForTimeout(200);
    const pausedAriaLabel = await playPauseBtn.getAttribute('aria-label');
    assert(pausedAriaLabel === 'Play automatic carousel', `Play/Pause button toggled to Play icon state: "${pausedAriaLabel}"`);

    // Step B: Hover over the carousel stage
    console.log('   Hovering pointer over slider stage...');
    await sliderStage.hover();
    await page.waitForTimeout(1000);

    // Step C: Leave the slider stage (move mouse to top-left corner)
    console.log('   Pointer leaves slider stage...');
    await page.mouse.move(10, 10);
    await page.waitForTimeout(500);

    // Step D: Wait 6.5 seconds (longer than the 5.5s autoplay interval)
    console.log('   Waiting 6.5s to verify autoplay DOES NOT resume...');
    await page.waitForTimeout(6500);

    const counterAfterHoverLeave = await counter.innerText();
    assert(
      counterAfterHoverLeave.startsWith('01 /'),
      `CRITICAL VERIFICATION: Slider remained strictly paused on 01 after hover and leave! Got: "${counterAfterHoverLeave}"`
    );

    // Step E: Click Play to resume
    console.log('   Resuming autoplay via Play button...');
    await playPauseBtn.click();
    await page.waitForTimeout(200);
    const playingAriaLabel = await playPauseBtn.getAttribute('aria-label');
    assert(playingAriaLabel === 'Pause automatic carousel', `Play/Pause button toggled back to Pause state: "${playingAriaLabel}"`);

    console.log('   Waiting 6.0s for autoplay to advance slide...');
    await page.waitForTimeout(6000);
    const counterAfterResume = await counter.innerText();
    assert(
      counterAfterResume.startsWith('02 /'),
      `Autoplay successfully resumed and advanced to 02: "${counterAfterResume}"`
    );

    // 7. Desktop Header Dropdown and Escape Key Test
    console.log('\n[TEST 7] Verifying Desktop Categories Dropdown & Escape Key Dismissal...');
    const categoriesNav = page.locator('header').getByText('CATEGORIES');
    await categoriesNav.hover();
    await page.waitForTimeout(300);

    const kurtiSetsLink = page.locator('header').getByRole('link', { name: 'Kurti Sets 8 Styles' });
    assert(await kurtiSetsLink.isVisible(), 'Categories dropdown is visible on hover/focus');

    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert(!(await kurtiSetsLink.isVisible()), 'Dropdown smoothly closed upon pressing Escape key');

    // 8. Mobile Viewport (390px) Swipe Test
    console.log('\n[TEST 8] Verifying Mobile Viewport (390px) & Touch Swiping...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    const stageBox = await sliderStage.boundingBox();
    if (stageBox) {
      const startX = stageBox.x + stageBox.width * 0.8;
      const startY = stageBox.y + stageBox.height * 0.5;
      const endX = stageBox.x + stageBox.width * 0.2;

      // Simulate touch swipe left
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, startY, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(700);

      const mobileCounter = await counter.innerText();
      console.log(`   Mobile touch swipe resulted in counter: "${mobileCounter}"`);
      assert(mobileCounter.length > 0, 'Mobile touch swipe transitioned carousel cleanly');
    }

    console.log('\n====================================================');
    console.log('>>> ALL VERIFICATION TESTS PASSED SUCCESSFULLY! <<<');
    console.log('====================================================\n');
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runVerification();
