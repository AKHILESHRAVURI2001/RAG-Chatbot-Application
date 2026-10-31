import { describe, expect, it } from 'vitest';
import { computeWaveBarStyle, IDLE_WAVE_BAR_STYLE } from '../../src/ui/dictationWave';

describe('computeWaveBarStyle', () => {
  it('returns the idle style at zero level', () => {
    expect(computeWaveBarStyle(0, 1)).toEqual(IDLE_WAVE_BAR_STYLE);
  });

  it('grows taller and more opaque as level increases', () => {
    const quiet = computeWaveBarStyle(0.2, 1);
    const loud = computeWaveBarStyle(0.8, 1);
    expect(loud.height).toBeGreaterThan(quiet.height);
    expect(loud.opacity).toBeGreaterThan(quiet.opacity);
  });

  it('caps out at the max height/opacity once the scaled level reaches 1, never overshooting', () => {
    const atCap = computeWaveBarStyle(1, 1);
    const wayOver = computeWaveBarStyle(5, 3); // level*factor*1.4 blows way past 1 before clamping
    expect(atCap).toEqual(wayOver);
    expect(atCap.height).toBe(20);
    expect(atCap.opacity).toBe(1);
  });

  it('never drops below the idle floor for a negative level (defensive clamping)', () => {
    expect(computeWaveBarStyle(-5, 1)).toEqual(IDLE_WAVE_BAR_STYLE);
  });

  it('scales per-bar via factor, so bars do not all move in lockstep', () => {
    const level = 0.3;
    const dim = computeWaveBarStyle(level, 0.5);
    const bright = computeWaveBarStyle(level, 1.5);
    expect(bright.height).toBeGreaterThan(dim.height);
  });

  it('height stays within the documented 4–20px range for any in-range input', () => {
    for (const level of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
      for (const factor of [0.5, 1, 1.5]) {
        const { height, opacity } = computeWaveBarStyle(level, factor);
        expect(height).toBeGreaterThanOrEqual(4);
        expect(height).toBeLessThanOrEqual(20);
        expect(opacity).toBeGreaterThanOrEqual(0.55);
        expect(opacity).toBeLessThanOrEqual(1);
      }
    }
  });
});
