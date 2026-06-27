// UNO UI 進入點 —— 渲染畫面、綁定觸控/點擊、串接 engine 與 ai。
// 多言語（中/英/日）・難易度・効果音に対応。要素は #uno-app 内に生成。

import {
  type GameState,
  type Card,
  type Color,
  type LogEvent,
  createGame,
  topCard,
  canPlay,
  playableCards,
  playCard,
  playCards,
  drawForCurrent,
  passAfterDraw,
  declareUno,
  catchUno,
  isPlayable,
} from './engine';
import { decideAi, aiChooseColorForDrawn } from './ai';
import {
  type Lang,
  type Difficulty,
  type RulesMode,
  LANGS,
  LANG_LABEL,
  DIFFICULTIES,
  RULES_MODES,
  t,
  cardLabel,
  colorName,
  playerName,
  detectLang,
} from './i18n';
import { initAudioOnGesture, playDeal, playPlace, speakUno } from './sound';

const COLOR_HEX: Record<Color, string> = {
  red: '#D72600',
  yellow: '#ECD407',
  green: '#379711',
  blue: '#0956BF',
};

const SYMBOL: Record<string, string> = { skip: '⊘', reverse: '⇄', draw2: '+2', wild: '🌈', wild4: '+4' };
const AI_DELAY = 1100;

interface UiRefs {
  app: HTMLElement;
  settings: HTMLElement;
  opponents: HTMLElement;
  center: HTMLElement;
  status: HTMLElement;
  hand: HTMLElement;
  controls: HTMLElement;
  unoBtn: HTMLButtonElement;
  newGameBtn: HTMLButtonElement;
}

export class UnoUI {
  private state: GameState;
  private refs!: UiRefs;
  private busy = false;
  private unoWindowOpen = false;
  private lang: Lang;
  private difficulty: Difficulty;
  private rulesMode: RulesMode;
  // 家庭規則：複数出し選択中の状態（anchor=最初の合法カード、extra=追加した同数字カード）
  private selecting: { value: number; anchorId: string; extra: Set<string> } | null = null;

  constructor(root: HTMLElement) {
    this.lang = (localStorage.getItem('uno-lang') as Lang) || detectLang();
    this.difficulty = (localStorage.getItem('uno-difficulty') as Difficulty) || 'medium';
    this.rulesMode = (localStorage.getItem('uno-rules') as RulesMode) || 'house';
    this.buildScaffold(root);
    this.state = createGame({ stacking: this.rulesMode === 'house' });
    this.applyTexts();
    this.render();
    this.maybeRunAi();
  }

  // ---- 靜態骨架 ----
  private buildScaffold(root: HTMLElement) {
    root.innerHTML = '';
    root.classList.add('uno-app');

    const settings = el('div', 'uno-settings');
    // 立体的なカードテーブル（対戦相手と中央の場を奥に傾けて配置）
    const table = el('div', 'uno-table');
    const tableInner = el('div', 'uno-table-inner');
    const opponents = el('div', 'uno-opponents');
    const center = el('div', 'uno-center');
    tableInner.append(opponents, center);
    table.appendChild(tableInner);
    const status = el('div', 'uno-status');
    const handWrap = el('div', 'uno-hand-wrap');
    const hand = el('div', 'uno-hand');
    handWrap.appendChild(hand);

    const controls = el('div', 'uno-controls');
    const unoBtn = el('button', 'uno-btn uno-uno-btn') as HTMLButtonElement;
    unoBtn.type = 'button';
    const newGameBtn = el('button', 'uno-btn uno-new-btn') as HTMLButtonElement;
    newGameBtn.type = 'button';
    controls.append(unoBtn, newGameBtn);

    root.append(settings, table, status, handWrap, controls);

    unoBtn.addEventListener('click', () => this.onUnoClick());
    newGameBtn.addEventListener('click', () => this.newGame());

    this.refs = { app: root, settings, opponents, center, status, hand, controls, unoBtn, newGameBtn };
  }

  // 言語切替時に文言・設定バーを作り直す
  private applyTexts() {
    document.documentElement.lang = this.lang;
    document.title = t(this.lang, 'page_title');
    const sub = document.getElementById('uno-sub');
    if (sub) sub.textContent = t(this.lang, 'subtitle');

    this.refs.unoBtn.textContent = t(this.lang, 'uno_btn');
    this.refs.newGameBtn.textContent = t(this.lang, 'new_game');

    // 設定バー（言語・難易度）
    const s = this.refs.settings;
    s.innerHTML = '';
    s.append(
      this.segGroup(t(this.lang, 'lang_label'), LANGS.map((l) => ({
        label: LANG_LABEL[l],
        active: l === this.lang,
        on: () => this.setLang(l),
      }))),
      this.segGroup(t(this.lang, 'diff_label'), DIFFICULTIES.map((d) => ({
        label: t(this.lang, d),
        active: d === this.difficulty,
        on: () => this.setDifficulty(d),
      }))),
      this.segGroup(t(this.lang, 'rules_label'), RULES_MODES.map((r) => ({
        label: t(this.lang, r),
        active: r === this.rulesMode,
        on: () => this.setRules(r),
      }))),
    );
  }

  private segGroup(label: string, items: { label: string; active: boolean; on: () => void }[]): HTMLElement {
    const g = el('div', 'uno-seg-group');
    const lbl = el('span', 'uno-seg-label');
    lbl.textContent = label;
    g.appendChild(lbl);
    const row = el('div', 'uno-seg-row');
    for (const it of items) {
      const b = el('button', 'uno-seg' + (it.active ? ' uno-seg-active' : '')) as HTMLButtonElement;
      b.type = 'button';
      b.textContent = it.label;
      b.addEventListener('click', it.on);
      row.appendChild(b);
    }
    g.appendChild(row);
    return g;
  }

  private setLang(l: Lang) {
    this.lang = l;
    localStorage.setItem('uno-lang', l);
    this.applyTexts();
    this.render();
  }
  private setDifficulty(d: Difficulty) {
    this.difficulty = d;
    localStorage.setItem('uno-difficulty', d);
    this.applyTexts();
  }
  private setRules(r: RulesMode) {
    this.rulesMode = r;
    localStorage.setItem('uno-rules', r);
    this.state.stacking = r === 'house'; // 重ね出し可否を即時反映
    this.selecting = null; // 選択中ならキャンセル
    this.applyTexts();
    this.render();
  }

  private newGame() {
    this.state = createGame({ stacking: this.rulesMode === 'house' });
    this.busy = false;
    this.unoWindowOpen = false;
    this.selecting = null;
    this.clearOverlay();
    this.dealSound();
    this.render();
    this.maybeRunAi();
  }

  private dealSound() {
    for (let i = 0; i < 4; i++) window.setTimeout(() => playDeal(), i * 110);
  }

  // ---- 渲染 ----
  private render() {
    this.renderOpponents();
    this.renderCenter();
    this.renderHand();
    this.renderStatus();
    this.renderSelectBar();
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
      name.textContent = playerName(this.lang, p);
      const cards = el('div', 'uno-opp-cards');
      const shown = Math.min(p.hand.length, 7);
      for (let k = 0; k < shown; k++) cards.appendChild(el('div', 'uno-card-mini'));
      const count = el('div', 'uno-opp-count');
      count.textContent = t(this.lang, 'cards_count', { n: p.hand.length });
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

    const drawPile = el('div', 'uno-pile uno-draw-pile');
    drawPile.appendChild(this.cardBack());
    const drawLabel = el('div', 'uno-pile-label');
    drawLabel.textContent = t(this.lang, 'deck', { n: this.state.drawPile.length });
    const drawCol = el('div', 'uno-pile-col');
    drawCol.append(drawPile, drawLabel);
    drawPile.addEventListener('click', () => this.onDrawClick());

    const top = topCard(this.state);
    const discard = el('div', 'uno-pile uno-discard-pile');
    discard.appendChild(this.cardFace(top, this.state.activeColor));
    const discardLabel = el('div', 'uno-pile-label');
    discardLabel.textContent = this.state.direction === 1 ? t(this.lang, 'dir_cw') : t(this.lang, 'dir_ccw');
    const discardCol = el('div', 'uno-pile-col');
    discardCol.append(discard, discardLabel);

    const colorDot = el('div', 'uno-color-dot');
    colorDot.style.background = COLOR_HEX[this.state.activeColor];
    const pending = this.state.pendingDraw > 0 ? el('div', 'uno-pending') : null;
    if (pending) pending.textContent = t(this.lang, 'stack', { n: this.state.pendingDraw });
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
      elc.dataset.cardId = card.id;

      if (this.selecting) {
        // 複数出し選択中
        const sel = this.selecting;
        const isAnchor = card.id === sel.anchorId;
        const isSameNum = card.kind === 'number' && card.value === sel.value;
        if (isAnchor || sel.extra.has(card.id)) {
          elc.classList.add('uno-selected');
          if (!isAnchor) elc.addEventListener('click', () => this.toggleExtra(card.id));
        } else if (isSameNum) {
          elc.classList.add('uno-addable');
          elc.addEventListener('click', () => this.toggleExtra(card.id));
        } else {
          elc.classList.add('uno-disabled');
        }
      } else {
        const playable = isMyTurn && canPlay(this.state, card);
        if (playable) {
          elc.classList.add('uno-playable');
          elc.addEventListener('click', () => this.onPlayCard(card, elc));
        } else if (isMyTurn) {
          elc.classList.add('uno-disabled');
        }
      }
      c.appendChild(elc);
    }
  }

  private toggleExtra(id: string) {
    if (!this.selecting) return;
    if (this.selecting.extra.has(id)) this.selecting.extra.delete(id);
    else this.selecting.extra.add(id);
    this.render();
  }

  // 複数出しの確認バー（家庭規則・選択中のみ表示）
  private renderSelectBar() {
    this.refs.app.querySelector('.uno-select-bar')?.remove();
    if (!this.selecting) return;
    const n = 1 + this.selecting.extra.size;
    const bar = el('div', 'uno-select-bar');
    const hint = el('span', 'uno-select-hint');
    hint.textContent = t(this.lang, 'multi_hint');
    const play = el('button', 'uno-btn') as HTMLButtonElement;
    play.textContent = t(this.lang, 'play_n', { n });
    play.addEventListener('click', () => this.playSelected());
    const cancel = el('button', 'uno-btn uno-new-btn') as HTMLButtonElement;
    cancel.textContent = t(this.lang, 'cancel');
    cancel.addEventListener('click', () => {
      this.selecting = null;
      this.render();
    });
    bar.append(hint, play, cancel);
    this.refs.app.appendChild(bar);
  }

  private logText(e: LogEvent): string {
    const vars: Record<string, string | number> = {};
    if (e.pi != null) vars.name = playerName(this.lang, this.state.players[e.pi]);
    if (e.n != null) vars.n = e.n;
    if (e.color) vars.color = colorName(this.lang, e.color);
    if (e.card) vars.card = cardLabel(this.lang, e.card, e.chosenColor ?? null);
    return t(this.lang, e.key, vars);
  }

  private renderStatus() {
    const s = this.refs.status;
    if (this.state.status === 'roundOver') {
      s.textContent = '';
      return;
    }
    if (this.state.currentPlayer === 0 && !this.busy) {
      s.textContent = t(this.lang, 'your_turn');
    } else {
      const last = this.state.log[this.state.log.length - 1];
      s.textContent = last ? this.logText(last) : '';
    }
  }

  // ---- 卡牌 DOM ----
  private cardFace(card: Card, activeColor: Color | null): HTMLElement {
    const wrap = el('div', 'uno-card');
    const isWild = card.color === 'wild';
    if (isWild) {
      wrap.classList.add('uno-card-wild');
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
    const tx = el('div', 'uno-card-center');
    tx.textContent = 'UNO';
    oval.appendChild(tx);
    wrap.appendChild(oval);
    return wrap;
  }

  // ---- 人類互動 ----
  private onPlayCard(card: Card, sourceEl?: HTMLElement) {
    if (this.busy || this.state.currentPlayer !== 0 || this.state.status !== 'playing') return;
    if (this.selecting) return;
    if (!canPlay(this.state, card)) return;

    // 家庭規則：同じ数字の数字カードが他にもあれば複数出しの選択へ
    if (this.rulesMode === 'house' && card.kind === 'number') {
      const sameCount = this.state.players[0].hand.filter(
        (h) => h.kind === 'number' && h.value === card.value,
      ).length;
      if (sameCount > 1) {
        this.selecting = { value: card.value!, anchorId: card.id, extra: new Set() };
        this.render();
        return;
      }
    }

    const from = sourceEl ? sourceEl.getBoundingClientRect() : undefined;
    if (card.color === 'wild') this.openColorPicker((color) => this.commitPlay(0, card, color, from));
    else this.commitPlay(0, card, undefined, from);
  }

  private playSelected() {
    if (!this.selecting) return;
    const ids = [this.selecting.anchorId, ...this.selecting.extra];
    const hand = this.state.players[0].hand;
    const flights = ids.map((id) => {
      const e = this.refs.hand.querySelector(`[data-card-id="${id}"]`) as HTMLElement | null;
      return { rect: e?.getBoundingClientRect(), card: hand.find((c) => c.id === id) };
    });
    const res = playCards(this.state, 0, ids);
    this.selecting = null;
    if (!res.ok) {
      this.render();
      return;
    }
    playPlace();
    if (this.state.players[0].hand.length === 1) this.openUnoWindow();
    this.render();
    for (const f of flights) {
      if (f.rect && f.card) this.flyCard(f.rect, f.card, f.card.color as Color);
    }
    if (this.state.status === 'roundOver') {
      this.showWinner();
      return;
    }
    this.maybeRunAi();
  }

  private commitPlay(playerIndex: number, card: Card, color?: Color, from?: DOMRect) {
    const res = playCard(this.state, playerIndex, card.id, color);
    if (!res.ok) {
      if (res.needColor) this.openColorPicker((c) => this.commitPlay(playerIndex, card, c, from));
      return;
    }
    playPlace();
    if (playerIndex === 0 && this.state.players[0].hand.length === 1) this.openUnoWindow();
    this.render();
    if (from) this.flyCard(from, card, card.color === 'wild' ? this.state.activeColor : (card.color as Color));
    if (this.state.status === 'roundOver') {
      this.showWinner();
      return;
    }
    this.maybeRunAi();
  }

  private onDrawClick() {
    if (this.busy || this.state.currentPlayer !== 0 || this.state.status !== 'playing') return;
    const res = drawForCurrent(this.state);
    playDeal();
    if (res.forced) {
      this.render();
      this.maybeRunAi();
      return;
    }
    if (res.playable) {
      this.render();
      this.flashStatus(t(this.lang, 'drawn_playable', { card: cardLabel(this.lang, res.playable) }));
      this.confirmPlayDrawn(res.playable);
    } else {
      passAfterDraw(this.state);
      this.afterHumanAction();
    }
  }

  private confirmPlayDrawn(card: Card) {
    const bar = el('div', 'uno-overlay uno-confirm');
    const box = el('div', 'uno-modal');
    const msg = el('div', 'uno-modal-title');
    msg.textContent = t(this.lang, 'play_drawn');
    const row = el('div', 'uno-modal-row');
    const yes = el('button', 'uno-btn') as HTMLButtonElement;
    yes.textContent = t(this.lang, 'play');
    const no = el('button', 'uno-btn uno-new-btn') as HTMLButtonElement;
    no.textContent = t(this.lang, 'keep');
    row.append(yes, no);
    box.append(msg, row);
    bar.appendChild(box);
    this.refs.app.appendChild(bar);

    const drawRect = this.refs.center.querySelector('.uno-draw-pile')?.getBoundingClientRect();
    const close = () => bar.remove();
    yes.addEventListener('click', () => {
      close();
      if (card.color === 'wild') this.openColorPicker((c) => this.commitPlay(0, card, c, drawRect));
      else this.commitPlay(0, card, undefined, drawRect);
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
  }
  private onUnoClick() {
    declareUno(this.state, 0);
    speakUno();
    this.unoWindowOpen = false;
    this.render();
  }

  // ---- AI 連鎖 ----
  private maybeRunAi() {
    if (this.state.status !== 'playing') return;
    if (this.state.currentPlayer === 0) {
      this.busy = false;
      this.render();
      return;
    }
    this.busy = true;
    this.render();
    window.setTimeout(() => this.runAiTurn(), AI_DELAY);
  }

  // 難易度に応じて「UNO 言い忘れ」を見抜くか
  private aiCatchesUno(): boolean {
    if (this.difficulty === 'hard') return true;
    if (this.difficulty === 'easy') return false;
    return Math.random() < 0.5;
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

    if (this.unoWindowOpen && this.state.players[0].hand.length === 1 && !this.state.players[0].saidUno) {
      if (this.aiCatchesUno()) catchUno(this.state, 0);
      this.unoWindowOpen = false;
    }

    const meBox = this.refs.opponents.children[me - 1] as HTMLElement | undefined;
    const fromRect = meBox?.getBoundingClientRect();
    let didPlay = false;

    const action = decideAi(this.state, this.difficulty);
    if (action.type === 'play' && action.cardId) {
      playCard(this.state, me, action.cardId, action.chosenColor);
      playPlace();
      didPlay = true;
      if (this.state.players[me].hand.length === 1) {
        declareUno(this.state, me);
        speakUno();
      }
    } else {
      const res = drawForCurrent(this.state);
      playDeal();
      if (!res.forced) {
        if (res.playable && isPlayable(res.playable, this.state.activeColor, topCard(this.state))) {
          const card = res.playable;
          const color = card.color === 'wild' ? aiChooseColorForDrawn(this.state) : undefined;
          playCard(this.state, me, card.id, color);
          playPlace();
          didPlay = true;
          if (this.state.players[me].hand.length === 1) {
            declareUno(this.state, me);
            speakUno();
          }
        } else {
          passAfterDraw(this.state);
        }
      }
    }

    this.render();
    if (didPlay && fromRect) this.flyCard(fromRect, topCard(this.state), this.state.activeColor);
    if (this.state.status === 'roundOver') {
      this.busy = false;
      this.render();
      this.showWinner();
      return;
    }
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
    title.textContent = t(this.lang, 'choose_color');
    const grid = el('div', 'uno-color-grid');
    (['red', 'yellow', 'green', 'blue'] as Color[]).forEach((color) => {
      const b = el('button', 'uno-color-choice') as HTMLButtonElement;
      b.style.background = COLOR_HEX[color];
      b.setAttribute('aria-label', colorName(this.lang, color));
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
    title.textContent = won
      ? t(this.lang, 'winner_you')
      : t(this.lang, 'winner_other', { name: winner ? playerName(this.lang, winner) : '' });
    const btn = el('button', 'uno-btn') as HTMLButtonElement;
    btn.textContent = t(this.lang, 'replay');
    btn.addEventListener('click', () => this.newGame());
    box.append(title, btn);
    bar.appendChild(box);
    this.refs.app.appendChild(bar);
  }

  // 出牌の移動軌跡：始点(手札/相手/山札)から棄牌堆へカードを飛ばす
  private flyCard(fromRect: DOMRect, card: Card, activeColor: Color | null) {
    const target = this.refs.center.querySelector('.uno-discard-pile .uno-card') as HTMLElement | null;
    if (!target || !fromRect) return;
    const toRect = target.getBoundingClientRect();
    const w = toRect.width;
    const h = toRect.height;
    const startLeft = fromRect.left + fromRect.width / 2 - w / 2;
    const startTop = fromRect.top + fromRect.height / 2 - h / 2;

    const clone = this.cardFace(card, activeColor);
    clone.classList.add('uno-flying');
    clone.style.left = `${startLeft}px`;
    clone.style.top = `${startTop}px`;
    clone.style.width = `${w}px`;
    clone.style.height = `${h}px`;
    document.body.appendChild(clone);

    target.style.visibility = 'hidden';
    const dx = toRect.left - startLeft;
    const dy = toRect.top - startTop;
    requestAnimationFrame(() => {
      clone.style.transform = `translate(${dx}px, ${dy}px) rotate(0deg)`;
    });

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clone.remove();
      if (target) target.style.visibility = 'visible';
    };
    clone.addEventListener('transitionend', finish, { once: true });
    window.setTimeout(finish, 600);
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

export function mountUno() {
  const root = document.getElementById('uno-app');
  if (!root) return;
  initAudioOnGesture();
  new UnoUI(root);
}
