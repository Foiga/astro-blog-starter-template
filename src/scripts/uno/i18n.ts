// UNO 多言語（中 / 英 / 日）。UI とログ表示の文言をここで一元管理。

import type { Card, Color, WildColor, Player } from './engine';

export type Lang = 'zh' | 'en' | 'ja';
export const LANGS: Lang[] = ['zh', 'en', 'ja'];
export const LANG_LABEL: Record<Lang, string> = { zh: '中', en: 'EN', ja: '日' };

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

type Dict = Record<string, string>;

const STRINGS: Record<Lang, Dict> = {
  zh: {
    page_title: 'UNO 紙牌遊戲',
    subtitle: '點可出的牌出牌，點牌庫抽牌。剩一張別忘了按 UNO！',
    uno_btn: 'UNO!',
    new_game: '新遊戲',
    replay: '再玩一局',
    choose_color: '選擇顏色',
    play: '打出',
    keep: '保留',
    play_drawn: '抽到可出的牌，要打出嗎？',
    your_turn: '輪到你出牌',
    winner_you: '🎉 你贏了！',
    winner_other: '{name} 獲勝',
    cards_count: '{n} 張',
    deck: '牌庫 {n}',
    dir_cw: '↻ 順時針',
    dir_ccw: '↺ 逆時針',
    stack: '疊牌 +{n}',
    drawn_playable: '抽到 {card}，可出',
    you: '你',
    cpu: '電腦 {n}',
    lang_label: '語言',
    diff_label: '難度',
    easy: '簡單',
    medium: '中等',
    hard: '困難',
    color_red: '紅', color_yellow: '黃', color_green: '綠', color_blue: '藍', color_wild: '萬用',
    kind_skip: '跳過', kind_reverse: '迴轉', kind_draw2: '+2', kind_wild: '變色', kind_wild4: '變色+4',
    log_start_skip: '起始為跳過牌，{name} 被跳過',
    log_start_reverse: '起始為迴轉牌，方向反轉',
    log_start_draw2: '起始為 +2，{name} 需面對 +2',
    log_start_wild: '起始為變色牌，顏色為 {color}',
    log_played: '{name} 出了 {card}',
    log_win: '🎉 {name} 獲勝！',
    log_skipped: '{name} 被跳過',
    log_reversed: '方向反轉',
    log_drew_stack: '{name} 抽了 {n} 張（疊牌結算）',
    log_drew_one: '{name} 抽了 1 張',
    log_said_uno: '{name} 喊了 UNO！',
    log_forgot_uno: '{name} 忘記喊 UNO，罰抽 2 張',
    log_reshuffle: '牌庫用盡，棄牌重新洗牌',
  },
  en: {
    page_title: 'UNO Card Game',
    subtitle: 'Tap a playable card to play, tap the deck to draw. Don’t forget UNO on your last card!',
    uno_btn: 'UNO!',
    new_game: 'New Game',
    replay: 'Play Again',
    choose_color: 'Choose a color',
    play: 'Play',
    keep: 'Keep',
    play_drawn: 'You drew a playable card. Play it?',
    your_turn: 'Your turn',
    winner_you: '🎉 You win!',
    winner_other: '{name} wins',
    cards_count: '{n} cards',
    deck: 'Deck {n}',
    dir_cw: '↻ Clockwise',
    dir_ccw: '↺ Counter-CW',
    stack: 'Stack +{n}',
    drawn_playable: 'Drew {card}, playable',
    you: 'You',
    cpu: 'CPU {n}',
    lang_label: 'Language',
    diff_label: 'Difficulty',
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard',
    color_red: 'Red', color_yellow: 'Yellow', color_green: 'Green', color_blue: 'Blue', color_wild: 'Wild',
    kind_skip: 'Skip', kind_reverse: 'Reverse', kind_draw2: '+2', kind_wild: 'Wild', kind_wild4: 'Wild+4',
    log_start_skip: 'First card is Skip. {name} is skipped',
    log_start_reverse: 'First card is Reverse. Direction flipped',
    log_start_draw2: 'First card is +2. {name} faces +2',
    log_start_wild: 'First card is Wild. Color is {color}',
    log_played: '{name} played {card}',
    log_win: '🎉 {name} wins!',
    log_skipped: '{name} was skipped',
    log_reversed: 'Direction reversed',
    log_drew_stack: '{name} drew {n} cards (stack)',
    log_drew_one: '{name} drew a card',
    log_said_uno: '{name} called UNO!',
    log_forgot_uno: '{name} forgot UNO — draws 2',
    log_reshuffle: 'Deck empty — discard reshuffled',
  },
  ja: {
    page_title: 'UNO カードゲーム',
    subtitle: '出せるカードをタップして出す、山札をタップして引く。残り1枚で UNO を忘れずに！',
    uno_btn: 'UNO!',
    new_game: '新しいゲーム',
    replay: 'もう一度プレイ',
    choose_color: '色を選んでください',
    play: '出す',
    keep: '手札に残す',
    play_drawn: '出せるカードを引きました。出しますか？',
    your_turn: 'あなたの番です',
    winner_you: '🎉 あなたの勝ち！',
    winner_other: '{name} の勝ち',
    cards_count: '{n} 枚',
    deck: '山札 {n}',
    dir_cw: '↻ 時計回り',
    dir_ccw: '↺ 反時計回り',
    stack: '重ね出し +{n}',
    drawn_playable: '引いた {card} は出せます',
    you: 'あなた',
    cpu: 'CPU {n}',
    lang_label: '言語',
    diff_label: '難易度',
    easy: 'かんたん',
    medium: 'ふつう',
    hard: 'むずかしい',
    color_red: '赤', color_yellow: '黄', color_green: '緑', color_blue: '青', color_wild: 'ワイルド',
    kind_skip: 'スキップ', kind_reverse: 'リバース', kind_draw2: 'ドロー2', kind_wild: 'ワイルド', kind_wild4: 'ワイルドドロー4',
    log_start_skip: '最初のカードはスキップ。{name} はスキップされました',
    log_start_reverse: '最初のカードはリバース。順番が逆になりました',
    log_start_draw2: '最初のカードはドロー2。{name} はドロー2を受けます',
    log_start_wild: '最初のカードはワイルド。色は {color}',
    log_played: '{name} は {card} を出しました',
    log_win: '🎉 {name} の勝ち！',
    log_skipped: '{name} はスキップされました',
    log_reversed: '順番が逆になりました',
    log_drew_stack: '{name} は {n} 枚引きました（重ね出し精算）',
    log_drew_one: '{name} は1枚引きました',
    log_said_uno: '{name} が UNO！とコール',
    log_forgot_uno: '{name} はUNOコールを忘れ、ペナルティで2枚引き',
    log_reshuffle: '山札がなくなったので捨て札をシャッフル',
  },
};

export function t(lang: Lang, key: string, params: Record<string, string | number> = {}): string {
  let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  for (const k in params) s = s.split(`{${k}}`).join(String(params[k]));
  return s;
}

export function colorName(lang: Lang, color: WildColor): string {
  return t(lang, `color_${color}`);
}

export function cardLabel(lang: Lang, card: Card, chosenColor?: Color | null): string {
  const sep = lang === 'en' ? ' ' : '';
  if (card.kind === 'number') return `${colorName(lang, card.color)}${sep}${card.value}`;
  const kind = t(lang, `kind_${card.kind}`);
  if (card.color === 'wild') {
    return chosenColor ? `${kind}(→${colorName(lang, chosenColor)})` : kind;
  }
  return `${colorName(lang, card.color)}${sep}${kind}`;
}

export function playerName(lang: Lang, player: Player): string {
  return player.kind === 'human' ? t(lang, 'you') : t(lang, 'cpu', { n: player.id });
}

// ブラウザ既定言語からの推定
export function detectLang(): Lang {
  const n = (typeof navigator !== 'undefined' ? navigator.language : 'ja').toLowerCase();
  if (n.startsWith('zh')) return 'zh';
  if (n.startsWith('ja')) return 'ja';
  return 'en';
}
