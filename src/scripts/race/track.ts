// マリオカート風 擬似3Dレース —— コース定義と投影（アウトラン型セグメント方式）。
// 参考: Jake Gordon の pseudo-3D racer のモデルを簡略化して採用。純ロジック。

export const SEG = {
  length: 200, // 1セグメントの奥行き（ワールド単位）
  rumble: 3, // ランブル縞のセグメント数
} as const;

export const ROAD_WIDTH = 2000; // 路面の半幅
export const DRAW_DISTANCE = 160; // 描画する前方セグメント数
export const CAMERA_HEIGHT = 1000;
export const FIELD_OF_VIEW = 100; // 度
export const CAMERA_DEPTH = 1 / Math.tan(((FIELD_OF_VIEW / 2) * Math.PI) / 180);

// 速度関連（units/sec）。dt秒で position += speed*dt。
export const MAX_SPEED = (SEG.length / (1 / 60)) * 0.92; // ≒ 11000
export const ACCEL = MAX_SPEED / 4.5;
export const BRAKING = -MAX_SPEED;
export const DECEL = -MAX_SPEED / 5;
export const OFFROAD_DECEL = -MAX_SPEED / 1.6;
export const OFFROAD_LIMIT = MAX_SPEED / 3.4;
export const CENTRIFUGAL = 0.32; // カーブで外へ押される強さ

export type CurveAmount = number; // -:左 +:右

export interface SegPoint {
  world: { x: number; y: number; z: number };
  camera: { x: number; y: number; z: number };
  screen: { x: number; y: number; w: number; scale: number };
}
export interface Segment {
  index: number;
  p1: SegPoint;
  p2: SegPoint;
  curve: CurveAmount;
  color: 'light' | 'dark' | 'start' | 'finish';
}

function pt(z: number): SegPoint {
  return {
    world: { x: 0, y: 0, z },
    camera: { x: 0, y: 0, z: 0 },
    screen: { x: 0, y: 0, w: 0, scale: 0 },
  };
}

export class Track {
  segments: Segment[] = [];

  get length(): number {
    return this.segments.length;
  }
  get worldLength(): number {
    return this.segments.length * SEG.length;
  }

  build() {
    this.segments = [];
    const add = (n: number, curve: CurveAmount) => {
      for (let i = 0; i < n; i++) this.pushSeg(curve);
    };
    // ゆるやかな S字＋ヘアピンを含む周回コース
    add(40, 0); // スタート直線
    add(30, 2.5); // 右ゆるカーブ
    add(20, 0);
    add(30, -3.5); // 左カーブ
    add(25, 0);
    add(35, 5.5); // 右きつめ
    add(20, 0);
    add(40, -2.0); // 左ロング
    add(20, 0);
    add(28, 4.0); // 右
    add(18, -5.0); // 左へ切り返し
    add(40, 0); // ゴール前直線
    // スタート/ゴール装飾
    for (let i = 0; i < 4; i++) this.segments[i].color = 'start';
    const fi = this.segments.length - 6;
    for (let i = fi; i < fi + 3; i++) this.segments[i].color = 'finish';
  }

  private pushSeg(curve: CurveAmount) {
    const n = this.segments.length;
    const light = Math.floor(n / SEG.rumble) % 2 === 0;
    this.segments.push({
      index: n,
      p1: pt(n * SEG.length),
      p2: pt((n + 1) * SEG.length),
      curve,
      color: light ? 'light' : 'dark',
    });
  }

  findSegment(z: number): Segment {
    const i = Math.floor(z / SEG.length) % this.segments.length;
    return this.segments[(i + this.segments.length) % this.segments.length];
  }
}

// ワールド点 → カメラ → スクリーン投影
export function project(
  p: SegPoint,
  cameraX: number,
  cameraY: number,
  cameraZ: number,
  width: number,
  height: number,
  roadWidth: number,
) {
  p.camera.x = p.world.x - cameraX;
  p.camera.y = p.world.y - cameraY;
  p.camera.z = p.world.z - cameraZ;
  // 後方に回り込んだ点はごく小さい正の値でクランプ（0除算回避）
  const cz = p.camera.z <= 0 ? 0.0001 : p.camera.z;
  p.screen.scale = CAMERA_DEPTH / cz;
  p.screen.x = Math.round(width / 2 + (p.screen.scale * p.camera.x * width) / 2);
  p.screen.y = Math.round(height / 2 - (p.screen.scale * p.camera.y * height) / 2);
  p.screen.w = Math.round((p.screen.scale * roadWidth * width) / 2);
}

// z を [0, worldLength) に正規化
export function loopZ(z: number, worldLength: number): number {
  let r = z % worldLength;
  if (r < 0) r += worldLength;
  return r;
}
