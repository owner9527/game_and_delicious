/* ============================================================
   情绪花园 — 音频引擎（WebAudio 全程序化合成，零素材依赖）
   音效 / 三层动态 BGM / 内置曲库片段 / 本地音频解码 / 432Hz
   ============================================================ */
window.EG = window.EG || {};

EG.Audio = {
  ctx: null, master: null, sfxGain: null, bgmGain: null,
  four32: false,
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.8; this.sfxGain.connect(this.master);
    this.bgmGain = this.ctx.createGain(); this.bgmGain.gain.value = 0.0; this.bgmGain.connect(this.master);
    return this.ctx;
  },
  f(freq) { return this.four32 ? freq * 432 / 440 : freq; },
  setVolume(bgmOn, sfxOn) {
    if (!this.ctx) return;
    this.sfxGain.gain.value = sfxOn ? 0.8 : 0;
    this.bgmGain.gain.setTargetAtTime(bgmOn ? 0.5 : 0, this.ctx.currentTime, 0.5);
  },
  /* 单音 */
  tone(freq, dur, type = 'sine', vol = 0.2, dest = null, delay = 0) {
    const ctx = this.ensure(); if (!ctx) return null;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = this.f(freq);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return { o, g };
  },
  /* 噪声（浇水气泡、雨声）*/
  noise(dur, freq = 800, vol = 0.15, delay = 0) {
    const ctx = this.ensure(); if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const filt = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = freq; filt.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
    src.start(ctx.currentTime + delay);
  },
};

EG.SFX = {
  click() { EG.Audio.tone(660, 0.07, 'sine', 0.10); },
  plant() { EG.Audio.noise(0.18, 500, 0.2); EG.Audio.tone(220, 0.12, 'sine', 0.1, null, 0.05); },
  water() { for (let i = 0; i < 5; i++) EG.Audio.noise(0.10, 700 + Math.random() * 900, 0.09, i * 0.06); },
  coin() { EG.Audio.tone(880, 0.1, 'sine', 0.12); EG.Audio.tone(1318, 0.14, 'sine', 0.12, null, 0.07); },
  pop() { EG.Audio.tone(520, 0.06, 'triangle', 0.12); },
  chime() { const notes = [523, 659, 784, 1046]; notes.forEach((n, i) => EG.Audio.tone(n, 0.5, 'sine', 0.1, null, i * 0.09)); },
  /* 绽放情绪动机：按情绪家族的音色演奏 8 秒级短旋律 */
  motif(cat, root = 0) {
    const scales = { joy: [0, 2, 4, 7, 9, 12, 16], calm: [0, 2, 4, 7, 9, 12], sad: [0, 3, 5, 7, 10, 12], anger: [0, 3, 5, 6, 7, 10, 12], anxiety: [0, 2, 3, 5, 7, 8, 11], attach: [0, 2, 3, 7, 8, 12] };
    const inst = EG.EMOTIONS[cat].inst;
    const scale = scales[cat], base = 261.6 * Math.pow(2, root / 12);
    const seq = [];
    for (let i = 0; i < 8; i++) seq.push(scale[Math.floor(Math.random() * scale.length)]);
    seq.forEach((semi, i) => {
      EG.Audio.tone(base * Math.pow(2, semi / 12), cat === 'sad' ? 0.7 : 0.35, inst, 0.08, null, i * (cat === 'anxiety' ? 0.16 : 0.28));
    });
    EG.Audio.tone(base / 2, 2.4, 'sine', 0.05, null, 0);
  },
};

/* ---------- 三层动态 BGM（环境底噪 + 和弦垫 + 和谐度铃层）---------- */
EG.BGM = {
  timer: null, chordIdx: 0,
  PROG: [[0, 4, 7], [-3, 2, 5], [-5, 0, 4], [-1, 2, 7]],
  start() {
    this.stop();
    const ctx = EG.Audio.ensure(); if (!ctx) return;
    EG.Audio.setVolume(true, EG.G.settings.sfx);
    this.tick();
    this.timer = setInterval(() => this.tick(), 8000);
  },
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },
  tick() {
    const ctx = EG.Audio.ctx; if (!ctx || !EG.G || !EG.G.settings.bgm) return;
    const t0 = ctx.currentTime;
    /* 层1 环境底噪（湿度高 → 雨感）*/
    if (!this._noise) {
      const len = ctx.sampleRate * 4;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 320;
      const g = ctx.createGain(); g.gain.value = 0.02;
      src.connect(filt); filt.connect(g); g.connect(EG.Audio.bgmGain);
      src.start(); this._noise = { src, filt, g };
    }
    this._noise.g.gain.setTargetAtTime(EG.G.eco.hum > 70 ? 0.05 : 0.018, t0, 2);
    /* 层2 和弦垫 */
    const chord = this.PROG[this.chordIdx % this.PROG.length]; this.chordIdx++;
    const base = 130.8;
    chord.forEach((semi, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = EG.Audio.f(base * Math.pow(2, semi / 12));
      o.detune.value = (i - 1) * 4;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.045, t0 + 2.5);
      g.gain.linearRampToValueAtTime(0, t0 + 7.8);
      o.connect(g); g.connect(EG.Audio.bgmGain);
      o.start(t0); o.stop(t0 + 8);
    });
    /* 层3 和谐度铃层 */
    if (EG.G.eco.har > 55 && Math.random() < (EG.G.eco.har - 40) / 120) {
      const pent = [523.3, 587.3, 659.3, 784, 880];
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = EG.Audio.f(EG.pick(pent));
      g.gain.setValueAtTime(0, t0 + 1);
      g.gain.linearRampToValueAtTime(0.03, t0 + 1.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.5);
      o.connect(g); g.connect(EG.Audio.bgmGain);
      o.start(t0 + 1); o.stop(t0 + 3.6);
    }
  },
};

/* ---------- 内置曲库播放（合成 8 秒片段）---------- */
EG.MusicPlayer = {
  stops: [],
  play(track, onEnd) {
    this.stop();
    const ctx = EG.Audio.ensure(); if (!ctx) return;
    const scales = { major: [0, 2, 4, 5, 7, 9, 11, 12], minor: [0, 2, 3, 5, 7, 8, 10, 12], penta: [0, 2, 4, 7, 9, 12, 14, 16] };
    const scale = scales[track.scale] || scales.penta;
    const base = 220 * Math.pow(2, track.root / 12);
    const beat = 60 / track.bpm;
    let t = 0, i = 0;
    while (t < 8) {
      const semi = scale[Math.floor(Math.random() * scale.length)];
      const freq = base * Math.pow(2, semi / 12);
      const h = EG.Audio.tone(freq, Math.min(beat * 1.6, 0.9), track.inst, 0.10, EG.Audio.sfxGain, t);
      if (h) this.stops.push(h);
      if (i % 4 === 0) { const b = EG.Audio.tone(base / 2, 0.3, 'sine', 0.10, EG.Audio.sfxGain, t); if (b) this.stops.push(b); }
      t += beat * (Math.random() < 0.3 ? 2 : 1); i++;
    }
    const endTimer = setTimeout(() => { if (onEnd) onEnd(); }, 8200);
    this.stops.push({ _timer: endTimer });
  },
  stop() {
    this.stops.forEach(h => {
      if (h._timer) { clearTimeout(h._timer); return; }
      try { if (h.g) h.g.gain.setTargetAtTime(0, EG.Audio.ctx.currentTime, 0.05); if (h.o) h.o.stop(EG.Audio.ctx.currentTime + 0.2); } catch (e) {}
    });
    this.stops = [];
  },
};

/* ---------- 本地音频文件解码 ---------- */
EG.decodeAudioFile = function (file) {
  return new Promise((resolve, reject) => {
    const ctx = EG.Audio.ensure();
    if (!ctx) return reject(new Error('音频不可用'));
    const reader = new FileReader();
    reader.onload = e => {
      ctx.decodeAudioData(e.target.result.slice(0), resolve, err => reject(err || new Error('解码失败')));
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};
