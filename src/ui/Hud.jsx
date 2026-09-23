import { mono, INK, MUTE, RULE, ACCENT } from "./theme.js";

/* everything the player needs sits on top of the cube: the counters read
   as labels, the two buttons are the only things that take pointer events
   so dragging still works everywhere else. */
export function Hud({ portrait, minMoves, used, cleared, status, canDrop, hint, onDrop, onUndo, canUndo }) {
  const undoBtn = (
    <button onClick={onUndo} disabled={!canUndo} className="py-3 px-3 text-xs"
      style={{
        ...mono,
        border: `1px solid ${canUndo ? RULE : "rgba(185,196,204,0.5)"}`,
        background: canUndo ? "rgba(245,248,250,0.82)" : "transparent",
        color: canUndo ? INK : RULE,
        backdropFilter: "blur(2px)",
      }}>1手戻す</button>
  );
  const dropBtn = (
    <button onClick={onDrop} disabled={!canDrop} className="py-3 text-sm tracking-[0.3em]"
      style={{
        ...mono,
        border: `1px solid ${canDrop ? ACCENT : "rgba(185,196,204,0.5)"}`,
        background: canDrop ? (hint ? "rgba(200,16,46,0.14)" : ACCENT) : "rgba(245,248,250,0.5)",
        color: canDrop ? (hint ? ACCENT : "#fff") : RULE,
        boxShadow: hint && canDrop ? "0 0 0 3px rgba(200,16,46,0.25)" : "none",
        backdropFilter: "blur(2px)",
      }}>落とす</button>
  );
  const counters = (
    <div className={portrait ? "flex items-start justify-between" : ""}>
      <div>
        <div className="text-[9px] tracking-[0.3em]" style={{ ...mono, color: MUTE }}>CUBIC RULE</div>
        <div className="mt-1 text-[11px]" style={{ ...mono, color: MUTE }}>最短 {minMoves ?? "–"} 手</div>
      </div>
      <div className={portrait ? "text-right" : "mt-4"}>
        <div className="text-3xl leading-none" style={{ ...mono, color: cleared ? ACCENT : INK }}>{used}</div>
        <div className="text-[9px] tracking-[0.24em]" style={{ ...mono, color: MUTE }}>MOVES</div>
      </div>
    </div>
  );

  if (!portrait) {
    return (
      <div className="absolute inset-0 flex justify-between p-3" style={{ pointerEvents: "none" }}>
        <div style={{ width: 96 }}>{counters}</div>
        <div className="flex flex-col justify-end gap-2" style={{ width: 96, pointerEvents: "auto" }}>
          <div className="mb-1 text-center text-[10px] leading-tight" style={{ ...mono, color: cleared ? ACCENT : MUTE, pointerEvents: "none" }}>{status}</div>
          {undoBtn}{dropBtn}
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex flex-col justify-between p-3" style={{ pointerEvents: "none" }}>
      {counters}
      <div>
        <div className="mb-2 text-center text-[11px]" style={{ ...mono, color: cleared ? ACCENT : MUTE }}>{status}</div>
        <div className="flex gap-2" style={{ pointerEvents: "auto" }}>
          <div style={{ width: 92 }} className="flex flex-col">{undoBtn}</div>
          <div className="flex-1 flex flex-col">{dropBtn}</div>
        </div>
      </div>
    </div>
  );
}
