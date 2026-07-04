'use strict';

/* =========================================================
   エフェクト: 土煙 / キラキラ / 残像 / 画面揺れ / 飛散文字 / 花火
========================================================= */
const particles = [];   // 土煙・着地・取得キラキラ
const afterimages = []; // 覚醒モードの残像
const flyingChars = []; // ショットで弾いた漢字
const fireRockets = [];
const fireParticles = [];
let fireLaunchTimer = 0;

let shakeT = 0;
let shakeMag = 0;

function addShake(mag, ms) {
  shakeMag = Math.max(shakeMag, mag);
  shakeT = Math.max(shakeT, ms);
}

function updateShake(dt) {
  if (shakeT > 0) {
    shakeT -= dt;
    if (shakeT <= 0) { shakeT = 0; shakeMag = 0; }
  }
}

function getShakeOffset() {
  if (shakeT <= 0) return { x: 0, y: 0 };
  return {
    x: (Math.random() * 2 - 1) * shakeMag,
    y: (Math.random() * 2 - 1) * shakeMag,
  };
}

/* ---------------------------------------------------------
   汎用パーティクル
--------------------------------------------------------- */
function spawnDust(x, y, count, spread) {
  for (let i = 0; i < count; i++) {
    particles.push({
      kind: 'dust',
      x: x + (Math.random() - 0.5) * 14,
      y: y + (Math.random() - 0.5) * 4,
      vx: (Math.random() - 0.5) * (spread || 1.6),
      vy: -Math.random() * 1.2 - 0.2,
      life: 320 + Math.random() * 200,
      ttl: 520,
      sz: 3 + Math.random() * 3.5,
    });
  }
}

function spawnLandPuff(x, y, strength) {
  const n = Math.min(14, 5 + Math.floor(strength * 0.8));
  for (let i = 0; i < n; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    particles.push({
      kind: 'dust',
      x: x + dir * (4 + Math.random() * 10),
      y: y - 2,
      vx: dir * (0.8 + Math.random() * 1.8),
      vy: -Math.random() * 0.9,
      life: 360 + Math.random() * 220,
      ttl: 580,
      sz: 3.5 + Math.random() * 4,
    });
  }
}

function spawnSparkBurst(x, y, color) {
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12 + Math.random() * 0.3;
    const sp = 1.4 + Math.random() * 2.4;
    particles.push({
      kind: 'spark',
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 0.8,
      life: 420 + Math.random() * 260,
      ttl: 680,
      sz: 2 + Math.random() * 2.4,
      color: color || '#ffe66b',
    });
  }
}

function spawnPoof(x, y) {
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI * 2 * i) / 10;
    particles.push({
      kind: 'poof',
      x, y,
      vx: Math.cos(a) * (0.9 + Math.random() * 1.4),
      vy: Math.sin(a) * (0.9 + Math.random() * 1.4) - 0.6,
      life: 300 + Math.random() * 180,
      ttl: 480,
      sz: 4 + Math.random() * 4,
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    if (p.kind === 'spark') p.vy += 0.06;
    else p.vy += 0.02;
    p.vx *= 0.985;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles(ctx, camX, viewW) {
  for (const p of particles) {
    const sx = p.x - camX;
    if (sx < -20 || sx > viewW + 20) continue;
    const alpha = Math.max(0, p.life / p.ttl);
    ctx.save();
    ctx.globalAlpha = alpha * (p.kind === 'dust' ? 0.55 : 0.9);
    if (p.kind === 'spark') {
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
    } else if (p.kind === 'poof') {
      ctx.fillStyle = '#f2f2f6';
    } else {
      ctx.fillStyle = '#d9c9a8';
    }
    ctx.beginPath();
    ctx.arc(sx, p.y, p.sz * (0.5 + 0.5 * alpha), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/* ---------------------------------------------------------
   覚醒モードの残像
--------------------------------------------------------- */
function recordAfterimage(player) {
  afterimages.push({
    x: player.x, y: player.y,
    facing: player.facing,
    frame: player.animFrame,
    state: player.state,
    life: 260, ttl: 260,
  });
  if (afterimages.length > 8) afterimages.shift();
}

function updateAfterimages(dt) {
  for (let i = afterimages.length - 1; i >= 0; i--) {
    afterimages[i].life -= dt;
    if (afterimages[i].life <= 0) afterimages.splice(i, 1);
  }
}

/* ---------------------------------------------------------
   ショットで弾いた漢字の飛散
--------------------------------------------------------- */
function spawnFlyingChar(it, hitFromX) {
  const launchDir = it.x >= hitFromX ? 1 : -1;
  flyingChars.push({
    char: it.char,
    x: it.x,
    y: it.y,
    vx: (2.4 + Math.random() * 2.2) * launchDir,
    vy: -4.8 - Math.random() * 3.2,
    rot: 0,
    vr: (Math.random() * 0.4 + 0.18) * (Math.random() < 0.5 ? -1 : 1),
    life: 1100,
    ttl: 1100,
    size: 42 + Math.random() * 8,
  });
}

function updateFlyingChars(dt) {
  for (let i = flyingChars.length - 1; i >= 0; i--) {
    const fc = flyingChars[i];
    fc.x += fc.vx;
    fc.y += fc.vy;
    fc.vy += 0.22;
    fc.rot += fc.vr * (dt / 16.6667);
    fc.life -= dt;
    if (fc.life <= 0 || fc.y > GROUND_Y + 120) flyingChars.splice(i, 1);
  }
}

function drawFlyingChars(ctx, camX, W) {
  for (const fc of flyingChars) {
    const sx = fc.x - camX;
    if (sx < -120 || sx > W + 120) continue;
    const alpha = Math.max(0, fc.life / fc.ttl);
    ctx.save();
    ctx.translate(sx, fc.y);
    ctx.rotate(fc.rot);
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${Math.round(fc.size)}px "Hiragino Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 6;
    ctx.strokeText(fc.char, 0, 0);
    ctx.fillStyle = '#ffc2c2';
    ctx.fillText(fc.char, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/* ---------------------------------------------------------
   花火（正解演出）
--------------------------------------------------------- */
function resetFireworks() {
  fireLaunchTimer = 0;
  fireRockets.length = 0;
  fireParticles.length = 0;
}

function spawnFireRocket(W, H) {
  const baseY = H * 0.70;
  const launchX = W * (0.18 + Math.random() * 0.64);
  fireRockets.push({
    x: launchX,
    y: baseY + Math.random() * 20,
    vx: (Math.random() - 0.5) * 0.6,
    vy: -(4.8 + Math.random() * 1.8),
    life: 520 + Math.random() * 180,
    hue: Math.floor(Math.random() * 360),
  });
}

function burstFirework(x, y, hue) {
  const count = 32 + Math.floor(Math.random() * 16);
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.18;
    const sp = 1.2 + Math.random() * 3.2;
    fireParticles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 600 + Math.random() * 420,
      ttl: 600 + Math.random() * 420,
      hue: (hue + Math.floor(Math.random() * 80) - 20 + 360) % 360,
      sz: 2 + Math.random() * 2.8,
    });
  }
}

function updateFireworks(dt, W, H) {
  fireLaunchTimer -= dt;
  if (fireLaunchTimer <= 0) {
    spawnFireRocket(W, H);
    fireLaunchTimer = 160 + Math.random() * 140;
  }

  for (let i = fireRockets.length - 1; i >= 0; i--) {
    const r = fireRockets[i];
    r.x += r.vx;
    r.y += r.vy;
    r.vy += 0.02;
    r.life -= dt;
    if (r.life <= 0 || r.vy > -0.8) {
      burstFirework(r.x, r.y, r.hue);
      fireRockets.splice(i, 1);
    }
  }

  for (let i = fireParticles.length - 1; i >= 0; i--) {
    const p = fireParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.045;
    p.vx *= 0.992;
    p.life -= dt;
    if (p.life <= 0) fireParticles.splice(i, 1);
  }
}

function drawFireworks(ctx, W) {
  for (const r of fireRockets) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.shadowBlur = 12;
    ctx.shadowColor = `hsla(${r.hue},100%,65%,0.9)`;
    ctx.fillStyle = `hsl(${r.hue} 100% 70%)`;
    ctx.beginPath();
    ctx.arc(r.x, r.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const p of fireParticles) {
    const alpha = Math.max(0, p.life / p.ttl);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 10;
    ctx.shadowColor = `hsla(${p.hue},100%,70%,${alpha})`;
    ctx.fillStyle = `hsl(${p.hue} 100% 65%)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 祝福テキスト
  const pulse = 0.8 + Math.sin(performance.now() * 0.01) * 0.2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `bold ${Math.round(36 * pulse)}px "Hiragino Sans", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = 'rgba(255,120,120,0.7)';
  ctx.lineWidth = 6;
  ctx.strokeText('すごい！', W * 0.5, 22);
  ctx.fillText('すごい！', W * 0.5, 22);
  ctx.restore();
}
