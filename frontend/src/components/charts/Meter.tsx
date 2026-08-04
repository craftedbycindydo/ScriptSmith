interface MeterProps {
  label: string;
  /** 0–100. */
  value: number;
  /** Optional benchmark drawn as a marker on the track (e.g. class average). */
  benchmark?: number;
  benchmarkLabel?: string;
  /** Right-hand caption, e.g. "23/25 runs". */
  caption?: string;
}

/**
 * A single ratio against a limit — the form a 2-bar "you vs average" chart
 * should have been. The value fills a same-ramp track; the benchmark is a
 * marker on that track, so the comparison is one glance instead of two bars.
 */
export default function Meter({
  label,
  value,
  benchmark,
  benchmarkLabel,
  caption,
}: MeterProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const mark = benchmark === undefined ? undefined : Math.max(0, Math.min(100, benchmark));

  return (
    <div className="meter">
      <div className="meter-head">
        <span className="meter-label">{label}</span>
        <span className="meter-value">
          {Math.round(value)}%{caption && <span className="meter-caption">{caption}</span>}
        </span>
      </div>
      <div
        className="meter-track"
        role="meter"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="meter-fill" style={{ width: `${clamped}%` }} />
        {mark !== undefined && (
          <div
            className="meter-benchmark"
            style={{ left: `${mark}%` }}
            title={`${benchmarkLabel ?? 'Benchmark'}: ${Math.round(mark)}%`}
          />
        )}
      </div>
      {mark !== undefined && benchmarkLabel && (
        <div className="meter-legend">
          <span className="meter-legend-mark" aria-hidden />
          {benchmarkLabel} {Math.round(mark)}%
        </div>
      )}
    </div>
  );
}
