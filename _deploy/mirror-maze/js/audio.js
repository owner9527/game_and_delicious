/* ============================================================
   音频系统 — WebAudio 全合成，零素材
   双声道设计（策划案 5.4）：左侧角色音效恒定左声道，右侧恒定右声道
   BGM：每章一个主题的生成式氛围乐（pad + 琶音）
   ============================================================ */
(function () {
  "use strict";
  const A = {
    ctx: null,
    master: null,
    sfxBus: null,
    bgmBus: null,
    unlocked: false,
    sfxVol: 0.7,
    bgmVol: 0.45,
    // 生成式 BGM 状态
    bgmTimer: null,
    bgmChapter: -1,
    bgmNextTime: 0,
    bgmStep: 0,
  };

  // 章节音乐配置：调式内音级（Hz 由音名生成）、和弦进行、速度
  const NOTE = (n, o) => 440 * Math.pow(2, (n - 9 + (o - 4) * 12) / 12); // n: 0=C
  const CHAPTER_MUSIC = [
    { bpm: 66, base: 0,  chords: [[0, 4, 7], [-3, 2, 5], [-5, 0, 4], [-1, 2, 7]], arp: [0, 7, 4, 12] },      // 黎明 C
    { bpm: 60, base: 2,  chords: [[0, 3, 7], [-4, 0, 5], [-2, 2, 5], [-5, 0, 3]], arp: [0, 5, 3, 10] },      // 黄昏 D
    { bpm: 72, base: 5,  chords: [[0, 4, 9], [-3, 0, 7], [-5, 2, 7], [2, 5, 9]], arp: [0, 9, 4, 7] },        // 森林 F
    { bpm: 78, base: 8,  chords: [[0, 3, 7], [-2, 1, 8], [-4, 0, 5], [-5, 3, 7]], arp: [0, 7, 3, 12] },      // 熔岩 G#m
    { bpm: 54, base: 11, chords: [[0, 4, 7], [0, 5, 9], [-3, 4, 7], [-1, 4, 6]], arp: [0, 12, 7, 4] },       // 终焉 B
  ];

  function ensure() {
    if (A.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      A.ctx = new AC();
      A.master = A.ctx.createGain();
      A.master.gain.value = 1;
      A.master.connect(A.ctx.destination);
      A.sfxBus = A.ctx.createGain();
      A.sfxBus.gain.value = A.sfxVol;
      A.sfxBus.connect(A.master);
      A.bgmBus = A.ctx.createGain();
      A.bgmBus.gain.value = A.bgmVol;
      A.bgmBus.connect(A.master);
      return true;
    } catch (e) { return false; }
  }

  // 首次用户手势时解锁（浏览器自动播放策略）
  function unlock() {
    if (!ensure()) return;
    if (A.ctx.state === "suspended") A.ctx.resume();
    if (!A.unlocked) {
      A.unlocked = true;
      if (A.bgmChapter >= 0) startBgm(A.bgmChapter);
    }
  }

  function setVolumes(sfx, bgm) {
    A.sfxVol = sfx; A.bgmVol = bgm;
    if (A.sfxBus) A.sfxBus.gain.value = sfx;
    if (A.bgmBus) A.bgmBus.gain.value = bgm;
  }

  /* ---------- 基础合成原语 ---------- */
  // pan: -1 左 … 0 中 … +1 右
  function panNode(pan) {
    const ctx = A.ctx;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      return p;
    }
    const g = ctx.createGain(); // 退化：老浏览器忽略声像
    return g;
  }

  function env(gain, t0, a, peak, d, sustain, stopT) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + a);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t0 + a + d);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopT);
  }

  function tone(opt) {
    if (!A.unlocked || A.sfxVol <= 0) return;
    const ctx = A.ctx, t = ctx.currentTime + (opt.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = opt.type || "sine";
    const g = ctx.createGain();
    const dur = opt.dur || 0.15;
    osc.frequency.setValueAtTime(opt.f0 || 440, t);
    if (opt.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opt.f1), t + dur);
    const peak = (opt.vol == null ? 0.5 : opt.vol);
    env(g, t, opt.att || 0.008, peak, dur * 0.6, opt.sus || 0.0001, t + dur);
    const p = panNode(opt.pan || 0);
    osc.connect(g); g.connect(p); p.connect(A.sfxBus);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function noise(opt) {
    if (!A.unlocked || A.sfxVol <= 0) return;
    const ctx = A.ctx, t = ctx.currentTime + (opt.delay || 0);
    const dur = opt.dur || 0.2;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = opt.ftype || "bandpass";
    filt.frequency.setValueAtTime(opt.f0 || 800, t);
    if (opt.f1) filt.frequency.exponentialRampToValueAtTime(Math.max(1, opt.f1), t + dur);
    filt.Q.value = opt.q || 0.8;
    const g = ctx.createGain();
    env(g, t, opt.att || 0.005, opt.vol == null ? 0.4 : opt.vol, dur * 0.5, 0.0001, t + dur);
    const p = panNode(opt.pan || 0);
    src.connect(filt); filt.connect(g); g.connect(p); p.connect(A.sfxBus);
    src.start(t); src.stop(t + dur + 0.05);
  }

  /* ---------- 音效库（按角色方位声像定位） ---------- */
  const SFX = {
    ui:      () => tone({ type: "triangle", f0: 620, f1: 540, dur: 0.07, vol: 0.25 }),
    jump:    (pan) => { tone({ type: "sine", f0: 340, f1: 680, dur: 0.14, vol: 0.4, pan }); noise({ f0: 2400, dur: 0.05, vol: 0.08, pan }); },
    land:    (pan) => tone({ type: "sine", f0: 150, f1: 70, dur: 0.1, vol: 0.32, pan }),
    step:    (pan) => noise({ f0: 900 + Math.random() * 500, dur: 0.035, vol: 0.06, pan }),
    shard:   (pan) => { tone({ type: "triangle", f0: 880, dur: 0.22, vol: 0.4, pan }); tone({ type: "triangle", f0: 1318, dur: 0.3, vol: 0.3, pan, delay: 0.07 }); },
    death:   (pan) => { tone({ type: "sawtooth", f0: 320, f1: 60, dur: 0.4, vol: 0.4, pan }); noise({ f0: 1800, f1: 200, dur: 0.35, vol: 0.3, pan }); },
    portal:  (pan) => { noise({ f0: 500, f1: 3200, dur: 0.28, vol: 0.3, pan }); tone({ type: "sine", f0: 300, f1: 900, dur: 0.25, vol: 0.22, pan }); },
    plate:   (pan) => tone({ type: "square", f0: 190, f1: 150, dur: 0.08, vol: 0.3, pan }),
    door:    (pan) => { tone({ type: "sawtooth", f0: 90, f1: 140, dur: 0.3, vol: 0.28, pan }); noise({ f0: 400, dur: 0.25, vol: 0.14, pan }); },
    doorShut:(pan) => { tone({ type: "sawtooth", f0: 140, f1: 70, dur: 0.22, vol: 0.26, pan }); },
    checkpoint: (pan) => { tone({ type: "sine", f0: 523, dur: 0.14, vol: 0.3, pan }); tone({ type: "sine", f0: 784, dur: 0.2, vol: 0.28, pan, delay: 0.09 }); },
    beam:    (pan) => { tone({ type: "sine", f0: 1046, dur: 0.35, vol: 0.26, pan }); tone({ type: "sine", f0: 1568, dur: 0.4, vol: 0.16, pan, delay: 0.05 }); },
    beatTick: (accent, pan) => { noise({ f0: accent ? 3000 : 2200, dur: 0.03, vol: accent ? 0.3 : 0.16, pan }); tone({ type: "sine", f0: accent ? 880 : 660, dur: 0.05, vol: accent ? 0.24 : 0.12 }); },
    breakMirror: () => {
      noise({ f0: 3000, f1: 400, dur: 0.7, vol: 0.55, ftype: "highpass" });
      tone({ type: "sawtooth", f0: 200, f1: 40, dur: 0.7, vol: 0.45 });
      for (let i = 0; i < 7; i++) tone({ type: "sine", f0: 1600 + Math.random() * 2400, dur: 0.12 + Math.random() * 0.2, vol: 0.2, delay: Math.random() * 0.3, pan: Math.random() * 1.6 - 0.8 });
    },
    win: () => {
      const seq = [523, 659, 784, 1046];
      seq.forEach((f, i) => tone({ type: "triangle", f0: f, dur: 0.3, vol: 0.35, delay: i * 0.11 }));
      tone({ type: "sine", f0: 2093, dur: 0.6, vol: 0.16, delay: 0.44 });
    },
    star: () => tone({ type: "triangle", f0: 1200, f1: 1800, dur: 0.18, vol: 0.3 }),
  };
  function play(name, pan, extra) { if (A.unlocked) { const f = SFX[name]; if (f) f(pan || 0, extra); } }

  /* ---------- 生成式 BGM ---------- */
  function startBgm(chapter) {
    A.bgmChapter = chapter;
    if (!A.unlocked || !ensure()) return;
    stopBgmLoop();
    A.bgmStep = 0;
    A.bgmNextTime = A.ctx.currentTime + 0.1;
    A.bgmTimer = setInterval(bgmTick, 120);
  }
  function stopBgmLoop() { if (A.bgmTimer) { clearInterval(A.bgmTimer); A.bgmTimer = null; } }
  function stopBgm() { A.bgmChapter = -1; stopBgmLoop(); }

  function bgmTick() {
    if (!A.ctx || A.bgmVol <= 0 || A.bgmChapter < 0) return;
    const cfg = CHAPTER_MUSIC[A.bgmChapter] || CHAPTER_MUSIC[0];
    const spb = 60 / cfg.bpm; // 每拍秒数；一小节和弦 = 4 拍
    while (A.bgmNextTime < A.ctx.currentTime + 0.4) {
      const t = A.bgmNextTime;
      const bar = Math.floor(A.bgmStep / 4), beat = A.bgmStep % 4;
      const chord = cfg.chords[bar % cfg.chords.length];
      // 每小节换和弦：柔和 pad（三个音，三角波 + 缓包络）
      if (beat === 0) {
        chord.forEach((iv, k) => bgmPad(NOTE(cfg.base + iv, 3), t, spb * 4.2, 0.05 - k * 0.008));
        bgmPad(NOTE(cfg.base + chord[0], 2), t, spb * 4.2, 0.05); // 低音
      }
      // 稀疏琶音（正弦短音），每拍概率触发
      if (Math.random() < 0.62) {
        const iv = cfg.arp[(A.bgmStep + bar) % cfg.arp.length];
        bgmPluck(NOTE(cfg.base + iv + 12, 4), t, 0.1);
      }
      A.bgmNextTime += spb;
      A.bgmStep++;
    }
  }
  function bgmPad(freq, t, dur, vol) {
    const ctx = A.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
    const p = panNode(0);
    [0, 4].forEach((det) => {
      const o = ctx.createOscillator();
      o.type = "triangle"; o.frequency.value = freq * (det ? 1.003 : 0.997);
      o.connect(g); o.start(t); o.stop(t + dur + 0.1);
    });
    g.connect(f); f.connect(p); p.connect(A.bgmBus);
  }
  function bgmPluck(freq, t, vol) {
    const ctx = A.ctx;
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    const p = panNode(Math.random() * 0.5 - 0.25);
    o.connect(g); g.connect(p); p.connect(A.bgmBus);
    o.start(t); o.stop(t + 1);
  }

  window.MMAudio = { unlock, setVolumes, play, startBgm, stopBgm, get unlocked() { return A.unlocked; } };
})();
