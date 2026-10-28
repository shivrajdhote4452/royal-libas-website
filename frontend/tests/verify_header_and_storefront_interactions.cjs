const { chromium } = require('playwright');
const path = require('path');

async function verifyHeaderAndInteractions() {
  console.log('================================================================');
  console.log('>>> VERIFYING HEADER RESPONSIVENESS, MENUS, CART & WISHLIST <<<');
  console.log('================================================================');

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const screenshotsDir = path.resolve('C:/Users/Shivraj Dhote/.gemini/antigravity/brain/c0a8e530-3dea-4e8b-aa00-b6df8bb36877');

  const assert = (condition, message) => {
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      throw new Error(message);
    } else {
      console.log(`✅ PASS: ${message}`);
    }
  };

  try {
    // -------------------------------------------------------------
    // TEST 1: Header at 360px, 390px, and 430px
    // -------------------------------------------------------------
    const breakpoints = [360, 390, 430];
    for (const width of breakpoints) {
      console.log(`\nChecking Header at ${width}px...`);
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await context.newPage();

      await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);

      const header = page.locator('header');
      assert(await header.isVisible(), `Header is visible at ${width}px`);

      // Verify Brand Logo text doesn't wrap or overlap
      const logoText = header.locator('span:has-text("ROYAL LIBAS")');
      assert(await logoText.isVisible(), `Brand logo text is visible at ${width}px`);
      const logoBox = await logoText.boundingBox();
      assert(logoBox && logoBox.width > 0 && logoBox.height <= 30, `Logo text rendered on single line (height: ${logoBox?.height}px)`);

      // Verify mobile actions (Cart/Bag button, Wishlist button, Hamburger button)
      const menuBtn = header.locator('button[aria-label*="menu" i], button[aria-label*="navigation" i]');
      assert(await menuBtn.isVisible(), `Mobile menu button is visible at ${width}px`);

      const cartBtn = header.locator('button[aria-label*="bag" i], button[aria-label*="cart" i]');
      assert(await cartBtn.isVisible(), `Cart/Bag button is visible at ${width}px`);

      const wishlistLink = header.locator('a[aria-label*="wishlist" i]');
      assert(await wishlistLink.isVisible(), `Wishlist icon link is visible at ${width}px`);

      // Verify header backdrop-blur and scroll shadow
      await page.evaluate(() => window.scrollTo(0, 300));
      await page.waitForTimeout(400);
      const headerClass = await header.getAttribute('class');
      assert(headerClass.includes('shadow-'), `Header gains shadow on scroll at ${width}px`);

      // Save screenshot
      const shotPath = path.join(screenshotsDir, `header_${width}.png`);
      await page.screenshot({ path: shotPath, clip: { x: 0, y: 0, width, height: 160 } });
      console.log(`   Captured header screenshot: ${shotPath}`);

      await context.close();
    }

    // -------------------------------------------------------------
    // TEST 2: Menus (Desktop Dropdown & Mobile Drawer)
    // -------------------------------------------------------------
    console.log('\nChecking Navigation Menus...');
    // Desktop:
    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await desktopPage.waitForTimeout(600);

    const categoriesNav = desktopPage.locator('header').getByText('CATEGORIES');
    await categoriesNav.hover();
    await desktopPage.waitForTimeout(300);
    const kurtiSetsLink = desktopPage.locator('header').getByRole('link', { name: /Kurti Sets/i });
    assert(await kurtiSetsLink.isVisible(), 'Desktop Categories dropdown opens smoothly on hover');

    await desktopPage.keyboard.press('Escape');
    await desktopPage.waitForTimeout(300);
    assert(!(await kurtiSetsLink.isVisible()), 'Desktop dropdown closes on Escape key');

    // Mobile Menu Drawer:
    await desktopPage.setViewportSize({ width: 390, height: 844 });
    await desktopPage.waitForTimeout(400);
    const mobileMenuBtn = desktopPage.locator('header button[aria-label*="menu" i], header button[aria-label*="navigation" i]');
    await mobileMenuBtn.click();
    await desktopPage.waitForTimeout(400);
    const mobileKurtiLink = desktopPage.getByRole('link', { name: /Kurti Sets/i }).first();
    assert(await mobileKurtiLink.isVisible(), 'Mobile menu drawer opens and displays category links');

    // Close mobile menu
    const closeBtn = desktopPage.locator('button[aria-label*="close" i]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await desktopPage.waitForTimeout(300);
    }
    await desktopContext.close();

    // -------------------------------------------------------------
    // TEST 3: Product Links, Wishlist & Cart Functionality
    // -------------------------------------------------------------
    console.log('\nChecking Product Links, Wishlist & Cart Drawer...');
    const mainContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const mainPage = await mainContext.newPage();
    await mainPage.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await mainPage.waitForTimeout(800);

    // Featured center card: test Wishlist Toggle
    const centerCard = mainPage.locator('[data-testid="slider-card-0"]');
    await centerCard.scrollIntoViewIfNeeded();
    await mainPage.waitForTimeout(400);

    const wishlistBtn = centerCard.locator('button[aria-label*="wishlist"]');
    assert(await wishlistBtn.isVisible(), 'Wishlist toggle button is present on center card');
    await wishlistBtn.click();
    await mainPage.waitForTimeout(400);

    // Verify wishlist badge in header
    const headerWishlistLink = mainPage.locator('header a[aria-label*="Wishlist" i]');
    const badgeText = await headerWishlistLink.innerText();
    assert(badgeText.includes('1'), `Wishlist count badge updated to 1 in header, got: "${badgeText}"`);

    // Untoggle wishlist
    await wishlistBtn.click();
    await mainPage.waitForTimeout(400);

    // Test "Explore Piece" product link
    const explorePieceLink = centerCard.locator('a[aria-label*="Explore piece"]');
    const href = await explorePieceLink.getAttribute('href');
    assert(href && href.startsWith('/product/'), `Explore piece links to valid product slug: "${href}"`);

    // Test Cart Drawer
    const headerCartBtn = mainPage.locator('header button[aria-label*="Shopping Bag" i], header button[aria-label*="Cart" i]');
    await headerCartBtn.click();
    await mainPage.waitForTimeout(500);

    // Verify Cart Drawer opened
    const cartDrawer = mainPage.locator('h2:has-text("YOUR CART")').first();
    assert(await cartDrawer.isVisible(), 'Cart drawer opens successfully upon clicking cart button');

    // Close Cart Drawer
    const closeCartBtn = mainPage.locator('button[aria-label="Close cart drawer"]').first();
    if (await closeCartBtn.isVisible()) {
      await closeCartBtn.click();
      await mainPage.waitForTimeout(300);
    }

    await mainContext.close();

    console.log('\n================================================================');
    console.log('>>> ALL HEADER, MENU, CART & WISHLIST TESTS PASSED (100%) <<<');
    console.log('================================================================\n');
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

verifyHeaderAndInteractions();
