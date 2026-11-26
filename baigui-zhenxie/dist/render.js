"use strict";

const Art = (() => {
  const core = ["cover","courtyard","idle","run","strike","cast","paper","ghost","corpse","boss",
    "boss-break","paper-icon","ghost-icon","talisman","thunder","array","sword","robe","jade","heal","portrait"];
  const extra = ["run-alt","strike-alt","hurt","down"];
  const images = {};
  function load() {
    return Promise.all(core.concat(extra).map(name => new Promise((resolve,reject)=>{
      const img = new Image();
      img.onload=()=>{images[name]=img; resolve();};
      img.onerror=()=>extra.includes(name)?resolve():reject(new Error("资源加载失败 "+name));
      img.src="assets/"+name+".webp";
    })));
  }
  return {images,load};
})();

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", {alpha:false, desynchronized:true});
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.camera = {x:0,y:0,z:1};
    this.depth = [];
    this.shadow = document.createElement("canvas");
    this.shadow.width=100;
    this.shadow.height=100;
    const shade=this.shadow.getContext("2d");
    const rim=shade.createRadialGradient(50,50,12,50,50,50);
    rim.addColorStop(0,"#061016c9");
    rim.addColorStop(.54,"#0811188c");
    rim.addColorStop(1,"#0d192000");
    shade.fillStyle=rim;
    shade.fillRect(0,0,100,100);
    this.quality = 1;
    this.detail = 2;
    this.fastSprites = {};
    for (const name of ["paper","ghost","corpse"]) {
      const original=Art.images[name];
      this.fastSprites[name]=[-1,1].map(face=>{
        const stamp=document.createElement("canvas");
        stamp.height=Rules.enemies[name].size;
        stamp.width=Math.round(stamp.height*original.width/original.height);
        const paint=stamp.getContext("2d");
        if(face<0) { paint.translate(stamp.width,0);paint.scale(-1,1); }
        paint.drawImage(original,0,0,stamp.width,stamp.height);
        return stamp;
      });
    }
    this.ambient = Array.from({length:38},(_,i)=>({
      x:(i*233.13)%Rules.W,y:253+(i*135.81)%570, phase:(i*4.013)%Rules.TAU, offset:i*.334
    }));
    this.resize();
  }

  setDetail(detail) {
    if(this.detail===detail) return;
    this.detail=detail;
    this.quality=[.40,.61,1][detail];
    this.resize();
  }

  resize() {
    this.w = document.documentElement.clientWidth;
    this.h = document.documentElement.clientHeight;
    const cap = this.detail === 2 ? (this.w*this.h>1600000?1.25:1.6) : this.detail === 1 ? 1.08 : .82;
    this.dpr = Math.min(cap, window.devicePixelRatio||1);
    this.canvas.width=Math.round(this.w*this.dpr);
    this.canvas.height=Math.round(this.h*this.dpr);
    this.canvas.style.width=this.w+"px";
    this.canvas.style.height=this.h+"px";
    const c=this.ctx;
    c.setTransform(this.dpr,0,0,this.dpr,0,0);
    this.vignette=c.createRadialGradient(this.w*.5,this.h*.57,this.h*.23,this.w*.5,this.h*.49,Math.hypot(this.w,this.h)*.57);
    this.vignette.addColorStop(0,"#07101900");
    this.vignette.addColorStop(.68,"#0b122920");
    this.vignette.addColorStop(1,"#020a15cf");
  }

  world(x,y) {
    const a=this.camera;
    return {x:(x-a.x)/a.z,y:(y-a.y)/a.z};
  }

  aimCamera(g) {
    const {W,H,clamp}=Rules;
    const cam=this.camera;
    cam.z=Math.max(this.w/W,this.h/H,this.w<this.h ? .91 : .7);
    const vw=this.w/cam.z, vh=this.h/cam.z;
    const lookX=this.w<this.h ? g.p.x + g.p.dx*30 : 675+(g.p.x-675)*.35;
    const lookY=this.h<this.w*.67 ? 480+(g.p.y-530)*.39 : g.p.y-29;
    const shake=this.reduced?0:g.shake*(g.boss ? 22 : 16);
    cam.x=-clamp(lookX-vw*.5,0,Math.max(0,W-vw))*cam.z+Math.cos(g.time*185)*shake;
    cam.y=-clamp(lookY-vh*.5,0,Math.max(0,H-vh))*cam.z+Math.sin(g.time*171)*shake*.65;
  }

  draw(g) {
    const c=this.ctx;
    const {W,H}=Rules;
    this.aimCamera(g);
    const a=this.camera;
    this.crowded=g.enemies.length>=34;
    c.setTransform(this.dpr,0,0,this.dpr,0,0);
    c.fillStyle="#122127";
    c.fillRect(0,0,this.w,this.h);
    c.translate(a.x,a.y);
    c.scale(a.z,a.z);
    c.drawImage(Art.images.courtyard,-4,-4,W+8,H+8);
    c.fillStyle="#0710191b";
    c.fillRect(0,0,W,H);
    this.light(g);
    for (const field of g.fields) this.field(g,field);
    for (const item of g.drops) this.drop(g,item);
    for (const e of g.enemies) if (e.move && e.wind>0 && e.hp>0) this.warning(e.move,e.wind,false,e.type==="ghost");
    const entities=this.depth;
    entities.length=0;
    entities.push(g.p,...g.enemies,...g.allies);
    entities.sort((x,y)=>x.y-y.y);
    const left=(-a.x)/a.z-130, right=(this.w-a.x)/a.z+130;
    for (const e of entities) if(e.x>=left&&e.x<=right) this.actor(g,e,e===g.p);
    for (const s of g.shots) this.shot(g,s);
    for (const f of g.effects) if (f.x>=left-130&&f.x<=right+130) this.effect(f,g);
    this.fireflies(g);
    c.setTransform(this.dpr,0,0,this.dpr,0,0);
    c.fillStyle=this.vignette;
    c.fillRect(0,0,this.w,this.h);
    if (g.p.hurt>0) {
      c.fillStyle="rgba(160,34,42,"+g.p.hurt*.24+")";
      c.fillRect(0,0,this.w,this.h);
    }
  }

  light(g) {
    const c=this.ctx;
    c.save();
    const lights=[[552,177,147],[820,168,138],[1090,217,111],[353,218,104]];
    for (let j=0;j<lights.length&&this.detail>0;j++) {
      const [x,y,r]=lights[j];
      const glow=c.createRadialGradient(x,y,6,x,y,r);
      glow.addColorStop(0,"rgba(255,125,57,"+(.12+Math.sin(g.time*3.2+j)*.027)+")");
      glow.addColorStop(1,"#ed653600");
      c.fillStyle=glow;
      c.fillRect(x-r,y-r,r*2,r*2);
    }
    if (this.detail>0) {
      const center=c.createRadialGradient(g.p.x,g.p.y,12,g.p.x,g.p.y,190);
      center.addColorStop(0,"#ffdd8e1a");
      center.addColorStop(1,"#f6a75300");
      c.fillStyle=center;
      c.fillRect(g.p.x-190,g.p.y-190,380,380);
    }
    if (g.boss?.phase===2) {
      c.fillStyle="#631e2229";
      c.fillRect(0,0,Rules.W,Rules.H);
    }
    c.restore();
  }

  fireflies(g) {
    if (this.reduced) return;
    const c=this.ctx;
    c.save();
    c.fillStyle="#ffe1a1";
    for (let i=0;i<this.ambient.length*this.quality;i++) {
      const f=this.ambient[i];
      const x=f.x+Math.sin(g.time*.61+f.phase)*46;
      const y=f.y+Math.sin(g.time*.46+f.offset)*29;
      const glow=Math.max(0,Math.sin(g.time*1.6+f.phase));
      c.globalAlpha=.12+glow*.49;
      c.fillRect(x,y,glow*2.1+.7,glow*1.4+.7);
    }
    c.fillStyle="#95b9c2";
    c.globalAlpha=.06;
    for (let i=0;i<this.detail+1;i++) {
      const x=330+i*360+Math.sin(g.time*.125+i)*140;
      const y=340+i*186;
      const mist=c.createRadialGradient(x,y,9,x,y,230);
      mist.addColorStop(0,"#b0d8dc");
      mist.addColorStop(1,"#b0d8dc00");
      c.fillStyle=mist;
      c.save();
      c.translate(x,y);
      c.scale(1,.22);
      c.fillRect(-218,-230,436,460);
      c.restore();
    }
    c.restore();
  }

  ring(x,y,r,color,weight=2,flat=1) {
    const c=this.ctx;
    c.beginPath();
    c.ellipse(x,y,r,r*flat,0,0,Rules.TAU);
    c.strokeStyle=color;
    c.lineWidth=weight;
    c.stroke();
  }

  actor(g,e,player) {
    const c=this.ctx;
    const ally=e.life!==undefined;
    const boss=e.type==="boss";
    const phase=e.phase===2;
    const falling=player && e.hp<=0;
    const t=g.time;
    const cycle=t*(player?16:e.type==="corpse"?4.6:9)+(e.step||0);
    const move=e.moving || (ally && e.type==="paper");
    const hover=e.type==="ghost";
    const attack=player&&e.attack>0.11;
    const casting=player&&e.cast>.06&&!attack;
    let name=boss&&phase?"boss-break":e.type;
    if(player) {
      name=falling?(Art.images.down?"down":"idle") : e.hurt>.1&&Art.images.hurt?"hurt" : attack?
        (e.combo===3&&Art.images["strike-alt"]?"strike-alt":"strike") : casting?"cast" :
        (move||e.dash>0)?(Math.sin(cycle)>0&&Art.images["run-alt"]?"run-alt":"run"):"idle";
    }
    const im=Art.images[name];
    if(!im) return;
    const height=player?(name==="down"?38:105):Rules.enemies[e.type].size*(e.elite?1.17:1)*(ally?.83:1)*(phase?1.1:1);
    const width=im.width/im.height*height;
    const progress=falling ? Rules.clamp(1-(g.fallTime||0)/.72,0,1) : 0;
    const dead=e.hp<=0&&!player;
    const fade=dead?Rules.clamp(e.dead/(boss?1.35:.46),0,1):ally?Math.min(1,e.life*2):1;
    const bob=hover ? -10-Math.sin(t*4.1+e.step)*5 : falling?0: move?-Math.abs(Math.sin(cycle))*4.8:Math.sin(cycle*.23)*1.3;
    const wind=e.wind>0;
    if (this.crowded && this.detail<2 && !(boss||player||ally||dead||e.hurt>0||e.elite||e.mark>0)) {
      const stamp=this.fastSprites[name][e.face<0?0:1];
      const shadowW=stamp.width*.94;
      if(this.detail===1) c.drawImage(this.shadow,e.x-shadowW*.5,e.y-8,shadowW,16);
      c.drawImage(stamp,e.x-stamp.width*.5,e.y+bob-stamp.height+3);
      return;
    }
    const anchor={idle:.55,run:.47,"run-alt":.51,strike:.49,"strike-alt":.49,cast:.5,hurt:.51,down:.5,boss:.52,"boss-break":.52}[name]||.5;
    c.save();
    c.globalAlpha=fade;
    if (player || ally || e.elite || phase || e.mark>0) {
      const tone=player?"#ffe2a4":ally?(hover?"#83d5e4":"#efc777"):phase?"#f78b66":e.mark>0?"#7af4ee":"#b78ad6";
      const size=boss?48:player?29:20;
      c.globalAlpha=fade*(player?.75:.53);
      this.ring(e.x,e.y,size,tone,1.1,.39);
      this.ring(e.x,e.y,size+4,tone+"50",.9,.42);
      c.globalAlpha=fade;
    }
    const shadowW=Math.min(boss?146:86,width*1.17);
    const shadowH=boss?35:player?23:19;
    c.globalAlpha=fade*(hover?.52:1);
    c.drawImage(this.shadow,e.x-shadowW*.5,e.y-shadowH*.5,shadowW,shadowH);
    c.globalAlpha=fade;
    c.translate(e.x,e.y+bob);
    if (player&&e.dash>0) {
      c.globalAlpha=.24;
      for(let i=1;i<=3;i++) c.drawImage(im,-width*anchor-e.dx*i*17,-height-e.dy*i*15,width,height);
      c.globalAlpha=.8;
    }
    c.scale(e.face||1,1);
    if (dead) c.rotate((1-fade)*.9);
    else if (falling&&name!=="down") c.rotate(progress*1.44);
    else if (wind) c.rotate(-Math.sin(e.wind*2)*.15);
    else if (e.hurt>.06) c.rotate(-e.hurt*.8);
    else if (move) c.rotate(Math.sin(cycle)*.085+.07);
    if (attack) c.translate(e.combo===3?11:4,-3);
    if (e.hurt>.06) c.filter="brightness(1.65) saturate(.72)";
    else if (ally) c.filter=hover?"brightness(1.28) saturate(1.35)":"brightness(1.39) sepia(.22)";
    else if (phase) c.filter="sepia(.23) saturate(1.45) brightness(1.2)";
    if (phase && this.quality>.6) {c.shadowBlur=11; c.shadowColor="#ff623c";}
    if (player&&e.inv>0&&e.dash<=0&&!falling) c.globalAlpha=.68+.32*Math.abs(Math.cos(e.inv*17));
    if (falling && name==="down") c.globalAlpha=.75+progress*.25;
    c.drawImage(im,-width*anchor,-height+3,width,height);
    c.restore();
    if(!player&&!ally&&!boss&&e.hp>0&&(e.hurt>0||e.elite)) {
      c.fillStyle="#111820";
      c.fillRect(e.x-17,e.y-height-8,34,4);
      c.fillStyle=e.elite?"#d793e1":"#de8066";
      c.fillRect(e.x-16,e.y-height-7,Math.max(0,e.hp/e.maxHp)*32,2);
    }
  }

  drop(g,d) {
    const c=this.ctx;
    const bob=Math.sin(g.time*4+d.glow)*4;
    const color=d.kind==="xp"?"#9bf6de":d.kind==="heal"?"#f7a57e":Rules.rarity[d.value.quality].color;
    c.save();
    c.globalAlpha=Math.min(1,d.life*.85);
    if(d.kind==="xp") {
      c.fillStyle="#82ebcb27";
      c.beginPath();
      c.ellipse(d.x,d.y,12,4,0,0,Rules.TAU);
      c.fill();
      c.translate(d.x,d.y-8+bob);
      c.rotate(Math.PI*.25+g.time*.9);
      c.fillStyle=color;
      c.fillRect(-3,-3,6,6);
      c.fillStyle="#fcffdb";
      c.fillRect(-2,-2,2,2);
    } else {
      const im=Art.images[d.kind==="heal"?"heal":d.value.icon];
      c.strokeStyle=color;
      c.beginPath();
      c.moveTo(d.x,d.y-39);
      c.lineTo(d.x,d.y-19);
      c.stroke();
      c.drawImage(im,d.x-13,d.y-25+bob,26,26);
      this.ring(d.x,d.y,12,color,1,.4);
    }
    c.restore();
  }

  field(g,f) {
    const c=this.ctx;
    const r=f.r;
    c.save();
    c.globalAlpha=Math.min(.93,f.life*1.5);
    c.translate(f.x,f.y);
    c.fillStyle="#41c4a32e";
    c.beginPath();
    c.arc(0,0,r,0,Rules.TAU);
    c.fill();
    this.ring(0,0,r,"#a5f9bc",2.2);
    this.ring(0,0,r*.87,"#94d7b7b0",1.3);
    this.ring(0,0,r*.49,"#e1ecc07e",1.4);
    c.rotate(g.time*.33);
    c.strokeStyle="#aadcad8e";
    c.lineWidth=1.5;
    c.fillStyle="#d1edb7";
    for(let i=0;i<8;i++) {
      c.rotate(Math.PI*.25);
      c.beginPath();
      c.moveTo(0,r*.38);
      c.lineTo(r*.18,r*.63);
      c.lineTo(0,r*.87);
      c.lineTo(-r*.18,r*.63);
      c.closePath();
      c.stroke();
      for(let j=0;j<3;j++) {
        const y=r*.77-j*5;
        if((i>>j)&1) {
          c.fillRect(-9,y,7,1.6);
          c.fillRect(2,y,7,1.6);
        } else c.fillRect(-9,y,18,1.6);
      }
    }
    c.restore();
  }

  path(m,scale=1) {
    const c=this.ctx;
    c.beginPath();
    if(m.kind==="circle"||m.kind==="ring") {
      c.arc(m.x,m.y,m.r*scale,0,Rules.TAU);
      if(m.kind==="ring") {
        const r=Math.min(m.inner,m.r*scale-.1);
        if(r>0) { c.moveTo(m.x+r,m.y); c.arc(m.x,m.y,r,0,Rules.TAU,true); }
      }
      return;
    }
    if(m.kind==="cleave") {
      c.moveTo(m.x,m.y);
      c.arc(m.x,m.y,m.r*scale,m.dir-1.05,m.dir+1.05);
      c.closePath();
      return;
    }
    const a=m.dir;
    const n=m.width;
    const ux=Math.cos(a),uy=Math.sin(a),vx=-uy*n,vy=ux*n;
    c.moveTo(m.x+vx,m.y+vy);
    c.lineTo(m.x+vx+ux*m.r*scale,m.y+vy+uy*m.r*scale);
    c.lineTo(m.x-vx+ux*m.r*scale,m.y-vy+uy*m.r*scale);
    c.lineTo(m.x-vx,m.y-vy);
    c.closePath();
  }

  warning(m,t,impact,ghost) {
    const c=this.ctx;
    const pct=impact?1:Math.max(.03,1-t/m.duration);
    c.save();
    c.lineWidth=impact?2.6:1.7;
    c.strokeStyle=ghost?"#9df8f5e1":impact?"#ffdb9a":"#ff927cf0";
    c.fillStyle=ghost?"#50e3e142":impact?"#f46f5d85":"#e658533f";
    const areas=[m];
    if(m.second) areas.push({...m,...m.second,second:null});
    if(m.cross) areas.push({...m,dir:m.dir+Math.PI*.66,cross:false});
    for(const shape of areas) {
      this.path(shape);
      c.fill();
      c.stroke();
      if(!impact) {
        c.save();
        c.globalAlpha=.21+pct*.42;
        this.path(shape,pct);
        c.fill();
        c.stroke();
        c.restore();
      }
    }
    c.restore();
  }

  shot(g,s) {
    const c=this.ctx;
    c.save();
    c.translate(s.x,s.y-15);
    c.rotate(Math.atan2(s.dy,s.dx));
    const color=s.type==="enemy"?"#8ef2f4":"#ffba80";
    const trail=c.createLinearGradient(-42,0,10,0);
    trail.addColorStop(0,"#ffecd000");
    trail.addColorStop(1,color);
    c.fillStyle=trail;
    c.beginPath();
    c.moveTo(-48,0);
    c.quadraticCurveTo(2,-17,12,0);
    c.quadraticCurveTo(3,16,-48,0);
    c.fill();
    if(s.type==="talisman") c.drawImage(Art.images.talisman,-11,-12,26,24);
    else {
      c.fillStyle="#c6ffff";
      c.beginPath();
      c.ellipse(0,0,9,5,0,0,Rules.TAU);
      c.fill();
    }
    c.restore();
  }

  effect(f,g) {
    const c=this.ctx;
    const life=f.life/f.total;
    const t=1-life;
    const data=f.data;
    const color=data.color;
    c.save();
    c.globalAlpha=Math.min(1,life*1.8);
    if(f.type==="number") {
      c.font=(typeof data.n==="string" || data.n>65?"bold 20px":"bold 15px")+" Georgia, serif";
      c.textAlign="center";
      c.lineWidth=3.2;
      c.strokeStyle="#111b21";
      c.fillStyle=color;
      c.strokeText(data.n,f.x,f.y-37*t);
      c.fillText(data.n,f.x,f.y-37*t);
    } else if(f.type==="bossHit") this.warning(data.m,0,true,false);
    else if(f.type==="slash" || f.type==="dash") {
      const dir=data.dir;
      const r=data.r*(.75+t*.29);
      c.translate(f.x,f.y);
      c.scale(1,.73);
      c.rotate(dir);
      c.beginPath();
      c.arc(0,0,r,-1.21,1.28);
      c.quadraticCurveTo(r*.64,r*.86,r*.71,r*.02);
      c.quadraticCurveTo(r*.63,-r*.72,Math.cos(-1.21)*r,Math.sin(-1.21)*r);
      const stroke=c.createLinearGradient(0,-r,r,r*.4);
      stroke.addColorStop(0,color+"00");
      stroke.addColorStop(.42,color+"c0");
      stroke.addColorStop(1,"#fff5cde0");
      c.fillStyle=stroke;
      c.fill();
      c.strokeStyle=color;
      c.lineWidth=data.finisher?3:1.4;
      c.beginPath();
      c.arc(0,0,r+7,-.92,1.04);
      c.stroke();
    } else if(f.type==="lightning") {
      const origin=data.from||{x:f.x-18,y:f.y-255};
      const dx=f.x-origin.x,dy=f.y-origin.y;
      c.beginPath();
      c.moveTo(origin.x,origin.y);
      for(let i=1;i<8;i++) {
        const j=i/8;
        const offset=Math.sin(i*11+data.seed*29+t*11)*(data.ghost?12:23);
        c.lineTo(origin.x+dx*j+offset,origin.y+dy*j-offset*.18);
      }
      c.lineTo(f.x,f.y);
      c.strokeStyle=color+"6c";
      c.lineWidth=14;
      c.stroke();
      c.strokeStyle=color;
      c.lineWidth=5.5;
      c.stroke();
      c.strokeStyle="#fff4fa";
      c.lineWidth=2.1;
      c.stroke();
      this.ring(f.x,f.y,14+t*42,color,1.4,.41);
    } else {
      const r=data.r;
      const blast=f.type==="blast";
      if(blast) {
        const halo=c.createRadialGradient(f.x,f.y,0,f.x,f.y,r*(.65+t*.42));
        halo.addColorStop(0,"#fff3b0b4");
        halo.addColorStop(.48,"#fb803a65");
        halo.addColorStop(1,"#ff662000");
        c.fillStyle=halo;
        c.fillRect(f.x-r*1.3,f.y-r*1.3,r*2.6,r*2.6);
      }
      this.ring(f.x,f.y,r*(.35+t*.67),color,blast?3:1.8,blast?1:.53);
      this.ring(f.x,f.y,r*(.20+t*.53),"#fff0b8",1,.58);
      c.fillStyle=color;
      const count=f.type==="rune"?6:Math.floor((blast?20:11)*this.quality);
      for(let i=0;i<count;i++) {
        const a=i/count*Rules.TAU+f.x*.02;
        const d=r*(.15+t*.86)*(.74+(i%3)*.13);
        c.save();
        c.translate(f.x+Math.cos(a)*d,f.y+Math.sin(a)*d*.61-t*(blast?35:23));
        c.rotate(a);
        c.fillRect(0,0,2.2+t*4,1.5+(i%2));
        c.restore();
      }
    }
    c.restore();
  }
}
