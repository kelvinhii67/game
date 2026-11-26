"use strict";

function pilot(R, g) {
  const p = g.p;
  const live = g.enemies.filter(e => e.hp>0);
  let target = live.reduce((best,e)=>!best||R.distance(e,p)<R.distance(best,p)?e:best,null);
  if(g.boss?.hp>0 && R.distance(g.boss,p)<290 &&
     (!target||R.distance(target,p)>90)) target=g.boss;
  const dist = target ? R.distance(target,p) : Infinity;
  const loot = g.drops.filter(d=>d.kind==="xp" || d.kind==="gear" || (d.kind==="heal" && p.hp<p.maxHp-18))
    .sort((a,b)=>R.distance(p,a)-R.distance(p,b))[0];
  let towards=loot&&R.distance(p,loot)<(p.hp<55?220:155)?loot:target;
  let stop=towards===target && dist<(target?.type==="boss"?104:81);
  let dodge=false;
  const boss=g.boss;
  if (boss?.move && boss.wind>0) {
    const m=boss.move;
    const safe=awayFrom(p,m);
    if(safe) {
      towards={x:p.x+safe.x*190,y:p.y+safe.y*190};
      stop=false;
      dodge=boss.wind<.27 && p.dashCd<=0;
    }
  } else if (target?.move && target.type!=="ghost" && target.wind<.23 &&
      R.distance(p,target.move)<target.move.r+10) {
    const a=R.angle(target,p);
    towards={x:p.x+Math.cos(a)*160,y:p.y+Math.sin(a)*160};
    stop=false;
    dodge=p.dashCd<=0;
  }
  const dir=towards?R.angle(p,towards):0;
  let spell;
  if (dist<450 && p.dash<=0 && !dodge) {
    for(const i of [1,0,3,2,4]) {
      const limits=[310,240,350,380,152];
      if(p.slots[i] && p.cds[i]<=0 && dist<limits[i]) {spell=i;break;}
    }
  }
  return {x:stop||!towards?0:Math.cos(dir),y:stop||!towards?0:Math.sin(dir),dash:dodge,attack:dist<139,aim:target,spell};
}

function awayFrom(p,m) {
  const dx=p.x-m.x, dy=p.y-m.y;
  const d=Math.hypot(dx,dy), dir=Math.atan2(dy,dx);
  if (m.kind==="ring") {
    if(d>m.inner-15 && d<m.r+15) {
      const a=dir+(d<(m.r+m.inner)*.5?Math.PI:0);
      return {x:Math.cos(a),y:Math.sin(a)};
    }
  } else if(m.kind==="circle") {
    const circles=m.second?[m,m.second]:[m];
    for(const center of circles) {
      if(Math.hypot(p.x-center.x,p.y-center.y)<m.r+15) {
        const a=Math.hypot(p.x-center.x,p.y-center.y)<4?0:Math.atan2(p.y-center.y,p.x-center.x);
        return {x:Math.cos(a),y:Math.sin(a)};
      }
    }
  } else if(m.kind==="cleave" && d<m.r+17) {
    return {x:Math.cos(dir),y:Math.sin(dir)};
  } else if(m.kind==="lane") {
    for(const a of m.cross?[m.dir,m.dir+Math.PI*.66]:[m.dir]) {
      const along=dx*Math.cos(a)+dy*Math.sin(a);
      const side=-dx*Math.sin(a)+dy*Math.cos(a);
      if(along>-19 && along<m.r+16 && Math.abs(side)<m.width+16) {
        const sign=side<0?-1:1;
        return {x:-Math.sin(a)*sign,y:Math.cos(a)*sign};
      }
    }
  }
  return null;
}

function choice(g, policy = "mixed") {
  const weights = policy==="summons"?[9,10,5,4,4]:policy==="blade"?[3,3,4,6,4]:[8,9,7,8,6];
  let best=-Infinity, index=0;
  g.choices.forEach((c,i)=>{
    const score=c.type==="spell"?weights[c.i]+(g.p.slots[c.i]===2?2:0):
      c.id==="health"&&g.p.hp<65?15:c.id==="blade"&&policy==="blade"?10:c.id==="focus"?4:2;
    if(score>best){best=score;index=i;}
  });
  return index;
}

module.exports = { pilot, choice };
