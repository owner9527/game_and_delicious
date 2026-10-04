'use strict';
// ================================================================
// 实体层: 敌人工厂与AI / 特效 / 拾取物 (战斗结算回调由 game.js 提供)
// ================================================================
const Entities = {
  uid: 1,

  // ---------- 敌人工厂(按层数缩放 + 精英词缀) ----------
  makeEnemy(G, typeId, x, y, eliteIdx) {
    const t = ENEMY_TYPES[typeId];
    const f = G.run.floor;
    const hpM = 1 + 0.22 * (f - 1), dmgM = 1 + 0.11 * (f - 1), spM = 1 + Math.min(0.3, 0.008 * (f - 1));
    const e = {
      uid: Entities.uid++, type: typeId, name: t.name, x, y, r: t.r,
      hp: t.hp * hpM, maxHp: t.hp * hpM, dmg: t.dmg * dmgM, speed: t.speed * spM,
      color: t.color, xp: t.xp + Math.floor(f * 0.6), armor: t.armor || 0,
      ai: t.ai, t: Math.random() * 10, ph: Math.random() * TAU,
      spawnT: 0.6, contactCd: 0, flashT: 0, shootT: 1 + Math.random(),
      state: 'idle', stateT: 0, aimA: 0, blinkCd: 0,
      burn: null, poison: null, frost: null, frozenT: 0, dotT: 0, dotAcc: 0,
      orbitCd: 0, elite: -1, boss: false, dead: false, vx: 0, vy: 0,
    };
    if (eliteIdx >= 0) {
      const m = ELITE_MODS[eliteIdx];
      e.elite = eliteIdx; e.eliteName = m.name;
      e.maxHp = e.hp = e.hp * (m.hpMult || 1);
      e.dmg *= (m.dmgMult || 1); e.speed *= (m.speedMult || 1); e.r *= (m.sizeMult || 1);
      e.color = m.color; e.xp = Math.round(e.xp * 2.5);
      if (m.lifesteal) e.lifesteal = m.lifesteal;
      if (m.chill) e.chill = true;
    }
    return e;
  },

  makeBoss(G, def, cycle) {
    const f = G.run.floor;
    const hpM = (1 + 0.55 * (f / 5 - 1)) * (1 + 0.7 * cycle);
    return {
      uid: Entities.uid++, boss: true, type: def.id, name: def.name,
      x: ROOM_W / 2, y: 250, r: def.r,
      hp: def.hp * hpM, maxHp: def.hp * hpM,
      dmg: def.dmg * (1 + 0.18 * (f / 5 - 1) + 0.3 * cycle),
      speed: 55, r2: 0, color: def.color, xp: def.xp, armor: 4,
      ai: 'boss', attacks: def.attacks, atkIdx: 0, atk: null, cool: 1.8, cycle,
      summonType: def.summon || 'slime',
      t: 0, ph: 0, spawnT: 1.0, contactCd: 0, flashT: 0,
      burn: null, poison: null, frost: null, frozenT: 0, dotT: 0, dotAcc: 0,
      orbitCd: 0, elite: -1, dead: false, vx: 0, vy: 0,
    };
  },

  // ---------- 敌人 AI 主更新 ----------
  updateEnemy(G, e, dt) {
    const p = G.player;
    e.t += dt;
    if (e.frozenT > 0) e.frozenT -= dt;
    // 持续伤害(燃烧/毒素)
    let dot = 0, dotColor = null;
    if (e.burn && e.burn.t > 0) { e.burn.t -= dt; dot += e.burn.dps * dt; dotColor = '#ff9d5c'; if (e.burn.t <= 0) e.burn = null; }
    if (e.poison && e.poison.t > 0) { e.poison.t -= dt; dot += e.poison.stacks * e.poison.dps * dt; dotColor = '#7fd45c'; if (e.poison.t <= 0) e.poison = null; }
    e.dotAcc += dot;
    e.dotT -= dt;
    if (e.dotAcc > 0 && e.dotT <= 0) {
      G.hitEnemy(e, e.dotAcc, { noCrit: true, color: dotColor, silent: true, noProc: true });
      e.dotAcc = 0; e.dotT = 0.5;
    }
    if (e.dead || e.spawnT > 0) return;

    const slowF = e.frozenT > 0 ? 0 : (e.frost && e.frost.t > 0 ? 1 - e.frost.slow : 1);
    const d = dist(e.x, e.y, p.x, p.y);
    const ang = angleTo(e.x, e.y, p.x, p.y);
    e.contactCd -= dt; e.orbitCd -= dt; e.flashT -= dt;

    const mv = (a, sp) => { e.vx = Math.cos(a) * sp * slowF; e.vy = Math.sin(a) * sp * slowF; };

    switch (e.ai) {
      case 'chase': mv(ang, e.speed); break;
      case 'bat': {
        const perp = ang + Math.PI / 2;
        const wob = Math.sin(e.t * 5 + e.ph) * 0.65;
        mv(ang + wob * 0.5, e.speed);
        e.vx += Math.cos(perp) * wob * 40 * slowF;
        e.vy += Math.sin(perp) * wob * 40 * slowF;
        break;
      }
      case 'ranged': {
        const t = ENEMY_TYPES[e.type];
        if (d > t.range + 40) mv(ang, e.speed);
        else if (d < t.range - 90) mv(ang + Math.PI, e.speed);
        else mv(ang + Math.PI / 2 * (e.ph > Math.PI ? 1 : -1), e.speed * 0.45);
        if (e.state === 'aim') {
          e.vx = e.vy = 0;
          e.stateT -= dt;
          if (e.stateT <= 0) {
            G.ebullet(e.x, e.y, angleTo(e.x, e.y, p.x, p.y), t.projSpeed, e.dmg, { color: '#e8e0c8', r: 6 });
            e.state = 'idle';
          }
        } else {
          e.shootT -= dt;
          if (e.shootT <= 0 && d < t.range + 80) { e.state = 'aim'; e.stateT = 0.4; e.shootT = t.interval * rrange(0.85, 1.25); }
        }
        break;
      }
      case 'caster': {
        if (d < 150 && e.blinkCd <= 0) {
          const ba = rrange(0, TAU);
          FX.burst(e.x, e.y, e.color, 12, 120, 0.4, 4);
          e.x = clamp(e.x + Math.cos(ba) * 190, 70, ROOM_W - 70);
          e.y = clamp(e.y + Math.sin(ba) * 190, 70, ROOM_H - 70);
          FX.burst(e.x, e.y, e.color, 12, 120, 0.4, 4);
          e.blinkCd = 3.5;
        }
        e.blinkCd -= dt;
        if (d < 320) mv(ang + Math.PI, e.speed); else mv(ang, e.speed * 0.6);
        if (e.state === 'cast') {
          e.vx = e.vy = 0;
          e.stateT -= dt;
          if (e.stateT <= 0) {
            for (let i = -1; i <= 1; i++)
              G.ebullet(e.x, e.y, angleTo(e.x, e.y, p.x, p.y) + i * 0.28, 175, e.dmg, { color: '#7ec8ff', r: 8, homing: 1.8, life: 4.5 });
            e.state = 'idle';
          }
        } else {
          e.shootT -= dt;
          if (e.shootT <= 0) { e.state = 'cast'; e.stateT = 0.55; e.shootT = ENEMY_TYPES[e.type].interval * rrange(0.85, 1.2); }
        }
        break;
      }
      case 'bomber': {
        if (e.state === 'fuse') {
          e.vx = e.vy = 0;
          e.stateT -= dt;
          if (e.stateT <= 0) { G.pendingBooms.push({ x: e.x, y: e.y, r: ENEMY_TYPES[e.type].blastR, t: 0.05, maxT: 0.05, dmg: e.dmg, color: e.color }); e.hp = 0; G.killEnemy(e, { silentItem: true, noBoom: true }); }
        } else {
          mv(ang, e.speed);
          if (d < 58) { e.state = 'fuse'; e.stateT = 0.55; }
        }
        break;
      }
      case 'charger': {
        if (e.state === 'aim') {
          e.vx = e.vy = 0;
          e.stateT -= dt;
          if (e.stateT <= 0) { e.state = 'charge'; e.stateT = 0.55; }
        } else if (e.state === 'charge') {
          mv(e.aimA, ENEMY_TYPES[e.type].chargeSpeed * slowF);
          e.stateT -= dt;
          if (e.stateT <= 0) { e.state = 'rest'; e.stateT = 0.7; }
        } else if (e.state === 'rest') {
          e.vx = e.vy = 0;
          e.stateT -= dt;
          if (e.stateT <= 0) e.state = 'idle';
        } else {
          mv(ang, e.speed * 0.45);
          if (d < 360) { e.state = 'aim'; e.stateT = 0.7; e.aimA = ang; }
        }
        break;
      }
      default: mv(ang, e.speed);
      case 'boss': e.vx = 0; e.vy = 0; break; // Boss 位移与接触判定由 game.updateBoss 负责
    }
    e.x += e.vx * dt; e.y += e.vy * dt;
  },

  // ---------- 敌人之间简单分离 ----------
  separate(list) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.spawnT > 0) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.spawnT > 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < rr * rr) {
          const d = Math.sqrt(d2), push = (rr - d) / d * 0.5;
          a.x -= dx * push; a.y -= dy * push;
          b.x += dx * push; b.y += dy * push;
        }
      }
    }
  },

  // ---------- 拾取物 ----------
  makePickup(type, x, y, extra) {
    return Object.assign({ type, x, y, vx: rrange(-60, 60), vy: rrange(-60, 60), t: 0, settle: 0.35 }, extra || {});
  },
  updatePickup(G, pk, dt) {
    pk.t += dt;
    if (pk.settle > 0) { pk.settle -= dt; pk.x += pk.vx * dt; pk.y += pk.vy * dt; pk.vx *= 0.86; pk.vy *= 0.86; }
    const p = G.player;
    const d = dist(pk.x, pk.y, p.x, p.y);
    if ((pk.type === 'coin' || pk.type === 'potion' || pk.type === 'heart') && d < p.pickupR) {
      const a = angleTo(pk.x, pk.y, p.x, p.y);
      const pull = 380 * (1 - d / p.pickupR) + 140;
      pk.x += Math.cos(a) * pull * dt;
      pk.y += Math.sin(a) * pull * dt;
    }
    switch (pk.type) {
      case 'coin':
        if (d < 26) {
          pk.gone = true;
          G.gainGold(pk.val);
          Sfx.play('coin');
          FX.text(p.x, p.y - 26, '+' + pk.val + '金', '#ffd24d', 12);
        }
        break;
      case 'potion':
        if (d < 26) {
          pk.gone = true;
          const heal = Math.round(p.maxHp * 0.3);
          G.healPlayer(heal);
          Sfx.play('potion');
        }
        break;
      case 'heart':
        if (d < 26) {
          pk.gone = true;
          G.healPlayer(Math.round(p.maxHp * 0.15));
          Sfx.play('potion');
        }
        break;
    }
  },
};

// ================================================================
// 特效系统: 粒子 / 飘字 / 闪电链 / 冲击环
// ================================================================
const FX = {
  parts: [], texts: [], zaps: [], rings: [],
  reset() { this.parts.length = 0; this.texts.length = 0; this.zaps.length = 0; this.rings.length = 0; },
  burst(x, y, color, n = 8, spd = 160, life = 0.5, size = 4) {
    for (let i = 0; i < n; i++) {
      const a = rrange(0, TAU), s = rrange(spd * 0.3, spd);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: life * rrange(0.6, 1.2), color, size: size * rrange(0.6, 1.3) });
      if (this.parts.length > 420) this.parts.shift();
    }
  },
  text(x, y, str, color = '#e8ecf5', size = 14, big = false) {
    this.texts.push({ x: x + rrange(-8, 8), y, str: String(str), color, size, t: 0, life: big ? 0.9 : 0.65 });
    if (this.texts.length > 90) this.texts.shift();
  },
  ring(x, y, color, r = 60, life = 0.35) { this.rings.push({ x, y, color, r, t: 0, life }); },
  zap(x1, y1, x2, y2, color = '#ffe37e') {
    const pts = [{ x: x1, y: y1 }];
    const segs = 5;
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      pts.push({ x: lerp(x1, x2, t) + rrange(-14, 14), y: lerp(y1, y2, t) + rrange(-14, 14) });
    }
    pts.push({ x: x2, y: y2 });
    this.zaps.push({ pts, t: 0, life: 0.18, color });
  },
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy *= 0.94;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      if (t.t >= t.life) this.texts.splice(i, 1);
      else t.y -= 34 * dt;
    }
    for (let i = this.zaps.length - 1; i >= 0; i--) { this.zaps[i].t += dt; if (this.zaps[i].t >= this.zaps[i].life) this.zaps.splice(i, 1); }
    for (let i = this.rings.length - 1; i >= 0; i--) { this.rings[i].t += dt; if (this.rings[i].t >= this.rings[i].life) this.rings.splice(i, 1); }
  },
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 命中火花/粒子: 加色光晕 + 运动拖尾 + 白热核心
    for (const p of this.parts) {
      const a = 1 - p.t / p.life;
      const r = p.size * (0.5 + a * 0.5);
      ctx.globalAlpha = a * 0.32;
      const gr = r * 2.5;
      ctx.drawImage(Tex.glow(p.color, 16), p.x - gr, p.y - gr, gr * 2, gr * 2);
      ctx.globalAlpha = a * 0.5;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1, r * 0.7);
      ctx.beginPath();
      ctx.moveTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = a * 0.95;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.42, 0, TAU);
      ctx.fill();
    }
    for (const z of this.zaps) {
      const a = 1 - z.t / z.life;
      ctx.globalAlpha = a;
      ctx.strokeStyle = z.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      z.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    for (const r of this.rings) {
      const k = r.t / r.life;
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (0.25 + 0.75 * k), 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const t of this.texts) {
      const a = 1 - Math.pow(t.t / t.life, 2);
      ctx.globalAlpha = a;
      ctx.font = `bold ${t.size}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000';
      ctx.fillText(t.str, t.x + 1, t.y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  },
};
