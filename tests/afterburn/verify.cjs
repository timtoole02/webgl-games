const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('node:fs').mkdirSync(path.join(__dirname, 'artifacts'), { recursive: true });
const { chromium } = require('playwright');
const output = path.resolve(__dirname, './artifacts');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text()); });
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4173');
    await page.waitForFunction(() => window.__afterburnReady);
    const read = () => page.evaluate(() => window.__afterburnDiagnostics.getState());
    await page.locator('#start-btn').click();
    await page.waitForTimeout(350);
    assert.equal((await read()).mode, 'playing');
    assert.equal((await read()).audio.context, 'running');
    const beforeMove = (await read()).player.y;
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(y => window.__afterburnDiagnostics.getState().player.y > y, beforeMove);
    await page.keyboard.up('ArrowUp');
    assert.ok((await read()).player.y > beforeMove, 'Keyboard movement works');

    await page.keyboard.press('p');
    const paused = await read();
    assert.equal(paused.mode, 'paused');
    assert.equal(paused.audio.playing, false);
    await page.waitForTimeout(250);
    assert.equal((await read()).levelTime, paused.levelTime, 'Pause freezes simulation');
    await page.locator('#resume-btn').click();
    await page.keyboard.press('m');
    await page.waitForTimeout(180);
    assert.ok((await read()).audio.masterGain < 0.01, 'Mute silences the master bus');
    await page.keyboard.press('m');

    const audio = await page.evaluate(() => window.__afterburnDiagnostics.renderScore(16, { sectionIndex: 0, bars: 8 }));
    fs.writeFileSync(path.join(output, 'starlight-run-preview.wav'), Buffer.from(audio.base64, 'base64'));
    delete audio.base64;
    assert.ok(audio.peak > 0.1 && audio.peak < 1, 'Soundtrack has headroom');
    assert.ok(audio.rms > 0.02 && audio.rms < 0.5, 'Soundtrack has sustained output');
    assert.ok(audio.stereoDifference > 0.001, 'Orchestra and echo produce stereo separation');
    console.log('Audio render:', audio);

    const sections = [];
    for (const [time, section] of [[8, 0], [85, 1], [147, 2], [191, 3]]) {
      await page.evaluate(t => {
        const d = window.__afterburnDiagnostics;
        d.jumpToLevelTime(t);
        d.stepSimulation(1 / 60, 360);
      }, time);
      const s = await read();
      assert.equal(s.sectionIndex, section);
      assert.equal(s.audio.bpm, [136, 140, 144, 132][section]);
      assert.ok(s.graphics.floorIntensity > 0.3);
      if (section === 2) assert.ok(s.graphics.ceilingIntensity > 0.85);
      sections.push(s);
    }
    assert.ok(sections[2].graphics.floorScroll > sections[1].graphics.floorScroll);
    assert.ok(sections[2].graphics.architectureOffset !== sections[1].graphics.architectureOffset);
    assert.equal(sections[3].boss.state, 'active');
    assert.deepEqual(sections[3].unlockedWeapons, [true, true, true, true]);

    for (let weapon = 0; weapon < 4; weapon++) {
      await page.keyboard.press(String(weapon + 1));
      assert.equal((await read()).currentWeapon, weapon);
      await page.evaluate(() => window.__afterburnDiagnostics.stepSimulation(1 / 60, 25));
    }
    await page.locator('#tune-btn').click();
    await page.locator('#tune-od-btn').click();
    await page.locator('#tune-close-btn').click();
    await page.keyboard.press('x');
    assert.equal((await read()).overdriveActive, true);

    // Exercise phase gates and the full 5.2-second flagship breakup.
    for (let phase = 2; phase <= 3; phase++) {
      await page.evaluate(() => { const d = window.__afterburnDiagnostics; d.damageBoss(10000); d.stepSimulation(1 / 60, 2); });
      assert.equal((await read()).boss.phase, phase);
    }
    await page.evaluate(() => { const d = window.__afterburnDiagnostics; d.damageBoss(10000); d.stepSimulation(1 / 60, 25); });
    assert.equal((await read()).boss.state, 'dying');
    await page.screenshot({ path: path.join(output, 'boss-breakup.png') });
    await page.evaluate(() => window.__afterburnDiagnostics.stepSimulation(1 / 60, 320));
    assert.equal((await read()).mode, 'victory');
    await page.locator('#replay-btn').click();
    const replay = await read();
    assert.equal(replay.mode, 'playing');
    assert.equal(replay.boss, null);
    assert.equal(replay.graphics.fireballs, 0);
    assert.equal(replay.graphics.shards, 0);
    assert.deepEqual(replay.unlockedWeapons, [true, false, false, false]);

    const explosion = await page.evaluate(() => {
      const d = window.__afterburnDiagnostics;
      d.spawnExplosion(5, 0, 0, 0xffa044, 2.5, true);
      let maxNear = 0;
      for (let i = 0; i < 50; i++) {
        d.stepSimulation(1 / 60, 1);
        maxNear = Math.max(maxNear, d.getState().graphics.nearShards);
      }
      return { maxNear, state: d.getState() };
    });
    assert.ok(explosion.maxNear > 0, 'Debris crosses into the near-camera volume');

    // Pool stress: effects are bounded even with many simultaneous explosions.
    const stress = await page.evaluate(() => {
      const d = window.__afterburnDiagnostics;
      for (let i = 0; i < 100; i++) d.spawnExplosion(i % 8, i % 5, 0, 0xffa044, 2.5, true);
      const peak = d.getState().graphics;
      d.stepSimulation(1 / 60, 240);
      return { peak, after: d.getState().graphics };
    });
    assert.ok(stress.peak.fireballs <= 36 && stress.peak.shards <= 260);
    assert.ok(stress.after.fireballs < 36 && stress.after.shards < 260);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press('p');
    await page.locator('#restart-btn').click();
    await page.screenshot({ path: path.join(output, 'mobile.png') });
    const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, canvas: document.querySelector('canvas').getBoundingClientRect().width }));
    assert.equal(layout.width, layout.viewport);
    assert.equal(layout.canvas, layout.viewport);
    const mobileControls = await page.locator('.hud-bar, .bottom-hud, #mute-btn, #pause-btn, #tune-btn, .wpn-slot').evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect(); return { id: el.id || el.className, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }));
    for (const r of mobileControls) assert.ok(r.left >= 0 && r.right <= 390 && r.top >= 0 && r.bottom <= 844, `Mobile control visible: ${r.id}`);
    const mobilePlayer = (await read()).player;
    assert.ok(mobilePlayer.screenX > 15 && mobilePlayer.screenX < 375 && mobilePlayer.screenY > 140 && mobilePlayer.screenY < 700, 'Ship stays in the phone playfield');
    assert.deepEqual(errors, [], 'No JavaScript or WebGL shader errors');
    const report = { passed: true, audio, sections: sections.map(s => ({ section: s.sectionIndex, bpm: s.audio.bpm, graphics: s.graphics })), nearCameraDebris: explosion.maxNear, stress: stress.peak, mobile: layout, errors };
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report, null, 2));
    console.log('PASS: controls, audio, four sectors, weapons, overdrive, boss phases, victory, replay, debris, pool limits, mobile layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
