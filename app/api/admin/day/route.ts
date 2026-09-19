import { NextResponse } from 'next/server';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withStaff } from '@/lib/api';
import { dayWindow, expireStaleHolds } from '@/lib/availability';
import { getSettings } from '@/lib/settings';
import { phDateString } from '@/lib/time';

export const dynamic = 'force-dynamic';

const REVENUE_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.CHECKED_IN,
  BookingStatus.COMPLETED,
];

/** Everything the Today screen needs, in one round trip. */
export async function GET(req: Request) {
  return withStaff(async () => {
    const date = new URL(req.url).searchParams.get('date') || phDateString();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Bad date.' }, { status: 400 });
    }

    await expireStaleHolds();
    const s = await getSettings();
    const { start, end } = dayWindow(date, s);

    const [rooms, bookings, blocks, pendingCount] = await Promise.all([
      prisma.room.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
      prisma.booking.findMany({
        where: { startTime: { lt: end }, endTime: { gt: start } },
        orderBy: { startTime: 'asc' },
        include: {
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, status: true, method: true, referenceNumber: true },
          },
        },
      }),
      prisma.roomBlock.findMany({
        where: { startTime: { lt: end }, endTime: { gt: start } },
        orderBy: { startTime: 'asc' },
      }),
      prisma.payment.count({ where: { status: PaymentStatus.SUBMITTED } }),
    ]);

    const revenue = bookings
      .filter((b) => REVENUE_STATUSES.includes(b.status))
      .reduce((sum, b) => sum + b.totalAmount, 0);

    return NextResponse.json({
      date,
      opens: start.toISOString(),
      closes: end.toISOString(),
      settings: s,
      pendingCount,
      revenue,
      rooms: rooms.map((r) => ({ id: r.id, name: r.name, color: r.color })),
      bookings: bookings.map((b) => ({
        id: b.id,
        reference: b.reference,
        roomId: b.roomId,
        customerName: b.customerName,
        mobile: b.mobile,
        email: b.email,
        guestCount: b.guestCount,
        start: b.startTime.toISOString(),
        end: b.endTime.toISOString(),
        hourlyRate: b.hourlyRate,
        totalAmount: b.totalAmount,
        status: b.status,
        source: b.source,
        notes: b.notes,
        payment: b.payments[0] ?? null,
      })),
      blocks: blocks.map((b) => ({
        id: b.id,
        roomId: b.roomId,
        start: b.startTime.toISOString(),
        end: b.endTime.toISOString(),
        reason: b.reason,
        note: b.note,
      })),
    });
  });
}
