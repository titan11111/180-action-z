'use strict';

/* =========================================================
   ダブルタップ防止
========================================================= */
let lastTap = 0;
document.addEventListener('touchstart', e => {
  const now = Date.now();
  if (now - lastTap < 300) e.preventDefault();
  lastTap = now;
}, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());

// iOS Safari のダブルタップズーム完全対策:
// touchstart だけでなく touchend 側でも 300ms 以内の連続タップを止める
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

// ピンチズーム・長押し選択の抑止
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('gesturechange', e => e.preventDefault());
document.addEventListener('selectstart', e => e.preventDefault());
document.addEventListener('touchmove', e => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

/* =========================================================
   入力
========================================================= */
const K = {};
const KB_TO_LOGICAL = { Space: 'KeyA_BTN', KeyZ: 'KeyA_BTN', KeyX: 'KeyB_BTN' };
let jumpBufferedAt = -1e9; // Jump Buffer: 押した瞬間の時刻を記録

document.addEventListener('keydown', e => {
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();
  if (!K[e.code] && (e.code === 'Space' || e.code === 'KeyZ')) jumpBufferedAt = performance.now();
  K[e.code] = true;
  if (KB_TO_LOGICAL[e.code]) K[KB_TO_LOGICAL[e.code]] = true;
});
document.addEventListener('keyup', e => {
  K[e.code] = false;
  if (KB_TO_LOGICAL[e.code]) K[KB_TO_LOGICAL[e.code]] = false;
});

function bindPointer(el, codes, isJump) {
  if (!el) return;
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* unsupported */ }
    codes.forEach(c => { K[c] = true; });
    if (isJump) jumpBufferedAt = performance.now();
    if (navigator.vibrate) navigator.vibrate(10);
    unlockAudio();
  });
  el.addEventListener('pointerup',     () => { codes.forEach(c => { K[c] = false; }); });
  el.addEventListener('pointercancel', () => { codes.forEach(c => { K[c] = false; }); });
  el.addEventListener('lostpointercapture', () => { codes.forEach(c => { K[c] = false; }); });
}

function initVirtualControls() {
  bindPointer(document.getElementById('cv-left'),  ['ArrowLeft']);
  bindPointer(document.getElementById('cv-right'), ['ArrowRight']);
  bindPointer(document.getElementById('cv-up'),    ['ArrowUp']);
  bindPointer(document.getElementById('cv-down'),  ['ArrowDown']);
  bindPointer(document.getElementById('cv-a'),     ['KeyA_BTN', 'Space'], true);
  bindPointer(document.getElementById('cv-b'),     ['KeyB_BTN']);
}
initVirtualControls();

/* =========================================================
   Canvas / DPR
========================================================= */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;
let viewScale = 1;  // 世界→画面の拡大率（H / VIEW_H）
let viewTop = 0;    // 画面上端に対応する世界Y座標
let VW = 0;         // 画面に見えている世界の横幅
const CONTROL_PANEL_RATIO = 0.30;

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = Math.max(260, Math.floor(window.innerHeight * (1 - CONTROL_PANEL_RATIO)));
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 縦画面でも地面と落とし穴が必ず見えるよう、世界をスケーリングして収める
  viewScale = H / VIEW_H;
  viewTop = GROUND_Y - VIEW_H * GROUND_SCREEN_FRAC;
  VW = W / viewScale;
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 60));
resizeCanvas();

/* =========================================================
   スプライト読み込み
========================================================= */
const sheet = new Image();
sheet.src = 'cat-sprite.png';
const shinigamiImg = new Image();
const SHINIGAMI_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <defs>
    <radialGradient id="g" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#8f8f95"/>
      <stop offset="100%" stop-color="#2a2a32"/>
    </radialGradient>
  </defs>
  <path d="M20 66q8-34 28-34t28 34q-11 8-28 8t-28-8z" fill="url(#g)"/>
  <circle cx="48" cy="28" r="17" fill="#f2f2f6"/>
  <circle cx="42" cy="27" r="4" fill="#111"/>
  <circle cx="54" cy="27" r="4" fill="#111"/>
  <path d="M39 36q9 7 18 0" stroke="#222" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M13 44l22 8-12 10z" fill="#3d3d45"/>
  <path d="M83 44l-22 8 12 10z" fill="#3d3d45"/>
  <path d="M74 17c8 2 11 8 9 14-3 8-13 11-20 8 7-1 11-4 13-8 2-4 0-9-2-14z" fill="#eaeaea"/>
</svg>`;
shinigamiImg.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(SHINIGAMI_SVG);

/* =========================================================
   プレイヤー / ゲーム状態
========================================================= */
const player = {
  x: 40, y: GROUND_Y - PLAYER_SIZE, w: PLAYER_SIZE, h: PLAYER_SIZE,
  vx: 0, vy: 0,
  grounded: false,
  facing: 1,
  animTimer: 0,
  animFrame: 0,
  state: 'walk',  // walk | jump | crouch | item | mash
  itemGlowT: 0,
  mashModeT: 0,
  hp: MAX_HP,
  invT: 0,        // 無敵時間（被弾後）
  knockT: 0,      // ノックバック中は操作を奪う
  coyoteAt: -1e9, // 最後に接地していた時刻
  squashT: 0,     // 着地スクワッシュ
  stepT: 0,       // 足音・土煙タイマー
  afterimageT: 0,
  wasGrounded: false,
};

let gameState = 'title'; // title | playing | fail_anim | success_anim | goal
let camX = 0;
let shotTimer = 0;
const shots = [];
let failAnimTimer = 0;
let failOverlayText = '';
let successAnimTimer = 0;
let successOverlayText = '';

const items = [];
let currentQuestion = YOJI_POOL[0];
let collectedChars = [];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const clouds = [];
for (let i = 0; i < 10; i++) {
  clouds.push({ x: i * 420 + Math.random() * 150, y: 60 + Math.random() * 140, s: 0.7 + Math.random() * 0.8 });
}
const sparkles = [];
for (let i = 0; i < 18; i++) {
  sparkles.push({
    x: Math.random() * LEVEL_WIDTH,
    y: 45 + Math.random() * 180,
    tw: Math.random() * Math.PI * 2,
    sp: 0.0018 + Math.random() * 0.0018,
    r: 1.2 + Math.random() * 1.8,
  });
}

/* =========================================================
   HUD
========================================================= */
function updateCollectedHud() {
  const txt = collectedChars.join('').padEnd(4, '-');
  document.getElementById('collectedWord').textContent = txt;
}
function updateHeartsHud() {
  const el = document.getElementById('hearts');
  el.textContent = '♥'.repeat(Math.max(0, player.hp)) + '♡'.repeat(Math.max(0, MAX_HP - player.hp));
}
function updateZoneHud() {
  const z = zoneAt(player.x + player.w / 2);
  document.getElementById('zoneLabel').textContent = z.name;
}

const muteBtn = document.getElementById('muteBtn');
function refreshMuteBtn() { muteBtn.textContent = isMuted() ? '🔇' : '🔊'; }
muteBtn.addEventListener('pointerdown', e => {
  e.preventDefault();
  unlockAudio();
  setMuted(!isMuted());
  refreshMuteBtn();
});
refreshMuteBtn();

/* =========================================================
   出題
========================================================= */
function setupQuestion() {
  currentQuestion = YOJI_POOL[Math.floor(Math.random() * YOJI_POOL.length)];
  collectedChars = [];
  updateCollectedHud();

  const answerChars = currentQuestion.word.split('');
  const answerSet = new Set(answerChars);
  const decoyCandidates = DECOY_KANJI_POOL.filter(ch => !answerSet.has(ch));
  const decoyChars = shuffle(decoyCandidates).slice(0, DECOY_COUNT);
  const pointPool = ITEM_POINTS.slice().sort((a, b) => a.x - b.x);

  // 正解4文字は必ず左→右の4区間に分けて順序どおり配置する
  const answerSlots = [];
  const segSize = Math.max(1, Math.floor(pointPool.length / answerChars.length));
  for (let i = 0; i < answerChars.length; i++) {
    const segStart = i * segSize;
    const segEnd = (i === answerChars.length - 1)
      ? pointPool.length - 1
      : Math.min(pointPool.length - 1, (i + 1) * segSize - 1);
    answerSlots.push(randInt(segStart, segEnd));
  }

  const allSlots = Array.from({ length: pointPool.length }, (_, i) => i);
  const decoySlots = shuffle(allSlots.filter(i => !answerSlots.includes(i))).slice(0, decoyChars.length);

  items.length = 0;
  for (let i = 0; i < answerChars.length; i++) {
    const p = pointPool[answerSlots[i]];
    items.push({ x: p.x, y: p.y, char: answerChars[i], isDecoy: false, taken: false });
  }
  for (let i = 0; i < decoyChars.length; i++) {
    const p = pointPool[decoySlots[i]];
    items.push({ x: p.x, y: p.y, char: decoyChars[i], isDecoy: true, taken: false });
  }
  items.sort((a, b) => a.x - b.x);
}

/* =========================================================
   覚醒モード（Bボタン連打）検知
========================================================= */
let prevB = false;
const mashPresses = [];

function updateMashDetection(dt) {
  const bDown = !!K['KeyB_BTN'];
  if (bDown && !prevB) {
    const now = performance.now();
    mashPresses.push(now);
    while (mashPresses.length && now - mashPresses[0] > MASH_WINDOW) mashPresses.shift();
    if (mashPresses.length >= MASH_THRESHOLD && player.mashModeT <= 0) {
      player.mashModeT = MASH_MODE_DURATION;
      sfx.mash();
      mashPresses.length = 0;
    }
  }
  prevB = bDown;

  const gaugeEl = document.getElementById('mash-gauge');
  if (player.mashModeT > 0) {
    gaugeEl.style.width = '100%';
    gaugeEl.style.background = '#7fd3ff';
  } else {
    const now = performance.now();
    while (mashPresses.length && now - mashPresses[0] > MASH_WINDOW) mashPresses.shift();
    gaugeEl.style.width = Math.min(100, (mashPresses.length / MASH_THRESHOLD) * 100) + '%';
    gaugeEl.style.background = '#4b6cb7';
  }

  if (player.mashModeT > 0) {
    player.mashModeT -= dt;
    if (player.mashModeT < 0) player.mashModeT = 0;
  }
}

/* =========================================================
   衝突判定（簡易AABB・上面着地のみ）
========================================================= */
function resolveGround() {
  player.grounded = false;
  for (const p of platforms) {
    const withinX = player.x + player.w * 0.5 > p.x && player.x + player.w * 0.5 < p.x + p.w;
    const feetY = player.y + player.h;
    if (withinX && player.vy >= 0 && feetY >= p.y && feetY <= p.y + 24) {
      player.y = p.y - player.h;
      player.vy = 0;
      player.grounded = true;
    }
  }
}

function checkItems() {
  if (collectedChars.length >= QUIZ_CHAR_COUNT) return;
  for (const it of items) {
    if (it.taken) continue;
    const dx = (player.x + player.w / 2) - it.x;
    const dy = (player.y + player.h / 2) - it.y;
    if (Math.abs(dx) < 42 && Math.abs(dy) < 42) {
      it.taken = true;
      collectedChars.push(it.char);
      updateCollectedHud();
      player.itemGlowT = 500;
      spawnSparkBurst(it.x, it.y, it.isDecoy ? '#ffb3b3' : '#ffe66b');
      sfx.key();
      if (collectedChars.length >= QUIZ_CHAR_COUNT) return;
    }
  }
}

/* =========================================================
   敵との接触（踏みつけ / 被弾）
========================================================= */
function hurtPlayer(fromX) {
  if (player.invT > 0) return;
  player.hp -= 1;
  updateHeartsHud();
  player.invT = INVINCIBLE_MS;
  player.knockT = KNOCKBACK_MS;
  player.vx = (player.x + player.w / 2 < fromX ? -1 : 1) * 4.2;
  player.vy = -6.5;
  player.grounded = false;
  sfx.hurt();
  addShake(5, 220);
  if (navigator.vibrate) navigator.vibrate(60);

  if (player.hp <= 0) {
    gameState = 'goal';
    showOverlay('ざんねん…', 'ねこがつかれてしまった…\nもう一度チャレンジしよう！', 'リトライ');
  }
}

function checkEnemyCollisions() {
  const px = player.x + player.w * 0.5;
  const pw = player.w * 0.42; // 当たり判定は見た目より少し甘く
  const ph = player.h * 0.72;
  const pTop = player.y + player.h - ph;
  const pBottom = player.y + player.h;

  for (const e of enemies) {
    if (e.dead) continue;
    const ex = e.x + e.w / 2;
    const overlapX = Math.abs(px - ex) < (pw + e.w) / 2;
    const overlapY = pBottom > e.y + 4 && pTop < e.y + e.h - 2;
    if (!overlapX || !overlapY) continue;

    const stompable = e.type !== 'spike';
    const falling = player.vy > 1.5;
    const feetAboveCore = (pBottom - player.vy) <= e.y + e.h * 0.45;

    if (stompable && falling && feetAboveCore) {
      e.dead = true;
      player.vy = STOMP_BOUNCE_V;
      player.grounded = false;
      spawnPoof(ex, e.y + e.h / 2);
      sfx.stomp();
      addShake(3, 120);
      if (navigator.vibrate) navigator.vibrate(20);
    } else {
      hurtPlayer(ex);
    }
  }
}

/* =========================================================
   ショット
========================================================= */
function spawnShot() {
  const muzzleX = player.x + (player.facing === 1 ? player.w * 0.98 : player.w * 0.02);
  const muzzleY = player.y + player.h * 0.48 + SHOT_Y_OFFSET;
  shots.push({
    x: muzzleX,
    y: muzzleY,
    vx: player.facing * SHOT_SPEED,
    life: SHOT_LIFE,
    r: SHOT_RADIUS,
  });
}

function updateShots(dt) {
  if (player.mashModeT > 0) {
    shotTimer -= dt;
    if (shotTimer <= 0) {
      spawnShot();
      shotTimer = SHOT_INTERVAL;
    }
  } else {
    shotTimer = 0;
  }

  for (let i = shots.length - 1; i >= 0; i--) {
    const b = shots[i];
    b.x += b.vx;
    b.life -= dt;
    if (b.life <= 0 || b.x < -100 || b.x > LEVEL_WIDTH + 100) {
      shots.splice(i, 1);
      continue;
    }
    let consumed = false;

    // 不正解の漢字を弾き飛ばす
    for (const it of items) {
      if (it.taken || !it.isDecoy) continue;
      if (Math.abs(b.x - it.x) < 26 && Math.abs(b.y - it.y) < 26) {
        it.taken = true;
        spawnFlyingChar(it, b.x);
        sfx.hitWrong();
        consumed = true;
        break;
      }
    }
    // 敵（トゲ以外）も倒せる
    if (!consumed) {
      for (const e of enemies) {
        if (e.dead || e.type === 'spike') continue;
        if (Math.abs(b.x - (e.x + e.w / 2)) < e.w * 0.6 && Math.abs(b.y - (e.y + e.h / 2)) < e.h * 0.7 + 10) {
          e.dead = true;
          spawnPoof(e.x + e.w / 2, e.y + e.h / 2);
          sfx.stomp();
          consumed = true;
          break;
        }
      }
    }
    if (consumed) shots.splice(i, 1);
  }
}

/* =========================================================
   更新
========================================================= */
let lastT = performance.now();

function update(dt) {
  if (gameState === 'success_anim') {
    updateMashDetection(dt);
    tickBgm(dt, true);
    updateShots(dt);
    updateFlyingChars(dt);
    updateFireworks(dt, W, H);
    updateParticles(dt);
    successAnimTimer -= dt;
    if (successAnimTimer <= 0) {
      gameState = 'goal';
      showOverlay('🎉 正解！', successOverlayText, 'つぎの問題へ');
    }
    return;
  }

  if (gameState === 'fail_anim') {
    updateMashDetection(dt);
    tickBgm(dt, true);
    updateShots(dt);
    updateFlyingChars(dt);
    updateParticles(dt);
    failAnimTimer -= dt;
    if (failAnimTimer <= 0) {
      gameState = 'goal';
      showOverlay('ざんねん…', failOverlayText, 'リトライ');
    }
    return;
  }

  updateMashDetection(dt);
  tickBgm(dt, true);
  updateShake(dt);

  const now = performance.now();
  const left = !!K['ArrowLeft'];
  const right = !!K['ArrowRight'];
  const down = !!K['ArrowDown'];
  const jumpHeld = !!K['KeyA_BTN'];

  if (player.invT > 0) player.invT -= dt;
  if (player.knockT > 0) player.knockT -= dt;
  if (player.squashT > 0) player.squashT -= dt;

  /* --- 横移動: 目標速度へ滑らかに加減速 --- */
  const maxSpeed = MOVE_SPEED * (player.mashModeT > 0 ? MASH_SPEED_MUL : 1);
  let targetVx = 0;
  let moving = false;
  if (player.knockT <= 0) {
    if (left && !right) { targetVx = -maxSpeed; player.facing = -1; moving = true; }
    else if (right && !left) { targetVx = maxSpeed; player.facing = 1; moving = true; }
  }
  const accel = player.grounded ? ACCEL_GROUND : ACCEL_AIR;
  player.vx += (targetVx - player.vx) * accel * (dt / 16.6667);

  player.x += player.vx * (dt / 16.6667);
  if (player.x < 0) player.x = 0;
  if (player.x > LEVEL_WIDTH - player.w) player.x = LEVEL_WIDTH - player.w;

  /* --- 重力と着地 --- */
  const prevVy = player.vy;
  player.vy += GRAVITY * (dt / 16.6667);
  player.y += player.vy * (dt / 16.6667);
  resolveGround();

  if (player.grounded) player.coyoteAt = now;

  // 着地の瞬間: スクワッシュ + 土煙 + 音（落下速度に応じて強く）
  if (player.grounded && !player.wasGrounded && prevVy > 3) {
    player.squashT = SQUASH_MS;
    spawnLandPuff(player.x + player.w / 2, player.y + player.h, prevVy);
    sfx.land();
    if (prevVy > 14) addShake(3, 110);
  }
  player.wasGrounded = player.grounded;

  /* --- ジャンプ: Jump Buffer + Coyote Time + 可変ジャンプ --- */
  const canJump = player.grounded || (now - player.coyoteAt < COYOTE_MS);
  if (canJump && now - jumpBufferedAt < JUMP_BUFFER_MS && player.knockT <= 0) {
    player.vy = JUMP_V;
    player.grounded = false;
    jumpBufferedAt = -1e9;
    player.coyoteAt = -1e9;
    spawnDust(player.x + player.w / 2, player.y + player.h, 5, 2.2);
    sfx.jump();
  }
  // ボタンを離したら上昇を減衰（短押し=小ジャンプ）
  if (!jumpHeld && player.vy < JUMP_CUT_V) {
    player.vy = JUMP_CUT_V;
  }

  /* --- 足音・土煙 --- */
  if (player.grounded && moving) {
    player.stepT -= dt;
    if (player.stepT <= 0) {
      player.stepT = player.mashModeT > 0 ? 170 : 250;
      spawnDust(player.x + player.w / 2 - player.facing * 14, player.y + player.h, 2, 1.2);
      sfx.step();
    }
  } else {
    player.stepT = 0;
  }

  /* --- 覚醒モードの残像 --- */
  if (player.mashModeT > 0) {
    player.afterimageT -= dt;
    if (player.afterimageT <= 0) {
      player.afterimageT = 55;
      recordAfterimage(player);
    }
  }
  updateAfterimages(dt);

  // 落下したら復帰（ダメージ1）
  if (player.y > 900) {
    player.x = 40; player.y = GROUND_Y - PLAYER_SIZE; player.vx = 0; player.vy = 0;
    hurtPlayer(player.x - 10);
  }

  updateEnemies(dt);
  updateShots(dt);
  updateFlyingChars(dt);
  updateParticles(dt);
  checkItems();
  if (gameState === 'playing') checkEnemyCollisions();
  if (gameState !== 'playing') return; // HP0でオーバーレイが出た場合はここで打ち切り

  /* --- 状態決定（優先度: アイテム取得 > 覚醒 > ジャンプ > しゃがみ > 歩行） --- */
  if (player.itemGlowT > 0) {
    player.itemGlowT -= dt;
    player.state = 'item';
  } else if (player.mashModeT > 0) {
    player.state = 'mash';
  } else if (!player.grounded) {
    player.state = 'jump';
  } else if (down && !moving) {
    player.state = 'crouch';
  } else {
    player.state = 'walk';
  }

  const animSpeed = moving ? 90 : 220;
  player.animTimer += dt;
  if (player.animTimer > animSpeed) {
    player.animTimer = 0;
    player.animFrame = (player.animFrame + 1) % COLS;
  }
  if (player.state === 'walk' && !moving) player.animFrame = 0;

  document.getElementById('modeLabel').textContent = player.mashModeT > 0 ? '✨覚醒モード✨' : '';
  updateZoneHud();

  // カメラ（見えている世界幅 VW 基準）
  const targetCamX = Math.max(0, Math.min(LEVEL_WIDTH - VW, player.x - VW * 0.4));
  camX += (targetCamX - camX) * 0.15;

  // ゴール判定
  if (player.x >= GOAL_X) {
    gameState = 'goal';
    sfx.goal();
    const answer = collectedChars.join('');
    const ok = answer === currentQuestion.word;
    if (ok) {
      successOverlayText = `すごい！ 完璧です！\n${currentQuestion.word}\n${currentQuestion.meaning}`;
      gameState = 'success_anim';
      successAnimTimer = 3300;
      resetFireworks();
    } else {
      failOverlayText = `もう一度やり直し！\n集めた順: ${answer || '（未取得）'}\n正解: ${currentQuestion.word}`;
      gameState = 'fail_anim';
      failAnimTimer = 2500;
    }
  }
}

/* =========================================================
   描画
========================================================= */
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
function zoneAt(x) {
  for (const z of ZONES) if (x < z.until) return z;
  return ZONES[ZONES.length - 1];
}
// カメラ中心位置に応じてゾーン間の色をクロスフェード
function blendedZone(x) {
  let idx = 0;
  for (let i = 0; i < ZONES.length; i++) { if (x < ZONES[i].until) { idx = i; break; } idx = i; }
  const cur = ZONES[idx];
  const next = ZONES[Math.min(idx + 1, ZONES.length - 1)];
  const dist = cur.until - x;
  const t = (cur !== next && dist < ZONE_FADE) ? 1 - dist / ZONE_FADE : 0;
  const mix = (key) => lerpColor(cur[key], next[key], t);
  return {
    name: t > 0.5 ? next.name : cur.name,
    skyTop: mix('skyTop'), skyBottom: mix('skyBottom'),
    hillA: mix('hillA'), hillB: mix('hillB'),
    grass: mix('grass'), dirt: mix('dirt'),
  };
}

function drawBackground(zone) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, zone.skyTop);
  g.addColorStop(1, zone.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 太陽のグロー
  const sunX = W * 0.82;
  const sunY = 70;
  const sunG = ctx.createRadialGradient(sunX, sunY, 12, sunX, sunY, 90);
  sunG.addColorStop(0, 'rgba(255,245,170,0.85)');
  sunG.addColorStop(1, 'rgba(255,245,170,0)');
  ctx.fillStyle = sunG;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 92, 0, Math.PI * 2);
  ctx.fill();

  // 遠景の山シルエット
  ctx.fillStyle = zone.hillA;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 24) {
    const y = H * 0.64 + Math.sin((x + camX * 0.18) * 0.010) * 16;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = zone.hillB;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 28) {
    const y = H * 0.70 + Math.sin((x + camX * 0.27) * 0.014 + 1.5) * 12;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#ffffff';
  for (const c of clouds) {
    const sx = c.x - camX * 0.4;
    if (sx < -120 || sx > W + 120) continue;
    drawCloud(sx, c.y, c.s);
  }

  const now = performance.now();
  for (const s of sparkles) {
    const sx = s.x - camX * 0.22;
    if (sx < -20 || sx > W + 20) continue;
    const a = 0.2 + (Math.sin(now * s.sp + s.tw) * 0.5 + 0.5) * 0.6;
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(sx, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCloud(x, y, s) {
  ctx.beginPath();
  ctx.ellipse(x, y, 30 * s, 18 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 26 * s, y + 4 * s, 22 * s, 15 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 26 * s, y + 6 * s, 20 * s, 14 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlatforms(zone) {
  const viewBottom = viewTop + VIEW_H;
  for (const p of platforms) {
    const sx = p.x - camX;
    if (sx + p.w < 0 || sx > VW) continue;
    ctx.fillStyle = zone.grass;
    ctx.fillRect(sx, p.y, p.w, 18);
    ctx.fillStyle = zone.dirt;
    // 画面下端まで土を描き、崖（落とし穴）との境界をはっきり見せる
    const dirtH = Math.min(p.h - 18, viewBottom - (p.y + 18));
    if (dirtH > 0) ctx.fillRect(sx, p.y + 18, p.w, dirtH);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    for (let i = 0; i < p.w; i += 34) {
      ctx.beginPath(); ctx.moveTo(sx + i, p.y + 18); ctx.lineTo(sx + i, p.y + Math.min(p.h, viewBottom - p.y)); ctx.stroke();
    }
  }
}

function drawItems() {
  for (const it of items) {
    if (it.taken) continue;
    const sx = it.x - camX;
    if (sx < -40 || sx > VW + 40) continue;
    const bob = Math.sin((performance.now() + it.x * 10) / 260) * 6;
    ctx.font = 'bold 40px "Hiragino Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 6;
    ctx.strokeText(it.char, sx, it.y + bob);
    ctx.fillStyle = it.isDecoy ? '#ffd2d2' : '#ffe66b';
    ctx.fillText(it.char, sx, it.y + bob);
  }
  const gsx = GOAL_X - camX;
  if (gsx > -60 && gsx < VW + 60) {
    ctx.font = '58px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('🏁', gsx + 30, GROUND_Y);
  }
}

function drawShots() {
  for (const b of shots) {
    const sx = b.x - camX;
    if (sx < -20 || sx > VW + 20) continue;
    ctx.save();
    ctx.shadowColor = 'rgba(140, 230, 255, 0.9)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#9be9ff';
    ctx.beginPath();
    ctx.arc(sx, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawFailShinigamiFx() {
  if (gameState !== 'fail_anim') return;
  const cx = player.x + player.w * 0.5 - camX;
  const cy = player.y + player.h * 0.46;
  const t = performance.now() * 0.0012;
  const radius = 52 + Math.sin(t * 2.4) * 4;
  for (let i = 0; i < 3; i++) {
    const ang = t + i * (Math.PI * 2 / 3);
    const x = cx + Math.cos(ang) * radius;
    const y = cy + Math.sin(ang) * 22 - 26;
    const size = 34 + (Math.sin(t * 3 + i) * 0.5 + 0.5) * 6;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 2 + i) * 0.25);
    if (shinigamiImg.complete && shinigamiImg.naturalWidth > 0) {
      ctx.drawImage(shinigamiImg, -size * 0.5, -size * 0.5, size, size);
    } else {
      ctx.fillStyle = 'rgba(240,240,255,0.65)';
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawCatFrame(x, y, w, h, facing, state, frame, alpha) {
  const row = ANIM[
    state === 'item' ? 'ITEM' :
    state === 'mash' ? 'MASH' :
    state === 'jump' ? 'JUMP' :
    state === 'crouch' ? 'CROUCH' : 'WALK'
  ];
  const sxSrc = frame * FRAME, sySrc = row * FRAME;
  // スプライト下側の透明余白分だけ下へずらし、足を地面に接地させる
  const footShift = h * ROW_FOOT_PAD[row];
  ctx.save();
  ctx.globalAlpha = alpha;
  if (facing === -1) {
    ctx.translate(x + w / 2, 0);
    ctx.scale(-1, 1);
    ctx.translate(-(x + w / 2), 0);
  }
  ctx.drawImage(sheet, sxSrc, sySrc, FRAME, FRAME, x, y + footShift + CAT_DRAW_DOWN, w, h);
  ctx.restore();
}

function drawPlayer() {
  if (!sheet.complete || sheet.naturalWidth === 0) return;

  // 覚醒モードの残像
  for (const a of afterimages) {
    const alpha = 0.28 * (a.life / a.ttl);
    drawCatFrame(a.x - camX, a.y, player.w, player.h, a.facing, a.state, a.frame, alpha);
  }

  // 被弾後の無敵中は点滅
  if (player.invT > 0 && Math.floor(performance.now() / 90) % 2 === 0) return;

  // スクワッシュ&ストレッチ（着地でつぶれ、上昇で伸びる）
  let scaleX = 1, scaleY = 1;
  if (player.squashT > 0) {
    const k = player.squashT / SQUASH_MS;
    scaleX = 1 + 0.16 * k;
    scaleY = 1 - 0.20 * k;
  } else if (!player.grounded && player.vy < -6) {
    scaleX = 0.94;
    scaleY = 1.07;
  }

  const dw = player.w * scaleX, dh = player.h * scaleY;
  const dx = player.x - camX + (player.w - dw) / 2;
  const dy = player.y + (player.h - dh); // 足元基準で変形
  drawCatFrame(dx, dy, dw, dh, player.facing, player.state, player.animFrame, 1);
}

function render() {
  const zone = blendedZone(camX + VW * 0.5);
  const shake = getShakeOffset();
  ctx.save();
  ctx.translate(shake.x, shake.y);

  // 空・山・花火は画面座標のまま
  drawBackground(zone);
  if (gameState === 'success_anim') drawFireworks(ctx, W);

  // ここから世界座標レイヤー（スケール + 縦オフセット）
  ctx.save();
  ctx.scale(viewScale, viewScale);
  ctx.translate(0, -viewTop);
  drawPlatforms(zone);
  drawItems();
  drawEnemies(ctx, camX, VW);
  drawShots();
  drawParticles(ctx, camX, VW);
  drawFlyingChars(ctx, camX, VW);
  drawPlayer();
  drawFailShinigamiFx();
  ctx.restore();

  ctx.restore();
}

/* =========================================================
   メインループ
========================================================= */
function loop(now) {
  const dt = Math.min(now - lastT, 48);
  lastT = now;
  if (gameState === 'playing' || gameState === 'fail_anim' || gameState === 'success_anim') update(dt);
  render();
  requestAnimationFrame(loop);
}

/* =========================================================
   オーバーレイ / 開始・リスタート
========================================================= */
const overlay = document.getElementById('overlay');
const overlayH1 = overlay.querySelector('h1');
const overlayPs = overlay.querySelectorAll('p');
const startBtn = document.getElementById('startBtn');

function showOverlay(title, sub, btnLabel) {
  overlayH1.textContent = title;
  overlayPs.forEach(p => p.style.display = 'none');
  let subP = overlay.querySelector('.subline');
  if (!subP) {
    subP = document.createElement('p');
    subP.className = 'subline';
    overlay.insertBefore(subP, startBtn);
  }
  subP.style.display = 'block';
  subP.style.whiteSpace = 'pre-line';
  subP.textContent = sub || '';
  startBtn.textContent = btnLabel || 'スタート';
  overlay.classList.remove('hidden');
}

function resetLevel() {
  player.x = 40; player.y = GROUND_Y - PLAYER_SIZE;
  player.vx = 0; player.vy = 0;
  player.mashModeT = 0; player.itemGlowT = 0;
  player.hp = MAX_HP;
  player.invT = 0; player.knockT = 0;
  player.squashT = 0; player.stepT = 0;
  player.coyoteAt = -1e9;
  player.wasGrounded = false;
  jumpBufferedAt = -1e9;
  updateHeartsHud();
  failAnimTimer = 0;
  failOverlayText = '';
  successAnimTimer = 0;
  successOverlayText = '';
  resetFireworks();
  resetBgm();
  resetEnemies();
  shotTimer = 0;
  shots.length = 0;
  flyingChars.length = 0;
  particles.length = 0;
  afterimages.length = 0;
  setupQuestion();
  camX = 0;
  showOverlay('問題', `お題: ${currentQuestion.word}\n正しい順番で4文字を集めて旗で判定！\n敵は踏みつけかネコショットで倒せる。トゲには注意！`, 'スタート');
}

startBtn.addEventListener('pointerdown', e => {
  e.preventDefault();
  unlockAudio();
  resetLevel();
  gameState = 'playing';
  overlay.classList.add('hidden');
});

resetLevel();
requestAnimationFrame(loop);
