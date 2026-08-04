import { useChartTheme } from '@/lib/chartTheme';

export interface BarListDatum {
  label: string;
  value: number;
  /** Optional benchmark for the same row (e.g. class average) — drawn as a
   *  lighter ghost bar beneath the value bar. */
  benchmark?: number;
  /** Right-hand caption, e.g. "23/25". */
  caption?: string;
}

interface BarListProps {
  data: BarListDatum[];
  unit?: string;
  /** Scale bars against this instead of the largest value (100 for percentages). */
  max?: number;
  /** Legend name for the value bar when benchmarks are shown. */
  valueLabel?: string;
  benchmarkLabel?: string;
}

/**
 * A bar LIST, not a bar chart: every row is a full-width track with an inner
 * fill, so the card is filled whether there is one category or eight — the
 * failure mode a category bar chart has with few categories (bars pinned left,
 * dead space right) cannot happen here.
 *
 * When `benchmark` is present each row shows paired bars — the value in the
 * accent hue over a lighter ghost bar for the benchmark — which is the readable
 * form of "you vs class average" per category.
 */
export default function BarList({
  data,
  unit = '',
  max,
  valueLabel = 'You',
  benchmarkLabel = 'Class average',
}: BarListProps) {
  const theme = useChartTheme();
  const accent = theme.series[0];
  const ceiling = max ?? Math.max(...data.map((d) => Math.max(d.value, d.benchmark ?? 0)), 1);
  const paired = data.some((d) => d.benchmark !== undefined);

  return (
    <div className="bar-list">
      {paired && (
        <div className="bar-list-legend">
          <span>
            <span className="bar-list-swatch" style={{ background: accent }} aria-hidden />
            {valueLabel}
          </span>
          <span>
            <span
              className="bar-list-swatch"
              style={{ background: theme.context }}
              aria-hidden
            />
            {benchmarkLabel}
          </span>
        </div>
      )}

      {data.map((d) => (
        <div className="bar-list-row" key={d.label}>
          <div className="bar-list-head">
            <span className="bar-list-label">{d.label}</span>
            <span className="bar-list-value">
              {Math.round(d.value)}
              {unit}
              {d.caption && <span className="bar-list-caption">{d.caption}</span>}
            </span>
          </div>

          <div className="bar-list-track">
            <div
              className="bar-list-fill"
              style={{ width: `${(d.value / ceiling) * 100}%`, background: accent }}
            />
          </div>

          {d.benchmark !== undefined && (
            <div className="bar-list-track bar-list-track-ghost">
              <div
                className="bar-list-fill"
                style={{
                  width: `${(d.benchmark / ceiling) * 100}%`,
                  background: theme.context,
                }}
              />
              <span className="bar-list-ghost-value">
                {Math.round(d.benchmark)}
                {unit}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
