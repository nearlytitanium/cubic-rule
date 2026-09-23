import { mono, INK, MUTE, RULE } from "./theme.js";
import { useI18n } from "../i18n.jsx";

/* the box holding the DiscoFunc player. Its ▶ is the BGM on/off (and on
   some browsers the only way to unlock sound), so it stays visible on
   every screen. It is styled like the other HUD buttons — square, light,
   hairline border — and shows only the player's button: the player's
   formula text is white, made for dark pages, while its button carries
   its own dark backdrop and reads fine here. Beside it, the "BGM" label
   with a link under it that opens the track itself in DiscoFunc's editor.
   It sits in a bottom corner: on wide screens beside the centred
   controls, on phones at the end of the controls row (the HUD leaves
   that space, see BGM_SLOT), and sideways under the left column. */
export const BGM_SLOT = 136;
const HEIGHT = 46;
const PLACE = {
  wide: { bottom: 20, right: 20 },
  phone: { bottom: 12, right: 12 },
  land: { bottom: 12, left: 12 },
};

export function BgmBar({ mountRef, layout, available, trackUrl }) {
  const { t } = useI18n();
  return (
    <div className="fixed z-[60] flex items-center overflow-hidden"
      style={{
        ...PLACE[layout], height: HEIGHT, paddingLeft: 12,
        border: `1px solid ${RULE}`, background: "rgba(245,248,250,0.82)", backdropFilter: "blur(2px)",
        display: available ? "flex" : "none",
      }}>
      <div className="flex flex-col leading-none">
        <span className="text-[10px] tracking-[0.24em]" style={{ ...mono, color: MUTE }}>BGM</span>
        <a href={trackUrl} target="_blank" rel="noopener noreferrer" title={t.openTrack} aria-label={t.openTrack}
          className="mt-0.5 flex items-center text-[9px] tracking-[0.06em] hover:underline" style={{ ...mono, color: INK }}>
          DiscoFunc<span aria-hidden="true" className="ml-1" style={{ color: MUTE }}>↗</span>
        </a>
      </div>
      {/* the player's own padding is cropped so only its button shows */}
      <div ref={mountRef} className="overflow-hidden" style={{ width: 52, height: HEIGHT - 2, marginLeft: -4 }} />
    </div>
  );
}
