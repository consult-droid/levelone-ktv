import { NextResponse } from 'next/server';
import { BookingSource, PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createBooking } from '@/lib/booking';
import { expireStaleHolds } from '@/lib/availability';
import { bad, withStaff } from '@/lib/api';

export const dynamic = 'force-dynamic';

const WalkIn = z.object({
  roomId: z.string().min(1),
  start: z.string().datetime(),
  hours: z.number().min(0.25).max(12),
  guestCount: z.number().int().min(1).max(50),
  customerName: z.string().min(1).max(80),
  mobile: z.string().max(20).optional().or(z.literal('')),
  method: z.enum(['QRPH', 'CASH', 'OTHER']),
  markPaid: z.boolean().optional(),
  notes: z.string().max(300).optional(),
});

/** Staff walk-in. Same availability engine as the public flow — no shortcuts. */
export async function POST(req: Request) {
  return withStaff(async (staff) => {
    const parsed = WalkIn.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return bad('Check the walk-in details.');
    const d = parsed.data;

    await expireStaleHolds();

    const booking = await createBooking({
      roomId: d.roomId,
      start: new Date(d.start),
      hours: d.hours,
      guestCount: d.guestCount,
      customerName: d.customerName,
      mobile: d.mobile || '',
      source: BookingSource.WALK_IN,
      method: PaymentMethod[d.method],
      markPaid: d.markPaid ?? true,
      actor: staff,
      notes: d.notes || null,
    });

    return NextResponse.json({
      ok: true,
      reference: booking.reference,
      totalAmount: booking.totalAmount,
    });
  });
}

/** Search by customer name, mobile or booking reference. */
export async function GET(req: Request) {
  return withStaff(async () => {
    const q = (new URL(req.url).searchParams.get('q') || '').trim();
    if (q.length < 2) return NextResponse.json({ bookings: [] });

    const bookings = await prisma.booking.findMany({
      where: {
        OR: [
          { reference: { contains: q, mode: 'insensitive' } },
          { customerName: { contains: q, mode: 'insensitive' } },
          { mobile: { contains: q } },
        ],
      },
      orderBy: { startTime: 'desc' },
      take: 40,
      include: { room: { select: { name: true, color: true } } },
    });

    return NextResponse.json({
      bookings: bookings.map((b) => ({
        id: b.id,
        reference: b.reference,
        customerName: b.customerName,
        mobile: b.mobile,
        guestCount: b.guestCount,
        start: b.startTime.toISOString(),
        end: b.endTime.toISOString(),
        totalAmount: b.totalAmount,
        status: b.status,
        source: b.source,
        room: b.room,
      })),
    });
  });
}
