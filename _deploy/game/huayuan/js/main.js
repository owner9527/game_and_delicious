/* ============================================================
   情绪花园 — 启动与主循环
   ============================================================ */
window.EG = window.EG || {};

(function () {
  let lastFrame = performance.now();
  let frameCount = 0;
  let lastInteract = Date.now();

  function boot() {
    const canvas = document.getElementById('garden');
    EG.Garden.init(canvas);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    bindUI();
    const loaded = EG.Game.load();
    if (loaded) {
      const g = EG.G;
      EG.Audio.four32 = !!g.settings.four32;
      EG.UI.refreshHUD();
      EG.Garden.layout();
      const summary = EG.Game.catchup();
      EG.Game.checkEvents();
      if (summary.gapH > 8) EG.UI.openLetter(summary);
      else EG.Tutorial.maybeStart();
    } else {
      EG.UI.openFirstRun();
    }
    /* 主循环：1 秒逻辑 tick */
    setInterval(() => {
      if (!EG.G) return;
      EG.Game.tick();
      if (EG.G._tick % 5 === 0) EG.UI.refreshHUD();
    }, 1000);
    /* 渲染循环 */
    requestAnimationFrame(render);
    /* 首次交互后启动 BGM（浏览器自动播放策略） */
    const startBgm = () => {
      if (EG.G && EG.G.settings.bgm) { EG.Audio.ensure() && EG.BGM.start(); }
      window.removeEventListener('pointerdown', startBgm);
    };
    window.addEventListener('pointerdown', startBgm);
    /* 离开时保存 */
    window.addEventListener('beforeunload', () => EG.Game.save());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) EG.Game.save();
      lastInteract = Date.now();
    });
    ['pointerdown', 'keydown', 'wheel'].forEach(ev =>
      window.addEventListener(ev, () => { lastInteract = Date.now(); }, { passive: true }));
  }

  function render(now) {
    const dt = now - lastFrame;
    lastFrame = now;
    frameCount++;
    if (!document.getElementById('meditation').classList.contains('show') && EG.G) {
      /* 空闲 60 秒后降帧省电（约 15fps） */
      const idle = Date.now() - lastInteract > 60000;
      if (!idle || frameCount % 4 === 0) {
        EG.Garden.render(now);
        EG.Garden.trackPerf(dt);
      }
    }
    requestAnimationFrame(render);
  }

  function bindUI() {
    /* 底部工具条 */
    document.querySelectorAll('.tool-btn').forEach(b => {
      b.onclick = () => {
        EG.SFX.click();
        const t = b.dataset.tool;
        if (t === 'plant') {
          if (EG.Garden.pendingSeed) {
            EG.UI.hint('点一块亮起的空地，把情绪种下去 🌱');
            EG.UI.setToolActive('plant');
          } else EG.UI.openWizard();
        } else if (t === 'care') {
          EG.UI.setToolActive(null);
          EG.UI.hint('点一株植物，浇水、调光、或说说话');
        } else if (t === 'harvest') {
          EG.UI.setToolActive('harvest');
          EG.UI.hint('点一株绽放的植物，收获它 🌸');
        } else if (t === 'share') {
          EG.UI.openShare();
        }
      };
    });
    /* 四角菜单 */
    document.getElementById('btn-dex').onclick = () => { EG.SFX.click(); EG.UI.openDex(); };
    document.getElementById('btn-shop').onclick = () => { EG.SFX.click(); EG.UI.openShop(); };
    document.getElementById('btn-diary').onclick = () => { EG.SFX.click(); EG.UI.openDiary(); };
    document.getElementById('btn-setting').onclick = () => { EG.SFX.click(); EG.UI.openSettings(); };
    document.getElementById('btn-sound').onclick = () => {
      const g = EG.G; if (!g) return;
      const anyOn = g.settings.bgm || g.settings.sfx;
      g.settings.bgm = g.settings.sfx = !anyOn;
      EG.Audio.four32 = !!g.settings.four32;
      if (g.settings.bgm) EG.Audio.ensure() && EG.BGM.start();
      else { EG.BGM.stop(); EG.MusicPlayer.stop(); }
      EG.Audio.setVolume(g.settings.bgm, g.settings.sfx);
      EG.Game.save();
      EG.UI.refreshHUD();
    };
    /* 花园点击 */
    EG.Garden.onClick = idx => {
      lastInteract = Date.now();
      const g = EG.G;
      if (!g) return;
      if (idx < 0) { EG.UI.closeCare(); EG.UI.setToolActive(null); return; }
      if (idx >= g.grid.size * g.grid.size) {
        EG.toast('这片还没开垦——提升花园等级就能扩建');
        return;
      }
      const info = g.plots[idx];
      if (!info.unlocked) {
        EG.Game.unlockPlot(idx);
        EG.UI.refreshHUD();
        return;
      }
      if (info.plantId) {
        const pl = g.plants[info.plantId];
        if (!pl) { info.plantId = null; return; }
        if (EG.Garden.mode === 'harvest' && !pl.withered && EG.stageOf(pl.growth) >= 4) {
          EG.UI.doHarvest(pl.id);
          return;
        }
        EG.UI.openCare(pl.id);
        return;
      }
      if (EG.Garden.pendingSeed) {
        const seed = EG.Garden.pendingSeed;
        const pl = EG.Game.plant(seed, idx);
        if (pl) {
          EG.Garden.pendingSeed = null;
          EG.UI.setToolActive(null);
          EG.UI.hint('种下了一颗心情 🌱');
          if (EG.Tutorial) EG.Tutorial.onPlanted();
        }
        return;
      }
      EG.UI.hint('这块地空着——点「种植」，把今天的心情种进来吧');
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
