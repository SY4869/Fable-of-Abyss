/* =============================================================================
   フェイブル・オブ・アビス / FABLE OF THE ABYSS ─ ゲーム本体
   -----------------------------------------------------------------------------
   読み込み順
     1. assets/js/assets.js  素材のありか（ART / SCENE / MUSIC）
     2. assets/js/audio.js   BGMと効果音を鳴らす仕組み
     3. assets/js/logic.js   このファイル
     4. assets/js/ads.js     広告枠（出していないときは何もしない）
   ============================================================================= */
'use strict';
(function(){
/* ==================================================================
   フェイブル・オブ・アビス  /  FABLE OF THE ABYSS
   ================================================================== */
var W=480,H=640,TAU=Math.PI*2;
var cv=document.getElementById('cv');
var ctx=cv.getContext('2d');
function $(id){return document.getElementById(id);}

/* ---------- utils ---------- */
function rnd(a,b){ if(b===undefined){b=a;a=0;} return a+Math.random()*(b-a); }
function ri(a,b){ return Math.floor(rnd(a,b)); }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function ang(x1,y1,x2,y2){ return Math.atan2(y2-y1,x2-x1); }
function norm(a){ while(a>Math.PI)a-=TAU; while(a<-Math.PI)a+=TAU; return a; }
function d2(x1,y1,x2,y2){ var dx=x2-x1,dy=y2-y1; return dx*dx+dy*dy; }
function hex2rgb(h){ h=h.replace('#',''); if(h.length===3){h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];}
  return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)]; }

/* ---------- audio ---------- */
var muted=false, shotSfxCount=0;
/* AudioContext は音声エンジン（audio.js）と共有する。
   これで効果音も最初のタップで一緒に解錠される */
function actx(){ return (window.BGM&&BGM.ctx&&BGM.ctx())||null; }
/* 効果音
   -----------------------------------------------------------------------------
   音の作り分けの方針

   ・敵を倒した音（kill）は「上がる」音、被弾した音（dmg）は「落ちる」音。
     旧版はどちらも同じ向きに下がる音だったため、
     敵を倒したのか自分が撃たれたのかが耳で判別しづらかった。
   ・被弾と力尽きた瞬間（dead）も、長さと重さではっきり分ける。
   ・自分に起きたこと（dmg / dead）は低く濁った音、
     相手に起きたこと（kill / hit / break）は高く澄んだ音、と役割で揃えている。
   ----------------------------------------------------------------------------- */
var NOISEBUF=null;
function noiseBuffer(a){
  if(NOISEBUF) return NOISEBUF;
  var n=Math.floor(a.sampleRate*0.4), b=a.createBuffer(1,n,a.sampleRate), d=b.getChannelData(0), i;
  for(i=0;i<n;i++) d[i]=Math.random()*2-1;
  NOISEBUF=b; return b;
}
function sfx(kind,vol){
  if(muted) return; var a=actx(); if(!a) return;
  var t=a.currentTime, v=(vol===undefined?1:vol);

  /* 単音を一つ鳴らす。f1 を渡すと f0 から f1 へ滑らせる */
  function tone(type,f0,f1,g0,dur,delay){
    var o=a.createOscillator(), g=a.createGain(), st=t+(delay||0);
    o.type=type; o.connect(g); g.connect(a.destination);
    o.frequency.setValueAtTime(f0,st);
    if(f1&&f1!==f0) o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),st+dur);
    g.gain.setValueAtTime(Math.max(0.0001,g0),st);
    g.gain.exponentialRampToValueAtTime(0.0008,st+dur);
    o.start(st); o.stop(st+dur+0.02);
  }
  /* 打撃の質感を足すための短い雑音 */
  function noise(g0,dur,cut,delay){
    var src=a.createBufferSource(), f=a.createBiquadFilter(), g=a.createGain(), st=t+(delay||0);
    src.buffer=noiseBuffer(a); f.type='lowpass'; f.frequency.setValueAtTime(cut,st);
    src.connect(f); f.connect(g); g.connect(a.destination);
    g.gain.setValueAtTime(Math.max(0.0001,g0),st);
    g.gain.exponentialRampToValueAtTime(0.0008,st+dur);
    src.start(st); src.stop(st+dur+0.02);
  }

  if(kind==='shot'){
    tone('square',720,230,0.018*v,0.06);
  }
  else if(kind==='hit'){            /* 弾が弾けた、当たっている手応え */
    tone('triangle',430,170,0.016*v,0.06);
  }
  else if(kind==='kill'){           /* 敵を倒した。上へ抜ける短い音 */
    tone('triangle',680,1240,0.030*v,0.085);
    tone('sine',1420,1880,0.014*v,0.11,0.015);
    noise(0.012*v,0.05,5200);
  }
  else if(kind==='dmg'){            /* 自分が撃たれた。低く濁った打撃 */
    noise(0.11*v,0.16,900);
    tone('square',300,42,0.085*v,0.32,0.005);
    tone('sawtooth',148,30,0.05*v,0.4,0.01);
  }
  else if(kind==='dead'){           /* 力尽きた。長く沈み込む */
    noise(0.13,0.3,700);
    tone('sawtooth',210,24,0.10,0.95,0.02);
    tone('sine',96,20,0.09,1.25,0.06);
  }
  else if(kind==='boom'){
    tone('sawtooth',210,32,0.08*v,0.45);
  }
  else if(kind==='spell'){
    tone('triangle',170,880,0.05*v,0.55);
  }
  else if(kind==='graze'){
    tone('sine',1750,0,0.01*v,0.03);
  }
  else if(kind==='ui'){
    tone('sine',560,1150,0.04*v,0.1);
  }
  else if(kind==='break'){          /* ボスのゲージが割れた */
    tone('sawtooth',880,60,0.07*v,0.75);
  }
}

/* ---------- BGM ----------
   実処理は assets/js/audio.js（スマホでも確実に切り替わる音声エンジン）。
   ここは呼び出し口だけを残す */
function setBGM(k){ if(window.BGM) BGM.set(k); }
function bgmTick(){ if(window.BGM) BGM.tick(); }
function bgmKick(){ if(window.BGM) BGM.unlock(); }
function bgmWarm(k){ if(window.BGM) BGM.warm(k); }
function setMuted(m){
  muted=!!m;
  if(window.BGM) BGM.setMuted(muted);
  var lbl=muted?'音 OFF':'音 ON', i, els=document.querySelectorAll('.mute-btn');
  for(i=0;i<els.length;i++) els[i].textContent=lbl;
}

/* ---------- state ---------- */
var G={
  state:'title', stage:1, phase:'mid', phaseT:0, frame:0, bgT:0,
  score:0, graze:0, continues:0, bestCards:0,
  bullets:[], pb:[], enemies:[], fx:[], boss:null,
  shake:0, dark:0, msg:null, msgT:0, flash:0, waveN:0, alive:true
};
var P={ x:W/2, y:H-90, r:2.6, hp:5, maxhp:5, stat:{hp:1,atk:1,spd:1},
  weapon:'laser', bomb:'grim', inv:0, cd:0, focus:false, t:0, laserOn:false };

function maxHP(){ return 2+P.stat.hp; }
function atkMul(){ return 0.7+0.3*P.stat.atk; }
function moveSpd(){ return 1.7+0.22*P.stat.spd; }

/* ---------- 難易度 ---------- */
var DIFFS=[
  {k:'normal',n:'ノーマル',lat:'NORMAL',bs:0.86,bhp:0.78,ehp:0.78,eden:1.28,ex:0,bomb:3,inv:140,
   d:'弾は遅く、ボスの体力も少なめ。まずは五つの寓話を最後まで読み通すための難易度。'},
  {k:'hard',n:'ハード',lat:'HARD',bs:1.00,bhp:1.00,ehp:1.00,eden:1.00,ex:0,bomb:2,inv:115,
   d:'避ける腕と、振り分けの設計と、ボムを切る度胸が同時に要る。'},
  {k:'extra',n:'エクストラ',lat:'EXTRA',bs:1.13,bhp:1.16,ehp:1.22,eden:0.84,ex:1,bomb:1,inv:96,
   d:'弾速も体力も増し、ボスはどのゲージにも追撃を重ねてくる。ボムは一つきり。'}
];
var DF=DIFFS[1];
function setDiff(k){ for(var i=0;i<DIFFS.length;i++) if(DIFFS[i].k===k) DF=DIFFS[i]; }

/* ---------- ボム ---------- */
var BOMBS=[
  {k:'grim',n:'グリムリープ',lat:'GRIM LEAP',sec:3,dur:180,
   d:'現在地に影武者を残し、三秒のあいだ無敵で疾走する。敵の狙撃は影武者へ逸れ、走り抜けた軌跡が弾を焼き払い続ける。時間切れの瞬間、自分と影武者の両方を中心に大爆発が起こる。'},
  {k:'stop',n:'タイムストップ',lat:'TIME STOP',sec:5,dur:300,
   d:'五秒間、敵と自分の弾幕をまとめて止める。止まった弾には当たらない。自分の弾も止まるが、解除の瞬間に溜まった分が一斉に走り出す。'},
  {k:'excal',n:'エクスカリバー',lat:'EXCALIBUR',sec:1,dur:60,
   d:'一秒だけ真上へ極太の光を放つ。触れた弾幕は残らず消え、貫かれ続けたものは深く抉られる。ボムの中で最も火力が高い。'},
  {k:'hollow',n:'ホロウエクリプス',lat:'HOLLOW ECLIPSE',sec:3,dur:180,
   d:'三秒間、相手の弾幕を湧いた端から消し続ける。攻撃力は無いが、どんな弾幕でも三秒だけは無かったことにできる。'},
  {k:'light',n:'ライトニングリパルサー',lat:'LIGHTNING REPULSOR',sec:3,dur:180,
   d:'三秒間、高速で動けるようになり、掠り範囲に入った弾を相手へ撃ち返す。濃い弾幕に踏み込むほど返る火力が伸びる、上級者向けの一手。'}
];
function bombDef(k){ for(var i=0;i<BOMBS.length;i++) if(BOMBS[i].k===k) return BOMBS[i]; return BOMBS[0]; }
var B={ kind:'grim', stock:2, t:0, dur:0, active:false, decoy:null, trail:null };
function bombSpdMul(){ if(!B.active) return 1; if(B.kind==='grim') return 2.7; if(B.kind==='light') return 1.9; return 1; }
function timeStopped(){ return B.active&&B.kind==='stop'; }

/* ---------- input ---------- */
var K={};
var blocked={ArrowLeft:1,ArrowRight:1,ArrowUp:1,ArrowDown:1,Space:1,KeyZ:1,KeyX:1,KeyC:1,ShiftLeft:1,ShiftRight:1};
window.addEventListener('keydown',function(e){
  if(blocked[e.code]) e.preventDefault();
  if(!K[e.code]) onKeyDown(e.code);
  K[e.code]=true;
});
window.addEventListener('keyup',function(e){ K[e.code]=false; });
window.addEventListener('blur',function(){ K={}; });

var touch={on:false,x:0,y:0,ox:0,oy:0}; var touchUsed=false;
var BOMBBTN={x:W-40,y:H-50,r:38};
function cvPos(ev){
  var r=cv.getBoundingClientRect();
  return { x:(ev.clientX-r.left)/r.width*W, y:(ev.clientY-r.top)/r.height*H };
}
cv.addEventListener('pointerdown',function(e){
  if(e.pointerType==='mouse') return;
  var p=cvPos(e); touchUsed=true;
  if(G.state==='play'&&d2(p.x,p.y,BOMBBTN.x,BOMBBTN.y)<BOMBBTN.r*BOMBBTN.r){ useBomb(); e.preventDefault(); return; }
  touch.on=true; touch.ox=P.x-p.x; touch.oy=P.y-p.y;
  touch.x=p.x; touch.y=p.y; cv.setPointerCapture(e.pointerId); e.preventDefault();
});
cv.addEventListener('pointermove',function(e){
  if(!touch.on||e.pointerType==='mouse') return;
  var p=cvPos(e); touch.x=p.x; touch.y=p.y; e.preventDefault();
});
function endTouch(e){ if(e.pointerType==='mouse') return; touch.on=false; }
cv.addEventListener('pointerup',endTouch);
cv.addEventListener('pointercancel',endTouch);

function onKeyDown(code){
  if(code==='KeyM'){ setMuted(!muted); return; }
  bgmKick();
  if(G.state==='story'){
    if(code==='KeyZ'||code==='Space'||code==='Enter'||code==='KeyX') sceneNext();
    else if(code==='Escape') sceneEnd();
    return;
  }
  if(G.state==='play'&&(code==='KeyX'||code==='KeyC')){ useBomb(); return; }
  if(G.state==='play'&&(code==='Escape'||code==='KeyP')){ G.state='pause'; showScreen('pause'); return; }
  if(G.state==='pause'&&(code==='Escape'||code==='KeyP')){ G.state='play'; showScreen(null); return; }
}

/* ---------- bullets ---------- */
var MAXB=1400;
function bul(x,y,a,sp,r,color,o){
  if(G.bullets.length>=MAXB) return null;
  var m=DF.bs; sp*=m;
  var b={x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,r:r,color:color,t:0,shape:'orb',
         delay:0,grazed:false,hidden:false,flash:0};
  if(o){ for(var k in o) b[k]=o[k]; }
  if(m!==1){
    if(b.maxspd) b.maxspd*=m;
    if(b.minspd) b.minspd*=m;
    if(b.acc) b.acc*=m;
    if(b.ax) b.ax*=m;
    if(b.ay) b.ay*=m;
    if(b.goSpd) b.goSpd*=m;
    if(b.sway) b.sway=[b.sway[0],b.sway[1],b.sway[2]*m];
    if(b.pull) b.pull={x:b.pull.x,y:b.pull.y,f:b.pull.f*m};
  }
  G.bullets.push(b); return b;
}
function ring(x,y,n,sp,off,r,color,o){ for(var i=0;i<n;i++) bul(x,y,off+i*TAU/n,sp,r,color,o); }
function ringGap(x,y,n,sp,off,r,color,gapA,gapW,o){
  for(var i=0;i<n;i++){ var a=off+i*TAU/n; if(Math.abs(norm(a-gapA))<gapW) continue; bul(x,y,a,sp,r,color,o); }
}
function fan(x,y,n,spread,base,sp,r,color,o){
  for(var i=0;i<n;i++) bul(x,y,base+(i-(n-1)/2)*spread,sp,r,color,o);
}
function aimP(x,y){
  if(B.active&&B.kind==='grim'&&B.decoy) return ang(x,y,B.decoy.x,B.decoy.y);
  return ang(x,y,P.x,P.y);
}
function edgePoint(m){
  m=m||25; var s=rnd(0,2*(W+H));
  if(s<W) return {x:s,y:-m};
  if(s<W+H) return {x:W+m,y:s-W};
  if(s<2*W+H) return {x:2*W+H-s,y:H+m};
  return {x:-m,y:2*(W+H)-s};
}
function burst(b){
  if(b.burst){ var q=b.burst; ring(b.x,b.y,q.n,q.spd,rnd(TAU),q.r,q.color,q.o); }
  addFx('boom',b.x,b.y,b.color,b.r*1.6);
  if(b.r>10) sfx('hit',0.6);
}
function clearBullets(toScore){
  if(toScore){ G.score+=G.bullets.length*12; }
  for(var i=0;i<G.bullets.length;i+=3){ var b=G.bullets[i]; addFx('spark',b.x,b.y,b.color,6); }
  G.bullets.length=0;
}
function updateBullets(){
  var arr=G.bullets, i, b;
  for(i=arr.length-1;i>=0;i--){
    b=arr[i]; b.t++;
    if(b.flash>0) b.flash--;
    if(b.delay>0){ b.delay--; continue; }
    if(b.blink){ b.hidden=(b.t>=b.blink[0])&&(((b.t-b.blink[0])%b.blink[2])<b.blink[1]); }
    if(b.av&&(!b.avUntil||b.t<b.avUntil)){
      var c=Math.cos(b.av),s=Math.sin(b.av), nx=b.vx*c-b.vy*s, ny=b.vx*s+b.vy*c; b.vx=nx; b.vy=ny;
    }
    if(b.acc){ var sp=Math.sqrt(b.vx*b.vx+b.vy*b.vy)||0.001, ns=sp+b.acc;
      if(b.maxspd) ns=Math.min(ns,b.maxspd); if(b.minspd) ns=Math.max(ns,b.minspd);
      b.vx=b.vx/sp*ns; b.vy=b.vy/sp*ns; }
    if(b.homing&&b.t<(b.homingT||1e9)){
      var ta=aimP(b.x,b.y), cur=Math.atan2(b.vy,b.vx), df=clamp(norm(ta-cur),-b.homing,b.homing);
      cur+=df; var s2=Math.sqrt(b.vx*b.vx+b.vy*b.vy);
      b.vx=Math.cos(cur)*s2; b.vy=Math.sin(cur)*s2;
    }
    if(b.sway) b.vx=Math.sin(b.t*b.sway[0]+b.sway[1])*b.sway[2];
    if(b.stopAt&&b.t===b.stopAt){ b.vx=0; b.vy=0; }
    if(b.goAt&&b.t===b.goAt){ var ga=aimP(b.x,b.y), gs=b.goSpd||3;
      b.vx=Math.cos(ga)*gs; b.vy=Math.sin(ga)*gs; b.flash=14; }
    if(b.ax) b.vx+=b.ax;
    if(b.ay) b.vy+=b.ay;
    if(b.pull){ var pa=ang(b.x,b.y,b.pull.x,b.pull.y); b.vx+=Math.cos(pa)*b.pull.f; b.vy+=Math.sin(pa)*b.pull.f; }
    b.x+=b.vx; b.y+=b.vy;
    if(b.bounce){
      if(b.x<b.r){ b.x=b.r; b.vx=-b.vx; b.bounce--; }
      else if(b.x>W-b.r){ b.x=W-b.r; b.vx=-b.vx; b.bounce--; }
      if(b.y<b.r){ b.y=b.r; b.vy=-b.vy; b.bounce--; }
    }
    if(b.fuse&&b.t>=b.fuse){ burst(b); arr.splice(i,1); continue; }
    if(b.t>20&&(b.x<-70||b.x>W+70||b.y<-90||b.y>H+90)){ arr.splice(i,1); }
  }
}

/* ---------- effects ---------- */
function addFx(type,x,y,color,size){
  if(G.fx.length>260) return;
  G.fx.push({type:type,x:x,y:y,color:color||'#ffffff',size:size||10,t:0,
    life:type==='boom'?26:(type==='circle'?60:(type==='ripple'?34:18)),
    vx:type==='spark'?rnd(-2,2):0, vy:type==='spark'?rnd(-2,2):0});
}
function updateFx(){
  for(var i=G.fx.length-1;i>=0;i--){ var f=G.fx[i]; f.t++;
    f.x+=f.vx; f.y+=f.vy; f.vx*=0.94; f.vy*=0.94;
    if(f.t>=f.life) G.fx.splice(i,1); }
}

/* ---------- player bullets ---------- */
function pbul(x,y,a,sp,o){
  var b={x:x,y:y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,r:5,dmg:5,t:0,type:'spread'};
  if(o){ for(var k in o) b[k]=o[k]; }
  G.pb.push(b);
}
function updatePlayer(){
  P.t++;
  if(P.inv>0) P.inv--;
  if(P.cd>0) P.cd--;
  P.focus=!!(K.ShiftLeft||K.ShiftRight);
  var sp=moveSpd()*(P.focus?0.44:1)*bombSpdMul();
  var dx=0,dy=0;
  if(K.ArrowLeft||K.KeyA) dx-=1;
  if(K.ArrowRight||K.KeyD) dx+=1;
  if(K.ArrowUp||K.KeyW) dy-=1;
  if(K.ArrowDown||K.KeyS) dy+=1;
  if(dx&&dy){ dx*=0.7071; dy*=0.7071; }
  P.x+=dx*sp; P.y+=dy*sp;
  if(touch.on){
    var tx=touch.x+touch.ox, ty=touch.y+touch.oy;
    var da=ang(P.x,P.y,tx,ty), dd=Math.sqrt(d2(P.x,P.y,tx,ty));
    var mv=Math.min(dd,moveSpd()*1.35*bombSpdMul());
    if(dd>0.5){ P.x+=Math.cos(da)*mv; P.y+=Math.sin(da)*mv; }
  }
  P.x=clamp(P.x,8,W-8); P.y=clamp(P.y,14,H-14);

  var shooting=!!(K.KeyZ||K.Space||touch.on);
  P.laserOn=false;
  if(shooting){
    var M=atkMul();
    if(P.weapon==='laser'){ P.laserOn=true; laserTick(M); }
    else if(P.weapon==='spread'){
      if(P.cd<=0){ P.cd=5; var spr=P.focus?0.07:0.18;
        for(var i=-2;i<=2;i++) pbul(P.x,P.y-12,-Math.PI/2+i*spr,13,{r:5.5,dmg:5.9*M,type:'spread'});
        if((shotSfxCount++)%2===0) sfx('shot'); }
    } else {
      if(P.cd<=0){ P.cd=7;
        for(var j=0;j<3;j++) pbul(P.x+(j-1)*11,P.y-8,-Math.PI/2+(j-1)*0.32,7.5,
          {r:6,dmg:5.5*M,type:'homing',homing:0.17});
        if((shotSfxCount++)%2===0) sfx('shot',0.8); }
    }
  }
}
function laserTick(M){
  var w=P.focus?9:15, dmg=(P.focus?5.5:4.2)*M;
  var b=G.boss;
  if(b&&b.state==='active'){
    var us=bossUnits(b);
    for(var q=0;q<us.length;q++){
      var u=us[q];
      if(u.y<P.y&&Math.abs(u.x-P.x)<w+u.r){
        if(b.shieldOn){ if(P.t%4===0) addFx('spark',u.x+rnd(-20,20),u.y+b.shieldR,'#ffe08a',8); }
        else { hurtBoss(dmg); if(P.t%6===0) addFx('spark',u.x+rnd(-14,14),u.y+14,'#fff2c0',7); }
        break;
      }
    }
  }
  for(var i=0;i<G.enemies.length;i++){ var e=G.enemies[i];
    if(e.y<P.y&&Math.abs(e.x-P.x)<w+e.r){ hurtEnemy(e,dmg); } }
  if(P.t%9===0) sfx('shot',0.4);
}
function updatePBullets(){
  for(var i=G.pb.length-1;i>=0;i--){
    var b=G.pb[i]; b.t++;
    if(b.type==='homing'){
      var tg=null,bd=1e9;
      if(G.boss&&G.boss.state==='active'){ tg=nearestUnit(G.boss,b.x,b.y); }
      else { for(var k=0;k<G.enemies.length;k++){ var e=G.enemies[k];
        var dd=d2(b.x,b.y,e.x,e.y); if(dd<bd){bd=dd;tg=e;} } }
      if(tg&&b.t>4){
        var ta=ang(b.x,b.y,tg.x,tg.y), cur=Math.atan2(b.vy,b.vx);
        cur+=clamp(norm(ta-cur),-b.homing,b.homing);
        var s=Math.sqrt(b.vx*b.vx+b.vy*b.vy);
        b.vx=Math.cos(cur)*s; b.vy=Math.sin(cur)*s;
      }
    }
    b.x+=b.vx; b.y+=b.vy;
    var hitted=false;
    if(G.boss&&G.boss.state==='active'){
      var bo=G.boss, bus=bossUnits(bo), ui, u;
      if(bo.shieldOn){
        for(ui=0;ui<bus.length;ui++){
          u=bus[ui];
          if(d2(b.x,b.y,u.x,u.y)<bo.shieldR*bo.shieldR){
            var ra=ang(u.x,u.y,b.x,b.y);
            bo.refl++;
            if(bo.refl%3===0) bul(u.x+Math.cos(ra)*bo.shieldR,u.y+Math.sin(ra)*bo.shieldR,ra,3.1,5,'#ffe08a');
            addFx('spark',b.x,b.y,'#ffe08a',7);
            hitted=true; break;
          }
        }
      }
      if(!hitted){
        for(ui=0;ui<bus.length;ui++){
          u=bus[ui];
          if(d2(b.x,b.y,u.x,u.y)<Math.pow(u.r+b.r,2)){
            hurtBoss(b.dmg); addFx('spark',b.x,b.y,'#ffe9b0',6); hitted=true; break;
          }
        }
      }
    }
    if(!hitted){
      for(var m=0;m<G.enemies.length;m++){ var en=G.enemies[m];
        if(d2(b.x,b.y,en.x,en.y)<Math.pow(en.r+b.r,2)){ hurtEnemy(en,b.dmg); addFx('spark',b.x,b.y,'#ffe9b0',5); hitted=true; break; } }
    }
    if(hitted||b.x<-30||b.x>W+30||b.y<-40||b.y>H+40) G.pb.splice(i,1);
  }
}
function hitPlayer(){
  if(P.inv>0) return;
  P.hp--; P.inv=DF.inv; G.shake=14; G.flash=8;
  if(P.hp>0) sfx('dmg');   /* 力尽きた時は gameOver 側の dead を鳴らすので重ねない */
  addFx('boom',P.x,P.y,'#ff5c7a',34);
  for(var i=G.bullets.length-1;i>=0;i--){
    if(d2(G.bullets[i].x,G.bullets[i].y,P.x,P.y)<110*110){
      addFx('spark',G.bullets[i].x,G.bullets[i].y,G.bullets[i].color,5); G.bullets.splice(i,1); }
  }
  if(P.hp<=0){ P.hp=0; gameOver(); }
}
function checkCollide(){
  var i,b,rr,dd;
  for(i=0;i<G.bullets.length;i++){
    b=G.bullets[i];
    if(b.delay>0||b.hidden) continue;
    rr=b.r*0.82+P.r; dd=d2(b.x,b.y,P.x,P.y);
    if(dd<rr*rr){ hitPlayer(); }
    else if(!b.grazed&&dd<(rr+17)*(rr+17)){ b.grazed=true; G.graze++; G.score+=15;
      if(G.graze%4===0) sfx('graze'); }
  }
  for(i=0;i<G.enemies.length;i++){
    var e=G.enemies[i];
    if(d2(e.x,e.y,P.x,P.y)<Math.pow(e.r*0.7+P.r,2)) hitPlayer();
  }
  if(G.boss&&G.boss.state==='active'&&G.boss.card&&G.boss.card.body){
    var us=bossUnits(G.boss);
    for(i=0;i<us.length;i++)
      if(d2(us[i].x,us[i].y,P.x,P.y)<Math.pow(us[i].r*0.78+P.r,2)) hitPlayer();
  }
}

/* ==================================================================
   ボム
   ================================================================== */
function bombPow(){ return 0.6+0.4*atkMul(); }
function shieldOnBoss(){ var b=G.boss; return (b&&b.state==='active'&&b.shieldOn)?b:null; }
function insideShield(x,y,pad){
  var b=shieldOnBoss(); if(!b) return false;
  var us=bossUnits(b), R=b.shieldR+(pad||0);
  for(var i=0;i<us.length;i++) if(d2(x,y,us[i].x,us[i].y)<R*R) return true;
  return false;
}
/* アイギス展開中はボムの攻撃も障壁で弾かれ、その勢いが弾幕になって返ってくる */
function shieldRepel(x,y,r,power){
  var b=shieldOnBoss(); if(!b) return false;
  var us=bossUnits(b), R=b.shieldR, i, hit=null;
  for(i=0;i<us.length;i++) if(d2(x,y,us[i].x,us[i].y)<Math.pow(R+(r||0),2)){ hit=us[i]; break; }
  if(!hit) return false;
  if(G.frame-(b.repelAt||-999)>=9){
    b.repelAt=G.frame;
    var a=ang(hit.x,hit.y,x,y), n2=clamp(Math.round(3+(power||0)*0.010),3,15), ex=hit.x+Math.cos(a)*R, ey=hit.y+Math.sin(a)*R;
    for(i=0;i<n2;i++){
      var aa=a+(i-(n2-1)/2)*0.15;
      bul(hit.x+Math.cos(aa)*R,hit.y+Math.sin(aa)*R,aa,3.0,5.5,'#ffe08a',{flash:14});
    }
    addFx('ripple',ex,ey,'#fff3c4',120);
    addFx('boom',ex,ey,'#ffe08a',22);
    sfx('break',0.45); if(G.shake<9) G.shake=9;
  }
  return true;
}
function bombArea(x,y,r,dmg){
  var i;
  if(G.boss&&G.boss.state==='active'&&!shieldRepel(x,y,r,dmg)){
    var us=bossUnits(G.boss);
    for(i=0;i<us.length;i++)
      if(d2(x,y,us[i].x,us[i].y)<Math.pow(r+us[i].r,2)){ hurtBoss(dmg); break; }
  }
  for(i=G.enemies.length-1;i>=0;i--){ var e=G.enemies[i];
    if(d2(x,y,e.x,e.y)<Math.pow(r+e.r,2)) hurtEnemy(e,dmg); }
}
function eraseAround(x,y,r,score){
  var rr=r*r, n=0;
  for(var i=G.bullets.length-1;i>=0;i--){ var b=G.bullets[i];
    if(d2(b.x,b.y,x,y)<rr){
      if(insideShield(b.x,b.y,4)) continue;          /* 障壁の内側の弾は消せない */
      if(n%3===0) addFx('spark',b.x,b.y,b.color,6); G.bullets.splice(i,1); n++; } }
  if(score) G.score+=n*14;
  return n;
}
function reflectBullet(b){
  var tx=W/2, ty=-40, i;
  if(G.boss&&G.boss.state==='active'){ tx=G.boss.x; ty=G.boss.y; }
  else if(G.enemies.length){ var bd=1e9;
    for(i=0;i<G.enemies.length;i++){ var dd=d2(b.x,b.y,G.enemies[i].x,G.enemies[i].y);
      if(dd<bd){ bd=dd; tx=G.enemies[i].x; ty=G.enemies[i].y; } } }
  pbul(b.x,b.y,ang(b.x,b.y,tx,ty),9.5,{r:6,dmg:18*bombPow(),type:'homing',homing:0.2,ref:1});
  addFx('spark',b.x,b.y,'#ffe98a',7);
}
function useBomb(){
  if(G.state!=='play'||B.active||B.stock<=0||P.hp<=0) return;
  B.stock--; B.kind=P.bomb; B.active=true; B.t=0;
  B.dur=bombDef(B.kind).dur;
  G.flash=18; G.shake=12; sfx('spell');
  if(B.kind==='grim'){ B.decoy={x:P.x,y:P.y}; B.trail=[]; P.inv=Math.max(P.inv,B.dur+60); }
  else if(B.kind==='stop'){ P.inv=Math.max(P.inv,30); }
  else if(B.kind==='excal'){ P.inv=Math.max(P.inv,B.dur+60); }
  else if(B.kind==='hollow'){ P.inv=Math.max(P.inv,B.dur+60); }
  else { P.inv=Math.max(P.inv,50); }
  updatePanel();
}
function updateBomb(){
  if(!B.active) return;
  B.t++;
  var i,b,e;
  if(B.kind==='grim'){
    if(!B.trail) B.trail=[];
    if(B.t%2===0){ B.trail.push({x:P.x,y:P.y,t:0,hit:false}); if(B.trail.length>70) B.trail.shift(); }
    /* 走り抜けた軌跡が弾を焼き払い続け、通り道がそのまま安全地帯になる */
    for(i=0;i<B.trail.length;i++){
      var tr=B.trail[i]; tr.t++;
      if(tr.t<70&&((B.t+i)%5===0)) eraseAround(tr.x,tr.y,38,false);
      if(!tr.hit&&tr.t===16){ tr.hit=true; bombArea(tr.x,tr.y,50,12*bombPow()); }
    }
    if(B.t%3===0) addFx('spark',P.x+rnd(-26,26),P.y+rnd(-26,26),'#c9a6ff',8);
    if(B.decoy&&B.t%9===0) addFx('spark',B.decoy.x+rnd(-18,18),B.decoy.y+rnd(-18,18),'#a07adf',6);
    eraseAround(P.x,P.y,74,false);
    bombArea(P.x,P.y,88,4.0*bombPow());
    if(B.t>=B.dur){
      addFx('ripple',P.x,P.y,'#d8b0ff',260); G.shake=30; G.flash=24; sfx('boom');
      for(i=0;i<14;i++) addFx('boom',P.x+rnd(-92,92),P.y+rnd(-92,92),'#c060ff',rnd(20,48));
      bombArea(P.x,P.y,210,1300*bombPow());
      eraseAround(P.x,P.y,300,true);
      if(B.decoy){                       /* 影武者も同時に爆ぜる */
        addFx('ripple',B.decoy.x,B.decoy.y,'#a07adf',210);
        for(i=0;i<8;i++) addFx('boom',B.decoy.x+rnd(-62,62),B.decoy.y+rnd(-62,62),'#9060ff',rnd(16,38));
        bombArea(B.decoy.x,B.decoy.y,150,500*bombPow());
        eraseAround(B.decoy.x,B.decoy.y,195,true);
      }
      P.inv=Math.max(P.inv,95);
    }
  } else if(B.kind==='stop'){
    if(B.t>=B.dur){ G.flash=14; sfx('break'); P.inv=Math.max(P.inv,70);
      for(i=0;i<G.bullets.length;i+=6) addFx('spark',G.bullets[i].x,G.bullets[i].y,'#9fd8e6',5); }
  } else if(B.kind==='excal'){
    var hw=40, dmg=42*bombPow();
    for(i=G.bullets.length-1;i>=0;i--){ b=G.bullets[i];
      if(b.y<P.y+12&&Math.abs(b.x-P.x)<hw+b.r){
        if(insideShield(b.x,b.y,4)) continue;
        if(i%3===0) addFx('spark',b.x,b.y,'#fff6c8',6); G.bullets.splice(i,1); G.score+=14; } }
    if(G.boss&&G.boss.state==='active'){
      var eus=bossUnits(G.boss), sb=shieldOnBoss(), blk=false;
      if(sb){                                        /* 光は障壁で受け止められ、斜めに散る */
        for(i=0;i<eus.length;i++){
          if(eus[i].y<P.y+sb.shieldR&&Math.abs(eus[i].x-P.x)<hw+sb.shieldR){
            shieldRepel(P.x,Math.min(P.y,eus[i].y+sb.shieldR),hw,dmg*14); blk=true; break;
          }
        }
      }
      if(!blk) for(i=0;i<eus.length;i++)
        if(eus[i].y<P.y&&Math.abs(eus[i].x-P.x)<hw+eus[i].r){ hurtBoss(dmg); break; }
    }
    for(i=G.enemies.length-1;i>=0;i--){ e=G.enemies[i];
      if(e.y<P.y&&Math.abs(e.x-P.x)<hw+e.r) hurtEnemy(e,dmg); }
    if(B.t%4===0) addFx('spark',P.x+rnd(-hw,hw),rnd(0,P.y),'#fffbe0',9);
    if(G.shake<5) G.shake=5;
  } else if(B.kind==='hollow'){
    if(G.bullets.length){
      var kept=[], nk=0;
      for(i=0;i<G.bullets.length;i++){
        var hb=G.bullets[i];
        if(insideShield(hb.x,hb.y,4)){ kept.push(hb); continue; }   /* 障壁の内側は消えない */
        if(nk%4===0) addFx('spark',hb.x,hb.y,hb.color,5); nk++;
      }
      G.score+=nk*10;
      G.bullets=kept;
      if(shieldOnBoss()) shieldRepel(P.x,P.y,1000,120);
    }
    if(B.t%26===0) addFx('ripple',W/2,H*0.36,'#8a6ad8',300);
  } else if(B.kind==='light'){
    var rr=44*44, cnt=0;
    for(i=G.bullets.length-1;i>=0;i--){
      if(cnt>=4) break;
      b=G.bullets[i]; if(b.delay>0) continue;
      if(d2(b.x,b.y,P.x,P.y)<rr){ reflectBullet(b); G.bullets.splice(i,1); cnt++; G.score+=30; }
    }
    if(cnt&&B.t%3===0) sfx('graze');
  }
  if(B.t>=B.dur){ B.active=false; B.t=0; B.decoy=null; B.trail=null; updatePanel(); }
}

/* ==================================================================
   道中 : 雑魚敵
   ================================================================== */
var STAGE_CONF=[
  null,
  {midLen:2500, gap:190, ebs:2.5, ehp:1.00, tint:'#1a2a1e', name:'黒い森'},
  {midLen:2600, gap:180, ebs:2.75, ehp:1.55, tint:'#2a2213', name:'お菓子の家'},
  {midLen:2700, gap:170, ebs:3.00, ehp:2.20, tint:'#1c2230', name:'鏡の城'},
  {midLen:2800, gap:160, ebs:3.20, ehp:2.95, tint:'#26202c', name:'灰かぶりの城'},
  {midLen:2900, gap:150, ebs:3.45, ehp:3.80, tint:'#2a0f1a', name:'奈落の館'}
];
var ECOLOR=[null,'#ff6b8a','#ffb35c','#9fd8e6','#c9a6e0','#ff5c5c'];

function addEnemy(o){
  var conf=STAGE_CONF[G.stage];
  var e={x:0,y:-30,vx:0,vy:1.6,r:13,hp:30,maxhp:30,t:0,type:'diver',rate:60,
         rot:0,sway:0,stopT:70,hold:150,n:8,col:ECOLOR[G.stage],sp:1.6,score:120};
  for(var k in o) e[k]=o[k];
  e.hp*=conf.ehp*DF.ehp; e.maxhp=e.hp;
  G.enemies.push(e); return e;
}
function hurtEnemy(e,d){
  e.hp-=d; e.hitT=6; G.score+=Math.round(d*0.6);
  if(e.hp<=0){ killEnemy(e); }
}
function killEnemy(e){
  var i=G.enemies.indexOf(e); if(i<0) return;
  G.enemies.splice(i,1);
  G.score+=e.score; addFx('boom',e.x,e.y,e.col,e.r*2.2); sfx('kill',0.85);
  if(e.death) e.death(e);
}
function eshoot(e,a,sp,r,o){ return bul(e.x,e.y,a,sp,r||4.5,e.col,o); }

function updateEnemies(){
  var conf=STAGE_CONF[G.stage], ebs=conf.ebs;
  for(var i=G.enemies.length-1;i>=0;i--){
    var e=G.enemies[i]; e.t++;
    if(e.hitT>0) e.hitT--;
    switch(e.type){
      case 'diver':
        e.y+=e.sp; e.x+=Math.sin(e.t*0.035)*e.sway;
        if(e.t%e.rate===0&&e.y>10&&e.y<H-120) eshoot(e,aimP(e.x,e.y),ebs,4.5);
        break;
      case 'stopper':
        if(e.t<e.stopT){ e.y+=e.sp; }
        else if(e.t<e.stopT+e.hold){ if((e.t-e.stopT)%e.rate===0) ring(e.x,e.y,e.n,ebs*0.82,rnd(TAU),4.5,e.col); }
        else { e.y-=e.sp*0.9; }
        break;
      case 'sweeper':
        e.x+=e.vx; e.y+=Math.sin(e.t*0.045)*0.8;
        if(e.t%e.rate===0&&e.x>-10&&e.x<W+10) fan(e.x,e.y,3,0.2,aimP(e.x,e.y),ebs,4.5,e.col);
        break;
      case 'spinner':
        e.y+=e.sp*0.55; e.x+=Math.sin(e.t*0.02)*1.1;
        if(e.t%5===0&&e.y>0&&e.y<H-140){ ring(e.x,e.y,3,ebs*0.8,e.rot,4,e.col); e.rot+=0.42; }
        break;
      case 'tank':
        if(e.y<e.ty) e.y+=e.sp*0.7; else e.x+=Math.sin(e.t*0.014)*1.2;
        if(e.t%e.rate===0&&e.y>0) fan(e.x,e.y,7,0.155,aimP(e.x,e.y),ebs*0.95,5,e.col);
        if(e.t%e.rate===40) ringGap(e.x,e.y,16,ebs*0.6,rnd(TAU),4.5,e.col,aimP(e.x,e.y)+Math.PI,0.4);
        break;
    }
    if(e.y>H+50||e.x<-60||e.x>W+60||(e.type==='stopper'&&e.y<-50)) G.enemies.splice(i,1);
  }
}

/* ---------- ウェーブ ---------- */
function spawnWave(){
  var s=G.stage, n=G.waveN++, kind=n%6;
  var col=ECOLOR[s];
  if(kind===0){                                    // 横一列の降下
    for(var i=0;i<7;i++) addEnemy({type:'diver',x:50+i*63,y:-30-i*16,sp:1.8,rate:62-s*3,sway:0.7,hp:26,r:12});
  } else if(kind===1){                             // 左右から掃射
    var dir=(n%2)?1:-1;
    for(var j=0;j<5;j++) addEnemy({type:'sweeper',x:dir>0?-30-j*54:W+30+j*54,y:70+j*26,
      vx:dir*2.6,rate:44-s*2,hp:42,r:13});
  } else if(kind===2){                             // 停止して全方位
    for(var k=0;k<4;k++) addEnemy({type:'stopper',x:70+k*115,y:-30-k*18,sp:2.0,
      stopT:60+k*10,hold:150,rate:44,n:8+s*2,hp:70,r:15});
  } else if(kind===3){                             // 回転砲台
    for(var m=0;m<3;m++) addEnemy({type:'spinner',x:90+m*150,y:-30-m*40,sp:1.5,hp:80,r:14});
    for(var m2=0;m2<4;m2++) addEnemy({type:'diver',x:40+m2*120,y:-140-m2*20,sp:2.2,rate:70,hp:26,r:12});
  } else if(kind===4){                             // V字編隊
    for(var v=0;v<9;v++){ var off=Math.abs(v-4);
      addEnemy({type:'diver',x:40+v*50,y:-30-off*26,sp:2.1,rate:58,sway:1.2,hp:30,r:12}); }
  } else {                                          // 大型
    addEnemy({type:'tank',x:W/2,y:-40,ty:130,sp:1.4,rate:100-s*5,hp:300,r:22,score:900});
    for(var w=0;w<4;w++) addEnemy({type:'diver',x:60+w*120,y:-90-w*20,sp:2.0,rate:64,hp:26,r:12});
  }
}
function updateMid(){
  var conf=STAGE_CONF[G.stage];
  G.phaseT++;
  var gp=Math.max(80,Math.round(conf.gap*DF.eden));
  if(G.phaseT<conf.midLen&&G.phaseT%gp===41) spawnWave();
  if(G.phaseT===conf.midLen){ G.phase='warn'; G.phaseT=0; sfx('spell'); }
}
function updateWarn(){
  G.phaseT++;
  if(G.phaseT>130){
    G.phase='boss'; G.phaseT=0;
    clearBullets(false);
    setBGM('vs'+G.stage);
    bgmWarm(G.stage>=5?'after':'prologue');
    var st=STORY[G.stage];
    if(st&&st.intro&&st.intro.length) playScene(st.intro,function(){ G.state='play'; startBoss(); },'S'+G.stage);
    else startBoss();
  }
}

/* ==================================================================
   ボス基盤
   ================================================================== */
function bmove(b,x,y,sp){
  var d=Math.sqrt(d2(b.x,b.y,x,y)); if(d<1) return;
  var a=ang(b.x,b.y,x,y), m=Math.min(d,sp);
  b.x+=Math.cos(a)*m; b.y+=Math.sin(a)*m;
}
function wander(b,t,y0,amp,speed){
  b.x=W/2+Math.sin(t*(speed||0.011))*(amp||120);
  b.y=(y0||130)+Math.sin(t*(speed||0.011)*1.7)*22;
}
function bossUnits(b){ return (b&&b.mates)?b.mates:(b?[b]:[]); }
function nearestUnit(b,x,y){
  var us=bossUnits(b), best=us[0], bd=1e9;
  for(var i=0;i<us.length;i++){ var d=d2(x,y,us[i].x,us[i].y); if(d<bd){ bd=d; best=us[i]; } }
  return best;
}
function startBoss(){
  var def=BOSSES[G.stage-1];
  G.boss={ def:def, x:W/2, y:-60, r:24, ci:-1, card:null, hp:1, maxhp:1, timer:0,
    t:0, state:'intro', stateT:0, rot:0, rot2:0, dir:1, mode:0, orbs:[], hitT:0, sub:0,
    shieldOn:false, shieldT:0, shieldR:88, refl:0 };
  if(def.twin){
    G.boss.r=20;
    G.boss.mates=[{x:W/2-72,y:-60,r:20},{x:W/2+72,y:-60,r:20}];
  }
  clearBullets(false);
}
/* 技が終わるたびに、次の技の言葉を会話パートとして挟む */
function nextCard(){
  var b=G.boss; b.ci++;
  if(b.ci>=b.def.cards.length){ bossDefeated(); return; }
  clearBullets(false);
  var st=STORY[G.stage], lines=(st&&st.cards)?st.cards[b.ci]:null;
  playScene(lines,beginCard,'S'+G.stage);
}
function beginCard(){
  var b=G.boss; if(!b) return;
  G.state='play';
  b.card=b.def.cards[b.ci];
  b.hp=b.maxhp=Math.round(b.card.hp*DF.bhp);
  b.timer=b.card.time*60;
  b.t=0; b.rot=0; b.rot2=0; b.dir=1; b.mode=0; b.sub=0; b.orbs=[]; b.ghosts=null; b.gmap=null;
  b.shieldOn=false; b.shieldT=0; b.refl=0;
  b.state='active'; b.stateT=0;
  G.dark=0;
  clearBullets(false);
  showMsg(b.def.name,'①②③④⑤⑥'.charAt(b.ci)+' '+b.card.name,150);
  sfx('spell');
}
function hurtBoss(d){
  var b=G.boss; if(!b||b.state!=='active') return;
  if(b.shieldOn) return;
  b.hp-=d; b.hitT=5; G.score+=Math.round(d*0.8);
  if(b.hp<=0){ b.hp=0; breakCard(true); }
}
function breakCard(killed){
  var b=G.boss;
  b.state='break'; b.stateT=0;
  clearBullets(true);
  G.shake=16; G.flash=14;
  sfx('break');
  for(var i=0;i<16;i++) addFx('boom',b.x+rnd(-40,40),b.y+rnd(-30,30),b.def.color,rnd(14,34));
  if(killed){ G.score+=60000; G.bestCards++; }
}
function bossDefeated(){
  var b=G.boss; b.state='dead'; b.stateT=0;
  clearBullets(true); G.shake=24; sfx('boom');
  G.score+=200000;
}
function updateBoss(){
  var b=G.boss; if(!b) return;
  if(b.hitT>0) b.hitT--;
  b.stateT++;
  if(b.state==='intro'){
    bmove(b,W/2,130,3.2);
    if(b.mates){ bmove(b.mates[0],W/2-72,130,3.2); bmove(b.mates[1],W/2+72,130,3.2); }
    if(b.stateT>60) nextCard();
    return;
  }
  if(b.state==='break'){
    bmove(b,W/2,120,2.2);
    if(b.mates){ bmove(b.mates[0],W/2-72,120,2.2); bmove(b.mates[1],W/2+72,120,2.2); }
    if(b.stateT%6===0) addFx('spark',b.x+rnd(-30,30),b.y+rnd(-24,24),b.def.color,8);
    if(b.stateT>80) nextCard();
    return;
  }
  if(b.state==='dead'){
    if(b.stateT%5===0) addFx('boom',b.x+rnd(-46,46),b.y+rnd(-36,36),b.def.color,rnd(16,40));
    if(b.stateT===1) showMsg(b.def.name,'撃破',150);
    if(b.stateT>130){ stageCleared(); }
    return;
  }
  /* active */
  b.t++;
  b.timer--;
  if(b.card.mv) b.card.mv(b,b.t); else wander(b,b.t,130,120,0.011);
  if(b.card.nolimit){ b.x=clamp(b.x,24,W-24); b.y=clamp(b.y,24,H-26); }
  else { b.x=clamp(b.x,40,W-40); b.y=clamp(b.y,60,H*0.5); }
  if(b.mates){
    for(var mi=0;mi<b.mates.length;mi++){
      b.mates[mi].x=clamp(b.mates[mi].x,32,W-32);
      b.mates[mi].y=clamp(b.mates[mi].y,58,H*0.5);
    }
    b.x=(b.mates[0].x+b.mates[1].x)/2; b.y=(b.mates[0].y+b.mates[1].y)/2;
  }
  b.card.fire(b,b.t);
  if(DF.ex){
    if(b.t%156===78) ringGap(b.x,b.y,22,2.75,rnd(TAU),4.5,'#ffffff',aimP(b.x,b.y),0.26);
    if(b.t%19===0){ var ep=edgePoint(22); bul(ep.x,ep.y,aimP(ep.x,ep.y),3.1,4,b.def.color); }
  }
  if(b.timer<=0) breakCard(false);
}

/* ==================================================================
   物語 / 台詞
   ================================================================== */
var CAST={
  claire:{n:"赤ずきん",art:"A1"},
  lust:{n:"ルスト",art:"A2a"},
  radina:{n:"ラディナ",art:"A2b"},
  duo:{n:"二人",art:"A2b"},
  sofia:{n:"白雪姫",art:"A3"},
  cinde:{n:"シンデレラ",art:"A4"},
  alicia:{n:"アリシア",art:"A4"},
  vamp:{n:"吸血鬼",art:"A5"},
  leia:{n:"レイア",art:"A5"},
  hero:{n:"挑戦者",art:null},
  narr:{n:"",art:null},
  title:{n:"",art:null},
  sub:{n:"",art:null},
  book:{n:"",art:null},
  cast:{n:"",art:null}
};
var STORY={
 prologue:[
  ["narr","世界各地に、突如として漆黒の裂け目が現れた。"],
  ["narr","人々はそれを――『奈落』と呼んだ。"],
  ["narr","奈落は大地を侵食し、街を飲み込み、ゆっくりと世界を蝕んでいく。"],
  ["narr","原因は不明。目的も不明。"],
  ["narr","ただ一つ分かっていることは、奈落へ足を踏み入れた者は、誰一人として戻ってこない。"],
  ["narr","そして、いつしか一つの噂が囁かれるようになる。"],
  ["narr","「奈落では、童話の少女たちが現れる。」"],
  ["narr","その真偽を知る者はいない。"],
  ["narr","しかし今日もまた、一人の挑戦者が奈落へと足を踏み入れる。"]
 ],
 1:{
  cards:[
   [
    ["claire","……また一人、来たんだ。"],
    ["claire","あなたも、この先へ進むの？"],
    ["claire","だったら。"],
    ["claire","私は、この物語を最後まで演じる。"],
    ["claire","この頭巾。"],
    ["claire","最初から赤かったわけじゃない。"],
    ["claire","誰かが私を『赤ずきん』という物語にするために、被せたもの。"],
    ["claire","だから。"],
    ["claire","最後まで、『赤ずきん』でいるよ。"]
   ],
   [
    ["claire","お腹が空いていたの。"],
    ["claire","だから信じた。"],
    ["claire","これはワイン。"],
    ["claire","これは干し肉。"],
    ["claire","……全部食べ終わってから教えられた。"]
   ],
   [
    ["claire","童話では、猟師が助けに来る。"],
    ["claire","でも。"],
    ["claire","そんな人、どこにもいなかった。"],
    ["claire","狼は誰にも倒されない。"],
    ["claire","私も、誰にも助けてもらえなかった。"]
   ],
   [
    ["claire","私の名前は、クレア・クリムゾン。"],
    ["claire","『赤ずきん』なんて名前じゃない。"],
    ["claire","ただ。"],
    ["claire","森で生きて、森で死んだ少女。"],
    ["claire","それでも。"],
    ["claire","ここは、通さない。"]
   ]
  ],
  win:[
   ["claire","……負けちゃった。"],
   ["claire","やっぱり、あなたは強いね。"],
   ["claire","でも。"],
   ["claire","この先には、私なんかより、ずっと悲しい物語が待ってる。"],
   ["claire","私たちは。"],
   ["claire","誰にも救われなかった少女たち。"],
   ["claire","だけど。"],
   ["claire","最後まで、私たちを忘れなかった人がいる。"],
   ["claire","お願い。"],
   ["claire","その人を……憎まないで。"],
   ["claire","もし会えたら。"],
   ["claire","ありがとうって伝えて。"],
   ["claire","ずっと。"],
   ["claire","私のことを忘れないでいてくれて。"],
   ["claire","……ありがとう。"],
   ["narr","クレアは静かに微笑み、光となって消えていく。"]
  ]
 },
 2:{
  cards:[
   [
    ["lust","お腹、空いてる？"],
    ["radina","私たちは、ずっと空いてた。"],
    ["lust","雨が降り続いた。"],
    ["lust","畑は枯れて。"],
    ["radina","食べるものが、何もなくなった。"],
    ["lust","だから。"],
    ["lust","私たちは捨てられた。"]
   ],
   [
    ["radina","本当はね。"],
    ["radina","継母なんて、いなかった。"],
    ["lust","元々は本当のお母さんがいたんだよ。"],
    ["radina","でも。"],
    ["radina","ある日、いなくなった。"],
    ["lust","病気だったのか。"],
    ["lust","飢えだったのか。"],
    ["lust","もう思い出せない。"],
    ["radina","残ったのは、お父さんだけ。"]
   ],
   [
    ["lust","甘い匂いがした。"],
    ["radina","屋根はケーキ。"],
    ["radina","壁はパン。"],
    ["radina","窓は砂糖。"],
    ["radina","夢みたいなお家だった。"],
    ["lust","でも、あのおばあさんも。"],
    ["lust","生きるために私たちを食べようとした。"],
    ["radina","悪い人だったのかな。"],
    ["radina","それとも。"],
    ["radina","優しかった人が、壊れちゃっただけなのかな。"]
   ],
   [
    ["lust","私たちは、生きるために。"],
    ["radina","魔女を焼いた。"],
    ["lust","でも、家へ帰っても。"],
    ["radina","幸せには、なれなかった。"],
    ["duo","だから。"],
    ["duo","ここで終わらせる。"]
   ]
  ],
  win:[
   ["radina","負けちゃったね。"],
   ["lust","うん。"],
   ["radina","ねえ。"],
   ["radina","お腹いっぱい食べられる世界って。"],
   ["radina","本当にあるのかな。"],
   ["lust","あるって。"],
   ["lust","あの人は言ってた。"],
   ["radina","だから、信じたかった。"],
   ["radina","あの人だけは、私たちを見捨てなかったから。"],
   ["lust","お願い。"],
   ["lust","あの人を責めないで。"],
   ["lust","私たちは幸せだったから。"],
   ["narr","二人は手を繋いだまま、静かに光へと還っていく。"]
  ]
 },
 3:{
  cards:[
   [
    ["sofia","世界で一番美しい。"],
    ["sofia","そんなこと一度も思ったことはない。"],
    ["sofia","ただ、生きていたかった。"],
    ["sofia","それだけだった。"]
   ],
   [
    ["sofia","狩人は私を殺せなかった。"],
    ["sofia","だから代わりに別の誰かの肺と肝臓を持ち帰った。"],
    ["sofia","王妃はそれを私だと信じて食べた。"],
    ["sofia","……ねぇ。"],
    ["sofia","本当に食べたかったのは私だったのかな。"]
   ],
   [
    ["sofia","王子様は私を愛してくれた。"],
    ["sofia","死んでからやっと私は選ばれた。"],
    ["sofia","……そんな結末、本当に幸せなの？"]
   ],
   [
    ["sofia","最後に王妃は真っ赤に焼けた鉄の靴を履いて死ぬまで踊らされた。"],
    ["sofia","みんな、それで幸せになったって言う。"],
    ["sofia","でも、そんな終わり方、誰も幸せじゃない。"]
   ]
  ],
  win:[
   ["sofia","あなたは優しい人なのね。"],
   ["sofia","あの人と少し似てるかも。"],
   ["sofia","あの人は私が死んだことをずっと悔やんでいた。"],
   ["sofia","私はもう十分なのに。"],
   ["sofia","でも、あの人は忘れることができなかった。"],
   ["sofia","それだけで十分だった。"],
   ["sofia","だからお願い。"],
   ["sofia","あの人を嫌いにならないで。"],
   ["narr","その身体は白い花びらのように崩れ、静かに消えていく。"]
  ]
 },
 4:{
  cards:[
   [
    ["cinde","ここまで来たのね。"],
    ["cinde","あなたが倒してきた子たち。"],
    ["cinde","きっと、あなたに伝えたいことがあったのでしょうね。"],
    ["cinde","……でも。"],
    ["cinde","この先へ進ませるわけにはいかない。"],
    ["cinde","シンデレラ。"],
    ["cinde","灰を被った少女。"],
    ["cinde","虐げられながらも、最後には幸せを掴む物語。"],
    ["cinde","人々はそう語る。"],
    ["cinde","でも、物語になる前の私はただの一人の少女だった。"]
   ],
   [
    ["cinde","シンデレラの物語にはいくつもの始まりがある。"],
    ["cinde","古代のロドピス。"],
    ["cinde","異なる国。"],
    ["cinde","異なる時代。"],
    ["cinde","それでも人は。"],
    ["cinde","幸せを願う物語を残してきた。"],
    ["cinde","誰かが自分を見つけてくれるように。"]
   ],
   [
    ["cinde","魔法はね。とても素敵なものなの。"],
    ["cinde","初めて魔法を見た時、私は夢中になった。"],
    ["cinde","炎が灯る瞬間。"],
    ["cinde","水が踊る瞬間。"],
    ["cinde","風が流れる瞬間。"],
    ["cinde","あの人は。"],
    ["cinde","一つ一つ、丁寧に教えてくれた。"],
    ["cinde","魔法は。"],
    ["cinde","誰かを傷つけるためではなく。"],
    ["cinde","誰かを幸せにするためにあるって。"]
   ],
   [
    ["cinde","どれだけ強い力を持っていても。"],
    ["cinde","守れないものはある。"],
    ["cinde","それを知っているからこそ。"],
    ["cinde","私は、この盾を作った。"],
    ["narr","巨大な魔法障壁が展開される。"],
    ["cinde","もう二度と。"],
    ["cinde","大切なものを失わないために。"]
   ]
  ],
  win:[
   ["cinde","……負けちゃったわね。"],
   ["hero","お前は何者だ。"],
   ["alicia","私は。"],
   ["alicia","アリシア・バース・フォン・グレイス。"],
   ["alicia","かつて、グレイス王国を治めていた女王よ。"],
   ["hero","お前も過去の人物のはずなのに、なぜここにいる？"],
   ["alicia","私がここにいる理由を話すには、あの人のことを話さなければならない。"],
   ["alicia","昔、私は森に捨てられた赤ん坊だった。"],
   ["alicia","誰にも見つけてもらえず。"],
   ["alicia","誰にも必要とされないと思っていた。"],
   ["alicia","そんな私を拾ってくれた人がいる。"],
   ["alicia","森で暮らしていた。"],
   ["alicia","一人の吸血鬼。"],
   ["alicia","その人は。"],
   ["alicia","魔法を教えてくれた。"],
   ["alicia","世界の美しさを教えてくれた。"],
   ["alicia","私にとって。"],
   ["alicia","あの人は……。"],
   ["alicia","母であり。"],
   ["alicia","師であり。"],
   ["alicia","かけがえのない家族だった。"],
   ["hero","そんな人がなぜ、今は世界を脅かしている。"],
   ["alicia","……そうね。"],
   ["alicia","きっと、あなたには理解できないと思う。"],
   ["alicia","彼女の名前は――"],
   ["alicia","レイア・フォン・ウラノス。"],
   ["hero","レイアは何をしようとしている。"],
   ["alicia","分からない。"],
   ["alicia","でも、一つだけ確かなことがある。"],
   ["alicia","あの人は、世界を壊したいわけじゃない。"],
   ["alicia","失ったものを、もう一度取り戻したいだけ。"],
   ["alicia","お願い。"],
   ["alicia","もし、あの人に会ったら。"],
   ["alicia","戦う前に話を聞いてあげて。"],
   ["hero","お前はレイアを止めたいのか。"],
   ["alicia","止めたい。"],
   ["alicia","でも……。"],
   ["alicia","同じくらい。"],
   ["alicia","救いたい。"],
   ["alicia","あの人は。"],
   ["alicia","ずっと一人だったから。"],
   ["narr","アリシアの身体が光へ変わっていく。"]
  ]
 },
 5:{
  cards:[
   [
    ["vamp","……来たのね。"],
    ["vamp","クレアも。"],
    ["vamp","ルストとラディナも。"],
    ["vamp","ソフィアも。"],
    ["vamp","そして……アリシアも。"],
    ["vamp","みんな、あなたに会ったのね。"],
    ["vamp","あの子たちは、最後まで優しい子たちだった。"],
    ["vamp","だからこそ。"],
    ["vamp","私はもう一度、あの子たちに笑ってほしかった。"],
    ["hero","お前が奈落を作ったのか。"],
    ["vamp","そうよ。"],
    ["vamp","私が作った。"],
    ["vamp","この世界には救われなかった物語が多すぎる。"],
    ["vamp","誰にも知られず。"],
    ["vamp","誰にも覚えられず。"],
    ["vamp","消えていった命がある。"],
    ["vamp","私はそれを今ここで終わらせる。"],
    ["vamp","ある日、小さな赤ん坊を拾った。"],
    ["vamp","森に捨てられた、小さな命。"],
    ["vamp","その子は、魔法が大好きだった。"],
    ["vamp","目を輝かせながら。"],
    ["vamp","何度も私に魔法を教えてと言った。"],
    ["vamp","……幸せだった。"]
   ],
   [
    ["vamp","幸せは、いつまでも続かない。"],
    ["vamp","大切なものほど、失った時の痛みは大きい。"],
    ["vamp","私は何百年も生きてきた。"],
    ["vamp","多くの別れを経験した。"]
   ],
   [
    ["vamp","必死に考えたの、どうすればもう一度会えるのか。"],
    ["vamp","魂とは何か。"],
    ["vamp","世界とは何か。"],
    ["vamp","命とは何か。"],
    ["vamp","私は探し続けた。"],
    ["vamp","そして、一つの答えへ辿り着いた。"]
   ],
   [
    ["vamp","世界の境界を越える方法。"],
    ["vamp","失われた魂を呼び戻す方法。"],
    ["vamp","多くのものを犠牲にする。"],
    ["vamp","それでも、私は諦められなかった。"]
   ],
   [
    ["vamp","私は忘れない、あの子たちのことを。"],
    ["vamp","どんなに時間が過ぎても。"],
    ["vamp","どんなに世界が変わっても。"],
    ["vamp","私の中であの子たちは、ずっと生きている。"],
    ["vamp","だから、もう一度だけ。"],
    ["vamp","一緒にいて。"],
    ["narr","レイアの魔力によって、これまで戦った少女たちの姿が現れる。"],
    ["narr","赤い頭巾の少女。飢えに苦しんだ兄妹。白い肌の少女。灰を被った少女。"],
    ["vamp","ありがとう。"],
    ["vamp","もう一度、会えてよかった。"],
    ["vamp","さあ、これが最後の物語よ。"]
   ],
   [
    ["vamp","私はもう失いたくない。"],
    ["vamp","誰にも奪わせない。"],
    ["vamp","誰にも忘れさせない。"],
    ["vamp","ここなら。"],
    ["vamp","誰も傷つかない。"],
    ["vamp","誰も消えない。"],
    ["vamp","ここが。"],
    ["vamp","私たちの理想郷よ！"]
   ]
  ],
  win:[
   ["narr","奈落が崩れていく。"],
   ["narr","館も、少女たちの姿も、少しずつ消えていく。"],
   ["leia","……そう。"],
   ["leia","やっぱり。"],
   ["leia","この世界では永遠にはできないのね。"],
   ["hero","お前は間違ってる。"],
   ["hero","でも…"],
   ["hero","全部、嘘だったわけじゃない。"],
   ["leia","……優しいのね。"],
   ["leia","アリシアも。"],
   ["leia","きっと、あなただから通したのね。"],
   ["alicia","レイア。"],
   ["leia","……アリシア。"],
   ["leia","また会えた。"],
   ["alicia","うん。"],
   ["alicia","でも。"],
   ["alicia","もう、ここまでにしましょう。"],
   ["leia","……分かっている。"],
   ["leia","分かっていたはずなのに。"],
   ["leia","もう一度だけ、あなたたちと過ごしたかった。"],
   ["alicia","私も。"],
   ["alicia","あなたと過ごした時間を忘れない。"],
   ["alicia","魔法を教えてくれたこと。"],
   ["alicia","森で一緒に暮らしたこと。"],
   ["alicia","何度も会いに行ったこと。"],
   ["alicia","全部、私の大切な思い出よ。"],
   ["leia","……ありがとう。"],
   ["leia","私もあなたと過ごせて幸せだった。"],
   ["alicia","だから、もう大丈夫。"],
   ["alicia","あの子たちも。"],
   ["alicia","私も。"],
   ["alicia","誰もあなたを恨んでなんかいない。"],
   ["leia","……そっか。"],
   ["leia","やっと、前に進める気がする。"],
   ["alicia","うん。"],
   ["alicia","今度はあなたが幸せになって。"],
   ["leia","ありがとう、アリシア。"],
   ["alicia","さようなら。"],
   ["narr","二人は微笑む。"],
   ["narr","そして、光となって消えていく。"]
  ]
 },
 epilogue:[
  ["narr","世界は元に戻った。"],
  ["narr","森には再び鳥の声が戻り。街には人々の声が戻る。"],
  ["narr","誰も奈落のことを覚えていない。"],
  ["narr","あなただけが、あの事件を覚えている。"],
  ["narr","どこからか少女達の笑い声が聞こえる。"],
  ["narr","振り返ると一冊の古い本だけが落ちている。"],
  ["book","Fable of Abyss"],
  ["narr","本を開くとそこには、あなたが奈落で出会った少女たちの物語が書かれていた。"],
  ["cast","赤ずきん","クレア・クリムゾン","A1"],
  ["cast","ヘンゼルとグレーテル","ルスト / ラディナ","A2a,A2b"],
  ["cast","白雪姫","ソフィア・マーガレット","A3"],
  ["cast","シンデレラ","アリシア・バース・フォン・グレイス","A4"],
  ["cast","吸血鬼","レイア・フォン・ウラノス","A5"],
  ["narr","最後のページには短い一文だけが書かれていた。"],
  ["narr","「めでたし、めでたし」"],
  ["title","フェイブル・オブ・アビス"],
  ["sub","FABLE OF THE ABYSS"],
  ["title","E N D"]
 ]
};
/* ==================================================================
   スペルカード定義
   ================================================================== */
var BOSSES=[
/* ---------------- 1面 : 赤ずきん ---------------- */
{
 name:'赤ずきん', sub:'黒い森の少女', color:'#ff3b5c',
 cards:[
  { name:'始めはなかった赤い頭巾', hp:4800, time:48,
    fire:function(b,t){
      if(t%52===0){
        var cx=rnd(60,W-60), cy=rnd(70,300), a0=rnd(TAU);
        addFx('circle',cx,cy,'#ff5570',54);
        for(var i=0;i<20;i++) bul(cx,cy,a0+i*TAU/20,1.95,6,'#ff5570',{delay:66});
      }
      if(t%34===0) fan(b.x,b.y,3,0.17,aimP(b.x,b.y),3.5,5,'#ffd0d8');
      if(t%150===0) ring(b.x,b.y,14,2.4,rnd(TAU),5,'#ff8fa3');
    }},
  { name:'ほんとうにワインと干し肉？', hp:5200, time:50,
    fire:function(b,t){
      if(t%7===0) bul(rnd(0,W),-10,Math.PI/2,0.9,5,'#a01a3a',{ay:0.032,maxspd:5.4});
      if(t%95===0){
        for(var i=-1;i<=1;i++) bul(b.x,b.y,aimP(b.x,b.y)+i*0.36,2.3,12,'#8a5230',
          {shape:'big',fuse:72,burst:{n:11,spd:2.7,r:5,color:'#c88a5a'}});
      }
      if(t%22===0) ring(b.x,b.y,9,2.05,t*0.14,4.5,'#ff6688');
    }},
  { name:'猟師なんていない！', hp:5400, time:50,
    fire:function(b,t){
      if(t%7===0){ var p=edgePoint(20); bul(p.x,p.y,aimP(p.x,p.y),3.7,5,'#ffb0b0'); }
      if(t%5===0){ for(var k=0;k<2;k++) bul(b.x,b.y,b.rot+k*Math.PI,2.5,5,'#c8404f'); b.rot+=0.37; }
      if(t%46===0) fan(b.x,b.y,5,0.105,aimP(b.x,b.y),4.4,5,'#ff3b5c');
      if(t%120===0) ringGap(b.x,b.y,26,2.6,rnd(TAU),5,'#ffd0d8',aimP(b.x,b.y),0.32);
    }},
  { name:'黒い森の乙女', hp:6400, time:58,
    mv:function(b,t){ wander(b,t,120,140,0.016); },
    fire:function(b,t){
      if(t%34===0){
        var gap=ri(0,10);
        for(var i=0;i<12;i++){ if(i===gap||i===gap+1) continue;
          bul(20+i*40,-12,Math.PI/2,2.65,6,'#2f6b46'); }
      }
      if(t%4===0){ for(var j=0;j<3;j++) bul(b.x,b.y,b.rot+j*TAU/3,2.4,5,'#ff5570'); b.rot+=0.29; }
      if(t%130===0) ring(b.x,b.y,22,3.3,rnd(TAU),5,'#ffd0d8');
      if(t%64===0) fan(b.x,b.y,4,0.13,aimP(b.x,b.y),4.6,5,'#fff0f0');
    }}
 ]},
/* ---------------- 2面 : ヘンゼルとグレーテル（兄ルスト／妹ラディナ・二体別判定） ---------------- */
{
 name:'ヘンゼルとグレーテル', sub:'飢えた兄妹', color:'#ffb35c', twin:true,
 cards:[
  /* 兄は端から迫る飢えの弾、妹は狙い撃ち。二人の間を抜けるしかない */
  { name:'大飢饉', hp:6000, time:50,
    mv:function(b,t){
      var A=b.mates[0], C=b.mates[1];
      A.x=W/2-96+Math.sin(t*0.014)*72;    A.y=124+Math.sin(t*0.021)*20;
      C.x=W/2+96+Math.sin(t*0.014+2.4)*72; C.y=124+Math.cos(t*0.019)*20;
    },
    fire:function(b,t){
      var A=b.mates[0], C=b.mates[1];
      if(t%7===0){ var p=edgePoint(22); bul(p.x,p.y,aimP(p.x,p.y),0.55,5,'#c8b070',{acc:0.052,maxspd:6.2}); }
      if(t%84===0) ring(A.x,A.y,18,1.1,rnd(TAU),5,'#8a7a50',{acc:0.028,maxspd:4.2});
      if(t%84===42) ring(C.x,C.y,18,1.1,rnd(TAU),5,'#8a7a50',{acc:0.028,maxspd:4.2});
      if(t%46===0) fan(A.x,A.y,3,0.24,aimP(A.x,A.y),3.6,5,'#e8d8a0');
      if(t%46===23) fan(C.x,C.y,3,0.24,aimP(C.x,C.y),3.6,5,'#e8d8a0');
    }},
  /* 兄妹が入れ替わりながら明滅弾を巻く。消えている間だけ通れる */
  { name:'消えた実母', hp:6600, time:52,
    mv:function(b,t){
      var A=b.mates[0], C=b.mates[1], a=t*0.0125;
      A.x=W/2+Math.cos(a)*118;  A.y=130+Math.sin(a*1.6)*30;
      C.x=W/2-Math.cos(a)*118;  C.y=130-Math.sin(a*1.6)*30;
    },
    fire:function(b,t){
      var A=b.mates[0], C=b.mates[1], i;
      if(t%6===0){
        for(i=0;i<3;i++) bul(A.x,A.y,b.rot+i*TAU/3,2.45,6,'#7fd0c0',{blink:[38,20,110]});
        for(i=0;i<3;i++) bul(C.x,C.y,-b.rot+i*TAU/3,2.45,6,'#9fe8dd',{blink:[70,20,110]});
        b.rot+=0.205;
      }
      if(t%88===0) fan(A.x,A.y,6,0.125,aimP(A.x,A.y),3.3,5,'#dff5f0',{blink:[26,22,80]});
      if(t%88===44) fan(C.x,C.y,6,0.125,aimP(C.x,C.y),3.3,5,'#dff5f0',{blink:[26,22,80]});
    }},
  /* 妹が魔女の追尾弾、兄が二重の回転リング */
  { name:'魔女になったおばあさん', hp:7000, time:54,
    mv:function(b,t){
      var A=b.mates[0], C=b.mates[1];
      A.x=W/2-70+Math.sin(t*0.017)*104; A.y=112+Math.sin(t*0.011)*26;
      C.x=W/2+70+Math.sin(t*0.023)*104; C.y=150+Math.cos(t*0.015)*26;
    },
    fire:function(b,t){
      var A=b.mates[0], C=b.mates[1], i;
      if(t%36===0){ for(i=0;i<3;i++) bul(C.x,C.y,rnd(TAU),2.0,6,'#ff9ad5',
        {homing:0.033,homingT:170,maxspd:3.5,acc:0.012}); }
      if(t%58===0) ring(A.x,A.y,22,2.65,t*0.006,5,'#b06adf');
      if(t%58===29) ring(A.x,A.y,22,2.1,-t*0.006,5,'#6ad0df');
      if(t%116===0) fan(C.x,C.y,5,0.11,aimP(C.x,C.y),4.5,5,'#ffe0f5');
      if(t%116===58) fan(A.x,A.y,5,0.11,aimP(A.x,A.y),4.5,5,'#ffe0f5');
    }},
  /* 兄がパンスコップで横薙ぎ、妹が下から炎を焚く */
  { name:'魔女をのせたパンスコップ', hp:8200, time:60,
    mv:function(b,t){
      var A=b.mates[0], C=b.mates[1];
      A.x=W/2+Math.sin(t*0.016)*128;      A.y=104+Math.sin(t*0.027)*16;
      C.x=W/2+Math.sin(t*0.016+Math.PI)*128; C.y=168+Math.cos(t*0.021)*16;
    },
    fire:function(b,t){
      var A=b.mates[0], C=b.mates[1];
      if(t%96===0){
        var dir=((t/96)|0)%2?1:-1, gy=rnd(140,470);
        for(var i=0;i<14;i++){ var y=40+i*44; if(Math.abs(y-gy)<72) continue;
          bul(dir>0?-20:W+20,y,dir>0?0:Math.PI,2.45,9,'#ff7a2a',{shape:'big'}); }
      }
      if(t%5===0) bul(rnd(0,W),H+10,-Math.PI/2+rnd(-0.32,0.32),2.1,4.5,'#ffcc55',{ay:-0.012});
      if(t%68===0) fan(C.x,C.y,5,0.14,aimP(C.x,C.y),3.6,5,'#ffdd88');
      if(t%18===0){ for(var k=0;k<2;k++) bul(A.x,A.y,b.rot+k*Math.PI,2.9,5,'#ffa040'); b.rot+=0.55; }
    }}
 ]},
/* ---------------- 3面 : 白雪姫 ---------------- */
{
 name:'白雪姫', sub:'硝子の棺の中', color:'#9fd8e6',
 cards:[
  { name:'捨てられた少女', hp:7000, time:52,
    fire:function(b,t){
      if(t%4===0) bul(b.x,b.y,rnd(TAU),rnd(3.0,4.6),5,'#cfe6ff',
        {stopAt:24+ri(0,22),goAt:150,goSpd:3.5});
      if(t%90===0) fan(b.x,b.y,5,0.12,aimP(b.x,b.y),4.2,5,'#ffffff');
    }},
  { name:'肺と肝臓', hp:7400, time:54,
    mv:function(b,t){ wander(b,t,150,90,0.009); },
    fire:function(b,t){
      var a=t*0.021;
      var s1x=b.x+Math.cos(a)*96, s1y=b.y+Math.sin(a)*46;
      var s2x=b.x-Math.cos(a)*96, s2y=b.y-Math.sin(a)*46;
      b.orbs=[{x:s1x,y:s1y,r:13,c:'#ff6f6f'},{x:s2x,y:s2y,r:13,c:'#8b2b3a'}];
      if(t%86===0){ ring(s1x,s1y,18,2.5,rnd(TAU),5,'#ff6f6f'); ring(s2x,s2y,18,2.5,rnd(TAU),5,'#b2404f'); }
      if(t%86===43){ ring(s1x,s1y,13,1.6,rnd(TAU),5,'#ffb3b3',{acc:0.03,maxspd:4.4});
                     ring(s2x,s2y,13,1.6,rnd(TAU),5,'#ffb3b3',{acc:0.03,maxspd:4.4}); }
      if(t%9===0){ var p=edgePoint(20); bul(p.x,p.y,ang(p.x,p.y,b.x,b.y),3.1,4.5,'#ffd6d6'); }
      if(t%120===0) fan(b.x,b.y,3,0.2,aimP(b.x,b.y),4.6,6,'#ff3b5c');
    }},
  { name:'ネクロフィリアプリンス', hp:7800, time:56,
    mv:function(b,t){ wander(b,t,110,60,0.008); },
    fire:function(b,t){
      if(t%140===0){
        var cx=clamp(P.x,110,W-110), cy=clamp(P.y,140,H-90), ww=170, hh=185, sp=0.62;
        for(var i=0;i<12;i++){ var fx=cx-ww+i*(2*ww/11);
          bul(fx,cy-hh,Math.PI/2,sp,6,'#9fb8d8'); bul(fx,cy+hh,-Math.PI/2,sp,6,'#9fb8d8'); }
        for(var j=0;j<10;j++){ var fy=cy-hh+j*(2*hh/9);
          bul(cx-ww,fy,0,sp,6,'#9fb8d8'); bul(cx+ww,fy,Math.PI,sp,6,'#9fb8d8'); }
        addFx('ripple',cx,cy,'#9fb8d8',200);
      }
      if(t%5===0) bul(rnd(0,W),-10,Math.PI/2+rnd(-0.22,0.22),4.6,4,'#dff0ff',{shape:'rice'});
      if(t%72===0) fan(b.x,b.y,3,0.22,aimP(b.x,b.y),3.1,7,'#c05a7a');
      if(t%18===0){ for(var k=0;k<2;k++) bul(b.x,b.y,b.rot+k*Math.PI,2.3,5,'#aac8ea'); b.rot+=0.63; }
    }},
  { name:'焼けた鉄の靴', hp:9000, time:60,
    mv:function(b,t){ wander(b,t,125,130,0.02); },
    fire:function(b,t){
      if(t%2===0){
        for(var i=0;i<5;i++) bul(b.x,b.y,b.rot+i*TAU/5,3.05,5,'#ff8a3d');
        b.rot+=b.dir*0.163;
        if(t%200===0) b.dir*=-1;
      }
      if(t%104===0) ring(b.x,b.y,28,1.35,rnd(TAU),6,'#ffd24a',{acc:0.043,maxspd:5.2});
      if(t%42===0) bul(b.x,b.y,aimP(b.x,b.y),5.2,7,'#fff1c0');
      if(t%9===0) bul(rnd(0,W),H+10,-Math.PI/2,2.6,4,'#ff5c2a');
    }}
 ]},
/* ---------------- 4面 : シンデレラ ---------------- */
{
 name:'シンデレラ', sub:'亡国の女王', color:'#c9a6e0',
 cards:[
  { name:'灰かぶり姫', hp:8600, time:54,
    fire:function(b,t){
      if(t%2===0) bul(rnd(0,W),-10,Math.PI/2,rnd(1.1,1.8),5,'#9a94a6',
        {sway:[rnd(0.02,0.045),rnd(TAU),0.72]});
      if(t%56===0) fan(b.x,b.y,5,0.09,aimP(b.x,b.y),5.3,5,'#ffe9a8');
      if(t%150===0) ring(b.x,b.y,30,2.3,rnd(TAU),5,'#cfc6b4');
    }},
  { name:'ロドピス', hp:9000, time:56,
    mv:function(b,t){ wander(b,t,120,145,0.024); },
    fire:function(b,t){
      if(t%3===0){
        var side=((t/3)|0)%2, x=side?-12:W+12, a=side?0.92:Math.PI-0.92;
        bul(x,-12,a+rnd(-0.04,0.04),5.1,4,'#7fc8ff',{shape:'rice'});
      }
      if(t%126===0){
        for(var i=0;i<4;i++) bul(rnd(30,W-30),-24,Math.PI/2,1.35,14,'#ffd97a',
          {shape:'big',goAt:96,goSpd:3.7,fuse:210,burst:{n:15,spd:2.9,r:5,color:'#ffd97a'}});
      }
      if(t%54===0) ring(b.x,b.y,16,3.05,rnd(TAU),5,'#a0e0ff');
    }},
  { name:'カオスミソロジー', hp:9600, time:58,
    fire:function(b,t){
      if(t%118===0){ b.mode=ri(0,5); b.rot=rnd(TAU); addFx('ripple',b.x,b.y,'#c9a6e0',120); }
      var m=b.mode;
      if(m===0){ if(t%3===0){ for(var i=0;i<4;i++) bul(b.x,b.y,b.rot+i*TAU/4,3.2,5,'#e0a0ff'); b.rot+=0.24; } }
      else if(m===1){ if(t%40===0) ringGap(b.x,b.y,30,2.7,rnd(TAU),5,'#ffa0d0',aimP(b.x,b.y),0.3); }
      else if(m===2){ if(t%5===0){ var p=edgePoint(20); bul(p.x,p.y,aimP(p.x,p.y),4.0,4.5,'#a0ffd0'); } }
      else if(m===3){ if(t%26===0) fan(b.x,b.y,7,0.1,aimP(b.x,b.y),4.4,5,'#ffd0a0'); }
      else { if(t%22===0){ for(var k=0;k<4;k++) bul(b.x,b.y,rnd(TAU),2.2,6,'#d0d0ff',
        {homing:0.028,homingT:150,maxspd:3.6}); } }
      if(t%64===0) fan(b.x,b.y,3,0.3,aimP(b.x,b.y),3.4,6,'#ffffff');
    }},
  /* 一定時間ごとに障壁を展開。展開中は攻撃が通らず、撃ち込んだ弾は跳ね返ってくる */
  { name:'アイギス', hp:11000, time:70,
    mv:function(b,t){ wander(b,t,120,80,0.01); },
    fire:function(b,t){
      var c=t%340, i, j;
      b.shieldOn=(c>=44&&c<116);
      b.shieldT=c;
      if(c===24){ addFx('ripple',b.x,b.y,'#ffe08a',150); sfx('spell'); }
      if(c===44){
        for(i=0;i<22;i++){ var a=i*TAU/22;
          bul(b.x+Math.cos(a)*b.shieldR,b.y+Math.sin(a)*b.shieldR,a+Math.PI/2,2.25,6,'#ffe08a',
            {av:0.0274,avUntil:240}); }
        addFx('ripple',b.x,b.y,'#ffe08a',190);
      }
      if(c===116){                                   /* 解除の反動 */
        ringGap(b.x,b.y,30,3.0,rnd(TAU),6,'#fff3c4',aimP(b.x,b.y),0.3);
        addFx('ripple',b.x,b.y,'#fff3c4',210); G.shake=10;
      }
      if(b.shieldOn){                                /* 障壁の縁から弾がこぼれる */
        if(t%9===0){ var ea=rnd(TAU);
          bul(b.x+Math.cos(ea)*b.shieldR,b.y+Math.sin(ea)*b.shieldR,ea,2.6,5,'#ffe08a'); }
        if(t%54===0) fan(b.x,b.y,5,0.5,aimP(b.x,b.y),3.1,5,'#fff3c4',{bounce:2});
      } else {                                       /* 無防備な間は撃ち返しが激しい */
        if(t%6===0){ for(j=0;j<4;j++) bul(b.x,b.y,b.rot+j*TAU/4,3.3,5,'#c9a24a'); b.rot+=0.052; }
        if(t%44===0) fan(b.x,b.y,5,0.5,aimP(b.x,b.y),3.1,5,'#fff3c4',{bounce:2});
        if(t%96===0) ring(b.x,b.y,18,4.2,rnd(TAU),5,'#ffffff');
      }
    },
    draw:function(b){
      var c=b.shieldT;
      if(c>=24&&c<44){                               /* 展開の予兆 */
        var p=(c-24)/20;
        ctx.save(); ctx.globalAlpha=p*0.7;
        ctx.strokeStyle='#ffe08a'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(b.x,b.y,b.shieldR*(1.9-0.9*p),0,TAU); ctx.stroke();
        ctx.restore();
      }
      if(b.shieldOn) drawShield(b);
    }}
 ]},
/* ---------------- 5面 : 吸血鬼 ---------------- */
{
 name:'吸血鬼', sub:'夜を統べる者', color:'#e0407a',
 cards:[
  { name:'森の魔法使い', hp:9500, time:56,
    fire:function(b,t){
      if(t%74===0){
        var cx=rnd(60,W-60), cy=rnd(70,320);
        addFx('circle',cx,cy,'#6ee6a0',66);
        for(var i=0;i<24;i++) bul(cx,cy,i*TAU/24,2.65,5,'#6ee6a0',{delay:52});
      }
      if(t%5===0){ for(var j=0;j<2;j++) bul(b.x,b.y,b.rot+j*Math.PI,2.85,5,'#bff5d0',
        {av:(j?1:-1)*0.0125,avUntil:210}); b.rot+=0.195; }
      if(t%62===0) fan(b.x,b.y,5,0.12,aimP(b.x,b.y),4.1,5,'#eaffea');
    }},
  { name:'メテオレイン', hp:9800, time:56,
    mv:function(b,t){ wander(b,t,110,140,0.017); },
    fire:function(b,t){
      if(t%24===0){
        for(var i=0;i<2;i++) bul(rnd(-40,W+40),-30,Math.PI/2+rnd(-0.26,0.26),3.5,13,'#ff8a4a',
          {shape:'big',fuse:62+ri(0,50),burst:{n:12,spd:2.9,r:5,color:'#ffcf8a'}});
      }
      if(t%4===0) bul(rnd(0,W),-10,Math.PI/2+rnd(-0.16,0.16),4.7,4,'#ffb877',{shape:'rice'});
      if(t%78===0) ring(b.x,b.y,20,2.7,rnd(TAU),5,'#ff6a3a');
      if(t%52===0) fan(b.x,b.y,3,0.16,aimP(b.x,b.y),4.6,5,'#ffe0b0');
    }},
  { name:'ナイトクイーン', hp:10200, time:58,
    fire:function(b,t){
      G.dark=Math.min(1,G.dark+0.03);
      if(t%3===0){ for(var i=0;i<2;i++) bul(b.x,b.y,b.rot+i*Math.PI,2.05,6,'#8a6ad8'); b.rot+=0.142; }
      if(t%92===0) ring(b.x,b.y,32,1.55,aimP(b.x,b.y)+Math.PI/32,5,'#5a3a9a',{acc:0.019,maxspd:3.6});
      if(t%46===0) fan(b.x,b.y,3,0.26,aimP(b.x,b.y),4.5,5,'#d0b8ff');
      if(t%11===0){ var p=edgePoint(20); bul(p.x,p.y,aimP(p.x,p.y),3.05,4.5,'#a88ae8'); }
    }},
  /* 弾幕を纏ったまま自機へ一直線に突っ込む。壁で跳ね返り、体当たりにも判定がある */
  { name:'ムーンフィスト', hp:10600, time:60, nolimit:true, body:true,
    mv:function(b,t){
      var c=t%182;
      if(c<74){                                       /* 構え : 上段へ戻りつつ狙いを定める */
        bmove(b,W/2+Math.sin(t*0.021)*126,108,3.0);
      } else if(c===74){                              /* 照準を固定して撃ち出す */
        b.rot2=aimP(b.x,b.y); b.mode=1; b.dir=1; sfx('boom',0.7); G.shake=12;
      } else if(c<148){                               /* 突進 */
        var sp=(c<84)?(c-74)*1.05:10.0;
        b.x+=Math.cos(b.rot2)*sp; b.y+=Math.sin(b.rot2)*sp;
        if(b.x<28){ b.x=28; b.rot2=Math.PI-b.rot2; G.shake=9; }
        else if(b.x>W-28){ b.x=W-28; b.rot2=Math.PI-b.rot2; G.shake=9; }
        if(b.y<28){ b.y=28; b.rot2=-b.rot2; G.shake=9; }
        else if(b.y>H-34){ b.y=H-34; b.rot2=-b.rot2; G.shake=9; }
      } else { b.mode=0; bmove(b,W/2,108,4.2); }
    },
    fire:function(b,t){
      var c=t%182, i;
      if(c<74){
        /* 纏う弾 : 拳の周りを回る月光が一周ごとに濃くなる */
        if(c%7===0){
          var a0=b.rot;
          for(i=0;i<3;i++) bul(b.x+Math.cos(a0+i*TAU/3)*54,b.y+Math.sin(a0+i*TAU/3)*54,
            a0+i*TAU/3+Math.PI/2,1.15,5,'#cfcfff',{av:0.03,avUntil:150});
          b.rot+=0.36;
        }
        if(c%26===0) fan(b.x,b.y,3,0.2,aimP(b.x,b.y),3.6,5,'#e0e0ff');
        if(c===0) ringGap(b.x,b.y,34,2.6,rnd(TAU),6,'#9090e0',aimP(b.x,b.y),0.34);
      } else if(c<148){
        /* 突進中 : 進路の左右へ弾を撒き散らし、通った跡が壁になる */
        var pa=b.rot2;
        if(t%2===0){
          bul(b.x,b.y,pa+Math.PI/2,2.15,5.5,'#cfcfff');
          bul(b.x,b.y,pa-Math.PI/2,2.15,5.5,'#cfcfff');
        }
        if(c%12===0) ring(b.x,b.y,10,1.5,rnd(TAU),5,'#b8b8ff',{acc:0.018,maxspd:3.1});
        if(c===147){                                  /* 着地の衝撃 */
          ringGap(b.x,b.y,32,3.1,rnd(TAU),6,'#f0f0ff',aimP(b.x,b.y),0.3);
          addFx('ripple',b.x,b.y,'#f0f0ff',200); G.shake=18;
        }
      } else {
        if(c%9===0) bul(b.x,b.y,aimP(b.x,b.y)+rnd(-0.26,0.26),5.0,5,'#cfcfff');
      }
    },
    draw:function(b){
      var c=b.t%182;
      if(c>=56&&c<74){                                /* 突進の予告線 */
        var a=aimP(b.x,b.y), p=(c-56)/18;
        ctx.save(); ctx.globalAlpha=0.22+p*0.45;
        ctx.strokeStyle='#e8e8ff'; ctx.lineWidth=1+p*2.5;
        ctx.beginPath(); ctx.moveTo(b.x,b.y);
        ctx.lineTo(b.x+Math.cos(a)*760,b.y+Math.sin(a)*760); ctx.stroke();
        ctx.restore();
      }
      if(c>=74&&c<148){                               /* 纏った月光 */
        ctx.save();
        var g=ctx.createRadialGradient(b.x,b.y,8,b.x,b.y,54);
        g.addColorStop(0,'rgba(240,240,255,0.5)'); g.addColorStop(0.6,'rgba(180,180,255,0.22)');
        g.addColorStop(1,'rgba(180,180,255,0)');
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(b.x,b.y,54,0,TAU); ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(b.x,b.y,30+Math.sin(G.frame*0.3)*3,0,TAU); ctx.stroke();
        ctx.restore();
      }
    }},
  { name:'忘れられない少女たちとの物語', hp:12500, time:70,
    mv:function(b,t){
      wander(b,t,126,116,0.015);
      if(!b.ghosts){
        /* 幻影。あたり判定は持たず（mates に入れない）、弾の発生源にだけなる */
        b.ghosts=[
          {k:'A1', ph:0, bx: 66, by:268, s:1.00},
          {k:'A2a',ph:1, bx:168, by:248, s:0.84},
          {k:'A2b',ph:1, bx:226, by:248, s:0.84},
          {k:'A3', ph:2, bx:330, by:268, s:1.00},
          {k:'A4', ph:3, bx:422, by:248, s:0.98}
        ];
        b.gmap=[[],[],[],[]];
        for(var q=0;q<b.ghosts.length;q++) b.gmap[b.ghosts[q].ph].push(b.ghosts[q]);
      }
      for(var i=0;i<b.ghosts.length;i++){
        var g=b.ghosts[i];
        g.x=g.bx+Math.sin(t*0.011+i*1.7)*13;
        g.y=g.by+Math.sin(t*0.017+i*0.9)*8;
      }
    },
    fire:function(b,t){
      var ph=((t/400)|0)%4, i, j;
      var gs=b.gmap?b.gmap[ph]:null, g0=(gs&&gs[0])||b, g1=(gs&&gs[1])||g0;
      if(t%400===0){
        b.sub=ph;
        var cl=['#ff3b5c','#ffb35c','#9fd8e6','#c9a6e0'][ph];
        if(gs) for(i=0;i<gs.length;i++) addFx('ripple',gs[i].x,gs[i].y,cl,170);
      }
      if(ph===0){
        if(t%40===0){ var cx=rnd(60,W-60), cy=rnd(70,300); addFx('circle',cx,cy,'#ff5570',48);
          for(i=0;i<16;i++) bul(cx,cy,rnd(TAU)+i*TAU/16,2.1,6,'#ff5570',{delay:60}); }
        if(t%30===0) fan(g0.x,g0.y,3,0.16,aimP(g0.x,g0.y),3.9,5,'#ffd0d8');
      } else if(ph===1){
        if(t%5===0){ for(j=0;j<4;j++) bul(b.x,b.y,b.rot+j*TAU/4,2.6,6,'#ffb35c',{blink:[36,20,104]}); b.rot+=0.23; }
        if(t%9===0) bul(rnd(0,W),H+10,-Math.PI/2,2.5,4.5,'#ffcc55',{ay:-0.012});
        if(t%76===0) fan(g0.x,g0.y,3,0.2,aimP(g0.x,g0.y),3.6,5,'#ffe0a0');
        if(t%76===38) fan(g1.x,g1.y,3,0.2,aimP(g1.x,g1.y),3.6,5,'#ffe0a0');
      } else if(ph===2){
        if(t%4===0) bul(g0.x,g0.y,rnd(TAU),rnd(3.0,4.4),5,'#cfe6ff',{stopAt:26,goAt:140,goSpd:3.6});
        if(t%6===0) bul(rnd(0,W),-10,Math.PI/2,4.7,4,'#dff0ff',{shape:'rice'});
      } else {
        if(t%2===0) bul(rnd(0,W),-10,Math.PI/2,rnd(1.2,1.9),5,'#9a94a6',{sway:[rnd(0.02,0.045),rnd(TAU),0.75]});
        if(t%54===0) fan(g0.x,g0.y,5,0.1,aimP(g0.x,g0.y),5.2,5,'#ffe9a8');
      }
      if(t%120===0) ringGap(b.x,b.y,26,3.1,rnd(TAU),5,'#ffffff',aimP(b.x,b.y),0.3);
    },
    draw:function(b){
      var gs=b.ghosts; if(!gs) return;
      var cl=['#ff3b5c','#ffb35c','#9fd8e6','#c9a6e0'];
      for(var i=0;i<gs.length;i++){
        var g=gs[i], on=(g.ph===b.sub), h=116*g.s;
        var al=(on?0.60:0.22)+Math.sin(G.frame*0.05+i)*0.05;
        ctx.save();
        var rg=ctx.createRadialGradient(g.x,g.y,4,g.x,g.y,62);
        rg.addColorStop(0,'rgba(255,255,255,'+(on?0.18:0.07)+')');
        rg.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(g.x,g.y,62,0,TAU); ctx.fill();
        if(!drawPortrait(g.k,g.x,g.y-h*0.60,h,al)){
          ctx.globalAlpha=al; ctx.fillStyle=cl[g.ph];
          ctx.beginPath(); ctx.arc(g.x,g.y,15,0,TAU); ctx.fill();
        }
        if(on){
          ctx.globalAlpha=0.32+Math.sin(G.frame*0.08)*0.12;
          ctx.strokeStyle=cl[g.ph]; ctx.lineWidth=1.2;
          ctx.beginPath(); ctx.arc(g.x,g.y,40,G.frame*0.02,G.frame*0.02+2.2); ctx.stroke();
          ctx.beginPath(); ctx.arc(g.x,g.y,40,G.frame*0.02+Math.PI,G.frame*0.02+Math.PI+2.2); ctx.stroke();
        }
        ctx.restore();
      }
    }},
  { name:'奈落の寓話', hp:15500, time:90,
    mv:function(b,t){ wander(b,t,120,110,0.012); },
    fire:function(b,t){
      if(t%3===0){ for(var i=0;i<3;i++) bul(b.x,b.y,b.rot+i*TAU/3,3.25,5,'#c060ff'); b.rot+=0.132; }
      if(t%3===1){ for(var j=0;j<3;j++) bul(b.x,b.y,-b.rot2+j*TAU/3,2.62,5,'#ffcf50'); b.rot2+=0.114; }
      if(t%136===0) ringGap(b.x,b.y,44,2.45,rnd(TAU),6,'#e0407a',aimP(b.x,b.y),0.3);
      if(t%11===0){ var p=edgePoint(22); bul(p.x,p.y,aimP(p.x,p.y),3.5,4.5,'#ff90c0'); }
      if(t%210===0){
        for(var k=0;k<4;k++) bul(b.x,b.y,rnd(TAU),2.1,13,'#ffffff',
          {shape:'big',fuse:110,burst:{n:16,spd:2.7,r:5,color:'#d0a0ff'}});
      }
      if(t%68===0) fan(b.x,b.y,7,0.1,aimP(b.x,b.y),4.9,5,'#ffffff');
      if(t>2400&&t%150===0) ring(b.x,b.y,20,1.4,rnd(TAU),6,'#7a30c0',{acc:0.03,maxspd:4.6});
    }}
 ]}
];

/* ==================================================================
   描画
   ================================================================== */
/* ---------- 立ち絵 ---------- */
var IMG={};
var BOSSART=[null,
  [{k:'A1',s:1.00,dx:0}],
  [{k:'A2a',s:0.88,dx:-30},{k:'A2b',s:0.88,dx:30}],
  [{k:'A3',s:1.00,dx:0}],
  [{k:'A4',s:1.02,dx:0}],
  [{k:'A5',s:1.06,dx:0}]
];
function loadArt(){
  if(typeof Image==='undefined'||typeof ART==='undefined') return;
  for(var k in ART){
    (function(key){
      var im=new Image();
      im.onload=function(){ im._ok=true; };
      im.src=ART[key]; IMG[key]=im;
    })(k);
  }
}
function artReady(k){ var im=IMG[k]; return !!(im&&im._ok&&im.naturalHeight); }
function drawPortrait(k,cx,top,h,alpha){
  if(!artReady(k)) return false;
  var im=IMG[k], w=im.naturalWidth/im.naturalHeight*h;
  ctx.save();
  if(alpha!==undefined) ctx.globalAlpha=ctx.globalAlpha*alpha;
  ctx.drawImage(im,cx-w/2,top,w,h);
  ctx.restore(); return true;
}
function hasBossArt(){
  var list=BOSSART[G.stage], i;
  if(!list) return false;
  for(i=0;i<list.length;i++) if(artReady(list[i].k)) return true;
  return false;
}
function drawBossArt(b,idx){
  var list=BOSSART[G.stage], i;
  if(!hasBossArt()) return false;
  var bob=Math.sin(b.t*0.028)*3, h0=152;
  if(idx!==undefined&&idx>=0){
    var it0=list[idx%list.length], h0b=h0*it0.s;
    drawPortrait(it0.k,0,-h0b*0.36+bob,h0b,1);
    return true;
  }
  for(i=0;i<list.length;i++){
    var it=list[i], h=h0*it.s;
    drawPortrait(it.k,it.dx,-h*0.36+bob,h,1);
  }
  return true;
}
var sprC={};
function spr(color,r){
  var key=color+'_'+r, c=sprC[key];
  if(c) return c;
  var R=Math.ceil(r+5);
  c=document.createElement('canvas'); c.width=R*2; c.height=R*2;
  var x=c.getContext('2d'), rgb=hex2rgb(color).join(',');
  var g=x.createRadialGradient(R,R,0,R,R,R);
  g.addColorStop(0,'#ffffff'); g.addColorStop(0.30,'#ffffff');
  g.addColorStop(0.44,'rgb('+rgb+')'); g.addColorStop(0.76,'rgb('+rgb+')');
  g.addColorStop(1,'rgba('+rgb+',0)');
  x.fillStyle=g; x.beginPath(); x.arc(R,R,R,0,TAU); x.fill();
  c.rr=R; sprC[key]=c; return c;
}
var bgTile=null,bgStage=0,bgParts=[];
function buildBG(s){
  var c=document.createElement('canvas'); c.width=W; c.height=H;
  var x=c.getContext('2d'), i,k;
  if(s===1){
    for(k=0;k<4;k++){ var yy=k*160;
      x.fillStyle='rgba(9,30,17,0.85)';
      for(i=-1;i<7;i++){ var tx=i*82+((k%2)?41:0);
        x.beginPath(); x.moveTo(tx,yy); x.lineTo(tx-34,yy+124); x.lineTo(tx+34,yy+124); x.closePath(); x.fill(); }
      x.fillStyle='rgba(4,17,10,0.9)';
      for(i=-1;i<5;i++){ var tx2=i*120+((k%2)?60:0)+30;
        x.beginPath(); x.moveTo(tx2,yy+30); x.lineTo(tx2-52,yy+158); x.lineTo(tx2+52,yy+158); x.closePath(); x.fill(); }
    }
  } else if(s===2){
    x.strokeStyle='rgba(120,72,26,0.45)'; x.lineWidth=2;
    for(i=0;i<=8;i++){ x.beginPath(); x.moveTo(i*60,0); x.lineTo(i*60,H); x.stroke(); }
    for(k=0;k<=8;k++){ x.beginPath(); x.moveTo(0,k*80); x.lineTo(W,k*80); x.stroke(); }
    x.fillStyle='rgba(190,120,50,0.30)';
    for(i=0;i<8;i++) for(k=0;k<8;k++){ x.beginPath(); x.arc(i*60+30,k*80+40,5,0,TAU); x.fill(); }
  } else if(s===3){
    x.strokeStyle='rgba(120,170,210,0.28)'; x.lineWidth=1.4;
    for(i=0;i<26;i++){
      var px=(i*137)%W, py=(i*211)%H, r0=18+(i%5)*11;
      x.beginPath();
      for(k=0;k<6;k++){ var a=k*TAU/6+i; var fx=px+Math.cos(a)*r0, fy=py+Math.sin(a)*r0;
        if(k===0) x.moveTo(fx,fy); else x.lineTo(fx,fy); }
      x.closePath(); x.stroke();
    }
  } else if(s===4){
    x.strokeStyle='rgba(160,140,190,0.24)'; x.lineWidth=2;
    for(k=0;k<3;k++){ var cy=k*220+110;
      x.beginPath(); x.arc(W/2,cy,150,0,TAU); x.stroke();
      x.beginPath(); x.arc(W/2,cy,120,0,TAU); x.stroke();
      for(i=0;i<12;i++){ var a2=i*TAU/12;
        x.beginPath(); x.moveTo(W/2+Math.cos(a2)*120,cy+Math.sin(a2)*120);
        x.lineTo(W/2+Math.cos(a2)*150,cy+Math.sin(a2)*150); x.stroke(); }
    }
  } else {
    x.strokeStyle='rgba(150,40,80,0.30)'; x.lineWidth=2.5;
    for(k=0;k<4;k++){ var by=k*160+160;
      for(i=0;i<4;i++){ var ax=i*120+60;
        x.beginPath(); x.moveTo(ax-34,by); x.lineTo(ax-34,by-64);
        x.quadraticCurveTo(ax,by-124,ax+34,by-64); x.lineTo(ax+34,by); x.stroke(); }
    }
  }
  bgParts=[];
  for(i=0;i<46;i++) bgParts.push({x:rnd(W),y:rnd(H),v:rnd(0.3,1.6),r:rnd(0.7,2.2),s:rnd(TAU)});
  return c;
}
/* ---------- 背景イラスト（オープニングとボスシーンのみ） ---------- */
var SIMG={};
function loadScenes(){
  if(typeof Image==='undefined'||typeof SCENE==='undefined') return;
  for(var k in SCENE){
    (function(key){
      var im=new Image();
      im.onload=function(){ im._ok=true; };
      im.src=SCENE[key]; SIMG[key]=im;
    })(k);
  }
}
function sceneImg(k){ var im=SIMG[k]; return (im&&im._ok&&im.naturalHeight)?im:null; }
function coverDraw(im,alpha,pan){
  var iw=im.naturalWidth, ih=im.naturalHeight;
  var sc=Math.max(W/iw,H/ih), dw=iw*sc, dh=ih*sc;
  var dx=(W-dw)/2, dy=(dh>H)?-(dh-H)*pan:(H-dh)/2;
  ctx.save(); ctx.globalAlpha=alpha; ctx.drawImage(im,dx,dy,dw,dh); ctx.restore();
}
function applyTitleBG(){
  if(typeof SCENE==='undefined') return;
  var src=SCENE.st||SCENE.op; if(!src) return;
  var el=$('scr-title'); if(!el) return;
  /* 一枚絵を切らずに中央へ収め、余白は同じ絵を暗く敷いて埋める */
  el.style.backgroundImage='url("'+src+'"), linear-gradient(rgba(4,3,9,.90),rgba(4,3,9,.95)), url("'+src+'")';
  el.style.backgroundSize='contain, auto, cover';
  el.style.backgroundPosition='center center, center center, center center';
  el.style.backgroundRepeat='no-repeat, no-repeat, no-repeat';
}
function drawBG(){
  if(bgStage!==G.stage||!bgTile){ bgTile=buildBG(G.stage); bgStage=G.stage; }
  G.bgT++;
  var s=G.stage;
  var pal=[null,['#020805','#0d2415'],['#080402','#291705'],['#020509','#132436'],['#070510','#241b30'],['#0a0208','#2c0a1a']][s]||['#04030a','#141024'];
  var g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,pal[1]); g.addColorStop(1,pal[0]);
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  /* 一枚絵はタイトル（オープニング）とボス戦（警告〜撃破）だけ */
  var key=(G.state==='title')?'st':((G.phase==='boss'||G.phase==='warn')?('S'+s):null);
  var sim=key?sceneImg(key):null;
  if(sim){
    coverDraw(sim,0.66,0.5+0.5*Math.sin(G.bgT*0.0015));
    var dg=ctx.createLinearGradient(0,0,0,H);
    dg.addColorStop(0,'rgba(4,3,9,0.34)');
    dg.addColorStop(0.5,'rgba(4,3,9,0.50)');
    dg.addColorStop(1,'rgba(4,3,9,0.76)');
    ctx.fillStyle=dg; ctx.fillRect(0,0,W,H);
  } else {
    if(s===5){
      var mg=ctx.createRadialGradient(W/2,150,10,W/2,150,120);
      mg.addColorStop(0,'rgba(255,190,200,0.35)'); mg.addColorStop(0.5,'rgba(200,60,90,0.14)');
      mg.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=mg; ctx.beginPath(); ctx.arc(W/2,150,120,0,TAU); ctx.fill();
    }
    var off=(G.bgT*(0.35+s*0.12))%H;
    ctx.globalAlpha=0.55;
    ctx.drawImage(bgTile,0,off-H); ctx.drawImage(bgTile,0,off);
    ctx.globalAlpha=1;
  }
  var pc=['#ffffff','#a8d8b0','#ffc070','#dff0ff','#c8bcd8','#ff90b0'][s]||'#ffffff';
  ctx.fillStyle=pc;
  for(var i=0;i<bgParts.length;i++){
    var p=bgParts[i];
    p.y+=p.v*(s===2?-1:1); p.x+=Math.sin(G.bgT*0.01+p.s)*0.4;
    if(p.y>H+5){p.y=-5;p.x=rnd(W);} if(p.y<-5){p.y=H+5;p.x=rnd(W);}
    ctx.globalAlpha=0.22+0.2*Math.sin(G.bgT*0.05+p.s);
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,TAU); ctx.fill();
  }
  ctx.globalAlpha=1;
}
function drawPlayer(){
  if(P.inv>0&&(G.frame%8<4)&&P.hp>0) return;
  var bob=Math.sin(P.t*0.14)*1.2;
  ctx.save(); ctx.translate(P.x,P.y+bob);
  if(P.laserOn){
    var w=P.focus?9:15;
    var lg=ctx.createLinearGradient(0,-P.y,0,0);
    lg.addColorStop(0,'rgba(180,230,255,0)'); lg.addColorStop(0.35,'rgba(150,220,255,0.55)');
    lg.addColorStop(1,'rgba(255,255,255,0.9)');
    ctx.fillStyle=lg; ctx.fillRect(-w,-P.y-10,w*2,P.y-4);
    ctx.fillStyle='rgba(255,255,255,0.95)'; ctx.fillRect(-w*0.32,-P.y-10,w*0.64,P.y-4);
  }
  var pim=sceneImg('pj');
  if(pim){
    var ph=38, pw=pim.naturalWidth/pim.naturalHeight*ph;
    var gl=ctx.createRadialGradient(0,2,2,0,2,29);
    gl.addColorStop(0,'rgba(150,205,255,0.32)'); gl.addColorStop(1,'rgba(150,205,255,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(0,2,29,0,TAU); ctx.fill();
    ctx.save(); ctx.globalAlpha=0.32; ctx.fillStyle='#8fd0ff';
    ctx.beginPath(); ctx.ellipse(0,ph*0.40,pw*0.30,3.2,0,0,TAU); ctx.fill(); ctx.restore();
    ctx.drawImage(pim,-pw/2,-ph*0.58,pw,ph);
  } else {
    ctx.fillStyle='rgba(150,200,255,0.45)';
    ctx.beginPath(); ctx.moveTo(0,16); ctx.lineTo(-4,26+Math.sin(P.t*0.4)*3); ctx.lineTo(4,26+Math.sin(P.t*0.4)*3); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#e8f4ff';
    ctx.beginPath(); ctx.moveTo(0,-15); ctx.lineTo(10,10); ctx.lineTo(0,5); ctx.lineTo(-10,10); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#6aa8e0';
    ctx.beginPath(); ctx.moveTo(0,-9); ctx.lineTo(6,8); ctx.lineTo(0,4); ctx.lineTo(-6,8); ctx.closePath(); ctx.fill();
  }
  if(P.focus||touch.on){
    ctx.strokeStyle='rgba(220,240,255,0.5)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(0,0,20,G.frame*0.04,G.frame*0.04+2.4); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,20,G.frame*0.04+Math.PI,G.frame*0.04+Math.PI+2.4); ctx.stroke();
  }
  ctx.fillStyle='#ff4060'; ctx.beginPath(); ctx.arc(0,0,3.2,0,TAU); ctx.fill();
  ctx.fillStyle='#ffffff'; ctx.beginPath(); ctx.arc(0,0,1.5,0,TAU); ctx.fill();
  ctx.restore();
}
function drawPB(){
  for(var i=0;i<G.pb.length;i++){
    var b=G.pb[i];
    ctx.save(); ctx.translate(b.x,b.y);
    if(b.type==='homing'){
      ctx.rotate(Math.atan2(b.vy,b.vx)+Math.PI/2);
      ctx.fillStyle=b.ref?'rgba(255,232,140,0.92)':'rgba(160,255,220,0.85)';
      ctx.beginPath(); ctx.ellipse(0,0,b.ref?4:3.4,b.ref?8:7,0,0,TAU); ctx.fill();
      ctx.fillStyle='#ffffff'; ctx.beginPath(); ctx.ellipse(0,0,1.6,4,0,0,TAU); ctx.fill();
    } else {
      ctx.fillStyle='rgba(180,220,255,0.9)';
      ctx.beginPath(); ctx.ellipse(0,0,2.6,8,Math.atan2(b.vy,b.vx)+Math.PI/2,0,TAU); ctx.fill();
    }
    ctx.restore();
  }
}
function drawEnemies(){
  for(var i=0;i<G.enemies.length;i++){
    var e=G.enemies[i];
    ctx.save(); ctx.translate(e.x,e.y); ctx.rotate(e.t*0.02);
    ctx.fillStyle=e.hitT>0?'#ffffff':e.col;
    ctx.globalAlpha=0.25;
    ctx.beginPath(); ctx.arc(0,0,e.r*1.5,0,TAU); ctx.fill();
    ctx.globalAlpha=1;
    ctx.beginPath();
    for(var k=0;k<4;k++){ var a=k*TAU/4, rr=(k%2)?e.r*0.65:e.r;
      var fx=Math.cos(a)*rr, fy=Math.sin(a)*rr; if(k===0) ctx.moveTo(fx,fy); else ctx.lineTo(fx,fy); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(0,0,e.r*0.32,0,TAU); ctx.fill();
    ctx.restore();
  }
}
function drawFigure(s,b){
  var c=b.def.color, bob=Math.sin(b.t*0.03)*2;
  ctx.translate(0,bob);
  if(s===1){
    ctx.fillStyle='#8e1f31'; ctx.beginPath(); ctx.moveTo(0,-16); ctx.lineTo(26,28); ctx.lineTo(-26,28); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#e8dcc8'; ctx.beginPath(); ctx.arc(0,-22,9,0,TAU); ctx.fill();
    ctx.fillStyle='#c8283f'; ctx.beginPath(); ctx.arc(0,-24,11.5,Math.PI,TAU); ctx.fill();
    ctx.fillRect(-11.5,-25,23,5);
    ctx.fillStyle='#ff3b5c'; ctx.beginPath(); ctx.arc(-3.5,-21,1.5,0,TAU); ctx.arc(3.5,-21,1.5,0,TAU); ctx.fill();
  } else if(s===2){
    for(var i=0;i<2;i++){
      var ox=i?15:-15;
      ctx.fillStyle=i?'#c98a3a':'#8a5a2a';
      ctx.beginPath(); ctx.moveTo(ox,-8); ctx.lineTo(ox+14,26); ctx.lineTo(ox-14,26); ctx.closePath(); ctx.fill();
      ctx.fillStyle='#e8dcc8'; ctx.beginPath(); ctx.arc(ox,-16,8,0,TAU); ctx.fill();
      ctx.fillStyle=i?'#e8c070':'#5a3a1a'; ctx.beginPath(); ctx.arc(ox,-18,9.5,Math.PI,TAU); ctx.fill();
      ctx.fillStyle='#ff9a3c'; ctx.beginPath(); ctx.arc(ox-3,-15,1.4,0,TAU); ctx.arc(ox+3,-15,1.4,0,TAU); ctx.fill();
    }
  } else if(s===3){
    ctx.fillStyle='#e9f2fa'; ctx.beginPath(); ctx.moveTo(0,-14); ctx.lineTo(25,28); ctx.lineTo(-25,28); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#8fb6d8'; ctx.beginPath(); ctx.moveTo(0,-14); ctx.lineTo(9,28); ctx.lineTo(-9,28); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#f4ece4'; ctx.beginPath(); ctx.arc(0,-22,9,0,TAU); ctx.fill();
    ctx.fillStyle='#12121a'; ctx.beginPath(); ctx.arc(0,-24,11,Math.PI,TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-10,-20,4,0,TAU); ctx.arc(10,-20,4,0,TAU); ctx.fill();
    ctx.fillStyle='#c8283f'; ctx.beginPath(); ctx.arc(0,-17.5,2,0,TAU); ctx.fill();
  } else if(s===4){
    ctx.fillStyle='#6c6480'; ctx.beginPath(); ctx.moveTo(0,-14); ctx.lineTo(28,28); ctx.lineTo(-28,28); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#a9c8e8'; ctx.beginPath(); ctx.moveTo(0,-14); ctx.lineTo(14,20); ctx.lineTo(-14,20); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#f0e4d8'; ctx.beginPath(); ctx.arc(0,-22,9,0,TAU); ctx.fill();
    ctx.fillStyle='#d8c070'; ctx.beginPath(); ctx.arc(0,-24,10.5,Math.PI,TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-9,-31); ctx.lineTo(-5,-38); ctx.lineTo(0,-32); ctx.lineTo(5,-38); ctx.lineTo(9,-31); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle='rgba(60,10,30,0.92)';
    ctx.beginPath(); ctx.moveTo(0,-6);
    ctx.quadraticCurveTo(-46,-26,-58,4); ctx.quadraticCurveTo(-34,-2,-24,22); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0,-6);
    ctx.quadraticCurveTo(46,-26,58,4); ctx.quadraticCurveTo(34,-2,24,22); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#1a0a14'; ctx.beginPath(); ctx.moveTo(0,-16); ctx.lineTo(24,30); ctx.lineTo(-24,30); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#e8dce4'; ctx.beginPath(); ctx.arc(0,-24,9.5,0,TAU); ctx.fill();
    ctx.fillStyle='#2a0a18'; ctx.beginPath(); ctx.arc(0,-26,11,Math.PI,TAU); ctx.fill();
    ctx.fillStyle='#ff2050'; ctx.beginPath(); ctx.arc(-3.6,-23,2,0,TAU); ctx.arc(3.6,-23,2,0,TAU); ctx.fill();
  }
}
function drawBoss(){
  var b=G.boss; if(!b||b.state==='intro'&&b.y<-30) return;
  var alpha=(b.state==='dead')?Math.max(0,1-b.stateT/130):1;
  var us=bossUnits(b), multi=us.length>1, ui, i;
  ctx.save(); ctx.globalAlpha=alpha;
  for(ui=0;ui<us.length;ui++){
    var u=us[ui];
    ctx.save(); ctx.translate(u.x,u.y); ctx.rotate(G.frame*0.005);
    ctx.strokeStyle=b.def.color; ctx.lineWidth=1.4;
    ctx.globalAlpha=alpha*0.4;
    ctx.beginPath(); ctx.arc(0,0,46,0,TAU); ctx.stroke();
    ctx.globalAlpha=alpha*0.28;
    ctx.beginPath(); ctx.arc(0,0,58,0.3,2.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,58,3.44,5.64); ctx.stroke();
    for(i=0;i<6;i++){ var a=i*TAU/6;
      ctx.beginPath(); ctx.moveTo(Math.cos(a)*46,Math.sin(a)*46); ctx.lineTo(Math.cos(a)*58,Math.sin(a)*58); ctx.stroke(); }
    ctx.restore();
    var gg=ctx.createRadialGradient(u.x,u.y,4,u.x,u.y,52);
    gg.addColorStop(0,'rgba(255,255,255,0.18)'); gg.addColorStop(1,'rgba(255,255,255,0)');
    ctx.globalAlpha=alpha; ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(u.x,u.y,52,0,TAU); ctx.fill();
    ctx.save(); ctx.translate(u.x,u.y);
    if(hasBossArt()){
      drawBossArt(b,multi?ui:-1);
      if(b.hitT>0){                       /* filter より軽い加算合成でヒット時に光らせる */
        ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=alpha*0.5;
        drawBossArt(b,multi?ui:-1); ctx.restore();
      }
    } else {
      if(b.hitT>0) ctx.filter='brightness(2.2)';
      drawFigure(G.stage,b);
    }
    ctx.restore();
  }
  ctx.globalAlpha=alpha;
  if(b.state==='active'&&b.card&&b.card.draw) b.card.draw(b);
  for(var k=0;k<b.orbs.length;k++){
    var o=b.orbs[k];
    var og=ctx.createRadialGradient(o.x,o.y,1,o.x,o.y,o.r*2);
    og.addColorStop(0,'#ffffff'); og.addColorStop(0.4,o.c); og.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=og; ctx.beginPath(); ctx.arc(o.x,o.y,o.r*2,0,TAU); ctx.fill();
  }
  ctx.restore();
}
/* 盾（アイギス）の描画 : 全ユニットの周囲に障壁を張る */
function drawShield(b,col){
  var us=bossUnits(b), R=b.shieldR, i, k;
  for(i=0;i<us.length;i++){
    var u=us[i];
    ctx.save();
    var g=ctx.createRadialGradient(u.x,u.y,R*0.55,u.x,u.y,R);
    g.addColorStop(0,'rgba(255,224,138,0)'); g.addColorStop(0.82,'rgba(255,224,138,0.10)');
    g.addColorStop(1,'rgba(255,224,138,0.30)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(u.x,u.y,R,0,TAU); ctx.fill();
    ctx.strokeStyle=col||'rgba(255,224,138,0.75)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(u.x,u.y,R,0,TAU); ctx.stroke();
    ctx.globalAlpha=0.5; ctx.lineWidth=1;
    for(k=0;k<8;k++){
      var a=k*TAU/8+G.frame*0.012;
      ctx.beginPath(); ctx.arc(u.x,u.y,R-6,a,a+0.44); ctx.stroke();
    }
    ctx.restore();
  }
}
function drawBullets(){
  var arr=G.bullets;
  for(var i=0;i<arr.length;i++){
    var b=arr[i];
    if(b.hidden) continue;
    if(b.delay>0){
      ctx.globalAlpha=0.20+0.16*Math.sin(G.frame*0.22+i);
      ctx.strokeStyle=b.color; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.arc(b.x,b.y,b.r+1.5,0,TAU); ctx.stroke();
      ctx.globalAlpha=1; continue;
    }
    var s=spr(b.flash>0?'#ffffff':b.color,b.r);
    if(b.shape==='rice'){
      ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(Math.atan2(b.vy,b.vx));
      ctx.scale(1.5,0.6); ctx.drawImage(s,-s.rr,-s.rr); ctx.restore();
    } else ctx.drawImage(s,b.x-s.rr,b.y-s.rr);
  }
}
function drawFx(){
  for(var i=0;i<G.fx.length;i++){
    var f=G.fx[i], p=f.t/f.life;
    ctx.save();
    if(f.type==='boom'){
      ctx.globalAlpha=(1-p)*0.85; ctx.fillStyle=f.color;
      ctx.beginPath(); ctx.arc(f.x,f.y,f.size*(0.4+p*1.5),0,TAU); ctx.fill();
      ctx.globalAlpha=(1-p)*0.5; ctx.fillStyle='#ffffff';
      ctx.beginPath(); ctx.arc(f.x,f.y,f.size*(0.2+p*0.8),0,TAU); ctx.fill();
    } else if(f.type==='spark'){
      ctx.globalAlpha=1-p; ctx.fillStyle=f.color;
      ctx.beginPath(); ctx.arc(f.x,f.y,f.size*(1-p),0,TAU); ctx.fill();
    } else if(f.type==='circle'){
      ctx.globalAlpha=(p<0.8?0.55:(1-p)*2.7); ctx.strokeStyle=f.color; ctx.lineWidth=1.6;
      ctx.beginPath(); ctx.arc(f.x,f.y,f.size,0,TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(f.x,f.y,f.size*0.72,0,TAU); ctx.stroke();
      ctx.save(); ctx.translate(f.x,f.y); ctx.rotate(f.t*0.05);
      for(var k=0;k<6;k++){ var a=k*TAU/6;
        ctx.beginPath(); ctx.moveTo(Math.cos(a)*f.size*0.72,Math.sin(a)*f.size*0.72);
        ctx.lineTo(Math.cos(a+2.09)*f.size*0.72,Math.sin(a+2.09)*f.size*0.72); ctx.stroke(); }
      ctx.restore();
    } else {
      ctx.globalAlpha=(1-p)*0.7; ctx.strokeStyle=f.color; ctx.lineWidth=2.5*(1-p)+0.5;
      ctx.beginPath(); ctx.arc(f.x,f.y,f.size*p,0,TAU); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.globalAlpha=1;
}
function drawDark(){
  if(G.dark<=0.01) return;
  var a=G.dark, R=170;
  var g=ctx.createRadialGradient(P.x,P.y,14,P.x,P.y,R);
  g.addColorStop(0,'rgba(1,0,4,0)');
  g.addColorStop(0.38,'rgba(1,0,4,'+(a*0.72).toFixed(3)+')');
  g.addColorStop(0.72,'rgba(1,0,4,'+(a*0.96).toFixed(3)+')');
  g.addColorStop(1,'rgba(1,0,4,'+a.toFixed(3)+')');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  if(G.boss){
    var g2=ctx.createRadialGradient(G.boss.x,G.boss.y,3,G.boss.x,G.boss.y,66);
    g2.addColorStop(0,'rgba(255,205,235,'+(0.20*(1-a*0.45)).toFixed(3)+')');
    g2.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g2; ctx.beginPath(); ctx.arc(G.boss.x,G.boss.y,66,0,TAU); ctx.fill();
  }
}

/* ---------- 台詞（会話パート） ---------- */
var scene={lines:null,i:0,after:null,cine:false,tm:0};
function sceneClearTimer(){
  if(scene.tm&&typeof clearTimeout==='function') clearTimeout(scene.tm);
  scene.tm=0;
}
/* cine=true でレターボックス・自動送り・寄りのカメラに切り替える */
function playScene(lines,after,bgk,cine){
  if(!lines||!lines.length){ if(after) after(); return; }
  var bgel=$('story-bg');
  if(bgel){
    var u=(bgk&&typeof SCENE!=='undefined'&&SCENE[bgk])?SCENE[bgk]:null;
    bgel.style.backgroundImage=u?('url("'+u+'")'):'none';
  }
  scene.cine=!!cine;
  var sc=$('scr-story'); if(sc&&sc.classList) sc.classList.toggle('cine',!!cine);
  scene.lines=lines; scene.i=0; scene.after=after||null;
  G.state='story'; showScreen('story'); renderScene();
}
var VOICELESS={narr:1,title:1,sub:1,book:1,cast:1};
function refade(el,cls,anim){
  if(!el) return;
  el.className=cls;
  if(anim){ void el.offsetWidth; el.className=cls?(cls+' '+anim):anim; }
}
function renderScene(){
  var ln=scene.lines[scene.i], k=ln[0], who=CAST[k]||CAST.narr;
  var im=$('story-art');
  if(!scene.cine&&who.art&&typeof ART!=='undefined'&&ART[who.art]){ im.src=ART[who.art]; im.style.display='block'; }
  else { im.style.display='none'; }
  $('story-who').textContent=VOICELESS[k]?'':who.n;
  /* 終幕の登場人物紹介 : 立ち絵と本名を並べる */
  var cast=$('story-cast'), nm=$('story-name');
  if(cast){
    var html='';
    if(k==='cast'&&typeof ART!=='undefined'){
      var keys=String(ln[3]||'').split(',');
      for(var ci=0;ci<keys.length;ci++){
        var ak=keys[ci];
        if(ART[ak]) html+='<img src="'+ART[ak]+'" alt=""'+(keys.length>1?' class="pair"':'')+'>';
      }
    }
    cast.innerHTML=html;
    refade(cast,'',(scene.cine&&html)?'cinefade':null);
  }
  if(nm){
    nm.textContent=(k==='cast')?(ln[2]||''):'';
    refade(nm,'',(scene.cine&&nm.textContent)?'cinefade':null);
  }
  var el=$('story-line');
  el.textContent=ln[1];
  var cls=(k==='narr')?'narr':(k==='title'?'ttl':(k==='sub'?'sub':(k==='book'?'book':(k==='cast'?'cst':''))));
  refade(el,cls,scene.cine?((k==='book')?'bookin':'cinefade'):null);
  var sc=$('scr-story');
  if(sc&&sc.classList) sc.classList.toggle('book',!!(scene.cine&&k==='book'));
  $('story-prog').textContent=(scene.i+1)+' / '+scene.lines.length;
  sceneAuto();
}
function sceneAuto(){
  sceneClearTimer();
  if(!scene.cine||!scene.lines||typeof setTimeout!=='function') return;
  var ln=scene.lines[scene.i], k=ln[0];
  var ms=(k==='book')?4200:((k==='cast')?2900:((k==='title'||k==='sub')?2900:(1400+String(ln[1]).length*130)));
  scene.tm=setTimeout(function(){ scene.tm=0; if(scene.lines&&scene.cine) sceneNext(); },ms);
}
function sceneNext(){
  if(!scene.lines) return;
  sceneClearTimer();
  scene.i++;
  if(scene.i>=scene.lines.length){ sceneEnd(); return; }
  renderScene();
}
function sceneEnd(){
  sceneClearTimer();
  var f=scene.after;
  scene.lines=null; scene.after=null; scene.cine=false;
  var sc=$('scr-story');
  if(sc&&sc.classList){ sc.classList.remove('cine'); sc.classList.remove('book'); }
  var cs=$('story-cast'); if(cs){ cs.innerHTML=''; cs.className=''; }
  var nn=$('story-name'); if(nn){ nn.textContent=''; nn.className=''; }
  showScreen(null);
  if(f) f();
}

/* ---------- ボムの演出 ---------- */
function drawBombFx(){
  if(!B.active) return;
  var p=B.dur?B.t/B.dur:0, i, a;
  if(B.kind==='grim'){
    if(B.trail&&B.trail.length>1){
      ctx.save(); ctx.lineCap='round';
      for(i=1;i<B.trail.length;i++){
        var t0=B.trail[i-1], t1=B.trail[i], ta=Math.max(0,1-t1.t/70)*0.6;
        if(ta<=0) continue;
        ctx.globalAlpha=ta; ctx.strokeStyle='#a86ade'; ctx.lineWidth=3+ta*13;
        ctx.beginPath(); ctx.moveTo(t0.x,t0.y); ctx.lineTo(t1.x,t1.y); ctx.stroke();
        ctx.globalAlpha=ta*0.85; ctx.strokeStyle='#f0e0ff'; ctx.lineWidth=1+ta*3.5;
        ctx.beginPath(); ctx.moveTo(t0.x,t0.y); ctx.lineTo(t1.x,t1.y); ctx.stroke();
      }
      ctx.restore();
    }
    var gg=ctx.createRadialGradient(P.x,P.y,6,P.x,P.y,86);
    gg.addColorStop(0,'rgba(210,150,255,0.42)'); gg.addColorStop(0.55,'rgba(160,100,255,0.18)');
    gg.addColorStop(1,'rgba(200,140,255,0)');
    ctx.save(); ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(P.x,P.y,86,0,TAU); ctx.fill();
    ctx.globalAlpha=0.55; ctx.strokeStyle='#d8b0ff'; ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.arc(P.x,P.y,74+Math.sin(G.frame*0.3)*5,0,TAU); ctx.stroke();
    ctx.restore();
    if(B.decoy){
      ctx.save();
      ctx.globalAlpha=0.3; ctx.strokeStyle='rgba(201,166,255,0.9)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(B.decoy.x,B.decoy.y); ctx.lineTo(P.x,P.y); ctx.stroke();
      ctx.globalAlpha=0.5+Math.sin(G.frame*0.3)*0.12;
      ctx.translate(B.decoy.x,B.decoy.y);
      ctx.fillStyle='#c9a6ff';
      ctx.beginPath(); ctx.moveTo(0,-15); ctx.lineTo(10,10); ctx.lineTo(0,5); ctx.lineTo(-10,10);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle='rgba(201,166,255,0.7)';
      ctx.beginPath(); ctx.arc(0,0,18+Math.sin(G.frame*0.16)*3,0,TAU); ctx.stroke();
      ctx.restore();
    }
  } else if(B.kind==='excal'){
    var w=40*Math.min(1,B.t/5)*(B.t>B.dur-8?Math.max(0,(B.dur-B.t)/8):1);
    ctx.save();
    var lg=ctx.createLinearGradient(0,0,0,P.y);
    lg.addColorStop(0,'rgba(255,250,210,0.18)');
    lg.addColorStop(0.62,'rgba(255,246,190,0.58)');
    lg.addColorStop(1,'rgba(255,255,255,0.95)');
    ctx.fillStyle=lg; ctx.fillRect(P.x-w,0,w*2,P.y);
    ctx.fillStyle='rgba(255,255,255,0.92)'; ctx.fillRect(P.x-w*0.3,0,w*0.6,P.y);
    ctx.globalAlpha=0.5; ctx.strokeStyle='#fff4c0'; ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.arc(P.x,P.y,w*1.3+Math.sin(G.frame*0.4)*4,0,TAU); ctx.stroke();
    ctx.restore();
  } else if(B.kind==='hollow'){
    ctx.save(); ctx.globalAlpha=Math.max(0,0.55-Math.abs(p-0.5)*0.6);
    var g2=ctx.createRadialGradient(W/2,H*0.36,20,W/2,H*0.36,360);
    g2.addColorStop(0,'rgba(20,8,40,0)'); g2.addColorStop(0.65,'rgba(60,20,110,0.55)');
    g2.addColorStop(1,'rgba(10,4,24,0.9)');
    ctx.fillStyle=g2; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='rgba(190,150,255,0.55)'; ctx.lineWidth=2;
    for(i=0;i<3;i++){ var rr2=((B.t*4+i*90)%330);
      ctx.globalAlpha=Math.max(0,0.5-rr2/660);
      ctx.beginPath(); ctx.arc(W/2,H*0.36,rr2,0,TAU); ctx.stroke(); }
    ctx.restore();
  } else if(B.kind==='light'){
    ctx.save();
    ctx.strokeStyle='rgba(255,235,140,'+(0.34+Math.sin(G.frame*0.4)*0.14)+')'; ctx.lineWidth=1.3;
    ctx.beginPath(); ctx.arc(P.x,P.y,44,0,TAU); ctx.stroke();
    ctx.lineWidth=3;
    for(i=0;i<3;i++){ a=G.frame*0.16+i*TAU/3;
      ctx.beginPath(); ctx.arc(P.x,P.y,44,a,a+0.46); ctx.stroke(); }
    ctx.restore();
  } else if(B.kind==='stop'){
    ctx.save();
    ctx.fillStyle='rgba(110,180,220,0.16)'; ctx.fillRect(0,0,W,H);
    ctx.globalAlpha=0.5; ctx.strokeStyle='rgba(200,240,255,0.5)'; ctx.lineWidth=1;
    var rr3=(B.t%44)/44*320;
    ctx.beginPath(); ctx.arc(P.x,P.y,rr3,0,TAU); ctx.stroke();
    ctx.restore();
  }
  if(B.t<50){
    ctx.save(); ctx.globalAlpha=Math.min(1,(50-B.t)/22);
    ctx.textAlign='center'; ctx.font='17px "Hiragino Mincho ProN","Yu Mincho",serif';
    ctx.fillStyle='#ffe9a8'; ctx.fillText(bombDef(B.kind).n,W/2,H*0.66);
    ctx.restore();
  }
}

/* ---------- HUD ---------- */
function showMsg(a,b,dur){ G.msg={a:a,b:b}; G.msgT=dur; G.msgMax=dur; }
function heart(x,y,s,fill){
  ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
  ctx.beginPath(); ctx.moveTo(0,3);
  ctx.bezierCurveTo(-5,-2,-4.4,-6,-2.2,-6); ctx.bezierCurveTo(-0.7,-6,0,-4.6,0,-4.6);
  ctx.bezierCurveTo(0,-4.6,0.7,-6,2.2,-6); ctx.bezierCurveTo(4.4,-6,5,-2,0,3);
  ctx.closePath();
  if(fill){ ctx.fillStyle='#ff4f70'; ctx.fill(); ctx.strokeStyle='#ffd0da'; ctx.lineWidth=0.6; ctx.stroke(); }
  else { ctx.strokeStyle='rgba(255,160,180,0.4)'; ctx.lineWidth=0.9; ctx.stroke(); }
  ctx.restore();
}
function star(x,y,s,fill){
  ctx.save(); ctx.translate(x,y); ctx.rotate(-Math.PI/2); ctx.beginPath();
  for(var k=0;k<5;k++){
    var a=k*TAU/5;
    ctx.lineTo(Math.cos(a)*6*s,Math.sin(a)*6*s);
    ctx.lineTo(Math.cos(a+TAU/10)*2.5*s,Math.sin(a+TAU/10)*2.5*s);
  }
  ctx.closePath();
  if(fill){ ctx.fillStyle='#e0bb62'; ctx.fill(); }
  else { ctx.strokeStyle='rgba(201,162,74,0.38)'; ctx.lineWidth=0.9; ctx.stroke(); }
  ctx.restore();
}
function drawBombHUD(){
  var i, n=DF.bomb;
  for(i=0;i<n;i++) star(19+i*16,H-34,1,i<B.stock&&!B.active);
  ctx.save();
  ctx.textAlign='left'; ctx.font='10px "Hiragino Mincho ProN","Yu Mincho",serif';
  ctx.fillStyle=B.stock>0?'rgba(230,220,200,0.5)':'rgba(230,220,200,0.22)';
  ctx.fillText(bombDef(P.bomb).n,22+n*16,H-30);
  ctx.restore();
  if(touchUsed){
    var on=(B.stock>0&&!B.active);
    ctx.save(); ctx.globalAlpha=on?0.9:0.32;
    ctx.beginPath(); ctx.arc(BOMBBTN.x,BOMBBTN.y,29,0,TAU);
    ctx.fillStyle='rgba(18,10,28,0.66)'; ctx.fill();
    ctx.strokeStyle='#c9a24a'; ctx.lineWidth=1.2; ctx.stroke();
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font='18px "Hiragino Mincho ProN","Yu Mincho",serif'; ctx.fillStyle='#e8dcc8';
    ctx.fillText('術',BOMBBTN.x,BOMBBTN.y-5);
    ctx.font='10px "Hiragino Mincho ProN","Yu Mincho",serif';
    ctx.fillText('×'+B.stock,BOMBBTN.x,BOMBBTN.y+13);
    ctx.restore(); ctx.textBaseline='alphabetic'; ctx.textAlign='left';
  }
}
function drawHUD(){
  var b=G.boss, i;
  ctx.textBaseline='alphabetic';
  if(b&&(b.state==='active'||b.state==='break')){
    var cards=b.def.cards, total=cards.length, remain=total-b.ci;
    ctx.font='12px "Hiragino Mincho ProN","Yu Mincho",serif';
    ctx.textAlign='left'; ctx.fillStyle='#e8dcc8';
    ctx.fillText(b.def.name,10,16);
    ctx.textAlign='right'; ctx.fillStyle=b.def.color;
    ctx.font='12px "Hiragino Mincho ProN","Yu Mincho",serif';
    if(b.state==='active') ctx.fillText('①②③④⑤⑥'.charAt(b.ci)+' '+b.card.name,W-56,16);
    for(i=0;i<total;i++){
      var px=12+i*13, filled=(i<remain);
      ctx.save(); ctx.translate(px,24); ctx.rotate(Math.PI/4);
      if(filled){ ctx.fillStyle=b.def.color; ctx.fillRect(-3.5,-3.5,7,7); }
      else { ctx.strokeStyle='rgba(230,220,200,0.35)'; ctx.lineWidth=1; ctx.strokeRect(-3.5,-3.5,7,7); }
      ctx.restore();
    }
    var bw=W-24, hpr=(b.state==='active')?clamp(b.hp/b.maxhp,0,1):0;
    ctx.fillStyle='rgba(255,255,255,0.10)'; ctx.fillRect(12,32,bw,5);
    var lg=ctx.createLinearGradient(12,0,12+bw,0);
    lg.addColorStop(0,b.def.color); lg.addColorStop(1,'#ffffff');
    ctx.fillStyle=lg; ctx.fillRect(12,32,bw*hpr,5);
    ctx.strokeStyle='rgba(230,220,200,0.25)'; ctx.lineWidth=1; ctx.strokeRect(11.5,31.5,bw+1,6);
    if(b.state==='active'){
      var sec=Math.max(0,Math.ceil(b.timer/60));
      ctx.textAlign='right'; ctx.font='bold 20px "Courier New",monospace';
      ctx.fillStyle=sec<=10?'#ff5c72':'#e8dcc8';
      ctx.fillText(sec,W-12,20);
    }
  } else if(G.phase==='mid'){
    var conf=STAGE_CONF[G.stage], pr=clamp(G.phaseT/conf.midLen,0,1);
    ctx.fillStyle='rgba(255,255,255,0.08)'; ctx.fillRect(12,12,W-24,3);
    ctx.fillStyle='rgba(230,200,120,0.75)'; ctx.fillRect(12,12,(W-24)*pr,3);
    ctx.font='11px "Hiragino Mincho ProN","Yu Mincho",serif'; ctx.textAlign='left';
    ctx.fillStyle='rgba(230,220,200,0.6)';
    ctx.fillText('第'+G.stage+'話　'+conf.name,12,28);
  }
  for(i=0;i<maxHP();i++) heart(16+i*15,H-16,1.6,i<P.hp);
  drawBombHUD();
  ctx.textAlign='right'; ctx.font='11px "Hiragino Mincho ProN","Yu Mincho",serif';
  ctx.fillStyle='rgba(230,220,200,0.55)';
  ctx.fillText({laser:'レーザー',spread:'拡散弾',homing:'追尾弾'}[P.weapon]+(P.focus?'　集中':''),W-12,H-14);
  if(G.msgT>0&&G.msg){
    var p=1-G.msgT/G.msgMax, al=G.msgT<30?G.msgT/30:(p<0.12?p/0.12:1);
    var sx=(p<0.12)?(1-p/0.12)*40:0;
    ctx.save(); ctx.globalAlpha=al; ctx.textAlign='center';
    ctx.font='15px "Hiragino Mincho ProN","Yu Mincho",serif'; ctx.fillStyle='rgba(230,220,200,0.8)';
    ctx.fillText(G.msg.a,W/2+sx,H*0.30);
    ctx.font='22px "Hiragino Mincho ProN","Yu Mincho",serif';
    ctx.fillStyle=G.boss?G.boss.def.color:'#e8dcc8';
    ctx.fillText(G.msg.b,W/2-sx,H*0.30+30);
    ctx.strokeStyle='rgba(201,162,74,0.6)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(W/2-110,H*0.30+42); ctx.lineTo(W/2+110,H*0.30+42); ctx.stroke();
    ctx.restore();
  }
  if(G.phase==='warn'){
    var wp=G.phaseT/130, al=0.85*(wp<0.85?1:(1-wp)/0.15);
    var list=BOSSART[G.stage]||[], pi;
    var ein=Math.min(1,G.phaseT/26), eout=Math.min(1,Math.max(0,(130-G.phaseT)/22));
    ctx.save();
    ctx.globalAlpha=ein*eout;
    var px=(list.length>1?W*0.58:W*0.70)+(1-ein)*(1-ein)*300;
    for(pi=0;pi<list.length;pi++){
      var it=list[pi], ph=430*it.s;
      drawPortrait(it.k,px+it.dx*3.0,H-ph-18,ph,1);
    }
    ctx.restore();
    ctx.save(); ctx.globalAlpha=al;
    var bg=ctx.createLinearGradient(0,0,W,0);
    bg.addColorStop(0,'rgba(4,3,9,0.9)'); bg.addColorStop(0.62,'rgba(4,3,9,0.55)');
    bg.addColorStop(1,'rgba(4,3,9,0)');
    ctx.fillStyle=bg; ctx.fillRect(0,H*0.42-58,W,124);
    ctx.textAlign='left';
    ctx.fillStyle=(G.frame%20<10)?'#ff3b5c':'#e8dcc8';
    ctx.font='34px "Hiragino Mincho ProN","Yu Mincho",serif';
    ctx.fillText('警　告',26,H*0.42);
    ctx.font='15px "Hiragino Mincho ProN","Yu Mincho",serif'; ctx.fillStyle='#e8dcc8';
    ctx.fillText(BOSSES[G.stage-1].sub,26,H*0.42+26);
    ctx.font='19px "Hiragino Mincho ProN","Yu Mincho",serif';
    ctx.fillText(BOSSES[G.stage-1].name,26,H*0.42+50);
    ctx.strokeStyle='rgba(255,59,92,0.7)'; ctx.lineWidth=2;
    var lw=W*Math.min(1,wp*2.4);
    ctx.beginPath(); ctx.moveTo(0,H*0.42-52); ctx.lineTo(lw,H*0.42-52);
    ctx.moveTo(0,H*0.42+62); ctx.lineTo(lw,H*0.42+62); ctx.stroke();
    ctx.restore();
  }
  if(G.flash>0){ ctx.fillStyle='rgba(255,255,255,'+(G.flash/26)+')'; ctx.fillRect(0,0,W,H); }
}

/* ==================================================================
   進行 / 画面
   ================================================================== */
function showScreen(id){
  var els=document.querySelectorAll('.screen');
  for(var i=0;i<els.length;i++) els[i].classList.toggle('on',els[i].id==='scr-'+id);
  document.body.classList.toggle('inplay',id===null||id===undefined);
}
var alloc={left:0,add:{hp:0,atk:0,spd:0},mode:'init'};
var STATDEF=[
  {k:'hp', n:'体力', d:'被弾に耐えられる回数。最大HP＝2＋体力'},
  {k:'atk',n:'攻撃', d:'与えるダメージの倍率。高いほどボスを早く削れる'},
  {k:'spd',n:'速度', d:'移動速度。弾幕の隔を抜ける余裕に直結する'}
];
function openAlloc(mode){
  alloc.mode=mode; alloc.left=(mode==='init')?10:3;
  alloc.add={hp:0,atk:0,spd:0};
  $('alloc-title').textContent=(mode==='init')?'ステータスを振り分ける':'撃破報酬　＋３ポイント';
  $('alloc-sub').textContent=(mode==='init')
    ?'この選択が終盤まで付きまとう。残り0にすると進める。'
    :'体力は全回復した。次の話への備えを選ぶ。';
  buildAlloc();
  showScreen('alloc');
}
function buildAlloc(){
  var box=$('alloc-rows'); box.innerHTML='';
  for(var i=0;i<STATDEF.length;i++){
    (function(s){
      var cur=P.stat[s.k]+alloc.add[s.k];
      var row=document.createElement('div'); row.className='statrow';
      var head=document.createElement('div'); head.className='sr-head';
      head.innerHTML='<span class="sr-name">'+s.n+'</span><span class="sr-val">'+cur+'</span>';
      var bar=document.createElement('div'); bar.className='sr-bar';
      var fill=document.createElement('i'); fill.style.width=Math.min(100,cur/15*100)+'%';
      bar.appendChild(fill);
      var desc=document.createElement('p'); desc.className='sr-desc'; desc.textContent=s.d;
      var ctr=document.createElement('div'); ctr.className='sr-ctrl';
      var minus=document.createElement('button'); minus.textContent='−';
      var plus=document.createElement('button'); plus.textContent='＋';
      minus.disabled=alloc.add[s.k]<=0;
      plus.disabled=(alloc.left<=0)||cur>=15;
      minus.onclick=function(){ if(alloc.add[s.k]>0){ alloc.add[s.k]--; alloc.left++; sfx('ui'); buildAlloc(); } };
      plus.onclick=function(){ if(alloc.left>0&&cur<15){ alloc.add[s.k]++; alloc.left--; sfx('ui'); buildAlloc(); } };
      ctr.appendChild(minus); ctr.appendChild(plus);
      row.appendChild(head); row.appendChild(bar); row.appendChild(desc); row.appendChild(ctr);
      box.appendChild(row);
    })(STATDEF[i]);
  }
  $('alloc-pts').textContent=alloc.left;
  var hp=2+P.stat.hp+alloc.add.hp, at=(0.7+0.3*(P.stat.atk+alloc.add.atk)), sd=(1.7+0.22*(P.stat.spd+alloc.add.spd));
  $('alloc-preview').textContent='最大HP '+hp+'　火力 ×'+at.toFixed(2)+'　速度 '+sd.toFixed(2);
  $('alloc-ok').disabled=alloc.left>0;
  $('alloc-ok').textContent=alloc.left>0?('残り '+alloc.left+' ポイント'):(alloc.mode==='init'?'武装を選ぶ':'次の話へ');
}
function confirmAlloc(){
  P.stat.hp+=alloc.add.hp; P.stat.atk+=alloc.add.atk; P.stat.spd+=alloc.add.spd;
  P.maxhp=maxHP(); P.hp=maxHP();
  sfx('ui');
  if(alloc.mode==='init'){ showScreen('weapon'); }
  else { G.stage++; startStage(); }
}
function chooseWeapon(w){ P.weapon=w; sfx('ui'); buildBombs(); showScreen('bomb'); }
function chooseBomb(k){ P.bomb=k; B.kind=k; sfx('ui'); G.stage=1; setBGM('prologue'); playScene(STORY.prologue,startStage,'op'); }
function cardBtn(cls,title,pow,desc,fn){
  var el=document.createElement('button'); el.className=cls;
  var s1=document.createElement('span'); s1.className='wn'; s1.textContent=title;
  var s2=document.createElement('span'); s2.className='wp'; s2.textContent=pow;
  var s3=document.createElement('span'); s3.className='wd'; s3.textContent=desc;
  el.appendChild(s1); el.appendChild(s2); el.appendChild(s3);
  el.onclick=fn; return el;
}
function buildDiffs(){
  var box=$('diff-grid'); if(!box) return; box.innerHTML='';
  for(var i=0;i<DIFFS.length;i++){
    (function(dd){
      box.appendChild(cardBtn('wcard dcard',dd.n,dd.lat+'　ボム '+dd.bomb+'　弾速 ×'+dd.bs.toFixed(2),dd.d,
        function(){ setDiff(dd.k); sfx('ui'); openAlloc('init'); }));
    })(DIFFS[i]);
  }
}
function buildBombs(){
  var box=$('bomb-grid'); if(!box) return; box.innerHTML='';
  for(var i=0;i<BOMBS.length;i++){
    (function(bd,idx){
      box.appendChild(cardBtn('wcard bcard','①②③④⑤'.charAt(idx)+'　'+bd.n,
        bd.lat+'　発動 '+bd.sec+' 秒',bd.d,function(){ chooseBomb(bd.k); }));
    })(BOMBS[i],i);
  }
}
function startStage(){
  G.phase='mid'; G.phaseT=0; G.waveN=0;
  G.bullets.length=0; G.pb.length=0; G.enemies.length=0; G.fx.length=0;
  G.boss=null; G.dark=0; G.msgT=0; G.shake=0;
  B.active=false; B.t=0; B.decoy=null; B.stock=DF.bomb;
  P.x=W/2; P.y=H-90; P.inv=110; P.hp=maxHP(); P.maxhp=maxHP();
  G.state='play'; showScreen(null); updatePanel(); setBGM('doutyuu');
  bgmWarm('vs'+G.stage);   /* ボス戦の曲を先に取りに行かせて、切り替わりの間を詰める */
  showMsg('第'+G.stage+'話',STAGE_CONF[G.stage].name,130);
}
function stageCleared(){
  G.boss=null; G.bullets.length=0; G.enemies.length=0;
  var st=STORY[G.stage], here=G.stage;
  var fin=function(){
    if(here>=5){
      setBGM('epi');
      playScene(STORY.epilogue,function(){ G.state='clear'; fillResult('clear'); showScreen('clear'); },'op',true);
    } else { G.state='levelup'; openAlloc('boss'); }
  };
  /* AfterBattleLeia は吸血鬼を倒したあとだけ。1〜4話の別れは静かな曲で */
  setBGM(here>=5?'after':'prologue');
  playScene(st&&st.win,fin,'S'+here);
}
function gameOver(){
  G.state='gameover'; G.bullets.length=0; setBGM(null);
  sfx('dead');
  addFx('boom',P.x,P.y,'#ff4060',60);
  fillResult('over'); showScreen('gameover');
}
function fillResult(kind){
  var pre=(kind==='clear')?'clear':'over';
  $(pre+'-score').textContent=G.score.toLocaleString();
  $(pre+'-graze').textContent=G.graze.toLocaleString();
  if(kind==='over'){ $('over-stage').textContent='第'+G.stage+'話　'+
    (G.phase==='boss'?BOSSES[G.stage-1].name:STAGE_CONF[G.stage].name);
    $('over-diff').textContent=DF.n; }
  else {
    $('clear-cont').textContent=G.continues; $('clear-cards').textContent=G.bestCards+' / 22';
    $('clear-diff').textContent=DF.n;
    var cst=$('cast');
    if(cst&&cst.getAttribute('data-filled')!=='1'&&typeof ART!=='undefined'){
      var keys=['A1','A2b','A2a','A3','A4','A5'], html='';
      for(var ci=0;ci<keys.length;ci++) html+='<img src="'+ART[keys[ci]]+'" alt="">';
      cst.innerHTML=html; cst.setAttribute('data-filled','1');
    }
  }
}
function retryStage(){ G.continues++; G.score=0; startStage(); }
function backToTitle(){ G.state='title'; showScreen('title'); setBGM('prologue'); }
function newGame(){
  bgmKick();
  G.stage=1; G.score=0; G.graze=0; G.continues=0; G.bestCards=0; G.waveN=0;
  P.stat={hp:1,atk:1,spd:1}; P.weapon='laser'; P.bomb='grim';
  B.active=false; B.t=0; B.decoy=null;
  actx(); buildDiffs(); showScreen('diff');
}
/* ---------- panel ---------- */
function updatePanel(){
  $('ui-stage').textContent=G.stage+' / 5';
  $('ui-score').textContent=G.score.toLocaleString();
  $('ui-graze').textContent=G.graze.toLocaleString();
  $('ui-hp').textContent=P.hp+' / '+maxHP();
  $('ui-atk').textContent='×'+atkMul().toFixed(2);
  $('ui-spd').textContent=moveSpd().toFixed(2);
  $('ui-weapon').textContent={laser:'レーザー',spread:'拡散弾',homing:'追尾弾'}[P.weapon];
  $('ui-diff').textContent=DF.n;
  $('ui-bomb').textContent=bombDef(P.bomb).n+'　'+B.stock+' / '+DF.bomb;
  for(var ci=1;ci<=5;ci++){ var ce=$('mk'+ci);
    if(ce) ce.className=(ci<G.stage?'done':(ci===G.stage?'cur':'')); }
  $('bar-hp').style.width=Math.min(100,P.stat.hp/15*100)+'%';
  $('bar-atk').style.width=Math.min(100,P.stat.atk/15*100)+'%';
  $('bar-spd').style.width=Math.min(100,P.stat.spd/15*100)+'%';
}

/* ==================================================================
   ループ
   ================================================================== */
function update(){
  G.frame++;
  if(G.shake>0) G.shake*=0.88;
  if(G.flash>0) G.flash--;
  if(G.msgT>0) G.msgT--;
  if(!(G.boss&&G.boss.state==='active'&&G.boss.card.name==='ナイトクイーン')) G.dark=Math.max(0,G.dark-0.02);
  var froze=timeStopped();
  updatePlayer();
  updateBomb();
  if(!froze){
    if(G.phase==='mid') updateMid();
    else if(G.phase==='warn') updateWarn();
    else updateBoss();
    updateEnemies();
    updateBullets();
    updatePBullets();
  }
  updateFx();
  if(G.state==='play'&&!froze) checkCollide();
}
function render(){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,W,H);
  ctx.save();
  if(G.shake>0.4) ctx.translate(rnd(-G.shake,G.shake),rnd(-G.shake,G.shake));
  drawBG();
  drawEnemies();
  drawBoss();
  drawBombFx();
  drawPB();
  drawPlayer();
  drawBullets();
  drawDark();
  drawFx();
  ctx.restore();
  drawHUD();
}
var last=0, acc=0;
function loop(ts){
  requestAnimationFrame(loop);
  if(!last) last=ts;
  var dt=Math.min(100,ts-last); last=ts; acc+=dt;
  var steps=0;
  while(acc>=16.666&&steps<3){
    acc-=16.666; steps++;
    if(G.state==='play') update(); else if(G.state==='title'){ G.frame++; G.bgT++; }
  }
  if(G.state==='play'||G.state==='pause'||G.state==='levelup'||G.state==='gameover'||G.state==='clear'||G.state==='story') render();
  else { ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,W,H); drawBG(); drawTitleArt(); }
  bgmTick();
  if(G.frame%6===0) updatePanel();
}
function drawTitleArt(){
  var t=G.frame*0.012, cx=W/2, cy=H*0.44, i, k;
  ctx.save();
  ctx.translate(cx,cy);
  ctx.strokeStyle='rgba(201,162,74,0.42)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(0,0,150,0,TAU); ctx.stroke();
  ctx.globalAlpha=0.6;
  ctx.beginPath(); ctx.arc(0,0,134,0,TAU); ctx.stroke();
  ctx.save(); ctx.rotate(t);
  for(i=0;i<24;i++){ var a=i*TAU/24;
    ctx.beginPath(); ctx.moveTo(Math.cos(a)*134,Math.sin(a)*134);
    ctx.lineTo(Math.cos(a)*(i%2?126:118),Math.sin(a)*(i%2?126:118)); ctx.stroke(); }
  ctx.restore();
  ctx.save(); ctx.rotate(-t*0.6);
  ctx.strokeStyle='rgba(179,40,60,0.45)';
  ctx.beginPath();
  for(k=0;k<7;k++){ var a2=(k*3)*TAU/7-Math.PI/2;
    if(k===0) ctx.moveTo(Math.cos(a2)*104,Math.sin(a2)*104);
    else ctx.lineTo(Math.cos(a2)*104,Math.sin(a2)*104); }
  ctx.closePath(); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle='rgba(201,162,74,0.25)';
  ctx.beginPath(); ctx.arc(0,0,104,0,TAU); ctx.stroke();
  ctx.restore();
}

/* ---------- 起動 ---------- */
function bind(){
  $('btn-start').onclick=function(){ sfx('ui'); newGame(); };
  $('btn-how').onclick=function(){ sfx('ui'); showScreen('how'); };
  $('btn-how-back').onclick=function(){ sfx('ui'); showScreen('title'); };
  $('alloc-ok').onclick=confirmAlloc;
  $('btn-retry').onclick=function(){ sfx('ui'); retryStage(); };
  $('btn-title').onclick=function(){ sfx('ui'); backToTitle(); };
  $('btn-title2').onclick=function(){ sfx('ui'); backToTitle(); };
  $('btn-resume').onclick=function(){ G.state='play'; showScreen(null); };
  $('btn-quit').onclick=function(){ backToTitle(); };
  var muteBtns=document.querySelectorAll('.mute-btn'), mbi;
  for(mbi=0;mbi<muteBtns.length;mbi++){
    muteBtns[mbi].onclick=function(){ bgmKick(); setMuted(!muted); };
  }
  if(typeof window.addEventListener==='function'){
    /* 最初の操作で音声を解錠する。どの入力から始めても拾えるようにしておく */
    window.addEventListener('pointerdown',bgmKick);
    window.addEventListener('touchstart',bgmKick,{passive:true});
    window.addEventListener('touchend',bgmKick,{passive:true});
    window.addEventListener('keydown',bgmKick);
    window.addEventListener('click',bgmKick);
  }
  $('scr-story').onclick=function(){ sceneNext(); };
  $('story-skip').onclick=function(e){ if(e&&e.stopPropagation) e.stopPropagation(); sceneEnd(); };
  $('btn-diff-back').onclick=function(){ sfx('ui'); showScreen('title'); };
  $('btn-bomb-back').onclick=function(){ sfx('ui'); showScreen('weapon'); };
  var ws=document.querySelectorAll('.wcard');
  for(var i=0;i<ws.length;i++){
    (function(el){ el.onclick=function(){ chooseWeapon(el.getAttribute('data-w')); }; })(ws[i]);
  }
}
function safeInsets(){
  var el=$('safe');
  if(!el||typeof window.getComputedStyle!=='function') return {t:0,r:0,b:0,l:0};
  var cs=window.getComputedStyle(el);
  return {t:parseFloat(cs.paddingTop)||0, r:parseFloat(cs.paddingRight)||0,
          b:parseFloat(cs.paddingBottom)||0, l:parseFloat(cs.paddingLeft)||0};
}
var AD_GAP=20;   /* 広告枠とゲーム画面のあいだの余白（CSS の #layout gap と揃える） */
/* 狭い画面では拡大縮小に頼らず、画面に収まる大きさへ盤面そのものを組み直す。
   広告の枠を置いている場合は、その分だけ盤面の取り分を減らして
   ゲーム画面と広告が重ならないようにする */
function elH(id){ var e=$(id); return (e&&e.offsetParent!==null)?e.offsetHeight:0; }
function elW(id){ var e=$(id); return (e&&e.offsetParent!==null)?e.offsetWidth:0; }
function fit(){
  var wrap=$('wrap'), plate=$('plate'), body=document.body;
  var vv=window.visualViewport;
  var lw=window.innerWidth||900, lh=window.innerHeight||650;
  var vw=(vv&&vv.width)||lw, vh=(vv&&vv.height)||lh;
  var compact=(lw<=820||lh<=600);
  if(body.classList) body.classList.toggle('compact',compact);
  if(compact){
    var si=safeInsets(), pad=5;
    var band=elH('ad-top')+elH('sitebar');      /* 画面上部に置いた帯の高さ */
    var aw=Math.max(120,vw-si.l-si.r-pad*2);
    var ah=Math.max(160,vh-si.t-si.b-pad*2-band);
    var sc=Math.min(aw/W,ah/H);
    var cw=Math.max(1,Math.floor(W*sc)), ch=Math.max(1,Math.floor(H*sc));
    body.style.height=Math.round(vh)+'px';
    wrap.style.transform='none';
    wrap.style.width=cw+'px'; wrap.style.height=ch+'px';
    plate.style.width=cw+'px'; plate.style.height=ch+'px'; plate.style.margin='0';
    cv.style.width=cw+'px'; cv.style.height=ch+'px';
  } else {
    body.style.height='';
    wrap.style.width=''; wrap.style.height='';
    plate.style.width=''; plate.style.height=''; plate.style.margin='';
    cv.style.width=''; cv.style.height='';
    var ww=wrap.offsetWidth||900, wh=wrap.offsetHeight||650;
    var rails=elW('ad-left')+elW('ad-right');   /* 左右に置いた広告枠 */
    var gaps=rails?AD_GAP*2:0;
    var availW=Math.max(320,vw-rails-gaps);
    var s=Math.min(availW/ww,(vh-elH('ad-top')-4)/wh);
    if(!(s>0)) s=1;
    wrap.style.transform='scale('+Math.min(s,1.35)+')';
  }
}
window.addEventListener('resize',fit);
window.addEventListener('orientationchange',function(){ setTimeout(fit,80); setTimeout(fit,260); setTimeout(fit,600); });
if(window.visualViewport&&window.visualViewport.addEventListener)
  window.visualViewport.addEventListener('scroll',fit);
window.addEventListener('focus',function(){ setTimeout(fit,60); });
if(window.visualViewport&&window.visualViewport.addEventListener)
  window.visualViewport.addEventListener('resize',fit);
window.addEventListener('keydown',function(e){
  if(e.code==='Enter'){
    var el=document.querySelector('.screen.on .primary');
    if(el&&!el.disabled){ e.preventDefault(); el.click(); }
  }
});
if(window.BGM) BGM.init();
loadArt(); loadScenes(); bind(); applyTitleBG(); fit(); showScreen('title'); updatePanel(); setBGM('prologue');
requestAnimationFrame(loop);
})();
