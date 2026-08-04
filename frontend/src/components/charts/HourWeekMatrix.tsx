export interface HourWeekCell {
  /** Postgres convention: 0 = Sunday … 6 = Saturday. */
  dow: number;
  hour: number;
  runs: number;
}

interface HourWeekMatrixProps {
  data: HourWeekCell[];
  height?: number;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/**
 * Intensity on a sqrt ramp with an 8% floor: activity is heavily skewed toward a
 * few peak hours, and a linear ramp would render every quiet hour as an
 * indistinguishable blank.
 */
const shade = (runs: number, max: number) =>
  runs <= 0
    ? 'color-mix(in srgb, var(--color-muted) 45%, transparent)'
    : `color-mix(in srgb, var(--color-primary) ${8 + 92 * Math.sqrt(runs / max)}%, transparent)`;

/**
 * DOM grid rather than canvas — 168 cells is cheap as elements, and native
 * `title` tooltips plus real hit targets come for free.
 */
export default function HourWeekMatrix({ data, height = 200 }: HourWeekMatrixProps) {
  if (data.length === 0) {
    return <div className="chart-empty">No activity recorded yet.</div>;
  }

  const byCell = new Map<string, number>();
  data.forEach((d) => byCell.set(`${d.dow}-${d.hour}`, d.runs));
  const max = Math.max(...data.map((d) => d.runs), 1);

  return (
    <div className="hour-matrix">
      <div className="hour-matrix-grid" style={{ height }}>
        {DAYS.map((day, dow) => (
          <div className="hour-matrix-row" key={day}>
            <span className="hour-matrix-daylabel">{day}</span>
            {HOURS.map((hour) => {
              const runs = byCell.get(`${dow}-${hour}`) ?? 0;
              return (
                <span
                  className="hour-matrix-cell"
                  key={hour}
                  style={{ background: shade(runs, max) }}
                  title={`${day} ${String(hour).padStart(2, '0')}:00 · ${runs.toLocaleString()} runs`}
                />
              );
            })}
          </div>
        ))}

        <div className="hour-matrix-row hour-matrix-hours">
          <span className="hour-matrix-daylabel" />
          {HOURS.map((hour) => (
            // Every third hour only — 24 labels in this width collide.
            <span className="hour-matrix-hourlabel" key={hour}>
              {hour % 3 === 0 ? hour : ''}
            </span>
          ))}
        </div>
      </div>

      <div className="hour-matrix-legend">
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((step) => (
          <span
            className="hour-matrix-legend-swatch"
            key={step}
            style={{ background: shade(step * max, max) }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
