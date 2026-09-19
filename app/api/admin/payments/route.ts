import { NextResponse } from 'next/server';
import { PaymentStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withStaff } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** The PAYMENTS TO VERIFY queue, oldest first so nobody waits. */
export async function GET() {
  return withStaff(async () => {
    const payments = await prisma.payment.findMany({
      where: { status: PaymentStatus.SUBMITTED },
      orderBy: { createdAt: 'asc' },
      include: { booking: { include: { room: true } } },
    });

    return NextResponse.json({
      payments: payments.map((p) => ({
        id: p.id,
        submittedAt: p.createdAt.toISOString(),
        amountExpected: p.amountExpected,
        referenceNumber: p.referenceNumber,
        proofMime: p.proofMime,
        hasProof: Boolean(p.proofKey || p.proofData),
        booking: {
          id: p.booking.id,
          reference: p.booking.reference,
          customerName: p.booking.customerName,
          mobile: p.booking.mobile,
          email: p.booking.email,
          guestCount: p.booking.guestCount,
          start: p.booking.startTime.toISOString(),
          end: p.booking.endTime.toISOString(),
          status: p.booking.status,
          room: { name: p.booking.room.name, color: p.booking.room.color },
        },
      })),
    });
  });
}
