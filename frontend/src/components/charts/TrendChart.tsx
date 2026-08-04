import { Line } from 'react-chartjs-2';
import type { TooltipItem } from 'chart.js';
import { useChartTheme, baseOptions, axis } from '@/lib/chartTheme';

export interface TrendSeries {
  label: string;
  points: number[];
  /** Series colour slot — identity follows the entity, not its rank. */
  slot?: number;
}

interface TrendChartProps {
  labels: string[];
  series: TrendSeries[];
  height?: number;
  unit?: string;
}

const withAlpha = (hex: string, alpha: number) => {
  const v = hex.replace('#', '');
  const n = parseInt(v.length === 3 ? v.replace(/./g, '$&$&') : v, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/**
 * Trend over time. A single series gets a soft area fill (and no legend — the
 * card title names it); multiple series stay as lines with a legend so identity
 * is never colour-alone.
 */
export default function TrendChart({ labels, series, height = 220, unit = '' }: TrendChartProps) {
  const theme = useChartTheme();
  const single = series.length === 1;
  const base = baseOptions<'line'>(theme);

  return (
    <div style={{ height }}>
      <Line
        key={theme.key}
        data={{
          labels,
          datasets: series.map((s, i) => {
            const color = theme.series[(s.slot ?? i) % theme.series.length];
            return {
              label: s.label,
              data: s.points,
              borderColor: color,
              backgroundColor: single ? withAlpha(color, theme.dark ? 0.18 : 0.12) : color,
              fill: single,
              borderWidth: 2,
              tension: 0.35,
              pointRadius: 0,
              pointHoverRadius: 5,
              pointHoverBorderWidth: 2,
              pointHoverBorderColor: theme.surface,
              pointBackgroundColor: color,
            };
          }),
        }}
        options={{
          ...base,
          scales: {
            x: { ...axis(theme, { grid: false }) },
            y: { ...axis(theme, { grid: true }), beginAtZero: true },
          },
          plugins: {
            ...base.plugins,
            legend: single
              ? { display: false }
              : {
                  display: true,
                  position: 'bottom' as const,
                  align: 'start' as const,
                  labels: {
                    color: theme.muted,
                    font: { family: theme.font, size: 11 },
                    boxWidth: 8,
                    boxHeight: 8,
                    usePointStyle: true,
                    pointStyle: 'circle' as const,
                    padding: 14,
                  },
                },
            tooltip: {
              ...base.plugins?.tooltip,
              callbacks: {
                label: (ctx: TooltipItem<'line'>) =>
                  `${ctx.dataset.label}: ${ctx.parsed.y ?? 0}${unit}`,
              },
            },
          },
        }}
      />
    </div>
  );
}
