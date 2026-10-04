'use strict';
// ============ WebAudio 合成音效(无外部资源) ============
const Sfx = {
  ctx: null, master: null, enabled: true, _last: {},
  ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.38;
        this.master.connect(this.ctx.destination);
      } catch (e) { /* 无音频环境时静默降级 */ }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(freq, dur, type = 'square', vol = 0.15, slide = 0, delay = 0) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(30, freq), t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },
  noise(dur = 0.1, vol = 0.15, freq = 1000, delay = 0) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  },
  play(name) {
    if (!this.enabled || !this.ctx) return;
    const now = performance.now();
    if (this._last[name] && now - this._last[name] < 45) return; // 同名音效节流
    this._last[name] = now;
    const S = this;
    switch (name) {
      case 'shoot': S.tone(520 + Math.random() * 80, 0.07, 'square', 0.05, -200); break;
      case 'shootHeavy': S.tone(210, 0.13, 'sawtooth', 0.08, -60); break;
      case 'shootWave': S.tone(320, 0.16, 'sawtooth', 0.07, 140); break;
      case 'hit': S.noise(0.05, 0.07, 1900); break;
      case 'crit': S.tone(880, 0.09, 'square', 0.07, 520); break;
      case 'kill': S.noise(0.12, 0.11, 900); S.tone(150, 0.15, 'triangle', 0.09, -70); break;
      case 'coin': S.tone(988, 0.05, 'square', 0.045); S.tone(1319, 0.08, 'square', 0.045, 0, 0.05); break;
      case 'potion': S.tone(392, 0.1, 'sine', 0.09); S.tone(587, 0.15, 'sine', 0.09, 0, 0.08); break;
      case 'hurt': S.tone(160, 0.2, 'sawtooth', 0.15, -70); S.noise(0.1, 0.09, 500); break;
      case 'dash': S.noise(0.12, 0.08, 2600); break;
      case 'level': [523, 659, 784, 1047].forEach((f, i) => S.tone(f, 0.15, 'triangle', 0.08, 0, i * 0.07)); break;
      case 'bless': S.tone(659, 0.22, 'sine', 0.09); S.tone(988, 0.28, 'sine', 0.07, 0, 0.1); break;
      case 'door': S.tone(120, 0.25, 'triangle', 0.13, 40); S.noise(0.2, 0.07, 300); break;
      case 'boss': S.tone(82, 0.9, 'sawtooth', 0.18, -22); S.tone(60, 1.1, 'square', 0.13, -10, 0.12); break;
      case 'explode': S.noise(0.35, 0.2, 700); S.tone(72, 0.3, 'sine', 0.15, -30); break;
      case 'zap': S.tone(1500, 0.08, 'square', 0.06, -1200); break;
      case 'pick': S.tone(740, 0.09, 'triangle', 0.08, 240); break;
      case 'ui': S.tone(660, 0.045, 'square', 0.045); break;
      case 'fuse': S.tone(440, 0.1, 'triangle', 0.08); S.tone(660, 0.12, 'triangle', 0.08, 0, 0.09); break;
      case 'shield': S.tone(300, 0.22, 'sine', 0.09, 160); break;
      case 'freeze': S.tone(1200, 0.12, 'sine', 0.06, -700); break;
      case 'stairs': S.tone(330, 0.15, 'triangle', 0.1); S.tone(494, 0.2, 'triangle', 0.1, 0, 0.12); break;
      case 'revive': [392, 523, 659, 784, 1047].forEach((f, i) => S.tone(f, 0.18, 'sine', 0.09, 0, i * 0.06)); break;
    }
  },
};
