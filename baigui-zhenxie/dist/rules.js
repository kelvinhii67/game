"use strict";

const Rules = (() => {
  const W = 1350;
  const H = 850;
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const insideAngle = (a, b, spread) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) <= spread;
  const xpNeed = level => Math.round(13 + 6 * (level - 1) + (level - 1) ** 1.32 * 1.1);
  const waves = [
    { start: 0, name: "初更 · 夜行纸人", title: "初更 · 夜行纸人" },
    { start: 31, name: "二更 · 阴风入村", title: "二更 · 阴风入村" },
    { start: 67, name: "三更 · 尸过祖祠", title: "三更 · 尸过祖祠" },
    { start: 108, name: "祠门开 · 镇邪", title: "祠门开 · 铜面祠君" }
  ];
  const spells = [
    { id:"paper", name:"纸扎", full:"折将纸扎", color:"#f3ca87", key:"Q", cd:13, icon:"paper-icon",
      learn:"折纸为将，召唤纸兵追击最近的鬼物。", rank:"增加纸兵数量、伤害和在场时间。", evolve:"纸阵列锋 · 第三阶，纸兵攻击溅射邻敌。" },
    { id:"ghost", name:"御鬼", full:"引灯御鬼", color:"#82e3e3", key:"E", cd:12, icon:"ghost-icon",
      learn:"唤出绕身幽魂。幽魂自动飞袭，对目标施加鬼火印。", rank:"延长幽魂在场时间并提高飞袭伤害。", evolve:"百灯夜游 · 第三阶，双幽魂同时飞袭。" },
    { id:"talisman", name:"符箓", full:"离火符箓", color:"#f0a16b", key:"R", cd:3.8, icon:"talisman",
      learn:"发射离火符，触敌爆裂并点燃一片鬼群。", rank:"提高燃符爆炸范围和伤害，缩短回转时间。", evolve:"朱火三叠 · 第三阶，同时发射三道离火符。" },
    { id:"thunder", name:"雷法", full:"紫垣雷法", color:"#bfa5ff", key:"F", cd:7.4, icon:"thunder",
      learn:"落雷轰击近敌，在鬼群间传导。鬼火印强化雷击。", rank:"提高雷击伤害和连锁目标数。", evolve:"五炁巡天 · 第三阶，连锁雷击可以重击首敌。" },
    { id:"array", name:"阵法", full:"缚阴地阵", color:"#a9e0ad", key:"C", cd:10, icon:"array",
      learn:"在术士脚下布阵，减速并持续灼伤阵中的鬼物。", rank:"扩大阵域并增强持续伤害。", evolve:"地脉合围 · 第三阶，显阵时将周围敌人拉入阵眼。" }
  ];
  const enemies = {
    paper: { life:34, speed:77, damage:13, range:38, wind:.41, size:66, xp:3, color:"#e0bd79" },
    ghost: { life:31, speed:64, damage:12, range:208, wind:.67, size:75, xp:4, color:"#78dae0" },
    corpse: { life:83, speed:47, damage:23, range:75, wind:.77, size:88, xp:6, color:"#afd28f" },
    boss: { life:2210, speed:54, damage:28, range:165, wind:1, size:163, xp:0, color:"#ffc383" }
  };
  const rarity = [
    { name:"凡品", color:"#d4d8d2" }, { name:"灵品", color:"#94e5af" },
    { name:"玄品", color:"#a6c8ff" }, { name:"珍品", color:"#efbd72" }
  ];
  const gearKinds = [
    { slot:"weapon", name:"法剑", icon:"sword", names:["旧桃木剑","桑雷剑","凿星法剑","镇夜七星剑"], stat:"普攻伤害" },
    { slot:"robe", name:"法衣", icon:"robe", names:["粗布道衣","合风衣","踏雾法衣","太阴云衣"], stat:"减伤" },
    { slot:"charm", name:"佩玉", icon:"jade", names:["素玉扣","引魂玉","照幽佩","伏灵骨玉"], stat:"术法伤害" },
  ];

  function create(seed = Date.now()) {
    let entropy = seed >>> 0 || 1;
    const rand = () => {
      entropy ^= entropy << 13;
      entropy ^= entropy >>> 17;
      entropy ^= entropy << 5;
      return (entropy >>> 0) / 4294967296;
    };
    const g = {
      rand, seed, time:0, phase:"play", wave:0, nextSpawn:0.25, id:0, defeated:0, level:1, xp:0,
      burstCount:0, damageDealt:0, bestCombo:0, lastKill:-9, chain:0, maxCrowd:0, bossPhaseSeen:false,
      events:[], enemies:[], allies:[], shots:[], drops:[], fields:[], effects:[], sounds:[],
      freeEffects:[], freeShots:[], freeDrops:[], grid:new Map(), stop:0, shake:0,
      p:{ x:675, y:570, dx:1, dy:0, face:1, hp:120, maxHp:120, inv:0, attack:0, cast:0,
        dash:0, dashCd:0, vx:0, vy:0, hurt:0, moving:false, combo:0, comboTime:0,
        slots:[0,0,1,0,0], cds:[0,0,0,0,0] },
      perks:{ blade:0, health:0, focus:0, haste:0, magnet:0 },
      gear:{ weapon:null, robe:null, charm:null }, bag:[], choices:[], boss:null, banner:"初更 · 夜行纸人",
      bannerTime:2.4, notice:"", noticeTime:0
    };
    return g;
  }

  function point(a, x, y) {
    a.y = clamp(y, 286, 788);
    const inset = Math.max(0, 376 - a.y) * .55;
    a.x = clamp(x, 110 + inset, W - 110 - inset);
  }

  function notify(g, text) {
    g.notice = text;
    g.noticeTime = 3;
  }

  function pooled(list, free, data, cap) {
    if (list.length >= cap) free.push(list.shift());
    const obj = Object.assign(free.pop() || {}, data);
    list.push(obj);
    return obj;
  }

  function fx(g, type, x, y, life, data = {}) {
    return pooled(g.effects, g.freeEffects, { type,x,y,life,total:life,data }, 150);
  }

  function shot(g, type, x, y, dir, speed, life, damage, rank = 1) {
    return pooled(g.shots, g.freeShots, { type,x,y,dx:Math.cos(dir),dy:Math.sin(dir),speed,life,damage,rank }, 65);
  }

  function drop(g, kind, x, y, value) {
    return pooled(g.drops, g.freeDrops, { kind,x,y,value,life:kind === "xp" ? 38 : 53, glow:g.rand()*10 }, 110);
  }

  function prune(list, filter, free) {
    let write = 0;
    for (const obj of list) {
      if (filter(obj)) list[write++] = obj;
      else if (free) free.push(obj);
    }
    list.length = write;
  }

  function spawn(g, type, x, y, elite = false) {
    if (g.enemies.length >= 58 && type !== "boss") return null;
    const s = enemies[type];
    const hp = Math.round(s.life * (type === "boss" ? 1 + Math.max(0, g.level-8)*.04 : (1 + g.wave * .18) * (elite ? 1.53 : 1)));
    const e = { id:++g.id,type,x,y,hp,maxHp:hp,elite,face:-1,wind:0,cd:.3 + g.rand()*.4,hurt:0,dead:0,
      kx:0,ky:0,mark:0,burn:0,burnNext:0,slow:0,phase:1,move:null,moves:0,step:g.rand()*TAU };
    point(e,x,y);
    g.enemies.push(e);
    return e;
  }

  function closest(g, p, limit = Infinity, skip = null) {
    let found = null;
    let best = limit * limit;
    for (const e of g.enemies) {
      if (e.hp <= 0 || skip?.has(e.id)) continue;
      const sq = (p.x-e.x)**2 + (p.y-e.y)**2;
      if (sq < best) { found = e; best = sq; }
    }
    return found;
  }

  function equipment(g, e) {
    const kind = gearKinds[(g.rand()*gearKinds.length)|0];
    const roll = g.rand() + g.wave * .115 + (e.elite ? .23 : 0);
    const quality = roll > 1.14 ? 3 : roll > .88 ? 2 : roll > .51 ? 1 : 0;
    let value = [9,18,30,45][quality];
    if (kind.slot === "robe") value = [6,11,18,25][quality];
    return { id:++g.id,slot:kind.slot,icon:kind.icon,name:kind.names[quality],quality,value };
  }

  function equip(g, id) {
    const item = g.bag.find(it => it.id === id);
    if (!item) return false;
    g.gear[item.slot] = item;
    return true;
  }

  function kill(g, e) {
    e.hp = 0;
    e.dead = e.type === "boss" ? 1.35 : .46;
    e.wind = 0;
    g.defeated++;
    g.chain = g.time - g.lastKill < 1.5 ? g.chain + 1 : 1;
    g.bestCombo = Math.max(g.chain, g.bestCombo);
    g.lastKill = g.time;
    fx(g,"burst",e.x,e.y-16,.47,{ color:enemies[e.type].color, r: e.type === "boss" ? 145 : 42 });
    if (e.type === "boss") {
      g.finishTime = 1.35;
      for (const foe of g.enemies) if (foe.hp > 0) { foe.hp = 0; foe.dead = .55; }
      prune(g.shots,s=>s.type!=="enemy",g.freeShots);
      g.sounds.push("victory");
      return;
    }
    drop(g,"xp",e.x,e.y,enemies[e.type].xp + (e.elite ? 4 : 0));
    if (e.elite || (g.defeated > 4 && g.rand() < .055)) drop(g,"gear",e.x+13,e.y+5,equipment(g,e));
    if (g.rand() < (g.p.hp < g.p.maxHp*.54 ? .17 : .068)) drop(g,"heal",e.x-14,e.y+4,22);
  }

  function damage(g, e, amount, dir, force = 0) {
    if (e.hp <= 0) return;
    const n = Math.round(amount * (e.molt ? .38 : 1));
    g.damageDealt += Math.min(e.hp,n);
    e.hp -= n;
    e.hurt = .14;
    e.kx += Math.cos(dir) * force;
    e.ky += Math.sin(dir) * force * .68;
    fx(g,"number",e.x+(g.rand()-.5)*12,e.y-(e.type === "boss" ? 112 : 43),.58,{n,color:n > 65 ? "#ffe1a3" : "#f4ecdc"});
    if (e.hp <= 0) kill(g,e);
    else if (e.type === "boss" && e.phase === 1 && e.hp <= e.maxHp*.55) {
      e.phase = 2;
      g.bossPhaseSeen = true;
      e.move = { kind:"ring", x:e.x,y:e.y,r:240,inner:94,duration:1.28,name:"破面 · 逆阴环" };
      e.wind = e.move.duration;
      e.molt = true;
      e.cd = .55;
      g.banner = "祠君破面 · 阴潮逆转";
      g.bannerTime = 1.6;
      g.sounds.push("boss");
      fx(g,"burst",e.x,e.y-35,1.1,{ r:155,color:"#f78468" });
    }
  }

  function hurtPlayer(g, amount, from) {
    const p = g.p;
    if (p.inv > 0 || p.hp <= 0 || g.finishTime) return;
    const n = Math.round(amount * (1 - (g.gear.robe?.value || 0) / 100));
    p.hp = Math.max(0,p.hp-n);
    p.inv = .69;
    p.hurt = .28;
    const a = angle(from,p);
    p.vx = Math.cos(a)*165;
    p.vy = Math.sin(a)*115;
    g.shake = .26;
    g.sounds.push("hurt");
    fx(g,"number",p.x,p.y-74,.8,{n:"−"+n,color:"#ff9686"});
    if (p.hp <= 0) {
      p.hurt = 0;
      g.fallTime = .72;
    }
  }

  function sword(g, aim) {
    const p = g.p;
    if (p.attack > 0 || p.dash > .05) return;
    if (!aim) aim = closest(g,p,196);
    const dir = aim ? angle(p,aim) : Math.atan2(p.dy,p.dx);
    p.dx = Math.cos(dir);
    p.dy = Math.sin(dir);
    if (Math.abs(p.dx) > .02) p.face = Math.sign(p.dx);
    p.combo = p.comboTime > 0 ? (p.combo % 3) + 1 : 1;
    p.comboTime = .8;
    const finisher = p.combo === 3;
    p.attack = finisher ? .44 : .35;
    const r = 117 + g.perks.blade*8 + (finisher ? 29 : 0);
    fx(g,"slash",p.x,p.y-14,.29,{dir,r,finisher,color:finisher?"#ff945e":"#ffe1a3"});
    g.sounds.push("slash");
    let hits = 0;
    for (const e of g.enemies) {
      const d = distance(p,e);
      if (e.hp > 0 && d <= r + (e.type === "boss" ? 28 : 0) && (d < 29 || insideAngle(angle(p,e),dir,finisher ? 1.37 : 1.13))) {
        const bonus = 1 + (g.gear.weapon?.value || 0)/100 + g.perks.blade*.16;
        damage(g,e,(finisher ? 44 : 28)*bonus,dir,(finisher ? 225 : 105)*(e.type==="boss"?.25:1));
        hits++;
      }
    }
    if (hits) {
      g.stop = finisher ? .052 : .029;
      g.shake = finisher ? .17 : .09;
      g.sounds.push("hit");
    }
  }

  function spell(g, i, aim) {
    const p = g.p;
    const rank = p.slots[i];
    if (!rank || p.cds[i] > 0 || p.dash > 0 || p.hp <= 0 || g.finishTime) return false;
    const s = spells[i];
    const auto = closest(g,p,s.id === "thunder" ? 470 : 480);
    const target = aim || auto;
    const dir = target ? angle(p,target) : Math.atan2(p.dy,p.dx);
    const power = 1 + g.perks.focus*.14 + (g.gear.charm?.value || 0)/100;
    p.cds[i] = s.cd * (1 - rank*.055 - Math.min(.22,g.perks.haste*.055));
    p.face = Math.cos(dir) < 0 ? -1 : 1;
    p.cast = .35;
    g.sounds.push(s.id);
    fx(g,"rune",p.x,p.y,.58,{r:52,color:s.color});
    if (s.id === "paper" || s.id === "ghost") {
      const count = s.id === "paper" ? rank : rank === 3 ? 2 : 1;
      for (let j=0;j<count;j++) {
        const offsets = (j-(count-1)/2)*35;
        const unit = { id:++g.id,type:s.id,x:p.x+offsets,y:p.y+25,face:p.face,
          life: (s.id === "paper" ? 9 : 8) + rank, cd:.22+j*.17, rank,power, step:g.rand()*TAU };
        g.allies.push(unit);
        fx(g,"burst",unit.x,unit.y-21,.5,{r:50,color:s.color});
      }
    }
    if (s.id === "talisman") {
      const spread = rank >= 3 ? [-.24,0,.24] : [0];
      for (const offset of spread) shot(g,"talisman",p.x,p.y,dir+offset,545,.79,(23+rank*10)*power*(offset ? .7 : 1),rank);
    }
    if (s.id === "thunder") {
      let e = aim ? closest(g,aim,250) || auto : auto;
      const visited = new Set();
      let origin = null, first = e;
      for (let j=0;j<rank+3 && e;j++) {
        const strong = (j ? .67 : 1) * (e.mark > 0 ? 1.34 : 1);
        const height = e.type === "boss" ? 65 : 32;
        fx(g,"lightning",e.x,e.y-height,.44,{from:origin,color:s.color,seed:g.rand()});
        damage(g,e,(56+rank*15)*power*strong,angle(p,e),70);
        if (e.mark > 0) e.mark = 0;
        origin = {x:e.x,y:e.y-height};
        visited.add(e.id);
        e = closest(g,e,178,visited);
      }
      if (first && rank === 3) damage(g,first,38*power,dir,35);
      if (!first) fx(g,"lightning",p.x+Math.cos(dir)*115,p.y+Math.sin(dir)*85,.35,{color:s.color,seed:g.rand()});
      g.shake = .19;
    }
    if (s.id === "array") {
      const r = 111+rank*22;
      g.fields.push({x:p.x,y:p.y,life:5.3+rank*.45,total:5.3+rank*.45,r,cd:0,damage:(9+rank*4)*power});
      if (rank === 3) for (const e of g.enemies) {
        if (e.type === "boss" || e.hp <= 0 || distance(e,p)>r+62) continue;
        const a = angle(e,p);
        e.kx += Math.cos(a)*525;
        e.ky += Math.sin(a)*525;
      }
    }
    return true;
  }

  function advanceWaves(g) {
    const next = waves[g.wave+1];
    if (next && g.time >= next.start) {
      g.wave++;
      g.banner = next.title;
      g.bannerTime = 2.05;
      if (g.wave === 3) {
        g.boss = spawn(g,"boss",675,310);
        g.sounds.push("boss");
        g.nextSpawn = g.time+9;
      } else {
        spawn(g,g.wave === 1 ? "ghost" : "corpse",675,295,true);
        drop(g,"heal",675,480,25);
      }
    }
    if (g.time < g.nextSpawn || g.finishTime) return;
    const amount = g.wave === 3 ? (g.boss?.phase === 2 ? 4 : 2) :
      g.wave === 0 ? (g.time < 8 ? 2 : 3) : g.wave === 1 ? 4 : 5;
    g.nextSpawn = g.time + [2.42,2.34,2.18,9.1][g.wave];
    for (let i=0;i<amount;i++) {
      const edge = (g.rand()*4)|0;
      const x = edge === 0 ? 115 : edge === 1 ? 1230 : 215+g.rand()*920;
      const y = edge === 2 ? 288 : edge === 3 ? 785 : 360+g.rand()*370;
      const chance = g.rand();
      const type = g.wave === 0 ? "paper" : chance < .27 ? "ghost" : g.wave >= 2 && chance > .68 ? "corpse" : "paper";
      const elite = g.time > 15 && g.rand() < .075;
      spawn(g,type,x,y,elite);
    }
  }

  function bossMove(g, e) {
    const p = g.p;
    const sequence = e.phase === 1 ? ["circle","lane","cleave"] : ["lane","ring","circle","cleave"];
    const kind = sequence[e.moves++ % sequence.length];
    const angry = e.phase === 2;
    const move = { kind, x:e.x,y:e.y,dir:angle(e,p),r:170,inner:0,duration:angry?.72:1.02, name:"斩魂扇" };
    if (kind === "circle") {
      Object.assign(move,{x:p.x,y:p.y,r:angry?112:98,duration:angry?.83:1.03,name:angry?"双魄落印":"落印"});
      if (angry) move.second = {x: clamp(p.x+(p.x>e.x ? 127 : -127),145,W-145),y:clamp(p.y+24,321,755)};
    }
    if (kind === "lane") Object.assign(move,{r:265,width:angry?46:35,name:angry?"裂地交斩":"裂地斩",cross:angry});
    if (kind === "ring") Object.assign(move,{r:232,inner:75,duration:1.02,name:"逆阴环"});
    e.move = move;
    e.wind = move.duration;
  }

  function inLane(p, m, a) {
    const dx = p.x-m.x, dy = p.y-m.y;
    const t = dx*Math.cos(a)+dy*Math.sin(a);
    const side = -dx*Math.sin(a)+dy*Math.cos(a);
    return t >= -18 && t <= m.r+12 && Math.abs(side) <= m.width+9;
  }

  function executeEnemy(g,e) {
    const p = g.p;
    const m = e.move;
    if (e.type === "boss") {
      e.molt = false;
      let hit;
      if (m.kind === "circle") hit = distance(p,m)<m.r+9 || (m.second && distance(p,m.second)<m.r+9);
      if (m.kind === "lane") hit = inLane(p,m,m.dir) || (m.cross && inLane(p,m,m.dir+Math.PI*.66));
      if (m.kind === "ring") hit = distance(p,m)<m.r+10 && distance(p,m)>m.inner-8;
      if (m.kind === "cleave") hit = distance(p,m)<m.r+10 && insideAngle(angle(m,p),m.dir,1.05);
      if (hit) hurtPlayer(g,e.phase === 2 ? 35 : 27,m);
      fx(g,"bossHit",m.x,m.y,.56,{m,color:e.phase === 2 ? "#ff8e71" : "#ffba82"});
      g.shake = .21;
      g.sounds.push("bossHit");
      e.cd = e.phase === 2 ? 1.14 : 1.65;
    } else if (e.type === "ghost") {
      const a = m.dir;
      shot(g,"enemy",e.x,e.y,a,238+g.wave*13,2.2,enemies.ghost.damage+g.wave*3);
      fx(g,"burst",e.x,e.y-21,.3,{r:27,color:"#70ddde"});
      e.cd = 2.1;
    } else {
      if (distance(p,m) < m.r+9 && (m.kind === "circle" || insideAngle(angle(m,p),m.dir,1.05))) {
        hurtPlayer(g,enemies[e.type].damage+g.wave*2,e);
      }
      fx(g,"bossHit",m.x,m.y,.29,{m,color:"#e98970"});
      e.cd = e.type === "paper" ? .78 : 1.24;
    }
    e.move = null;
  }

  function updateEnemies(g,dt) {
    const p = g.p;
    g.grid.clear();
    for (const e of g.enemies) {
      if (e.hp <= 0) { e.dead -= dt; continue; }
      const key = Math.floor(e.x/46) + 40 * Math.floor(e.y/46);
      if (!g.grid.has(key)) g.grid.set(key,[]);
      g.grid.get(key).push(e);
    }
    for (const e of g.enemies) {
      if (e.hp <= 0) continue;
      const s = enemies[e.type];
      e.hurt = Math.max(0,e.hurt-dt);
      e.mark = Math.max(0,e.mark-dt);
      e.slow = Math.max(0,e.slow-dt);
      e.cd = Math.max(0,e.cd-dt);
      if (e.burn > 0) {
        e.burn -= dt;
        e.burnNext -= dt;
        if (e.burnNext <= 0) {
          e.burnNext = .49;
          damage(g,e,e.burnPower,0);
          if (e.hp <= 0) continue;
        }
      }
      const d = distance(e,p);
      const a = angle(e,p);
      e.face = p.x < e.x ? -1 : 1;
      if (e.wind > 0) {
        e.wind -= dt;
        if (e.wind <= 0) executeEnemy(g,e);
      } else if (p.hp > 0 && !g.finishTime && e.cd <= 0 && (e.type === "boss" || d < s.range)) {
        if (e.type === "boss") bossMove(g,e);
        else {
          e.move = {x:e.x,y:e.y,dir:a,kind:e.type === "corpse" ? "circle" : e.type === "ghost" ? "lane" : "cleave",
            r:e.type === "ghost" ? Math.min(235,d+32) : s.range+10,width:14,duration:s.wind};
          e.wind = s.wind;
        }
      }
      let vx = e.kx;
      let vy = e.ky;
      e.kx *= Math.max(0,1-dt*9);
      e.ky *= Math.max(0,1-dt*9);
      if (e.wind <= 0 && e.hurt < .11 && !g.finishTime) {
        let speed = s.speed*(1+g.wave*.11)*(e.slow>0?(e.type==="boss"?.83:.41):1)*(e.type==="boss"&&e.phase===2?1.42:1);
        if (e.type === "paper") speed *= 1 + .18*Math.sin(g.time*9+e.step);
        if (e.type === "corpse") speed *= .83+.35*Math.sin(g.time*4.6+e.step);
        e.moving = d > (e.type === "ghost" ? 154 : e.type === "boss" ? 100 : 24);
        if (e.moving) {
          vx += Math.cos(a)*speed;
          vy += Math.sin(a)*speed*.83;
        } else if (e.type === "ghost" && d < 105) {
          vx -= Math.cos(a)*speed;
          vy -= Math.sin(a)*speed*.83;
        }
      } else e.moving = false;
      const cx = Math.floor(e.x/46);
      const cy = Math.floor(e.y/46);
      if (e.type !== "boss") for (let oy=-1;oy<=1;oy++) for (let ox=-1;ox<=1;ox++) {
        const bucket = g.grid.get(cx+ox+40*(cy+oy));
        if (!bucket) continue;
        for (const other of bucket) {
          if (other === e) continue;
          const dx=e.x-other.x, dy=e.y-other.y, sq=dx*dx+dy*dy;
          const min = other.type === "boss" ? 42 : 22;
          if (sq > .001 && sq < min*min) {
            const sep = 3.3*(min-Math.sqrt(sq))/Math.sqrt(sq);
            vx += dx*sep;
            vy += dy*sep;
          }
        }
      }
      point(e,e.x+vx*dt,e.y+vy*dt);
    }
    prune(g.enemies,e=>e.hp>0||e.dead>0);
  }

  function updateAllies(g,dt) {
    const p = g.p;
    for (const unit of g.allies) {
      unit.life -= dt;
      unit.cd -= dt;
      const target = closest(g,unit,unit.type === "paper" ? 390 : 265);
      const a = target ? angle(unit,target) : angle(unit,p);
      if (unit.type === "paper") {
        const goal = target || p;
        const d = distance(unit,goal);
        if (d > (target ? 34 : 54)) {
          const v = 158+unit.rank*13;
          point(unit,unit.x+Math.cos(a)*v*dt,unit.y+Math.sin(a)*v*dt);
        }
        if (target && d < 56 && unit.cd <= 0) {
          const amount = (12+unit.rank*5)*unit.power;
          damage(g,target,amount,a,51);
          fx(g,"slash",unit.x,unit.y-16,.25,{dir:a,r:58,color:"#ffe6aa"});
          if (unit.rank===3) for (const e of g.enemies) {
            if (e!==target && distance(e,target)<59) damage(g,e,amount*.58,a,38);
          }
          unit.cd=.62;
        }
      } else {
        const t = g.time*1.72+unit.step;
        const x=p.x+Math.cos(t)*73, y=p.y+Math.sin(t)*43;
        unit.x+=(x-unit.x)*Math.min(1,dt*5);
        unit.y+=(y-unit.y)*Math.min(1,dt*5);
        if (target && unit.cd <= 0) {
          target.mark=4.6;
          damage(g,target,(13+unit.rank*7)*unit.power,a,20);
          fx(g,"lightning",target.x,target.y-29,.31,{from:{x:unit.x,y:unit.y-31},seed:g.rand(),color:"#78ebe2",ghost:true});
          unit.cd=.65;
        }
      }
      unit.face=Math.cos(a)<0 ? -1 : 1;
    }
    prune(g.allies,u=>u.life>0);
  }

  function burstTalisman(g,s) {
    const r = 65+s.rank*13;
    fx(g,"blast",s.x,s.y,.57,{r,color:"#ffad63"});
    g.sounds.push("fire");
    for (const e of g.enemies) if (e.hp > 0 && distance(e,s)<r+(e.type==="boss"?23:0)) {
      damage(g,e,s.damage,angle(s,e),107);
      e.burn=1.65;
      e.burnNext=.25;
      e.burnPower=4+s.rank*2;
    }
    g.shake=.10;
  }

  function updateShots(g,dt) {
    for (const s of g.shots) {
      s.life-=dt;
      s.x+=s.dx*s.speed*dt;
      s.y+=s.dy*s.speed*dt;
      if (s.type === "enemy") {
        if (distance(s,g.p)<20) {
          hurtPlayer(g,s.damage,s);
          s.life=0;
        }
      } else if (s.life<=0 || closest(g,s,39)) {
        burstTalisman(g,s);
        s.life=0;
      }
    }
    prune(g.shots,s=>s.life>0&&s.x>35&&s.x<W-35&&s.y>215&&s.y<H, g.freeShots);
  }

  function updateFields(g,dt) {
    for (const f of g.fields) {
      f.life-=dt;
      f.cd-=dt;
      if (f.cd<=0) {
        f.cd=.48;
        for (const e of g.enemies) if (e.hp>0 && distance(e,f)<f.r) {
          e.slow=.71;
          damage(g,e,f.damage,angle(f,e));
        }
      }
    }
    prune(g.fields,f=>f.life>0);
  }

  const perks = [
    {id:"blade",icon:"sword",title:"桃锋",info:"普攻伤害 +16%，攻击距离 +8。",color:"#efc68a"},
    {id:"health",icon:"robe",title:"固本",info:"气血上限 +22，并回复 32 点气血。",color:"#a1c9ee"},
    {id:"focus",icon:"jade",title:"聚炁",info:"所有术法伤害 +14%。",color:"#9fe0b7"},
    {id:"haste",icon:"thunder",title:"行炁",info:"术法冷却再缩短 5.5%，闪避冷却缩短 0.13 秒。",color:"#bba4f4"},
    {id:"magnet",icon:"array",title:"纳魄",info:"拾取范围 +26，移动速度 +8。",color:"#b9ddac"}
  ];

  function rollChoices(g) {
    const options = [];
    const learned = [];
    const unlearned = [];
    for (let i=0;i<spells.length;i++) {
      const s=spells[i], rank=g.p.slots[i];
      if (rank === 3) continue;
      (rank ? learned : unlearned).push({type:"spell",i,icon:s.icon,color:s.color,title:s.full,
        info:rank === 2 ? s.evolve : rank ? s.rank : s.learn,
        label:rank === 2 ? "进阶 · 第三阶" : rank ? "强化 · 第二阶" : "新术法"});
    }
    const take = list => list.splice(Math.floor(g.rand()*list.length),1)[0];
    if (unlearned.length) options.push(take(unlearned));
    if (learned.length) options.push(take(learned));
    const pool = unlearned.concat(learned,perks.filter(p=>p.id!=="haste"||g.perks.haste<4).map(p=>({
      ...p,type:"perk",label:"修为 · "+(g.perks[p.id]+1)
    })));
    if (options.length < 3) options.push(take(pool));
    while (options.length < 3) options.push(take(pool));
    for (let i=options.length-1;i>0;i--) {
      const j=Math.floor(g.rand()*(i+1));
      [options[i],options[j]]=[options[j],options[i]];
    }
    return options;
  }

  function checkLevel(g) {
    if (g.xp<xpNeed(g.level) || g.phase!=="play" || g.fallTime || g.finishTime) return;
    g.xp-=xpNeed(g.level);
    g.level++;
    g.p.hp=Math.min(g.p.maxHp,g.p.hp+9);
    g.choices=rollChoices(g);
    g.phase="upgrade";
    g.sounds.push("level");
  }

  function choose(g,i) {
    if (g.phase !== "upgrade" || !g.choices[i]) return false;
    const c=g.choices[i];
    if (c.type === "spell") {
      g.p.slots[c.i]++;
      g.p.cds[c.i]=0;
    } else {
      g.perks[c.id]++;
      if (c.id === "health") {
        g.p.maxHp+=22;
        g.p.hp=Math.min(g.p.maxHp,g.p.hp+32);
      }
    }
    notify(g,c.label+" · "+c.title);
    g.choices=[];
    g.phase="play";
    checkLevel(g);
    return true;
  }

  function updateDrops(g,dt) {
    for (const item of g.drops) {
      item.life-=dt;
      const d=distance(item,g.p);
      const magnet = (item.kind === "xp" ? 118 : 81)+g.perks.magnet*26;
      if (d<magnet) {
        const a=angle(item,g.p);
        const speed=Math.min(d/dt,240+(magnet-d)*2.5);
        item.x+=Math.cos(a)*speed*dt;
        item.y+=Math.sin(a)*speed*dt;
      }
      if (d>23) continue;
      item.life=0;
      if (item.kind === "xp") { g.xp+=item.value; continue; }
      if (item.kind === "heal") {
        g.p.hp=Math.min(g.p.maxHp,g.p.hp+item.value);
        notify(g,"回阳散 · 回复气血");
      } else {
        g.bag.unshift(item.value);
        const equipped = g.gear[item.value.slot];
        if (!equipped || item.value.quality>equipped.quality) equip(g,item.value.id);
        notify(g,rarity[item.value.quality].name+" · "+item.value.name);
      }
      g.sounds.push("loot");
    }
    prune(g.drops,item=>item.life>0,g.freeDrops);
    checkLevel(g);
  }

  function step(g,dt,input={}) {
    if (g.phase!=="play") return;
    for (const f of g.effects) f.life-=dt;
    prune(g.effects,f=>f.life>0,g.freeEffects);
    g.shake=Math.max(0,g.shake-dt);
    if (g.stop>0) { g.stop-=dt; return; }
    if (g.fallTime) {
      g.fallTime-=dt;
      if (g.fallTime<=0) g.phase="lose";
      return;
    }
    if (g.finishTime) {
      g.finishTime-=dt;
      updateEnemies(g,dt);
      if (g.finishTime<=0) g.phase="win";
      return;
    }
    const p=g.p;
    g.time+=dt;
    g.bannerTime=Math.max(0,g.bannerTime-dt);
    g.noticeTime=Math.max(0,g.noticeTime-dt);
    p.inv=Math.max(0,p.inv-dt);
    p.hurt=Math.max(0,p.hurt-dt);
    p.cast=Math.max(0,p.cast-dt);
    p.attack=Math.max(0,p.attack-dt);
    p.comboTime=Math.max(0,p.comboTime-dt);
    p.dash=Math.max(0,p.dash-dt);
    p.dashCd=Math.max(0,p.dashCd-dt);
    for (let i=0;i<spells.length;i++) p.cds[i]=Math.max(0,p.cds[i]-dt);

    let mx=input.x||0, my=input.y||0;
    const magnitude=Math.hypot(mx,my);
    if (magnitude>1) { mx/=magnitude; my/=magnitude; }
    p.moving=magnitude>.04;
    if (p.moving && p.dash<=0) {
      const dir=Math.atan2(my,mx);
      p.dx=Math.cos(dir);
      p.dy=Math.sin(dir);
      if (Math.abs(mx)>.05 && p.attack<.14) p.face=Math.sign(mx);
    }
    if (input.dash && p.dashCd<=0) {
      p.dash=.2;
      p.dashCd=1.85 - g.perks.haste*.13;
      p.inv=Math.max(p.inv,.31);
      p.vx=p.dx*700;
      p.vy=p.dy*650;
      g.sounds.push("dash");
      fx(g,"dash",p.x,p.y-14,.28,{dir:Math.atan2(p.dy,p.dx),r:85,color:"#b3f4dc"});
    }
    if (input.spell !== undefined) spell(g,input.spell,input.spellAim);
    if (input.attack) sword(g,input.aim);
    const speed=(245+g.perks.magnet*8)*(p.attack>.16?.76:1);
    if (p.dash>0) point(p,p.x+p.vx*dt,p.y+p.vy*dt);
    else {
      point(p,p.x+(mx*speed+p.vx)*dt,p.y+(my*speed*.87+p.vy)*dt);
      p.vx*=Math.max(0,1-dt*14);
      p.vy*=Math.max(0,1-dt*14);
    }
    advanceWaves(g);
    updateEnemies(g,dt);
    updateAllies(g,dt);
    updateShots(g,dt);
    updateFields(g,dt);
    if (!g.fallTime && !g.finishTime) updateDrops(g,dt);
    g.maxCrowd=Math.max(g.maxCrowd,g.enemies.length);
  }

  return { W,H,TAU,clamp,distance,angle,xpNeed,waves,spells,enemies,rarity,gearKinds,create,step,choose,
    equip,spawn,spell,damage,drop,checkLevel,bossMove,executeEnemy };
})();
if (typeof module !== "undefined") module.exports = Rules;
