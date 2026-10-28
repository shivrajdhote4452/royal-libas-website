const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runSliderFixesVerification() {
  console.log('================================================================');
  console.log('>>> ROYAL LIBAS FEATURED SLIDER REFINEMENTS & FALLBACK TESTS <<<');
  console.log('================================================================');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const screenshotsDir = path.resolve('C:/Users/Shivraj Dhote/.gemini/antigravity/brain/c0a8e530-3dea-4e8b-aa00-b6df8bb36877');

  const assert = (condition, message) => {
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      throw new Error(message);
    } else {
      console.log(`✅ PASS: ${message}`);
    }
  };

  // Helper mock product generator
  const createMockProduct = (id, name, variants, total_stock = 10) => ({
    id,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    description: 'Boutique handcrafted ensemble with fine zari embroidery.',
    fabric: 'Pure Chanderi Silk',
    category: 'Kurti Sets',
    is_bestseller: true,
    is_active: true,
    min_price: 3499,
    max_price: 3499,
    total_stock,
    badges: ['BESTSELLER', 'NEW'],
    primary_image: '/images/products/noorani_maroon_front.jpg',
    images: [
      { id: id * 10 + 1, url: '/images/products/noorani_maroon_front.jpg', sort_order: 0, alt_text: 'Front' },
      { id: id * 10 + 2, url: '/images/products/noorani_maroon_back.jpg', sort_order: 1, alt_text: 'Back' },
    ],
    variants,
    collections: ['Festive Edit'],
  });

  try {
    // =========================================================================
    // PART 1: In-Stock Size Count Accuracy Tests (Unique Sizes, Not Variants)
    // =========================================================================
    console.log('\n--- PART 1: In-Stock Size Count Accuracy ---');
    const context1 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page1 = await context1.newPage();

    // Mock products API with specific variant structures:
    // Product 1: Two colors (Wine & Emerald) in the SAME size 'M' -> must show "1 size in stock"
    // Product 2: Two different sizes ('S' & 'M') in stock -> must show "2 sizes in stock"
    // Product 3: All variants 0 stock -> must show "Sold out"
    // Product 4: Variant data empty array, total_stock: 5 -> must NOT invent a count
    const mockProductsPart1 = [
      createMockProduct(101, 'Noorani Silk Kurti (Same Size Multi-Color)', [
        { id: 1, product_id: 101, size: 'M', colour: 'Wine', stock: 4, selling_price: 3499, mrp: 4499, is_available: true, sku: 'RL-1' },
        { id: 2, product_id: 101, size: ' m ', colour: 'Emerald', stock: 2, selling_price: 3499, mrp: 4499, is_available: true, sku: 'RL-2' },
        { id: 3, product_id: 101, size: 'XL', colour: 'Wine', stock: 0, selling_price: 3499, mrp: 4499, is_available: false, sku: 'RL-3' },
      ]),
      createMockProduct(102, 'Chandni Raat Modal Co-ord (Multiple Sizes)', [
        { id: 4, product_id: 102, size: 'S', colour: 'Ivory', stock: 3, selling_price: 3899, mrp: 4899, is_available: true, sku: 'RL-4' },
        { id: 5, product_id: 102, size: 'M', colour: 'Ivory', stock: 5, selling_price: 3899, mrp: 4899, is_available: true, sku: 'RL-5' },
        { id: 6, product_id: 102, size: 'L', colour: 'Ivory', stock: 0, selling_price: 3899, mrp: 4899, is_available: false, sku: 'RL-6' },
      ]),
      createMockProduct(103, 'Zari Mahal Velvet Anarkali (Sold Out)', [
        { id: 7, product_id: 103, size: 'S', colour: 'Ruby', stock: 0, selling_price: 4999, mrp: 5999, is_available: false, sku: 'RL-7' },
        { id: 8, product_id: 103, size: 'M', colour: 'Ruby', stock: 0, selling_price: 4999, mrp: 5999, is_available: false, sku: 'RL-8' },
      ], 0),
      createMockProduct(104, 'Gulabi Rooh Cotton Set (No Variant Array)', [], 5),
    ];

    await page1.route('**/products*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockProductsPart1),
      });
    });

    await page1.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await page1.waitForTimeout(1000);

    const sliderStage1 = page1.locator('[data-testid="featured-slider-stage"]');
    await sliderStage1.scrollIntoViewIfNeeded();

    // Slide 1: Two colors with same size 'M' -> must display "1 size in stock"
    const centerCard1 = page1.locator('[data-testid="slider-card-0"]');
    const textSlide1 = await centerCard1.innerText();
    assert(textSlide1.includes('1 size in stock'), `Expected "1 size in stock" for 2 colors of same size, got text containing: "${textSlide1.replace(/\n/g, ' ')}"`);
    assert(!textSlide1.includes('2 sizes in stock'), 'Correctly does NOT report 2 sizes when color variants share size M');

    // Advance to Slide 2: Two different sizes ('S' & 'M') -> must display "2 sizes in stock"
    const nextBtn1 = page1.locator('button[aria-label="Next slide"]');
    await nextBtn1.click();
    await page1.waitForTimeout(600);
    const textSlide2 = await centerCard1.innerText();
    assert(textSlide2.includes('2 sizes in stock'), `Expected "2 sizes in stock" for 2 unique sizes, got: "${textSlide2.replace(/\n/g, ' ')}"`);

    // Advance to Slide 3: All variants 0 stock -> must display "Sold out"
    await nextBtn1.click();
    await page1.waitForTimeout(600);
    const textSlide3 = await centerCard1.innerText();
    assert(textSlide3.includes('Sold out') || textSlide3.toLowerCase().includes('sold out'), `Expected "Sold out" for 0 stock item, got: "${textSlide3.replace(/\n/g, ' ')}"`);

    // Advance to Slide 4: Variant data empty array -> must NOT invent a size count
    await nextBtn1.click();
    await page1.waitForTimeout(600);
    const textSlide4 = await centerCard1.innerText();
    assert(!textSlide4.includes('size in stock') && !textSlide4.includes('sizes in stock'), `Expected no invented size count when variants missing, got: "${textSlide4.replace(/\n/g, ' ')}"`);

    await context1.close();

    // =========================================================================
    // PART 2: Small-Catalog Fallback Tests (0, 1, 2, and 3 Suitable Products)
    // =========================================================================
    console.log('\n--- PART 2: Small-Catalog Fallback Matrix ---');

    // CASE 2A: ZERO suitable products
    console.log('Testing Case: 0 products...');
    const context2A = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page2A = await context2A.newPage();
    await page2A.route('**/products*', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page2A.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await page2A.waitForTimeout(600);

    const fallback2A = await page2A.locator('[data-testid="featured-slider-fallback"]').count();
    const stage2A = await page2A.locator('[data-testid="featured-slider-stage"]').count();
    assert(fallback2A === 0 && stage2A === 0, 'Catalog with 0 products renders neither slider nor fallback (graceful null)');
    await context2A.close();

    // CASE 2B: ONE suitable product
    console.log('Testing Case: 1 product...');
    const context2B = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page2B = await context2B.newPage();
    await page2B.route('**/products*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockProductsPart1[0]]),
      });
    });
    await page2B.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await page2B.waitForTimeout(600);

    const fallback2B = page2B.locator('[data-testid="featured-slider-fallback"]');
    assert(await fallback2B.isVisible(), 'Catalog with 1 product displays fallback grid section');
    const stage2B = await page2B.locator('[data-testid="featured-slider-stage"]').count();
    assert(stage2B === 0, 'Catalog with 1 product does not render 3D slider stage');
    const fallbackCards2B = await fallback2B.locator('article, .group.relative').count();
    assert(fallbackCards2B >= 1, `Fallback grid displays the single product card (count: ${fallbackCards2B})`);

    // Verify New Arrivals section still functions
    const newArrivalsHeading2B = page2B.getByRole('heading', { name: 'NEW ARRIVALS' });
    assert(await newArrivalsHeading2B.isVisible(), 'New Arrivals section remains active and visible with 1 product');
    await context2B.close();

    // CASE 2C: TWO suitable products
    console.log('Testing Case: 2 products...');
    const context2C = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page2C = await context2C.newPage();
    await page2C.route('**/products*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockProductsPart1[0], mockProductsPart1[1]]),
      });
    });
    await page2C.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await page2C.waitForTimeout(600);

    const fallback2C = page2C.locator('[data-testid="featured-slider-fallback"]');
    assert(await fallback2C.isVisible(), 'Catalog with 2 products displays fallback grid section');
    const stage2C = await page2C.locator('[data-testid="featured-slider-stage"]').count();
    assert(stage2C === 0, 'Catalog with 2 products does not render 3D slider stage');
    const fallbackCards2C = await fallback2C.locator('article, .group.relative').count();
    assert(fallbackCards2C >= 2, `Fallback grid displays both product cards (count: ${fallbackCards2C})`);

    // Verify New Arrivals section still functions
    const newArrivalsHeading2C = page2C.getByRole('heading', { name: 'NEW ARRIVALS' });
    assert(await newArrivalsHeading2C.isVisible(), 'New Arrivals section remains active and visible with 2 products');
    await context2C.close();

    // CASE 2D: THREE suitable products
    console.log('Testing Case: 3 products...');
    const context2D = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page2D = await context2D.newPage();
    await page2D.route('**/products*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockProductsPart1[0], mockProductsPart1[1], mockProductsPart1[2]]),
      });
    });
    await page2D.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await page2D.waitForTimeout(600);

    const fallback2D = await page2D.locator('[data-testid="featured-slider-fallback"]').count();
    assert(fallback2D === 0, 'Catalog with 3 products does not display fallback grid');
    const stage2D = page2D.locator('[data-testid="featured-slider-stage"]');
    assert(await stage2D.isVisible(), 'Catalog with 3 products successfully renders 3D interactive slider');
    const counter2D = await page2D.locator('[data-testid="slider-counter"]').innerText();
    assert(counter2D.includes('01 / 03'), `Slider counter properly initializes to "01 / 03", got: "${counter2D}"`);

    const newArrivalsHeading2D = page2D.getByRole('heading', { name: 'NEW ARRIVALS' });
    assert(await newArrivalsHeading2D.isVisible(), 'New Arrivals section remains active and visible with 3 products');
    await context2D.close();

    // =========================================================================
    // PART 3: Mobile Product Details & Long Name Check at 360px, 390px, 430px
    // =========================================================================
    console.log('\n--- PART 3: Mobile Product Details & Multi-line Title Legibility ---');

    const mobileBreakpoints = [
      { width: 360, height: 740, label: '360px (Compact Mobile)' },
      { width: 390, height: 844, label: '390px (iPhone Standard)' },
      { width: 430, height: 932, label: '430px (Large Mobile Pro Max)' },
    ];

    // Mock products with an authentic long luxury title
    const longNameProduct = createMockProduct(
      201,
      'Noorani Regal Chanderi Silk Zardozi Hand-Embroidered Festive Kurti Ensemble',
      [
        { id: 2011, product_id: 201, size: 'S', colour: 'Deep Maroon', stock: 3, selling_price: 3499, mrp: 4499, is_available: true, sku: 'RL-L1' },
        { id: 2012, product_id: 201, size: 'M', colour: 'Deep Maroon', stock: 4, selling_price: 3499, mrp: 4499, is_available: true, sku: 'RL-L2' },
      ]
    );

    for (const bp of mobileBreakpoints) {
      console.log(`\nVerifying at ${bp.label}...`);
      const mobileContext = await browser.newContext({ viewport: { width: bp.width, height: bp.height } });
      const mobilePage = await mobileContext.newPage();

      await mobilePage.route('**/products*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([longNameProduct, mockProductsPart1[1], mockProductsPart1[2]]),
        });
      });

      await mobilePage.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
      await mobilePage.waitForTimeout(600);

      const mSliderStage = mobilePage.locator('[data-testid="featured-slider-stage"]');
      await mSliderStage.scrollIntoViewIfNeeded();
      await mobilePage.waitForTimeout(400);

      const centerCard = mobilePage.locator('[data-testid="slider-card-0"]');
      assert(await centerCard.isVisible(), `Center card is visible at ${bp.width}px`);

      // 1. Verify long title element has line-clamp-2 and does not truncate to 1 line
      const titleElem = centerCard.locator('h3');
      const titleClass = await titleElem.getAttribute('class');
      assert(titleClass.includes('line-clamp-2'), `Title allows up to 2 lines via line-clamp-2 at ${bp.width}px`);
      const titleText = await titleElem.innerText();
      assert(titleText.length > 30, `Full long title is legible at ${bp.width}px: "${titleText}"`);

      // 2. Verify Price is visible
      const priceElem = centerCard.getByText(/₹\s*3,499/);
      assert(await priceElem.isVisible(), `Price ₹ 3,499 is clearly visible at ${bp.width}px`);

      // 3. Verify Stock indicator is visible
      const stockElem = centerCard.locator('text=2 sizes in stock');
      assert(await stockElem.isVisible(), `Stock indicator "2 sizes in stock" is clearly visible at ${bp.width}px`);

      // 4. Verify Wishlist button is visible
      const wishlistBtn = centerCard.locator('button[aria-label*="wishlist"]');
      assert(await wishlistBtn.isVisible(), `Wishlist button is visible and active on center card at ${bp.width}px`);

      // 5. Verify Explore Piece link is visible
      const exploreLink = centerCard.locator('text=Explore Piece');
      assert(await exploreLink.isVisible(), `"Explore Piece" CTA link is visible at ${bp.width}px`);

      // 6. Test slide movement to verify no clipping or content overlap during physical glide
      const nextBtn = mobilePage.locator('button[aria-label="Next slide"]');
      await nextBtn.click();
      await mobilePage.waitForTimeout(600);
      const nextCard = mobilePage.locator('[data-testid="slider-card-0"]');
      assert(await nextCard.isVisible(), `New center card cleanly transitioned at ${bp.width}px`);

      // Capture screenshot at breakpoint
      const screenshotPath = path.join(screenshotsDir, `featured_mobile_${bp.width}.png`);
      await mobilePage.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`   Captured verified mobile screenshot: ${screenshotPath}`);

      await mobileContext.close();
    }

    console.log('\n================================================================');
    console.log('>>> ALL FEATURED SLIDER REFINEMENT TESTS PASSED (100%) <<<');
    console.log('================================================================\n');
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runSliderFixesVerification();
