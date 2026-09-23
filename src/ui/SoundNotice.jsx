import { mono, PAPER, CARD, INK, MUTE, RULE, ACCENT } from "./theme.js";
import { useI18n } from "../i18n.jsx";

/* first visit only: say that there is music and let the player choose.
   The tap on either button is the gesture browsers require before any
   sound, so "with sound" starts the music right away. */
export function SoundNotice({ onChoose }) {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" style={{ background: "rgba(19,33,51,0.32)" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="sound-title" className="w-full px-6 py-7"
        style={{ maxWidth: 340, background: CARD, border: `1px solid ${RULE}`, borderTop: `3px solid ${ACCENT}`, boxShadow: "0 12px 40px rgba(19,33,51,0.18)" }}>
        <div className="text-[10px] tracking-[0.34em]" style={{ ...mono, color: ACCENT }}>SOUND</div>
        <h2 id="sound-title" className="mt-2 text-lg font-bold" style={{ color: INK }}>{t.soundTitle}</h2>
        <p className="mt-3 text-[13px] leading-relaxed" style={{ color: MUTE }}>{t.soundBody}</p>
        <div className="mt-6 flex flex-col gap-2">
          <button onClick={() => onChoose(true)} className="py-3 text-sm tracking-[0.1em]" autoFocus
            style={{ ...mono, border: `1px solid ${ACCENT}`, background: ACCENT, color: "#fff" }}>{t.soundOn}</button>
          <button onClick={() => onChoose(false)} className="py-3 text-xs"
            style={{ ...mono, border: `1px solid ${RULE}`, background: PAPER, color: INK }}>{t.soundOff}</button>
        </div>
      </div>
    </div>
  );
}
