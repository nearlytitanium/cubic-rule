import { mono, PAPER, INK, MUTE, RULE, ACCENT } from "./theme.js";

export function Btn({ children, onClick, primary, disabled, glow, tall }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`text-xs ${tall ? "py-3" : "py-2"} px-2`}
      style={{
        ...mono,
        border: `1px solid ${glow || primary ? ACCENT : RULE}`,
        background: glow ? "rgba(200,16,46,0.12)" : primary ? ACCENT : "transparent",
        color: primary ? "#fff" : glow ? ACCENT : disabled ? RULE : INK,
        boxShadow: glow ? "0 0 0 2px rgba(200,16,46,0.25)" : "none",
      }}>{children}</button>
  );
}

export function Pick({ label, value, options, onChange }) {
  return (
    <div>
      <div className="mb-1 text-[10px] tracking-[0.18em]" style={{ ...mono, color: MUTE }}>{label}</div>
      <div className="flex" style={{ border: `1px solid ${RULE}` }}>
        {options.map((o) => (
          <button key={String(o.v)} onClick={() => onChange(o.v)} className="flex-1 py-1 text-xs"
            style={{ ...mono, background: value === o.v ? INK : "transparent", color: value === o.v ? PAPER : MUTE }}>
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

/* options live behind a sheet so the play screen stays bare */
export function Sheet({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(19,33,51,0.32)" }}
      onClick={onClose}>
      <div className="w-full max-w-md p-4" style={{ background: PAPER, borderTop: `2px solid ${INK}` }}
        onClick={(e) => e.stopPropagation()}>
        {children}
        <button onClick={onClose} className="mt-4 w-full py-3 text-xs tracking-[0.2em]"
          style={{ ...mono, border: `1px solid ${INK}`, background: INK, color: PAPER }}>閉じる</button>
      </div>
    </div>
  );
}
