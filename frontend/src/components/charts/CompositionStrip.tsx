import { Bar } from 'react-chartjs-2';
import type { TooltipItem } from 'chart.js';
import { useChartTheme, baseOptions } from '@/lib/chartTheme';

export interface CompositionDatum {
  label: string;
  value: number;
}

interface CompositionStripProps {
  data: CompositionDatum[];
  /** Segments kept before the tail is folded into "Other". */
  maxSegments?: number;
  height?: number;
}

/**
 * One 100%-stacked bar: the part-to-whole read at a glance. No legend — this is
 * meant to sit beside a ranked list that already names every segment, and two
 * copies of the same identity key is noise.
 */
export default function CompositionStrip({
  data,
  maxSegments = 5,
  height = 44,
}: CompositionStripProps) {
  const theme = useChartTheme();

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (data.length === 0 || total <= 0) {
    return <div className="chart-empty">No breakdown available.</div>;
  }

  const sorted = [...data].sort((a, b) => b.value - a.value);
  const kept = sorted.slice(0, maxSegments);
  const tail = sorted.slice(maxSegments);
  const segments =
    tail.length > 0
      ? [...kept, { label: 'Other', value: tail.reduce((sum, d) => sum + d.value, 0) }]
      : kept;

  const colorAt = (i: number) =>
    tail.length > 0 && i === segments.length - 1
      ? theme.context
      : theme.series[i % theme.series.length];

  const base = baseOptions<'bar'>(theme);

  return (
    <div className="composition-strip" style={{ height }}>
      <Bar
        key={theme.key}
        data={{
          labels: [''],
          datasets: segments.map((s, i) => ({
            label: s.label,
            data: [s.value],
            backgroundColor: colorAt(i),
            // Surface-coloured border reads as a 2px gap without shrinking the bar.
            borderColor: theme.surface,
            borderWidth: 2,
            barPercentage: 1,
            categoryPercentage: 1,
          })),
        }}
        options={{
          ...base,
          indexAxis: 'y' as const,
          layout: { padding: 0 },
          scales: {
            x: { stacked: true, display: false },
            y: { stacked: true, display: false },
          },
          plugins: {
            ...base.plugins,
            tooltip: {
              ...base.plugins?.tooltip,
              callbacks: {
                title: () => '',
                label: (item: TooltipItem<'bar'>) => {
                  const value = item.parsed.x ?? 0;
                  const share = Math.round((value / total) * 100);
                  return `${item.dataset.label}: ${value.toLocaleString()} (${share}%)`;
                },
              },
            },
          },
        }}
      />
    </div>
  );
}
