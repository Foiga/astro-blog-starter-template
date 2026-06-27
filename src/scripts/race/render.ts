// マリオカート風 擬似3Dレース —— Canvas 描画。
// 背景・道セグメント（台形）・カート・カウントダウン演出。

import {
  Track,
  Segment,
  project,
  SEG,
  ROAD_WIDTH,
  DRAW_DISTANCE,
  CAMERA_HEIGHT,
  CAMERA_DEPTH,
} from './track';
import type { RaceState, Kart } from './engine';

interface Theme {
  road: string;
  grass: string;
  rumble: string;
  lane?: string;
}
const THEMES: Record<Segment['color'], Theme> = {
  light: { road: '#8a8a8a', grass: '#46b049', rumble: '#ffffff', lane: '#ffffff' },
  dark: { road: '#7d7d7d', grass: '#3fa343', rumble: '#cc2222' },
  start: { road: '#9a9a9a', grass: '#46b049', rumble: '#ffffff', lane: '#ffffff' },
  finish: { road: '#efefef', grass: '#46b049', rumble: '#222222' },
};

// プレイヤー視点でコース全体を描画
export function render(ctx: CanvasRenderingContext2D, W: number, H: number, track: Track, state: RaceState) {
  const player = state.player;
  const position = player.z;
  const cameraX = player.x * ROAD_WIDTH;
  const cameraY = CAMERA_HEIGHT;
  const cameraZ = position;
  const wl = track.worldLength;

  const base = track.findSegment(position);
  const basePercent = (position % SEG.length) / SEG.length;

  // 背景（空＋遠景）
  drawBackground(ctx, W, H, base.curve);

  let x = 0;
  let dx = -(base.curve * basePercent);
  let maxy = H;

  // セグメント投影情報を保持（カート配置に使用）
  const proj: Record<number, { x: number; y: number; w: number; scale: number }> = {};

  for (let n = 0; n < DRAW_DISTANCE; n++) {
    const seg = track.segments[(base.index + n) % track.length];
    const looped = seg.index < base.index;
    const segOffset = looped ? wl : 0;

    project(seg.p1, cameraX - x, cameraY, cameraZ - segOffset, W, H, ROAD_WIDTH);
    project(seg.p2, cameraX - x - dx, cameraY, cameraZ - segOffset, W, H, ROAD_WIDTH);
    x += dx;
    dx += seg.curve;

    proj[seg.index] = { x: seg.p1.screen.x, y: seg.p1.screen.y, w: seg.p1.screen.w, scale: seg.p1.screen.scale };

    if (seg.p1.camera.z <= CAMERA_DEPTH || seg.p2.screen.y >= maxy) continue;

    drawSegment(ctx, W, THEMES[seg.color], seg);
    maxy = seg.p2.screen.y;
  }

  // CPU カート（遠い順に描画して近いものを上に）
  const cpus = state.karts.filter((k) => !k.isPlayer);
  const withDz = cpus
    .map((k) => {
      let dz = k.z - position;
      if (dz < 0) dz += wl;
      return { k, dz };
    })
    .filter((o) => o.dz > 0 && o.dz < DRAW_DISTANCE * SEG.length)
    .sort((a, b) => b.dz - a.dz);

  for (const { k } of withDz) {
    const segIdx = Math.floor(k.z / SEG.length) % track.length;
    const p = proj[segIdx];
    if (!p) continue;
    const sx = p.x + k.x * p.w;
    const sy = p.y;
    const size = p.w * 0.9; // カート幅 ≒ 路面幅基準
    drawKart(ctx, sx, sy, size, k.color, true, 0);
  }

  // プレイヤーカート（常に手前中央）
  const psize = Math.min(W, H) * 0.26;
  const tilt = (player.drifting ? 1.5 : 1) * 0; // 簡易（傾きは省略）
  drawKart(ctx, W * 0.5, H * 0.9, psize, player.color, true, tilt, player.drifting);

  // カウントダウン
  if (state.status === 'countdown') {
    const c = Math.ceil(state.countdown - 0.2);
    const txt = c <= 0 ? 'GO!' : String(c);
    drawBigText(ctx, W, H, txt, c <= 0 ? '#3fe04a' : '#fff');
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number, curve: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  sky.addColorStop(0, '#3a86d6');
  sky.addColorStop(1, '#bfe3f7');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // 遠景の丘（カーブに応じて少しスクロール）
  const shift = -curve * 6;
  ctx.fillStyle = '#5bb36a';
  ctx.beginPath();
  ctx.moveTo(0, H * 0.55);
  for (let i = -1; i <= 5; i++) {
    const hx = (i / 4) * W + shift;
    ctx.quadraticCurveTo(hx + W * 0.06, H * 0.42, hx + W * 0.12, H * 0.55);
  }
  ctx.lineTo(W, H * 0.55);
  ctx.closePath();
  ctx.fill();
}

function drawSegment(ctx: CanvasRenderingContext2D, W: number, t: Theme, seg: Segment) {
  const p1 = seg.p1.screen;
  const p2 = seg.p2.screen;

  // 芝（横幅いっぱい）
  ctx.fillStyle = t.grass;
  ctx.fillRect(0, p2.y, W, p1.y - p2.y + 1);

  // ランブル（路肩）
  poly(ctx, p1.x - p1.w - p1.w * 0.18, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - p2.w * 0.18, p2.y, t.rumble);
  poly(ctx, p1.x + p1.w, p1.y, p1.x + p1.w + p1.w * 0.18, p1.y, p2.x + p2.w + p2.w * 0.18, p2.y, p2.x + p2.w, p2.y, t.rumble);

  // 路面
  poly(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, t.road);

  // センターライン（light のみ点線風）
  if (t.lane) {
    const lw1 = p1.w * 0.04;
    const lw2 = p2.w * 0.04;
    poly(ctx, p1.x - lw1, p1.y, p1.x + lw1, p1.y, p2.x + lw2, p2.y, p2.x - lw2, p2.y, t.lane);
  }
}

function drawKart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
  _behind: boolean,
  tilt: number,
  drifting = false,
) {
  const w = size;
  const h = size * 0.7;
  ctx.save();
  ctx.translate(x, y);
  // 影
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.5, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  // 車体（背面：台形）
  ctx.fillStyle = color;
  roundPoly(ctx, [
    [-w * 0.42, -h * 0.2],
    [w * 0.42, -h * 0.2],
    [w * 0.5, -h * 0.7],
    [-w * 0.5, -h * 0.7],
  ]);
  // タイヤ
  ctx.fillStyle = '#222';
  ctx.fillRect(-w * 0.56, -h * 0.45, w * 0.16, h * 0.4);
  ctx.fillRect(w * 0.4, -h * 0.45, w * 0.16, h * 0.4);
  // ドライバー（2頭身：頭＋ヘルメット）
  ctx.fillStyle = '#f2c79a';
  ctx.beginPath();
  ctx.arc(0, -h * 0.95, w * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, -h * 1.0, w * 0.22, Math.PI, Math.PI * 2);
  ctx.fill();

  // ドリフト時の火花
  if (drifting) {
    ctx.fillStyle = 'rgba(255,180,40,0.85)';
    for (let i = 0; i < 4; i++) {
      const sx = (i % 2 === 0 ? -1 : 1) * w * (0.5 + Math.random() * 0.1);
      ctx.beginPath();
      ctx.arc(sx, -h * 0.1 + Math.random() * h * 0.1, w * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBigText(ctx: CanvasRenderingContext2D, W: number, H: number, text: string, color: string) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const s = Math.round(Math.min(W, H) * 0.22);
  ctx.font = `bold ${s}px sans-serif`;
  ctx.lineWidth = s * 0.12;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.fillStyle = color;
  ctx.strokeText(text, W / 2, H * 0.4);
  ctx.fillText(text, W / 2, H * 0.4);
  ctx.restore();
}

function poly(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number,
  fill: string,
) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

function roundPoly(ctx: CanvasRenderingContext2D, pts: number[][]) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
}
