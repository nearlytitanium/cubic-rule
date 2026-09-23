import { useEffect, useState } from "react";
import { mono, CARD, INK, MUTE, RULE, ACCENT } from "./theme.js";
import { useI18n } from "../i18n.jsx";


/* the ≡ button in the top-left corner; everything that is not part of
   playing the current move (reset, skip, back to the title) lives
   behind it, under a line naming the puzzle (options and seed) */
function MenuButton({ items, note, large }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const side = large ? 40 : 34;
  return (
    <div className="relative" style={{ pointerEvents: "auto" }}>
      <button onClick={() => setOpen((v) => !v)} aria-label={t.menu} aria-expanded={open}
        className="grid place-items-center"
        style={{
          width: side, height: side,
          border: `1px solid ${open ? INK : RULE}`,
          background: "rgba(245,248,250,0.82)",
          backdropFilter: "blur(2px)",
        }}>
        <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
          <path d="M0 1h16M0 6h16M0 11h16" stroke={INK} strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <>
          {/* click anywhere else to close */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 mt-2 flex flex-col"
            style={{ top: "100%", minWidth: 200, background: CARD, border: `1px solid ${RULE}`, boxShadow: "0 6px 20px rgba(19,33,51,0.12)" }}>
            {note && (
              <div className="select-text px-4 py-2 text-[10px] leading-relaxed" data-note
                style={{ ...mono, color: MUTE, borderBottom: `1px solid ${RULE}` }}>{note}</div>
            )}
            {items.map((it, i) => (
              <button key={it.label} onClick={() => { setOpen(false); it.onClick(); }}
                className="px-4 py-3 text-left text-xs tracking-[0.1em]"
                style={{ ...mono, color: INK, borderTop: i ? `1px solid ${RULE}` : "none" }}>
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* everything the player needs sits on top of the cube, which fills the
   window: the counters read as labels in its corners, the buttons are
   the only things that take pointer events so dragging still works
   everywhere else. "land" (phones held sideways) keeps the HUD at the
   sides, where height is scarce; "phone" and "wide" share one
   arrangement at two sizes. */
export function Hud({ layout, minMoves, used, cleared, canDrop, onDrop, dropLabel, onUndo, canUndo, menu, menuNote, reserveRight = 0 }) {
  const { t } = useI18n();
  const wide = layout === "wide", land = layout === "land";
  const undoBtn = (
    <button onClick={onUndo} disabled={!canUndo} className="py-3 px-3 text-xs"
      style={{
        ...mono,
        border: `1px solid ${canUndo ? RULE : "rgba(185,196,204,0.5)"}`,
        background: canUndo ? "rgba(245,248,250,0.82)" : "transparent",
        color: canUndo ? INK : RULE,
        backdropFilter: "blur(2px)",
      }}>{t.undo}</button>
  );
  const dropBtn = (
    <button onClick={onDrop} disabled={!canDrop} className={`py-3 text-sm ${cleared ? "tracking-[0.2em]" : "tracking-[0.3em]"}`}
      style={{
        ...mono,
        border: `1px solid ${canDrop ? ACCENT : "rgba(185,196,204,0.5)"}`,
        background: canDrop ? ACCENT : "rgba(245,248,250,0.5)",
        color: canDrop ? "#fff" : RULE,
        backdropFilter: "blur(2px)",
      }}>{dropLabel}</button>
  );
  const title = (
    <div>
      <div className={`${wide ? "text-[11px]" : "text-[9px]"} tracking-[0.3em]`} style={{ ...mono, color: MUTE }}>CUBIC RULE</div>
      <div className={`mt-1 ${wide ? "text-sm" : "text-[11px]"}`} style={{ ...mono, color: MUTE }}>{t.best(minMoves ?? "–")}</div>
    </div>
  );
  const counter = (
    <div className={land ? "mt-4" : "text-right"}>
      <div className={`${wide ? "text-5xl" : "text-3xl"} leading-none`} data-moves style={{ ...mono, color: cleared ? ACCENT : INK }}>{used}</div>
      <div className={`${wide ? "mt-1 text-[11px]" : "text-[9px]"} tracking-[0.24em]`} style={{ ...mono, color: MUTE }}>MOVES</div>
    </div>
  );
  const menuBtn = <MenuButton items={menu} note={menuNote} large={wide} />;
  /* the guide under the drop button: how to turn, and what the grey cells are */
  const guide = (cls) => (
    <div className={cls} style={{ ...mono, color: MUTE, pointerEvents: "none" }}>
      {t.guide.map((g, i) => <span key={g} className={land ? "block" : ""}>{i && !land ? t.guideSep : ""}{g}</span>)}
    </div>
  );

  if (land) {
    return (
      <div className="absolute inset-0 flex justify-between p-3" style={{ pointerEvents: "none" }}>
        <div className="flex flex-col gap-3" style={{ width: 96 }}>
          {menuBtn}
          <div>{title}{counter}</div>
        </div>
        <div className="flex flex-col justify-end gap-2" style={{ width: 96, pointerEvents: "auto" }}>
          {undoBtn}{dropBtn}
          {guide("text-center text-[9px] leading-snug")}
        </div>
      </div>
    );
  }

  return (
    <div className={`absolute inset-0 flex flex-col justify-between ${wide ? "p-5" : "p-3"}`} style={{ pointerEvents: "none" }}>
      <div className="flex items-start justify-between">
        <div className={`flex items-start ${wide ? "gap-4" : "gap-3"}`}>{menuBtn}{title}</div>
        {counter}
      </div>
      {/* phones keep the buttons on the bottom edge, with room at the end of
          the row for the BGM pill, and the guide above them */}
      <div className="mx-auto w-full" style={{ maxWidth: 520 }}>
        {!wide && guide("mb-2 text-center text-[10px]")}
        <div className="flex gap-2" style={{ pointerEvents: "auto", marginRight: wide ? 0 : reserveRight }}>
          <div style={{ width: 92 }} className="flex flex-col">{undoBtn}</div>
          <div className="flex-1 flex flex-col">{dropBtn}</div>
        </div>
        {wide && guide("mt-2 text-center text-[10px]")}
      </div>
    </div>
  );
}
