/* ============================================================
   情绪花园 — 数据层
   情绪模型（效价-唤醒度）、24 种情绪植物、情绪词典、
   曲库、花盆/道具/装饰、生态事件、成就、心灵旅程
   ============================================================ */
window.EG = window.EG || {};

EG.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
EG.lerp = (a, b, t) => a + (b - a) * t;
EG.rand = (a, b) => a + Math.random() * (b - a);
EG.iri = (a, b) => Math.floor(EG.rand(a, b + 1));
EG.pick = arr => arr[Math.floor(Math.random() * arr.length)];

/* ---------- 工具：日期 ---------- */
EG.dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
EG.monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
EG.hhmm = ts => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/* ---------- 情绪模型 ----------
   valence 效价(-1~1 快活↔低落)  arousal 唤醒度(-1~1 激昂↔平静) */
EG.EMOTIONS = {
  joy:     { name: '喜悦', color: '#F2A93B', symbol: '●', v: 0.85, a: 0.65, eco: { sun: 6,  hum: -2, fer: 0,  har: 3  }, inst: 'triangle', timbre: '木琴', quote: '阳光落在花瓣上的声音，你听见了吗？' },
  calm:    { name: '平静', color: '#6FA8C9', symbol: '〜', v: 0.55, a: -0.75, eco: { sun: 0,  hum: 1,  fer: 2,  har: 8  }, inst: 'sine',     timbre: '长笛', quote: '湖水不语，却映得下整片天空。' },
  sad:     { name: '悲伤', color: '#8D7BB5', symbol: '▽', v: -0.75, a: -0.45, eco: { sun: -4, hum: 7,  fer: 1,  har: 0  }, inst: 'sawtooth', timbre: '大提琴', quote: '眼泪浇灌的土地，会开出很柔软的花。' },
  anger:   { name: '愤怒', color: '#D9534F', symbol: '▲', v: -0.85, a: 0.75, eco: { sun: 9,  hum: -6, fer: 0,  har: -3 }, inst: 'square',   timbre: '低音鼓', quote: '火也是生命力的一种，让它被看见就好。' },
  anxiety: { name: '焦虑', color: '#7C8C6F', symbol: '✳', v: -0.5, a: 0.6,  eco: { sun: 1,  hum: 3,  fer: -1, har: -5 }, inst: 'sawtooth', timbre: '拨弦', quote: '雾会散的。在雾里，也请慢慢走。' },
  attach:  { name: '眷恋', color: '#B9AFA6', symbol: '☾', v: 0.15, a: -0.35, eco: { sun: -1, hum: 1,  fer: 6,  har: 4  }, inst: 'sine',     timbre: '竖琴', quote: '记得，就是最温柔的想念。' },
};
EG.EMO_LIST = ['joy', 'calm', 'sad', 'anger', 'anxiety', 'attach'];

/* 颜色选色后的 8 个候选校准词条 */
EG.COLOR_WORDS = [
  { t: '心花怒放', cat: 'joy', it: 9 }, { t: '明亮又雀跃', cat: 'joy', it: 7 },
  { t: '平静如水', cat: 'calm', it: 5 }, { t: '有点忧郁', cat: 'sad', it: 4 },
  { t: '温柔的想念', cat: 'attach', it: 5 }, { t: '烦躁上火', cat: 'anger', it: 7 },
  { t: '静不下来', cat: 'anxiety', it: 6 }, { t: '淡淡的一天', cat: 'calm', it: 2 },
];

/* 文字解析兜底的跟随式提问 */
EG.FALLBACK_Q = [
  { q: '这种感觉，更偏向哪一边呢？', opts: [{ t: '温暖愉悦', v: 0.7 }, { t: '低落沉重', v: -0.7 }] },
  { q: '身体的感觉更接近？', opts: [{ t: '安静舒缓', a: -0.6 }, { t: '紧绷激动', a: 0.6 }] },
];

/* ---------- 情绪植物库（6 系 × 4 种 = 24）----------
   shape: flower 花朵 / bell 铃铛 / cluster 簇团 / spike 穗序 /
          rosette 莲座 / spathe 佛焰 / vine 藤蔓 / feather 羽叶
   pref: 喜光 bright / 喜柔 soft / 喜阴 dim */
function P(id, emo, name, o) {
  return Object.assign({
    id, emo, name, hours: 10, pref: 'soft', shape: 'flower',
    petals: 8, petalW: 0.5, layers: 1, hue: 40, sat: 75, lit: 62,
    stemH: 50, stemBend: 10, leaves: 3, size: 1, thorn: 0, glow: 0,
    rare: 0, desc: '',
  }, o);
}
EG.PLANTS = [
  /* 喜悦系 */
  P('joy_sun', 'joy', '向阳金盏', { hue: 36, sat: 88, petals: 14, petalW: 0.34, stemH: 52, leaves: 4, hours: 8, pref: 'bright', desc: '花盘始终朝着光的方向，像一句不设防的问候。' }),
  P('joy_bell', 'joy', '金铃爆仗', { hue: 46, sat: 92, shape: 'bell', petals: 6, stemH: 62, leaves: 3, hours: 12, pref: 'bright', desc: '一串小金铃，风一过就笑出声。' }),
  P('joy_daisy', 'joy', '蜜语雏菊', { hue: 52, sat: 80, petals: 20, petalW: 0.22, stemH: 40, leaves: 3, hours: 5, pref: 'bright', rare: 0, desc: '一小朵一小朵的秘密，都是甜的。' }),
  P('joy_tulip', 'joy', '礼花郁金香', { hue: 24, sat: 90, petals: 6, petalW: 0.9, stemH: 58, hours: 16, pref: 'soft', desc: '把喜事卷成杯状，敬今天一杯。' }),
  /* 平静系 */
  P('calm_bell', 'calm', '宁湖蓝铃', { hue: 205, sat: 52, lit: 64, shape: 'bell', petals: 5, stemH: 46, hours: 8, pref: 'soft', desc: '湖边的一串风铃，摇一下，心就静半拍。' }),
  P('calm_mint', 'calm', '静水薄荷', { hue: 165, sat: 45, lit: 58, petals: 4, petalW: 0.3, stemH: 36, leaves: 5, hours: 5, pref: 'soft', desc: '凉凉的一株，呼吸都变得干净。' }),
  P('calm_lily', 'calm', '月湾睡莲', { hue: 190, sat: 40, lit: 70, petals: 10, petalW: 0.55, stemH: 22, leaves: 2, hours: 12, pref: 'bright', size: 1.15, desc: '贴着水面做梦，梦见整个月亮。' }),
  P('calm_sage', 'calm', '雾波鼠尾草', { hue: 200, sat: 30, lit: 60, shape: 'spike', petals: 16, stemH: 58, hours: 16, pref: 'bright', desc: '雾一样的穗子，挠得心尖很轻。' }),
  /* 悲伤系 */
  P('sad_iris', 'sad', '泪雨鸢尾', { hue: 272, sat: 38, lit: 62, petals: 9, petalW: 0.42, stemH: 54, hours: 10, pref: 'dim', droop: 1, desc: '每一片花瓣都接住过一滴雨。' }),
  P('sad_hyacinth', 'sad', '雾紫风信子', { hue: 280, sat: 40, lit: 58, shape: 'cluster', petals: 26, stemH: 44, hours: 14, pref: 'dim', desc: '把许多小难过抱成一团，也能很香。' }),
  P('sad_crab', 'sad', '垂丝海棠', { hue: 318, sat: 45, lit: 68, shape: 'cluster', petals: 12, stemH: 66, stemBend: 18, hours: 18, pref: 'soft', droop: 1, size: 1.1, desc: '花开向下的树，把心事垂给土壤听。' }),
  P('sad_forget', 'sad', '雨痕勿忘我', { hue: 255, sat: 34, lit: 62, shape: 'cluster', petals: 10, stemH: 34, hours: 6, pref: 'dim', desc: '小小的，记性却很好。' }),
  /* 愤怒系 */
  P('anger_agave', 'anger', '焰刺龙舌兰', { hue: 12, sat: 62, lit: 52, shape: 'rosette', petals: 12, stemH: 14, thorn: 1, hours: 20, pref: 'bright', size: 1.1, desc: '带着刺与雾的美。它不是坏脾气，是没被听见的话。' }),
  P('anger_canna', 'anger', '赤焰美人蕉', { hue: 8, sat: 78, lit: 55, petals: 5, petalW: 0.85, stemH: 70, leaves: 4, hours: 16, pref: 'bright', desc: '烧得漂亮，也烧得认真。' }),
  P('anger_painter', 'anger', '灼风红掌', { hue: 4, sat: 80, lit: 56, shape: 'spathe', petals: 1, stemH: 38, hours: 10, pref: 'dim', desc: '一团不肯熄的小火苗，掌心向上。' }),
  P('anger_tail', 'anger', '怒火凤尾', { hue: 20, sat: 82, lit: 58, shape: 'feather', petals: 18, stemH: 58, hours: 22, pref: 'bright', desc: '火苗蹿成凤尾的样子，其实挺壮观。' }),
  /* 焦虑系 */
  P('anx_vine', 'anxiety', '雾蔓藤', { hue: 100, sat: 24, lit: 52, shape: 'vine', petals: 7, stemH: 46, hours: 12, pref: 'dim', mist: 1, desc: '绕来绕去的藤，其实只是想找地方安心。' }),
  P('anx_ball', 'anxiety', '乱针绣球', { hue: 95, sat: 26, lit: 60, shape: 'cluster', petals: 34, stemH: 48, hours: 18, pref: 'soft', mist: 1, desc: '一团理不清的线球，绣着许多没说出口的担心。' }),
  P('anx_nettle', 'anxiety', '心弦荨麻', { hue: 105, sat: 22, lit: 48, petals: 5, petalW: 0.3, stemH: 40, thorn: 1, hours: 8, pref: 'dim', mist: 1, desc: '碰一下就发麻的植物，和心跳同一个频率。' }),
  P('anx_mimosa', 'anxiety', '薄暮含羞草', { hue: 92, sat: 28, lit: 56, shape: 'feather', petals: 14, stemH: 30, hours: 6, pref: 'soft', mist: 1, desc: '一被注视就合拢叶子，其实它一直在认真听。' }),
  /* 眷恋系 */
  P('att_rose', 'attach', '月影蔷薇', { hue: 348, sat: 26, lit: 78, petals: 24, petalW: 0.5, layers: 3, stemH: 54, thorn: 1, hours: 20, pref: 'soft', glow: 1, desc: '月光洗过的蔷薇，替你记着一个人。' }),
  P('att_lily', 'attach', '旧信铃兰', { hue: 70, sat: 18, lit: 84, shape: 'bell', petals: 8, stemH: 32, hours: 10, pref: 'dim', glow: 1, desc: '像一封没寄出的信，字迹被时间泡得很软。' }),
  P('att_star', 'attach', '星忆满天星', { hue: 48, sat: 30, lit: 82, shape: 'cluster', petals: 30, stemH: 46, hours: 14, pref: 'bright', glow: 1, desc: '把回忆撒成一小片星空。' }),
  P('att_branch', 'attach', '故园桂枝', { hue: 66, sat: 30, lit: 66, shape: 'spike', petals: 20, stemH: 60, stemBend: 16, hours: 24, pref: 'soft', size: 1.15, glow: 1, desc: '从故乡飘来的一枝，香得很旧、很暖。' }),
];
EG.PLANT_BY_ID = {};
EG.PLANTS.forEach(p => EG.PLANT_BY_ID[p.id] = p);

/* 变异形态 */
EG.VARIANTS = [
  { id: 0, name: '本形', desc: '最初的模样' },
  { id: 1, name: '重瓣', desc: '强度 ≥8 时有几率绽放出更繁复的花' },
  { id: 2, name: '星辉', desc: '星光肥料或 5% 的幸运让它染上星光' },
];

/* 生长阶段 */
EG.STAGES = ['种子', '幼苗', '成株', '含苞', '绽放'];
EG.stageOf = g => g <= 20 ? 0 : g <= 40 ? 1 : g <= 60 ? 2 : g <= 80 ? 3 : 4;

/* ---------- 情绪词典（本地规则解析用）----------
   w: 词语  c: 情绪类  v: 效价  a: 唤醒  s: 权重 */
(function () {
  const W = (c, v, a, s, ...ws) => ws.map(w => ({ w, c, v, a, s }));
  EG.DICT = [].concat(
    W('joy', 0.8, 0.6, 1.5, '开心', '高兴', '快乐', '欢喜', '愉快', '开心死了'),
    W('joy', 0.9, 0.6, 1.6, '幸福', '喜悦', '甜美'),
    W('joy', 0.8, 0.9, 1.6, '兴奋', '激动', '惊喜', '雀跃'),
    W('joy', 0.7, 0.7, 1.3, '期待', '心动', '上头', '热血'),
    W('joy', 0.7, 0.3, 1.3, '满足', '充实', '自豪', '感动', '暖暖'),
    W('joy', 0.8, 0.7, 2.0, '哈哈哈', '哈哈哈哈', '笑死'),
    W('joy', 0.6, 0.6, 1.2, '哈哈', '嘿嘿', '嘻嘻'),
    W('joy', 0.8, 0.8, 1.8, '绝了', 'yyds', '芜湖', '起飞'),
    W('calm', 0.7, -0.8, 1.5, '平静', '宁静', '安宁静好', '静谧'),
    W('calm', 0.6, -0.7, 1.3, '放松', '舒服', '惬意', '安心', '踏实', '治愈', '疗愈'),
    W('calm', 0.5, -0.5, 1.2, '淡然', '从容', '佛系', '躺平', '摸鱼', '充电', '回血'),
    W('calm', 0.2, -0.7, 1.2, '困', '困了', '睡意', '犯困', '懒洋洋'),
    W('sad', -0.8, -0.4, 1.6, '难过', '伤心', '悲伤', '悲痛'),
    W('sad', -0.7, -0.4, 1.4, '沮丧', '失落', '孤独', '寂寞', '委屈', '心酸'),
    W('sad', -0.6, -0.3, 1.3, '难受', '低落', '压抑', '郁闷', '心累'),
    W('sad', -0.8, -0.4, 1.6, '抑郁', '绝望', '想哭', '眼泪', '哭'),
    W('sad', -0.6, -0.3, 1.8, '泪目', '破防', '破大防', '呜呜', '呜呜呜', 'emo', 'emo了', '蚌埠住', '绷不住'),
    W('sad', -0.5, -0.3, 1.2, '下头', '摆烂', '寄', '麻了', '累'),
    W('attach', 0.1, -0.5, 1.5, '想念', '思念', '怀念', '眷恋'),
    W('attach', 0.3, -0.4, 1.3, '舍不得', '依依不舍', '回忆', '旧时光', '温柔', '牵挂'),
    W('anger', -0.8, 0.7, 1.6, '生气', '愤怒', '恼火', '气愤', '暴躁'),
    W('anger', -0.9, 0.9, 1.8, '气死', '怒了', '暴怒', '火大'),
    W('anger', -0.6, 0.6, 1.3, '烦', '烦人', '讨厌', '无语', '服了', '不公'),
    W('anxiety', -0.7, 0.7, 1.6, '焦虑', '不安', '心慌', '慌', '慌张', '烦躁'),
    W('anxiety', -0.6, 0.8, 1.5, '紧张', '害怕', '恐惧', '惊恐', '崩溃', '社死', '救命'),
    W('anxiety', -0.5, 0.6, 1.3, '担心', '压力', '内耗', '内卷', '卷'),
    W('anxiety', -0.5, 0.5, 1.2, '迷茫', '纠结', '无所适从', '坐立不安', '手足无措'),
  );
  EG.DEGREE = { '特别': 1.6, '非常': 1.6, '超级': 1.7, '超': 1.5, '很': 1.3, '太': 1.6, '真的': 1.3, '好': 1.2, '十分': 1.5, '极其': 1.9, '极度': 2.0, '无比': 1.8, '万分': 1.9, '有点': 0.6, '有点儿': 0.6, '稍微': 0.5, '略': 0.5, '挺': 1.1, '死了': 1.8, '疯了': 1.8, '爆了': 1.7 };
  EG.NEGATION = ['不', '没', '没有', '别', '无', '未'];
  EG.EMOJI_MAP = {
    '😂': { c: 'joy', v: 0.8, a: 0.8, s: 2 }, '🤣': { c: 'joy', v: 0.8, a: 0.8, s: 2 },
    '😊': { c: 'joy', v: 0.7, a: 0.2, s: 1.5 }, '🥰': { c: 'joy', v: 0.8, a: 0.4, s: 2 },
    '😃': { c: 'joy', v: 0.8, a: 0.7, s: 1.8 }, '🎉': { c: 'joy', v: 0.8, a: 0.8, s: 1.8 },
    '😭': { c: 'sad', v: -0.7, a: -0.1, s: 2 }, '😢': { c: 'sad', v: -0.7, a: 0, s: 1.8 },
    '😔': { c: 'sad', v: -0.6, a: -0.3, s: 1.5 }, '💔': { c: 'sad', v: -0.8, a: -0.2, s: 1.8 },
    '😡': { c: 'anger', v: -0.8, a: 0.8, s: 2 }, '🤬': { c: 'anger', v: -0.9, a: 0.9, s: 2 },
    '😤': { c: 'anger', v: -0.6, a: 0.6, s: 1.5 },
    '😰': { c: 'anxiety', v: -0.6, a: 0.7, s: 1.8 }, '😱': { c: 'anxiety', v: -0.6, a: 0.8, s: 1.8 },
    '🥺': { c: 'attach', v: 0.1, a: -0.1, s: 1.5 }, '🥹': { c: 'attach', v: 0.2, a: 0, s: 1.5 },
    '😌': { c: 'calm', v: 0.6, a: -0.6, s: 1.5 }, '😴': { c: 'calm', v: 0.2, a: -0.8, s: 1.3 },
    '💤': { c: 'calm', v: 0.2, a: -0.8, s: 1.2 }, '💀': { c: 'sad', v: -0.4, a: 0.3, s: 1.3 },
  };
})();

/* ---------- 内置曲库（12 首，程序化合成的情绪片段）---------- */
EG.MUSIC_LIB = [
  { id: 'm1', name: '晨光微澜', bpm: 72, bright: 0.62, energy: 0.30, desc: '长笛与风铃，像湖面第一道光', root: 0, scale: 'penta', inst: 'sine' },
  { id: 'm2', name: '午后柠檬茶', bpm: 96, bright: 0.70, energy: 0.45, desc: '轻快的木琴，气泡在杯壁打转', root: 2, scale: 'major', inst: 'triangle' },
  { id: 'm3', name: '雨夜电台', bpm: 64, bright: 0.28, energy: 0.25, desc: '大提琴的低语，窗外落着小雨', root: -3, scale: 'minor', inst: 'sawtooth' },
  { id: 'm4', name: '心跳鼓点', bpm: 132, bright: 0.55, energy: 0.85, desc: '低音鼓与失真弦乐，烧起来', root: 0, scale: 'minor', inst: 'square' },
  { id: 'm5', name: '旧磁带', bpm: 70, bright: 0.35, energy: 0.28, desc: '带一点噪点的怀念', root: -5, scale: 'minor', inst: 'sine' },
  { id: 'm6', name: '薄雾快车', bpm: 118, bright: 0.50, energy: 0.62, desc: '高频拨弦，停不下来的赶路', root: -1, scale: 'minor', inst: 'sawtooth' },
  { id: 'm7', name: '月台之后', bpm: 60, bright: 0.40, energy: 0.22, desc: '竖琴慢速，站台灯还亮着', root: -5, scale: 'penta', inst: 'sine' },
  { id: 'm8', name: '盛夏野餐', bpm: 108, bright: 0.78, energy: 0.60, desc: '明亮欢快，风把野餐布吹起来', root: 4, scale: 'major', inst: 'triangle' },
  { id: 'm9', name: '深海呼吸', bpm: 54, bright: 0.20, energy: 0.18, desc: '极慢的长音，适合沉下去休息', root: -7, scale: 'minor', inst: 'sine' },
  { id: 'm10', name: '烟花星期五', bpm: 126, bright: 0.80, energy: 0.75, desc: '蹦蹦跳跳的喜悦，值得庆祝', root: 5, scale: 'major', inst: 'triangle' },
  { id: 'm11', name: '期末前夜', bpm: 112, bright: 0.45, energy: 0.68, desc: '嗡嗡作响的紧张感', root: -2, scale: 'minor', inst: 'square' },
  { id: 'm12', name: '晚安摇篮曲', bpm: 66, bright: 0.55, energy: 0.20, desc: '轻轻晃，安心睡', root: 0, scale: 'penta', inst: 'sine' },
];

/* ---------- 花盆 ---------- */
function PT(id, name, price, o) { return Object.assign({ id, name, price, body: '#C98D5E', rim: '#B47A4C', shape: 'bowl', pattern: 'none' }, o); }
EG.POTS = [
  PT('pot_terra', '素陶盆', 0, { desc: '最朴素的开始' }),
  PT('pot_wood', '木桶盆', 25, { body: '#9C6B43', rim: '#7E5535', shape: 'barrel', desc: '有年轮的呼吸' }),
  PT('pot_moss', '苔纹陶盆', 35, { body: '#8FA06B', rim: '#75854F', pattern: 'moss', desc: '时间让它长出青苔' }),
  PT('pot_rock', '岩石盆', 30, { body: '#9A968C', rim: '#7E7A70', shape: 'rock', desc: '稳重得像一句承诺' }),
  PT('pot_honey', '蜂蜜罐', 28, { body: '#E0A84E', rim: '#C68F3C', shape: 'jar', pattern: 'honey', desc: '甜味还剩一点点' }),
  PT('pot_celadon', '青瓷盆', 45, { body: '#A8CBBE', rim: '#8FB3A6', shape: 'bowl', pattern: 'crackle', desc: '开片纹里藏着湖光' }),
  PT('pot_cloud', '云纹盆', 45, { body: '#D8D3E8', rim: '#BCB5D6', pattern: 'cloud', desc: '把云栽在土里' }),
  PT('pot_stone', '雨花石盆', 50, { body: '#C7B9A5', rim: '#A99B87', pattern: 'pebble', desc: '每颗石子都来自河的回忆' }),
  PT('pot_star', '星砂玻璃盆', 60, { body: '#BFD8E8', rim: '#9FBFD4', shape: 'jar', pattern: 'star', glow: 1, desc: '透明的心事，看得见' }),
  PT('pot_sakura', '樱纹盆', 55, { body: '#F2D4DC', rim: '#DDB4C0', pattern: 'sakura', desc: '春天落进去了一瓣' }),
  PT('pot_moon', '月光盆', 80, { body: '#EAE7E0', rim: '#CFC9BC', shape: 'rock', pattern: 'moon', glow: 1, desc: '月光凝成的陶土' }),
  PT('pot_ink', '墨玉盆', 90, { body: '#4E5A52', rim: '#37413B', shape: 'bowl', pattern: 'ink', glow: 1, desc: '墨色深处有一点微光' }),
];
EG.POT_BY_ID = {}; EG.POTS.forEach(p => EG.POT_BY_ID[p.id] = p);

/* ---------- 道具 ---------- */
EG.ITEMS = [
  { id: 'dew', name: '平静露珠', price: 30, icon: '💧', desc: '3 小时内新种子成长 +20%', use: 'buff_growth' },
  { id: 'honey_fruit', name: '蜜糖果实', price: 25, icon: '🍯', desc: '为植物清除全部萎靡', use: 'heal' },
  { id: 'spray', name: '记忆喷雾', price: 15, icon: '🌫️', desc: '把凋谢的植物恢复为纪念种子', use: 'restore' },
  { id: 'starfer', name: '星光肥料', price: 25, icon: '✨', desc: '有几率催生「星辉」变异', use: 'mutate' },
];

/* ---------- 装饰（天空与氛围特效）---------- */
EG.DECORS = [
  { id: 'deco_aurora', name: '极光帘', price: 120, icon: '🌌', desc: '夜空中垂下缓慢流动的极光' },
  { id: 'deco_meteor', name: '流星雨', price: 150, icon: '🌠', desc: '偶尔划过一颗许愿的流星' },
  { id: 'deco_windbell', name: '风铃架', price: 90, icon: '🎐', desc: '花园角落多一串轻响' },
  { id: 'deco_glow', name: '萤光菌灯', price: 70, icon: '🍄', desc: '夜间亮起柔和的小灯' },
];

/* ---------- 生态事件 ---------- */
EG.EVENTS = [
  { id: 'ev_star', name: '晚风与星火', icon: '✨', cond: g => g.eco.har >= 75, hours: 3, desc: '晚风穿过花园，植物们窃窃私语，成长 +25%', fx: { growth: 1.25 }, reward: 30 },
  { id: 'ev_rain', name: '阴雨连绵', icon: '🌧️', cond: g => g.eco.sun <= 20, hours: 4, desc: '雨水代替你浇灌了每一株植物', fx: { growth: 0.8, autoWater: true }, reward: 0 },
  { id: 'ev_mist', name: '晨雾弥漫', icon: '🌫️', cond: g => g.eco.hum >= 78, hours: 3, desc: '雾把花园裹得很软', fx: { growth: 1.0 }, reward: 0 },
  { id: 'ev_drought', name: '燥热旱风', icon: '🔥', cond: g => g.eco.hum <= 20 && g.eco.sun >= 70, hours: 4, desc: '土壤有些干渴，萎靡累积变快，浇水效果 +50%', fx: { growth: 0.9, waterBoost: 1.5 }, reward: 0 },
  { id: 'ev_fertile', name: '丰饶之息', icon: '🌿', cond: g => g.eco.fer >= 80, hours: 5, desc: '肥沃的土壤悄悄托着根，成长 +30%', fx: { growth: 1.3 }, reward: 20 },
  { id: 'ev_firefly', name: '萤火之夜', icon: '🪄', cond: g => EG.isNight() && g.eco.har >= 60, hours: 2.5, desc: '萤火虫提着小灯笼来串门', fx: {}, reward: 10 },
  { id: 'ev_petal', name: '花瓣雨', icon: '🌸', cond: null, random: 0.06, hours: 0.5, desc: '不知是谁先开的头，花瓣落了一场雨', fx: {}, reward: 0 },
  { id: 'ev_snow', name: '初雪', icon: '❄️', cond: g => [12, 1, 2].includes(new Date().getMonth() + 1) && g.eco.har >= 60, hours: 6, desc: '雪把声音都盖住了，适合安眠', fx: { growth: 0.7 }, reward: 0 },
];

/* ---------- 成就（节选 26 项）---------- */
function A(id, icon, name, desc, cond) { return { id, icon, name, desc, cond }; }
EG.ACHIEVEMENTS = [
  A('a_bloom1', '🌱', '初次绽放', '第一株植物绽放', g => g.stats.harvested >= 1),
  A('a_bloom10', '🌼', '小有花期', '累计收获 10 株', g => g.stats.harvested >= 10),
  A('a_bloom40', '🌻', '花开满园', '累计收获 40 株', g => g.stats.harvested >= 40),
  A('a_bloom100', '🌳', '百花园丁', '累计收获 100 株', g => g.stats.harvested >= 100),
  A('a_dex6', '📒', '图鉴开篇', '解锁 6 种植物形态', g => EG.dexFormCount(g) >= 6),
  A('a_dex24', '📚', '博物学妹', '解锁 24 种植物形态', g => EG.dexFormCount(g) >= 24),
  A('a_dex72', '🏆', '万花之主', '解锁全部 72 种形态', g => EG.dexFormCount(g) >= 72),
  A('a_joy', '●', '向阳之心', '让一株喜悦系植物绽放', g => EG.catBloomed(g, 'joy')),
  A('a_calm', '〜', '静水之心', '让一株平静系植物绽放', g => EG.catBloomed(g, 'calm')),
  A('a_sad', '▽', '雨季之心', '让一株悲伤系植物绽放', g => EG.catBloomed(g, 'sad')),
  A('a_anger', '▲', '火焰之心', '让一株愤怒系植物绽放', g => EG.catBloomed(g, 'anger')),
  A('a_anx', '✳', '雾中之心', '让一株焦虑系植物绽放', g => EG.catBloomed(g, 'anxiety')),
  A('a_att', '☾', '月光之心', '让一株眷恋系植物绽放', g => EG.catBloomed(g, 'attach')),
  A('a_care3', '🤲', '温柔三日', '连续 3 天照料植物', g => (g.stats.careStreak || 0) >= 3),
  A('a_care7', '🫱', '一周之约', '连续 7 天照料植物', g => (g.stats.careStreak || 0) >= 7),
  A('a_care30', '🫶', '月之守护', '连续 30 天照料植物', g => (g.stats.careStreak || 0) >= 30),
  A('a_rec3', '📝', '三天日记', '连续 3 天记录情绪', g => (g.stats.dayStreak || 0) >= 3),
  A('a_rec7', '📖', '一周日记', '连续 7 天记录情绪', g => (g.stats.dayStreak || 0) >= 7),
  A('a_rec30', '📕', '月之书写', '连续 30 天记录情绪', g => (g.stats.dayStreak || 0) >= 30),
  A('a_rec100', '🔭', '见证者', '连续 100 天记录情绪', g => (g.stats.dayStreak || 0) >= 100),
  A('a_ring1', '🪵', '第一圈年轮', '迎来第一棵情绪年轮树', g => Object.keys(g.months).length >= 1),
  A('a_ring6', '🌲', '半年森林', '攒下 6 棵年轮树', g => Object.keys(g.months).length >= 6),
  A('a_embrace', '🫂', '接纳者', '在愤怒植物萎靡时选择倾听 5 次', g => (g.stats.embraced || 0) >= 5),
  A('a_eco750', '🧭', '生态学家', '生态评分达到 750', g => EG.ecoScore(g) >= 750),
  A('a_med10', '🧘', '呼吸十次', '完成 10 次冥想', g => (g.stats.meditations || 0) >= 10),
  A('a_journey', '🧭', '旅程终点', '完成「心灵旅程」全部 12 章', g => (g.journeyStep || 0) >= 12),
];

/* ---------- 心灵旅程（12 章引导任务）---------- */
function J(id, name, desc, reward, cond) { return { id, name, desc, reward, cond }; }
EG.JOURNEY = [
  J('j1', '第一次表达', '用任意方式记录一次情绪', 20, g => g.stats.recorded >= 1),
  J('j2', '第一株绽放', '让一株植物绽放并收获', 20, g => g.stats.harvested >= 1),
  J('j3', '学会倾听', '对植物使用 3 次「倾听」', 20, g => g.stats.listened >= 3),
  J('j4', '三日之约', '连续 3 天记录情绪', 30, g => (g.stats.dayStreak || 0) >= 3),
  J('j5', '五感俱全', '颜色 / 文字 / 音乐三种输入都用过一次', 30, g => g.stats.inColor >= 1 && g.stats.inText >= 1 && g.stats.inMusic >= 1),
  J('j6', '小小图鉴', '解锁 6 种植物形态', 30, g => EG.dexFormCount(g) >= 6),
  J('j7', '花园调香师', '为植物播放 5 次安抚旋律', 30, g => g.stats.melody >= 5),
  J('j8', '生态学徒', '生态评分达到 600', 40, g => EG.ecoScore(g) >= 600),
  J('j9', '月之年轮', '迎来第一棵情绪年轮树', 40, g => Object.keys(g.months).length >= 1),
  J('j10', '纪念花束', '送别一株凋谢的植物', 40, g => (g.stats.memorials || 0) >= 1),
  J('j11', '和谐之园', '和谐度达到 75', 50, g => g.eco.har >= 75),
  J('j12', '满园花开', '花园中同时有 6 株绽放的植物', 60, g => Object.values(g.plants).filter(p => !p.withered && EG.stageOf(p.growth) === 4).length >= 6),
];

/* ---------- 温柔文案 ---------- */
EG.KIND_WORDS = [
  '慢慢来，花会等你。', '每一种情绪，都值得被看见。', '谢谢你照顾它。',
  '今天也辛苦啦。', '花园记得你来过。', '它听见你了。',
  '情绪没有好坏，它只是路过。', '你愿意说出来，就已经很棒了。',
];
EG.stageUpLine = st => ['一颗小小的种子落进土里', '冒出了嫩嫩的芽', '抽出了新的枝叶', '结出了花苞', '开花了！'][st] || '';

/* ---------- 运行时小工具 ---------- */
EG.isNight = () => { const h = new Date().getHours(); return h >= 20 || h < 6; };
EG.season = () => { const m = new Date().getMonth() + 1; return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter'; };
EG.SEASON_NAME = { spring: '春 · 新生', summer: '夏 · 热烈', autumn: '秋 · 沉淀', winter: '冬 · 安眠' };
EG.dexFormCount = g => { let n = 0; for (const k in g.dex) n += (g.dex[k].variants || []).filter(Boolean).length; return n; };
EG.catBloomed = (g, cat) => Object.values(g.dex).some((d, i) => d.n > 0 && EG.PLANT_BY_ID[d.species] && EG.PLANT_BY_ID[d.species].emo === cat);
EG.ecoScore = g => Math.round((g.eco.sun * 0.2 + g.eco.hum * 0.2 + g.eco.fer * 0.3 + g.eco.har * 0.3) * 10);

/* 种子随机数（mulberry32 + 字符串哈希）*/
EG.hashSeed = str => { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return h >>> 0; };
EG.RNG = function (seed) {
  let a = typeof seed === 'string' ? EG.hashSeed(seed) : seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};
