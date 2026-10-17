const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('node:fs').mkdirSync(path.join(__dirname, 'artifacts'), { recursive: true });
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4173');
    await page.waitForFunction(() => window.__afterburnReady);
    // Audio transport is independent of scene rendering; avoid software-GPU
    // frame stalls affecting keyboard timing or offline audio verification.
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
    await page.locator('#start-btn').click();
    await page.waitForTimeout(1500);
    const read = () => page.evaluate(() => window.__afterburnDiagnostics.getState().audio);
    assert.ok((await read()).activeVoices > 0, 'Live music schedules voices');
    assert.ok((await read()).guitarSamples > 0, 'Live arrangement plays generated guitar samples');
    await page.keyboard.press('p');
    await page.waitForTimeout(300);
    assert.equal((await read()).activeVoices, 0, 'Pause releases all sample voices');
    await page.keyboard.press('p');
    await page.waitForFunction(()=>window.__afterburnDiagnostics.getState().audio.activeVoices>0);
    assert.ok((await read()).activeVoices > 0, 'Resume schedules fresh voices');
    await page.evaluate(()=>window.__afterburnDiagnostics.jumpToLevelTime(191));
    await page.waitForFunction(()=>window.__afterburnDiagnostics.getState().audio.transportSection===3);
    assert.match((await read()).score,/Iron Maw/,'Boss switches to its own composition');
    assert.equal((await read()).bpm,132,'Boss uses the industrial stomp tempo');
    assert.ok((await read()).step<16,'Boss cue starts at its first bar');
    await page.keyboard.press('m');
    await page.keyboard.press('p');
    // Audio rendering does not need the paused scene's continuous software-GPU work.
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
    const output = path.resolve(__dirname, './artifacts');
    const renders = [];
    for (const [name, seconds, options] of [
      ['starlight-run-full', 59, {sectionIndex:0, bars:32}],
      ['iron-maw-boss-full', 60, {sectionIndex:3, bossPhase:3, overdrive:true, bars:32}],
      ['starlight-run-preview', 16, {sectionIndex:0, bars:8}],
      ['iron-maw-boss-preview', 16, {sectionIndex:3, bossPhase:1, bars:8}]
    ]) {
      console.log('Rendering', name);
      const rendered = await page.evaluate(([seconds,options]) => window.__afterburnDiagnostics.renderScore(seconds,options), [seconds,options]);
      const wav = Buffer.from(rendered.base64, 'base64');
      // Full mixes are checked in memory; opt in to their large WAV exports.
      if (name.endsWith('-preview') || process.env.SAVE_FULL_SCORE === '1') fs.writeFileSync(path.join(output, name + '.wav'), wav);
      delete rendered.base64;
      // Measure every two-second window, including the bridge and loop cadence.
      const windowRms = [];
      for (let start = 44; start < wav.length - 44100 * 4 * 3; start += 44100 * 4 * 2) {
        let power = 0;
        const end = Math.min(wav.length, start + 44100 * 4 * 2);
        for (let i = start; i < end; i += 2) power += (wav.readInt16LE(i) / 32768) ** 2;
        windowRms.push(Math.sqrt(power / ((end - start) / 2)));
      }
      assert.ok(Number.isFinite(rendered.peak) && rendered.peak > .15 && rendered.peak < .99, name + ' is audible without clipping');
      assert.ok(rendered.rms > .025 && rendered.rms < .4, name + ' has a usable mix level');
      assert.ok(windowRms.every(v => v > .02), name + ' has no arrangement dropouts');
      assert.ok(rendered.stereoDifference > .005, name + ' has stereo width');
      assert.equal(wav.readInt16LE(wav.length - 2), 0, 'Preview ends in silence');
      renders.push({name, ...rendered, windowRms});
      console.log(name, JSON.stringify(rendered));
    }
    assert.equal((await read()).activeVoices, 0, 'Offline previews do not start live music');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'starlight-run-verification.json'), JSON.stringify({passed:true, renders, errors}, null, 2));
    console.log('PASS: live transport cleanup, muted-independent previews, complete 32-bar arrangements, boss/Overdrive headroom and stereo.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
