import { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from './db';
import { addMinutes, businessDayRange, ceilToQuarter } from './time';
import type { Settings } from './settings';

/** Statuses that occupy a room and must block anything overlapping. */
export const BLOCKING_STATUSES: BookingStatus[] = [
  BookingStatus.HELD,
  BookingStatus.PAYMENT_SUBMITTED,
  BookingStatus.CONFIRMED,
  BookingStatus.CHECKED_IN,
];

export type Interval = { start: Date; end: Date; label?: string; kind?: 'booking' | 'block' };

/**
 * Release holds whose payment window has passed. Called before any read or
 * write that depends on availability, so an abandoned checkout never wedges a
 * room. Cheap: indexed on (status, expiresAt).
 */
export async function expireStaleHolds(): Promise<number> {
  const res = await prisma.booking.updateMany({
    where: { status: BookingStatus.HELD, expiresAt: { lt: new Date() } },
    data: { status: BookingStatus.EXPIRED },
  });
  return res.count;
}

/** Everything that occupies the given rooms in [from, to): live bookings + manual blocks. */
export async function getBusyIntervals(
  roomIds: string[],
  from: Date,
  to: Date,
): Promise<Map<string, Interval[]>> {
  const [bookings, blocks] = await Promise.all([
    prisma.booking.findMany({
      where: {
        roomId: { in: roomIds },
        status: { in: BLOCKING_STATUSES },
        startTime: { lt: to },
        endTime: { gt: from },
      },
      select: {
        roomId: true,
        startTime: true,
        endTime: true,
        customerName: true,
        reference: true,
        status: true,
      },
      orderBy: { startTime: 'asc' },
    }),
    prisma.roomBlock.findMany({
      where: { roomId: { in: roomIds }, startTime: { lt: to }, endTime: { gt: from } },
      orderBy: { startTime: 'asc' },
    }),
  ]);

  const map = new Map<string, Interval[]>();
  for (const id of roomIds) map.set(id, []);
  for (const b of bookings) {
    map.get(b.roomId)?.push({
      start: b.startTime,
      end: b.endTime,
      label: b.customerName,
      kind: 'booking',
    });
  }
  for (const b of blocks) {
    map.get(b.roomId)?.push({ start: b.startTime, end: b.endTime, label: b.reason, kind: 'block' });
  }
  for (const list of map.values()) list.sort((a, b) => a.start.getTime() - b.start.getTime());
  return map;
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** First busy interval starting at or after `from`. */
function nextBusyStart(busy: Interval[], from: Date): Date | null {
  for (const b of busy) if (b.start >= from) return b.start;
  return null;
}

export type Slot = { start: string; durations: number[] };

/**
 * Bookable start times for one room on one business day, in 15-minute steps,
 * each with the whole-hour durations that actually fit before the next
 * reservation, block, or closing time.
 */
export function computeSlots(
  busy: Interval[],
  dayStart: Date,
  dayEnd: Date,
  now: Date,
  s: Settings,
): Slot[] {
  const first = now > dayStart ? ceilToQuarter(now) : dayStart;
  const slots: Slot[] = [];

  for (let t = new Date(first); addMinutes(t, s.minHours * 60) <= dayEnd; t = addMinutes(t, 15)) {
    if (busy.some((b) => overlaps(t, addMinutes(t, 1), b.start, b.end))) continue;

    const nextStart = nextBusyStart(busy, t);
    const ceiling = nextStart && nextStart < dayEnd ? nextStart : dayEnd;

    const durations: number[] = [];
    for (let h = s.minHours; h <= s.maxHours; h++) {
      if (addMinutes(t, h * 60) <= ceiling) durations.push(h);
    }
    if (durations.length) slots.push({ start: t.toISOString(), durations });
  }
  return slots;
}

export type RoomStatus =
  | { state: 'available'; until: string | null }
  | { state: 'occupied'; until: string }
  | { state: 'closed' };

/** Headline status for a room card ("Available now" / "Occupied until 9:00 PM"). */
export function roomStatus(busy: Interval[], dayStart: Date, dayEnd: Date, now: Date): RoomStatus {
  const ref = now > dayStart ? now : dayStart;
  if (ref >= dayEnd) return { state: 'closed' };

  const current = busy.find((b) => b.start <= ref && b.end > ref);
  if (current) return { state: 'occupied', until: current.end.toISOString() };

  const next = nextBusyStart(busy, ref);
  return { state: 'available', until: next && next < dayEnd ? next.toISOString() : null };
}

/**
 * Authoritative conflict check. Must run inside the same transaction as the
 * insert — never trust availability the browser was holding.
 */
export async function assertFree(
  tx: Prisma.TransactionClient,
  roomId: string,
  start: Date,
  end: Date,
  ignoreBookingId?: string,
): Promise<void> {
  const conflict = await tx.booking.findFirst({
    where: {
      roomId,
      id: ignoreBookingId ? { not: ignoreBookingId } : undefined,
      status: { in: BLOCKING_STATUSES },
      startTime: { lt: end },
      endTime: { gt: start },
    },
    select: { id: true },
  });
  if (conflict) throw new ConflictError('That room is no longer free for those times.');

  const blocked = await tx.roomBlock.findFirst({
    where: { roomId, startTime: { lt: end }, endTime: { gt: start } },
    select: { id: true, reason: true },
  });
  if (blocked) throw new ConflictError(`Room is blocked (${blocked.reason}) for those times.`);
}

export class ConflictError extends Error {
  status = 409;
}

/** Postgres exclusion-constraint violation (the database-level backstop). */
export function isExclusionViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === '23P01' || code === 'P2010';
}

/** Business-day window for a Manila calendar date. */
export function dayWindow(dateStr: string, s: Settings) {
  return businessDayRange(dateStr, s.openTime, s.closeTime);
}
