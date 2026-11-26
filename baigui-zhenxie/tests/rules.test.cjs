"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const R = require("../dist/rules.js");
const {pilot,choice} = require("./pilot.cjs");

function isolated() {
  const g=R.create(2234);
  g.nextSpawn=Infinity;
  return g;
}
const dt=1/60;
function run(g,seconds,input={}) {
  for(let i=0;i<Math.ceil(seconds/dt);i++) R.step(g,dt,input);
}

test("combat handles melee damage, hit stop, knockback and evasive invulnerability",()=>{
  const g=isolated();
  const p=g.p;
  const foe=R.spawn(g,"corpse",p.x+70,p.y);
  R.step(g,dt,{attack:true,aim:foe});
  assert.equal(foe.hp,55);
  assert.ok(foe.kx>0 && g.stop>0 && g.effects.some(f=>f.type==="number"));
  run(g,.07);
  R.step(g,dt,{x:1,dash:true});
  assert.ok(p.dash>0 && p.dashCd>1 && p.x>675);
  foe.move={kind:"circle",x:p.x,y:p.y,r:100};
  R.executeEnemy(g,foe);
  assert.equal(p.hp,120);
  run(g,.39);
  foe.move={kind:"circle",x:p.x,y:p.y,r:100};
  R.executeEnemy(g,foe);
  assert.ok(p.hp<120);
});

test("paper summons deal autonomous damage and rank three adds multiple fighters",()=>{
  const g=isolated();
  const foe=R.spawn(g,"corpse",g.p.x+70,g.p.y+15);
  g.p.slots[0]=3;
  assert.equal(R.spell(g,0),true);
  assert.equal(R.spell(g,0),false);
  assert.equal(g.allies.length,3);
  run(g,.87);
  assert.ok(foe.hp<foe.maxHp);
});

test("ghost marks, thunder consumes marks and leaps, rank three double strike works",()=>{
  const g=isolated();
  g.p.slots[1]=3;
  g.p.slots[3]=3;
  const a=R.spawn(g,"boss",g.p.x+82,g.p.y);
  const b=R.spawn(g,"corpse",g.p.x+171,g.p.y);
  a.cd=b.cd=10;
  R.spell(g,1);
  assert.equal(g.allies.length,2);
  run(g,.47);
  assert.ok(a.hp<a.maxHp && a.mark>0);
  const old=a.hp;
  R.spell(g,3,a);
  assert.equal(a.mark,0);
  assert.ok(old-a.hp>=170);
  assert.ok(b.hp<b.maxHp);
});

test("talisman impact can burn a group and rank three fans out",()=>{
  const g=isolated();
  const p=g.p;
  const a=R.spawn(g,"corpse",p.x+171,p.y);
  const b=R.spawn(g,"corpse",p.x+195,p.y+54);
  a.cd=b.cd=10;
  R.spell(g,2,a);
  run(g,.38);
  assert.ok(a.hp<a.maxHp && b.hp<b.maxHp && a.burn>0);
  const old=a.hp;
  run(g,.45);
  assert.ok(a.hp<old);
  g.p.slots[2]=3;
  g.p.cds[2]=0;
  R.spell(g,2,a);
  assert.equal(g.shots.length,3);
});

test("array pulls and then slows, alongside repeated damage",()=>{
  const g=isolated();
  g.p.slots[4]=3;
  const p=g.p;
  const a=R.spawn(g,"boss",p.x+140,p.y);
  const b=R.spawn(g,"corpse",p.x+190,p.y);
  a.cd=b.cd=12;
  R.spell(g,4);
  assert.ok(b.kx<0);
  run(g,.62);
  assert.ok(a.hp<a.maxHp && a.slow>0);
  assert.ok(b.x<p.x+190);
});

test("loot grants levels with three unique choices and equips a higher-quality item",()=>{
  const g=isolated();
  const {p}=g;
  const gear={slot:"weapon",quality:2,value:30,id:80,icon:"sword",name:"凿星法剑"};
  R.drop(g,"gear",p.x,p.y,gear);
  R.drop(g,"xp",p.x,p.y,R.xpNeed(1));
  R.step(g,dt);
  assert.equal(g.gear.weapon,gear);
  assert.equal(g.phase,"upgrade");
  assert.equal(g.level,2);
  assert.equal(new Set(g.choices.map(c=>c.title)).size,3);
  const learn=g.choices.findIndex(c=>c.label==="新术法");
  assert.ok(R.choose(g,learn));
  assert.equal(g.p.slots.filter(Boolean).length,2);
  const elite=R.spawn(g,"corpse",p.x+45,p.y,true);
  R.damage(g,elite,999,0);
  assert.equal(g.defeated,1);
  assert.ok(g.drops.some(d=>d.kind==="gear"));
});

test("boss announces distinct shapes, transitions at 55%, then can be defeated",()=>{
  const g=isolated();
  g.time=108;
  R.step(g,dt);
  g.wave=2;
  R.step(g,dt);
  const b=g.boss;
  assert.equal(b.type,"boss");
  const moves=new Set();
  for(let i=0;i<3;i++){R.bossMove(g,b);moves.add(b.move.kind);}
  assert.deepEqual([...moves],["circle","lane","cleave"]);
  R.damage(g,b,Math.ceil(b.hp*.46),0);
  assert.equal(b.phase,2);
  assert.equal(b.move.kind,"ring");
  run(g,1.31);
  assert.equal(b.molt,false);
  R.damage(g,b,b.hp+1,0);
  run(g,1.45);
  assert.equal(g.phase,"win");
});

test("standing still and taking enemy attacks leads to defeat",()=>{
  const g=R.create(78);
  run(g,70);
  assert.equal(g.phase,"lose");
  assert.equal(g.p.hp,0);
});

for(const [seed, policy] of [[52,"mixed"],[815,"summons"],[1126,"blade"]]) {
  test("complete seeded run with ordinary combat inputs "+seed+" "+policy,()=>{
    const g=R.create(seed);
    for(let f=0;f<60*240;f++) {
      if (g.phase==="upgrade") R.choose(g,choice(g,policy));
      if (g.phase!=="play") break;
      R.step(g,dt,pilot(R,g));
      g.sounds.length=0;
    }
    const stats={phase:g.phase,time:+g.time.toFixed(2),level:g.level,hp:g.p.hp,
      kills:g.defeated,learned:g.p.slots,bag:g.bag.length,maxCrowd:g.maxCrowd};
    console.log(JSON.stringify({seed,policy,...stats}));
    assert.equal(g.phase,"win");
    assert.ok(g.bossPhaseSeen && g.bag.length>0 && g.defeated>35 && g.level>5);
  });
}
