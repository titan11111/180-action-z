'use strict';

/* =========================================================
   敵: 犬（地上パトロール）/ カラス（空中往復）/ トゲ（固定）
========================================================= */
const enemies = [];

function resetEnemies() {
  enemies.length = 0;
  for (const def of ENEMY_DEFS) {
    if (def.type === 'dog') {
      enemies.push({
        type: 'dog',
        x: def.x, y: GROUND_Y - 46,
        w: 52, h: 46,
        minX: def.minX, maxX: def.maxX,
        dir: Math.random() < 0.5 ? -1 : 1,
        dead: false,
        animT: Math.random() * 1000,
      });
    } else if (def.type === 'crow') {
      enemies.push({
        type: 'crow',
        baseX: def.x, baseY: def.y,
        x: def.x, y: def.y,
        w: 46, h: 34,
        range: def.range, amp: def.amp,
        phase: Math.random() * Math.PI * 2,
        dir: 1,
        dead: false,
        animT: 0,
      });
    } else if (def.type === 'spike') {
      enemies.push({
        type: 'spike',
        x: def.x, y: GROUND_Y - 26,
        w: def.w, h: 26,
        dead: false,
      });
    }
  }
}

function updateEnemies(dt) {
  const t = performance.now();
  for (const e of enemies) {
    if (e.dead) continue;
    e.animT = (e.animT || 0) + dt;
    if (e.type === 'dog') {
      e.x += e.dir * DOG_SPEED;
      if (e.x <= e.minX) { e.x = e.minX; e.dir = 1; }
      if (e.x + e.w >= e.maxX) { e.x = e.maxX - e.w; e.dir = -1; }
    } else if (e.type === 'crow') {
      e.phase += dt * 0.0016;
      e.x = e.baseX + Math.sin(e.phase) * e.range * 0.5;
      e.y = e.baseY + Math.sin(t * 0.004 + e.phase * 2) * e.amp * 0.4;
      e.dir = Math.cos(e.phase) >= 0 ? 1 : -1;
    }
  }
}

/* ---------------------------------------------------------
   描画（Canvas手描き・絵本寄りの丸いフォルム）
--------------------------------------------------------- */
function drawEnemies(ctx, camX, W) {
  for (const e of enemies) {
    if (e.dead) continue;
    const sx = e.x - camX;
    if (sx + e.w < -40 || sx > W + 40) continue;

    if (e.type === 'dog') drawDog(ctx, sx, e);
    else if (e.type === 'crow') drawCrow(ctx, sx, e);
    else if (e.type === 'spike') drawSpike(ctx, sx, e);
  }
}

function drawDog(ctx, sx, e) {
  const bob = Math.sin(e.animT * 0.02) * 1.6;
  const legSwing = Math.sin(e.animT * 0.025) * 5;
  ctx.save();
  ctx.translate(sx + e.w / 2, e.y + e.h / 2 + bob);
  if (e.dir === -1) ctx.scale(-1, 1);

  // 脚
  ctx.strokeStyle = '#8a5a2b';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-12, 10); ctx.lineTo(-12 + legSwing * 0.4, 22);
  ctx.moveTo(10, 10);  ctx.lineTo(10 - legSwing * 0.4, 22);
  ctx.stroke();

  // 胴体
  ctx.fillStyle = '#b97a3c';
  ctx.beginPath();
  ctx.ellipse(0, 4, 22, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // しっぽ
  ctx.strokeStyle = '#b97a3c';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-20, 0);
  ctx.quadraticCurveTo(-30, -8 + Math.sin(e.animT * 0.03) * 3, -27, -14);
  ctx.stroke();

  // 頭
  ctx.fillStyle = '#c98b4d';
  ctx.beginPath();
  ctx.arc(17, -8, 12, 0, Math.PI * 2);
  ctx.fill();
  // 耳
  ctx.fillStyle = '#8a5a2b';
  ctx.beginPath();
  ctx.ellipse(12, -17, 4.5, 7, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // 鼻先
  ctx.fillStyle = '#e8c49a';
  ctx.beginPath();
  ctx.ellipse(25, -5, 6, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a2a1a';
  ctx.beginPath();
  ctx.arc(28, -6, 2, 0, Math.PI * 2);
  ctx.fill();
  // 目
  ctx.beginPath();
  ctx.arc(18, -10, 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawCrow(ctx, sx, e) {
  const flap = Math.sin(e.animT * 0.02) * 10;
  ctx.save();
  ctx.translate(sx + e.w / 2, e.y + e.h / 2);
  if (e.dir === -1) ctx.scale(-1, 1);

  // 翼
  ctx.fillStyle = '#2b2b38';
  ctx.beginPath();
  ctx.moveTo(-4, -2);
  ctx.quadraticCurveTo(-16, -14 - flap, -26, -6 - flap);
  ctx.quadraticCurveTo(-14, 2, -4, 2);
  ctx.closePath();
  ctx.fill();

  // 胴体
  ctx.fillStyle = '#3a3a4c';
  ctx.beginPath();
  ctx.ellipse(0, 0, 15, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // 頭
  ctx.fillStyle = '#44445a';
  ctx.beginPath();
  ctx.arc(12, -5, 7.5, 0, Math.PI * 2);
  ctx.fill();
  // くちばし
  ctx.fillStyle = '#f0b429';
  ctx.beginPath();
  ctx.moveTo(18, -6); ctx.lineTo(26, -4); ctx.lineTo(18, -2);
  ctx.closePath();
  ctx.fill();
  // 目
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(13, -6, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(13.6, -6, 1.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSpike(ctx, sx, e) {
  const n = Math.max(2, Math.round(e.w / 18));
  const step = e.w / n;
  ctx.save();
  ctx.fillStyle = '#9aa3b0';
  ctx.strokeStyle = '#5d6570';
  ctx.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const x0 = sx + i * step;
    ctx.beginPath();
    ctx.moveTo(x0, e.y + e.h);
    ctx.lineTo(x0 + step / 2, e.y);
    ctx.lineTo(x0 + step, e.y + e.h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
