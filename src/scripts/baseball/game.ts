// パワプロ風ホームランダービー —— ゲームループ／入力／状態機械。
// engine（純ロジック）と render（Canvas描画）を接続し、DOMのスコア表示を更新。

import {
  type DerbyState,
  type Pitch,
  type ContactResult,
  createDerby,
  nextPitch,
  resolveSwing,
  recordResult,
  QUALITY_LABEL,
} from './engine';
import { render, screenToZone, type View, type HitAnim } from './render';

type Phase = 'aim' | 'pitch' | 'result' | 'over';

const AIM_MS = 600; // 構え時間
const SWING_GRACE = 170; // ミート面通過後もこの間はスイング可
const SWING_ANIM = 260; // スイングアニメ長
const HIT_ANIM = 1500; // 打球アニメ長
const RESULT_HOLD = 900; // 凡打/空振り表示の保持

export class BaseballGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;

  private state: DerbyState;
  private phase: Phase = 'aim';
  private pitch: Pitch | null = null;
  private cursor = { x: 0, y: 0 };

  private phaseStart = 0; // 現フェーズ開始時刻
  private ballStart = 0; // 投球開始時刻
  private swingAt = 0; // スイング時刻（0=未スイング）
  private swung = false;
  private hit: HitAnim | null = null;
  private result: ContactResult | null = null;
  private banner: string | null = null;
  private bannerSub: string | null = null;

  private dom: {
    pitch: HTMLElement;
    hr: HTMLElement;
    long: HTMLElement;
    msg: HTMLElement;
    swing: HTMLButtonElement;
    overlay: HTMLElement;
    overlayTitle: HTMLElement;
    overlayStats: HTMLElement;
    replay: HTMLButtonElement;
  };

  constructor(canvas: HTMLCanvasElement, dom: BaseballGame['dom']) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.dom = dom;
    this.state = createDerby(10, 0.85);

    this.resize();
    window.addEventListener('resize', () => this.resize());

    // 入力：カーソル移動（キャンバス上をタッチ/ドラッグ＝絶対位置でゾーンへ）
    const move = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const z = screenToZone(this.W, this.H, sx, sy);
      this.cursor.x = clamp(z.x, -1.4, 1.4);
      this.cursor.y = clamp(z.y, -1.3, 1.3);
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      move(e);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pressure > 0 || e.buttons > 0) move(e);
    });

    this.dom.swing.addEventListener('click', () => this.onSwing());
    this.dom.replay.addEventListener('click', () => this.restart());

    this.startPitchCycle(performance.now());
    requestAnimationFrame((t) => this.loop(t));
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = rect.width;
    this.H = rect.height;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private restart() {
    this.state = createDerby(10, 0.85);
    this.dom.overlay.classList.remove('bb-show');
    this.hit = null;
    this.result = null;
    this.startPitchCycle(performance.now());
  }

  private startPitchCycle(now: number) {
    this.pitch = nextPitch(this.state);
    this.phase = 'aim';
    this.phaseStart = now;
    this.swingAt = 0;
    this.swung = false;
    this.hit = null;
    this.result = null;
    this.banner = '構えて…';
    this.bannerSub = pitchTypeLabel(this.pitch.type);
    this.updateHud();
    this.dom.swing.disabled = true;
  }

  private onSwing() {
    if (this.phase !== 'pitch' || this.swung || !this.pitch) return;
    this.swung = true;
    this.swingAt = performance.now();
    const tBall = this.swingAt - this.ballStart;
    const timingError = tBall - this.pitch.travelMs;
    const result = resolveSwing(
      this.pitch,
      { cursorX: this.cursor.x, cursorY: this.cursor.y, timingError },
      this.state.power,
    );
    this.applyResult(result);
  }

  // スイングしなかった（見逃し）
  private takePitch() {
    const result: ContactResult = {
      quality: 'miss',
      meet: 0,
      exitVelocity: 0,
      launchAngle: 0,
      sprayAngle: 0,
      distance: 0,
      isHomeRun: false,
      timingJudge: 'late',
    };
    this.applyResult(result, true);
  }

  private applyResult(result: ContactResult, taken = false) {
    this.result = result;
    this.phase = 'result';
    this.phaseStart = performance.now();
    this.dom.swing.disabled = true;

    if (result.quality === 'miss') {
      this.banner = taken ? '見逃し' : '空振り';
      this.bannerSub = '';
      this.hit = null;
    } else {
      this.banner = QUALITY_LABEL[result.quality];
      this.bannerSub =
        result.timingJudge === 'just' ? 'ジャストミート！' : result.timingJudge === 'early' ? '早い' : '差し込まれた';
      this.hit = {
        t: 0,
        distance: result.distance,
        sprayAngle: result.sprayAngle,
        launchAngle: result.launchAngle,
        isHomeRun: result.isHomeRun,
      };
    }
    // 記録（次球へ進めるのは表示後）
    recordResult(this.state, result);
    this.updateHud();
  }

  private updateHud() {
    this.dom.pitch.textContent = `${Math.min(this.state.pitchNumber, this.state.totalPitches)} / ${this.state.totalPitches}`;
    this.dom.hr.textContent = String(this.state.homeRuns);
    this.dom.long.textContent = `${this.state.longest} m`;
  }

  private showOverlay() {
    this.phase = 'over';
    this.banner = null;
    const s = this.state;
    this.dom.overlayTitle.textContent = `結果：ホームラン ${s.homeRuns} 本`;
    this.dom.overlayStats.innerHTML = `最長飛距離 <b>${s.longest} m</b><br>合計飛距離 <b>${s.totalDistance} m</b>`;
    this.dom.overlay.classList.add('bb-show');
  }

  private loop(now: number) {
    this.update(now);
    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }

  private update(now: number) {
    if (this.phase === 'aim') {
      if (now - this.phaseStart >= AIM_MS) {
        // 投球開始
        this.phase = 'pitch';
        this.ballStart = now;
        this.banner = null;
        this.dom.swing.disabled = false;
        this.dom.msg.textContent = 'タイミングよく「スイング」！';
        // デバッグ/自動テスト用フック（現在の投球の着弾点と到達時刻）
        if (this.pitch) {
          (window as unknown as { __bb?: unknown }).__bb = {
            meetX: this.pitch.meetX,
            meetY: this.pitch.meetY,
            travelMs: this.pitch.travelMs,
            ballStart: this.ballStart,
          };
        }
      }
    } else if (this.phase === 'pitch' && this.pitch) {
      const tBall = now - this.ballStart;
      if (!this.swung && tBall > this.pitch.travelMs + SWING_GRACE) {
        this.takePitch();
      }
    } else if (this.phase === 'result') {
      const dt = now - this.phaseStart;
      if (this.hit) {
        this.hit.t = Math.min(dt / HIT_ANIM, 1);
        if (dt >= HIT_ANIM) this.afterResult();
      } else {
        if (dt >= RESULT_HOLD) this.afterResult();
      }
    }
  }

  private afterResult() {
    if (this.state.status === 'over') {
      this.showOverlay();
    } else {
      this.startPitchCycle(performance.now());
    }
  }

  private draw() {
    // スイングアニメ係数
    let swingT = 0;
    if (this.swung && this.swingAt > 0) {
      swingT = clamp((performance.now() - this.swingAt) / SWING_ANIM, 0, 1);
    }
    // 投手モーション（aim 後半〜pitch 序盤）
    let pitcherT = 0;
    if (this.phase === 'aim') {
      pitcherT = clamp((performance.now() - this.phaseStart - AIM_MS * 0.5) / (AIM_MS * 0.5), 0, 1);
    } else if (this.phase === 'pitch') {
      pitcherT = 1;
    }
    let ballProgress = 0;
    if (this.phase === 'pitch' && this.pitch) {
      ballProgress = clamp((performance.now() - this.ballStart) / this.pitch.travelMs, 0, 1.15);
    }

    const view: View = {
      W: this.W,
      H: this.H,
      phase: this.phase === 'over' ? 'result' : (this.phase as View['phase']),
      cursor: this.cursor,
      pitch: this.pitch,
      ballProgress,
      swingT,
      pitcherT,
      hit: this.hit,
      result: this.result,
      banner: this.banner,
      bannerSub: this.bannerSub,
    };
    render(this.ctx, view);
  }
}

function pitchTypeLabel(t: Pitch['type']): string {
  return { straight: 'ストレート', curve: 'カーブ', slider: 'スライダー', changeup: 'チェンジアップ' }[t];
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// 起動
export function mountBaseball() {
  const canvas = document.getElementById('bb-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const $ = (id: string) => document.getElementById(id)!;
  new BaseballGame(canvas, {
    pitch: $('bb-pitch'),
    hr: $('bb-hr'),
    long: $('bb-long'),
    msg: $('bb-msg'),
    swing: $('bb-swing') as HTMLButtonElement,
    overlay: $('bb-overlay'),
    overlayTitle: $('bb-overlay-title'),
    overlayStats: $('bb-overlay-stats'),
    replay: $('bb-replay') as HTMLButtonElement,
  });
}
