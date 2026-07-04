'use strict';

/* =========================================================
   WebAudio（効果音 + BGM）
   iOS Safari: 初回タップで unlock。ミュート状態は localStorage 保存。
========================================================= */
let audioCtx = null;
let soundMuted = false;
try { soundMuted = localStorage.getItem('actionz-muted') === '1'; } catch (e) { /* private mode */ }

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function unlockAudio() {
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') ctx.resume();
}
document.addEventListener('pointerdown', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
});

function setMuted(m) {
  soundMuted = m;
  try { localStorage.setItem('actionz-muted', m ? '1' : '0'); } catch (e) { /* private mode */ }
}
function isMuted() { return soundMuted; }

function beep(freq, dur, type, vol, delaySec) {
  if (soundMuted) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = ctx.currentTime + (delaySec || 0);
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.value = vol == null ? 0.08 : vol;
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    gain.gain.setValueAtTime(gain.gain.value, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.stop(t0 + dur);
  } catch (e) { /* audio unavailable, ignore */ }
}

function noiseHit(dur, vol, delaySec) {
  if (soundMuted) return;
  try {
    const ctx = getAudioCtx();
    const t0 = ctx.currentTime + (delaySec || 0);
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    gain.gain.value = vol == null ? 0.06 : vol;
    src.connect(gain).connect(ctx.destination);
    src.start(t0);
    gain.gain.setValueAtTime(gain.gain.value, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.stop(t0 + dur + 0.01);
  } catch (e) { /* audio unavailable, ignore */ }
}

/* ---------------------------------------------------------
   BGM: 中国風ペンタトニック（宮調）寄りの音階
--------------------------------------------------------- */
const PENTA = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
const BGM_BPM = 136;
const BGM_STEP_MS = (60000 / BGM_BPM) / 2; // 8分音符
const BGM_MELODY = [0, 2, 3, 2, 4, 3, 2, 0, 2, 3, 4, 3, 2, 0, 2, -1];
const BGM_BASS =   [0,-1,-1,-1, 3,-1,-1,-1, 4,-1,-1,-1, 3,-1,-1,-1];
let bgmStep = 0;
let bgmTimer = 0;

function resetBgm() {
  bgmStep = 0;
  bgmTimer = 0;
}

function playBgmStep() {
  const m = BGM_MELODY[bgmStep % BGM_MELODY.length];
  const b = BGM_BASS[bgmStep % BGM_BASS.length];
  if (m >= 0) {
    beep(PENTA[m], 0.14, 'square', 0.045);
    beep(PENTA[m] * 1.5, 0.08, 'square', 0.018, 0.01); // うっすら5度で厚み
  }
  if (b >= 0) {
    beep(PENTA[b] * 0.5, 0.22, 'triangle', 0.04);
  }
  if (bgmStep % 4 === 2) {
    noiseHit(0.035, 0.03);
  }
  bgmStep = (bgmStep + 1) % BGM_MELODY.length;
}

function tickBgm(dt, active) {
  if (!active) return;
  if (!audioCtx || audioCtx.state !== 'running') return;
  bgmTimer -= dt;
  while (bgmTimer <= 0) {
    playBgmStep();
    bgmTimer += BGM_STEP_MS;
  }
}

/* ---------------------------------------------------------
   効果音
--------------------------------------------------------- */
const sfx = {
  jump:  () => { beep(392, 0.08, 'square', 0.08); beep(523.25, 0.13, 'square', 0.075, 0.04); },
  land:  () => { noiseHit(0.05, 0.045); beep(196, 0.06, 'triangle', 0.05); },
  step:  () => { noiseHit(0.025, 0.02); },
  item:  () => { beep(659.25, 0.08, 'square', 0.08); beep(783.99, 0.08, 'triangle', 0.08, 0.05); beep(987.77, 0.1, 'triangle', 0.075, 0.11); },
  key:   () => { beep(659.25, 0.08, 'square', 0.08); beep(783.99, 0.08, 'triangle', 0.08, 0.05); beep(987.77, 0.1, 'triangle', 0.075, 0.11); },
  mash:  () => beep(660, 0.22, 'sawtooth', 0.10),
  hitWrong: () => { noiseHit(0.06, 0.055); beep(220, 0.07, 'square', 0.045); },
  stomp: () => { noiseHit(0.05, 0.05); beep(587.33, 0.09, 'square', 0.08, 0.02); beep(880, 0.1, 'square', 0.06, 0.08); },
  hurt:  () => { beep(196, 0.12, 'sawtooth', 0.09); beep(146.83, 0.18, 'sawtooth', 0.08, 0.08); },
  goal:  () => {
    beep(392.0, 0.13, 'square', 0.08, 0.00);
    beep(523.25, 0.13, 'square', 0.08, 0.12);
    beep(659.25, 0.16, 'square', 0.085, 0.24);
    beep(783.99, 0.25, 'triangle', 0.09, 0.42);
  },
};
