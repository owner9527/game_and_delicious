# -*- coding: utf-8 -*-
"""一次性补丁：修复 GUI 实测发现的 UI 问题"""
import io

# ---------- 1. css：结算卡片可滚动（分享卡不再溢出） ----------
p = 'css/style.css'
s = io.open(p, encoding='utf-8').read()
old = """.settle-card{width:min(430px,92vw);background:var(--panel);border:1px solid var(--panel-line);border-radius:20px;
  padding:26px;text-align:center;animation:riseIn .4s cubic-bezier(.2,1.4,.4,1);backdrop-filter:blur(12px);}"""
new = """.settle-card{width:min(430px,92vw);max-height:92vh;overflow:auto;background:var(--panel);border:1px solid var(--panel-line);border-radius:20px;
  padding:26px;text-align:center;animation:riseIn .4s cubic-bezier(.2,1.4,.4,1);backdrop-filter:blur(12px);}"""
assert old in s; s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('css fixed')

# ---------- 2/3/4. ui.js ----------
p = 'js/ui.js'
s = io.open(p, encoding='utf-8').read()

def rep(old, new):
    global s
    assert old in s, 'NOT FOUND: ' + old[:70]
    s = s.replace(old, new, 1)

# 星图：包含全部含事实的节点（初始状态也能看到三线布局）
rep("""    const edges = [];
    g.activeEdges.forEach(e => { addNode(e.from.t, e.from.s); addNode(e.to.t, e.to.s); edges.push(e); });
    (App.def.goals || []).forEach(o => addNode(o.t, o.s));
    return { nodes: [...nodes.values()], edges };""",
"""    const edges = [];
    g.activeEdges.forEach(e => { addNode(e.from.t, e.from.s); addNode(e.to.t, e.to.s); edges.push(e); });
    (App.def.goals || []).forEach(o => addNode(o.t, o.s));
    for (const f of g.facts.values()) addNode(f.t, f.s);
    return { nodes: [...nodes.values()], edges };""")

# 实验室标题去重
rep("""        d.innerHTML = `<div class="li-ico">${done ? '✅' : '🧪'}</div>
          <div class="li-main"><h4>${p.title} · ${p.title.includes('号题') ? '' : ''}${i + 1}号题</h4>
          <p>章内机制回响 · 标准解 ${p.par} 步 · ${done ? '今日已完成' : '挑战（保证可解）'}</p></div>
          <div class="li-right">${done ? '✦15' : '挑战 ›'}</div>`;""",
"""        d.innerHTML = `<div class="li-ico">${done ? '✅' : '🧪'}</div>
          <div class="li-main"><h4>${p.title}</h4>
          <p>章内机制回响 · 标准解 ${p.par} 步 · ${done ? '今日已完成' : '挑战（保证可解）'}</p></div>
          <div class="li-right">${done ? '✦15' : '挑战 ›'}</div>`;""")

# 结算页：非主线模式时"下一关"改为"返回"
rep("""    [1, 2, 3].forEach(i => $('star' + i).classList.remove('lit'));
    $('settle-overlay').classList.remove('hidden');""",
"""    [1, 2, 3].forEach(i => $('star' + i).classList.remove('lit'));
    $('btn-settle-next').textContent = (App.ctx.mode === 'story') ? '下一关 ›' : '返回 ›';
    $('settle-overlay').classList.remove('hidden');""")

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ui fixed')
