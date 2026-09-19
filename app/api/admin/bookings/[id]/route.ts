import { NextResponse } from 'next/server';
import { BookingStatus } from '@prisma/client';
import { z } from 'zod';
import { extendBooking, moveBooking, setStatus } from '@/lib/booking';
import { bad, withStaff } from '@/lib/api';
import { fmtPeso, fmtTime } from '@/lib/time';

export const dynamic = 'force-dynamic';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('extend'), hours: z.number().min(0.25).max(6) }),
  z.object({
    action: z.literal('move'),
    roomId: z.string().min(1),
    start: z.string().datetime(),
    hours: z.number().min(0.25).max(12),
  }),
  z.object({
    action: z.literal('status'),
    status: z.enum(['CHECKED_IN', 'COMPLETED', 'CANCELLED', 'CONFIRMED']),
  }),
]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withStaff(async (staff) => {
    const { id } = await ctx.params;
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return bad('Unrecognised action.');
    const d = parsed.data;

    if (d.action === 'extend') {
      const { newEnd, extra } = await extendBooking(id, d.hours, staff);
      return NextResponse.json({
        ok: true,
        newEnd: newEnd.toISOString(),
        extra,
        message: `Extended to ${fmtTime(newEnd)} · ${fmtPeso(extra)} more`,
      });
    }

    if (d.action === 'move') {
      await moveBooking(id, d.roomId, new Date(d.start), d.hours, staff);
      return NextResponse.json({ ok: true });
    }

    await setStatus(id, BookingStatus[d.status], staff);
    return NextResponse.json({ ok: true });
  });
}
