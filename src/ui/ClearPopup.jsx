import { useEffect } from "react";
import { mono, CARD, INK, MUTE, RULE, ACCENT } from "./theme.js";
import { useI18n } from "../i18n.jsx";

/* shown once the last block is gone — by the player, or by the solution
   replay that skipping starts. Play it again from the start, or move on.
   Space / Enter still go to the next puzzle through the drop button;
   Escape or a click outside closes it so the finished board can be
   looked at (or undone). */
export function ClearPopup({ replay, used, minMoves, onReset, onNext, onClose }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const best = minMoves != null && used <= minMoves;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center p-4" style={{ background: "rgba(19,33,51,0.18)" }}
      onClick={onClose}>
      <div role="dialog" aria-label={replay ? t.solution : t.cleared} className="w-full px-6 py-7 text-center"
        style={{ maxWidth: 320, background: CARD, border: `1px solid ${RULE}`, borderTop: `3px solid ${ACCENT}`, boxShadow: "0 12px 40px rgba(19,33,51,0.18)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="text-[10px] tracking-[0.34em]" style={{ ...mono, color: ACCENT }}>{replay ? "ANSWER" : "CLEAR"}</div>
        <div className="mt-2 text-2xl font-bold tracking-[0.1em]" style={{ color: INK }}>{replay ? t.solution : t.cleared}</div>
        <div className="mt-4 flex items-baseline justify-center gap-2" style={mono}>
          <span className="text-4xl leading-none" style={{ color: INK }}>{used}</span>
          <span className="text-xs" style={{ color: MUTE }}>{t.movesUnit} {t.ofBest(minMoves ?? "–")}</span>
        </div>
        <div className="mt-2 h-4 text-[11px]" style={{ ...mono, color: best && !replay ? ACCENT : MUTE }}>
          {replay ? t.replayNote : best ? t.bestNote : t.shorterNote(used - minMoves)}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button onClick={onReset} className="py-3 text-xs"
            style={{ ...mono, border: `1px solid ${RULE}`, color: INK }}>{t.restart}</button>
          <button onClick={onNext} className="py-3 text-xs tracking-[0.2em]"
            style={{ ...mono, border: `1px solid ${ACCENT}`, background: ACCENT, color: "#fff" }}>{t.next}</button>
        </div>
      </div>
    </div>
  );
}
