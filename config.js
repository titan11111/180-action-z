'use strict';

/* =========================================================
   物理・プレイヤー
========================================================= */
const GRAVITY = 0.62;
const JUMP_V = -24.12;        // ジャンプ力 1.2倍
const JUMP_CUT_V = -7;        // 可変ジャンプ: ボタンを離したら上昇をここまで減衰
const MOVE_SPEED = 4.03;      // スピード 1.3倍
const MASH_SPEED_MUL = 1.55;
const ACCEL_GROUND = 0.32;    // 地上の加減速（1に近いほど即応答）
const ACCEL_AIR = 0.15;       // 空中の加減速
const JUMP_BUFFER_MS = 130;   // 着地前の先行ジャンプ入力を拾う猶予
const COYOTE_MS = 100;        // 崖から落ちた直後でもジャンプできる猶予
const STOMP_BOUNCE_V = -11;
const SQUASH_MS = 150;        // 着地スクワッシュの長さ

const GROUND_Y = 420;
const PLAYER_SCALE = 1.2;
const PLAYER_SIZE = 66 * PLAYER_SCALE;
const MAX_HP = 3;
const INVINCIBLE_MS = 1500;
const KNOCKBACK_MS = 260;

/* =========================================================
   ネコショット（覚醒モード中のみ）
========================================================= */
const SHOT_INTERVAL = 420;
const SHOT_SPEED = 5.75;
const SHOT_LIFE = 850;
const SHOT_Y_OFFSET = 10;
const SHOT_RADIUS = 15;

/* =========================================================
   覚醒モード（B連打）
========================================================= */
const MASH_WINDOW = 900;
const MASH_THRESHOLD = 4;
const MASH_MODE_DURATION = 3200;

/* =========================================================
   レベル地形: {x,w,y,h} y=上端。通常地面 + 浮島 + 崖ギャップ
========================================================= */
const platforms = [
  { x: -50,  w: 480,  y: GROUND_Y, h: 400 },
  { x: 560,  w: 260,  y: GROUND_Y, h: 400 },
  { x: 900,  w: 160,  y: GROUND_Y - 90, h: 20 },
  { x: 1140, w: 380,  y: GROUND_Y, h: 400 },
  { x: 1650, w: 140,  y: GROUND_Y - 130, h: 20 },
  { x: 1900, w: 140,  y: GROUND_Y - 60,  h: 20 },
  { x: 2140, w: 520,  y: GROUND_Y, h: 400 },
  { x: 2760, w: 180,  y: GROUND_Y - 100, h: 20 },
  { x: 3020, w: 700,  y: GROUND_Y, h: 400 },
];
const LEVEL_WIDTH = 3720;
const GOAL_X = 3600;

const ITEM_POINTS = [
  { x: 300,  y: GROUND_Y - 60 },
  { x: 640,  y: GROUND_Y - 60 },
  { x: 970,  y: GROUND_Y - 150 },
  { x: 1220, y: GROUND_Y - 60 },
  { x: 1400, y: GROUND_Y - 60 },
  { x: 1710, y: GROUND_Y - 190 },
  { x: 1960, y: GROUND_Y - 120 },
  { x: 2220, y: GROUND_Y - 60 },
  { x: 2450, y: GROUND_Y - 60 },
  { x: 2820, y: GROUND_Y - 160 },
  { x: 3100, y: GROUND_Y - 60 },
  { x: 3300, y: GROUND_Y - 60 },
];

/* =========================================================
   ゾーン（森 → 洞窟 → 雪山 → 城）背景・地形色が遷移する
========================================================= */
const ZONES = [
  { until: 950,  name: '森',   skyTop: '#6bb8ff', skyBottom: '#d8f1ff', hillA: '#78b4d2', hillB: '#5a96be', grass: '#8bd45a', dirt: '#c8853f' },
  { until: 1900, name: '洞窟', skyTop: '#241f33', skyBottom: '#4a3f5e', hillA: '#3a3350', hillB: '#2c2740', grass: '#7a6a9a', dirt: '#4a3f60' },
  { until: 2800, name: '雪山', skyTop: '#8fc3e8', skyBottom: '#eef7ff', hillA: '#c2d8ea', hillB: '#a5c2dc', grass: '#f4f9ff', dirt: '#9fb2c6' },
  { until: 1e9,  name: '城',   skyTop: '#3b2f4f', skyBottom: '#d98a6a', hillA: '#5a4670', hillB: '#463556', grass: '#c9b6dd', dirt: '#6d5a80' },
];
const ZONE_FADE = 260; // 境界手前のクロスフェード距離(px)

/* =========================================================
   敵の配置
   dog:   地面をパトロール（踏みつけ or ショットで倒せる）
   crow:  空を往復飛行（踏みつけ or ショットで倒せる）
   spike: 動かないトゲ（倒せない・避けるのみ）
========================================================= */
const ENEMY_DEFS = [
  { type: 'dog',   x: 660,  minX: 575,  maxX: 760 },
  { type: 'dog',   x: 1300, minX: 1155, maxX: 1470 },
  { type: 'dog',   x: 2380, minX: 2155, maxX: 2600 },
  { type: 'dog',   x: 3180, minX: 3035, maxX: 3330 },
  { type: 'crow',  x: 1050, y: GROUND_Y - 230, range: 240, amp: 42 },
  { type: 'crow',  x: 1830, y: GROUND_Y - 250, range: 280, amp: 55 },
  { type: 'crow',  x: 2900, y: GROUND_Y - 240, range: 260, amp: 46 },
  { type: 'spike', x: 1440, w: 56 },
  { type: 'spike', x: 2510, w: 56 },
  { type: 'spike', x: 3400, w: 56 },
];
const DOG_SPEED = 1.15;

/* =========================================================
   四字熟語クイズ
========================================================= */
const YOJI_POOL = [
  { word: '一石二鳥', meaning: '一つの行動で二つの利益を得ること。' },
  { word: '異口同音', meaning: '多くの人が同じことを言うこと。' },
  { word: '以心伝心', meaning: '言葉にしなくても気持ちが通じ合うこと。' },
  { word: '十人十色', meaning: '人それぞれ考え方や好みが違うこと。' },
  { word: '温故知新', meaning: '昔のことを学び、新しい知識を得ること。' },
  { word: '試行錯誤', meaning: 'いろいろ試しながら工夫して解決すること。' },
  { word: '創意工夫', meaning: '新しい考えで、よりよくするために工夫すること。' },
  { word: '一期一会', meaning: '出会いを一生に一度の大切な機会として大事にすること。' },
  { word: '言行一致', meaning: '言ったことと行動が一致していること。' },
  { word: '一喜一憂', meaning: '少しのことで喜んだり心配したりすること。' },
  { word: '一長一短', meaning: '良い点も悪い点もあること。' },
  { word: '臨機応変', meaning: 'その場の状況に合わせてうまく対応すること。' },
];
const DECOY_KANJI_POOL = '上下左右中大小天気花草木林森海空雨雪火水土金学校先生文字音楽犬猫鳥白黒赤青早朝昼夜春夏秋冬'.split('');
const QUIZ_CHAR_COUNT = 4;
const DECOY_COUNT = 4;

/* =========================================================
   スプライトシート（5x5: 1歩行 2ジャンプ 3しゃがみ 4アイテム取得 5覚醒モード）
========================================================= */
const SHEET_SIZE = 1024;
const COLS = 5, ROWS = 5;
const FRAME = SHEET_SIZE / COLS; // 204.8
const ANIM = { WALK: 0, JUMP: 1, CROUCH: 2, ITEM: 3, MASH: 4 };
// 各行の足元透明余白率（実測値）。描画時にこの分だけ下へずらして接地させる
const ROW_FOOT_PAD = [0.106, 0.131, 0.170, 0.131, 0.155];
// 猫の見た目を下方向にずらす量（世界座標px。画面上で約1cm）
const CAT_DRAW_DOWN = 24;

/* =========================================================
   ビュー（縦画面対応）
   世界の縦 VIEW_H px 分を常に画面に収め、
   地面が画面の GROUND_SCREEN_FRAC の高さに来るようスケーリングする
========================================================= */
const VIEW_H = 560;
const GROUND_SCREEN_FRAC = 0.76;
