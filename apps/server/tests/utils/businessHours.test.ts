import { describe, expect, it } from 'vitest';
import { isWithinBusinessHours } from '../../src/utils/businessHours';

const BASE = {
  enabled: true,
  timezone: 'Europe/London',
  days: [1, 2, 3, 4, 5], // Mon-Fri
  openTime: '09:00',
  closeTime: '18:00',
  closedMessage: "We're currently closed.",
};

describe('isWithinBusinessHours', () => {
  it('is always true when the feature itself is off, regardless of day/time', () => {
    const sunday = new Date('2024-01-07T03:00:00Z');
    expect(isWithinBusinessHours({ ...BASE, enabled: false }, sunday)).toBe(true);
  });

  it('is true during business hours on an open day', () => {
    const midMorning = new Date('2024-01-10T10:00:00Z');
    expect(isWithinBusinessHours(BASE, midMorning)).toBe(true);
  });

  it('is false before opening time on an open day', () => {
    const earlyMorning = new Date('2024-01-10T08:00:00Z');
    expect(isWithinBusinessHours(BASE, earlyMorning)).toBe(false);
  });

  it('is false at/after closing time on an open day', () => {
    const evening = new Date('2024-01-10T18:00:00Z');
    expect(isWithinBusinessHours(BASE, evening)).toBe(false);
  });

  it('is false on a day not listed as open, even during the configured hours', () => {
    const sundayMorning = new Date('2024-01-07T10:00:00Z');
    expect(isWithinBusinessHours(BASE, sundayMorning)).toBe(false);
  });

  it('evaluates in the configured timezone, not UTC', () => {
    const summerLateEvening = new Date('2024-07-10T22:30:00Z');
    expect(isWithinBusinessHours(BASE, summerLateEvening)).toBe(false);

    const summerMorning = new Date('2024-07-10T10:30:00Z');
    expect(isWithinBusinessHours(BASE, summerMorning)).toBe(true);
  });
});
