# -*- coding: utf-8 -*-
"""一次性补丁：修正 ui.js 的若干问题"""
import io

p = 'js/ui.js'
s = io.open(p, encoding='utf-8').read()

def rep(old, new):
    global s
    assert old in s, 'NOT FOUND: ' + old[:70]
    s = s.replace(old, new, 1)

# A. 星星动画行清理
rep("""    for (let i = 0; i < stars; i++) {
      setTimeout(() => { $('star' + i + 1 === undefined ? 0 : 0); $('star' + (i + 1)).classList.add('lit'); AU.star(i); }, 350 + i * 420);
    }""",
"""    for (let i = 0; i < stars; i++) {
      setTimeout(() => { $('star' + (i + 1)).classList.add('lit'); AU.star(i); }, 350 + i * 420);
    }""")

# B. 暂停菜单文案与提示按钮
rep("""  function pauseMenu() {
    const def = App.def;
    showModal('⏸ ' + (def ? def.title : '暂停'), '目标 ${n} 个 · 已用步数 ${s}'.replace('${n}', def ? def.goals.length : 0).replace('${s}', App.game ? App.game.steps : 0),
      [
        { text: '提示 ' + (App.hintStep || 0 + 1 < (def && def.hint ? def.hint.length + 1 : 1) ? '' : ''), fn: showHintStep, primary: false },
        { text: '重新开始', fn: () => restartLevel() },
        { text: '因果星图', fn: openGraph },
        { text: '离开关卡', primary: true, fn: () => exitLevel() },
      ]);
  }""",
"""  function pauseMenu() {
    const def = App.def;
    const body = `目标 ${def ? def.goals.length : 0} 个 · 已用步数 ${App.game ? App.game.steps : 0}<br>
      <small style="color:var(--ink-dim)">快捷键：Q 撤销 / E 重做 / R 重开 / G 星图 / 空格切线 · 长按节点可预览涟漪</small>`;
    showModal('⏸ ' + (def ? def.title : '暂停'), body,
      [
        { text: '看提示', fn: showHintStep },
        { text: '重新开始', fn: () => restartLevel() },
        { text: '因果星图', fn: openGraph },
        { text: '离开关卡', primary: true, fn: () => exitLevel() },
      ]);
  }""")

# C. applyShard：防点击穿透 + 无限回环计数 + 沙漏豁免
rep("""    const ok = g.applyOp(op);
    App.moveSrc = null;
    document.querySelectorAll('.cell.sel').forEach(c => c.classList.remove('sel'));
    if (!ok) {
      opInvalid(g.msg || '无效操作（完整度 -5）');
    } else {
      AU.gear();
      animateWave(g.lastWave);
      if (g.msg) toast(g.msg, 1600);
    }
    renderAll();
    afterOp();""",
"""    const ok = g.applyOp(op);
    App.moveSrc = null;
    App.suppressClick = true;
    setTimeout(() => { App.suppressClick = false; }, 250);
    document.querySelectorAll('.cell.sel').forEach(c => c.classList.remove('sel'));
    if (!ok) {
      opInvalid(g.msg || '无效操作（完整度 -5）');
    } else {
      AU.gear();
      animateWave(g.lastWave);
      if (g.msg && g.msg.indexOf('时间风暴') < 0 && g.msg.indexOf('操作完成') < 0) toast(g.msg, 1600);
      if (g.msg && g.msg.indexOf('时间风暴') >= 0) {
        stormFx();
        toast(g.msg, 2400);
      }
      if (App.mode === 'endless' && App.endless) App.endless.fixes++;
    }
    if (App.mode !== 'endless') renderAll(); else { renderBag(); renderItems(); }
    hidePreview();
    afterOp();""")

# D. bindCell 点击防穿透
rep("""    c.addEventListener('click', () => {
      const target = { t: c.dataset.t, s: +c.dataset.s };
      if (App.sel) applyShard(App.sel, target);
      else if (App.moveSrc) {
        const sh = App.def.shards.find(s => s.id === App.sel);
        void sh;
      }
    });""",
"""    c.addEventListener('click', () => {
      if (App.suppressClick) return;
      const target = { t: c.dataset.t, s: +c.dataset.s };
      if (App.sel) applyShard(App.sel, target);
    });""")

# E. 星图纵轴平移
rep("""    const pos = (n) => ({
      x: W / 2 + (n.s - (maxSlot - 1) / 2) * (150 * G.scale) + G.ox,
      y: 70 + colX[n.t] * 0 + ({ past: 60, present: 260, future: 460 })[n.t] + 0,
    });""",
"""    const pos = (n) => ({
      x: W / 2 + (n.s - (maxSlot - 1) / 2) * (150 * G.scale) + G.ox,
      y: ({ past: 60, present: 260, future: 460 })[n.t] + G.oy,
    });""")
rep("    const colX = { past: 0.18, present: 0.5, future: 0.82 };\n", "")

# F. 风暴特效函数
rep("""  function opInvalid(msg) {""",
"""  function stormFx() {
    AU.storm();
    $('storm-overlay').classList.add('on');
    document.getElementById('board').classList.add('shaking');
    setTimeout(() => {
      $('storm-overlay').classList.remove('on');
      document.getElementById('board').classList.remove('shaking');
    }, 1100);
  }

  function opInvalid(msg) {""")

# G. 无限回环循环：不重绘整包，避免打断拖拽
rep("""    $('btn-undo').disabled = true; $('btn-redo').disabled = true;
    renderBoard();
    endlessTimer = setTimeout(endlessTick, 400);""",
"""    $('btn-undo').disabled = true; $('btn-redo').disabled = true;
    renderBoard();
    endlessTimer = setTimeout(endlessTick, 500);""")

# H. restartLevel 支持无限回环
rep("""  function restartLevel() { startLevel(App.def, App.ctx); }""",
"""  function restartLevel() {
    if (App.def && App.def.id === 'endless') { startEndless(); return; }
    startLevel(App.def, App.ctx);
  }""")

# I. 键盘守卫
rep("""      if (!inGame || App.mode === 'endless') return;""",
"""      if (!inGame || !App.game || App.mode === 'endless' || App.mode === 'endless-over') return;""")

# J. 背包标签：无 track 显示"任意线"
rep("""        <span class="sc-track">${sh.kind === 'plant' ? '预置闭环' : sh.kind === 'move' ? '拖拽搬移' : TRACK_CN[sh.track] + '线'}</span>`;""",
"""        <span class="sc-track">${sh.kind === 'plant' ? '预置闭环' : sh.kind === 'move' ? '拖拽搬移' : (sh.track ? TRACK_CN[sh.track] + '线' : '任意线')}</span>`;""")

# K. 结算中的"下一关"对 lab/rift 的处理保持 exitLevel
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('UI PATCH OK')
