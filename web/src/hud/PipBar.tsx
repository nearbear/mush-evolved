/** A row of `max` slots, the first `value` filled with the pip image. */
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
  /** For the 3px-wide life/morale pips. */
  thin?: boolean;
}) {
  const slots = Math.max(max, value);
  return (
    <span className={thin ? "pip-bar thin" : "pip-bar"} title={`${value} / ${max} ${label}`} aria-label={`${label}: ${value} of ${max}`}>
      <span className="pip-label">{label}</span>
      {Array.from({ length: slots }, (_, i) => (
        <i key={i} className={i < value ? "pip full" : "pip"} style={i < value ? { backgroundImage: `url(${pip})` } : undefined} />
      ))}
      <span className="sub">{value}</span>
    </span>
  );
}
