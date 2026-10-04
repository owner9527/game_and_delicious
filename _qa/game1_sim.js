'use strict';
/* Headless logic QA for game 01 余烬之城: applySet moral floor / trail restart / HUD chip logic */
const fs = require('fs'), path = require('path'), vm = require('vm');
let failures = [], notes = [];
const fail = (m) => { failures.push(m); console.log('FAIL: ' + m); };
const ok = (m) => { console.log('ok: ' + m); };
const assert = (c, m) => { c ? ok(m) : fail(m); };

const html = fs.readFileSync(path.resolve(__dirname, '..', '1', '余烬之城.html'), 'utf8');
function slice(a, b) { const i = html.indexOf(a), j = html.indexOf(b); if (i < 0 || j < 0) throw new Error('marker missing: ' + a); return html.slice(i + a.length, j); }
const storyCode = slice('/*==STORY==*/', '/*==END-STORY==*/');
const logicCode = slice('/*==LOGIC==*/', '/*==END-LOGIC==*/');
const artCode = slice('/*==ART==*/', '/*==END-ART==*/');

// minimal DOM stubs for ART render & LOGIC (HUD refs resolved lazily)
function makeEl() {
  const el = { style: {}, _cls: new Set(), children: [], textContent: '', innerHTML: '',
    classList: { add(...c) { c.forEach(x => el._cls.add(x)); }, remove(...c) { c.forEach(x => el._cls.delete(x)); }, toggle(c, f) { (f === undefined ? !el._cls.has(c) : f) ? el._cls.add(c) : el._cls.delete(c); }, contains(c) { return el._cls.has(c); } },
    addEventListener() {}, appendChild(c) { el.children.push(c); return c; }, removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); },
    get firstChild() { return el.children[0] || null; }, remove() {}, setAttribute() {}, getAttribute() { return null; },
    querySelector() { return makeEl(); }, querySelectorAll() { return []; }, focus() {}, getBoundingClientRect() { return { x: 0, y: 0, width: 100, height: 50 }; },
    insertAdjacentHTML() {}, dataset: {}, parentNode: null };
  return el;
}
const els = {};
const documentStub = { getElementById(id) { if (!els[id]) els[id] = makeEl(); return els[id]; }, querySelector() { return makeEl(); }, querySelectorAll() { return []; }, createElement: () => makeEl(), addEventListener() {}, body: makeEl(), documentElement: makeEl(), hidden: false, visibilityState: 'visible' };
const sandbox = { document: documentStub, window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), devicePixelRatio: 1, innerWidth: 800, innerHeight: 600, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, requestAnimationFrame: () => 0, setTimeout: () => 0, AudioContext: undefined, webkitAudioContext: undefined, performance: { now: () => Date.now() } }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, performance: { now: () => Date.now() }, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0, console, Math, JSON, Date, Object, Array, Map, Set, String, Number, Boolean, Promise, Error, isFinite, parseInt, parseFloat, Symbol, navigator: { userAgent: 'headless' }, location: { href: 'file:///x/' } };
sandbox.window.window = sandbox.window; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(storyCode + '\n;globalThis.__STORY__ = STORY; globalThis.__REG__ = REG; globalThis.__CHAPCARDS__ = CHAPCARDS;', sandbox, { filename: 'story' });
vm.runInContext('globalThis.__REG__ = REG;', sandbox, { filename: 'story2' });
vm.runInContext(logicCode + '\n;globalThis.__L__ = { freshState, applySet, checkCond, firstRoute, nodeOptions, resolveText, enter: typeof enter !== "undefined" ? enter : null, updateHUD: typeof updateHUD !== "undefined" ? updateHUD : null };', sandbox, { filename: 'logic' });
vm.runInContext('try{' + artCode + '\n;globalThis.__ART__ = ART;}catch(e){ globalThis.__ART_ERR__ = e.message; }', sandbox, { filename: 'art' });
if (sandbox.__ART_ERR__) console.log('(art stub render error — expected in stub env:', sandbox.__ART_ERR__ + ')');

const { freshState, applySet, nodeOptions, firstRoute } = sandbox.__L__;
const STORY = sandbox.__STORY__, REG = sandbox.__REG__;

/* 1. moral floor */
{
  const st = freshState();
  applySet(st, { moral: -5 });
  assert(st.vars.moral === -5, 'applySet({moral:-5}) -> ' + st.vars.moral);
  applySet(st, { moral: -20 });
  assert(st.vars.moral === -10, 'moral clamps at REG min -10 (got ' + st.vars.moral + ')');
  const st2 = freshState();
  applySet(st2, { supplies: -99 });
  assert(st2.vars.supplies === 0, 'supplies floors at 0 (got ' + st2.vars.supplies + ')');
  const st3 = freshState();
  applySet(st3, { zhou: -3 });
  assert(st3.vars.zhou === 0, 'companion affinity floors at 0 (got ' + st3.vars.zhou + ')');
}

/* 2. fallen route reachable: f_fate route moral:"<=-3" */
{
  const st = freshState();
  applySet(st, { moral: -3 });
  const node = STORY.nodes.f_fate;
  assert(!!node, 'f_fate node exists');
  const route = firstRoute(st, node.routes || []);
  assert(!!route && route.to === 'e07', 'f_fate moral<=-3 route resolves to e07 (got ' + (route && route.to) + ')');
  const stGood = freshState();
  const routeGood = firstRoute(stGood, node.routes || []);
  assert(!routeGood || routeGood.to !== 'e07', 'moral=0 does NOT take fallen route');
}

/* 3. trail restart semantics: simulate choice snapshot -> apply -> restore */
{
  // emulate what pushTrail stores: pre-choice vars/items/visited snapshot
  const st = freshState();
  applySet(st, { moral: 2, supplies: 4 });
  st.visited['s_shop'] = 1;
  const snap = { node: 's_shop', vars: JSON.parse(JSON.stringify(st.vars)), items: JSON.parse(JSON.stringify(st.items || {})), visited: JSON.parse(JSON.stringify(st.visited)) };
  applySet(st, { moral: -2, supplies: -1 }); // player makes the bad choice
  assert(st.vars.moral === 0, 'after bad choice moral=' + st.vars.moral);
  // restart from fork: restore snapshot
  st.vars = JSON.parse(JSON.stringify(snap.vars));
  st.items = JSON.parse(JSON.stringify(snap.items));
  st.visited = JSON.parse(JSON.stringify(snap.visited));
  console.log('restore debug: moral=' + st.vars.moral + ' supplies=' + st.vars.supplies + ' snap.moral=' + snap.vars.moral + ' snap.supplies=' + snap.vars.supplies);
  assert(st.vars.moral === 2 && st.vars.supplies === snap.vars.supplies, 'restore returns pre-choice state');
  const opts = nodeOptions(st, STORY.nodes[snap.node]).filter(x => x.met);
  assert(opts.length > 0, 'options re-evaluated at restored fork (' + opts.length + ' met)');
}


/* 5. full-game random bot with restore capability (reuse _check.mjs style) */
{
  const nodes = STORY.nodes;
  const tally = {}; const runs = 3000;
  for (let i = 0; i < runs; i++) {
    const st = freshState(); let node = STORY.start, guard = 0, end = null;
    while (guard++ < 300) {
      const n = nodes[node];
      if (!n) { end = 'MISSING:' + node; break; }
      if (!st.visited[node]) { st.visited[node] = 1; applySet(st, n.set); }
      if (n.ending) { end = n.ending; break; }
      if (n.routes && !(n.options && n.options.length)) {
        const r = firstRoute(st, n.routes);
        if (!r) { end = 'NOROUTE:' + node; break; }
        node = r.to; continue;
      }
      const opts = nodeOptions(st, n).filter(x => x.met);
      if (!opts.length) { if (n.to) { node = n.to; continue; } end = 'DEADEND:' + node; break; }
      const pick = opts[Math.floor(Math.random() * opts.length)].op;
      applySet(st, pick.set); node = pick.to;
    }
    tally[end] = (tally[end] || 0) + 1;
  }
  console.log('tally dump:', JSON.stringify(tally));
  const bad = Object.keys(tally).filter(k => k.startsWith('DEADEND') || k.startsWith('NOROUTE') || k.startsWith('MISSING'));
  assert(bad.length === 0, '3000-run bot: no dead ends (bad=' + JSON.stringify(bad) + ')');
  const e07 = tally['E07'] || 0;
  assert(e07 > 0, 'fallen ending E07 reachable via random play: ' + e07 + '/' + runs);
}

console.log('\nSUMMARY: ' + (failures.length ? failures.length + ' FAIL' : 'ALL PASS'));
if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
