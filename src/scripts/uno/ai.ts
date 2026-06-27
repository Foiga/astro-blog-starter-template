// UNO AI 對手決策 —— 純邏輯。
// 給定遊戲狀態，回傳 AI 該玩家的行動：出某張牌（含選色）或抽牌。

import {
  type GameState,
  type Card,
  type Color,
  COLORS,
  playableCards,
} from './engine';

export interface AiAction {
  type: 'play' | 'draw';
  cardId?: string;
  chosenColor?: Color; // 出 wild/wild4 時的選色
}

// 計算手牌中各顏色數量，回傳數量最多的顏色（用於變色牌選色與評估）
function dominantColor(hand: Card[]): Color {
  const counts: Record<Color, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const c of hand) {
    if (c.color !== 'wild') counts[c.color]++;
  }
  let best: Color = COLORS[0];
  for (const color of COLORS) {
    if (counts[color] > counts[best]) best = color;
  }
  return best;
}

// 評估一張牌的出牌優先度（分數越高越優先打出）
function cardScore(card: Card): number {
  switch (card.kind) {
    case 'wild4':
      return 1; // 最強，但保留到必要時，給低優先（盡量先出普通牌）
    case 'wild':
      return 2;
    case 'draw2':
      return 8;
    case 'skip':
      return 7;
    case 'reverse':
      return 6;
    case 'number':
      return 5; // 優先清掉數字牌
  }
}

// 決定 AI 行動。candidatesOverride 可用於「剛抽到的牌是否要打」等情境。
export function decideAi(state: GameState): AiAction {
  const me = state.currentPlayer;
  const hand = state.players[me].hand;
  const options = playableCards(state, me);

  if (options.length === 0) {
    return { type: 'draw' };
  }

  // 疊牌情境：有可續疊的牌就疊（playableCards 已過濾為合法的疊牌選項）
  // 一般情境：依分數排序，優先出非變色牌，保留 wild 到需要時
  const sorted = [...options].sort((a, b) => cardScore(b) - cardScore(a));

  // 若手上只剩變色牌可出，或非變色牌都不可出，才用變色牌
  const nonWild = sorted.filter((c) => c.color !== 'wild');
  const chosen = nonWild.length > 0 ? nonWild[0] : sorted[0];

  const action: AiAction = { type: 'play', cardId: chosen.id };
  if (chosen.color === 'wild') {
    // 選手上最多的顏色；若沒有任何彩色牌則隨機
    const hasColored = hand.some((c) => c.color !== 'wild');
    action.chosenColor = hasColored
      ? dominantColor(hand)
      : COLORS[Math.floor(Math.random() * COLORS.length)];
  }
  return action;
}

// AI 剛主動抽到一張可出的牌時，是否要立刻打出（簡單策略：打出）
export function aiShouldPlayDrawn(_state: GameState, _drawn: Card): boolean {
  return true;
}

// AI 對某張剛抽到的 wild 選色
export function aiChooseColorForDrawn(state: GameState): Color {
  const hand = state.players[state.currentPlayer].hand;
  const hasColored = hand.some((c) => c.color !== 'wild');
  return hasColored ? dominantColor(hand) : COLORS[Math.floor(Math.random() * COLORS.length)];
}
