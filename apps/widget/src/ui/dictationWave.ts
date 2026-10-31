export interface WaveBarStyle {
  height: number;
  opacity: number;
}

const MIN_HEIGHT = 4;
const MAX_HEIGHT = 20;
const IDLE_OPACITY = 0.55;

export const IDLE_WAVE_BAR_STYLE: WaveBarStyle = { height: MIN_HEIGHT, opacity: IDLE_OPACITY };

/**
 * Maps a 0–1 mic input level to a waveform bar's height/opacity — pulled out of
 * ChatWidgetController as a pure function so the math is unit-testable on its own, without
 * needing a full controller + DOM instance.
 *
 * `factor` scales the response per-bar (see the data-f attribute each bar renders with in
 * widgetDom.ts) so bars don't all move in perfect lockstep, giving a natural, uneven waveform
 * look rather than a single block pulsing up and down together.
 */
export function computeWaveBarStyle(level: number, factor: number): WaveBarStyle {
  const scaled = Math.min(1, Math.max(0, level) * factor * 1.4);
  return {
    height: MIN_HEIGHT + scaled * (MAX_HEIGHT - MIN_HEIGHT),
    opacity: IDLE_OPACITY + scaled * (1 - IDLE_OPACITY),
  };
}
