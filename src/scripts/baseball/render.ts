// パワプロ風ホームランダービー —— Canvas 描画。
// 球場・2頭身キャラ・ボール・ミートカーソル・打球の軌道と飛距離表示。

import { type Pitch, type ContactResult, fenceDistance } from './engine';

export interface View {
  W: number;
  H: number;
  phase: 'aim' | 'pitch' | 'result';
  cursor: { x: number; y: number };
  pitch?: Pitch | null;
  ballProgress: number; // pitch 中 0..1（投手→ミート面）
  swingT: number; // 打者スイングアニメ 0..1（0=構え）
  pitcherT: number; // 投手モーション 0..1
  hit?: HitAnim | null;
  result?: ContactResult | null;
  banner?: string | null;
  bannerSub?: string | null;
}

export interface HitAnim {
  t: number; // 経過 0..1
  distance: number;
  sprayAngle: number;
  launchAngle: number;
  isHomeRun: boolean;
}

// ゾーンの画面上マッピング
function zoneRect(W: number, H: number) {
  return {
    cx: W * 0.5,
    cy: H * 0.6,
    hw: Math.min(W * 0.17, 110),
    hh: Math.min(H * 0.13, 95),
  };
}
export function zoneToScreen(W: number, H: number, x: number, y: number) {
  const z = zoneRect(W, H);
  return { sx: z.cx + x * z.hw, sy: z.cy - y * z.hh };
}
// 画面座標 → ゾーン正規化（入力で使用）
export function screenToZone(W: number, H: number, sx: number, sy: number) {
  const z = zoneRect(W, H);
  return { x: (sx - z.cx) / z.hw, y: -(sy - z.cy) / z.hh };
}

const SKY_TOP = '#7fb6e8';
const SKY_BOT = '#bfe0f5';
const GRASS = '#3a8f3a';
const GRASS_DK = '#2f7d2f';
const DIRT = '#b9824b';
const FENCE = '#16432a';

export function render(ctx: CanvasRenderingContext2D, v: View) {
  const { W, H } = v;
  ctx.clearRect(0, 0, W, H);
  drawField(ctx, W, H);
  drawPitcher(ctx, W, H, v.pitcherT);

  // 打球アニメ（結果フェーズ）
  if (v.phase === 'result' && v.hit) {
    drawHitBall(ctx, W, H, v.hit);
  }

  // 投球中のボール
  if (v.phase === 'pitch' && v.pitch) {
    drawPitchBall(ctx, W, H, v.pitch, v.ballProgress);
  }

  // ゾーン＆ミートカーソル（狙う/投球フェーズ）
  if (v.phase === 'aim' || v.phase === 'pitch') {
    drawZone(ctx, W, H);
    drawCursor(ctx, W, H, v.cursor);
  }

  drawBatter(ctx, W, H, v.swingT);

  if (v.banner) drawBanner(ctx, W, H, v.banner, v.bannerSub ?? '');
}

function drawField(ctx: CanvasRenderingContext2D, W: number, H: number) {
  // 空
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.3);
  sky.addColorStop(0, SKY_TOP);
  sky.addColorStop(1, SKY_BOT);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H * 0.32);

  // 外野フェンス（奥の弧）
  const fenceY = H * 0.3;
  ctx.fillStyle = FENCE;
  ctx.beginPath();
  ctx.moveTo(0, fenceY);
  ctx.quadraticCurveTo(W * 0.5, fenceY - H * 0.08, W, fenceY);
  ctx.lineTo(W, fenceY + H * 0.04);
  ctx.quadraticCurveTo(W * 0.5, fenceY - H * 0.04, 0, fenceY + H * 0.04);
  ctx.closePath();
  ctx.fill();

  // 芝（手前に広がる扇）
  const grass = ctx.createLinearGradient(0, fenceY, 0, H);
  grass.addColorStop(0, GRASS_DK);
  grass.addColorStop(1, GRASS);
  ctx.fillStyle = grass;
  ctx.fillRect(0, fenceY, W, H - fenceY);

  // 芝のストライプ
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = -6; i < 6; i++) {
    ctx.beginPath();
    const x = W * 0.5 + i * W * 0.12;
    ctx.moveTo(W * 0.5, H);
    ctx.lineTo(x - W * 0.04, fenceY);
    ctx.lineTo(x + W * 0.04, fenceY);
    ctx.closePath();
    if (i % 2 === 0) ctx.fill();
  }

  // 内野（土）と本塁周り
  ctx.fillStyle = DIRT;
  ctx.beginPath();
  ctx.moveTo(W * 0.5, H * 1.02);
  ctx.lineTo(W * 0.18, H * 0.78);
  ctx.lineTo(W * 0.5, H * 0.52);
  ctx.lineTo(W * 0.82, H * 0.78);
  ctx.closePath();
  ctx.fill();

  // ファウルライン
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(2, W * 0.006);
  ctx.beginPath();
  ctx.moveTo(W * 0.5, H * 0.62);
  ctx.lineTo(W * 0.04, fenceY + H * 0.02);
  ctx.moveTo(W * 0.5, H * 0.62);
  ctx.lineTo(W * 0.96, fenceY + H * 0.02);
  ctx.stroke();

  // 本塁ベース
  ctx.fillStyle = '#fff';
  const hb = zoneToScreen(W, H, 0, -1.25);
  ctx.beginPath();
  ctx.moveTo(hb.sx - 10, hb.sy);
  ctx.lineTo(hb.sx + 10, hb.sy);
  ctx.lineTo(hb.sx + 8, hb.sy + 10);
  ctx.lineTo(hb.sx - 8, hb.sy + 10);
  ctx.closePath();
  ctx.fill();
}

// 2頭身キャラ（汎用）。back=true で背面（打者）。
function draw2Head(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  uniform: string,
  back: boolean,
  num = 7,
) {
  const r = 18 * scale; // 頭半径
  // 影
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 2.4, r * 1.3, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // 胴
  ctx.fillStyle = uniform;
  roundRect(ctx, x - r * 0.95, y + r * 0.5, r * 1.9, r * 1.9, r * 0.5);
  ctx.fill();

  // 番号 or 顔
  if (back) {
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(r * 0.9)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), x, y + r * 1.4);
  }

  // 頭
  ctx.fillStyle = '#f2c79a';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // 帽子
  ctx.fillStyle = uniform;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.15, r, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - r, y - r * 0.2, r * 2, r * 0.25);
  if (!back) {
    // つば
    ctx.fillRect(x - r * 0.2, y - r * 0.05, r * 1.1, r * 0.2);
    // 目
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y + r * 0.15, r * 0.12, 0, Math.PI * 2);
    ctx.arc(x + r * 0.35, y + r * 0.15, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPitcher(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const x = W * 0.5;
  const y = H * 0.4;
  // マウンド
  ctx.fillStyle = DIRT;
  ctx.beginPath();
  ctx.ellipse(x, y + 28, 46, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  draw2Head(ctx, x, y - 8, 0.62, '#c0392b', false, 1);
  // 投球腕の振り
  const r = 18 * 0.62;
  ctx.strokeStyle = '#f2c79a';
  ctx.lineWidth = r * 0.5;
  ctx.lineCap = 'round';
  const armA = -Math.PI * 0.5 + t * Math.PI * 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.6);
  ctx.lineTo(x + Math.cos(armA) * r * 1.6, y + r * 0.6 + Math.sin(armA) * r * 1.6);
  ctx.stroke();
}

function drawBatter(ctx: CanvasRenderingContext2D, W: number, H: number, swingT: number) {
  const base = zoneToScreen(W, H, -1.15, -1.1);
  const x = base.sx;
  const y = base.sy - 70;
  draw2Head(ctx, x, y, 1.15, '#1d4e89', true, 51);

  // バット（構え→スイングで回転）
  const r = 18 * 1.15;
  const ease = swingT <= 0 ? 0 : easeOutCubic(swingT);
  const ang = (-1.9 + ease * 3.0) * 1; // 構え（後ろ）→ 前方へ振り抜く
  const hubX = x + r * 0.9;
  const hubY = y + r * 1.2;
  const len = r * 2.6;
  ctx.strokeStyle = '#caa472';
  ctx.lineWidth = r * 0.32;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hubX, hubY);
  ctx.lineTo(hubX + Math.cos(ang) * len, hubY + Math.sin(ang) * len);
  ctx.stroke();
  // 手
  ctx.fillStyle = '#f2c79a';
  ctx.beginPath();
  ctx.arc(hubX, hubY, r * 0.28, 0, Math.PI * 2);
  ctx.fill();

  // スイングの軌跡
  if (swingT > 0 && swingT < 0.9) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = r * 0.18;
    ctx.beginPath();
    ctx.arc(hubX, hubY, len, -1.9 + ease * 3.0 - 0.6, -1.9 + ease * 3.0);
    ctx.stroke();
  }
}

function drawZone(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const z = zoneRect(W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(z.cx - z.hw, z.cy - z.hh, z.hw * 2, z.hh * 2);
  // 3x3 グリッド
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    const gx = z.cx - z.hw + (z.hw * 2 * i) / 3;
    const gy = z.cy - z.hh + (z.hh * 2 * i) / 3;
    ctx.beginPath();
    ctx.moveTo(gx, z.cy - z.hh);
    ctx.lineTo(gx, z.cy + z.hh);
    ctx.moveTo(z.cx - z.hw, gy);
    ctx.lineTo(z.cx + z.hw, gy);
    ctx.stroke();
  }
}

function drawCursor(ctx: CanvasRenderingContext2D, W: number, H: number, cursor: { x: number; y: number }) {
  const { sx, sy } = zoneToScreen(W, H, cursor.x, cursor.y);
  const rad = Math.min(W, H) * 0.06;
  ctx.strokeStyle = '#ffe14d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(sx, sy, rad, 0, Math.PI * 2);
  ctx.stroke();
  // 十字
  ctx.beginPath();
  ctx.moveTo(sx - rad * 0.5, sy);
  ctx.lineTo(sx + rad * 0.5, sy);
  ctx.moveTo(sx, sy - rad * 0.5);
  ctx.lineTo(sx, sy + rad * 0.5);
  ctx.stroke();
}

function drawPitchBall(ctx: CanvasRenderingContext2D, W: number, H: number, pitch: Pitch, p: number) {
  const from = { sx: W * 0.5, sy: H * 0.36 };
  const target = zoneToScreen(W, H, pitch.meetX, pitch.meetY);
  // 変化：飛行中に弧を描くが、ミート面(p=1)では必ず meet 位置に収束させる
  // （ロジックの判定点 meetX/meetY と一致させるため）
  const bow = Math.sin(Math.PI * p);
  const bx = pitch.breakX * bow * (W * 0.1);
  const by = pitch.breakY * bow * (H * 0.05);
  const sx = lerp(from.sx, target.sx, p) + bx;
  const sy = lerp(from.sy, target.sy, p) + by;
  const rad = lerp(3, Math.min(W, H) * 0.035, p);

  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#d22';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sx, sy, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawHitBall(ctx: CanvasRenderingContext2D, W: number, H: number, hit: HitAnim) {
  const start = zoneToScreen(W, H, 0, -0.6);
  // 飛距離を画面奥行きにマップ（フェンス基準）
  const fence = fenceDistance(hit.sprayAngle);
  const ratio = Math.min(hit.distance / fence, 1.6);
  const fenceScreenY = H * 0.3;
  const endY = start.sy - (start.sy - fenceScreenY) * Math.min(ratio, 1) - (ratio > 1 ? (ratio - 1) * H * 0.18 : 0);
  // 横方向（spray）
  const endX = W * 0.5 + (hit.sprayAngle / 45) * W * 0.42;

  const t = hit.t;
  const x = lerp(start.sx, endX, t);
  // 放物線（上がって落ちる）
  const arc = Math.sin(t * Math.PI) * Math.min(0.18 + hit.launchAngle / 200, 0.32) * H;
  const yLine = lerp(start.sy, endY, t);
  const y = yLine - arc;

  const scale = lerp(1, 0.4, t);
  // 軌跡
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let s = 0; s <= t; s += 0.05) {
    const xs = lerp(start.sx, endX, s);
    const a = Math.sin(s * Math.PI) * Math.min(0.18 + hit.launchAngle / 200, 0.32) * H;
    const ys = lerp(start.sy, endY, s) - a;
    if (s === 0) ctx.moveTo(xs, ys);
    else ctx.lineTo(xs, ys);
  }
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#d22';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, Math.min(W, H) * 0.03 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 飛距離表示
  ctx.fillStyle = hit.isHomeRun ? '#ffe14d' : '#fff';
  ctx.font = `bold ${Math.round(Math.min(W, H) * 0.05)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${Math.round(hit.distance)} m`, x, y - 12);
}

function drawBanner(ctx: CanvasRenderingContext2D, W: number, H: number, text: string, sub: string) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const big = Math.round(Math.min(W, H) * 0.11);
  ctx.font = `bold ${big}px sans-serif`;
  ctx.lineWidth = big * 0.12;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.fillStyle = text.includes('ホームラン') ? '#ffe14d' : '#fff';
  ctx.strokeText(text, W * 0.5, H * 0.2);
  ctx.fillText(text, W * 0.5, H * 0.2);
  if (sub) {
    const s = Math.round(Math.min(W, H) * 0.045);
    ctx.font = `bold ${s}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.strokeText(sub, W * 0.5, H * 0.2 + big * 0.8);
    ctx.fillText(sub, W * 0.5, H * 0.2 + big * 0.8);
  }
  ctx.restore();
}

// --- 小物 ---
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
