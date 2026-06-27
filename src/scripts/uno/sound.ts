// UNO 効果音。音声ファイル不要：Web Audio で合成し、UNO! は音声合成で読み上げる。

let ctx: AudioContext | null = null;
let enabled = true;

function ac(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// 初回のユーザー操作で AudioContext を解放（自動再生制限の回避）
export function initAudioOnGesture() {
  const unlock = () => {
    ac();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

// 短いノイズバースト（カードを擦る/置く音）
function noiseBurst(duration: number, startFreq: number, endFreq: number, gain: number) {
  const c = ac();
  if (!c) return;
  const now = c.currentTime;
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length); // 減衰ノイズ
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(startFreq, now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 80), now + duration);
  filter.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  src.connect(filter).connect(g).connect(c.destination);
  src.start(now);
  src.stop(now + duration);
}

// カードを配る/引く音
export function playDeal() {
  noiseBurst(0.16, 2600, 700, 0.5);
}
// カードを場に出す音（少し低め・短い）
export function playPlace() {
  noiseBurst(0.13, 1800, 500, 0.6);
}

// 「UNO!」と読み上げる
export function speakUno() {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance('U-N-O!');
    u.rate = 0.95;
    u.pitch = 1.1;
    u.volume = 1;
    synth.cancel();
    synth.speak(u);
  } catch {
    /* 読み上げ非対応環境は無視 */
  }
  // 合わせて軽いチャイム
  const c = ac();
  if (!c) return;
  const now = c.currentTime;
  [660, 880].forEach((f, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, now + i * 0.1);
    g.gain.exponentialRampToValueAtTime(0.25, now + i * 0.1 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.1 + 0.18);
    o.connect(g).connect(c.destination);
    o.start(now + i * 0.1);
    o.stop(now + i * 0.1 + 0.2);
  });
}
