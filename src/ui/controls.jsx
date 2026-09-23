import { mono, PAPER, INK, MUTE, RULE } from "./theme.js";

/* a segmented choice. An option marked `disabled` cannot be picked but
   still shows as selected when it is the value (e.g. "custom") */
export function Pick({ label, value, options, onChange }) {
  return (
    <div>
      <div className="mb-1 text-[10px] tracking-[0.18em]" style={{ ...mono, color: MUTE }}>{label}</div>
      <div className="flex" role="radiogroup" aria-label={label} style={{ border: `1px solid ${RULE}` }}>
        {options.map((o) => (
          <button key={String(o.v)} type="button" role="radio" aria-checked={value === o.v}
            disabled={o.disabled} onClick={() => onChange(o.v)} className="flex-1 py-2 text-sm"
            style={{ ...mono, background: value === o.v ? INK : "transparent", color: value === o.v ? PAPER : o.disabled ? RULE : MUTE }}>
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}
