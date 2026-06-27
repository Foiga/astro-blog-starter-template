// パワプロ風ホームランダービー —— ゲームエンジン（純ロジック、DOM非依存）。
// 投球生成・ミート判定・打球物理（飛距離/方向）・ホームラン判定・スコア集計。

export type PitchType = 'straight' | 'curve' | 'slider' | 'changeup';

// ストライクゾーンは正規化座標 [-1,1]（中心 0,0）で表す。
export interface Pitch {
  type: PitchType;
  meetX: number; // ボールがミート面を横切る位置 x
  meetY: number; // 同 y（+が上）
  travelMs: number; // リリース→ミート面までの所要時間
  breakX: number; // 変化量（描画用：接近に伴う横ズレ）
  breakY: number; // 変化量（縦）
}

export interface SwingInput {
  cursorX: number; // ミートカーソル中心 x
  cursorY: number; // 同 y
  timingError: number; // スイング時刻 − ボール到達時刻（ms, +が差し込まれ気味=遅い）
}

export type ContactQuality = 'miss' | 'foul' | 'weak' | 'good' | 'homerun';

export interface ContactResult {
  quality: ContactQuality;
  meet: number; // 芯で捉えた度合い 0..1
  exitVelocity: number; // 初速 (m/s)
  launchAngle: number; // 打ち出し角 (deg)
  sprayAngle: number; // 左右方向 (deg, -=レフト方向/引っ張り, +=ライト方向/流し)
  distance: number; // 飛距離 (m)
  isHomeRun: boolean;
  timingJudge: 'just' | 'early' | 'late';
}

export interface DerbyState {
  totalPitches: number;
  pitchNumber: number; // 1始まり、現在の球
  power: number; // 打者パワー 0..1
  homeRuns: number;
  longest: number;
  totalDistance: number;
  results: ContactResult[];
  status: 'playing' | 'over';
}

// --- チューニング定数 ---
const TIMING_TOLERANCE = 170; // これを超える誤差で空振り寄り (ms)
const TIMING_JUST = 45; // この範囲なら「ジャスト」(ms)
const CURSOR_TOLERANCE = 0.85; // カーソルとボールの許容ズレ（正規化）
const GRAVITY = 9.8;
const AIR_FACTOR = 0.66; // 空気抵抗のざっくり補正（飛びすぎ防止）

export function createDerby(totalPitches = 10, power = 0.9): DerbyState {
  return {
    totalPitches,
    pitchNumber: 1,
    power,
    homeRuns: 0,
    longest: 0,
    totalDistance: 0,
    results: [],
    status: 'playing',
  };
}

const PITCH_TYPES: PitchType[] = ['straight', 'curve', 'slider', 'changeup'];

// 次の投球を生成（コースと球種をランダム）。難易度は球速・変化で表現。
export function nextPitch(state: DerbyState): Pitch {
  const type = PITCH_TYPES[Math.floor(Math.random() * PITCH_TYPES.length)];
  // ゾーン内寄りに散らす（ダービーなので甘め）
  const meetX = rand(-0.7, 0.7);
  const meetY = rand(-0.6, 0.6);

  let travelMs = 620; // ストレート基準
  let breakX = 0;
  let breakY = 0;
  switch (type) {
    case 'straight':
      travelMs = rand(560, 640);
      break;
    case 'curve':
      travelMs = rand(720, 820);
      breakX = rand(-0.5, -0.2);
      breakY = rand(-0.6, -0.3); // 沈む
      break;
    case 'slider':
      travelMs = rand(640, 720);
      breakX = rand(0.25, 0.6);
      breakY = rand(-0.2, -0.05);
      break;
    case 'changeup':
      travelMs = rand(780, 900);
      breakY = rand(-0.35, -0.15);
      break;
  }
  return { type, meetX, meetY, travelMs, breakX, breakY };
}

// スイングを判定して打球結果を返す（state は更新しない。記録は recordResult で）。
export function resolveSwing(pitch: Pitch, swing: SwingInput, power: number): ContactResult {
  const at = Math.abs(swing.timingError);
  const timingScore = clamp(1 - at / TIMING_TOLERANCE, 0, 1);

  const dx = swing.cursorX - pitch.meetX;
  const dy = swing.cursorY - pitch.meetY;
  const offset = Math.hypot(dx, dy);
  const cursorScore = clamp(1 - offset / CURSOR_TOLERANCE, 0, 1);

  const meet = timingScore * cursorScore;
  const timingJudge: ContactResult['timingJudge'] =
    at <= TIMING_JUST ? 'just' : swing.timingError < 0 ? 'early' : 'late';

  // 空振り
  if (meet < 0.16) {
    return {
      quality: 'miss',
      meet,
      exitVelocity: 0,
      launchAngle: 0,
      sprayAngle: 0,
      distance: 0,
      isHomeRun: false,
      timingJudge,
    };
  }

  // 初速：パワー × ミート
  const exitVelocity = (34 + 24 * meet * power) * rand(0.96, 1.09);

  // 打ち出し角：ボールの下を捉える(cursorY<ballY)ほど高く上がる。芯（中心）でも適度に上がる。
  const under = pitch.meetY - swing.cursorY; // +で下を叩いた
  let launchAngle = 25 + under * 28 + rand(-4, 4);
  launchAngle = clamp(launchAngle, -8, 52);

  // 左右方向：カーソル横ズレ＋タイミング（早い=引っ張り）
  const pull = swing.timingError < 0 ? -1 : 1;
  let sprayAngle = dx * 32 + pull * (at / TIMING_TOLERANCE) * 28 + rand(-5, 5);
  sprayAngle = clamp(sprayAngle, -65, 65);

  // 飛距離（射出体運動 + 補正）。ゴロ(角度<=0)はほぼ転がるだけ。
  let distance = 0;
  if (launchAngle > 0) {
    const rad = (launchAngle * Math.PI) / 180;
    distance = ((exitVelocity * exitVelocity * Math.sin(2 * rad)) / GRAVITY) * AIR_FACTOR;
  } else {
    distance = exitVelocity * 1.2; // ゴロの転がり
  }

  const fair = sprayAngle > -45 && sprayAngle < 45;
  const fence = fenceDistance(sprayAngle);
  const isHomeRun = fair && launchAngle >= 16 && launchAngle <= 48 && distance >= fence;

  let quality: ContactQuality;
  if (!fair) quality = 'foul';
  else if (isHomeRun) quality = 'homerun';
  else if (distance >= fence * 0.62 && launchAngle > 8) quality = 'good';
  else quality = 'weak';

  return { quality, meet, exitVelocity, launchAngle, sprayAngle, distance, isHomeRun, timingJudge };
}

// フェンスまでの距離（中堅が最も深く、両翼が浅い）
export function fenceDistance(sprayAngle: number): number {
  const t = Math.abs(sprayAngle) / 45; // 0:中堅 1:ライン際
  return 104 - 12 * t; // 中堅104m → ライン際92m
}

// 結果を state に記録し、次の球へ進める。
export function recordResult(state: DerbyState, result: ContactResult): void {
  state.results.push(result);
  if (result.isHomeRun) state.homeRuns++;
  if (result.distance > state.longest) state.longest = Math.round(result.distance);
  state.totalDistance += Math.round(result.distance);
  if (state.pitchNumber >= state.totalPitches) {
    state.status = 'over';
  } else {
    state.pitchNumber++;
  }
}

// --- 小物 ---
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export const QUALITY_LABEL: Record<ContactQuality, string> = {
  miss: '空振り',
  foul: 'ファウル',
  weak: '凡打',
  good: 'いい当たり',
  homerun: 'ホームラン！',
};
