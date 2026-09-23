import { createContext, useContext } from "react";

/* every string the player reads, per language. Values are either text
   or small functions for the ones that carry numbers. */
export const LANGS = [
  { id: "ja", label: "日本語" },
  { id: "en", label: "English" },
];

const STRINGS = {
  ja: {
    rules: ["立方体を回して底面を選び、落とす。", "同じ色が 2×2×2 に揃うと消える。", "全部消せばクリア。"],
    start: "はじめる",
    seed: "SEED",
    seedHelp: "空欄ならランダム。同じ seed と設定で、同じ問題が出ます",
    settings: "設定",
    back: "戻る",
    difficulty: "難易度",
    boardSize: "盤サイズ",
    colors: "色数",
    minMoves: "手数の下限",
    custom: "カスタム",
    sep: " ・ ",
    summary: (c) => `${c.size}³ ・ ${c.colors}色 ・ ${c.moves}手以上`,
    best: (n) => `最短 ${n} 手`,

    undo: "1手戻す",
    drop: "落とす",
    next: "次の問題",
    generating: "生成中",
    failed: "作れません",
    replaying: "再生中",
    guide: ["上下スワイプで底面を入れ替え、左右スワイプで見回す", "灰色のマスは動かない"],
    guideSep: " ／ ",
    menu: "メニュー",
    restart: "最初から",
    skip: "この問題をスキップ",
    toTitle: "タイトルに戻る",

    cleared: "全消し",
    solution: "解答",
    movesUnit: "手",
    ofBest: (n) => `／ 最短 ${n} 手`,
    replayNote: "「最初から」で挑戦し直せます",
    bestNote: "最短手数で解きました",
    shorterNote: (k) => `あと ${k} 手縮められます`,

    soundTitle: "BGM が流れます",
    soundBody: "このゲームは音楽が鳴ります。音量にご注意ください。画面の BGM ボタンでいつでも切り替えられます。",
    soundOn: "音ありではじめる",
    soundOff: "音なし",
    openTrack: "この曲を DiscoFunc で開く",
  },
  en: {
    rules: ["Turn the cube to choose the floor, then drop.", "Same-colour blocks forming a 2×2×2 cube vanish.", "Clear every block to win."],
    start: "START",
    seed: "SEED",
    seedHelp: "Leave empty for a random puzzle. The same seed and settings always give the same puzzle.",
    settings: "Settings",
    back: "Back",
    difficulty: "Difficulty",
    boardSize: "Board size",
    colors: "Colours",
    minMoves: "Minimum moves",
    custom: "Custom",
    sep: " · ",
    summary: (c) => `${c.size}³ · ${c.colors} colour${c.colors > 1 ? "s" : ""} · ${c.moves}+ moves`,
    best: (n) => `Best: ${n} moves`,

    undo: "Undo",
    drop: "DROP",
    next: "NEXT",
    generating: "Generating",
    failed: "Unavailable",
    replaying: "Replaying",
    guide: ["Swipe up/down to change the floor, left/right to look around", "Grey cells never move"],
    guideSep: " / ",
    menu: "Menu",
    restart: "Restart",
    skip: "Skip this puzzle",
    toTitle: "Back to title",

    cleared: "Cleared",
    solution: "Solution",
    movesUnit: "moves",
    ofBest: (n) => `/ best ${n}`,
    replayNote: "Press Restart to try it yourself",
    bestNote: "Solved in the fewest moves",
    shorterNote: (k) => `It can be done in ${k} fewer move${k > 1 ? "s" : ""}`,

    soundTitle: "This game has music",
    soundBody: "Music will play — mind your volume. You can switch it on or off at any time with the BGM button.",
    soundOn: "Play with sound",
    soundOff: "Mute",
    openTrack: "Open this track in DiscoFunc",
  },
};

/* the saved choice, else the browser's language, else English */
const LANG_KEY = "cubicrule.lang";
export function initialLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (STRINGS[saved]) return saved;
  } catch { /* storage unavailable */ }
  const nav = (typeof navigator !== "undefined" && navigator.language) || "";
  return nav.toLowerCase().startsWith("ja") ? "ja" : "en";
}
export function saveLang(lang) {
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* not kept */ }
}

export const stringsFor = (lang) => STRINGS[lang] || STRINGS.en;

const I18n = createContext({ lang: "ja", t: STRINGS.ja, setLang: () => {} });
export function I18nProvider({ lang, setLang, children }) {
  return <I18n.Provider value={{ lang, t: STRINGS[lang], setLang }}>{children}</I18n.Provider>;
}
export const useI18n = () => useContext(I18n);
