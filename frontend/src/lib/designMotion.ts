import type { Transition } from 'framer-motion';

/**
 * Workbench motion preset. CSS handles hovers/presses/entrances of static
 * content (see index.css); this preset is for React-driven transitions:
 * tab/content switches, side sheets, mounted panels.
 */
export interface MotionPreset {
  /** Content entering on mount / tab switch */
  enter: {
    initial: Record<string, number>;
    animate: Record<string, number>;
    exit?: Record<string, number>;
    transition: Transition;
  };
  /** Side sheet / drawer slide-in */
  sheet: {
    initial: Record<string, number | string>;
    animate: Record<string, number | string>;
    exit: Record<string, number | string>;
    transition: Transition;
  };
}

// Tactile, short ease-out rise.
export const motionPreset: MotionPreset = {
  enter: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 4 },
    transition: { duration: 0.18, ease: [0.2, 0.7, 0.3, 1] },
  },
  sheet: {
    initial: { x: '100%' },
    animate: { x: 0 },
    exit: { x: '100%' },
    transition: { duration: 0.22, ease: [0.2, 0.7, 0.3, 1] },
  },
};

export function useMotionPreset(): MotionPreset {
  return motionPreset;
}
