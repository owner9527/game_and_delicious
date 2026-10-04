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
  const SCREENS = ["screen-title", "screen-chapters", "screen-levels", "screen-overview", "screen-settings", "screen-codex", "screen-about", "screen-help"];
  const backStack = [];
  function show(id, push = true) {
    SCREENS.forEach((s) => $(s).classList.toggle("hidden", s !== id));
    $("game-layer").classList.add("hidden");
    $("modal-pause").classList.add("hidden");
    if (push && id !== curScreen) backStack.push(curScreen);
    curScreen = id;
    if (id === "screen-chapters") renderChapters();
    if (id === "screen-levels") renderLevels();
    if (id === "screen-overview") renderOverview();
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
    // 星级只由 通关/碎片/步数 决定（见 game.js checkWin），提示不参与 —— 在此向玩家明示
    hud.hintBox.innerHTML = (auto ? "<b>卡住啦？这是强提示——</b>" : "<b>提示</b>　") + lv.hint +
      '<div class="hb-star">✦ 使用提示<b>不影响</b>星级评价（星级只看通关 / 碎片 / 步数）</div>';
    hud.hintBox.classList.remove("hidden");
    MMGame.sfxUI();
  }

  /* ================= 进入关卡 / 退出 ================= */
  let curChapter = 1;
  function playLevel(idx, forceTut) {
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
    // 新手引导：首次进入自动触发；也可由菜单强制重看
    const which = (forceTut === "core" || forceTut === "beam") ? forceTut
      : (forceTut ? (hasBeam(idx) ? "beam" : "core") : tutAutoWhich(idx));
    if (def.tut && !SAVE.seen[def.tut]) {
      const t = TUTS[def.tut];
      // 与分步引导同时出现时不重复弹同义提示，避免两块浮层互相遮挡
      if (!which) showToast(`<b>新规则 · ${t.name}</b><br>${t.desc}<br><span style="opacity:.6;font-size:12px">点击任意处关闭</span>`, { sticky: true });
      SAVE.seen[def.tut] = true;
      writeSave();
    }
    if (which) tutStart(which, true);
  }
  function exitToChapters() {
    tutAbort();
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
    tutAbort();
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
    tutAbort();
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
  /* ---------- 关卡总览（30 关星级 / 最佳步数 + 未满三星筛选） ---------- */
  let ovOnlyNotFull = false;
  function renderOverview() {
    let stars = 0, notFull = 0;
    for (let i = 0; i < MMLevels.LEVELS.length; i++) {
      const s = (SAVE.stars[i] || {}).s || 0;
      stars += s;
      if (s < 3) notFull++;
    }
    $("overview-summary").textContent = `★ ${stars}/${MMLevels.LEVELS.length * 3} · 未满三星 ${notFull} 关`;
    $("ov-filter").textContent = ovOnlyNotFull ? "✓ 只看未满三星" : "只看未满三星";
    $("ov-filter").classList.toggle("on", ovOnlyNotFull);
    const grid = $("overview-grid");
    grid.innerHTML = "";
    if (ovOnlyNotFull && notFull === 0) {
      const tip = document.createElement("div");
      tip.className = "ov-empty";
      tip.textContent = "全部 30 关都已满三星——完美的对称！";
      grid.appendChild(tip);
      return;
    }
    MMLevels.LEVELS.forEach((l, idx) => {
      const rec = SAVE.stars[idx];
      const s = rec ? rec.s : 0;
      if (ovOnlyNotFull && s >= 3) return;
      const unlocked = levelUnlocked(idx);
      const cell = document.createElement("div");
      cell.className = "level-cell" + (unlocked ? "" : " locked");
      const starStr = [1, 2, 3].map((n) => `<span class="${n <= s ? "on" : ""}">★</span>`).join("");
      // 历史最佳步数：showResult 只在通关后写入有限值；无记录 = 尚未通关
      const best = (rec && typeof rec.steps === "number" && isFinite(rec.steps)) ? rec.steps : null;
      cell.innerHTML = `
        <div class="lc-ch">第${l.ch}章</div>
        <div class="lc-num">${idx + 1}</div>
        <div class="lc-name">${l.name}</div>
        <div class="lc-stars">${starStr}</div>
        <div class="lc-steps">${best === null ? "尚未通关" : "最佳 " + best + " 步"}</div>`;
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

  /* ============================================================
     新手分步引导（教练卡 coach mark + 聚光灯）
     · 独立存档键 TUT_KEY_CORE / TUT_KEY_BEAM，与 mirror_maze_save_v1 完全无关
     · 首次进入关卡自动触发；随时可跳过；可从主菜单 / 设置 / 暂停菜单重看
     · 整层 pointer-events:none —— 引导期间角色照样能跑能跳，不阻塞玩法
     ============================================================ */
  const TUT_KEY_CORE = "mirror_maze_tut_v1";
  const TUT_KEY_BEAM = "mirror_maze_tut_beam_v1";
  function tutSeen(k) { try { return localStorage.getItem(k) === "1"; } catch (e) { return false; } }
  function tutMark(k) { try { localStorage.setItem(k, "1"); } catch (e) { } }
  function tutSnap() { try { return MMGame.tutSnapshot(); } catch (e) { return null; } }

  // 世界坐标 → 屏幕坐标（与 game.js 的相机变换一致：translate(vw/2,vh/2) → scale(zoom) → translate(-cam)）
  function tutProj(s, wx, wy) {
    return { x: (wx - s.cam.x) * s.cam.zoom + s.vw / 2, y: (wy - s.cam.y) * s.cam.zoom + s.vh / 2 };
  }
  function tutWRect(s, wx, wy, ww, wh) {
    const a = tutProj(s, wx, wy), b = tutProj(s, wx + ww, wy + wh);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  }
  function tutUnion(rs) {
    const x0 = Math.min.apply(null, rs.map((r) => r.x)), x1 = Math.max.apply(null, rs.map((r) => r.x + r.w));
    const y0 = Math.min.apply(null, rs.map((r) => r.y)), y1 = Math.max.apply(null, rs.map((r) => r.y + r.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function tutCellBox(s, arr, padW) {
    const l = (arr || []).filter(Boolean);
    if (!l.length) return null;
    const p = padW === undefined ? 26 : padW;
    return tutUnion(l.map((c) => tutWRect(s, c.x - p, c.y - p, p * 2, p * 2)));
  }
  // 聚光灯目标：两个影子的实时包围盒（体现“一套输入同时驱动两侧”）
  function SP_CHARS(s) {
    const cs = (s.chars || []).filter((c) => !c.dead);
    if (!cs.length) return null;
    return tutUnion(cs.map((c) => tutWRect(s, c.x - 14, c.y - 14, s.cw + 28, s.ch + 28)));
  }
  const SP_EMIT = (s) => tutCellBox(s, s.emitters);
  const SP_MIRROR = (s) => tutCellBox(s, (s.mirrors || []).concat(s.switchMirrors || []));
  const SP_PAD = (s) => tutCellBox(s, s.pads);
  const SP_RECV = (s) => tutCellBox(s, s.receivers);
  const SP_NEAR_SHARD = (s) => {
    const rest = (s.shards || []).filter((x) => !x.got);
    if (!rest.length) return null;
    // 取离棱最近的一枚未收集碎片（引导视线）
    const c0 = (s.chars || [])[0] || { x: 0, y: 0 };
    let best = rest[0], bd = Infinity;
    for (const sh of rest) { const d = Math.abs(sh.x - c0.x) + Math.abs(sh.y - c0.y); if (d < bd) { bd = d; best = sh; } }
    return tutCellBox(s, [best]);
  };

  const TUT_CORE = [
    { pos: "c", spot: null, title: "欢迎来到镜像迷城 · Mirror Maze",
      text: "城里有双子：<b class=\"t-cyan\">棱</b>（左·青）与 <b class=\"t-orange\">镜</b>（右·橙），被真实之镜分隔在镜轴两侧。<br>目标只有一个：用<b>一套输入</b>同时驱动两人，让他们<b>同时走进各自的镜像之门</b>。<br>从主菜单「开始冒险 / 继续冒险」进入关卡；游戏中按 <b>Esc</b> 可以随时暂停。",
      done: null },
    { pos: "tl", spot: SP_CHARS, title: "第 1 步 · 移动：一套输入驱动两个人",
      keys: ["A", "D", "←", "→"],
      text: "按 <b>A / D</b> 或 <b>← / →</b>：两个影子会关于镜轴<b>永远对称</b>地一起移动——你只操作一套输入。",
      act: "按一下 A 或 D（←/→ 也行），让两个影子一起动起来",
      enter: (s) => { TUT.ref = (s.chars || []).map((c) => c.x); },
      done: (s) => {
        if (TUT.sig.move) return true;
        if (!TUT.ref || !s.chars) return false;
        return s.chars.some((c, i) => Math.abs(c.x - (TUT.ref[i] || 0)) > 26);
      }, doneMsg: "✅ 两个影子一起动了！" },
    { pos: "tl", spot: SP_CHARS, title: "第 2 步 · 跳跃",
      keys: ["空格", "W", "↑"],
      text: "按 <b>空格 / W / ↑</b> 跳跃。两人会<b>一起跳</b>，所以起跳点要选在“对岸也站得住”的位置。",
      act: "让任意一个影子跳起来一次",
      done: () => !!TUT.sig.jump, doneMsg: "✅ 跳起来了！" },
    { pos: "tl", spot: "#hud-mode-chip", title: "第 3 步 · 本关的镜像规则",
      text: "这个标签写着本关的镜像规则：<b>完全镜像 / 延迟镜像 / 反向镜像 / 局部镜像 / 碎镜独立</b>。<br>穿过碎镜结界后会变成 <b>WASD 控棱、方向键控镜</b>——一心二用。",
      done: null },
    { pos: "tl", spot: "#hud-shards", title: "第 4 步 · 收集镜之碎片",
      text: "右上角这三格是 <b>◆ 镜之碎片</b>：每关藏着 3 枚，<b>两岸的镜像对共享同一枚</b>，走到任意一侧就能拿到。<br>集齐 3 枚 = 第二颗星。",
      act: "顺手收集任意 1 枚碎片（也可以用“下一步”跳过）",
      done: (s) => !!s && s.got.length > 0, doneMsg: "✅ 拿到碎片！" },
    { pos: "tl", spot: "#hud-actions", title: "第 5 步 · 撤销 / 重开 / 提示",
      keys: ["Z", "R", "H"],
      text: "右上角三个按钮：<b>↩ 撤销</b>（最多回退 3 步）、<b>⟳ 重开本关</b>、<b>? 提示</b>；快捷键是 <b>Z / R / H</b>。<br>卡关 90 秒还会自动弹出强提示。",
      act: "按一下 Z，或点一下 ↩",
      done: () => !!TUT.sig.action, doneMsg: "✅ 会用工具了！" },
    { pos: "tl", spot: "#hud-steps", title: "第 6 步 · 过关条件：同时抵达镜像之门",
      text: "两岸最远端各有一扇 <b>镜像之门</b>，两个影子<b>同时</b>站进门里即过关。<br>右上角的步数只要不超过目标值就能拿第三颗星；碰到地刺没有惩罚，会在检查点重生——大胆试错。",
      done: null },
    { pos: "c", spot: null, title: "出发吧！",
      text: "机关（同步压力板 / 镜像传送门 / 棱镜光束 / 节拍平台 / 重力幕帘 / 碎镜结界）会在<b>第一次遇到的那一关</b>用同样的浮动卡片讲解；也可以回主菜单看「镜像法则图鉴」。<br>愿你们重归对称。",
      done: null },
  ];

  const TUT_BEAM = [
    { pos: "tl", spot: SP_EMIT, title: "机关教学 · 棱镜光束",
      text: "<b>&gt; &lt;</b> 是光束发射器：射出的光会沿直线前进，遇到 <b>折光镜 / \\</b> 就改变方向。<br>右侧镜轴上的光路是<b>镜像对称</b>的，改变一侧通常也会改变另一侧。",
      done: null },
    { pos: "tl", spot: SP_MIRROR, title: "机关教学 · 站上棱镜平台切换折光镜",
      text: "站上 <b>棱镜平台 j</b>，成对的 <b>可切换折光镜 q</b> 就会翻转，把光束导向你要的方向。<br>（本作没有手动“旋转镜面”的按键——改变光路靠的就是踩平台。）",
      done: null },
    { pos: "tl", spot: SP_RECV, title: "机关教学 · 点亮两岸水晶",
      text: "让光束命中 <b>水晶接收器 *</b>：两岸水晶<b>都点亮</b>（点亮后会保持）后，门 <b>H</b> 才会开启。",
      act: "把任意一侧水晶点亮（也可以用“下一步”跳过）",
      done: (s) => !!s && s.lit && s.lit.length > 0, doneMsg: "✅ 水晶点亮！" },
  ];

  let TUT = null;
  const tutEl = {};
  function tutCache() {
    if (tutEl.layer) return tutEl;
    tutEl.layer = $("tutorial-layer"); tutEl.spot = $("tut-spot"); tutEl.card = $("tut-card");
    tutEl.step = $("tut-step"); tutEl.kind = $("tut-kind"); tutEl.title = $("tut-title");
    tutEl.text = $("tut-text"); tutEl.keys = $("tut-keys"); tutEl.dots = $("tut-dots");
    tutEl.next = $("tut-next"); tutEl.skip = $("tut-skip");
    return tutEl;
  }
  function tutStart(which, force) {
    const key = which === "beam" ? TUT_KEY_BEAM : TUT_KEY_CORE;
    if (!force && tutSeen(key)) return false;
    const steps = which === "beam" ? TUT_BEAM : TUT_CORE;
    if (TUT) tutEnd(false);
    TUT = { which, key, steps, i: 0, lock: 0, ref: null, timer: 0, sig: { move: 0, jump: 0, action: 0 } };
    tutCache().layer.classList.remove("hidden");
    tutGoto(0);
    TUT.timer = setInterval(tutTick, 180);
    return true;
  }
  function tutGoto(i) {
    if (!TUT) return;
    if (i >= TUT.steps.length) { tutEnd(true); showToast("<b>引导完成</b>　祝你们重归对称 ✦", { short: true }); return; }
    TUT.i = i; TUT.lock = performance.now() + 420; TUT.ref = null;
    const st = TUT.steps[i], E = tutCache(), s = tutSnap();
    if (st.enter && s) st.enter(s);
    E.step.textContent = (i + 1) + " / " + TUT.steps.length;
    E.kind.textContent = TUT.which === "beam" ? "机关教学" : "新手引导";
    E.title.innerHTML = st.title;
    E.text.innerHTML = st.text + (st.act ? '<div class="tc-act">👉 现在做：' + st.act + "</div>" : "");
    E.keys.innerHTML = (st.keys || []).map((k) => "<kbd>" + k + "</kbd>").join("");
    E.dots.innerHTML = TUT.steps.map((_, k) => '<i class="' + (k < i ? "past" : k === i ? "on" : "") + '"></i>').join("");
    E.next.textContent = (i === TUT.steps.length - 1) ? "完成引导 ✓" : (i === 0 ? "开始教学" : "下一步 →");
    E.spot.classList.add("pulse");
    tutLayout();
    requestAnimationFrame(tutLayout);
  }
  function tutNext() { if (TUT) tutGoto(TUT.i + 1); }
  function tutSkip() {
    if (!TUT) return;
    tutEnd(true);
    showToast("<b>已跳过新手引导</b>　可从主菜单「🎓 新手引导」重看", { short: true });
  }
  function tutEnd(mark) {
    if (!TUT) return;
    const key = TUT.key;
    clearInterval(TUT.timer);
    TUT = null;
    if (mark) tutMark(key);
    const E = tutCache();
    E.layer.classList.add("hidden");
    E.layer.classList.remove("dim");
    E.spot.classList.remove("pulse");
  }
  function tutAbort() { if (TUT) tutEnd(false); }        // 过关 / 退出时静默收起（不算已看过）
  function tutTick() {
    if (!TUT) return;
    const st = TUT.steps[TUT.i], s = tutSnap();
    if (!s || !st) return;
    tutLayout(s);
    if (performance.now() < TUT.lock) return;
    if (st.done && st.done(s)) {
      if (st.doneMsg) showToast(st.doneMsg, { short: true });
      tutGoto(TUT.i + 1);
    }
  }
  function tutLayout(snap) {
    if (!TUT) return;
    const st = TUT.steps[TUT.i]; if (!st) return;
    const E = tutCache(), s = snap || tutSnap();
    const vw = window.innerWidth, vh = window.innerHeight, pad = 14;
    let r = null;
    if (s && st.spot) {
      if (typeof st.spot === "function") r = st.spot(s);
      else if (typeof st.spot === "string" && st.spot.charAt(0) === "#") {
        const el = document.querySelector(st.spot);
        if (el) { const b = el.getBoundingClientRect(); r = { x: b.left - 8, y: b.top - 8, w: b.width + 16, h: b.height + 16 }; }
      }
    }
    if (r && (r.w < 4 || r.h < 4 || r.y > vh || r.y + r.h < 0)) r = null;
    if (r) {
      E.layer.classList.remove("dim"); E.spot.style.display = "";
      E.spot.style.left = Math.round(r.x) + "px"; E.spot.style.top = Math.round(r.y) + "px";
      E.spot.style.width = Math.round(r.w) + "px"; E.spot.style.height = Math.round(r.h) + "px";
    } else {
      E.layer.classList.add("dim"); E.spot.style.display = "none";
    }
    const cw = E.card.offsetWidth || 344, chh = E.card.offsetHeight || 220;
    const box = (k) => {
      if (k === "tl") return { x: pad + 6, y: 64 };
      if (k === "tr") return { x: vw - cw - pad, y: 64 };
      if (k === "bl") return { x: pad + 6, y: vh - chh - pad };
      if (k === "br") return { x: vw - cw - pad, y: vh - chh - pad };
      return { x: Math.round(vw / 2 - cw / 2), y: Math.round(vh / 2 - chh / 2) };
    };
    let put = box("c");
    if (r) {
      const order = [st.pos || "tl", "tl", "br", "bl", "tr", "c"].filter((v, i, a) => a.indexOf(v) === i);
      const hit = (p) => !(p.x + cw < r.x - 6 || p.x > r.x + r.w + 6 || p.y + chh < r.y - 6 || p.y > r.y + r.h + 6);
      for (const k of order) { const p = box(k); if (!hit(p)) { put = p; break; } }
    }
    E.card.style.left = Math.round(Math.max(pad, Math.min(vw - cw - pad, put.x))) + "px";
    E.card.style.top = Math.round(Math.max(pad, Math.min(vh - chh - pad, put.y))) + "px";
  }

  /* 重看入口：游戏中 → 当前关卡直接重看；不在游戏中 → 从第 1 关开始 */
  function replayTutorial(which) {
    const w = which || "core";
    if (MMGame.state === "playing" || MMGame.state === "paused") {
      $("modal-pause").classList.add("hidden");
      $("modal-result").classList.add("hidden");
      SCREENS.forEach((sc) => $(sc).classList.add("hidden"));
      $("game-layer").classList.remove("hidden");
      hud.el.classList.remove("hidden");
      $("touch-layer").classList.toggle("hidden", !MMInput.touchEnabled);
      hideToast(); hud.hintBox.classList.add("hidden");
      backStack.length = 0; curScreen = null;
      MMGame.resume();
      tutStart(w, true);
    } else {
      playLevel(0, w);
    }
  }
  function tutAutoWhich(idx) {
    if (!tutSeen(TUT_KEY_CORE)) return "core";
    if (hasBeam(idx) && !tutSeen(TUT_KEY_BEAM)) return "beam";
    return null;
  }
  function hasBeam(idx) {
    const rows = (MMLevels.LEVELS[idx] && MMLevels.LEVELS[idx].map) || [];
    for (const row of rows) if (/[><\\/jq*]/.test(row)) return true;
    return false;
  }
  function bindTutorial() {
    const E = tutCache();
    E.next.onclick = tutNext;
    E.skip.onclick = tutSkip;
    window.addEventListener("resize", () => { if (TUT) tutLayout(); });
    // 输入信号（键盘 / 触屏按钮）→ 步骤达成判定；只读计数，不拦截任何输入
    window.addEventListener("keydown", (e) => {
      if (!TUT) return;
      const k = e.key.toLowerCase();
      if (k === "a" || k === "d" || k === "arrowleft" || k === "arrowright") TUT.sig.move++;
      if (k === " " || k === "w" || k === "arrowup") TUT.sig.jump++;
      if (k === "z" || k === "r" || k === "h") TUT.sig.action++;
    });
    ["hud-undo", "hud-restart", "hud-hint"].forEach((id) => {
      const b = $(id);
      if (b) b.addEventListener("click", () => { if (TUT) TUT.sig.action++; });
    });
    ["btn-jump-left", "btn-jump-right"].forEach((id) => {
      const b = $(id);
      if (b) b.addEventListener("touchstart", () => { if (TUT) TUT.sig.jump++; }, { passive: true });
    });
    $("btn-tutorial").onclick = () => { MMAudio.unlock(); replayTutorial("core"); };
    $("set-tutorial-btn").onclick = () => { MMAudio.unlock(); replayTutorial("core"); };
    $("pause-tutorial").onclick = () => replayTutorial("core");
  }

  /* ================= 绑定 ================= */
  function bind() {
    $("btn-new").onclick = () => { MMAudio.unlock(); playLevel(isDebug ? 0 : Math.min(SAVE.unlocked, MMLevels.LEVELS.length - 1)); };
    $("btn-continue").onclick = () => { MMAudio.unlock(); playLevel(Math.min(SAVE.unlocked, MMLevels.LEVELS.length - 1)); };
    $("btn-chapters").onclick = () => show("screen-chapters");
    $("btn-overview").onclick = () => { MMAudio.play("ui"); show("screen-overview"); };
    $("ov-filter").onclick = () => { ovOnlyNotFull = !ovOnlyNotFull; MMAudio.play("ui"); renderOverview(); };
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
    bindTutorial();
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
  // 新手引导对外接口（调试 / 自动化断言用）
  window.MMTutorial = {
    start: (which, force) => tutStart(which || "core", force !== false),
    next: tutNext,
    skip: tutSkip,
    abort: tutAbort,
    replay: replayTutorial,
    get active() { return !!TUT; },
    get step() { return TUT ? TUT.i + 1 : 0; },
    get total() { return TUT ? TUT.steps.length : 0; },
    get which() { return TUT ? TUT.which : null; },
    get title() { return TUT ? $("tut-title").textContent : ""; },
    get actText() { return TUT ? (document.querySelector("#tut-text .tc-act") || {}).textContent || "" : ""; },
    get stepText() { return $("tut-step").textContent; },
    seenCore: () => tutSeen(TUT_KEY_CORE),
    seenBeam: () => tutSeen(TUT_KEY_BEAM),
    KEY_CORE: TUT_KEY_CORE,
    KEY_BEAM: TUT_KEY_BEAM,
    hasBeam,
    layout: () => tutLayout(),
  };
})();
