const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function recordWalkthrough() {
  const outputDir = path.resolve('C:/Users/Shivraj Dhote/.gemini/antigravity/brain/c0a8e530-3dea-4e8b-aa00-b6df8bb36877/recordings');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Starting Playwright recording in:', outputDir);
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: {
      dir: outputDir,
      size: { width: 1280, height: 800 },
    },
  });

  const page = await context.newPage();

  try {
    console.log('1. Navigating to homepage...');
    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    console.log('2. Testing Categories dropdown interaction...');
    const categoriesNav = page.locator('header').getByText('CATEGORIES');
    await categoriesNav.hover();
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    console.log('3. Smoothly scrolling down through hero & marquee...');
    await page.evaluate(async () => {
      const scrollStep = (target, duration) => {
        return new Promise((resolve) => {
          const start = window.scrollY;
          const diff = target - start;
          const startTime = performance.now();
          function step(time) {
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 0.5 - Math.cos(progress * Math.PI) / 2;
            window.scrollTo(0, start + diff * ease);
            if (progress < 1) requestAnimationFrame(step);
            else resolve();
          }
          requestAnimationFrame(step);
        });
      };
      await scrollStep(600, 1000);
    });
    await page.waitForTimeout(800);

    console.log('4. Scrolling to Featured 3D Slider...');
    const sliderStage = page.locator('[data-testid="featured-slider-stage"]');
    await sliderStage.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);

    console.log('5. Demonstrating smooth card gliding on Next button...');
    const nextBtn = page.locator('button[aria-label="Next slide"]');
    await nextBtn.click();
    await page.waitForTimeout(1000);
    await nextBtn.click();
    await page.waitForTimeout(1000);

    console.log('6. Demonstrating peeking neighbor card click...');
    const leftNeighbor = page.locator('[data-testid="slider-card--1"]');
    await leftNeighbor.click();
    await page.waitForTimeout(1000);

    console.log('7. Demonstrating Pause -> Hover -> Leave state retention...');
    const playPauseBtn = page.locator('[data-testid="slider-play-pause-btn"]');
    await playPauseBtn.click();
    await page.waitForTimeout(600);
    await sliderStage.hover();
    await page.waitForTimeout(1200);
    await page.mouse.move(50, 50);
    await page.waitForTimeout(2000); // Proves it stays paused

    console.log('8. Scrolling through remaining sections to footer...');
    await page.evaluate(async () => {
      const scrollStep = (target, duration) => {
        return new Promise((resolve) => {
          const start = window.scrollY;
          const diff = target - start;
          const startTime = performance.now();
          function step(time) {
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 0.5 - Math.cos(progress * Math.PI) / 2;
            window.scrollTo(0, start + diff * ease);
            if (progress < 1) requestAnimationFrame(step);
            else resolve();
          }
          requestAnimationFrame(step);
        });
      };
      await scrollStep(document.body.scrollHeight, 2200);
    });
    await page.waitForTimeout(1500);

    console.log('Walkthrough recording finished successfully!');
  } finally {
    await page.close();
    await context.close();
    await browser.close();

    // Find the generated video file (newest by mtime)
    const files = fs.readdirSync(outputDir)
      .filter((f) => f.endsWith('.webm'))
      .map((f) => ({ name: f, time: fs.statSync(path.join(outputDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 0) {
      const videoPath = path.join(outputDir, files[0].name);
      const targetPath = path.resolve('C:/Users/Shivraj Dhote/.gemini/antigravity/brain/c0a8e530-3dea-4e8b-aa00-b6df8bb36877/storefront_motion_walkthrough.webm');
      fs.copyFileSync(videoPath, targetPath);
      console.log('Recorded video copied to:', targetPath);
    }
  }
}

recordWalkthrough().catch(console.error);

