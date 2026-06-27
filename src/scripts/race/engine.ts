// マリオカート風 擬似3Dレース —— 物理・CPU・順位・レース状態（純ロジック、DOM非依存）。

import {
  Track,
  MAX_SPEED,
  ACCEL,
  BRAKING,
  DECEL,
  OFFROAD_DECEL,
  OFFROAD_LIMIT,
  CENTRIFUGAL,
} from './track';

export interface Input {
  steer: number; // -1 左 / 0 / +1 右
  brake: boolean;
  drift: boolean;
}

export interface Kart {
  name: string;
  color: string;
  isPlayer: boolean;
  z: number; // トラック上の位置
  x: number; // 横位置（-1..1 が路面、超で芝）
  speed: number;
  lap: number; // 現在の周（1始まり）
  finished: boolean;
  finishTime: number;
  laneTarget: number; // CPU 用：狙う横ライン
  drifting: boolean;
}

export type RaceStatus = 'countdown' | 'racing' | 'finished';

export interface RaceState {
  player: Kart;
  karts: Kart[]; // player を含む全カート
  totalLaps: number;
  status: RaceStatus;
  countdown: number; // 残りカウント秒
  time: number; // 経過秒
  rank: number; // プレイヤー順位（1始まり）
  finishRank: number; // ゴール時順位
}

const CPU_DEFS = [
  { name: 'アカ', color: '#e23b3b' },
  { name: 'アオ', color: '#2f6fe2' },
  { name: 'ミドリ', color: '#2fae4a' },
];

function makeKart(name: string, color: string, isPlayer: boolean, lane: number): Kart {
  return {
    name,
    color,
    isPlayer,
    z: 0,
    x: lane,
    speed: 0,
    lap: 1,
    finished: false,
    finishTime: 0,
    laneTarget: lane,
    drifting: false,
  };
}

export function createRace(totalLaps = 3): RaceState {
  const player = makeKart('あなた', '#ffd23f', true, 0);
  const cpus = CPU_DEFS.map((d, i) => makeKart(d.name, d.color, false, (i - 1) * 0.45));
  // スタートで少し前後に散らす
  const karts = [player, ...cpus];
  karts.forEach((k, i) => (k.z = (karts.length - i) * 40));
  return {
    player,
    karts,
    totalLaps,
    status: 'countdown',
    countdown: 3.2,
    time: 0,
    rank: 1,
    finishRank: 0,
  };
}

export function distanceOf(k: Kart, worldLength: number): number {
  return (k.lap - 1) * worldLength + k.z;
}

export function updateRace(state: RaceState, track: Track, dt: number, input: Input) {
  const wl = track.worldLength;

  if (state.status === 'countdown') {
    state.countdown -= dt;
    if (state.countdown <= 0) state.status = 'racing';
    return;
  }
  if (state.status === 'finished') return;

  state.time += dt;

  // --- プレイヤー ---
  updatePlayer(state.player, track, dt, input, wl, state);

  // --- CPU ---
  for (const k of state.karts) {
    if (k.isPlayer) continue;
    updateCpu(k, track, dt, wl, state);
  }

  // --- 順位計算 ---
  const ordered = [...state.karts].sort((a, b) => rankKey(b, wl) - rankKey(a, wl));
  state.rank = ordered.findIndex((k) => k.isPlayer) + 1;

  // --- プレイヤーゴール判定 ---
  if (state.player.finished && state.status === 'racing') {
    state.status = 'finished';
    state.finishRank = state.rank;
  }
}

// ゴール済みは完走順を優先（早くゴールした方が上位）
function rankKey(k: Kart, wl: number): number {
  if (k.finished) return 1e12 - k.finishTime; // ゴール済みは最上位群、早いほど上
  return distanceOf(k, wl);
}

function updatePlayer(k: Kart, track: Track, dt: number, input: Input, wl: number, state: RaceState) {
  if (k.finished) {
    k.speed = Math.max(0, k.speed + DECEL * dt);
  } else {
    // オートアクセル（ブレーキ時のみ減速）
    if (input.brake) k.speed += BRAKING * dt;
    else k.speed += ACCEL * dt;
  }
  k.speed = clamp(k.speed, 0, MAX_SPEED);

  const seg = track.findSegment(k.z);
  const speedPct = k.speed / MAX_SPEED;

  // 操舵（ドリフトで旋回力UP・少し滑る）
  k.drifting = input.drift && input.steer !== 0 && speedPct > 0.3;
  const steerStrength = (k.drifting ? 3.1 : 2.0) * dt * speedPct;
  k.x += input.steer * steerStrength;

  // 遠心力
  k.x -= dt * speedPct * speedPct * seg.curve * CENTRIFUGAL;

  // オフロード
  if (Math.abs(k.x) > 1) {
    if (k.speed > OFFROAD_LIMIT) k.speed += OFFROAD_DECEL * dt;
  }
  k.x = clamp(k.x, -2.4, 2.4);

  advance(k, k.speed * dt, wl, state);
}

function updateCpu(k: Kart, track: Track, dt: number, wl: number, state: RaceState) {
  if (k.finished) {
    k.speed = Math.max(0, k.speed + DECEL * dt);
    advance(k, k.speed * dt, wl, state);
    return;
  }
  const seg = track.findSegment(k.z);
  const speedPct = k.speed / MAX_SPEED;

  // 目標速度：基本速い。プレイヤーとの差でラバーバンド（競る）
  const pd = distanceOf(state.player, wl);
  const kd = distanceOf(k, wl);
  let target = 0.965;
  if (kd > pd + 1500) target -= 0.07; // 前に離れすぎたら緩める
  if (kd < pd - 1500) target += 0.05; // 離されたら追う
  // 急カーブは少し減速
  target -= Math.min(Math.abs(seg.curve) / 60, 0.12);
  const targetSpeed = clamp(target, 0.3, 1) * MAX_SPEED;
  k.speed += clamp(targetSpeed - k.speed, ACCEL * dt * -1, ACCEL * dt);
  k.speed = clamp(k.speed, 0, MAX_SPEED);

  // カーブのインを狙うようライン調整
  const inside = clamp(-seg.curve * 0.12, -0.6, 0.6);
  const want = k.laneTarget + inside;
  k.x += clamp(want - k.x, -1.5 * dt, 1.5 * dt);
  // 遠心力（CPUは控えめ）
  k.x -= dt * speedPct * speedPct * seg.curve * CENTRIFUGAL * 0.5;
  k.x = clamp(k.x, -1.1, 1.1);

  advance(k, k.speed * dt, wl, state);
}

function advance(k: Kart, dz: number, wl: number, state: RaceState) {
  k.z += dz;
  if (k.z >= wl) {
    k.z -= wl;
    k.lap++;
    if (k.lap > state.totalLaps && !k.finished) {
      k.finished = true;
      k.finishTime = state.time;
      k.lap = state.totalLaps; // 表示は最終周のまま
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function rankLabel(rank: number): string {
  return `${rank}位`;
}
