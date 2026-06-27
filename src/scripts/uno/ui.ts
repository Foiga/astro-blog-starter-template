// UNO UI 進入點 —— 渲染畫面、綁定觸控/點擊、串接 engine 與 ai。
// 所有元素建立於 #uno-app 內，class 以 uno- 前綴（樣式見頁面的 <style is:global>）。

import {
  type GameState,
  type Card,
  type Color,
  type WildColor,
  createGame,
  topCard,
  canPlay,
  playableCards,
  playCard,
  drawForCurrent,
  passAfterDraw,
  declareUno,
  catchUno,
  isPlayable,
} from './engine';
import { decideAi, aiChooseColorForDrawn } from './ai';

const COLOR_HEX: Record<Color, string> = {
  red: '#D72600',
  yellow: '#ECD407',
  green: '#379711',
  blue: '#0956BF',
};

const SYMBOL: Record<string, string> = {
  skip: '⊘',
  reverse: '⇄',
  draw2: '+2',
  wild: '🌈',
  wild4: '+4',
};

const AI_DELAY = 1100; // AI 行動間隔（毫秒）

interface UiRefs {
  app: HTMLElement;
  opponents: HTMLElement;
  center: HTMLElement;
  hand: HTMLElement;
  status: HTMLElement;
  unoBtn: HTMLButtonElement;
  newGameBtn: HTMLButtonElement;
}

export class UnoUI {
  private state: GameState;
  private refs: UiRefs;
  private busy = false; // AI 連鎖行動進行中，鎖住人類輸入
  private unoWindowOpen = false; // 人類剛出到剩 1 張、等待喊 UNO 的視窗

  constructor(root: HTMLElement) {
    this.refs = this.buildScaffold(root);
    this.state = createGame();
    this.render();
    this.maybeRunAi();
  }

  // ---- 建立靜態骨架 ----
  private buildScaffold(root: HTMLElement): UiRefs {
    root.innerHTML = '';
    root.classList.add('uno-app');

    const opponents = el('div', 'uno-opponents');
    const center = el('div', 'uno-center');
    const status = el('div', 'uno-status');

    const handWrap = el('div', 'uno-hand-wrap');
    const hand = el('div', 'uno-hand');
    handWrap.appendChild(hand);

    const controls = el('div', 'uno-controls');
    const unoBtn = el('button', 'uno-btn uno-uno-btn') as HTMLButtonElement;
    unoBtn.textContent = 'UNO!';
    unoBtn.type = 'button';
    const newGameBtn = el('button', 'uno-btn uno-new-btn') as HTMLButtonElement;
    newGameBtn.textContent = '新局';
    newGameBtn.type = 'button';
    controls.append(unoBtn, newGameBtn);

    root.append(opponents, center, status, handWrap, controls);

    unoBtn.addEventListener('click', () => this.onUnoClick());
    newGameBtn.addEventListener('click', () => this.newGame());

    return { app: root, opponents, center, hand, status, unoBtn, newGameBtn };
  }

  private newGame() {
    this.state = createGame();
    this.busy = false;
    this.unoWindowOpen = false;
    this.clearOverlay();
    this.render();
    this.maybeRunAi();
  }

  // ---- 渲染 ----
  private render() {
    this.renderOpponents();
    this.renderCenter();
    this.renderHand();
    this.renderStatus();
    this.refs.unoBtn.disabled = !(this.state.players[0].hand.length === 1 && !this.state.players[0].saidUno);
  }

  private renderOpponents() {
    const c = this.refs.opponents;
    c.innerHTML = '';
    for (let i = 1; i < this.state.players.length; i++) {
      const p = this.state.players[i];
      const box = el('div', 'uno-opp');
      if (i === this.state.currentPlayer && this.state.status === 'playing') box.classList.add('uno-active');
      const name = el('div', 'uno-opp-name');
      name.textContent = `${p.name}`;
      const cards = el('div', 'uno-opp-cards');
      // 顯示牌背（最多疊 7 個視覺，數量用文字）
      const shown = Math.min(p.hand.length, 7);
      for (let k = 0; k < shown; k++) {
        cards.appendChild(this.cardBackMini());
      }
      const count = el('div', 'uno-opp-count');
      count.textContent = `${p.hand.length} 張`;
      if (p.hand.length === 1) {
        const u = el('span', 'uno-opp-uno');
        u.textContent = p.saidUno ? 'UNO' : '?';
        name.appendChild(u);
      }
      box.append(name, cards, count);
      c.appendChild(box);
    }
  }

  private renderCenter() {
    const c = this.refs.center;
    c.innerHTML = '';

    // 抽牌堆
    const drawPile = el('div', 'uno-pile uno-draw-pile');
    drawPile.appendChild(this.cardBack());
    const drawLabel = el('div', 'uno-pile-label');
    drawLabel.textContent = `抽牌堆 ${this.state.drawPile.length}`;
    const drawCol = el('div', 'uno-pile-col');
    drawCol.append(drawPile, drawLabel);
    drawPile.addEventListener('click', () => this.onDrawClick());

    // 棄牌堆 + 當前顏色
    const top = topCard(this.state);
    const discard = el('div', 'uno-pile uno-discard-pile');
    discard.appendChild(this.cardFace(top, this.state.activeColor));
    const dirArrow = this.state.direction === 1 ? '↻ 順時針' : '↺ 逆時針';
    const discardLabel = el('div', 'uno-pile-label');
    discardLabel.textContent = dirArrow;
    const discardCol = el('div', 'uno-pile-col');
    discardCol.append(discard, discardLabel);

    // 當前有效顏色指示
    const colorDot = el('div', 'uno-color-dot');
    colorDot.style.background = COLOR_HEX[this.state.activeColor];
    const pending = this.state.pendingDraw > 0 ? el('div', 'uno-pending') : null;
    if (pending) pending.textContent = `疊牌 +${this.state.pendingDraw}`;

    const midCol = el('div', 'uno-pile-col');
    midCol.append(colorDot);
    if (pending) midCol.append(pending);

    c.append(drawCol, discardCol, midCol);
  }

  private renderHand() {
    const c = this.refs.hand;
    c.innerHTML = '';
    const player = this.state.players[0];
    const isMyTurn = this.state.currentPlayer === 0 && this.state.status === 'playing' && !this.busy;
    for (const card of player.hand) {
      const elc = this.cardFace(card, card.color === 'wild' ? null : (card.color as Color));
      elc.classList.add('uno-hand-card');
      const playable = isMyTurn && canPlay(this.state, card);
      if (playable) {
        elc.classList.add('uno-playable');
        elc.addEventListener('click', () => this.onPlayCard(card));
      } else if (isMyTurn) {
        elc.classList.add('uno-disabled');
      }
      c.appendChild(elc);
    }
  }

  private renderStatus() {
    const s = this.refs.status;
    const last = this.state.log[this.state.log.length - 1] ?? '';
    if (this.state.status === 'roundOver') {
      s.textContent = '';
      return;
    }
    const turnName = this.state.players[this.state.currentPlayer].name;
    s.textContent = this.state.currentPlayer === 0 && !this.busy ? `輪到你出牌` : `${last}`;
  }

  // ---- 卡牌 DOM ----
  private cardFace(card: Card, activeColor: Color | null): HTMLElement {
    const wrap = el('div', 'uno-card');
    const isWild = card.color === 'wild';
    if (isWild) {
      wrap.classList.add('uno-card-wild');
      // wild 牌四色角落
      wrap.style.background =
        'conic-gradient(#D72600 0deg 90deg,#ECD407 90deg 180deg,#0956BF 180deg 270deg,#379711 270deg 360deg)';
    } else {
      wrap.style.background = COLOR_HEX[card.color as Color];
    }
    const oval = el('div', 'uno-card-oval');
    const center = el('div', 'uno-card-center');
    center.textContent = this.cardGlyph(card);
    const tl = el('div', 'uno-card-corner uno-tl');
    tl.textContent = this.cornerGlyph(card);
    const br = el('div', 'uno-card-corner uno-br');
    br.textContent = this.cornerGlyph(card);
    oval.appendChild(center);
    wrap.append(tl, oval, br);

    // 若是棄牌堆上的 wild 且已選色，加一個小色點顯示當前顏色
    if (isWild && activeColor) {
      const chosen = el('div', 'uno-card-chosen');
      chosen.style.background = COLOR_HEX[activeColor];
      wrap.appendChild(chosen);
    }
    return wrap;
  }

  private cardGlyph(card: Card): string {
    if (card.kind === 'number') return String(card.value);
    return SYMBOL[card.kind] ?? '';
  }
  private cornerGlyph(card: Card): string {
    if (card.kind === 'number') return String(card.value);
    if (card.kind === 'draw2') return '+2';
    if (card.kind === 'wild4') return '+4';
    if (card.kind === 'skip') return '⊘';
    if (card.kind === 'reverse') return '⇄';
    return '★';
  }

  private cardBack(): HTMLElement {
    const wrap = el('div', 'uno-card uno-card-back');
    const oval = el('div', 'uno-card-oval');
    const t = el('div', 'uno-card-center');
    t.textContent = 'UNO';
    oval.appendChild(t);
    wrap.appendChild(oval);
    return wrap;
  }
  private cardBackMini(): HTMLElement {
    return el('div', 'uno-card-mini');
  }

  // ---- 人類互動 ----
  private onPlayCard(card: Card) {
    if (this.busy || this.state.currentPlayer !== 0 || this.state.status !== 'playing') return;
    if (!canPlay(this.state, card)) return;

    if (card.color === 'wild') {
      this.openColorPicker((color) => this.commitPlay(0, card, color));
    } else {
      this.commitPlay(0, card);
    }
  }

  private commitPlay(playerIndex: number, card: Card, color?: Color) {
    const res = playCard(this.state, playerIndex, card.id, color);
    if (!res.ok) {
      if (res.needColor) {
        this.openColorPicker((c) => this.commitPlay(playerIndex, card, c));
      }
      return;
    }
    // 人類出到剩 1 張：開啟喊 UNO 視窗
    if (playerIndex === 0 && this.state.players[0].hand.length === 1) {
      this.openUnoWindow();
    }
    this.afterHumanAction();
  }

  private onDrawClick() {
    if (this.busy || this.state.currentPlayer !== 0 || this.state.status !== 'playing') return;
    const res = drawForCurrent(this.state);
    if (res.forced) {
      // 疊牌認抽，已換手
      this.render();
      this.maybeRunAi();
      return;
    }
    // 主動抽 1 張：若可出，詢問是否打出
    if (res.playable) {
      this.render();
      const drawn = res.playable;
      this.flashStatus(`抽到 ${this.cardGlyph(drawn)}，可出`);
      this.confirmPlayDrawn(drawn);
    } else {
      passAfterDraw(this.state);
      this.afterHumanAction();
    }
  }

  private confirmPlayDrawn(card: Card) {
    // 簡單以小提示讓玩家選擇打出或保留
    const bar = el('div', 'uno-overlay uno-confirm');
    const box = el('div', 'uno-modal');
    const msg = el('div', 'uno-modal-title');
    msg.textContent = '抽到一張可出的牌，要打出嗎？';
    const row = el('div', 'uno-modal-row');
    const yes = el('button', 'uno-btn') as HTMLButtonElement;
    yes.textContent = '打出';
    const no = el('button', 'uno-btn uno-new-btn') as HTMLButtonElement;
    no.textContent = '保留';
    row.append(yes, no);
    box.append(msg, row);
    bar.appendChild(box);
    this.refs.app.appendChild(bar);

    const close = () => bar.remove();
    yes.addEventListener('click', () => {
      close();
      if (card.color === 'wild') {
        this.openColorPicker((c) => this.commitPlay(0, card, c));
      } else {
        this.commitPlay(0, card);
      }
    });
    no.addEventListener('click', () => {
      close();
      passAfterDraw(this.state);
      this.afterHumanAction();
    });
  }

  private afterHumanAction() {
    this.render();
    if (this.state.status === 'roundOver') {
      this.showWinner();
      return;
    }
    this.maybeRunAi();
  }

  // ---- 喊 UNO ----
  private openUnoWindow() {
    this.unoWindowOpen = true;
    // 視窗在 AI 行動前有效；按鈕已在 render 啟用
  }

  private onUnoClick() {
    declareUno(this.state, 0);
    this.unoWindowOpen = false;
    this.render();
  }

  // ---- AI 連鎖 ----
  private maybeRunAi() {
    if (this.state.status !== 'playing') return;
    if (this.state.currentPlayer === 0) {
      // 回到人類：若人類剩 1 張卻沒喊 UNO，AI 有機會抓（簡單：關閉視窗，不自動罰，交由按鈕）
      this.busy = false;
      // 若人類錯過喊 UNO 視窗（已換過一輪 AI），這裡不再罰，保持友善
      this.render();
      return;
    }
    this.busy = true;
    this.render();
    window.setTimeout(() => this.runAiTurn(), AI_DELAY);
  }

  private runAiTurn() {
    if (this.state.status !== 'playing') {
      this.busy = false;
      this.render();
      if (this.state.status === 'roundOver') this.showWinner();
      return;
    }
    const me = this.state.currentPlayer;
    if (me === 0) {
      this.maybeRunAi();
      return;
    }

    // AI 抓人類忘喊 UNO（人類剛出到剩 1 張且沒在視窗內喊）
    if (this.unoWindowOpen && this.state.players[0].hand.length === 1 && !this.state.players[0].saidUno) {
      catchUno(this.state, 0);
      this.unoWindowOpen = false;
    }

    const action = decideAi(this.state);
    if (action.type === 'play' && action.cardId) {
      playCard(this.state, me, action.cardId, action.chosenColor);
      // AI 出到剩 1 張自動喊 UNO
      if (this.state.players[me].hand.length === 1) declareUno(this.state, me);
    } else {
      const res = drawForCurrent(this.state);
      if (!res.forced) {
        // AI 主動抽：抽到可出就出
        if (res.playable && isPlayable(res.playable, this.state.activeColor, topCard(this.state))) {
          const card = res.playable;
          const color = card.color === 'wild' ? aiChooseColorForDrawn(this.state) : undefined;
          playCard(this.state, me, card.id, color);
          if (this.state.players[me].hand.length === 1) declareUno(this.state, me);
        } else {
          passAfterDraw(this.state);
        }
      }
    }

    this.render();
    if (this.state.status === 'roundOver') {
      this.busy = false;
      this.render();
      this.showWinner();
      return;
    }
    // 繼續下一位（可能仍是 AI）
    window.setTimeout(() => {
      if (this.state.currentPlayer === 0) {
        this.busy = false;
        this.render();
      } else {
        this.runAiTurn();
      }
    }, AI_DELAY);
  }

  // ---- 彈窗 ----
  private openColorPicker(onPick: (c: Color) => void) {
    const bar = el('div', 'uno-overlay');
    const box = el('div', 'uno-modal');
    const title = el('div', 'uno-modal-title');
    title.textContent = '選擇顏色';
    const grid = el('div', 'uno-color-grid');
    (['red', 'yellow', 'green', 'blue'] as Color[]).forEach((color) => {
      const b = el('button', 'uno-color-choice') as HTMLButtonElement;
      b.style.background = COLOR_HEX[color];
      b.setAttribute('aria-label', color);
      b.addEventListener('click', () => {
        bar.remove();
        onPick(color);
      });
      grid.appendChild(b);
    });
    box.append(title, grid);
    bar.appendChild(box);
    this.refs.app.appendChild(bar);
  }

  private showWinner() {
    this.clearOverlay();
    const bar = el('div', 'uno-overlay');
    const box = el('div', 'uno-modal');
    const title = el('div', 'uno-modal-title');
    const winner = this.state.winner != null ? this.state.players[this.state.winner] : null;
    const won = winner?.id === 0;
    title.textContent = won ? '🎉 你贏了！' : `${winner?.name} 獲勝`;
    const btn = el('button', 'uno-btn') as HTMLButtonElement;
    btn.textContent = '再來一局';
    btn.addEventListener('click', () => this.newGame());
    box.append(title, btn);
    bar.appendChild(box);
    this.refs.app.appendChild(bar);
  }

  private clearOverlay() {
    this.refs.app.querySelectorAll('.uno-overlay').forEach((e) => e.remove());
  }

  private flashStatus(msg: string) {
    this.refs.status.textContent = msg;
  }
}

function el(tag: string, className = ''): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

// 啟動：頁面 DOM ready 後掛載到 #uno-app
export function mountUno() {
  const root = document.getElementById('uno-app');
  if (root) new UnoUI(root);
}
