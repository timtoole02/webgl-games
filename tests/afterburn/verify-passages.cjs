const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
require('node:fs').mkdirSync(path.join(__dirname, 'artifacts'), { recursive: true });
const {chromium}=require('playwright');

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
    args:['--force-high-performance-gpu','--autoplay-policy=no-user-gesture-required']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],snapshots=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
    await page.goto(process.env.GAME_URL||'http://127.0.0.1:4173');await page.waitForFunction(()=>window.__afterburnReady);
    await page.locator('#start-btn').click();
    const read=()=>page.evaluate(()=>window.__afterburnDiagnostics.getArtState().passages);
    const initial=await read();
    assert.equal(initial.mountainRanges,2);assert.equal(initial.mountainChunks,6);
    assert.deepEqual(initial.pools.map(p=>p.count),[10,11,5]);
    for(const [time,kind] of [[23,'mountains'],[39,'cave'],[80,'structures'],[145,'tunnel']]){
      await page.evaluate(t=>{const d=window.__afterburnDiagnostics;d.jumpToLevelTime(t);d.stepSimulation(1/60,60);},time);
      const before=await read();assert.ok(before[kind]>.99,kind+' is fully active');
      if(kind==='cave'||kind==='tunnel')assert.equal(before.spaceVisible,false,'Celestial meshes cannot intersect the passage');
      if(kind!=='mountains'){
        const a=before.pools.find(p=>p.kind===kind);assert.ok(a.visible);
        await page.evaluate(()=>window.__afterburnDiagnostics.stepSimulation(1/60,60));
        const after=await read(),b=after.pools.find(p=>p.kind===kind);
        assert.ok(a.axis[0]>.999&&Math.abs(a.axis[2])<1e-8,kind+' bore follows the horizontal flight axis');
        const visible=a.poses.findIndex(p=>p.x>-30&&p.x<85);
        assert.ok(visible>=0);
        assert.ok(b.poses[visible].x<a.poses[visible].x,kind+' scenery scrolls right to left');
        a.poses.forEach((pose,i)=>{
          assert.ok(Math.abs(b.poses[i].z-pose.z)<1e-8,kind+' remains at a fixed depth');
          assert.equal(b.poses[i].y,pose.y,kind+' does not bob across the flight corridor');
          assert.deepEqual(b.poses[i].scale,pose.scale,kind+' does not grow toward the viewer');
        });
        assert.equal(b.count,a.count,'Travel reuses a fixed pool');
        snapshots.push({kind,before:a,after:b});
      }
    }
    // Follow a full lateral pool revolution; recycling must happen off the left edge.
    await page.evaluate(()=>{const d=window.__afterburnDiagnostics;d.jumpToLevelTime(34);d.stepSimulation(1/60,1);});
    let passedLeft=false,wrapped=false,last=(await read()).pools[0];
    for(let i=0;i<22;i++){
      await page.evaluate(()=>window.__afterburnDiagnostics.stepSimulation(1/60,60));
      const p=(await read()).pools[0];
      passedLeft ||= p.poses.some(pose=>pose.x<-120);
      p.poses.forEach((pose,index)=>{
        if(pose.x>last.poses[index].x){
          wrapped=true;assert.ok(last.poses[index].x<-140&&pose.x>140,'Tiles wrap outside the visible corridor');
        }
        assert.ok(Number.isFinite(pose.x)&&pose.x>=-180&&pose.x<180);
        assert.ok(Math.abs(pose.z-8)<1e-8,'No tunnel segment advances toward the camera');
      });
      assert.deepEqual(p.geometries,last.geometries);last=p;
    }
    assert.ok(passedLeft&&wrapped,'Cave segments exit left and recycle to the right');
    const graphics=()=>page.evaluate(()=>window.__afterburnDiagnostics.getState().graphics);
    const motionBefore=await graphics();
    await page.evaluate(()=>window.__afterburnDiagnostics.stepSimulation(1/60,15));
    const motionAfter=await graphics();
    for(const group of ['gates','streaks'])motionBefore[group].forEach((pose,i)=>{
      const next=motionAfter[group][i];
      assert.equal(next.z,pose.z,group+' retain depth');assert.equal(next.y,pose.y,group+' retain height');
      if(pose.x>-100)assert.ok(next.x<pose.x,group+' travel left with the terrain');
    });
    await page.keyboard.press('p');const paused=await read();await page.waitForTimeout(180);
    assert.deepEqual((await read()).pools,paused.pools,'Pause freezes passage travel');await page.keyboard.press('p');
    await page.evaluate(()=>{const d=window.__afterburnDiagnostics;d.jumpToLevelTime(191);d.stepSimulation(1/60,360);});
    assert.ok((await read()).pools.every(p=>!p.visible),'Boss arena clears all passages');
    await page.waitForFunction(()=>window.__afterburnDiagnostics.getState().audio.transportSection===3);
    assert.match((await page.evaluate(()=>window.__afterburnDiagnostics.getState())).audio.score,/Iron Maw/);
    await page.evaluate(()=>window.__afterburnDiagnostics.startGame());
    const replay=await read();assert.ok(replay.pools.every(p=>!p.visible));
    assert.deepEqual(replay.pools.map(p=>p.geometries),initial.pools.map(p=>p.geometries),'Replay does not allocate passage geometry');
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{const d=window.__afterburnDiagnostics;d.jumpToLevelTime(42);d.stepSimulation(1/60,120);});
    await page.addStyleTag({content:'#zone-banner {visibility:hidden!important}'});
    await page.screenshot({path:path.join(__dirname,'./artifacts/mobile-cave.png')});
    const player=(await page.evaluate(()=>window.__afterburnDiagnostics.getState())).player;
    assert.ok(player.screenX>15&&player.screenX<375&&player.screenY>140&&player.screenY<700);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(__dirname,'./artifacts/passage-verification.json'),JSON.stringify({passed:true,initial,snapshots,passedLeft,wrapped,motionBefore,motionAfter,replay,errors},null,2));
    console.log('PASS: horizontal cave/tunnel axes, right-to-left motion, fixed depth/scale, offscreen recycling, matching support/streak motion, pause, boss music, replay and mobile cave.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
