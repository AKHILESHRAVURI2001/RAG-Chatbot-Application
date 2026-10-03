import type { BusinessHoursSettings } from '../shared';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function isWithinBusinessHours(settings: BusinessHoursSettings, now: Date = new Date()): boolean {
  if (!settings.enabled) return true;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: settings.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const weekdayShort = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');

  const day = WEEKDAYS.indexOf(weekdayShort);
  if (!settings.days.includes(day)) return false;

  const minutesNow = hour * 60 + minute;
  const [openH, openM] = settings.openTime.split(':').map(Number);
  const [closeH, closeM] = settings.closeTime.split(':').map(Number);
  return minutesNow >= openH * 60 + openM && minutesNow < closeH * 60 + closeM;
}
