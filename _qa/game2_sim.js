/* Headless gameplay harness for game 02 星火拓荒 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const DIR = path.resolve(__dirname, '..', '2');
const wlog = (m) => { try { require('fs').writeSync(1, m + String.fromCharCode(10)); } catch (e) {} };
let failures = [], notes = [];
const fail = (m) => { failures.push(m); console.log('FAIL: ' + m); };
const ok = (m) => { notes.push(m); console.log('ok: ' + m); };
const assert = (cond, m) => { cond ? ok(m) : fail(m); };

/* ---------- stubs ---------- */
function makeCtx() {
  return new Proxy({}, {
    get(t, k) {
      if (k === 'canvas') return { width: 1280, height: 720 };
      if (!(k in t)) t[k] = function (...a) {
        if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern')
          return { addColorStop() {} };
        if (k === 'createImageData') { const w = a[0] || 1, h = a[1] || w; return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
        if (k === 'getImageData') return { data: new Uint8ClampedArray(4) };
        if (k === 'measureText') return { width: 10 };
        return undefined;
      };
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function makeEl(tag) {
  const el = {
    tag: tag || 'div', style: {}, dataset: {}, children: [], _cls: new Set(),
    textContent: '', innerHTML: '',
    classList: {
      add(...c) { c.forEach(x => el._cls.add(x)); },
      remove(...c) { c.forEach(x => el._cls.delete(x)); },
      toggle(c, f) { (f === undefined ? !el._cls.has(c) : f) ? el._cls.add(c) : el._cls.delete(c); },
      contains(c) { return el._cls.has(c); },
    },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { el.children.push(c); c.parentNode = el; return c; },
    get firstChild() { return el.children[0] || null; },
    get lastChild() { return el.children[el.children.length - 1] || null; },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); return c; },
    remove() {},
    insertAdjacentHTML() {}, setAttribute() {}, getAttribute() { return null; },
    focus() {}, blur() {}, click() { if (el.onclick) el.onclick({ preventDefault() {}, stopPropagation() {} }); },
    getBoundingClientRect() { return { x: 0, y: 0, width: 400, height: 300, left: 0, top: 0, right: 400, bottom: 300 }; },
    querySelector() { return makeEl(); }, querySelectorAll() { return []; },
    width: 300, height: 150,
    getContext() { return makeCtx(); },
  };
  return el;
}
const _elements = {};
const documentStub = {
  getElementById(id) { if (!_elements[id]) _elements[id] = makeEl(); return _elements[id]; },
  querySelector() { return makeEl(); }, querySelectorAll() { return []; },
  createElement(t) { return makeEl(t); },
  addEventListener() {}, removeEventListener() {},
  body: makeEl('body'), documentElement: makeEl('html'),
  hidden: false, visibilityState: 'visible',
};
const storage = new Map();
const windowStub = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame: () => 0,
  performance: { now: () => Date.now() },
  localStorage: {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
    clear: () => storage.clear(),
  },
  isSecureContext: false,
};
windowStub.window = windowStub; windowStub.document = documentStub; windowStub.self = windowStub;

const sandbox = {
  window: windowStub, document: documentStub, localStorage: windowStub.localStorage,
  performance: windowStub.performance, requestAnimationFrame: windowStub.requestAnimationFrame,
  setTimeout: (fn) => { return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  console, Math, JSON, Date, Object, Array, Map, Set, Promise, String, Number, Boolean,
  Uint8Array, Uint8ClampedArray, Uint32Array, Float32Array, ArrayBuffer, DataView,
  isFinite, parseInt, parseFloat, Symbol, Error, TypeError, NaN, Infinity,
  navigator: { userAgent: 'headless', maxTouchPoints: 0, vibrate() {} },
  location: { href: 'file:///D:/game2/index.html', protocol: 'file:' },
  screen: { width: 1280, height: 720 },
  AudioContext: undefined, webkitAudioContext: undefined,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const files = ['core.js', 'data.js', 'world.js', 'actors.js', 'buildings.js', 'systems.js', 'render.js', 'ui.js', 'save.js', 'main.js'];
for (const f of files) {
  const code = fs.readFileSync(path.join(DIR, 'js', f), 'utf8');
  try { vm.runInContext(code, sandbox, { filename: f }); }
  catch (e) { fail('load ' + f + ': ' + e.message); }
}
if (failures.length) { console.log('\nLOAD FAILED, abort'); process.exit(1); }
ok('all 10 modules loaded');

// top-level const/let don't attach to the sandbox object; harvest them from the shared global lexical env
vm.runInContext(`
globalThis.__X = {};
for (const nm of ['Game','Buildings','Pool','SaveSys','World','Actors','Systems','UI','Render','Util','ECS','Sfx','TILE','strSeed','DATA','BASE_CAP','STOCKPILE_CAP']) {
  try { __X[nm] = eval(nm); } catch (e) {}
}
`, sandbox);
const X = sandbox.__X;
const { Game, Buildings, Pool, SaveSys, World, Actors, Systems, UI, Render, Util, ECS } = X;
const TILE = X.TILE || 32;
Object.defineProperty(globalThis, 'G', { get: () => sandbox.G, configurable: true });

/* ---------- scenario 1: new game + long run ---------- */
try {
  Game.init();
} catch (e) { fail('Game.init: ' + e.stack); }
try {
  Game.newGame('');
  assert(!!G && !!G.player, 'newGame creates world & player');
} catch (e) { fail('newGame: ' + e.stack); }

// run 60 simulated seconds
function run(sec, step = 0.05) {
  const n = Math.round(sec / step);
  for (let i = 0; i < n; i++) {
    if (i % 100 === 0) process.stdout.write('[tick ' + i + '/' + n + ' day=' + (G && G.time ? G.time.day : '?') + ']\n');
    try {
      Game.updatePlayerMove && Game.updatePlayerMove(step);
      Systems.update(step);
      UI.tick(step);
    } catch (e) { fail('tick ' + i + ': ' + (e.stack || e.message)); return; }
  }
}
try { run(30); ok('ran 30s of day 1 without exception'); } catch (e) { fail('run: ' + e.stack); }

/* ---------- scenario 2: build stuff ---------- */
function findSpot(defId, r = 14) {
  const p = G.player.pos, T = TILE;
  const tx0 = Math.floor(p.x / T), ty0 = Math.floor(p.y / T);
  for (let rad = 1; rad < r; rad++)
    for (let dy = -rad; dy <= rad; dy++)
      for (let dx = -rad; dx <= rad; dx++) {
        if (Buildings.canPlace(defId, tx0 + dx, ty0 + dy)) return [tx0 + dx, ty0 + dy];
      }
  return null;
}
// give resources for free
for (const k of ['wood', 'stone', 'food', 'fiber', 'iron']) { try { Pool.add(k, 200, true); } catch (e) {} }
const toBuild = ['campfire', 'stockpile', 'farm', 'kitchen', 'workbench', 'furnace'];
let built = 0;
for (const b of toBuild) {
  const spot = findSpot(b);
  if (!spot) { notes.push('no spot for ' + b + ' (skip)'); continue; }
  try {
    const res = Buildings.place(b, spot[0], spot[1]);
    if (res) built++; else notes.push('place returned null for ' + b);
  } catch (e) { fail('place ' + b + ': ' + (e.stack || e.message)); }
}
assert(built >= 4, 'placed ' + built + '/' + toBuild.length + ' buildings');
try { run(60); ok('ran 60s with buildings'); } catch (e) { fail('run2: ' + e.stack); }

/* ---------- scenario 3: full storage ---------- */
try {
  // drain pool first (earlier force-adds would break the precondition)
  vm.runInContext('G.pool = {}', sandbox);
  const cap = Pool.cap();
  // fill non-food WITHOUT force up to >=80% of cap
  let guard = 0;
  while (Pool.total() < Math.floor(cap * 0.85) && guard++ < 5000) Pool.add('stone', 5);
  const t80 = Pool.total();
  // non-food beyond 80% must be blocked
  const woodAdded = Pool.add('wood', 10);
  assert(woodAdded === 0, 'non-food blocked above 80% (added ' + woodAdded + ', total=' + t80 + '/' + cap + ')');
  // food still enters up to 100%
  const berryAdded = Pool.add('berry', 10);
  assert(berryAdded > 0, 'food still enterable above 80% (added ' + berryAdded + ')');
  notes.push('storage scenario done: total=' + Pool.total() + ' cap=' + cap);
} catch (e) { fail('storage: ' + (e.stack || e.message)); }
try { run(30); ok('ran 30s with full storage (eat from buf.out path)'); } catch (e) { fail('run3: ' + e.stack); }
assert(G.player.hp > 0 || !G.over, 'player not dead from starvation with full storage');

/* ---------- scenario 4: blueprint cancel refund ---------- */
try {
  for (const k of ['wood', 'stone']) Pool.add(k, 100, true);
  const def = 'stockpile';
  const spot = findSpot(def, 20);
  if (spot) {
    const w0 = Pool.count ? Pool.count('wood') : Pool.total();
    const bp = Buildings.place(def, spot[0], spot[1]);
    if (bp) {
      // find cancel function
      if (typeof Buildings.cancelBlueprint === 'function') {
        Buildings.cancelBlueprint(bp);
        const w1 = Pool.count ? Pool.count('wood') : Pool.total();
        assert(w1 >= w0, 'blueprint cancel refunds (wood ' + w0 + '->' + w1 + ')');
      } else fail('Buildings.cancelBlueprint missing');
    } else notes.push('bp place null (costs?)');
  }
} catch (e) { fail('blueprint: ' + (e.stack || e.message)); }

/* ---------- scenario 5: save/load roundtrip, emptied chunk ---------- */
try {
  // harvest-out the player's chunk: mark dirty with zero nodes
  const p = G.player.pos, T = TILE;
  const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
  const cx = Math.floor(tx / 16), cy = Math.floor(ty / 16);
  const ch = World.getChunk(cx, cy);
  ch.nodes.clear(); ch.dirty = true;
  wlog('[s5] clearing done, saving...');
  const SLOT0KEY = SaveSys.keyOf(0);
  wlog('[s5] bisect a: serialize begin');
  const serData = SaveSys.serialize();
  console.log('[s5] bisect b: serialize done, chunks=' + serData.chunks.length + ' buildings=' + serData.buildings.length + ' workers=' + serData.workers.length);
  const json = JSON.stringify(serData);
  console.log('[s5] bisect c: stringify done len=' + json.length);
  windowStub.localStorage.setItem(SLOT0KEY, json);
  wlog('[s5] bisect d: setItem done');
  SaveSys.save(0, false);
  wlog('[s5] saved');
  const SLOT0 = SaveSys.keyOf(0);
  assert(storage.has(SLOT0), 'save written to slot 0');
  const raw = JSON.parse(storage.get(SLOT0));
  console.log('[s5] parsed, chunks=' + raw.chunks.length);
  // verify emptied chunk serialized (empty nodes array)
  let emptied = null;
  const chunks = raw.chunks || null;
  if (chunks) {
    const arr = Array.isArray(chunks) ? chunks : Object.values(chunks);
    emptied = arr.find(c => c && (c.empty === true || (Array.isArray(c.nodes) && c.nodes.length === 0)));
  }
  assert(!!emptied, 'emptied chunk persisted (found empty-node entry)');
  // load in a fresh world (same call shape as production load: startWorld(data.seed, data))
  wlog('[s5] startWorld begin');
  Game.startWorld(raw.seed, raw);
  wlog('[s5] startWorld done');
  run(5);
  const ch2 = World.getChunk(cx, cy);
  const n2 = ch2 && ch2.nodes ? ch2.nodes.size : -1;
  assert(n2 === 0, 'emptied chunk stays empty after reload (nodes=' + n2 + ')');
} catch (e) { fail('save/load: ' + (e.stack || e.message)); }

/* ---------- scenario 6: slots isolation + autosave hooks ---------- */
try {
  const k0 = SaveSys.keyOf(0), k1 = SaveSys.keyOf(1), k2 = SaveSys.keyOf(2);
  assert(k0 !== k1 && k1 !== k2 && k0 !== k2, '3 distinct slot keys (' + k0 + ',' + k1 + ',' + k2 + ')');
  assert(k0 === 'sparkfront.save.v1', 'slot 0 keeps legacy key');
  wlog('[s6] manual msgFull steps...');
  const line = sandbox.document.createElement('div');
  line.className = 'logline good'; line.textContent = 'probe';
  wlog('[s6] a: created');
  UI.els.log.appendChild(line);
  wlog('[s6] b: appended, len=' + UI.els.log.children.length);
  let guard = 0;
  while (UI.els.log.children.length > 7 && guard++ < 100) UI.els.log.removeChild(UI.els.log.firstChild);
  wlog('[s6] c: trimmed guard=' + guard + ' len=' + UI.els.log.children.length);
  wlog('[s6] d: calling real UI.msg');
  UI.msg('probe message', 'good');
  wlog('[s6] UI.msg returned');
  SaveSys.save(1, false); SaveSys.save(2, false);
  assert(storage.has(k1) && storage.has(k2), 'slots 1&2 written');
  // autosave stubs: dispatch visibilitychange can't be done easily; just verify functions exist
  assert(typeof SaveSys.save === 'function' && typeof SaveSys.load === 'function', 'save/load API ok');
} catch (e) { fail('slots: ' + (e.stack || e.message)); }

/* ---------- scenario 7: overnight run with monsters ---------- */
try {
  // speed to night: run until day>=1.5 or 300s
  let t0 = G.time !== undefined ? G.time : 0;
  for (let i = 0; i < 6000; i++) {
    Game.updatePlayerMove && Game.updatePlayerMove(0.05);
    Systems.update(0.05);
    if (G.time && G.time.day >= 2) break;
  }
  ok('advanced to day ' + (G.time ? G.time.day : '?') + ' (night raid path ran)');
  assert(!G.over, 'game not over after night');
} catch (e) { fail('night: ' + (e.stack || e.message)); }

/* ---------- summary ---------- */
console.log('\n========== SUMMARY ==========');
console.log('PASS ' + notes.length + ' checks, FAIL ' + failures.length);
if (failures.length) { console.log('\nFAILURES:\n' + failures.map(f => '- ' + f).join('\n')); process.exit(1); }
console.log('ALL PASS');
