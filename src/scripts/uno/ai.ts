// UNO AI 對手決策 —— 純邏輯。難易度（easy / medium / hard）で強さが変わる。

import { type GameState, type Card, type Color, COLORS, playableCards, nextPlayerIndex } from './engine';
import type { Difficulty } from './i18n';

export interface AiAction {
  type: 'play' | 'draw';
  cardId?: string;
  chosenColor?: Color;
}

function countByColor(hand: Card[]): Record<Color, number> {
  const c: Record<Color, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const card of hand) if (card.color !== 'wild') c[card.color]++;
  return c;
}

function dominantColor(hand: Card[]): Color {
  const c = countByColor(hand);
  let best: Color = COLORS[0];
  for (const color of COLORS) if (c[color] > c[best]) best = color;
  return best;
}

function pickColor(hand: Card[]): Color {
  const hasColored = hand.some((c) => c.color !== 'wild');
  return hasColored ? dominantColor(hand) : COLORS[Math.floor(Math.random() * COLORS.length)];
}

// medium 用：出牌優先度（高いほど先に出す）
function cardScore(card: Card): number {
  switch (card.kind) {
    case 'wild4': return 1;
    case 'wild': return 2;
    case 'draw2': return 8;
    case 'skip': return 7;
    case 'reverse': return 6;
    default: return 5;
  }
}

export function decideAi(state: GameState, difficulty: Difficulty = 'medium'): AiAction {
  const me = state.currentPlayer;
  const hand = state.players[me].hand;
  const options = playableCards(state, me);
  if (options.length === 0) return { type: 'draw' };

  if (difficulty === 'easy') return decideEasy(hand, options);
  if (difficulty === 'hard') return decideHard(state, hand, options);
  return decideMedium(hand, options);
}

// かんたん：ランダムに出す・色もランダム
function decideEasy(hand: Card[], options: Card[]): AiAction {
  const chosen = options[Math.floor(Math.random() * options.length)];
  const action: AiAction = { type: 'play', cardId: chosen.id };
  if (chosen.color === 'wild') action.chosenColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  return action;
}

// ふつう：非変色牌を優先・手持ち最多色を指定
function decideMedium(hand: Card[], options: Card[]): AiAction {
  const sorted = [...options].sort((a, b) => cardScore(b) - cardScore(a));
  const nonWild = sorted.filter((c) => c.color !== 'wild');
  const chosen = nonWild.length > 0 ? nonWild[0] : sorted[0];
  const action: AiAction = { type: 'play', cardId: chosen.id };
  if (chosen.color === 'wild') action.chosenColor = pickColor(hand);
  return action;
}

// むずかしい：次の相手の手札が少なければ攻撃牌を優先、ワイルドは温存、色は最適化
function decideHard(state: GameState, hand: Card[], options: Card[]): AiAction {
  const nextIdx = nextPlayerIndex(state);
  const nextLow = state.players[nextIdx].hand.length <= 2;

  const attack = options.filter((c) => c.kind === 'draw2' || c.kind === 'skip' || c.kind === 'wild4');
  const plainColored = options.filter((c) => c.color !== 'wild' && c.kind !== 'wild4');
  const wilds = options.filter((c) => c.color === 'wild');

  let chosen: Card;
  if (nextLow && attack.length > 0) {
    // 相手が上がり間際 → 攻撃牌（+2 > スキップ > +4）
    chosen = attack.sort((a, b) => attackRank(b) - attackRank(a))[0];
  } else if (plainColored.length > 0) {
    // 通常は色牌を消費し、手持ち最多色を優先的に残す
    const dom = dominantColor(hand);
    chosen = plainColored.sort(
      (a, b) => sameColorBonus(b, dom) - sameColorBonus(a, dom) || cardScore(b) - cardScore(a),
    )[0];
  } else if (wilds.length > 0) {
    // 色牌が無いときだけワイルド（wild を先に使い +4 を温存）
    chosen = wilds.sort((a, b) => rankWild(a) - rankWild(b))[0];
  } else {
    chosen = options[0];
  }

  const action: AiAction = { type: 'play', cardId: chosen.id };
  if (chosen.color === 'wild') action.chosenColor = pickColor(hand);
  return action;
}

function attackRank(c: Card): number {
  if (c.kind === 'draw2') return 3;
  if (c.kind === 'skip') return 2;
  if (c.kind === 'wild4') return 1;
  return 0;
}
function sameColorBonus(c: Card, dom: Color): number {
  return c.color === dom ? 1 : 0;
}
function rankWild(c: Card): number {
  return c.kind === 'wild' ? 0 : 1; // wild を優先（小さいほど先）
}

export function aiChooseColorForDrawn(state: GameState): Color {
  return pickColor(state.players[state.currentPlayer].hand);
}
