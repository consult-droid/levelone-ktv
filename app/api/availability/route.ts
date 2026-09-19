import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  computeSlots,
  dayWindow,
  expireStaleHolds,
  getBusyIntervals,
  roomStatus,
} from '@/lib/availability';
import { getSettings, hourlyRate } from '@/lib/settings';
import { daysBetween, phDateString } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * Availability is always recomputed here, from the database, at request time.
 * The browser gets a snapshot; it is re-verified server-side before any hold is
 * created (see POST /api/bookings).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get('date') || phDateString();
  const guests = Math.max(1, Number(url.searchParams.get('guests') || 2));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Bad date.' }, { status: 400 });
  }

  const s = await getSettings();
  const today = phDateString();
  const ahead = daysBetween(today, date);
  if (ahead < 0 || ahead > s.advanceDays) {
    return NextResponse.json(
      { error: `Bookings open from today up to ${s.advanceDays} days ahead.` },
      { status: 400 },
    );
  }

  await expireStaleHolds();

  const rooms = await prisma.room.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
  });
  const { start: dayStart, end: dayEnd } = dayWindow(date, s);
  const busyByRoom = await getBusyIntervals(
    rooms.map((r) => r.id),
    dayStart,
    dayEnd,
  );
  const now = new Date();

  return NextResponse.json({
    date,
    rate: hourlyRate(guests, s),
    minGuests: s.minGuests,
    maxGuests: s.maxGuests,
    advanceDays: s.advanceDays,
    holdMinutes: s.holdMinutes,
    opens: dayStart.toISOString(),
    closes: dayEnd.toISOString(),
    rooms: rooms.map((room) => {
      const busy = busyByRoom.get(room.id) ?? [];
      return {
        id: room.id,
        name: room.name,
        color: room.color,
        tagline: room.tagline,
        status: roomStatus(busy, dayStart, dayEnd, now),
        slots: computeSlots(busy, dayStart, dayEnd, now, s),
      };
    }),
  });
}
