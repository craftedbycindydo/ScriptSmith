import { useMemo } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartOptions,
} from 'chart.js';
import { useTheme } from '@/contexts/ThemeContext';

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
);

/**
 * Categorical series colors — the validated default palette from the data-viz
 * method. The slot ORDER is the colorblind-safety mechanism: assign in sequence,
 * never cycle, never generate a 9th. Verified against this app's own surfaces
 * (#ffffff light / #191919 dark) with scripts/validate_palette.js:
 * all checks pass in both modes; worst adjacent CVD ΔE 9.1 light / 8.4 dark.
 *
 * These stay fixed across the app's 10 UI palettes so a series keeps its identity
 * when the user reskins the shell — only the chrome below follows the theme.
 */
const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'];

/** Sequential blue ramp (magnitude): light → dark. */
const SEQUENTIAL_LIGHT = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#2a78d6', '#256abf'];
const SEQUENTIAL_DARK = ['#184f95', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#86b6ef'];

/** Status — reserved meaning, never reused as "series N". Always with icon/label. */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
};

export interface ChartTheme {
  /** Changes whenever mode or palette changes — use as a React key to repaint. */
  key: string;
  dark: boolean;
  ink: string;
  muted: string;
  grid: string;
  surface: string;
  series: string[];
  sequential: string[];
  /** De-emphasis gray for the "one series matters, rest are context" form. */
  context: string;
  font: string;
}

const readVar = (styles: CSSStyleDeclaration, name: string, fallback: string) =>
  styles.getPropertyValue(name).trim() || fallback;

/**
 * Chart chrome follows the app's live design tokens, so charts sit correctly on
 * whichever palette/backdrop the user picked. Canvas can't read CSS variables,
 * so we resolve them to concrete values here and repaint via `theme.key`.
 */
export function useChartTheme(): ChartTheme {
  const { resolvedTheme, palette } = useTheme();

  return useMemo(() => {
    const styles = getComputedStyle(document.documentElement);
    const dark = resolvedTheme === 'dark';

    return {
      key: `${palette}-${resolvedTheme}`,
      dark,
      ink: readVar(styles, '--color-foreground', dark ? '#ffffff' : '#0b0b0b'),
      muted: readVar(styles, '--color-muted-foreground', '#898781'),
      grid: readVar(styles, '--color-border', dark ? '#2c2c2a' : '#e1e0d9'),
      surface: readVar(styles, '--color-card', dark ? '#191919' : '#ffffff'),
      series: dark ? SERIES_DARK : SERIES_LIGHT,
      sequential: dark ? SEQUENTIAL_DARK : SEQUENTIAL_LIGHT,
      context: dark ? 'rgba(255,255,255,0.14)' : 'rgba(11,11,11,0.10)',
      font: readVar(styles, '--font-body-d', 'system-ui, sans-serif'),
    };
  }, [resolvedTheme, palette]);
}

/**
 * Shared chart chrome: recessive solid hairline grid (never dashed), no chart
 * junk, tooltips styled to the app surface. Legends are opt-in — a single series
 * needs none because the card title names it.
 */
export function baseOptions<T extends 'bar' | 'line'>(theme: ChartTheme): ChartOptions<T> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 260 },
    interaction: { mode: 'nearest', intersect: false, axis: 'xy' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: theme.surface,
        titleColor: theme.ink,
        bodyColor: theme.muted,
        borderColor: theme.grid,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 6,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        boxPadding: 4,
        titleFont: { family: theme.font, size: 12, weight: 600 },
        bodyFont: { family: theme.font, size: 12 },
      },
    },
  } as ChartOptions<T>;
}

/** Axis styling: hairline grid on the value axis only, no border, muted ticks. */
export function axis(theme: ChartTheme, opts: { grid?: boolean; max?: number } = {}) {
  return {
    grid: {
      display: opts.grid ?? false,
      color: theme.grid,
      drawTicks: false,
      // Solid hairline — dashed gridlines read as "threshold" and add noise.
      lineWidth: 1,
    },
    border: { display: false },
    ticks: {
      color: theme.muted,
      font: { family: theme.font, size: 11 },
      padding: 6,
    },
    ...(opts.max !== undefined ? { suggestedMax: opts.max } : {}),
  };
}
