// The frame pieces are vector redraws of pabar.png (CC BY-NC-SA, see Mush/ATTRIBUTION.md), in sprite pixels.
// They fill with currentColor, so the bar is tinted from CSS (`color` on .pip-bar).
import capEnd from "../../../Mush/derived/pip-bar/cap-end.svg?raw";
import capStart from "../../../Mush/derived/pip-bar/cap-start.svg?raw";
import slot from "../../../Mush/derived/pip-bar/slot.svg?raw";
import slotThin from "../../../Mush/derived/pip-bar/slot-thin.svg?raw";

const CAP_START = 3;
const FRAME_H = 11;

/** A row of `max` slots in a sideways frame, the first `value` filled with the pip image. */
export function PipBar({
  label,
  value,
  max,
  pip,
  thin = false,
}: {
  label: string;
  value: number;
  max: number;
  pip: string;
  /** For the 3px-wide life/morale pips, which use a narrower slot. */
  thin?: boolean;
}) {
  const slots = Math.max(max, value);
  const pitch = thin ? 4 : 6;
  const pipW = thin ? 3 : 5;
  const width = CAP_START + slots * pitch + 4;
  return (
    <span className={thin ? "pip-bar thin" : "pip-bar"} title={`${value} / ${max} ${label}`} aria-label={`${label}: ${value} of ${max}`}>
      <span className="pip-label">{label}</span>
      <svg className="pip-frame" viewBox={`0 0 ${width} ${FRAME_H}`} style={{ width: `calc(${width} * var(--s))` }} aria-hidden="true">
        <g dangerouslySetInnerHTML={{ __html: capStart }} />
        {Array.from({ length: slots }, (_, i) => (
          <g key={i} transform={`translate(${CAP_START + i * pitch} 0)`} dangerouslySetInnerHTML={{ __html: thin ? slotThin : slot }} />
        ))}
        <g transform={`translate(${CAP_START + slots * pitch} 0)`} dangerouslySetInnerHTML={{ __html: capEnd }} />
        {Array.from({ length: Math.min(value, slots) }, (_, i) => (
          <image key={i} href={pip} x={CAP_START + i * pitch + 1} y={3} width={pipW} height={5} />
        ))}
      </svg>
      <span className="sub">{value}</span>
    </span>
  );
}
