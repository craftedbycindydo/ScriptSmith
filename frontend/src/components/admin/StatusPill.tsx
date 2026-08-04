import type { ReactNode } from 'react';

type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/** Generic pill; per-design styling comes from the .status-pill class. */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="status-pill" data-tone={tone}>
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  success: 'success',
  connected: 'success',
  error: 'error',
  active: 'info',
  disconnected: 'neutral',
};

/** Maps an activity/execution status string to a toned pill. */
export function StatusPill({ status }: { status?: string }) {
  if (!status) return null;
  const tone = STATUS_TONES[status] ?? 'neutral';
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <Pill tone={tone}>{label}</Pill>;
}
