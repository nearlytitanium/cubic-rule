import { useState } from "react";
import { mono, PAPER, CARD, INK, MUTE, RULE, ACCENT } from "./theme.js";
import { Pick } from "./controls.jsx";
import { TitleCube } from "./TitleCube.jsx";
import { LANGS, useI18n } from "../i18n.jsx";

export const SEED_DIGITS = 9;

/* named difficulties; any other combination of the three options is
   "custom". Generation stays well under a second for all three. */
export const PRESETS = [
  { id: "easy", label: "Easy", size: 4, colors: 1, moves: 3 },
  { id: "normal", label: "Normal", size: 5, colors: 2, moves: 4 },
  { id: "hard", label: "Hard", size: 5, colors: 3, moves: 6 },
];
export const presetOf = (c) =>
  PRESETS.find((p) => p.size === c.size && p.colors === c.colors && p.moves === c.moves) || { id: "custom" };
export const presetLabel = (c, t) => presetOf(c).label ?? t.custom;

/* the first screen, and where "back to title" leads: start, an optional
   seed, and the settings behind their own page. The options only take
   effect on start; a seed together with the options names one puzzle,
   and an empty seed means a random one. */
export function TitleScreen({ config, onStart }) {
  const { lang, t, setLang } = useI18n();
  const [draft, setDraft] = useState(config);
  const [seed, setSeed] = useState("");
  const [view, setView] = useState("main");
  const set = (key) => (v) => setDraft((d) => ({ ...d, [key]: v }));
  const preset = presetOf(draft);

  const submit = (e) => {
    e.preventDefault();
    onStart(draft, seed === "" ? null : Number(seed));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: PAPER, color: INK }}>
      {/* language, top-right */}
      <div className="absolute right-3 top-3 flex text-[11px]" role="radiogroup" aria-label="Language"
        style={{ ...mono, border: `1px solid ${RULE}` }}>
        {LANGS.map((l) => (
          <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} lang={l.id}
            onClick={() => setLang(l.id)} className="px-3 py-1.5"
            style={{ background: lang === l.id ? INK : "transparent", color: lang === l.id ? PAPER : MUTE }}>
            {l.label}
          </button>
        ))}
      </div>

      <div className="mx-auto flex min-h-full w-full flex-col justify-center px-4 py-14" style={{ maxWidth: 400 }}>
        {view === "main" && <div className="-mt-2 mb-4 self-center"><TitleCube size={180} /></div>}
        <h1 className="text-4xl font-semibold leading-none tracking-[0.12em]" style={mono}>CUBIC RULE</h1>
        <div className="mt-4 h-[3px] w-12" style={{ background: ACCENT }} />

        {view === "main" ? (
          <form onSubmit={submit} className="flex flex-col">
            <ol className="mt-5 flex flex-col gap-1 text-sm leading-relaxed" style={{ color: MUTE }}>
              {t.rules.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span style={{ ...mono, color: INK }}>{i + 1}.</span>
                  <span>{r}</span>
                </li>
              ))}
            </ol>

            <button type="submit" className="mt-8 py-4 text-sm tracking-[0.4em]"
              style={{ ...mono, border: `1px solid ${ACCENT}`, background: ACCENT, color: "#fff" }}>{t.start}</button>

            <label className="mt-6 block">
              <input value={seed} inputMode="numeric" autoComplete="off" spellCheck={false}
                maxLength={SEED_DIGITS} placeholder={t.seed} aria-label={t.seed}
                onChange={(e) => setSeed(e.target.value.replace(/\D/g, "").slice(0, SEED_DIGITS))}
                className="w-full px-3 py-3 text-sm outline-none"
                style={{ ...mono, background: CARD, border: `1px solid ${RULE}`, color: INK }} />
              <div className="mt-1 text-[10px] leading-relaxed" style={{ ...mono, color: MUTE }}>{t.seedHelp}</div>
            </label>

            <button type="button" onClick={() => setView("settings")}
              className="mt-6 flex items-center justify-between gap-3 px-4 py-3 text-left"
              style={{ ...mono, background: CARD, border: `1px solid ${RULE}`, color: INK }}>
              <span className="text-xs tracking-[0.2em]">{t.settings}</span>
              <span className="text-right text-[11px]" style={{ color: MUTE }}>
                <span style={{ color: INK }}>{presetLabel(draft, t)}</span>{t.sep}{t.summary(draft)}
              </span>
            </button>
          </form>
        ) : (
          <div className="flex flex-col">
            <div className="mt-5 text-[10px] tracking-[0.3em]" style={{ ...mono, color: MUTE }}>SETTINGS</div>
            <div className="mt-3 flex flex-col gap-4 p-4" style={{ background: CARD, border: `1px solid ${RULE}` }}>
              <Pick label={t.difficulty} value={preset.id}
                onChange={(id) => { const p = PRESETS.find((q) => q.id === id); if (p) setDraft({ size: p.size, colors: p.colors, moves: p.moves }); }}
                options={[...PRESETS.map((p) => ({ v: p.id, l: p.label })), { v: "custom", l: t.custom, disabled: true }]} />
              <div className="h-px" style={{ background: RULE }} />
              <Pick label={t.boardSize} value={draft.size} onChange={set("size")} options={[{ v: 4, l: "4³" }, { v: 5, l: "5³" }]} />
              <Pick label={t.colors} value={draft.colors} onChange={set("colors")} options={[1, 2, 3].map((v) => ({ v, l: `${v}` }))} />
              <Pick label={t.minMoves} value={draft.moves} onChange={set("moves")} options={[3, 4, 5, 6, 7, 8].map((v) => ({ v, l: `${v}` }))} />
            </div>
            <button type="button" onClick={() => setView("main")} className="mt-6 py-3 text-xs tracking-[0.3em]"
              style={{ ...mono, border: `1px solid ${INK}`, background: INK, color: PAPER }}>{t.back}</button>
          </div>
        )}
      </div>
    </div>
  );
}
