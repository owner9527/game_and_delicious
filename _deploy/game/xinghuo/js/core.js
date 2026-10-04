/* ============================================================
 * core.js — 工具:随机数 / 噪声 / 数学 / ECS 框架 / 粒子 / 音效
 * ============================================================ */
'use strict';

/* 全局游戏状态(由 main.js 的 startWorld 构建) */
var G = null;

/* ---------- 数学 ---------- */
const Util = {
  clamp(v, a, b){ return v < a ? a : (v > b ? b : v); },
  lerp(a, b, t){ return a + (b - a) * t; },
  dist(ax, ay, bx, by){ const dx = bx - ax, dy = by - ay; return Math.sqrt(dx*dx + dy*dy); },
  dist2(ax, ay, bx, by){ const dx = bx - ax, dy = by - ay; return dx*dx + dy*dy; },
  ang(ax, ay, bx, by){ return Math.atan2(by - ay, bx - ax); },
  tile(v){ return Math.floor(v / TILE); },
  tCenter(t){ return t * TILE + TILE / 2; },
  fmt(n){ return n >= 10000 ? (n/1000).toFixed(1)+'k' : Math.floor(n); },
  pick(arr, rnd){ return arr[Math.floor(rnd() * arr.length)]; },
};

/* ---------- 随机数:mulberry32(可播种) ---------- */
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function strSeed(s){
  if(!s) return (Math.random() * 0xFFFFFFFF) >>> 0;
  const n = Number(s);
  if(Number.isFinite(n) && String(n) === String(s).trim()) return n >>> 0;
  let h = 2166136261;
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ---------- 确定性哈希 & 值噪声(程序化地形核心) ---------- */
function hash2i(ix, iy, seed){
  let h = (ix|0) * 374761393 + (iy|0) * 668265263 + (seed|0) * 974634211;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295; // 0..1
}
function vnoise(x, y, seed){
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx*fx*(3-2*fx), sy = fy*fy*(3-2*fy);
  const a = hash2i(x0, y0, seed),     b = hash2i(x0+1, y0, seed);
  const c = hash2i(x0, y0+1, seed),   d = hash2i(x0+1, y0+1, seed);
  return a + (b-a)*sx + (c-a)*sy + (a-b-c+d)*sx*sy;
}
function fbm(x, y, seed, oct){
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for(let i = 0; i < oct; i++){
    v += vnoise(x*f, y*f, seed + i*1013) * amp;
    norm += amp; amp *= 0.5; f *= 2;
  }
  return v / norm; // 0..1
}

/* ============================================================
 * ECS 轻量实体-组件-系统框架
 * 实体 = id + 类型 + 组件袋(comps);系统按注册顺序每帧更新。
 * ============================================================ */
const ECS = {
  entities: new Map(),
  nextId: 1,
  systems: [],

  spawn(type, comps){
    const e = { id: this.nextId++, type, dead: false, comps: comps || {} };
    // 组件同时展开到实体顶层,方便热路径访问(e.ai === e.comps.ai)
    Object.assign(e, e.comps);
    this.entities.set(e.id, e);
    return e;
  },
  kill(e){
    if(e) e.dead = true; // 帧末由 sweep 统一移除
  },
  get(id){ return this.entities.get(id); },
  /* 拥有全部指定组件的实体(顶层与 comps 双检查,支持 spawn 后追加组件) */
  query(...compNames){
    const out = [];
    for(const e of this.entities.values()){
      if(e.dead) continue;
      let ok = true;
      for(const c of compNames){ if(!e.comps[c] && !e[c]){ ok = false; break; } }
      if(ok) out.push(e);
    }
    return out;
  },
  first(...compNames){
    for(const e of this.entities.values()){
      if(e.dead) continue;
      let ok = true;
      for(const c of compNames){ if(!e.comps[c] && !e[c]){ ok = false; break; } }
      if(ok) return e;
    }
    return null;
  },
  addSystem(name, update){ this.systems.push({ name, update }); },
  update(dt){
    for(const s of this.systems) s.update(dt);
    if(this.entities.size){
      for(const [id, e] of this.entities){ if(e.dead) this.entities.delete(id); }
    }
  },
  clear(){ this.entities.clear(); this.nextId = 1; },
};

/* ---------- 粒子 & 飘字(纯视觉) ---------- */
const FX = {
  parts: [],   // {x,y,vx,vy,life,maxLife,size,color,grav}
  floats: [],  // {x,y,text,color,life}
  burst(x, y, color, n, spd){
    n = n || 8;
    for(let i = 0; i < n; i++){
      const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random() * 0.7) * (spd || 60);
      this.parts.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s - 30,
        life: 0.4 + Math.random()*0.4, maxLife: 0.8, size: 2 + Math.random()*2.5,
        color, grav: 160 });
    }
    if(this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
  },
  float(x, y, text, color){
    this.floats.push({ x, y, text, color: color || '#ffe9c0', life: 1.4 });
    if(this.floats.length > 60) this.floats.shift();
  },
  update(dt){
    for(let i = this.parts.length - 1; i >= 0; i--){
      const p = this.parts[i];
      p.life -= dt;
      if(p.life <= 0){ this.parts.splice(i, 1); continue; }
      p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for(let i = this.floats.length - 1; i >= 0; i--){
      const f = this.floats[i];
      f.life -= dt; f.y -= 26 * dt;
      if(f.life <= 0) this.floats.splice(i, 1);
    }
  },
  clear(){ this.parts.length = 0; this.floats.length = 0; },
};

/* ---------- 极简 WebAudio 合成音效 ---------- */
const Sfx = {
  ctx: null, master: null, muted: false,
  init(){
    if(this.ctx) return;
    try{
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.ctx.destination);
    }catch(e){ /* 无音频环境时静默 */ }
  },
  tone(freq, dur, type, vol, slide){
    if(!this.ctx || this.muted) return;
    if(this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol || 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  chop(){ this.tone(180 + Math.random()*60, 0.08, 'triangle', 0.7, -80); },
  hit(){ this.tone(120, 0.12, 'square', 0.6, -60); },
  place(){ this.tone(330, 0.1, 'square', 0.5); setTimeout(()=>this.tone(440, 0.12, 'square', 0.5), 80); },
  done(){ this.tone(440, 0.1, 'triangle', 0.6); setTimeout(()=>this.tone(550,0.1,'triangle',0.6),90); setTimeout(()=>this.tone(660,0.16,'triangle',0.6),180); },
  eat(){ this.tone(500, 0.07, 'sine', 0.6, -200); },
  uiTick(){ this.tone(700, 0.04, 'square', 0.25); },
  unlock(){ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>this.tone(f,0.14,'triangle',0.5), i*95)); },
  alarm(){ this.tone(150, 0.5, 'sawtooth', 0.45, -50); setTimeout(()=>this.tone(150, 0.5, 'sawtooth', 0.45, -50), 600); },
  monsterDie(){ this.tone(90, 0.25, 'sawtooth', 0.5, -40); },
  shoot(){ this.tone(880, 0.05, 'square', 0.3, -500); },
};
