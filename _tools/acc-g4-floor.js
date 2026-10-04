// 《深渊词条》过关验收（独立验证，不依赖子代理的自证）
// 流程：进入游戏 → 跳过新手引导（否则欢迎卡会冻结世界）→ 进楼梯房 → 验证封印提示 → 清怪 → 按 E 下一层，连过 3 层
// 用法: node probe.mjs <url> <out.png> --wait=3000 --click=640,353 --wait=2500 --evalFile=acc-g4-floor.js
window.__f4 = { log: [] };
function L(m){ window.__f4.log.push(m); }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

new Promise(function(done){
  (async function(){
    for (var w = 0; w < 60 && !(typeof G !== 'undefined' && G && G.state === 'play'); w++) await sleep(250);
    if(!(typeof G !== 'undefined' && G && G.state === 'play')){ L('✘ 没进入游戏'); done(JSON.stringify(window.__f4)); return; }
    L('① 进入游戏，层=' + G.run.floor + '  state=' + G.state);

    // —— 先处理新手引导：欢迎卡是 hold 状态，会冻结世界 ——
    var tut = G.tutorial;
    L('② 新手引导: ' + JSON.stringify(tut));
    var held = !!(tut && tut.hold);
    var seenBefore = !!(Meta && Meta.data && Meta.data.flags && Meta.data.flags.tutorialDone);
    L('   引导存在=' + !!tut + '  hold(冻结世界)=' + held + '  存档已看过=' + seenBefore);
    if (tut && tut.active) {
      var skipBtn = document.getElementById('tut-skip');
      if (skipBtn) { skipBtn.click(); L('   点了「跳过引导」按钮'); }
      else { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); L('   按 Esc 跳过'); }
      await sleep(400);
    }
    tut = G.tutorial;
    L('   跳过之后: active=' + (tut && tut.active) + ' hold=' + (tut && tut.hold));

    for (var step = 0; step < 3; step++) {
      var f0 = G.run.floor;
      var rooms = G.floorData.rooms;
      var si = rooms.findIndex(function(r){ return r.type === 'stairs'; });
      if (si < 0) { L('第 ' + f0 + ' 层没有楼梯房'); break; }
      G.enterRoom(si, -1);
      await sleep(800);

      var pk = G.cur.exitPk;
      L('③ 第 ' + f0 + ' 层 楼梯房：入口=' + (pk ? '@' + Math.round(pk.x) + ',' + Math.round(pk.y) : '✘无') +
        '  locked=' + !!G.cur.locked);

      // 站到入口上，读取游戏自己的交互提示（提示是画在 canvas 上的，不看 DOM）
      G.player.x = pk.x; G.player.y = pk.y;
      await sleep(400);
      var t1 = G.interactTarget;
      L('   站上去（未清怪）: interactTarget=' + (t1 ? '"' + t1.label + '" blocked=' + t1.blocked : 'null'));

      // 清怪：走游戏自己的死亡路径 killEnemy（光改 hp 不会移除）
      var guard = 0;
      while (G.enemies.length && guard++ < 60) {
        G.player.hp = 1e9; G.player.maxHp = 1e9;   // 免得站着被打死影响验证
        G.enemies.slice().forEach(function (e) {
          if (typeof G.killEnemy === 'function') G.killEnemy(e);
          else e.hp = -1;
        });
        await sleep(80);
      }
      await sleep(600);
      G.player.x = pk.x; G.player.y = pk.y;
      await sleep(400);
      var t2 = G.interactTarget;
      L('   清怪后: enemies=' + G.enemies.length + ' locked=' + !!G.cur.locked +
        '  interactTarget=' + (t2 ? '"' + t2.label + '" blocked=' + t2.blocked : 'null'));
      if (G.enemies.length) {
        L('   ⚠ 仍有敌人未清: ' + G.enemies.slice(0,3).map(function(e){ return (e.type||'?') + '(hp=' + Math.round(e.hp||0) + ',dead=' + !!e.dead + ')'; }).join(', '));
      }

      // 按 E 下一层（升级弹窗会挡住互动，先处理掉，并记录是否真的出现过）
      if (G.modal || G.pendingLevels) {
        L('   （有升级/选择弹窗挡着: modal=' + JSON.stringify(G.modal && (G.modal.title || G.modal.tag || true)) + ' pendingLevels=' + G.pendingLevels + ' → 先关掉）');
        if (typeof UI.closeModal === 'function') UI.closeModal();
        G.modal = null; G.pendingLevels = 0;
        await sleep(300);
        G.player.x = pk.x; G.player.y = pk.y;
        await sleep(200);
      }
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', bubbles: true }));
      for (var w2 = 0; w2 < 50 && G.run.floor === f0; w2++) await sleep(120);
      L('④ 按 E 之后 → 层数 ' + f0 + ' → ' + G.run.floor + (G.run.floor > f0 ? '  ✔ 成功进入下一层' : '  ✘ 没有推进'));
      if (G.run.floor === f0) break;
    }
    L('⑤ 最终层数=' + G.run.floor + '  state=' + G.state);
    done(JSON.stringify(window.__f4));
  })();
})
