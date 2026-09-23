import { DIRS } from "../engine/rules.js";
import { mono, CARD, INK, MUTE, RULE, ACCENT } from "./theme.js";
import { Btn } from "./controls.jsx";

const KIND_LABEL = { reversible: "戻せる", clear: "消える", noop: "動かない", lossy: "戻せない" };

export function SolutionPanel({ solution, used, classes, seed, downDir, onAutoPlay, canAutoPlay }) {
  const next = used < solution.length ? solution[used] : null;
  return (
    <div className="mt-3 p-3" style={{ background: CARD, border: `1px solid ${RULE}` }}>
      <div className="flex flex-wrap gap-1">
        {solution.map((d, i) => (
          <span key={i} className="px-2 py-1 text-[11px]"
            style={{ ...mono, border: `1px solid ${i < used ? RULE : INK}`, color: i < used ? RULE : INK }}>
            {i + 1}. {DIRS[d].label}
          </span>
        ))}
      </div>
      <div className="mt-2 text-[11px]" style={{ ...mono, color: MUTE }}>
        いま底面は <span style={{ color: INK }}>{downDir != null ? DIRS[downDir].label : "–"}</span>
        {next != null && <> ／ 次に落とす向きは <span style={{ color: ACCENT }}>{DIRS[next].label}</span></>}
      </div>
      <div className="mt-3 text-[10px] tracking-[0.18em]" style={{ ...mono, color: MUTE }}>この局面の5手</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {classes.map((c) => (
          <span key={c.dir} className="px-2 py-1 text-[11px]" style={{
            ...mono,
            border: `1px solid ${c.kind === "reversible" ? INK : RULE}`,
            color: c.kind === "clear" ? ACCENT : c.kind === "noop" ? RULE : INK,
          }}>
            {DIRS[c.dir].label} {KIND_LABEL[c.kind]}
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Btn onClick={onAutoPlay} disabled={!canAutoPlay}>自動で解く</Btn>
        <span className="text-[10px]" style={{ ...mono, color: MUTE }}>seed {seed ?? "–"}</span>
      </div>
    </div>
  );
}
