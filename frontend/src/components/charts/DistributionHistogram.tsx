import { Bar } from 'react-chartjs-2';
import type { Chart as ChartType, Plugin, TooltipItem } from 'chart.js';
import { useChartTheme, baseOptions, axis } from '@/lib/chartTheme';

export interface HistogramBin {
  label: string;
  count: number;
}

export interface HistogramMarker {
  label: string;
  binIndex: number;
}

interface DistributionHistogramProps {
  bins: HistogramBin[];
  /** Reference lines, e.g. `{ label: 'p50 · 55ms', binIndex: 4 }`. */
  markers?: HistogramMarker[];
  height?: number;
}

/** Dashed rule at a bin's centre with its label above the plot. */
const markerLines = (
  markers: HistogramMarker[],
  lineColor: string,
  textColor: string,
  font: string
): Plugin<'bar'> => ({
  id: 'histogramMarkers',
  afterDatasetsDraw(chart: ChartType<'bar'>) {
    const { ctx, chartArea: area, scales } = chart;
    if (!area) return;
    ctx.save();
    markers.forEach((m) => {
      const x = scales.x.getPixelForValue(m.binIndex);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, area.top);
      ctx.lineTo(x, area.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = `600 10px ${font}`;
      ctx.fillStyle = textColor;
      ctx.textBaseline = 'bottom';
      // Flip the anchor near the right edge so the label is never clipped.
      const w = ctx.measureText(m.label).width;
      ctx.textAlign = x + w / 2 > area.right ? 'right' : 'center';
      ctx.fillText(m.label, x, area.top - 3);
    });
    ctx.restore();
  },
});

/**
 * Bars touch (bar/category percentage at 1.0) so the shape reads as a continuous
 * distribution — gapped bars would say "unrelated categories", which is the
 * wrong claim about binned values.
 */
export default function DistributionHistogram({
  bins,
  markers = [],
  height = 200,
}: DistributionHistogramProps) {
  const theme = useChartTheme();

  const total = bins.reduce((sum, b) => sum + b.count, 0);
  if (bins.length === 0 || total <= 0) {
    return <div className="chart-empty">No distribution to show yet.</div>;
  }

  const base = baseOptions<'bar'>(theme);

  return (
    <div className="distribution-histogram" style={{ height }}>
      <Bar
        key={theme.key}
        data={{
          labels: bins.map((b) => b.label),
          datasets: [
            {
              label: 'count',
              data: bins.map((b) => b.count),
              backgroundColor: theme.series[0],
              barPercentage: 1,
              categoryPercentage: 1,
            },
          ],
        }}
        plugins={markers.length > 0 ? [markerLines(markers, theme.muted, theme.ink, theme.font)] : []}
        options={{
          ...base,
          layout: { padding: { top: markers.length > 0 ? 16 : 0 } },
          scales: {
            x: {
              ...axis(theme, { grid: false }),
              ticks: {
                color: theme.muted,
                font: { family: theme.font, size: 10 },
                padding: 4,
                maxRotation: 0,
                minRotation: 0,
                autoSkipPadding: 8,
              },
            },
            y: {
              ...axis(theme, { grid: true }),
              beginAtZero: true,
            },
          },
          plugins: {
            ...base.plugins,
            tooltip: {
              ...base.plugins?.tooltip,
              callbacks: {
                label: (item: TooltipItem<'bar'>) => {
                  const count = item.parsed.y ?? 0;
                  return `${count.toLocaleString()} (${Math.round((count / total) * 100)}%)`;
                },
              },
            },
          },
        }}
      />
    </div>
  );
}
