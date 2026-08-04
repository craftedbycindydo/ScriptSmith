import { useChartTheme } from '@/lib/chartTheme';

export interface ShareDatum {
  label: string;
  value: number;
}

interface ShareBarProps {
  data: ShareDatum[];
  /** Segments beyond this fold into "Other" — never generate a 9th hue. */
  maxSegments?: number;
  unit?: string;
}

/**
 * Part-to-whole as a single horizontal stacked bar rather than a pie: shares
 * stay comparable when values are close, and long category names have room.
 * Segments are separated by a 2px surface gap (not a border) and every segment
 * is direct-labelled in the legend, so identity never rests on colour alone.
 */
export default function ShareBar({ data, maxSegments = 6, unit = '' }: ShareBarProps) {
  const theme = useChartTheme();
  const sorted = [...data].sort((a, b) => b.value - a.value);

  const segments =
    sorted.length > maxSegments
      ? [
          ...sorted.slice(0, maxSegments - 1),
          {
            label: 'Other',
            value: sorted.slice(maxSegments - 1).reduce((sum, d) => sum + d.value, 0),
          },
        ]
      : sorted;

  const total = segments.reduce((sum, d) => sum + d.value, 0);
  if (total <= 0) return null;

  return (
    <div className="share-bar">
      <div className="share-bar-track">
        {segments.map((seg, i) => (
          <div
            key={seg.label}
            className="share-bar-segment"
            style={{
              width: `${(seg.value / total) * 100}%`,
              background:
                seg.label === 'Other' ? theme.context : theme.series[i % theme.series.length],
            }}
            title={`${seg.label}: ${seg.value}${unit}`}
          />
        ))}
      </div>
      <ul className="share-bar-legend">
        {segments.map((seg, i) => (
          <li key={seg.label}>
            <span
              className="share-bar-swatch"
              style={{
                background:
                  seg.label === 'Other' ? theme.context : theme.series[i % theme.series.length],
              }}
              aria-hidden
            />
            <span className="share-bar-name">{seg.label}</span>
            <span className="share-bar-value">
              {Math.round((seg.value / total) * 100)}%
              <span className="share-bar-count">
                {seg.value}
                {unit}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
