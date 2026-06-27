// UNO 遊戲引擎 —— 純邏輯，不碰 DOM。
// 建牌、洗牌、發牌、出牌合法性、回合/方向、抽牌與勝負判定。
// ログは言語非依存の構造化イベント（LogEvent）で保持し、表示側で翻訳する。

export type Color = 'red' | 'yellow' | 'green' | 'blue';
export type WildColor = Color | 'wild';

export type CardKind = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface Card {
  id: string;
  color: WildColor; // wild / wild4 為 'wild'
  kind: CardKind;
  value?: number; // 僅 number 牌有 0-9
}

export type PlayerKind = 'human' | 'ai';

export interface Player {
  id: number;
  name: string; // フォールバック用（表示は i18n の playerName を使用）
  kind: PlayerKind;
  hand: Card[];
  saidUno: boolean;
}

export type Direction = 1 | -1;
export type GameStatus = 'playing' | 'roundOver';

// 言語非依存のログイベント（表示側が i18n で文に変換）
export interface LogEvent {
  key: string;
  pi?: number; // 関係するプレイヤー index
  n?: number; // 枚数など
  card?: Card; // 出されたカード
  chosenColor?: Color | null; // wild の指定色
  color?: Color; // 起始 wild の色など
}

export interface GameState {
  drawPile: Card[];
  discardPile: Card[];
  players: Player[];
  currentPlayer: number;
  direction: Direction;
  activeColor: Color;
  pendingDraw: number;
  pendingDrawKind: 'draw2' | 'wild4' | null;
  status: GameStatus;
  winner: number | null;
  log: LogEvent[];
  stacking: boolean; // +2/+4 の重ね出しを許可するか（家庭規則=true / 公式=false）
}

export const COLORS: Color[] = ['red', 'yellow', 'green', 'blue'];

// ---- 牌組 ----

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  let n = 0;
  const mk = (color: WildColor, kind: CardKind, value?: number): Card => ({ id: `c${n++}`, color, kind, value });

  for (const color of COLORS) {
    deck.push(mk(color, 'number', 0));
    for (let v = 1; v <= 9; v++) {
      deck.push(mk(color, 'number', v));
      deck.push(mk(color, 'number', v));
    }
    for (const kind of ['skip', 'reverse', 'draw2'] as CardKind[]) {
      deck.push(mk(color, kind));
      deck.push(mk(color, kind));
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push(mk('wild', 'wild'));
    deck.push(mk('wild', 'wild4'));
  }
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---- 開局 ----

export interface NewGameOptions {
  startingHand?: number;
  stacking?: boolean; // 既定: 家庭規則（重ね出し可）
}

export function createGame(opts: NewGameOptions = {}): GameState {
  const handSize = opts.startingHand ?? 7;
  const stacking = opts.stacking ?? true;
  const drawPile = shuffle(buildDeck());
  const players: Player[] = [0, 1, 2, 3].map((i) => ({
    id: i,
    name: i === 0 ? 'You' : `CPU ${i}`,
    kind: i === 0 ? 'human' : 'ai',
    hand: [],
    saidUno: false,
  }));

  for (let r = 0; r < handSize; r++) {
    for (const p of players) p.hand.push(drawPile.pop()!);
  }

  let first = drawPile.pop()!;
  while (first.kind === 'wild4') {
    drawPile.unshift(first);
    first = drawPile.pop()!;
  }

  const state: GameState = {
    drawPile,
    discardPile: [first],
    players,
    currentPlayer: 0,
    direction: 1,
    activeColor: first.color === 'wild' ? COLORS[Math.floor(Math.random() * 4)] : (first.color as Color),
    pendingDraw: 0,
    pendingDrawKind: null,
    status: 'playing',
    winner: null,
    log: [],
    stacking,
  };

  applyStartCardEffect(state, first);
  return state;
}

function applyStartCardEffect(state: GameState, first: Card) {
  switch (first.kind) {
    case 'skip':
      log(state, { key: 'log_start_skip', pi: 0 });
      advance(state, 1);
      break;
    case 'reverse':
      state.direction = -1;
      log(state, { key: 'log_start_reverse' });
      advance(state, 1);
      break;
    case 'draw2':
      state.pendingDraw = 2;
      state.pendingDrawKind = 'draw2';
      log(state, { key: 'log_start_draw2', pi: 0 });
      break;
    case 'wild':
      log(state, { key: 'log_start_wild', color: state.activeColor });
      break;
  }
}

// ---- 出牌規則 ----

export function topCard(state: GameState): Card {
  return state.discardPile[state.discardPile.length - 1];
}

export function isPlayable(card: Card, activeColor: Color, top: Card): boolean {
  if (card.color === 'wild') return true;
  if (card.color === activeColor) return true;
  if (top.kind === 'number' && card.kind === 'number') return card.value === top.value;
  if (card.kind === top.kind && card.kind !== 'number') return true;
  return false;
}

export function canPlay(state: GameState, card: Card): boolean {
  const top = topCard(state);
  if (state.pendingDraw > 0) {
    if (!state.stacking) return false; // 公式規則：重ね出し不可、引くしかない
    if (state.pendingDrawKind === 'draw2') return card.kind === 'draw2';
    if (state.pendingDrawKind === 'wild4') return card.kind === 'wild4';
    return false;
  }
  return isPlayable(card, state.activeColor, top);
}

export function playableCards(state: GameState, playerIndex = state.currentPlayer): Card[] {
  return state.players[playerIndex].hand.filter((c) => canPlay(state, c));
}

// ---- 行動 ----

export interface PlayResult {
  ok: boolean;
  reason?: string;
  needColor?: boolean;
}

export function playCard(state: GameState, playerIndex: number, cardId: string, chosenColor?: Color): PlayResult {
  if (state.status !== 'playing') return { ok: false, reason: 'over' };
  if (playerIndex !== state.currentPlayer) return { ok: false, reason: 'not_your_turn' };

  const player = state.players[playerIndex];
  const idx = player.hand.findIndex((c) => c.id === cardId);
  if (idx === -1) return { ok: false, reason: 'no_such_card' };
  const card = player.hand[idx];

  if (!canPlay(state, card)) return { ok: false, reason: 'illegal' };
  if ((card.kind === 'wild' || card.kind === 'wild4') && !chosenColor) return { ok: false, needColor: true };

  player.hand.splice(idx, 1);
  state.discardPile.push(card);
  if (player.hand.length !== 1) player.saidUno = false;

  state.activeColor = card.color === 'wild' ? chosenColor! : (card.color as Color);

  log(state, { key: 'log_played', pi: playerIndex, card, chosenColor: card.color === 'wild' ? chosenColor : null });

  if (player.hand.length === 0) {
    state.status = 'roundOver';
    state.winner = playerIndex;
    log(state, { key: 'log_win', pi: playerIndex });
    return { ok: true };
  }

  applyCardEffect(state, card);
  return { ok: true };
}

// 家庭規則：同じ数字の数字カードを一度に複数出す。
// cardIds[0] が場に合法であること、全て同じ value の number カードであることが条件。
// 最後のカードの色が有効色になる。動作牌・変色牌は対象外。
export function playCards(state: GameState, playerIndex: number, cardIds: string[]): PlayResult {
  if (state.status !== 'playing') return { ok: false, reason: 'over' };
  if (playerIndex !== state.currentPlayer) return { ok: false, reason: 'not_your_turn' };
  if (cardIds.length === 0) return { ok: false, reason: 'empty' };
  if (cardIds.length === 1) return playCard(state, playerIndex, cardIds[0]);

  const player = state.players[playerIndex];
  const cards = cardIds.map((id) => player.hand.find((c) => c.id === id));
  if (cards.some((c) => !c)) return { ok: false, reason: 'no_such_card' };
  const list = cards as Card[];

  if (!list.every((c) => c.kind === 'number')) return { ok: false, reason: 'illegal' };
  if (new Set(list.map((c) => c.value)).size !== 1) return { ok: false, reason: 'illegal' };
  if (!canPlay(state, list[0])) return { ok: false, reason: 'illegal' };

  for (const c of list) {
    const idx = player.hand.findIndex((h) => h.id === c.id);
    player.hand.splice(idx, 1);
    state.discardPile.push(c);
  }
  if (player.hand.length !== 1) player.saidUno = false;

  const last = list[list.length - 1];
  state.activeColor = last.color as Color;
  log(state, { key: 'log_played_multi', pi: playerIndex, n: list.length, card: last });

  if (player.hand.length === 0) {
    state.status = 'roundOver';
    state.winner = playerIndex;
    log(state, { key: 'log_win', pi: playerIndex });
    return { ok: true };
  }

  advance(state, 1); // 数字カードのみなので効果なし、次の手番へ
  return { ok: true };
}

function applyCardEffect(state: GameState, card: Card) {
  switch (card.kind) {
    case 'skip':
      advance(state, 1);
      log(state, { key: 'log_skipped', pi: state.currentPlayer });
      advance(state, 1);
      break;
    case 'reverse':
      state.direction = (state.direction * -1) as Direction;
      log(state, { key: 'log_reversed' });
      advance(state, 1);
      break;
    case 'draw2':
      state.pendingDraw += 2;
      state.pendingDrawKind = 'draw2';
      advance(state, 1);
      break;
    case 'wild4':
      state.pendingDraw += 4;
      state.pendingDrawKind = 'wild4';
      advance(state, 1);
      break;
    default:
      advance(state, 1);
  }
}

export interface DrawResult {
  drawn: Card[];
  forced: boolean;
  playable: Card | null;
}

export function drawForCurrent(state: GameState): DrawResult {
  if (state.status !== 'playing') return { drawn: [], forced: false, playable: null };
  const player = current(state);
  const pi = state.currentPlayer;

  if (state.pendingDraw > 0) {
    const drawn = drawCards(state, player, state.pendingDraw);
    log(state, { key: 'log_drew_stack', pi, n: drawn.length });
    state.pendingDraw = 0;
    state.pendingDrawKind = null;
    advance(state, 1);
    return { drawn, forced: true, playable: null };
  }

  const drawn = drawCards(state, player, 1);
  const card = drawn[0] ?? null;
  player.saidUno = false;
  const playable = card && isPlayable(card, state.activeColor, topCard(state)) ? card : null;
  log(state, { key: 'log_drew_one', pi });
  return { drawn, forced: false, playable };
}

export function passAfterDraw(state: GameState) {
  advance(state, 1);
}

// ---- 喊 UNO ----

export function declareUno(state: GameState, playerIndex: number) {
  const p = state.players[playerIndex];
  if (p.hand.length === 1) {
    p.saidUno = true;
    log(state, { key: 'log_said_uno', pi: playerIndex });
  }
}

export function catchUno(state: GameState, targetIndex: number): boolean {
  const p = state.players[targetIndex];
  if (p.hand.length === 1 && !p.saidUno) {
    drawCards(state, p, 2);
    log(state, { key: 'log_forgot_uno', pi: targetIndex });
    return true;
  }
  return false;
}

// ---- 內部工具 ----

function current(state: GameState): Player {
  return state.players[state.currentPlayer];
}

function advance(state: GameState, n: number) {
  const count = state.players.length;
  state.currentPlayer = (state.currentPlayer + state.direction * n + count * n) % count;
}

export function nextPlayerIndex(state: GameState): number {
  const count = state.players.length;
  return (state.currentPlayer + state.direction + count) % count;
}

function drawCards(state: GameState, player: Player, count: number): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (state.drawPile.length === 0) reshuffleDiscard(state);
    if (state.drawPile.length === 0) break;
    player.hand.push(state.drawPile.pop()!);
    drawn.push(player.hand[player.hand.length - 1]);
  }
  return drawn;
}

function reshuffleDiscard(state: GameState) {
  const top = state.discardPile.pop()!;
  const recycled = state.discardPile;
  state.discardPile = [top];
  for (const c of recycled) {
    if (c.kind === 'wild' || c.kind === 'wild4') c.color = 'wild';
  }
  state.drawPile = shuffle(recycled);
  log(state, { key: 'log_reshuffle' });
}

function log(state: GameState, e: LogEvent) {
  state.log.push(e);
  if (state.log.length > 50) state.log.shift();
}
