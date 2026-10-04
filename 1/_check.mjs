import { readFileSync } from 'fs';
const html = readFileSync(new URL('./余烬之城.html', import.meta.url), 'utf8');
function slice(a, b){ const i = html.indexOf(a), j = html.indexOf(b); if(i<0||j<0) throw new Error('marker missing: '+a); return html.slice(i+a.length, j); }

const storyCode = slice('/*==STORY==*/', '/*==END-STORY==*/');
const logicCode = slice('/*==LOGIC==*/', '/*==END-LOGIC==*/');
const artCode   = slice('/*==ART==*/', '/*==END-ART==*/');

const { STORY, REG, CHAPCARDS } = new Function(storyCode + '\nreturn {STORY, REG, CHAPCARDS};')();
const { freshState, applySet, checkCond, firstRoute, nodeOptions, resolveText } = new Function('REG', logicCode + '\nreturn {freshState, applySet, checkCond, firstRoute, nodeOptions, resolveText};')(REG);
const ART = new Function(artCode + '\nreturn ART;')();

let errors = [], warns = [];
const E = m => errors.push(m), W = m => warns.push(m);
const nodes = STORY.nodes, ids = Object.keys(nodes);

// 1. 起点与结局
if(!nodes[STORY.start]) E('start node missing: '+STORY.start);
const endingIds = Object.keys(STORY.endings);
if(endingIds.length !== 10) E('endings count = '+endingIds.length+', expect 10');

// 2. 结构检查
const edges = [];
for(const id of ids){
  const n = nodes[id];
  if(!n.chapter) W('node '+id+' no chapter');
  if(!n.scene) W('node '+id+' no scene');
  if(!n.music) W('node '+id+' no music');
  const targets = [];
  (n.options||[]).forEach((op,i)=>{
    if(!op.text) E(id+' option '+i+' no text');
    if(!nodes[op.to]) E(id+' option '+(op.text||'').slice(0,12)+' -> missing node '+op.to);
    else edges.push([id, op.to, op.need||null]);
    checkCondKeys(id, op.need);
    checkSet(id, op.set);
  });
  (n.routes||[]).forEach(r=>{
    if(!nodes[r.to]) E(id+' route -> missing node '+r.to);
    else edges.push([id, r.to, r.need||null]);
    checkCondKeys(id, r.need);
  });
  if(n.ending && !STORY.endings[n.ending]) E(id+' ending missing in registry: '+n.ending);
  if(n.set) checkSet(id, n.set);
}
function checkCondKeys(id, c){
  if(!c) return;
  if(c.vars) for(const k in c.vars){ if(!REG.vars[k]) E(id+' cond unknown var: '+k); }
  (c.items||[]).forEach(k=>{ if(!REG.items[k]) E(id+' cond unknown item: '+k); });
  (c.noItems||[]).forEach(k=>{ if(!REG.items[k]) E(id+' cond unknown noItem: '+k); });
}
function checkSet(id, set){
  if(!set) return;
  for(const k in set){
    if(k==='give'||k==='take') { (set[k]||[]).forEach(it=>{ if(!REG.items[it]) E(id+' set unknown item: '+it); }); continue; }
    if(!REG.vars[k]) E(id+' set unknown var: '+k);
  }
}

// 3. 场景可渲染
const scenes = new Set(ids.map(i=>nodes[i].scene).filter(Boolean));
for(const s of scenes){ try{ ART.render(s, 'test'); }catch(e){ E('scene render fail ['+s+']: '+e.message); } }

// 4. 结构可达性(忽略条件)
{
  const seen = new Set([STORY.start]); const q=[STORY.start];
  while(q.length){ const cur=q.shift(); const n=nodes[cur]; if(!n) continue;
    (n.options||[]).forEach(op=>{ if(nodes[op.to] && !seen.has(op.to)){ seen.add(op.to); q.push(op.to); } });
    (n.routes||[]).forEach(r=>{ if(nodes[r.to] && !seen.has(r.to)){ seen.add(r.to); q.push(r.to); } });
    if(n.to && nodes[n.to] && !seen.has(n.to)){ seen.add(n.to); q.push(n.to); }
  }
  ids.forEach(i=>{ if(!seen.has(i)) W('node unreachable (structural): '+i); });
}

// 5. 随机通关机器人(真实逻辑)
const tally = {}; const dead = {};
const RUNS = 20000;
for(let i=0;i<RUNS;i++){
  const st = freshState();
  let node = STORY.start, guard = 0, end = null;
  while(guard++ < 300){
    const n = nodes[node];
    if(!n){ end = 'MISSING:'+node; break; }
    if(!st.visited[node]){ st.visited[node]=1; applySet(st, n.set); }
    if(n.ending){ end = n.ending; break; }
    if(n.routes && !(n.options&&n.options.length)){
      const r = firstRoute(st, n.routes);
      if(!r){ end = 'NOROUTE:'+node; break; }
      node = r.to; continue;
    }
    const opts = nodeOptions(st, n).filter(x=>x.met);
    if(!opts.length){
      if(n.to){ node = n.to; continue; }
      end = 'DEADEND:'+node; break;
    }
    const pick = opts[Math.floor(Math.random()*opts.length)].op;
    applySet(st, pick.set);
    node = pick.to;
  }
  if(guard>=300) end = 'LOOP';
  tally[end] = (tally[end]||0)+1;
  if(end && (end.startsWith('DEADEND')||end.startsWith('NOROUTE')||end.startsWith('MISSING')||end==='LOOP')) dead[end]=(dead[end]||0)+1;
}
console.log('=== 结构错误 ==='); console.log(errors.length? errors.join('\n') : '(无)');
console.log('=== 警告 ==='); console.log(warns.length? warns.join('\n') : '(无)');
console.log('=== 节点数 ===', ids.length, '(结局', endingIds.length, ')');
console.log('=== 场景数 ===', scenes.size, Array.from(scenes).join(','));
console.log('=== 随机通关 '+RUNS+' 次:结局分布 ===');
Object.keys(STORY.endings).forEach(k=>{
  const c = tally[k]||0;
  console.log((c? 'OK ' : 'XX ') + k + ' ' + STORY.endings[k].name + ': ' + c + ' (' + (100*c/RUNS).toFixed(2) + '%)');
  if(!c) errors.push('ending unreachable: '+k);
});
Object.keys(tally).forEach(k=>{ if(!STORY.endings[k]) console.log('!! 未知终止:', k, tally[k]); });
console.log('=== 异常终止 ==='); console.log(Object.keys(dead).length? JSON.stringify(dead) : '(无)');
process.exit(errors.length? 1 : 0);
