"use strict";

const assert=require("node:assert/strict");
const {mkdir,writeFile}=require("node:fs/promises");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base=process.env.WUYIN_URL || "https://wuyin.test/";
const remote=!!process.env.WUYIN_URL;
const shots=path.join(root,"screenshots");
const results={};

async function capture(page,name) {
  if(!remote) await page.screenshot({path:path.join(shots,name+".jpg"),type:"jpeg",quality:91});
}

async function open(context) {
  const page=await context.newPage();
  page.on("pageerror",e=>errors.push(e.message));
  page.on("response",r=>{if(r.status()>=400)errors.push(r.status()+" "+r.url());});
  if(!remote) await page.route(base+"**", async route=>{
    const url=new URL(route.request().url());
    const name=url.pathname.slice(1)||"index.html";
    const mime={".html":"text/html; charset=utf-8",".js":"application/javascript",".css":"text/css",".webp":"image/webp",".ogg":"audio/ogg",".m4a":"audio/mp4"};
    if(!/^(assets\/)?[\w.-]+$/.test(name)) return route.abort();
    await route.fulfill({path:path.join(root,"dist",name),contentType:mime[path.extname(name)]});
  });
  await page.goto(base);
  await page.locator("#start:enabled").waitFor();
  await page.waitForFunction(()=>Object.keys(Art.images).length>=24);
  return page;
}

async function state(page,expression) {
  return page.evaluate(expression);
}

async function wait(page,expression) {
  await page.waitForFunction(expression,null,{timeout:8000});
}

async function desktop(browser) {
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const page=await open(context);
  await capture(page,"01-title");
  await page.getByRole("button",{name:"行走手记"}).click();
  assert.equal(await page.getByRole("dialog").locator("dd").count(),7);
  await page.keyboard.press("Escape");
  await page.locator("#start").click();
  await wait(page,()=>game && audio.buffers.ambience && audio.score && Object.keys(audio.buffers).length===16);
  await page.keyboard.down("KeyD");
  await wait(page,()=>game.p.x>733&&game.p.moving);
  await page.keyboard.up("KeyD");
  assert.ok(await state(page,()=>game.p.x>733));
  await page.keyboard.press("Space");
  await wait(page,()=>game.p.dashCd>1.4);
  await state(page,()=>{
    game.nextSpawn=200;
    game.p.x=675;game.p.y=584;game.p.dash=0;game.p.vx=0;game.p.vy=0;
    game.bannerTime=0;game.enemies.length=0;
    for(const [kind,x,y] of [["paper",747,577],["paper",761,605],["corpse",817,564],["ghost",803,434],
      ["corpse",476,540],["paper",467,656],["ghost",573,426],["paper",787,532],["paper",915,649]]) {
      Rules.spawn(game,kind,x,y);
    }
  });
  const target=await state(page,()=>({x:rig.camera.x+747*rig.camera.z,y:rig.camera.y+577*rig.camera.z}));
  await page.mouse.click(target.x,target.y);
  await wait(page,()=>game.damageDealt>25 && game.p.attack>0);
  await capture(page,"02-combat");
  await page.keyboard.down("KeyJ");
  await wait(page,()=>game.p.combo>=2);
  await page.keyboard.up("KeyJ");
  await page.keyboard.press("KeyR");
  await wait(page,()=>game.p.cds[2]>2.8);
  await wait(page,()=>game.effects.some(f=>f.type==="blast"));
  await wait(page,()=>game.defeated>1);
  await state(page,()=>{
    const p=game.p;
    Rules.drop(game,"xp",p.x,p.y,Rules.xpNeed(game.level));
  });
  await page.locator(".choice").first().waitFor();
  assert.equal(await page.locator(".choice").count(),3);
  const paused=await state(page,()=>game.time);
  await capture(page,"03-upgrade");
  assert.equal(await state(page,()=>game.time),paused);
  await page.locator(".choice").filter({hasText:"新术法"}).first().click();
  await wait(page,()=>game.p.slots.filter(Boolean).length===2);
  await state(page,()=>{
    const p=game.p;
    Rules.drop(game,"gear",p.x,p.y,{slot:"weapon",quality:1,id:501,icon:"sword",name:"桑雷剑",value:18});
    Rules.drop(game,"gear",p.x,p.y,{slot:"weapon",quality:2,id:502,icon:"sword",name:"凿星法剑",value:30});
  });
  await wait(page,()=>game.bag.length>=2);
  await page.keyboard.press("Tab");
  assert.match(await page.locator(".equipped").innerText(),/凿星法剑/);
  await page.locator('[data-equip="501"]').click();
  assert.match(await page.locator(".equipped").innerText(),/桑雷剑/);
  await capture(page,"04-equipment");
  await page.keyboard.press("Tab");

  await state(page,()=>{
    game.p.x=661;game.p.y=543;
    game.p.slots=[3,3,3,3,3];
    game.p.cds.fill(0);
    game.p.inv=7;
    game.enemies.length=0;
    game.allies.length=0;
    game.shots.length=0;
    game.drops.length=0;
    game.time=99;
    game.wave=2;
    game.nextSpawn=200;
    for(const [kind,x,y] of [["paper",585,670],["corpse",776,591],["corpse",765,481],["ghost",850,421],
         ["paper",452,558],["corpse",880,691],["paper",804,651],["corpse",615,426]]) Rules.spawn(game,kind,x,y);
  });
  await page.keyboard.press("KeyQ");
  await page.keyboard.press("KeyE");
  await page.keyboard.press("KeyC");
  await wait(page,()=>game.allies.length===5&&game.fields.length===1);
  await wait(page,()=>game.enemies.some(e=>e.mark>0));
  await page.keyboard.press("KeyF");
  await wait(page,()=>game.effects.some(f=>f.type==="lightning"&&!f.data.ghost));
  await state(page,()=>{ panel="snapshot";dirty=true; });
  await capture(page,"05-spells");

  await state(page,()=>{
    if(game.phase==="upgrade") Rules.choose(game,0);
    close();
    game.xp=0;
    game.level=10;
    game.enemies.length=game.allies.length=game.drops.length=game.fields.length=game.shots.length=game.effects.length=0;
    game.time=108.03;
    game.p.x=605;game.p.y=548;game.p.inv=6;
  });
  await wait(page,()=>game.boss && document.querySelector("#boss-phase").textContent==="引魂");
  await state(page,()=>{ game.boss.y=429;game.boss.wind=0;game.boss.moves=0;game.boss.cd=0;game.bannerTime=0; });
  await wait(page,()=>game.boss?.move?.kind==="circle");
  await state(page,()=>{ panel="snapshot";dirty=true; });
  await capture(page,"06-boss");
  await state(page,()=>{
    close();
    const b=game.boss;
    b.x=726;b.y=425;
    game.p.x=635;game.p.y=564;
    b.hp=Math.ceil(b.maxHp*.55)+20;
    Rules.damage(game,b,45,0);
    game.bannerTime=0;
  });
  await wait(page,()=>game.boss.phase===2 && document.querySelector("#boss-phase").textContent==="破面");
  await state(page,()=>{ panel="snapshot";dirty=true; });
  await capture(page,"07-boss-break");
  await state(page,()=>close());
  await wait(page,()=>!game.boss.molt);
  await state(page,()=>{
    game.boss.hp=35;
    game.boss.cd=10;
    game.p.cds[3]=0;
  });
  await page.keyboard.press("KeyF");
  await wait(page,()=>panel==="outcome" && game.phase==="win");
  assert.equal(await page.locator("#dialog-title").textContent(),"天光已至");
  await capture(page,"08-victory");
  await page.getByRole("button",{name:"再入雾隐"}).click();
  await state(page,()=>{
    game.nextSpawn=200;
    game.bannerTime=0;
    game.p.hp=11;
    const e=Rules.spawn(game,"corpse",game.p.x+10,game.p.y);
    e.cd=0;
  });
  await wait(page,()=>panel==="outcome"&&game.phase==="lose");
  assert.equal(await page.locator("#dialog-title").textContent(),"魂散雾隐");
  await capture(page,"09-defeat");
  await page.getByRole("button",{name:"返回封面"}).click();
  assert.match(await page.locator("#record").textContent(),/村志纪录/);
  results.desktop={viewport:"1440×900",audioBuffers:16,controls:"WASD/Space/J/left mouse/Q/E/R/F/C, Tab, Escape",states:"cover, help, upgrade, gear, both boss phases, victory, defeat, retry"};
  await context.close();
}

async function mobile(browser) {
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  const page=await open(context);
  await capture(page,"10-mobile-title");
  await page.locator("#start").tap();
  await wait(page,()=>game!==null);
  await state(page,()=>{
    game.p.slots=[2,1,2,1,3];game.bannerTime=0;
    game.nextSpawn=200;game.wave=2;game.time=77;
    game.p.inv=10;
    for(const [t,x,y] of [["ghost",780,510],["paper",728,397],["corpse",586,424],["paper",588,548],["corpse",674,690],["ghost",830,670]])
      Rules.spawn(game,t,x,y);
  });
  const cdp=await context.newCDPSession(page);
  const stick=await page.locator("#joystick").boundingBox();
  const slot=await page.locator("#attack").boundingBox();
  const point={x:Math.round(stick.x+stick.width*.55),y:Math.round(stick.y+stick.height*.5),id:1};
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[point]});
  const push={x:point.x-28,y:point.y-10,id:1};
  await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[push]});
  await wait(page,()=>game.p.x<658&&Math.abs(input.x)>.4);
  const swing={x:Math.round(slot.x+slot.width/2),y:Math.round(slot.y+slot.height/2),id:2};
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[push,swing]});
  await wait(page,()=>game.p.attack>0 && input.attack!==null);
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await wait(page,()=>Math.abs(input.x)<.001 && input.attack===null);
  await page.locator("#dash").tap();
  await wait(page,()=>game.p.dashCd>1);
  await wait(page,()=>game.p.dash===0);
  await page.locator(".spellbar button").last().tap();
  await wait(page,()=>game.fields.length>0);
  await capture(page,"11-mobile-combat");

  await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
  const perf=await state(page,async()=>{
    game.p.inv=99;
    game.p.x=675;game.p.y=610;
    game.nextSpawn=1e8;
    game.enemies.length=game.allies.length=game.drops.length=game.fields.length=0;
    for(let i=0;i<58;i++) {
      const angle=i*Rules.TAU/58;
      const r=123 + i%4*24;
      Rules.spawn(game,["paper","ghost","corpse"][i%3],game.p.x+r*Math.cos(angle),game.p.y+r*.72*Math.sin(angle),i%8===0);
    }
    for(const e of game.enemies) e.cd=10;
    await new Promise(r=>setTimeout(r,1500));
    const stamps=[];
    const initial=performance.now();
    do { stamps.push(await new Promise(r=>requestAnimationFrame(r))); }
    while(stamps.at(-1)-initial<1800);
    const times=stamps.slice(1).map((t,i)=>t-stamps[i]).sort((a,b)=>a-b);
    return {entities:game.enemies.length,dpr:rig.dpr,detail:rig.detail,meanFps:+((times.length*1000)/(stamps.at(-1)-stamps[0])).toFixed(1),
      p95Millis:+times[Math.floor(times.length*.95)].toFixed(1),samples:times.length};
  });
  await cdp.send("Emulation.setCPUThrottlingRate",{rate:1});
  perf.cpuThrottle=4;
  assert.equal(perf.entities,58);
  assert.ok(perf.samples>=18);
  await capture(page,"12-mobile-crowd");
  await page.setViewportSize({width:320,height:700});
  const rects=await state(page,()=>[...document.querySelectorAll("#joystick,#spellbar,#attack,#dash")].map(el=>{
    const {left,top,right,bottom}=el.getBoundingClientRect();
    return {left,top,right,bottom};
  }));
  assert.ok(rects.every(r=>r.left>=0&&r.right<=320&&r.top>=0&&r.bottom<=700));
  const [joy,bar]=rects;
  assert.ok(joy.right<=bar.left || joy.bottom<=bar.top || bar.bottom<=joy.top);
  await page.setViewportSize({width:844,height:390});
  assert.ok(await state(page,()=>document.querySelector("#joystick").getBoundingClientRect().width>=76));
  assert.ok(await state(page,()=>document.querySelector("#attack").getBoundingClientRect().right<=844));
  results.mobile={viewport:"390×844, 320×700 and 844×390",multitouch:"movement + attack, dash, active skill",stress:perf};
  await context.close();
}

const errors=[];
async function main() {
  await mkdir(shots,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||"/usr/bin/chromium",headless:true});
  try {
    await desktop(browser);
    await mobile(browser);
    assert.deepEqual(errors,[]);
    results.version=browser.version();
    console.log(JSON.stringify(results,null,2));
    if(!remote) await writeFile(path.join(root,"tests","browser-results.json"),JSON.stringify(results,null,2)+"\n");
  } finally { await browser.close(); }
}

main().catch(e=>{console.error(e);if(errors.length)console.error(errors);process.exitCode=1;});
