// UNO 遊戲引擎 —— 純邏輯，不碰 DOM。
// 負責建牌、洗牌、發牌、出牌合法性、回合/方向、抽牌與勝負判定。

export type Color = 'red' | 'yellow' | 'green' | 'blue';
export type WildColor = Color | 'wild';

// 卡牌種類：數字 0-9，或動作牌 / 變色牌
export type CardKind =
  | 'number'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild4';

export interface Card {
  id: string;
  color: WildColor; // wild / wild4 為 'wild'
  kind: CardKind;
  value?: number; // 僅 number 牌有 0-9
}

export type PlayerKind = 'human' | 'ai';

export interface Player {
  id: number;
  name: string;
  kind: PlayerKind;
  hand: Card[];
  saidUno: boolean; // 是否已喊 UNO（剩 1 張時）
}

export type Direction = 1 | -1;
export type GameStatus = 'playing' | 'roundOver';

export interface GameState {
  drawPile: Card[];
  discardPile: Card[];
  players: Player[];
  currentPlayer: number;
  direction: Direction;
  activeColor: Color; // 當前有效顏色（變色牌會改寫）
  pendingDraw: number; // 疊牌累積待抽張數（+2 / +4）
  pendingDrawKind: 'draw2' | 'wild4' | null; // 目前疊的是哪種，決定可否續疊
  status: GameStatus;
  winner: number | null;
  log: string[];
}

export const COLORS: Color[] = ['red', 'yellow', 'green', 'blue'];

// ---- 牌組 ----

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  let n = 0;
  const mk = (color: WildColor, kind: CardKind, value?: number): Card => ({
    id: `c${n++}`,
    color,
    kind,
    value,
  });

  for (const color of COLORS) {
    deck.push(mk(color, 'number', 0)); // 每色一張 0
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

// Fisher–Yates 洗牌（就地）
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---- 開局 ----

export interface NewGameOptions {
  playerNames?: string[]; // 預設 ['你','電腦1','電腦2','電腦3']
  startingHand?: number; // 預設 7
}

export function createGame(opts: NewGameOptions = {}): GameState {
  const names = opts.playerNames ?? ['あなた', 'CPU 1', 'CPU 2', 'CPU 3'];
  const handSize = opts.startingHand ?? 7;

  const drawPile = shuffle(buildDeck());
  const players: Player[] = names.map((name, i) => ({
    id: i,
    name,
    kind: i === 0 ? 'human' : 'ai',
    hand: [],
    saidUno: false,
  }));

  for (let r = 0; r < handSize; r++) {
    for (const p of players) {
      p.hand.push(drawPile.pop()!);
    }
  }

  // 翻第一張當起始棄牌；若為 wild4 則退回重抽，確保起始合法
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
  };

  // 起始為動作牌時，對首位玩家生效
  applyStartCardEffect(state, first);
  return state;
}

// 起始牌效果（首位玩家為 player 0）
function applyStartCardEffect(state: GameState, first: Card) {
  switch (first.kind) {
    case 'skip':
      log(state, `最初のカードはスキップ。${state.players[0].name} はスキップされました`);
      advance(state, 1);
      break;
    case 'reverse':
      // 4 人逆轉：方向反轉，由最後一位玩家開始
      state.direction = -1;
      log(state, '最初のカードはリバース。順番が逆になりました');
      advance(state, 1);
      break;
    case 'draw2':
      state.pendingDraw = 2;
      state.pendingDrawKind = 'draw2';
      log(state, `最初のカードはドロー2。${state.players[0].name} はドロー2を受けます`);
      break;
    case 'wild':
      // activeColor 已隨機指定
      log(state, `最初のカードはワイルド。色は ${state.activeColor}`);
      break;
  }
}

// ---- 出牌規則 ----

export function topCard(state: GameState): Card {
  return state.discardPile[state.discardPile.length - 1];
}

// 一張牌在「正常情況」下是否可出（不含疊牌限制）
export function isPlayable(card: Card, activeColor: Color, top: Card): boolean {
  if (card.color === 'wild') return true; // wild / wild4 任意可出
  if (card.color === activeColor) return true;
  if (top.kind === 'number' && card.kind === 'number') {
    return card.value === top.value;
  }
  // 同符號（skip/reverse/draw2）
  if (card.kind === top.kind && card.kind !== 'number') return true;
  return false;
}

// 考量目前疊牌狀態後，這張牌是否可出
export function canPlay(state: GameState, card: Card): boolean {
  const top = topCard(state);
  if (state.pendingDraw > 0) {
    // 疊牌中：只能續疊同類（+2 疊 +2，+4 疊 +4）
    if (state.pendingDrawKind === 'draw2') return card.kind === 'draw2';
    if (state.pendingDrawKind === 'wild4') return card.kind === 'wild4';
    return false;
  }
  return isPlayable(card, state.activeColor, top);
}

// 取得當前玩家所有可出的牌（回傳卡牌參考）
export function playableCards(state: GameState, playerIndex = state.currentPlayer): Card[] {
  return state.players[playerIndex].hand.filter((c) => canPlay(state, c));
}

// ---- 行動 ----

export interface PlayResult {
  ok: boolean;
  reason?: string;
  needColor?: boolean; // 打出 wild/wild4 後需選色
}

// 出一張牌。chosenColor 用於 wild/wild4。
export function playCard(state: GameState, playerIndex: number, cardId: string, chosenColor?: Color): PlayResult {
  if (state.status !== 'playing') return { ok: false, reason: '遊戲已結束' };
  if (playerIndex !== state.currentPlayer) return { ok: false, reason: '還沒輪到你' };

  const player = state.players[playerIndex];
  const idx = player.hand.findIndex((c) => c.id === cardId);
  if (idx === -1) return { ok: false, reason: '手牌中沒有這張牌' };
  const card = player.hand[idx];

  if (!canPlay(state, card)) return { ok: false, reason: '這張牌不能出' };

  // 變色牌需要顏色
  if ((card.kind === 'wild' || card.kind === 'wild4') && !chosenColor) {
    return { ok: false, needColor: true };
  }

  // 移出手牌、放上棄牌堆
  player.hand.splice(idx, 1);
  state.discardPile.push(card);

  // 出牌後若手牌 >1，重置 saidUno（已不在 UNO 狀態）
  if (player.hand.length !== 1) player.saidUno = false;

  // 設定有效顏色
  if (card.color === 'wild') {
    state.activeColor = chosenColor!;
  } else {
    state.activeColor = card.color as Color;
  }

  log(state, `${player.name} は ${cardLabel(card, chosenColor)} を出しました`);

  // 勝負：手牌歸零
  if (player.hand.length === 0) {
    state.status = 'roundOver';
    state.winner = playerIndex;
    log(state, `🎉 ${player.name} の勝ち！`);
    return { ok: true };
  }

  // 套用牌效果並推進回合
  applyCardEffect(state, card);
  return { ok: true };
}

function applyCardEffect(state: GameState, card: Card) {
  switch (card.kind) {
    case 'skip':
      advance(state, 1); // 跳過下家：先到下家
      log(state, `${current(state).name} はスキップされました`);
      advance(state, 1);
      break;
    case 'reverse':
      state.direction = (state.direction * -1) as Direction;
      log(state, '順番が逆になりました');
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

// 當前玩家抽牌。回傳抽到的牌（用於「抽到可立即出」）。
// 若有 pendingDraw，會一次抽完累積張數並結束其回合（認抽）。
export interface DrawResult {
  drawn: Card[];
  forced: boolean; // 是否為被疊牌罰抽
  playable: Card | null; // 主動抽 1 張時，抽到的牌若可出則回傳
}

export function drawForCurrent(state: GameState): DrawResult {
  if (state.status !== 'playing') return { drawn: [], forced: false, playable: null };
  const player = current(state);

  if (state.pendingDraw > 0) {
    // 認抽：抽完累積張數，跳過此玩家
    const drawn = drawCards(state, player, state.pendingDraw);
    log(state, `${player.name} は ${drawn.length} 枚引きました（重ね出し精算）`);
    state.pendingDraw = 0;
    state.pendingDrawKind = null;
    advance(state, 1);
    return { drawn, forced: true, playable: null };
  }

  // 一般抽 1 張
  const drawn = drawCards(state, player, 1);
  const card = drawn[0] ?? null;
  player.saidUno = false;
  const playable = card && isPlayable(card, state.activeColor, topCard(state)) ? card : null;
  log(state, `${player.name} は1枚引きました`);
  return { drawn, forced: false, playable };
}

// 抽 1 張後選擇不出，結束回合
export function passAfterDraw(state: GameState) {
  advance(state, 1);
}

// ---- 喊 UNO ----

// 玩家宣告 UNO（剩 1 張時有效）
export function declareUno(state: GameState, playerIndex: number) {
  const p = state.players[playerIndex];
  if (p.hand.length === 1) {
    p.saidUno = true;
    log(state, `${p.name} がUNO！とコール`);
  }
}

// 抓某玩家忘喊 UNO：若該玩家剩 1 張且未喊，罰抽 2 張
export function catchUno(state: GameState, targetIndex: number): boolean {
  const p = state.players[targetIndex];
  if (p.hand.length === 1 && !p.saidUno) {
    drawCards(state, p, 2);
    log(state, `${p.name} はUNOコールを忘れ、ペナルティで2枚引きました`);
    return true;
  }
  return false;
}

// ---- 內部工具 ----

function current(state: GameState): Player {
  return state.players[state.currentPlayer];
}

// 推進 currentPlayer n 步（依方向）
function advance(state: GameState, n: number) {
  const count = state.players.length;
  state.currentPlayer = (state.currentPlayer + state.direction * n + count * n) % count;
}

// 取得「下一位」玩家索引（不改變狀態）
export function nextPlayerIndex(state: GameState): number {
  const count = state.players.length;
  return (state.currentPlayer + state.direction + count) % count;
}

// 從抽牌堆抽 count 張給 player；不足時將棄牌堆洗回
function drawCards(state: GameState, player: Player, count: number): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (state.drawPile.length === 0) reshuffleDiscard(state);
    if (state.drawPile.length === 0) break; // 真的沒牌可抽
    player.hand.push(state.drawPile.pop()!);
    drawn.push(player.hand[player.hand.length - 1]);
  }
  return drawn;
}

// 將棄牌堆（保留最上面那張）洗回抽牌堆
function reshuffleDiscard(state: GameState) {
  const top = state.discardPile.pop()!;
  const recycled = state.discardPile;
  state.discardPile = [top];
  // 變色牌洗回後恢復為 wild（顏色重置）
  for (const c of recycled) {
    if (c.kind === 'wild' || c.kind === 'wild4') c.color = 'wild';
  }
  state.drawPile = shuffle(recycled);
  log(state, '山札がなくなったので捨て札をシャッフルしました');
}

function log(state: GameState, msg: string) {
  state.log.push(msg);
  if (state.log.length > 50) state.log.shift();
}

// ---- 顯示用 ----

const KIND_LABEL: Record<CardKind, string> = {
  number: '',
  skip: 'スキップ',
  reverse: 'リバース',
  draw2: 'ドロー2',
  wild: 'ワイルド',
  wild4: 'ワイルドドロー4',
};

export function cardLabel(card: Card, chosenColor?: Color): string {
  const colorName: Record<WildColor, string> = {
    red: '赤',
    yellow: '黄',
    green: '緑',
    blue: '青',
    wild: 'ワイルド',
  };
  if (card.kind === 'number') return `${colorName[card.color]}${card.value}`;
  if (card.color === 'wild') {
    return chosenColor ? `${KIND_LABEL[card.kind]}(${colorName[chosenColor]}指定)` : KIND_LABEL[card.kind];
  }
  return `${colorName[card.color]}${KIND_LABEL[card.kind]}`;
}
