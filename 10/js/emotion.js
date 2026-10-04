/* ============================================================
   情绪花园 — 情绪解析引擎
   颜色（HSL 色轮）/ 文字（本地词典规则）/ 音乐（FFT 特征）
   三种输入 → { cat 主情绪, sub 次情绪, intensity 强度1-10,
                v 效价, a 唤醒度, confidence 置信度, matched 匹配明细 }
   ============================================================ */
window.EG = window.EG || {};

/* ---------- 颜色 → 情绪 ----------
   色相 → 情绪类别；饱和度 → 强度；明度 → 唤醒度修正 */
EG.HUE_TABLE = [
  { from: 0, to: 22, cat: 'anger' },      // 红 → 愤怒/热烈
  { from: 22, to: 68, cat: 'joy' },       // 暖橙金 → 喜悦
  { from: 68, to: 150, cat: 'calm' },     // 绿 → 平静自然
  { from: 150, to: 195, cat: 'calm' },    // 青 → 平静
  { from: 195, to: 258, cat: 'sad' },     // 蓝 → 悲伤/忧郁
  { from: 258, to: 305, cat: 'attach' },  // 紫 → 眷恋/怀念
  { from: 305, to: 345, cat: 'attach' },  // 紫红 → 温柔想念
  { from: 345, to: 360, cat: 'anger' },   // 绯红 → 愤怒
];

EG.rgbToHsl = function (r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
};
EG.hslStr = (h, s, l) => `hsl(${((h % 360) + 360) % 360},${EG.clamp(s, 0, 100)}%,${EG.clamp(l, 0, 100)}%)`;

EG.parseColor = function (h, s, l) {
  const seg = EG.HUE_TABLE.find(x => h >= x.from && h < x.to) || EG.HUE_TABLE[0];
  const cat = seg.cat;
  let intensity = Math.round(3 + (s / 100) * 7);
  if (l >= 82) intensity -= 1;       // 很淡 → 强度减弱
  if (l <= 22) intensity += 1;       // 很深 → 强度增强
  intensity = EG.clamp(intensity, 1, 10);
  const anchor = EG.EMOTIONS[cat];
  let a = anchor.a + (l - 50) / 100 * 0.8;  // 亮 → 唤醒升高，暗 → 降低
  a = EG.clamp(a, -1, 1);
  const sub = EG.EMO_LIST.filter(c => c !== cat)
    .sort((x, y) => Math.hypot(EG.EMOTIONS[x].v - anchor.v, EG.EMOTIONS[x].a - a) -
                    Math.hypot(EG.EMOTIONS[y].v - anchor.v, EG.EMOTIONS[y].a - a))[0];
  return { cat, sub, intensity, v: anchor.v, a, confidence: 0.8, matched: [{ w: `色相 ${Math.round(h)}°`, c: cat, s: 1 }] };
};

/* ---------- 文字 → 情绪 ----------
   本地词典 + 程度副词 + 否定词 + 表情/网络用语映射
   采用区间占用匹配：长词优先，互不重叠 */
EG.parseText = function (text) {
  const t = (text || '').trim();
  if (!t) return null;
  let wSum = 0, vSum = 0, aSum = 0, maxDeg = 1;
  const matched = [];
  const consumed = new Array(t.length).fill(false);
  const overlaps = (i, len) => {
    for (let k = i; k < i + len; k++) if (consumed[k]) return true;
    return false;
  };
  const mark = (i, len) => { for (let k = i; k < i + len; k++) consumed[k] = true; };
  /* 词典匹配：长词优先 */
  const words = EG.DICT.slice().sort((x, y) => y.w.length - x.w.length);
  for (const item of words) {
    let from = 0;
    while (true) {
      const idx = t.indexOf(item.w, from);
      if (idx === -1) break;
      from = idx + 1;
      if (overlaps(idx, item.w.length)) continue;
      const before = t.slice(Math.max(0, idx - 3), idx);
      let deg = 1;
      for (const d in EG.DEGREE) if (before.includes(d)) { deg = EG.DEGREE[d]; break; }
      const neg = EG.NEGATION.some(n => before.includes(n));
      let v = item.v * deg, a = item.a * deg, s = item.s * Math.max(1, deg * 0.8);
      if (neg) { v = -v * 0.85; a = a * 0.75; s *= 0.9; }
      wSum += s; vSum += v * s; aSum += a * s;
      maxDeg = Math.max(maxDeg, deg);
      matched.push({ w: (neg ? '¬' : '') + item.w, c: item.c, s: +s.toFixed(1) });
      mark(idx, item.w.length);
    }
  }
  /* 表情映射 */
  for (const e in EG.EMOJI_MAP) {
    let idx = t.indexOf(e);
    while (idx !== -1) {
      if (!overlaps(idx, e.length)) {
        const cnt = 1;
        const m = EG.EMOJI_MAP[e], s = m.s * Math.min(cnt, 3);
        wSum += s; vSum += m.v * s; aSum += m.a * s;
        matched.push({ w: e, c: m.c, s: +s.toFixed(1) });
        mark(idx, e.length);
      }
      idx = t.indexOf(e, idx + 1);
    }
  }
  /* 感叹号提升唤醒 */
  const bangs = (t.match(/[！!]/gu) || []).length;
  if (bangs && wSum > 0) { aSum += EG.clamp(bangs, 1, 3) * 0.25 * wSum; }
  if (wSum < 1) return { fail: true, matched };
  const v = EG.clamp(vSum / wSum, -1, 1);
  const a = EG.clamp(aSum / wSum, -1, 1);
  const ranked = EG.EMO_LIST.slice().sort((x, y) =>
    Math.hypot(EG.EMOTIONS[x].v - v, EG.EMOTIONS[x].a - a) -
    Math.hypot(EG.EMOTIONS[y].v - v, EG.EMOTIONS[y].a - a));
  const cat = ranked[0], sub = ranked[1];
  let base = 2 + Math.sqrt(wSum) * 1.35;
  if (maxDeg >= 1.8) base += 2; else if (maxDeg >= 1.5) base += 1.5; else if (maxDeg >= 1.25) base += 1;
  const intensity = EG.clamp(Math.round(base), 2, 10);
  const confidence = EG.clamp(0.45 + Math.min(wSum, 6) * 0.09, 0, 0.95);
  return { cat, sub, intensity, v, a, confidence, matched };
};

/* 跟随式提问兜底（两个二选一） */
EG.parseFallback = function (ansV, ansA) {
  const v = ansV, a = ansA;
  const ranked = EG.EMO_LIST.slice().sort((x, y) =>
    Math.hypot(EG.EMOTIONS[x].v - v, EG.EMOTIONS[x].a - a) -
    Math.hypot(EG.EMOTIONS[y].v - v, EG.EMOTIONS[y].a - a));
  return { cat: ranked[0], sub: ranked[1], intensity: 5, v, a, confidence: 0.6, matched: [{ w: '跟随式提问', c: ranked[0], s: 1 }] };
};

/* ---------- 音乐 → 情绪 ---------- */
/* 曲库点选：直接使用人工标注真值 */
EG.parseTrack = function (track) {
  const v = EG.clamp(track.bright * 1.2 - 0.35 + (track.energy - 0.4) * 0.25, -1, 1);
  const a = EG.clamp((track.bpm - 55) / 100 + (track.energy - 0.4) * 0.5, -1, 1);
  const cat = EG.nearestEmotion(v, a);
  return { cat, sub: EG.nearestEmotion(v, a, cat), intensity: EG.clamp(Math.round(3 + track.energy * 6), 2, 10), v, a, confidence: 0.95, matched: [{ w: `《${track.name}》${track.bpm}BPM`, c: cat, s: 1 }] };
};

EG.nearestEmotion = function (v, a, exclude) {
  return EG.EMO_LIST.filter(c => c !== exclude).sort((x, y) =>
    Math.hypot(EG.EMOTIONS[x].v - v, EG.EMOTIONS[x].a - a) -
    Math.hypot(EG.EMOTIONS[y].v - v, EG.EMOTIONS[y].a - a))[0];
};

/* 本地音频 FFT 分析
   提取：能量(RMS)、频谱亮centroid、节拍(BPM 估计) → 映射情绪坐标 */
EG.FFT = function (re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
};

EG.analyzeAudioBuffer = function (buf) {
  const sr = buf.sampleRate, ch = buf.numberOfChannels, len = buf.length;
  const data = [];
  for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  const N = 2048, winN = 16;
  let energySum = 0, brightSum = 0, eStd = 0;
  const energies = [], brights = [];
  const step = Math.max(1, Math.floor((len - N) / winN));
  const re = new Float32Array(N), im = new Float32Array(N);
  const hann = new Float32Array(N);
  for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  for (let w = 0; w < winN; w++) {
    const off = Math.min(len - N, w * step);
    if (off < 0) break;
    let rms = 0;
    for (let i = 0; i < N; i++) {
      let s = 0; for (let c = 0; c < ch; c++) s += data[c][off + i];
      s /= ch; re[i] = s * hann[i]; im[i] = 0; rms += s * s;
    }
    rms = Math.sqrt(rms / N);
    EG.FFT(re, im);
    let num = 0, den = 0;
    for (let i = 1; i < N / 2; i++) { const mag = Math.hypot(re[i], im[i]); num += i * mag; den += mag; }
    const centroid = den > 0 ? (num / den) / (N / 2) : 0;
    energies.push(rms); brights.push(centroid);
    energySum += rms; brightSum += centroid;
  }
  const energy = winN ? energySum / winN : 0, bright = winN ? brightSum / winN : 0;
  for (const e of energies) eStd += (e - energy) * (e - energy);
  eStd = winN ? Math.sqrt(eStd / winN) : 0;

  /* 节拍：能量包络自相关 */
  const hop = 1024, frames = Math.floor(len / hop);
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0; const o = f * hop;
    for (let i = 0; i < hop; i += 4) { for (let c = 0; c < ch; c++) s += data[c][o + i] * data[c][o + i]; }
    env[f] = Math.sqrt(s / (hop / 4 * ch));
  }
  let mean = 0; for (let f = 0; f < frames; f++) mean += env[f]; mean /= Math.max(1, frames);
  for (let f = 0; f < frames; f++) env[f] = Math.max(0, env[f] - mean);
  const fps = sr / hop;
  const minLag = Math.max(2, Math.floor(fps * 60 / 190)), maxLag = Math.min(frames - 1, Math.ceil(fps * 60 / 50));
  let bestLag = 0, bestVal = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0; for (let f = 0; f + lag < frames; f++) s += env[f] * env[f + lag];
    s /= (frames - lag);
    if (s > bestVal) { bestVal = s; bestLag = lag; }
  }
  const bpm = bestLag ? EG.clamp(Math.round(60 * fps / bestLag), 50, 190) : 90;
  const beatStrength = mean > 1e-5 ? EG.clamp(bestVal / (mean * mean * frames) * 40, 0, 1) : 0;

  /* 特征 → 情绪坐标 */
  const energyN = EG.clamp(energy * 2.4, 0, 1);
  const brightN = EG.clamp(bright / 0.30, 0, 1);
  const tempoN = EG.clamp((bpm - 55) / 110, 0, 1);
  const a = EG.clamp(0.18 + energyN * 0.38 + tempoN * 0.30 + brightN * 0.18 - 0.12, -1, 1);
  const v = EG.clamp(-0.28 + brightN * 0.85 + tempoN * 0.25 - (1 - beatStrength) * 0.12, -1, 1);
  const cat = EG.nearestEmotion(v, a);
  const consistency = energy > 1e-4 ? EG.clamp(1 - eStd / (energy + 0.02), 0, 1) : 0.3;
  const confidence = EG.clamp(0.4 + consistency * 0.35 + (beatStrength > 0.3 ? 0.15 : 0), 0, 0.9);
  return {
    cat, sub: EG.nearestEmotion(v, a, cat), v, a,
    intensity: EG.clamp(Math.round(2 + energyN * 5 + tempoN * 3), 2, 10),
    confidence,
    matched: [{ w: `${bpm} BPM · 频谱${brightN > 0.55 ? '明亮' : brightN > 0.3 ? '适中' : '低沉'}`, c: cat, s: 1 }],
    features: { bpm, energyN, brightN, tempoN },
  };
};
