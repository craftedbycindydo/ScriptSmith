import { useState } from 'react';
import { useChartTheme, STATUS } from '@/lib/chartTheme';

export interface RankedDatum {
  label: string;
  value: number;
}

interface RankedBarListProps {
  data: RankedDatum[];
  /** Appended directly to the value, e.g. "%" or " runs". */
  unit?: string;
  /** Rows shown before the tail is folded into one expandable "Other" row. */
  topN?: number;
  tone?: 'accent' | 'critical';
  onSelect?: (label: string) => void;
}

/**
 * DOM rows rather than a canvas bar chart: every row is a full-width track, so
 * the card is filled at three categories or thirty, and the label can live
 * inside the bar where it reads without a separate axis.
 */
export default function RankedBarList({
  data,
  unit = '',
  topN = 6,
  tone = 'accent',
  onSelect,
}: RankedBarListProps) {
  const theme = useChartTheme();
  const [expanded, setExpanded] = useState(false);

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (data.length === 0 || total <= 0) {
    return <div className="chart-empty">Nothing to rank yet.</div>;
  }

  const sorted = [...data].sort((a, b) => b.value - a.value);
  const tail = sorted.slice(topN);
  const rows = expanded || tail.length === 0 ? sorted : sorted.slice(0, topN);
  const max = sorted[0].value || 1;

  const color = tone === 'critical' ? STATUS.critical : theme.series[0];
  // Tinted fill with full-opacity text over it: the bar stays a background
  // magnitude cue instead of competing with the label it sits behind.
  const fill = `color-mix(in srgb, ${color} 22%, transparent)`;

  const renderRow = (label: string, value: number, key: string) => {
    const share = Math.round((value / total) * 100);
    const body = (
      <>
        <span className="ranked-track">
          <span className="ranked-fill" style={{ width: `${(value / max) * 100}%`, background: fill }} />
          <span className="ranked-label">{label}</span>
        </span>
        <span className="ranked-value">
          {value.toLocaleString()}
          {unit}
          <span className="ranked-share">{share}%</span>
        </span>
      </>
    );

    return onSelect ? (
      <button type="button" className="ranked-row" key={key} onClick={() => onSelect(label)}>
        {body}
      </button>
    ) : (
      <div className="ranked-row" key={key}>
        {body}
      </div>
    );
  };

  return (
    <div className="ranked-list">
      {rows.map((d) => renderRow(d.label, d.value, d.label))}

      {tail.length > 0 && !expanded && (
        <button type="button" className="ranked-row" onClick={() => setExpanded(true)}>
          <span className="ranked-track">
            <span
              className="ranked-fill"
              style={{
                width: `${(tail.reduce((s, d) => s + d.value, 0) / max) * 100}%`,
                background: theme.context,
              }}
            />
            <span className="ranked-label">{`Other · ${tail.length} types`}</span>
          </span>
          <span className="ranked-value">
            {tail.reduce((s, d) => s + d.value, 0).toLocaleString()}
            {unit}
            <span className="ranked-share">
              {Math.round((tail.reduce((s, d) => s + d.value, 0) / total) * 100)}%
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
