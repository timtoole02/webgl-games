// NODE_PATH may point at a shared Playwright installation. No game build step required.
const { chromium } = require('playwright');
const path = require('node:path');
require('node:fs').mkdirSync(path.join(__dirname, 'artifacts'), { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--enable-webgl', ...(process.env.HARDWARE ? ['--force-high-performance-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4173');
  await page.waitForFunction(() => window.__afterburnReady);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(__dirname, './artifacts/title.png') });
  await page.locator('#start-btn').click();
  await page.addStyleTag({content:'#zone-banner { visibility: hidden !important; }'});
  for (const [name, time] of [['launch-bay', 1], ['mountains', 20], ['orbit', 28], ['caverns', 43], ['shipyard', 85], ['trench', 147], ['flagship', 191]]) {
    await page.evaluate(t => { const d = window.__afterburnDiagnostics; d.jumpToLevelTime(t); d.stepSimulation(1 / 60, t === 191 ? 360 : 180); }, time);
    await page.screenshot({ path: path.join(__dirname, `./artifacts/${name}.png`) });
    console.log(name, await page.evaluate(() => {const s=window.__afterburnDiagnostics.getState();return {gpu:s.graphics.gpu,drawCalls:s.graphics.drawCalls,boss:s.boss?.state};}));
  }
  console.log('ERRORS:', JSON.stringify(errors));
  await browser.close();
  if (errors.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
