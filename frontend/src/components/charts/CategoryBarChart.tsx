import { Bar } from 'react-chartjs-2';
import type { Chart as ChartType, Plugin, TooltipItem } from 'chart.js';
import { useChartTheme, baseOptions, axis } from '@/lib/chartTheme';

export interface CategoryDatum {
  label: string;
  value: number;
  /** Optional secondary text for the tooltip, e.g. "23/25 runs". */
  detail?: string;
}

interface CategoryBarChartProps {
  data: CategoryDatum[];
  /** Appended to values in labels and tooltips. */
  unit?: string;
  /** Fix the value axis (e.g. 100 for percentages). */
  max?: number;
  /** Series colour slot. Nominal categories all share one colour by design. */
  slot?: number;
  /** Emphasis form: highlight this label, recede the rest. */
  emphasize?: string;
}

/** Draws the value at each bar's end — direct labels instead of a value axis. */
const valueLabels = (color: string, font: string, unit: string): Plugin<'bar'> => ({
  id: 'valueLabels',
  afterDatasetsDraw(chart: ChartType<'bar'>) {
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.font = `600 11px ${font}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    meta.data.forEach((bar, i) => {
      const raw = chart.data.datasets[0].data[i];
      if (typeof raw !== 'number') return;
      const { x, y } = bar.getProps(['x', 'y'], true);
      ctx.fillText(`${Math.round(raw)}${unit}`, x + 8, y);
    });
    ctx.restore();
  },
});

/**
 * Horizontal bars for nominal categories (languages, students, endpoints).
 * Horizontal because category names read left-to-right and the layout degrades
 * gracefully from one bar to many — where a vertical bar chart with one
 * category renders a single absurd slab.
 *
 * One measure over nominal categories = ONE colour for every bar; colouring
 * bars by their own value would re-encode what bar length already shows.
 */
export default function CategoryBarChart({
  data,
  unit = '',
  max,
  slot = 0,
  emphasize,
}: CategoryBarChartProps) {
  const theme = useChartTheme();
  const accent = theme.series[slot % theme.series.length];

  const colors = emphasize
    ? data.map((d) => (d.label === emphasize ? accent : theme.context))
    : accent;

  // Grow with content so the labels are never clipped by a fixed height.
  const height = Math.max(88, data.length * 38 + 16);

  const base = baseOptions<'bar'>(theme);

  return (
    <div style={{ height }}>
      <Bar
        key={theme.key}
        data={{
          labels: data.map((d) => d.label),
          datasets: [
            {
              label: 'value',
              data: data.map((d) => d.value),
              backgroundColor: colors,
              borderRadius: 4,
              borderSkipped: false,
              barThickness: 16,
              maxBarThickness: 18,
            },
          ],
        }}
        plugins={[valueLabels(theme.muted, theme.font, unit)]}
        options={{
          ...base,
          indexAxis: 'y' as const,
          layout: { padding: { right: 44 } },
          scales: {
            x: {
              ...axis(theme, { grid: false, max }),
              beginAtZero: true,
              ticks: { display: false },
            },
            y: {
              ...axis(theme, { grid: false }),
              ticks: {
                color: theme.ink,
                font: { family: theme.font, size: 12 },
                padding: 8,
              },
            },
          },
          plugins: {
            ...base.plugins,
            tooltip: {
              ...base.plugins?.tooltip,
              callbacks: {
                label: (ctx: TooltipItem<'bar'>) => {
                  const d = data[ctx.dataIndex];
                  const v = Math.round(ctx.parsed.x ?? 0);
                  return d?.detail ? `${v}${unit} · ${d.detail}` : `${v}${unit}`;
                },
              },
            },
          },
        }}
      />
    </div>
  );
}
