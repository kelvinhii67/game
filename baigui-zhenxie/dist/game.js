"use strict";

const byId = id => document.getElementById(id);
const field = byId("field");
const hud = byId("hud");
const title = byId("title");
const overlay = byId("overlay");
const dialog = byId("dialog");
const content = byId("dialog-content");
const start = byId("start");
const spellbar = byId("spellbar");
const joystick = byId("joystick");
const attackButton = byId("attack");
const dashButton = byId("dash");
const controls = Rules.spells.map((s,i)=>{
  const b=document.createElement("button");
  b.type="button";
  b.className="slot";
  b.style.setProperty("--tint",s.color);
  b.setAttribute("aria-label",s.full+" "+s.key);
  b.innerHTML='<img src="assets/'+s.icon+'.webp" alt=""><kbd>'+s.key+'</kbd><span>'+s.name+'</span><b></b>';
  spellbar.append(b);
  return b;
});
const audioNames=["slash","hit","hurt","dash","paper","ghost","talisman","fire","thunder","array","loot","level","boss","bossHit","victory"];
const speaker='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z"></path>';
const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k,v) => { try { localStorage.setItem(k,v); } catch { /* Storage can be disabled. */ } };
let best = Number(read("wuyin-best")) || 0;
let game = null;
let panel = null;
let rig = null;
let dirty = false;
let ready = false;
let stickId=null, stickCenter=null;
const audio = { context:null, master:null, buffers:{}, muted:read("wuyin-mute")==="yes", score:null, last:{} };
const input={ keys:new Set(), x:0,y:0, aim:null, tapAim:null, pointer:null, attack:null, queued:[], dash:false };
const status = {
  level:byId("level"),hp:byId("hp-text"),hpFill:byId("hp-fill"),xp:byId("xp-fill"),wave:byId("wave-name"),
  clock:byId("clock"), progress:byId("wave-fill"),kills:byId("kills"),boss:byId("boss-hud"),
  bossPhase:byId("boss-phase"), bossMove:byId("boss-move"), bossFill:byId("boss-fill"),
  banner:byId("announce"),notice:byId("notice")
};

function setupAudio() {
  if (audio.context) {
    audio.context.resume().catch(()=>{});
    return;
  }
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context) return;
  const c=new Context();
  audio.context=c;
  audio.master=c.createGain();
  audio.master.gain.value=audio.muted?0:.72;
  audio.master.connect(c.destination);
  c.resume().catch(()=>{});
  const audioExt=new Audio().canPlayType('audio/ogg; codecs="vorbis"')?"ogg":"m4a";
  for(const name of audioNames.concat("ambience")) {
    fetch("assets/"+name+"."+audioExt).then(r=>r.arrayBuffer()).then(b=>c.decodeAudioData(b)).then(buffer=>{
      audio.buffers[name]=buffer;
      if(name==="ambience"&&game) playScore();
    }).catch(()=>{});
  }
}

function playScore() {
  if (audio.score||!audio.buffers.ambience) return;
  const c=audio.context;
  const source=c.createBufferSource();
  const gain=c.createGain();
  source.buffer=audio.buffers.ambience;
  source.loop=true;
  gain.gain.value=.46;
  source.connect(gain).connect(audio.master);
  source.start();
  audio.score=source;
}

function sounds(g) {
  if(!audio.context || audio.muted) {g.sounds.length=0;return;}
  const c=audio.context;
  const now=c.currentTime;
  for(const s of g.sounds) {
    const buffer=audio.buffers[s];
    if(!buffer||now-(audio.last[s]??-9)<.063) continue;
    audio.last[s]=now;
    const source=c.createBufferSource();
    const gain=c.createGain();
    source.buffer=buffer;
    source.playbackRate.value=s==="slash"||s==="hit"?1+(Math.random()-.5)*.18:1;
    gain.gain.value=s==="bossHit"||s==="hurt"?.49:.64;
    source.connect(gain).connect(audio.master);
    source.onended=()=>{source.disconnect();gain.disconnect();};
    source.start();
  }
  g.sounds.length=0;
}

function soundButtons() {
  for(const b of document.querySelectorAll(".sound")) {
    b.setAttribute("aria-label",audio.muted?"开启声音":"关闭声音");
    b.innerHTML=speaker+(audio.muted?'<path d="m16 9 5 6m0-6-5 6"></path>':'<path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"></path>')+"</svg>";
  }
}

function toggleSound() {
  audio.muted=!audio.muted;
  save("wuyin-mute",audio.muted?"yes":"no");
  if(!audio.muted) setupAudio();
  if(audio.master) audio.master.gain.setTargetAtTime(audio.muted?0:.72,audio.context.currentTime,.02);
  soundButtons();
}

function record() {
  const el=byId("record");
  el.hidden=best===0;
  el.textContent="村志纪录 · 最多镇伏 "+best+" 只鬼物";
}

function startRun() {
  if(!ready) return;
  setupAudio();
  playScore();
  clearInput();
  game=Rules.create();
  title.hidden=true;
  field.hidden=false;
  hud.hidden=false;
  close();
  rig.resize();
  dirty=true;
  syncHud(game);
}

function toTitle() {
  game=null;
  close();
  hud.hidden=true;
  field.hidden=true;
  title.hidden=false;
  if(audio.score) {audio.score.stop();audio.score=null;}
  record();
  start.focus();
}

function clearInput() {
  input.keys.clear();
  input.x=input.y=0;
  input.aim=null;
  input.tapAim=null;
  input.pointer=null;
  input.attack=null;
  input.dash=false;
  input.queued.length=0;
  stickId=null;
  joystick.firstElementChild.style.transform="";
}

function open(kind, html, compact=false) {
  clearInput();
  panel=kind;
  overlay.hidden=false;
  dialog.classList.toggle("compact",compact);
  content.innerHTML=html;
  dialog.scrollTop=0;
  dialog.focus();
  dirty=true;
}

function close() {
  panel=null;
  overlay.hidden=true;
  clearInput();
  dirty=true;
}

const button=(act,label,primary=false)=>'<button class="'+(primary?"primary":"secondary")+'" data-act="'+act+'" type="button">'+label+"</button>";
const row=body=>'<div class="close-row">'+body+'</div>';
const heading=(name,desc)=>'<h2 id="dialog-title">'+name+'</h2>'+(desc?'<p>'+desc+'</p>':"");
function help() {
  const cards=Rules.spells.map(s=>'<dt>'+s.key+' · '+s.name+'</dt><dd>'+s.learn+'</dd>').join("");
  open("help",heading("行走手记", "守过三更，击败铜面祠君。拾取鬼魄可参悟术法，留意脚下的攻击预警。")+
    '<dl class="notes"><dt>键鼠</dt><dd>WASD / 方向键移动 · 左键 / J 攻击 · 空格闪避 · Q E R F C 或 1–5 施法 · Tab 行囊</dd>'+
    '<dt>触屏</dt><dd>左手摇杆移动，右手长按桃木剑或轻触术法。术法自动寻敌。</dd>'+cards+'</dl>'+
    row(button("resume","合上手记",true)),true);
}

function pause() {
  if (!game||game.phase!=="play") return;
  open("pause",heading("暂歇","雾隐村 · "+Rules.waves[game.wave].name)+row(
    button("resume","继续镇邪",true)+button("help","行走手记")+button("title","返回封面")),true);
}

function bag() {
  if (!game||game.phase!=="play") return;
  const equipped=Rules.gearKinds.map(k=>{
    const item=game.gear[k.slot];
    return "<article><small>"+k.name+'</small><strong style="color:'+
      (item?Rules.rarity[item.quality].color:"#c7bda7")+'">'+(item?item.name+" · "+item.value+"%":k.names[0])+"</strong></article>";
  }).join("");
  const inventory=game.bag.map(it=>{
    const k=Rules.gearKinds.find(a=>a.slot===it.slot);
    const q=Rules.rarity[it.quality];
    return '<button class="gear" type="button" data-equip="'+it.id+'" style="--tint:'+q.color+'">'+
      '<img src="assets/'+it.icon+'.webp" alt=""><strong>'+it.name+'</strong><small>'+k.stat+" +"+it.value+
      '%</small><em>'+q.name+(game.gear[it.slot]===it?" · 已装备":" · 点击装备")+'</em></button>';
  }).join("");
  open("bag",heading("随身行囊", "靠近地上的装备即可收取。拾到更高品质的同部位装备时自动穿戴。")+
    '<div class="equipped">'+equipped+'</div>'+
    (inventory?'<div class="gear-list">'+inventory+'</div>':'<p>尚未拾到可替换的装备。</p>')+row(button("resume","收起行囊",true)));
}

function upgrades() {
  const buttons=game.choices.map((c,i)=>'<button class="choice" type="button" style="--tint:'+c.color+'" data-choice="'+
    i+'"><img src="assets/'+c.icon+'.webp" alt=""><em>'+c.label+'</em><strong>'+c.title+'</strong><small>'+c.info+'</small></button>').join("");
  open("upgrade",heading("参悟术法","境界 "+game.level+" · 选择一项强化，战斗暂停。")+'<div class="choices">'+buttons+'</div>');
}

function outcome() {
  const win=game.phase==="win";
  if(game.defeated>best) {best=game.defeated;save("wuyin-best",String(best));}
  const stats='<div class="stats"><article><strong>'+game.defeated+'</strong><small>镇伏鬼物</small></article>'+
    '<article><strong>'+game.level+'</strong><small>最终境界</small></article>'+
    '<article><strong>'+clockString(game.time)+'</strong><small>守村时长</small></article></div>';
  open("outcome",heading(win?"天光已至":"魂散雾隐",win?"铜面祠君已伏诛，雾隐村度过了漫长一夜。":"沈砚倒在雾隐村。重入村中，另选一道术法。")+
    stats+row(button("retry",win?"再入雾隐":"重新入村",true)+button("title","返回封面")),true);
}

function clockString(time) {
  const seconds=Math.floor(time);
  return String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0");
}

function setText(el, str) {
  if(el.textContent!==String(str)) el.textContent=str;
}
function setFill(el,v) { el.style.transform="scaleX("+Rules.clamp(v,0,1).toFixed(3)+")"; }
function cdLabel(v) { return v>.07?(v<1?v.toFixed(1):String(Math.ceil(v))):""; }

function syncHud(g) {
  const p=g.p;
  setText(status.level,"境界 "+g.level);
  setText(status.hp,Math.ceil(p.hp)+" / "+p.maxHp);
  setFill(status.hpFill,p.hp/p.maxHp);
  setFill(status.xp,g.xp/Rules.xpNeed(g.level));
  setText(status.clock,clockString(g.time));
  setText(status.wave,Rules.waves[g.wave].name);
  setText(status.kills,g.defeated);
  setFill(status.progress,g.wave===3?1:(g.time-Rules.waves[g.wave].start)/(Rules.waves[g.wave+1].start-Rules.waves[g.wave].start));
  status.boss.hidden=!g.boss;
  if(g.boss) {
    const b=g.boss;
    setFill(status.bossFill,b.hp/b.maxHp);
    setText(status.bossPhase,b.phase===1?"引魂":"破面");
    setText(status.bossMove,b.move?.name||"");
  }
  setText(status.banner,g.banner);
  status.banner.classList.toggle("visible",g.bannerTime>0);
  setText(status.notice,g.noticeTime>0?g.notice:"");
  for(let i=0;i<controls.length;i++) {
    const b=controls[i], rank=p.slots[i];
    b.classList.toggle("locked",!rank);
    const message=rank?("第 "+rank+" 阶"):"待参悟";
    const label=Rules.spells[i].full+" · "+message;
    if(b.title!==label) { b.title=label; b.setAttribute("aria-label",label); }
    setText(b.lastElementChild,rank?cdLabel(p.cds[i]):"");
  }
  setText(dashButton.lastElementChild,cdLabel(p.dashCd));
}

function canFight() { return game?.phase==="play"&&!panel&&!game.fallTime&&!game.finishTime; }
function queueSpell(i) {
  if(!canFight()) return;
  if(!game.p.slots[i]) Rules.notify(game,"升级后可参悟 "+Rules.spells[i].full);
  else if(input.queued.length<5) input.queued.push(i);
}

function canKey(e) {
  return e.code==="Space"||e.code==="Tab"||e.code.startsWith("Arrow")||
    ["KeyW","KeyA","KeyS","KeyD","KeyJ","KeyQ","KeyE","KeyR","KeyF","KeyC","Digit1","Digit2","Digit3","Digit4","Digit5"].includes(e.code);
}

window.addEventListener("keydown",e=>{
  if(e.ctrlKey||e.altKey||e.metaKey) return;
  if(e.code==="Escape") {
    if(e.repeat) return;
    if(["pause","bag","help"].includes(panel)) close();
    else if(!panel&&game) pause();
    return;
  }
  if(panel==="upgrade" && /^Digit[123]$/.test(e.code) && !e.repeat) {
    const ix=Number(e.code.slice(-1))-1;
    Rules.choose(game,ix);
    close();
    return;
  }
  if (!game) return;
  if (e.code==="Tab"&&(!panel||panel==="bag")) {
    e.preventDefault();
    if (!e.repeat) panel==="bag"?close():bag();
    return;
  }
  if (!canFight()) return;
  if (canKey(e)) e.preventDefault();
  input.keys.add(e.code);
  if(e.repeat) return;
  if(e.code==="Space") input.dash=true;
  if(e.code==="KeyJ") input.keys.add("AttackOnce");
  const named=["KeyQ","KeyE","KeyR","KeyF","KeyC"].indexOf(e.code);
  if(named>=0) queueSpell(named);
  if(/^Digit[1-5]$/.test(e.code)) queueSpell(Number(e.code.slice(-1))-1);
});
window.addEventListener("keyup",e=>input.keys.delete(e.code));
window.addEventListener("blur",clearInput);
document.addEventListener("visibilitychange",()=>{
  if(document.hidden&&canFight()) pause();
});
window.addEventListener("resize",()=>{
  if(rig) rig.resize();
  dirty=true;
});

function bindHold(el,begin,end) {
  el.addEventListener("pointerdown",e=>{
    if(!canFight()||e.button!==0) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    begin(e);
  });
  for(const type of ["pointerup","pointercancel","lostpointercapture"]) el.addEventListener(type,end);
}

bindHold(field,e=>{
  input.pointer=e.pointerId;
  input.aim=rig.world(e.clientX,e.clientY);
  input.tapAim=input.aim;
  input.attack=e.pointerId;
  input.keys.add("AttackOnce");
},e=>{
  if(input.pointer!==e.pointerId) return;
  input.pointer=null;
  input.attack=null;
});
field.addEventListener("pointermove",e=>{
  if(input.pointer===e.pointerId || (e.pointerType==="mouse"&&canFight())) input.aim=rig.world(e.clientX,e.clientY);
});
bindHold(attackButton,e=>{input.attack=e.pointerId;input.aim=null;input.keys.add("AttackOnce");},e=>{
  if(input.attack===e.pointerId) input.attack=null;
});
bindHold(dashButton,()=>{input.dash=true;},()=>{});
for(let i=0;i<controls.length;i++) controls[i].addEventListener("click",()=>queueSpell(i));

function stick(e) {
  const x=e.clientX-stickCenter.x,y=e.clientY-stickCenter.y;
  const d=Math.hypot(x,y);
  const r=stickCenter.r;
  input.x=x/Math.max(r,d);
  input.y=y/Math.max(r,d);
  joystick.firstElementChild.style.transform="translate("+input.x*r+"px,"+input.y*r+"px)";
}
bindHold(joystick,e=>{
  if(stickId!==null) return;
  const rect=joystick.getBoundingClientRect();
  stickId=e.pointerId;
  stickCenter={x:rect.left+rect.width/2,y:rect.top+rect.height/2,r:rect.width*.32};
  stick(e);
},e=>{
  if(e.pointerId!==stickId) return;
  stickId=null;
  input.x=input.y=0;
  joystick.firstElementChild.style.transform="";
});
joystick.addEventListener("pointermove",e=>{
  if(stickId===e.pointerId&&canFight()) stick(e);
});
dashButton.addEventListener("click",e=>{if(e.detail===0&&canFight()) input.dash=true;});
attackButton.addEventListener("click",e=>{if(e.detail===0&&canFight()) input.keys.add("AttackOnce");});
byId("help").addEventListener("click",help);
byId("pause").addEventListener("click",pause);
byId("bag").addEventListener("click",bag);
start.addEventListener("click",startRun);
for(const b of document.querySelectorAll(".sound")) b.addEventListener("click",toggleSound);

content.addEventListener("click",e=>{
  const b=e.target.closest("button");
  if(!b) return;
  if(b.dataset.choice!==undefined && game?.phase==="upgrade") {
    Rules.choose(game,Number(b.dataset.choice));
    close();
    return;
  }
  if(b.dataset.equip) {
    Rules.equip(game,Number(b.dataset.equip));
    bag();
    return;
  }
  if(b.dataset.act==="resume") close();
  if(b.dataset.act==="title") toTitle();
  if(b.dataset.act==="retry") startRun();
  if(b.dataset.act==="help") help();
});

dialog.addEventListener("keydown",event=>{
  if(event.code!=="Tab"||panel==="bag") return;
  const buttons=[...dialog.querySelectorAll("button")];
  if(!buttons.length) return;
  const i=buttons.indexOf(document.activeElement);
  buttons[(i+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus();
  event.preventDefault();
});

let last=0, acc=0, hudAt=0, qualityAt=0, samples=0, sampleTime=0, healthyFrames=0;
const delta=1/60;

function runFrame(now) {
  const ms=Math.min(.085,(now-(last||now))/1000);
  last=now;
  if(game) {
    if(!panel&&game.phase==="play") {
      acc+=ms;
      samples++;
      sampleTime+=ms;
      if (now>qualityAt && samples>=6) {
        const frameTime=sampleTime/samples;
        healthyFrames=frameTime<.020?healthyFrames+1:0;
        if (frameTime>.029 && rig.detail>0) rig.setDetail(rig.detail-1);
        else if (healthyFrames>=5 && rig.detail<2 && game.enemies.length<25) {
          rig.setDetail(rig.detail+1);
          healthyFrames=0;
        }
        samples=sampleTime=0;
        qualityAt=now+540;
      }
      while(acc>=delta&&game.phase==="play") {
        const k=input.keys;
        const x=(k.has("KeyD")||k.has("ArrowRight")?1:0)-(k.has("KeyA")||k.has("ArrowLeft")?1:0);
        const y=(k.has("KeyS")||k.has("ArrowDown")?1:0)-(k.has("KeyW")||k.has("ArrowUp")?1:0);
        const accepting=game.stop<=0;
        Rules.step(game,delta,{x:x+input.x,y:y+input.y,attack:input.attack!==null||k.has("KeyJ")||k.has("AttackOnce"),
          aim:input.attack!==null?input.aim:input.tapAim, spell:accepting?input.queued.shift():undefined,dash:input.dash});
        if(accepting) {
          input.dash=false;
          k.delete("AttackOnce");
          input.tapAim=null;
        }
        acc-=delta;
      }
      sounds(game);
      dirty=true;
    } else acc=0;
    if(game.phase==="upgrade"&&!panel) upgrades();
    if((game.phase==="win"||game.phase==="lose")&&!panel) outcome();
    if(dirty) { rig.draw(game); dirty=false; }
    if(now>hudAt) { syncHud(game);hudAt=now+62; }
  }
  requestAnimationFrame(runFrame);
}

soundButtons();
record();
Art.load().then(()=>{
  rig=new Renderer(field);
  ready=true;
  start.disabled=false;
  requestAnimationFrame(runFrame);
}).catch(err=>{
  start.firstElementChild.textContent="资源载入失败";
  start.title=err.message;
});
