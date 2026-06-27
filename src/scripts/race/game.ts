// マリオカート風 擬似3Dレース —— ループ／入力／状態機械／HUD更新。

import { Track, MAX_SPEED } from './track';
import { createRace, updateRace, type RaceState, type Input } from './engine';
import { render } from './render';

export class RaceGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private track = new Track();
  private state: RaceState;
  private last = 0;

  private input: Input = { steer: 0, brake: false, drift: false };
  private leftHeld = false;
  private rightHeld = false;

  private dom: {
    lap: HTMLElement;
    rank: HTMLElement;
    speed: HTMLElement;
    overlay: HTMLElement;
    overlayTitle: HTMLElement;
    overlayStats: HTMLElement;
    replay: HTMLButtonElement;
    left: HTMLElement;
    right: HTMLElement;
    drift: HTMLElement;
    brake: HTMLElement;
  };

  constructor(canvas: HTMLCanvasElement, dom: RaceGame['dom']) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.dom = dom;
    this.track.build();
    this.state = createRace(3);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindControls();

    this.last = performance.now();
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

  private bindControls() {
    const hold = (el: HTMLElement, on: () => void, off: () => void) => {
      const down = (e: Event) => {
        e.preventDefault();
        on();
      };
      const up = (e: Event) => {
        e.preventDefault();
        off();
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('pointercancel', up);
    };
    hold(this.dom.left, () => { this.leftHeld = true; this.syncSteer(); }, () => { this.leftHeld = false; this.syncSteer(); });
    hold(this.dom.right, () => { this.rightHeld = true; this.syncSteer(); }, () => { this.rightHeld = false; this.syncSteer(); });
    hold(this.dom.drift, () => (this.input.drift = true), () => (this.input.drift = false));
    hold(this.dom.brake, () => (this.input.brake = true), () => (this.input.brake = false));

    this.dom.replay.addEventListener('click', () => this.restart());

    // キーボード（PC）
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
  }

  private key(e: KeyboardEvent, down: boolean) {
    switch (e.key) {
      case 'ArrowLeft': case 'a': this.leftHeld = down; this.syncSteer(); break;
      case 'ArrowRight': case 'd': this.rightHeld = down; this.syncSteer(); break;
      case ' ': case 'Shift': this.input.drift = down; break;
      case 'ArrowDown': case 's': this.input.brake = down; break;
    }
  }

  private syncSteer() {
    this.input.steer = (this.rightHeld ? 1 : 0) - (this.leftHeld ? 1 : 0);
  }

  private restart() {
    this.state = createRace(3);
    this.dom.overlay.classList.remove('rc-show');
    this.input = { steer: 0, brake: false, drift: false };
    this.leftHeld = this.rightHeld = false;
  }

  private loop(now: number) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05; // タブ復帰時の大ジャンプ防止

    const wasFinished = this.state.status === 'finished';
    updateRace(this.state, this.track, dt, this.input);
    render(this.ctx, this.W, this.H, this.track, this.state);
    this.updateHud();

    if (!wasFinished && this.state.status === 'finished') this.showResult();

    requestAnimationFrame((t) => this.loop(t));
  }

  private updateHud() {
    const s = this.state;
    this.dom.lap.textContent = `${Math.min(s.player.lap, s.totalLaps)} / ${s.totalLaps}`;
    this.dom.rank.textContent = `${s.rank}位`;
    const kmh = Math.round((s.player.speed / MAX_SPEED) * 200);
    this.dom.speed.textContent = `${kmh} km/h`;
  }

  private showResult() {
    const s = this.state;
    this.dom.overlayTitle.textContent = `${s.finishRank}位 / ${s.karts.length}台`;
    this.dom.overlayStats.innerHTML = `タイム <b>${fmtTime(s.time)}</b>`;
    this.dom.overlay.classList.add('rc-show');
  }
}

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t * 100) % 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function mountRace() {
  const canvas = document.getElementById('rc-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const $ = (id: string) => document.getElementById(id)!;
  new RaceGame(canvas, {
    lap: $('rc-lap'),
    rank: $('rc-rank'),
    speed: $('rc-speed'),
    overlay: $('rc-overlay'),
    overlayTitle: $('rc-overlay-title'),
    overlayStats: $('rc-overlay-stats'),
    replay: $('rc-replay') as HTMLButtonElement,
    left: $('rc-left'),
    right: $('rc-right'),
    drift: $('rc-drift'),
    brake: $('rc-brake'),
  });
}
