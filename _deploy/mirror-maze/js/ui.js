/* ============================================================
   UI 层 — 存档 / 菜单流程 / HUD / 结算 / 图鉴 / 设置 / 新手引导
   ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  /* ================= 存档（本地 JSON，实时写入） ================= */
  const SAVE_KEY = "mirror_maze_save_v1";
  const SAVE = {
    v: 1,
    unlocked: 0,
    stars: {},              // idx -> { s, sh:[b,b,b], steps, time }
    seen: {},               // 教程/图鉴已见
    settings: { bgm: 45, sfx: 70, shapes: true, reduce: false, zen: false, vibro: true },
    ended: false,
  };
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        Object.assign(SAVE, s);
        SAVE.settings = Object.assign({ bgm: 45, sfx: 70, shapes: true, reduce: false, zen: false, vibro: true }, s.settings || {});
      }
    } catch (e) { }
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { }
  }
  const isDebug = new URLSearchParams(location.search).get("debug") === "1";
  function levelUnlocked(idx) { return isDebug || idx <= SAVE.unlocked; }
  function totalShards() {
    let n = 0;
    for (const k in SAVE.stars) { const st = SAVE.stars[k].sh || []; n += st.filter(Boolean).length; }
    return n;
  }
  function totalStars() {
    let n = 0;
    for (const k in SAVE.stars) n += SAVE.stars[k].s || 0;
    return n;
  }

  /* ================= 图鉴 / 教程内容 ================= */
  const TUTS = {
    move: { icon: "🎮", name: "同步移动", desc: "一套输入同时驱动两个镜像角色。棱（左·青）与镜（右·橙）的位置永远关于镜轴对称。" },
    plate: { icon: "⬓", name: "同步压力板", desc: "成对的压力板都被踩过后（踩下会保持），对应的门才会开启。两个影子必须都到过各自的那块板。" },
    spike: { icon: "✕", name: "地刺与检查点", desc: "触碰地刺或坠落，影子会消散并在最近的检查点重生，没有任何惩罚——大胆试错。旗子是检查点。" },
    shard: { icon: "◆", name: "镜之碎片", desc: "每关藏着 3 枚镜之碎片（两岸的镜像对共享同一枚）。集齐 3 枚拿第二颗星，步数达标拿第三颗。" },
    portal: { icon: "◎", name: "镜像传送门", desc: "单向传送：踩上 o，会从对岸对称位置的 O 出现。两个影子会交换彼此的两岸。" },
    asym: { icon: "◑", name: "不对称警告", desc: "从这一刻起，两岸地形可能不完全相同。镜像的直觉会失效，请仔细观察两岸的差异。" },
    delay: { icon: "◷", name: "延迟镜像", desc: "右侧的镜延迟 0.5 秒复刻你的操作。看着镜轴上的虚线，预判半拍之后的对岸。" },
    beat: { icon: "▤", name: "节拍平台", desc: "节拍平台随中轴的脉动时隐时现（紫色圆环显示剩余时间）。实心时落脚，虚化前离开。" },
    reverse: { icon: "⇄", name: "反向镜像", desc: "按右，两个人都向右移动——镜像的直觉彻底反转。把两个影子当作一支同进同退的队伍来调度。" },
    beam: { icon: "✦", name: "棱镜光束", desc: "站上棱镜平台 j 会激活折光镜 q，改变光束路径。两侧水晶 * 都被点亮后门 H 开启（点亮会保持）。" },
    gravity: { icon: "⇅", name: "重力幕帘", desc: "触碰发光幕帘 w 的瞬间，重力翻转。沿着天花板倒行，再触碰下一道幕帘翻回地面。" },
    partial: { icon: "◲", name: "局部镜像", desc: "只有横移被镜像，右侧没有跳跃。右岸的路必须平——你的每次跳跃都要考虑对岸走不走得通。" },
    broken: { icon: "❖", name: "碎镜分控", desc: "穿过碎镜结界 z，镜像规则被打破：WASD 控制棱（左），方向键控制镜（右），一心二用。" },
  };

  /* ================= 屏幕管理 ================= */
  let curScreen = "screen-title";
  const SCREENS = ["screen-title", "screen-chapters", "screen-levels", "screen-settings", "screen-codex", "screen-about", "screen-help"];
  const backStack = [];
  function show(id, push = true) {
    SCREENS.forEach((s) => $(s).classList.toggle("hidden", s !== id));
    $("game-layer").classList.add("hidden");
    $("modal-pause").classList.add("hidden");
    if (push && id !== curScreen) backStack.push(curScreen);
    curScreen = id;
    if (id === "screen-chapters") renderChapters();
    if (id === "screen-levels") renderLevels();
    if (id === "screen-codex") renderCodex();
    if (id === "screen-settings") renderSettings();
    if (id === "screen-title") renderTitleInfo();
  }
  function back() {
    const prev = backStack.pop();
    if ((prev === null || prev === undefined) && (MMGame.state === "paused" || MMGame.state === "playing")) {
      // 从游戏内（暂停）打开的界面 → 回到游戏
      SCREENS.forEach((s) => $(s).classList.add("hidden"));
      $("game-layer").classList.remove("hidden");
      $("hud").classList.remove("hidden");
      $("touch-layer").classList.toggle("hidden", !MMInput.touchEnabled);
      if (MMGame.state === "paused") $("modal-pause").classList.remove("hidden");
      curScreen = null;
      return;
    }
    show(prev || "screen-title", false);
  }

  /* ================= HUD ================= */
  const hud = {};
  function bindHud() {
    hud.el = $("hud"); hud.name = $("hud-level-name"); hud.chip = $("hud-mode-chip");
    hud.shards = $("hud-shards"); hud.steps = $("hud-steps"); hud.undo = $("hud-undo");
    hud.hintBox = $("hud-hint-box"); hud.toast = $("hud-toast");
    $("hud-pause").onclick = () => pauseGame();
    $("hud-undo").onclick = () => MMGame.undo();
    $("hud-restart").onclick = () => { MMGame.restart(); hideToast(); hud.hintBox.classList.add("hidden"); };
    $("hud-hint").onclick = () => showHint(false);
    hud.hintBox.onclick = () => hud.hintBox.classList.add("hidden");
    hud.toast.onclick = () => hideToast();
  }
  const _shardCache = {};
  function lvShardIds() {
    const idx = MMGame.levelIdx;
    if (_shardCache[idx]) return _shardCache[idx];
    const ids = {};
    for (const row of MMLevels.LEVELS[idx].map) for (const ch of row) if (ch >= "1" && ch <= "3") ids[ch] = true;
    _shardCache[idx] = ids;
    return ids;
  }
  function refreshHud() {
    const idx = MMGame.levelIdx;
    const def = MMLevels.LEVELS[idx];
    const sameCh = MMLevels.LEVELS.filter((l) => l.ch === def.ch);
    hud.name.textContent = `${def.ch}-${sameCh.indexOf(def) + 1} ${def.name}`;
    hud.chip.textContent = MMGame.MODE_NAME[MMGame.mode];
    hud.chip.classList.toggle("broken", MMGame.mode === "broken");
    hud.shards.innerHTML = "";
    for (let i = 1; i <= 3; i++) {
      const d = document.createElement("div");
      d.className = "sh";
      d.textContent = "◆";
      hud.shards.appendChild(d);
    }
    updateShards();
  }
  function updateShards() {
    if (!hud.steps) return;
    const ids = Object.keys(lvShardIds());
    const got = MMGame.shardSet;
    const els = hud.shards.children;
    for (let s = 1; s <= 3; s++) {
      const el = els[s - 1];
      if (el) el.classList.toggle("got", ids.includes(String(s)) && got.has(String(s)));
    }
    hud.steps.textContent = `步数 ${MMGame.steps} / ${MMLevels.LEVELS[MMGame.levelIdx].par}`;
    hud.undo.disabled = !MMGame.canUndo;
  }

  /* ---------- 提示 / 浮层 ---------- */
  let toastTimer = null;
  function showToast(html, opts) {
    opts = opts || {};
    hud.toast.innerHTML = html;
    hud.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    if (!opts.sticky) toastTimer = setTimeout(hideToast, opts.short ? 1400 : 4600);
  }
  function hideToast() { hud.toast.classList.add("hidden"); clearTimeout(toastTimer); }
  function showHint(auto) {
    const lv = MMLevels.LEVELS[MMGame.levelIdx];
    hud.hintBox.innerHTML = (auto ? "<b>卡住啦？这是强提示——</b>" : "<b>提示</b>　") + lv.hint;
    hud.hintBox.classList.remove("hidden");
    MMGame.sfxUI();
  }

  /* ================= 进入关卡 / 退出 ================= */
  let curChapter = 1;
  function playLevel(idx) {
    SCREENS.forEach((s) => $(s).classList.add("hidden"));
    $("modal-result").classList.add("hidden");
    $("game-layer").classList.remove("hidden");
    hud.el.classList.remove("hidden");
    if (MMInput.touchEnabled) $("touch-layer").classList.remove("hidden");
    hideToast();
    hud.hintBox.classList.add("hidden");
    backStack.length = 0;
    curScreen = null;
    MMGame.startLevel(idx, SAVE.settings);
    refreshHud();
    MMAudio.startBgm(MMLevels.LEVELS[idx].ch - 1);
    MMAudio.setVolumes(SAVE.settings.sfx / 100, SAVE.settings.bgm / 100);
    const def = MMLevels.LEVELS[idx];
    if (def.tut && !SAVE.seen[def.tut]) {
      const t = TUTS[def.tut];
      showToast(`<b>新规则 · ${t.name}</b><br>${t.desc}<br><span style="opacity:.6;font-size:12px">点击任意处关闭</span>`, { sticky: true });
      SAVE.seen[def.tut] = true;
      writeSave();
    }
  }
  function exitToChapters() {
    MMGame.stop();
    $("game-layer").classList.add("hidden");
    hud.el.classList.add("hidden");
    $("touch-layer").classList.add("hidden");
    show("screen-levels", false);
  }

  /* ================= 暂停 ================= */
  function pauseGame() {
    if (MMGame.state !== "playing") return;
    MMGame.pause();
    $("modal-pause").classList.remove("hidden");
    MMGame.sfxUI();
  }
  function resumeGame() {
    $("modal-pause").classList.add("hidden");
    MMGame.resume();
    hideToast();
  }

  /* ================= 结算 ================= */
  function showResult(d) {
    const idx = MMGame.levelIdx;
    const lv = MMLevels.LEVELS[idx];
    const prev = SAVE.stars[idx] || { s: 0, sh: [0, 0, 0], steps: Infinity, time: Infinity };
    const sh = [0, 1, 2].map((i) => (prev.sh || [0, 0, 0])[i] || (d.shards[i] ? 1 : 0));
    SAVE.stars[idx] = {
      s: Math.max(prev.s || 0, d.stars),
      sh,
      steps: Math.min(prev.steps, d.steps),
      time: Math.min(prev.time, d.time),
    };
    SAVE.unlocked = Math.max(SAVE.unlocked, idx + 1);
    writeSave();

    $("result-title").textContent = d.stars >= 3 ? "完美对称！" : "对称达成！";
    $("result-rows").innerHTML =
      `<div class="result-row"><span>镜之碎片</span><span class="r-val ${d.shards.every(Boolean) ? "good" : ""}">${d.shards.filter(Boolean).length} / 3</span></div>` +
      `<div class="result-row"><span>步数（目标 ${lv.par}）</span><span class="r-val ${d.steps <= lv.par ? "good" : "bad"}">${d.steps}</span></div>` +
      `<div class="result-row"><span>用时</span><span class="r-val">${d.time.toFixed(1)}s</span></div>`;
    for (let i = 1; i <= 3; i++) {
      const el = $("star-" + i);
      el.classList.remove("lit");
      if (i <= d.stars) setTimeout(() => { el.classList.add("lit"); MMAudio.play("star"); }, 250 + i * 380);
    }
    $("result-next").textContent = idx >= MMLevels.LEVELS.length - 1 ? "完成冒险" : "下一关";
    $("modal-result").classList.remove("hidden");
  }
  function afterResultNext() {
    $("modal-result").classList.add("hidden");
    const idx = MMGame.levelIdx;
    if (idx >= MMLevels.LEVELS.length - 1) { showEnding(); return; }
    playLevel(idx + 1);
  }
  function showEnding() {
    MMGame.stop();
    $("game-layer").classList.add("hidden");
    hud.el.classList.add("hidden");
    $("touch-layer").classList.add("hidden");
    SAVE.ended = true;
    writeSave();
    $("ending-text").innerHTML =
      `双子「棱」与「镜」集齐了散落全城的镜之碎片，真实之镜的诅咒应声碎裂。<br><br>` +
      `漂浮之城重新合拢，两岸的光在镜轴上交汇成一线——<b>你用一套输入，舞动了两个世界。</b><br><br>` +
      `<span style="opacity:.75">累计碎片 ${totalShards()} / 90 · 累计星级 ${totalStars()} / 90</span>`;
    $("modal-ending").classList.remove("hidden");
  }

  /* ================= 菜单渲染 ================= */
  function renderTitleInfo() {
    $("btn-continue").classList.toggle("hidden", SAVE.unlocked === 0);
    const lv = Math.floor(totalShards() / 30) + 1;
    $("title-save-info").innerHTML = SAVE.unlocked > 0
      ? `镜之碎片 ${totalShards()} · 星级 ${totalStars()} · 收集者等级 Lv.${lv}${SAVE.ended ? " · ✦ 已见证结局" : ""}`
      : "一座被真实之镜诅咒的漂浮之城，等待双子重归对称";
  }
  function renderChapters() {
    $("chapters-shard-total").textContent = `碎片 ${totalShards()} · ★ ${totalStars()}`;
    const box = $("chapter-list");
    box.innerHTML = "";
    MMLevels.CHAPTERS.forEach((ch) => {
      const levels = MMLevels.chapterLevels(ch.id);
      const firstIdx = MMLevels.LEVELS.indexOf(levels[0]);
      const unlocked = levelUnlocked(firstIdx);
      let stars = 0;
      levels.forEach((l) => { stars += (SAVE.stars[MMLevels.LEVELS.indexOf(l)] || {}).s || 0; });
      const card = document.createElement("div");
      card.className = "chapter-card" + (unlocked ? "" : " locked");
      card.innerHTML = `
        <div class="ch-icon" style="background:${ch.theme.tile};color:${ch.theme.accent}">${ch.icon}</div>
        <div class="ch-body">
          <div class="ch-name">${ch.name}</div>
          <div class="ch-sub">${ch.sub} · ${levels.length} 关</div>
        </div>
        <div class="ch-stars">★ <b>${stars}</b>/${levels.length * 3}</div>
        ${unlocked ? "" : '<div class="ch-lock">🔒</div>'}`;
      if (unlocked) card.onclick = () => { curChapter = ch.id; show("screen-levels"); MMAudio.play("ui"); };
      box.appendChild(card);
    });
  }
  function renderLevels() {
    const ch = MMLevels.CHAPTERS[curChapter - 1];
    $("levels-title").textContent = ch.name;
    const levels = MMLevels.chapterLevels(ch.id);
    let shards = 0;
    levels.forEach((l) => { shards += ((SAVE.stars[MMLevels.LEVELS.indexOf(l)] || {}).sh || []).filter(Boolean).length; });
    $("levels-shard-info").textContent = `碎片 ${shards}/${levels.length * 3}`;
    const grid = $("level-grid");
    grid.innerHTML = "";
    levels.forEach((l, i) => {
      const idx = MMLevels.LEVELS.indexOf(l);
      const rec = SAVE.stars[idx];
      const unlocked = levelUnlocked(idx);
      const cell = document.createElement("div");
      cell.className = "level-cell" + (unlocked ? "" : " locked");
      const stars = rec ? rec.s : 0;
      const starStr = [1, 2, 3].map((n) => `<span class="${n <= stars ? "on" : ""}">★</span>`).join("");
      const shCount = rec ? (rec.sh || []).filter(Boolean).length : 0;
      cell.innerHTML = `
        <div class="lc-num">${i + 1}</div>
        <div class="lc-name">${l.name}</div>
        <div class="lc-stars">${starStr}</div>
        ${shCount ? `<div class="lc-shards">◆${shCount}</div>` : ""}`;
      if (unlocked) cell.onclick = () => { playLevel(idx); MMAudio.play("ui"); };
      grid.appendChild(cell);
    });
  }
  function renderCodex() {
    const keys = Object.keys(TUTS);
    const got = keys.filter((k) => SAVE.seen[k]).length;
    $("codex-count").textContent = `${got}/${keys.length}`;
    const box = $("codex-list");
    box.innerHTML = "";
    keys.forEach((k) => {
      const t = TUTS[k];
      const seen = !!SAVE.seen[k];
      const it = document.createElement("div");
      it.className = "codex-item" + (seen ? "" : " cx-locked");
      it.innerHTML = `<div class="cx-icon">${seen ? t.icon : "？"}</div><div><div class="cx-name">${seen ? t.name : "尚未发现"}</div><div class="cx-desc">${seen ? t.desc : "在冒险中遇见它，图鉴会自动记录。"}</div></div>`;
      box.appendChild(it);
    });
  }
  function renderSettings() {
    $("set-bgm").value = SAVE.settings.bgm;
    $("set-sfx").value = SAVE.settings.sfx;
    $("set-shapes").checked = SAVE.settings.shapes;
    $("set-reduce").checked = SAVE.settings.reduce;
    $("set-zen").checked = SAVE.settings.zen;
    $("set-vibro").checked = SAVE.settings.vibro;
  }
  function applySettings() {
    SAVE.settings = {
      bgm: +$("set-bgm").value, sfx: +$("set-sfx").value,
      shapes: $("set-shapes").checked, reduce: $("set-reduce").checked,
      zen: $("set-zen").checked, vibro: $("set-vibro").checked,
    };
    MMGame.setSettings(SAVE.settings);
    MMAudio.setVolumes(SAVE.settings.sfx / 100, SAVE.settings.bgm / 100);
    document.body.classList.toggle("reduce-motion", SAVE.settings.reduce);
    writeSave();
  }

  /* ================= 游戏事件 ================= */
  function bindGameEvents() {
    MMGame.onEvent = (type, data) => {
      if (type === "hud") updateShards();
      else if (type === "mode") {
        hud.chip.textContent = MMGame.MODE_NAME[MMGame.mode];
        hud.chip.classList.toggle("broken", MMGame.mode === "broken");
      }
      else if (type === "hint") showHint(true);
      else if (type === "win") showResult(data);
    };
  }

  /* ================= 绑定 ================= */
  function bind() {
    $("btn-new").onclick = () => { MMAudio.unlock(); playLevel(isDebug ? 0 : Math.min(SAVE.unlocked, MMLevels.LEVELS.length - 1)); };
    $("btn-continue").onclick = () => { MMAudio.unlock(); playLevel(Math.min(SAVE.unlocked, MMLevels.LEVELS.length - 1)); };
    $("btn-chapters").onclick = () => show("screen-chapters");
    $("btn-help").onclick = () => show("screen-help");
    $("btn-codex").onclick = () => show("screen-codex");
    $("btn-settings").onclick = () => show("screen-settings");
    $("btn-about").onclick = () => show("screen-about");
    document.querySelectorAll("[data-back]").forEach((b) => (b.onclick = () => back()));
    $("pause-resume").onclick = resumeGame;
    $("pause-restart").onclick = () => { MMGame.restart(); resumeGame(); hideToast(); };
    $("pause-codex").onclick = () => show("screen-codex");
    $("pause-exit").onclick = () => exitToChapters();
    $("result-replay").onclick = () => { $("modal-result").classList.add("hidden"); MMGame.restart(); refreshHud(); };
    $("result-next").onclick = afterResultNext;
    $("ending-close").onclick = () => { $("modal-ending").classList.add("hidden"); show("screen-title"); };
    $("btn-reset-save").onclick = () => {
      if (confirm("确定重置全部进度吗？此操作不可撤销。")) {
        localStorage.removeItem(SAVE_KEY);
        Object.assign(SAVE, { unlocked: 0, stars: {}, seen: {}, ended: false });
        renderTitleInfo();
      }
    };
    ["set-bgm", "set-sfx", "set-shapes", "set-reduce", "set-zen", "set-vibro"].forEach((id) => {
      $(id).addEventListener("change", applySettings);
    });
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      const inGame = curScreen === null;
      const resultOpen = !$("modal-result").classList.contains("hidden");
      if ((k === "escape" || k === "p") && inGame && !resultOpen) {
        if ($("modal-pause").classList.contains("hidden")) pauseGame();
        else resumeGame();
      }
      if (inGame && !resultOpen && k === "r" && MMGame.state === "playing") { MMGame.restart(); refreshHud(); hideToast(); hud.hintBox.classList.add("hidden"); }
      if (inGame && !resultOpen && k === "z") MMGame.undo();
      if (inGame && !resultOpen && k === "h") showHint(false);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && MMGame.state === "playing") pauseGame();
    });
    window.addEventListener("resize", () => MMGame.onResize());
  }

  /* ================= 启动 ================= */
  function boot() {
    loadSave();
    MMGame.init($("game-canvas"));
    MMInput.setupTouch($("touch-layer"), $("stick-zone-left"), $("stick-zone-right"), $("btn-jump-left"), $("btn-jump-right"));
    MMGame.setSettings(SAVE.settings);
    MMAudio.setVolumes(SAVE.settings.sfx / 100, SAVE.settings.bgm / 100);
    document.body.classList.toggle("reduce-motion", SAVE.settings.reduce);
    bindHud();
    bindGameEvents();
    bind();
    const unlockOnce = () => {
      MMAudio.unlock();
      if (MMGame.state !== "playing") MMAudio.startBgm(0);
      window.removeEventListener("pointerdown", unlockOnce);
      window.removeEventListener("keydown", unlockOnce);
    };
    window.addEventListener("pointerdown", unlockOnce);
    window.addEventListener("keydown", unlockOnce);
    show("screen-title", false);
    const checkOrient = () => {
      const portrait = window.innerHeight > window.innerWidth;
      const touch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
      $("rotate-hint").classList.toggle("hidden", !(portrait && touch));
    };
    window.addEventListener("resize", checkOrient);
    checkOrient();
  }

  window.MMUI = { boot, showToast, hideToast, exitToChapters, SAVE, writeSave };
})();
