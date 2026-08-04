import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';

interface StatTileProps {
  label: string;
  value: ReactNode;
  /** Small unit/suffix rendered next to the value (e.g. "%"). */
  unit?: string;
  /** Signed change vs a benchmark. Omit when there's nothing to compare to. */
  delta?: number;
  /** What the delta is measured against, e.g. "vs class average". */
  deltaLabel?: string;
  /** Lower values are better (error rate) — flips the delta's good/bad colour. */
  invertDelta?: boolean;
  hint?: string;
  icon?: ReactNode;
}

/**
 * The right form for a single headline number — replaces one-bar bar charts.
 * The number IS the chart, so there's no plot and no tooltip; the delta chip
 * carries an arrow + label so the meaning never rests on colour alone.
 */
export default function StatTile({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  invertDelta = false,
  hint,
  icon,
}: StatTileProps) {
  const hasDelta = delta !== undefined && Number.isFinite(delta);
  const rounded = hasDelta ? Math.round(delta! * 10) / 10 : 0;
  const tone = !hasDelta || rounded === 0 ? 'flat' : (rounded > 0) !== invertDelta ? 'good' : 'bad';
  const DeltaIcon = rounded === 0 ? Minus : rounded > 0 ? ArrowUp : ArrowDown;

  return (
    <div className="stat-tile">
      <div className="stat-tile-label">
        {icon}
        {label}
      </div>
      <div className="stat-tile-value">
        {value}
        {unit && <span className="stat-tile-unit">{unit}</span>}
      </div>
      {hasDelta && (
        <div className="stat-tile-delta" data-tone={tone}>
          <DeltaIcon className="h-3 w-3" aria-hidden />
          <span>
            {rounded > 0 ? '+' : ''}
            {rounded}
            {unit ?? ''}
          </span>
          {deltaLabel && <span className="stat-tile-delta-label">{deltaLabel}</span>}
        </div>
      )}
      {!hasDelta && hint && <div className="stat-tile-hint">{hint}</div>}
    </div>
  );
}
