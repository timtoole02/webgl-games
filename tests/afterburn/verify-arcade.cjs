const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('node:fs').mkdirSync(path.join(__dirname, 'artifacts'), { recursive: true });
const {chromium} = require('playwright');

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
    args:['--force-high-performance-gpu','--autoplay-policy=no-user-gesture-required']});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
    await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4173');
    await page.waitForFunction(()=>window.__afterburnReady);
    await page.waitForTimeout(250);
    const portrait=await page.evaluate(()=>window.__afterburnDiagnostics.renderShipPortrait());
    fs.writeFileSync(path.join(__dirname,'./artifacts/hornet-ship.png'),Buffer.from(portrait,'base64'));
    await page.locator('#start-btn').click();
    const initial=await page.evaluate(()=>window.__afterburnDiagnostics.getArtState());
    assert.ok(initial.player.hex>0 && initial.player.metal>0 && initial.environment,'Player has hex armor, metal and reflections');
    const fleet=await page.evaluate(()=>{
      const d=window.__afterburnDiagnostics;
      for(const [i,type] of ['fighter','weaver','gunship','turret','carrier'].entries())d.spawnEnemy(type,18,i*3-6,{vx:0});
      return d.getArtState();
    });
    for(const type of ['fighter','weaver','gunship','turret','carrier'])assert.ok(fleet.enemies.some(e=>e.type===type&&e.metal>0),type+' has textured metal');
    assert.equal(fleet.planets,4);
    const sectors=[];
    for(const time of [1,30,85,147,191]){
      await page.evaluate(t=>{const d=window.__afterburnDiagnostics;d.jumpToLevelTime(t);d.stepSimulation(1/60,360);},time);
      sectors.push(await page.evaluate(()=>({time:window.__afterburnDiagnostics.getState().levelTime,art:window.__afterburnDiagnostics.getArtState(),graphics:window.__afterburnDiagnostics.getState().graphics})));
    }
    assert.ok(sectors[0].art.stations>0,'Launch bay appears');
    assert.equal(sectors[1].art.stations,0,'Launch bay clears into open space');
    assert.ok(sectors[1].art.passages.cave>.99&&!sectors[1].art.passages.spaceVisible,'Orbital route enters the enclosed cave');
    assert.ok(sectors[2].art.stations>0&&sectors[3].art.stations>0,'Industrial sectors have scrolling structures');
    assert.ok(sectors[4].art.boss.metal>0,'Boss has metal textures');
    for(const sector of sectors){
      assert.equal(sector.art.terrain.layers,6,'Three terrain depths above and below the corridor');
      assert.equal(sector.art.terrain.cliffs,18,'Continuous cliff chunks cover the viewport');
      assert.equal(sector.art.terrain.boulders,384,'Dense boulders remain in a fixed instance pool');
      assert.ok(sector.art.terrain.installations>=12,'Every sector has surface installations');
      assert.equal(new Set(sector.art.terrain.offsets.map(v=>v.toFixed(3))).size,3,'Terrain depths scroll at three different speeds');
    }
    assert.equal(sectors[3].art.terrain.installations,44,'Trench has dense installations on both walls');
    assert.ok(sectors[4].art.terrain.lifts.every(v=>v>6.9),'Terrain opens out for the flagship arena');
    if(process.env.EXPECTED_GPU) assert.ok(sectors.every(s=>s.graphics.gpu.toLowerCase().includes(process.env.EXPECTED_GPU.toLowerCase())),'Requested GPU renders every sector');
    assert.ok(sectors.every(s=>s.graphics.drawCalls<350),'Detailed geometry remains batched');
    // Repeated restarts should release dynamic model buffers and keep persistent textures.
    const restarts=[];
    for(let i=0;i<3;i++){
      await page.evaluate(()=>{window.__afterburnDiagnostics.startGame();window.__afterburnDiagnostics.stepSimulation(1/60,360);});
      await page.waitForTimeout(150);
      restarts.push(await page.evaluate(()=>window.__afterburnDiagnostics.getState().graphics));
      const terrain=await page.evaluate(()=>window.__afterburnDiagnostics.getArtState().terrain);
      assert.deepEqual(terrain.geometries,initial.terrain.geometries,'Restart reuses the terrain geometry');
    }
    assert.ok(restarts.every(r=>r.textures===restarts[0].textures),'Restarts do not accumulate textures');
    assert.deepEqual(errors,[]);
    const report={passed:true,gpu:sectors[0].graphics.gpu,initial,fleet,sectors,restarts,errors};
    fs.writeFileSync(path.join(__dirname,'./artifacts/arcade-verification.json'),JSON.stringify(report,null,2));
    console.log('PASS: bee armor, metal fleet, six scrolling terrain layers, 384 boulders, dense installations, boss clearance, batching and replay. GPU:', sectors[0].graphics.gpu);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
