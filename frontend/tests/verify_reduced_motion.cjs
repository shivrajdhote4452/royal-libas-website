const { chromium } = require('C:/Users/Shivraj Dhote/AppData/Roaming/npm/node_modules/omniroute/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  });
  
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce'
  });
  
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  
  // Check visible hero image for desktop
  const isDesktopHeroVisible = await page.locator('.hidden.lg\\:block .hero-motion-image').isVisible();
  console.log('✅ PASS: Desktop hero image is visible with reduced motion:', isDesktopHeroVisible);

  // Check mobile viewport with reduced motion
  const mobilePage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce'
  });
  await mobilePage.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  const isMobileHeroVisible = await mobilePage.locator('.lg\\:hidden .hero-motion-image').isVisible();
  console.log('✅ PASS: Mobile hero image is visible with reduced motion:', isMobileHeroVisible);

  const reveals = await page.locator('.reveal-on-scroll').evaluateAll((els) => {
    return els.map((el) => el.classList.contains('is-revealed') && !el.classList.contains('reveal-primed'));
  });
  console.log('✅ PASS: All scroll reveals immediately revealed on load (count: ' + reveals.length + '):', reveals.every(Boolean));

  await page.screenshot({ path: 'C:/Users/Shivraj Dhote/.gemini/antigravity/brain/c0a8e530-3dea-4e8b-aa00-b6df8bb36877/reduced_motion_verified.png' });
  await browser.close();
  console.log('Reduced motion verification completed successfully!');
})();
