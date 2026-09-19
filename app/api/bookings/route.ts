import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createBooking, ValidationError } from '@/lib/booking';
import { ConflictError, expireStaleHolds } from '@/lib/availability';
import { rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

const Body = z.object({
  roomId: z.string().min(1),
  start: z.string().datetime(),
  hours: z.number().int().min(1).max(12),
  guestCount: z.number().int().min(1).max(50),
  customerName: z.string().min(1).max(80),
  mobile: z.string().min(7).max(20),
  email: z.string().email().max(120).optional().or(z.literal('')),
});

/** Creates the temporary HELD reservation that locks the slot while they pay. */
export async function POST(req: Request) {
  if (!rateLimit(req, 'book', 12, 60_000)) {
    return NextResponse.json({ error: 'Too many attempts. Wait a minute.' }, { status: 429 });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Check the booking details.' }, { status: 400 });
  }

  await expireStaleHolds();

  try {
    const booking = await createBooking({
      roomId: body.roomId,
      start: new Date(body.start),
      hours: body.hours,
      guestCount: body.guestCount,
      customerName: body.customerName,
      mobile: body.mobile,
      email: body.email || null,
    });
    return NextResponse.json({ token: booking.publicToken, reference: booking.reference });
  } catch (err) {
    if (err instanceof ValidationError || err instanceof ConflictError) {
      return NextResponse.json({ error: err.message }, { status: (err as any).status ?? 400 });
    }
    console.error('createBooking failed', err);
    return NextResponse.json({ error: 'Could not hold that slot. Try again.' }, { status: 500 });
  }
}
