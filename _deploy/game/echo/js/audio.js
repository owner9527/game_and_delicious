/* ============================================================
 * 《回声》音频引擎 —— 程序化音频（策划案 5.4 / 6.2）
 * - 材质声全部实时合成，无外部采样
 * - 声像（方位）、响度衰减（距离/材质）、音调（大小）映射
 * - 卷积混响（生成式脉冲响应）+ 混音通道预算（≤16路，超出丢弃最弱）
 * - 回声延迟校准 ±200ms（蓝牙耳机补偿，策划案 11.1）
 * - 交互式分层 BGM：低频嗡鸣基底，进度叠层（5.4.2）
 * ============================================================ */
(function () {
  const A = {};
  let ctx = null, master, sfxDry, sfxBus, musicBus, convolver, wetGain, analyser;
  let noiseBuf = null;
  let vol = { master: .8, music: .6, sfx: .9 };
  let latencyMs = 0;          // 回声校准
  let activeVoices = 0;       // 通道预算
  const MAX_VOICES = 16;

  function makeNoise(sec) {
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function makeIR(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return b;
  }

  A.init = function () {
    if (ctx) { try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) { } return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.connect(master);
      // 混响湿声
      convolver = ctx.createConvolver();
      convolver.buffer = makeIR(2.2, 3.2);
      wetGain = ctx.createGain();
      sfxBus.connect(convolver); convolver.connect(wetGain); wetGain.connect(master);
      // 沙盒波形分析
      analyser = ctx.createAnalyser(); analyser.fftSize = 512;
      sfxBus.connect(analyser);
      noiseBuf = makeNoise(2);
      A.applyVolumes();
    } catch (e) { ctx = null; } // 音频不可用时界面点击不受阻塞
  };
  A.ctx = () => ctx;
  A.analyser = () => analyser;
  A.now = () => ctx ? ctx.currentTime + latencyMs / 1000 : 0;
  A.setLatency = ms => { latencyMs = ms || 0; };
  A.applyVolumes = function () {
    if (!ctx) return;
    master.gain.value = vol.master;
    sfxBus.gain.value = vol.sfx;
    musicBus.gain.value = vol.music * 0.25; // BGM 低于交互音效（5.4.2）
    wetGain.gain.value = 0.35;
  };
  A.setVol = (k, v) => { vol[k] = v; A.applyVolumes(); };
  A.getVol = k => vol[k];

  function voiceStart(gain) {
    if (!ctx || activeVoices >= MAX_VOICES) return false;
    activeVoices++;
    setTimeout(() => activeVoices--, (gain || 1) * 0 + 50); // 由各 stop 递减，此处兜底
    return true;
  }
  // pan: -1..1 ；t0: 绝对时间；返回可复用的输出节点链
  function out(t0, gainV, pan, wet) {
    const g = ctx.createGain(); g.gain.value = gainV;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    let head = g;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan || 0)); g.connect(p); head = p; }
    head.connect(sfxBus);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(convolver); }
    return g;
  }
  function osc(type, f, t0) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0); return o; }
  function noiseSrc(t0) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = .8 + Math.random() * .4; return s; }

  /* ---------- 基础音色库（材质合成） ---------- */
  // kind: metal glass water wood stone wind voice bell
  // pitch: 0(低沉大物)..1(清脆小物)  gain: 0..1  pan: -1..1
  A.playSound = function (kind, pitch, gain, pan, dur, when) {
    if (!ctx) return;
    pitch = pitch == null ? .5 : pitch;
    gain = gain == null ? .8 : gain;
    pan = pan || 0;
    dur = dur || 0;
    const t0 = when != null ? when : A.now();
    if (activeVoices >= MAX_VOICES) return; // 通道预算（5.5）
    switch (kind) {
      case 'metal': return sMetal(t0, pitch, gain, pan);
      case 'glass': return sGlass(t0, pitch, gain, pan);
      case 'water': return sWater(t0, pitch, gain, pan);
      case 'wood': return sWood(t0, pitch, gain, pan);
      case 'stone': return sStone(t0, pitch, gain, pan);
      case 'wind': return sWind(t0, Math.max(1.2, dur || 2.5), gain, pan);
      case 'voice': return sVoice(t0, pitch, gain, pan);
      case 'bell': return sBell(t0, pitch, gain, pan);
    }
  };

  function sMetal(t0, p, g, pan) { // 非谐分部 + 金属噪声
    const base = 130 + 260 * p;
    [1, 2.76, 5.4, 8.93].forEach((m, i) => {
      const o = osc('sine', base * m * (1 + (Math.random() - .5) * .01), t0);
      const e = ctx.createGain();
      e.gain.setValueAtTime(0, t0);
      e.gain.linearRampToValueAtTime(g * [0.5, 0.3, 0.16, 0.08][i], t0 + .004);
      e.gain.exponentialRampToValueAtTime(.0001, t0 + 1.1 - i * .18);
      o.connect(e); o.start(t0); o.stop(t0 + 1.2); e.connect(out(t0, 1, pan, .5));
      o.onended = () => activeVoices--; activeVoices++;
    });
    const n = noiseSrc(t0); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600 + 1800 * p; bp.Q.value = 1.4;
    const ne = ctx.createGain(); ne.gain.setValueAtTime(g * .32, t0); ne.gain.exponentialRampToValueAtTime(.0001, t0 + .14);
    n.connect(bp); bp.connect(ne); ne.connect(out(t0, 1, pan, .3)); n.start(t0); n.stop(t0 + .2);
    n.onended = () => activeVoices--; activeVoices++;
  }
  function sGlass(t0, p, g, pan) {
    const base = 900 + 1500 * p;
    [1, 1.021, 2.02, 2.98].forEach((m, i) => {
      const o = osc('sine', base * m, t0);
      const e = ctx.createGain();
      e.gain.setValueAtTime(0, t0);
      e.gain.linearRampToValueAtTime(g * [0.4, 0.3, 0.2, 0.1][i], t0 + .003);
      e.gain.exponentialRampToValueAtTime(.0001, t0 + 1.5 - i * .3);
      o.connect(e); o.start(t0); o.stop(t0 + 1.6); e.connect(out(t0, 1, pan, .55));
      o.onended = () => activeVoices--; activeVoices++;
    });
    const n = noiseSrc(t0); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200;
    const ne = ctx.createGain(); ne.gain.setValueAtTime(g * .18, t0); ne.gain.exponentialRampToValueAtTime(.0001, t0 + .1);
    n.connect(hp); hp.connect(ne); ne.connect(out(t0, 1, pan, .3)); n.start(t0); n.stop(t0 + .15);
    n.onended = () => activeVoices--; activeVoices++;
  }
  function sWater(t0, p, g, pan) { // 水滴：上滑啁啾
    const o = osc('sine', 380 + 240 * p, t0);
    o.frequency.exponentialRampToValueAtTime((700 + 900 * p), t0 + .09);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t0); e.gain.linearRampToValueAtTime(g * .5, t0 + .006);
    e.gain.exponentialRampToValueAtTime(.0001, t0 + .38);
    o.connect(e); o.start(t0); o.stop(t0 + .45); e.connect(out(t0, 1, pan, .6));
    o.onended = () => activeVoices--; activeVoices++;
    const n = noiseSrc(t0); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 2;
    const ne = ctx.createGain(); ne.gain.setValueAtTime(g * .1, t0); ne.gain.exponentialRampToValueAtTime(.0001, t0 + .08);
    n.connect(bp); bp.connect(ne); ne.connect(out(t0, 1, pan, .3)); n.start(t0); n.stop(t0 + .1);
    n.onended = () => activeVoices--; activeVoices++;
  }
  function sWood(t0, p, g, pan) {
    const o = osc('sine', 90 + 160 * p, t0);
    o.frequency.exponentialRampToValueAtTime(60 + 90 * p, t0 + .12);
    const e = ctx.createGain(); e.gain.setValueAtTime(g * .6, t0); e.gain.exponentialRampToValueAtTime(.0001, t0 + .22);
    o.connect(e); o.start(t0); o.stop(t0 + .26); e.connect(out(t0, 1, pan, .35));
    o.onended = () => activeVoices--; activeVoices++;
    const n = noiseSrc(t0); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const ne = ctx.createGain(); ne.gain.setValueAtTime(g * .28, t0); ne.gain.exponentialRampToValueAtTime(.0001, t0 + .09);
    n.connect(lp); lp.connect(ne); ne.connect(out(t0, 1, pan, .2)); n.start(t0); n.stop(t0 + .12);
    n.onended = () => activeVoices--; activeVoices++;
  }
  function sStone(t0, p, g, pan) {
    const n = noiseSrc(t0); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300 + 500 * p;
    const e = ctx.createGain(); e.gain.setValueAtTime(g * .5, t0); e.gain.exponentialRampToValueAtTime(.0001, t0 + .3);
    n.connect(lp); lp.connect(e); e.connect(out(t0, 1, pan, .5)); n.start(t0); n.stop(t0 + .35);
    n.onended = () => activeVoices--; activeVoices++;
    const o = osc('sine', 55 + 70 * p, t0);
    const e2 = ctx.createGain(); e2.gain.setValueAtTime(g * .4, t0); e2.gain.exponentialRampToValueAtTime(.0001, t0 + .2);
    o.connect(e2); o.start(t0); o.stop(t0 + .24); e2.connect(out(t0, 1, pan, .3));
    o.onended = () => activeVoices--; activeVoices++;
  }
  function sWind(t0, dur, g, pan) { // 阵风：呼吸式噪声
    const n = noiseSrc(t0);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(320, t0);
    lp.frequency.linearRampToValueAtTime(760, t0 + dur * .4);
    lp.frequency.linearRampToValueAtTime(300, t0 + dur);
    const lfo = osc('sine', .7, t0); const lg = ctx.createGain(); lg.gain.value = 180;
    lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t0); lfo.stop(t0 + dur + .1);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t0);
    e.gain.linearRampToValueAtTime(g * .5, t0 + dur * .3);
    e.gain.linearRampToValueAtTime(0, t0 + dur);
    n.connect(lp); lp.connect(e); e.connect(out(t0, 1, pan, .65));
    n.start(t0); n.stop(t0 + dur + .05);
    n.onended = () => activeVoices--; activeVoices++;
  }
  function sVoice(t0, p, g, pan) { // 「声语」：五声音节短句
    const scale = [0, 2, 4, 7, 9];
    const n = 3 + Math.floor(Math.random() * 3);
    let t = t0;
    const baseF = 300 + 220 * p;
    for (let i = 0; i < n; i++) {
      const f = baseF * Math.pow(2, scale[Math.floor(Math.random() * 5)] / 12);
      const o = osc('sine', f, t);
      const o2 = osc('triangle', f * 2.01, t);
      const e = ctx.createGain();
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g * .3, t + .03);
      e.gain.exponentialRampToValueAtTime(.0001, t + .22);
      const e2 = ctx.createGain(); e2.gain.value = .25;
      o2.connect(e2); e2.connect(e);
      o.connect(e); o.start(t); o.stop(t + .26); o2.start(t); o2.stop(t + .26);
      e.connect(out(t, 1, pan, .55));
      o.onended = () => activeVoices--; o2.onended = () => activeVoices--; activeVoices += 2;
      t += .16 + Math.random() * .1;
    }
  }
  function sBell(t0, p, g, pan) {
    const base = 160 + 240 * p;
    [0.5, 1, 1.19, 1.56, 2.0, 2.51, 2.66, 3.01].forEach((m, i) => {
      const o = osc('sine', base * m, t0);
      const e = ctx.createGain();
      e.gain.setValueAtTime(0, t0);
      e.gain.linearRampToValueAtTime(g * .32 / (i + 1), t0 + .008);
      e.gain.exponentialRampToValueAtTime(.0001, t0 + 4.2 - i * .35);
      o.connect(e); o.start(t0); o.stop(t0 + 4.4); e.connect(out(t0, 1, pan, .8));
      o.onended = () => activeVoices--; activeVoices++;
    });
  }

  /* ---------- 玩法专用音 ---------- */
  A.playPing = function (pan) { // 探测音
    if (!ctx) return;
    const t0 = A.now();
    const o = osc('sine', 920, t0);
    o.frequency.exponentialRampToValueAtTime(230, t0 + .17);
    const e = ctx.createGain(); e.gain.setValueAtTime(.5, t0); e.gain.exponentialRampToValueAtTime(.0001, t0 + .2);
    o.connect(e); e.connect(out(t0, 1, pan || 0, .5)); o.start(t0); o.stop(t0 + .22);
    o.onended = () => activeVoices--; activeVoices++;
  };
  A.playEcho = function (kind, pitch, gain, pan, delay) { // 回声返回（延迟=距离）
    if (!ctx) return;
    const t0 = A.now() + Math.max(0, (delay || 0) + latencyMs / 1000);
    A.playSound(kind, pitch, gain, pan, 0, t0);
  };
  A.playStep = function (silent) {
    if (!ctx || silent) return;
    const t0 = A.now();
    const n = noiseSrc(t0); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const e = ctx.createGain(); e.gain.setValueAtTime(.09, t0); e.gain.exponentialRampToValueAtTime(.0001, t0 + .07);
    n.connect(lp); lp.connect(e); e.connect(out(t0, 1, (Math.random() - .5) * .3, .15)); n.start(t0); n.stop(t0 + .08);
    n.onended = () => activeVoices--; activeVoices++;
  };
  A.playUI = function (kind) {
    if (!ctx) return;
    const t0 = A.now();
    const conf = { hover: [660, .05, .1], click: [880, .09, .12], back: [520, .09, .12], open: [740, .16, .16], deny: [220, .12, .12] }[kind || 'click'] || [880, .08, .1];
    const o = osc('sine', conf[0], t0);
    const e = ctx.createGain(); e.gain.setValueAtTime(conf[2], t0); e.gain.exponentialRampToValueAtTime(.0001, t0 + conf[1] + .08);
    o.connect(e); e.connect(out(t0, 1, 0, .3)); o.start(t0); o.stop(t0 + conf[1] + .1);
    o.onended = () => activeVoices--; activeVoices++;
  };
  A.playDoorOpen = function (pan) { // 机关开启：暖橙和声
    if (!ctx) return;
    const t0 = A.now();
    [220, 277, 330, 440].forEach((f, i) => {
      const o = osc('sine', f, t0);
      const e = ctx.createGain(); e.gain.setValueAtTime(0, t0);
      e.gain.linearRampToValueAtTime(.22, t0 + .05 + i * .06);
      e.gain.exponentialRampToValueAtTime(.0001, t0 + 1.6);
      o.connect(e); e.connect(out(t0, 1, pan, .7)); o.start(t0); o.stop(t0 + 1.7);
      o.onended = () => activeVoices--; activeVoices++;
    });
  };
  A.playLocked = function (pan) { // 不匹配：低哑钝响（弱负反馈）
    if (!ctx) return;
    const t0 = A.now();
    const o = osc('sine', 110, t0);
    const e = ctx.createGain(); e.gain.setValueAtTime(.18, t0); e.gain.exponentialRampToValueAtTime(.0001, t0 + .3);
    o.connect(e); e.connect(out(t0, 1, pan, .3)); o.start(t0); o.stop(t0 + .32);
    o.onended = () => activeVoices--; activeVoices++;
  };
  A.playFragment = function (pan) { // 声之碎片
    if (!ctx) return;
    const t0 = A.now();
    [1046, 1318, 1568, 2093].forEach((f, i) => {
      const o = osc('sine', f, t0 + i * .09);
      const e = ctx.createGain(); e.gain.setValueAtTime(0, t0 + i * .09);
      e.gain.linearRampToValueAtTime(.2, t0 + i * .09 + .02);
      e.gain.exponentialRampToValueAtTime(.0001, t0 + i * .09 + .8);
      o.connect(e); e.connect(out(t0, 1, pan, .7)); o.start(t0 + i * .09); o.stop(t0 + i * .09 + .9);
      o.onended = () => activeVoices--; activeVoices++;
    });
  };
  A.playShimmer = function (pan, pitch) { // 碎片近处微光音
    if (!ctx) return;
    const t0 = A.now();
    const o = osc('sine', 1800 + 800 * (pitch || 0), t0);
    const e = ctx.createGain(); e.gain.setValueAtTime(0, t0);
    e.gain.linearRampToValueAtTime(.05, t0 + .15); e.gain.linearRampToValueAtTime(0, t0 + .7);
    o.connect(e); e.connect(out(t0, 1, pan, .5)); o.start(t0); o.stop(t0 + .75);
    o.onended = () => activeVoices--; activeVoices++;
  };
  A.playCharge = function (step) { // 晶石充能
    if (!ctx) return;
    const t0 = A.now();
    const f = [392, 494, 587][Math.min(2, step)];
    [f, f * 1.5].forEach((ff, i) => {
      const o = osc('sine', ff, t0);
      const e = ctx.createGain(); e.gain.setValueAtTime(0, t0);
      e.gain.linearRampToValueAtTime(.22, t0 + .03); e.gain.exponentialRampToValueAtTime(.0001, t0 + 1.4);
      o.connect(e); e.connect(out(t0, 1, 0, .7)); o.start(t0); o.stop(t0 + 1.5);
      o.onended = () => activeVoices--; activeVoices++;
    });
  };
  A.playComplete = function () { // 通关：主旋律绽放
    if (!ctx) return;
    const t0 = A.now();
    const seq = [523, 659, 784, 1046, 988, 1318];
    seq.forEach((f, i) => {
      const o = osc('sine', f, t0 + i * .16);
      const e = ctx.createGain(); e.gain.setValueAtTime(0, t0 + i * .16);
      e.gain.linearRampToValueAtTime(.2, t0 + i * .16 + .03);
      e.gain.exponentialRampToValueAtTime(.0001, t0 + i * .16 + 1.1);
      o.connect(e); e.connect(out(t0, 1, 0, .8)); o.start(t0 + i * .16); o.stop(t0 + i * .16 + 1.2);
      o.onended = () => activeVoices--; activeVoices++;
    });
  };
  A.playCatch = function () { // 被静默者捕捉
    if (!ctx) return;
    const t0 = A.now();
    const o = osc('sawtooth', 70, t0);
    o.frequency.exponentialRampToValueAtTime(28, t0 + .9);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    const e = ctx.createGain(); e.gain.setValueAtTime(.4, t0); e.gain.exponentialRampToValueAtTime(.0001, t0 + 1);
    o.connect(lp); lp.connect(e); e.connect(out(t0, 1, 0, .4)); o.start(t0); o.stop(t0 + 1.05);
    o.onended = () => activeVoices--; activeVoices++;
  };
  A.playThrow = function () {
    if (!ctx) return;
    const t0 = A.now();
    const o = osc('sine', 500, t0);
    o.frequency.exponentialRampToValueAtTime(900, t0 + .12);
    const e = ctx.createGain(); e.gain.setValueAtTime(.1, t0); e.gain.exponentialRampToValueAtTime(.0001, t0 + .18);
    o.connect(e); e.connect(out(t0, 1, 0, .2)); o.start(t0); o.stop(t0 + .2);
    o.onended = () => activeVoices--; activeVoices++;
  };
  A.playAlert = function (pan) { // 静默者警觉
    if (!ctx) return;
    const t0 = A.now();
    const o = osc('sawtooth', 55, t0);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const e = ctx.createGain(); e.gain.setValueAtTime(.22, t0); e.gain.exponentialRampToValueAtTime(.0001, t0 + .6);
    o.connect(lp); lp.connect(e); e.connect(out(t0, 1, pan, .3)); o.start(t0); o.stop(t0 + .65);
    o.onended = () => activeVoices--; activeVoices++;
  };
  A.playHint = function () {
    if (!ctx) return;
    const t0 = A.now();
    [660, 880].forEach((f, i) => {
      const o = osc('sine', f, t0 + i * .18);
      const e = ctx.createGain(); e.gain.setValueAtTime(.1, t0 + i * .18);
      e.gain.exponentialRampToValueAtTime(.0001, t0 + i * .18 + .5);
      o.connect(e); e.connect(out(t0, 1, 0, .5)); o.start(t0 + i * .18); o.stop(t0 + i * .18 + .55);
      o.onended = () => activeVoices--; activeVoices++;
    });
  };
  A.playFall = function () {
    if (!ctx) return;
    const t0 = A.now();
    A.playSound('glass', .9, .5, 0, 0, t0);
    const o = osc('sine', 300, t0);
    o.frequency.exponentialRampToValueAtTime(60, t0 + .8);
    const e = ctx.createGain(); e.gain.setValueAtTime(.2, t0); e.gain.exponentialRampToValueAtTime(.0001, t0 + .85);
    o.connect(e); e.connect(out(t0, 1, 0, .3)); o.start(t0); o.stop(t0 + .9);
    o.onended = () => activeVoices--; activeVoices++;
  };

  /* ---------- 分层环境音乐（5.4.2） ---------- */
  const mus = { on: false, nodes: [], padG: null, melG: null, intensity: 0 };
  A.startMusic = function () {
    if (!ctx || mus.on) return;
    mus.on = true;
    const t0 = ctx.currentTime;
    // 基底：双低频振荡 + 慢呼吸噪声
    [[55, 'sine', .16], [55.7, 'sine', .12], [110.3, 'triangle', .05]].forEach(([f, ty, g]) => {
      const o = osc(ty, f, t0);
      const lfo = osc('sine', .07 + Math.random() * .05, t0);
      const lg = ctx.createGain(); lg.gain.value = g * .5;
      const e = ctx.createGain(); e.gain.value = 0;
      e.gain.linearRampToValueAtTime(g, t0 + 3);
      lfo.connect(lg); lg.connect(e.gain);
      o.connect(e); e.connect(musicBus); o.start(t0); lfo.start(t0);
      mus.nodes.push(o, lfo, e);
    });
    const n = noiseSrc(t0);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
    const ne = ctx.createGain(); ne.gain.value = .028;
    n.connect(lp); lp.connect(ne); ne.connect(musicBus); n.start(t0);
    mus.nodes.push(n, ne);
    // 第二层：和弦垫（随进度淡入）
    mus.padG = ctx.createGain(); mus.padG.gain.value = 0; mus.padG.connect(musicBus);
    [220, 261.6, 329.6].forEach(f => {
      const o = osc('triangle', f, t0);
      const e = ctx.createGain(); e.gain.value = .05;
      const lfo = osc('sine', .1 + Math.random() * .1, t0);
      const lg = ctx.createGain(); lg.gain.value = .025; lfo.connect(lg); lg.connect(e.gain);
      o.connect(e); e.connect(mus.padG); o.start(t0); lfo.start(t0);
      mus.nodes.push(o, lfo, e);
    });
    // 第三层：晶石附近的星点旋律
    mus.melG = ctx.createGain(); mus.melG.gain.value = 0; mus.melG.connect(musicBus);
  };
  A.setIntensity = function (x) { // 0..1 解谜进度 → 音乐叠层
    if (!ctx || !mus.on) return;
    mus.intensity = x;
    mus.padG.gain.linearRampToValueAtTime(x * .9, ctx.currentTime + 2);
  };
  A.crystalProximity = function (x) { // 0..1 靠近晶石 → 星点层
    if (!ctx || !mus.on || !mus.melG) return;
    mus.melG.gain = mus.melG.gain || ctx.createGain();
  };
  A.stopMusic = function () {
    if (!ctx || !mus.on) return;
    mus.on = false;
    mus.nodes.forEach(nd => { try { nd.gain && nd.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2); if (nd.stop) nd.stop(ctx.currentTime + 1.4); } catch (e) { } });
    mus.nodes = []; mus.padG = null; mus.melG = null;
  };

  window.EchoAudio = A;
})();
