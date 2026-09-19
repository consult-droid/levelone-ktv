/**
 * Philippine time helpers.
 *
 * Everything is stored in the database as UTC. Everything shown to a human is
 * Asia/Manila. The Philippines has had no DST since 1978 and none is planned,
 * so a fixed +08:00 offset is safe and keeps the arithmetic obvious.
 */
export const PH_OFFSET_MINUTES = 8 * 60;
export const PH_TZ = 'Asia/Manila';

const MS_MIN = 60_000;

/** "2026-09-19" + "19:15" (Manila wall clock) -> UTC Date */
export function phDateTime(dateStr: string, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const hh = String(h).padStart(2, '0');
  const mm = String(m ?? 0).padStart(2, '0');
  return new Date(`${dateStr}T${hh}:${mm}:00.000+08:00`);
}

/** Manila calendar date of an instant, as "YYYY-MM-DD" */
export function phDateString(d: Date = new Date()): string {
  const shifted = new Date(d.getTime() + PH_OFFSET_MINUTES * MS_MIN);
  return shifted.toISOString().slice(0, 10);
}

/** Manila wall-clock minutes since midnight */
export function phMinutes(d: Date): number {
  const shifted = new Date(d.getTime() + PH_OFFSET_MINUTES * MS_MIN);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * MS_MIN);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromDateStr: string, toDateStr: string): number {
  const a = Date.parse(`${fromDateStr}T00:00:00.000Z`);
  const b = Date.parse(`${toDateStr}T00:00:00.000Z`);
  return Math.round((b - a) / 86_400_000);
}

/** "19:15" -> 1155 */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * A business day runs from opening until closing, and closing may land after
 * midnight (e.g. 10:00 -> 02:00 means the day ends at 2am the next morning).
 */
export function businessDayRange(dateStr: string, open: string, close: string) {
  const start = phDateTime(dateStr, open);
  const closeMins = timeToMinutes(close);
  const openMins = timeToMinutes(open);
  const end =
    closeMins <= openMins ? phDateTime(addDays(dateStr, 1), close) : phDateTime(dateStr, close);
  return { start, end };
}

const timeFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: PH_TZ,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
const dayFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: PH_TZ,
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});
const shortDayFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: PH_TZ,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

/** 7:15 PM */
export function fmtTime(d: Date | string): string {
  return timeFmt.format(typeof d === 'string' ? new Date(d) : d).replace(/\u202f/g, ' ');
}

/** Saturday, September 19 */
export function fmtDay(d: Date | string): string {
  return dayFmt.format(typeof d === 'string' ? new Date(d) : d);
}

/** Sat, Sep 19 */
export function fmtDayShort(d: Date | string): string {
  return shortDayFmt.format(typeof d === 'string' ? new Date(d) : d);
}

export function fmtRange(start: Date | string, end: Date | string): string {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

export function fmtPeso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH')}`;
}

/** Round an instant up to the next 15-minute Manila boundary. */
export function ceilToQuarter(d: Date): Date {
  const ms = 15 * MS_MIN;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
}
