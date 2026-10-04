/* 星穹拓荒 — WebAudio 程序化音效（无外部资源，警示动机为双音程） */
window.SF = window.SF || {};
SF.audio = (function () {
  'use strict';
  let ctx = null, master = null, ambient = null, enabled = true;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
  }

  function tone(freq, dur, type, vol, slide) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, vol, freq) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime, len = ctx.sampleRate * dur;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 800;
    const g = ctx.createGain(); g.gain.value = vol || 0.2;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  const api = {
    init,
    setEnabled(v) { enabled = v; if (master) master.gain.value = v ? 0.5 : 0; },
    click() { tone(720, 0.06, 'triangle', 0.07); },
    err() { tone(180, 0.15, 'square', 0.06); tone(140, 0.18, 'square', 0.05); },
    build() { tone(320, 0.12, 'triangle', 0.1); tone(480, 0.14, 'triangle', 0.08); },
    done() { tone(620, 0.1, 'sine', 0.09); tone(930, 0.16, 'sine', 0.08); },
    tech() { tone(520, 0.09, 'sine', 0.08); setTimeout(() => tone(780, 0.12, 'sine', 0.07), 70); },
    /** 双音程警示动机：形成条件反射 */
    alarm() { tone(660, 0.16, 'square', 0.055); setTimeout(() => tone(494, 0.22, 'square', 0.055), 170); },
    crisis() { tone(880, 0.13, 'sawtooth', 0.06); setTimeout(() => tone(622, 0.2, 'sawtooth', 0.06), 140); },
    boom() { noise(0.5, 0.3, 420); tone(90, 0.4, 'sine', 0.16, 40); },
    hit() { noise(0.12, 0.12, 1400); },
    shoot() { tone(1150, 0.05, 'square', 0.03, 500); },
    good() { tone(523, 0.1, 'sine', 0.08); setTimeout(() => tone(659, 0.1, 'sine', 0.08), 90); setTimeout(() => tone(784, 0.18, 'sine', 0.08), 180); },
    death() { tone(220, 0.6, 'sawtooth', 0.1, 55); },
    warp() {
      if (!ctx || !enabled) return;
      tone(180, 1.6, 'sawtooth', 0.07, 1400);
      tone(120, 1.8, 'sine', 0.09, 900);
    },
    /** 环境底噪：低频机械嗡鸣 */
    startAmbient() {
      if (!ctx || ambient) return;
      const g = ctx.createGain(); g.gain.value = 0.0;
      g.connect(master);
      const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 55.7;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160;
      o1.connect(f); o2.connect(f); f.connect(g);
      o1.start(); o2.start();
      g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 3);
      ambient = { g, o1, o2 };
    },
    stopAmbient() {
      if (!ambient) return;
      try {
        ambient.g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
        const a = ambient; setTimeout(() => { try { a.o1.stop(); a.o2.stop(); } catch (e) {} }, 900);
      } catch (e) {}
      ambient = null;
    },
  };
  return api;
})();
