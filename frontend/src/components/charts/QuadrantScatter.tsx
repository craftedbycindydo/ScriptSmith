import { Bubble } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  BubbleController,
  LinearScale,
  PointElement,
  Tooltip,
  type ActiveElement,
  type Chart as ChartType,
  type ChartEvent,
  type ChartOptions,
  type Plugin,
  type TooltipItem,
} from 'chart.js';
import { useChartTheme, baseOptions, axis, STATUS } from '@/lib/chartTheme';

ChartJS.register(BubbleController, LinearScale, PointElement, Tooltip);

export interface QuadrantPoint {
  id: number | string;
  label: string;
  x: number;
  y: number;
  size?: number;
}

type Quadrant = 'topRight' | 'topLeft' | 'bottomLeft' | 'bottomRight';

interface QuadrantScatterProps {
  points: QuadrantPoint[];
  /** Clamp axes to the measure's real range, e.g. runs can't be negative. */
  xClamp?: { min?: number; max?: number };
  yClamp?: { min?: number; max?: number };
  xLabel: string;
  yLabel: string;
  /** Corner labels, clockwise from top-right. */
  quadrantLabels?: { topRight: string; topLeft: string; bottomLeft: string; bottomRight: string };
  /** Which quadrant to tint + label points in. */
  concernQuadrant?: Quadrant;
  onSelect?: (id: number | string) => void;
  selectedId?: number | string | null;
  height?: number;
}

/** Chart.js only styles the tooltip generically, so borrow the shared chrome. */
type BubbleTooltip = NonNullable<NonNullable<ChartOptions<'bubble'>['plugins']>['tooltip']>;

/**
 * Median, not mean: the split lines define "typical", and a handful of extreme
 * students would drag a mean far enough that the crosshair stops describing the
 * cohort at all.
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** A readable tick step (1/2/5 × 10ⁿ) so axes end on round numbers. */
function niceStep(range: number): number {
  if (range <= 0) return 1;
  const raw = range / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalised = raw / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Bounds from the data with breathing room - NOT a forced 0-100. A cohort
 * clustered between 60 and 90 should fill the plot rather than sit in the top
 * third of an empty rectangle. `clamp` keeps the padded range inside what the
 * measure can actually be.
 */
function bounds(
  values: number[],
  clamp: { min?: number; max?: number } = {}
): { min: number; max: number } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  const pad = span > 0 ? span * 0.08 : Math.max(Math.abs(hi) * 0.08, 1);

  // Snap to a round step: raw padding produces axes like -10.4 … 261.4, and a
  // negative "code runs" tick is not a real quantity.
  const step = niceStep(hi + pad - (lo - pad));
  let min = Math.floor((lo - pad) / step) * step;
  let max = Math.ceil((hi + pad) / step) * step;

  if (clamp.min !== undefined) min = Math.max(clamp.min, min);
  if (clamp.max !== undefined) max = Math.min(clamp.max, max);
  if (max <= min) max = min + step;
  return { min, max };
}

const quadrantOf = (p: QuadrantPoint, mx: number, my: number): Quadrant =>
  p.y >= my
    ? p.x >= mx
      ? 'topRight'
      : 'topLeft'
    : p.x >= mx
      ? 'bottomRight'
      : 'bottomLeft';

/**
 * Two measures per student on one plot, split at the cohort median, so "high
 * effort / low result" becomes a corner you can point at rather than a number
 * you have to work out.
 */
export default function QuadrantScatter({
  points,
  xClamp,
  yClamp,
  xLabel,
  yLabel,
  quadrantLabels,
  concernQuadrant,
  onSelect,
  selectedId,
  height = 320,
}: QuadrantScatterProps) {
  const theme = useChartTheme();

  if (points.length === 0) {
    return <div className="chart-empty">No students to plot yet.</div>;
  }

  const medianX = median(points.map((p) => p.x));
  const medianY = median(points.map((p) => p.y));
  const xBounds = bounds(points.map((p) => p.x), xClamp);
  const yBounds = bounds(points.map((p) => p.y), yClamp);

  // Chart.js `r` is raw pixels and is NOT scaled by the axes, so area encoding
  // has to be done here: sqrt keeps area (not radius) proportional to size.
  const maxSize = Math.max(...points.map((p) => p.size ?? 0), 0);
  const radiusOf = (p: QuadrantPoint) =>
    p.size === undefined || maxSize <= 0 ? 6 : 4 + 10 * Math.sqrt(p.size / maxSize);

  const quads = points.map((p) => quadrantOf(p, medianX, medianY));
  const isConcern = (i: number) => concernQuadrant !== undefined && quads[i] === concernQuadrant;
  const isSelected = (i: number) => selectedId != null && points[i].id === selectedId;

  const data = points.map((p, i) => ({
    x: p.x,
    y: p.y,
    r: radiusOf(p) + (isSelected(i) ? 3 : 0),
  }));

  /** Tint + crosshair go under the points so neither ever hides a student. */
  const backdrop: Plugin<'bubble'> = {
    id: 'quadrantBackdrop',
    beforeDatasetsDraw(chart: ChartType<'bubble'>) {
      const { ctx, chartArea: area, scales } = chart;
      if (!area) return;
      const cx = scales.x.getPixelForValue(medianX);
      const cy = scales.y.getPixelForValue(medianY);

      ctx.save();

      if (concernQuadrant) {
        const left = concernQuadrant === 'topLeft' || concernQuadrant === 'bottomLeft';
        const top = concernQuadrant === 'topLeft' || concernQuadrant === 'topRight';
        const x0 = left ? area.left : cx;
        const y0 = top ? area.top : cy;
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = theme.context;
        ctx.fillRect(x0, y0, left ? cx - area.left : area.right - cx, top ? cy - area.top : area.bottom - cy);
        ctx.globalAlpha = 1;
      }

      ctx.strokeStyle = theme.grid;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, area.top);
      ctx.lineTo(cx, area.bottom);
      ctx.moveTo(area.left, cy);
      ctx.lineTo(area.right, cy);
      ctx.stroke();
      ctx.setLineDash([]);

      if (quadrantLabels) {
        ctx.font = `600 10px ${theme.font}`;
        const inset = 8;

        // A chip behind each corner label: without it a bubble parked in the
        // corner sits on top of the text and both become unreadable.
        const chip = (text: string, alignRight: boolean, atBottom: boolean) => {
          const label = text.toUpperCase();
          const w = ctx.measureText(label).width;
          const padX = 5;
          const padY = 3;
          const x = alignRight ? area.right - inset - w : area.left + inset;
          const y = atBottom ? area.bottom - inset - 10 : area.top + inset;
          ctx.fillStyle = theme.surface;
          ctx.globalAlpha = 0.82;
          ctx.beginPath();
          ctx.roundRect(x - padX, y - padY, w + padX * 2, 10 + padY * 2, 3);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = theme.muted;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(label, x, y);
        };

        chip(quadrantLabels.topLeft, false, false);
        chip(quadrantLabels.topRight, true, false);
        chip(quadrantLabels.bottomLeft, false, true);
        chip(quadrantLabels.bottomRight, true, true);
      }

      ctx.restore();
    },
  };

  /**
   * Label only the concern quadrant, capped at 5, worst-first — labelling every
   * point turns the plot into a word cloud. Drawn boxes are kept so a label that
   * would overlap an already-drawn one is dropped rather than smeared over it.
   */
  const pointLabels: Plugin<'bubble'> = {
    id: 'quadrantPointLabels',
    afterDatasetsDraw(chart: ChartType<'bubble'>) {
      if (!concernQuadrant) return;
      const { ctx, chartArea: area, scales } = chart;
      if (!area) return;
      const els = chart.getDatasetMeta(0).data;
      const cx = scales.x.getPixelForValue(medianX);
      const cy = scales.y.getPixelForValue(medianY);

      const ranked = points
        .map((p, i) => ({ p, i }))
        .filter(({ i }) => isConcern(i) && els[i])
        .map(({ p, i }) => {
          const el = els[i];
          return { p, i, px: el.x, py: el.y, dist: Math.hypot(el.x - cx, el.y - cy) };
        })
        .sort((a, b) => b.dist - a.dist)
        .slice(0, 5);

      ctx.save();
      ctx.font = `11px ${theme.font}`;
      ctx.fillStyle = theme.ink;
      ctx.textBaseline = 'middle';

      const drawn: { x1: number; y1: number; x2: number; y2: number }[] = [];
      for (const { p, i, px, py } of ranked) {
        const w = ctx.measureText(p.label).width;
        const gap = data[i].r + 6;
        const toLeft = px + gap + w > area.right;
        const x1 = toLeft ? px - gap - w : px + gap;
        // Pad the hit box horizontally: boxes that merely abut still read as one
        // smeared string (the "2028BenTruongkfn5262" failure).
        const box = { x1: x1 - 6, y1: py - 9, x2: x1 + w + 6, y2: py + 9 };
        if (drawn.some((d) => box.x1 < d.x2 && box.x2 > d.x1 && box.y1 < d.y2 && box.y2 > d.y1)) {
          continue;
        }
        drawn.push(box);
        ctx.fillStyle = theme.surface;
        ctx.globalAlpha = 0.82;
        ctx.beginPath();
        ctx.roundRect(x1 - 4, py - 8, w + 8, 16, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = theme.ink;
        ctx.textAlign = 'left';
        ctx.fillText(p.label, x1, py);
      }
      ctx.restore();
    },
  };

  const base = baseOptions<'bar'>(theme);
  const baseTooltip = base.plugins?.tooltip as unknown as BubbleTooltip;
  const axisTitle = {
    display: true,
    color: theme.muted,
    font: { family: theme.font, size: 11 },
  };

  return (
    <div className="quadrant-scatter" style={{ height }}>
      <Bubble
        key={theme.key}
        data={{
          datasets: [
            {
              label: yLabel,
              data,
              backgroundColor: points.map((_, i) =>
                isConcern(i) ? STATUS.critical : theme.series[0]
              ),
              borderColor: points.map((_, i) => (isSelected(i) ? theme.surface : 'transparent')),
              borderWidth: points.map((_, i) => (isSelected(i) ? 2 : 0)),
            },
          ],
        }}
        plugins={[backdrop, pointLabels]}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: base.animation as ChartOptions<'bubble'>['animation'],
          onClick: (_event: ChartEvent, elements: ActiveElement[]) => {
            const hit = elements[0];
            if (!hit) return;
            onSelect?.(points[hit.index].id);
          },
          scales: {
            x: {
              ...axis(theme, { grid: false }),
              min: xBounds.min,
              max: xBounds.max,
              title: { ...axisTitle, text: xLabel },
            },
            y: {
              ...axis(theme, { grid: true }),
              min: yBounds.min,
              max: yBounds.max,
              title: { ...axisTitle, text: yLabel },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              ...baseTooltip,
              callbacks: {
                title: () => '',
                label: (item: TooltipItem<'bubble'>) => {
                  const p = points[item.dataIndex];
                  return [p.label, `${xLabel}: ${p.x}`, `${yLabel}: ${p.y}`];
                },
              },
            },
          },
        }}
      />
    </div>
  );
}
