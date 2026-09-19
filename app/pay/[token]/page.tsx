import Image from 'next/image';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { expireStaleHolds } from '@/lib/availability';
import { fmtDay, fmtPeso, fmtRange } from '@/lib/time';
import { Logo } from '@/components/Logo';
import { PayForm } from './PayForm';

export const dynamic = 'force-dynamic';

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await expireStaleHolds();

  const booking = await prisma.booking.findUnique({
    where: { publicToken: token },
    include: { room: true },
  });
  if (!booking) notFound();

  // Already past the payment step — the status page is the right place.
  if (!['HELD', 'PAYMENT_REJECTED'].includes(booking.status)) {
    redirect(`/booking/${booking.publicToken}`);
  }

  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-16 pt-6">
      <Logo className="h-7" />

      <p className="eyebrow mt-6">Step 3 of 3</p>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Scan to pay</h1>

      <section className="card mt-5" style={{ borderColor: `${booking.room.color}66` }}>
        <p className="font-bold tracking-wide">{booking.room.name.toUpperCase()}</p>
        <p className="mt-2 text-sm text-gray-cool">{fmtDay(booking.startTime)}</p>
        <p className="text-sm text-gray-cool">{fmtRange(booking.startTime, booking.endTime)}</p>
        <p className="mt-2 text-sm">
          {booking.guestCount} guests &middot; {fmtPeso(booking.hourlyRate)}/hour
        </p>
        <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
          <span className="eyebrow">Pay exactly</span>
          <span className="text-3xl font-extrabold text-lilac">
            {fmtPeso(booking.totalAmount)}
          </span>
        </div>
      </section>

      <section className="mt-5 rounded-2xl bg-white p-4">
        <Image
          src="/qrph.jpg"
          alt="LevelOne Cafe Lucena QRPh payment code"
          width={900}
          height={1200}
          priority
          className="mx-auto h-auto w-full max-w-xs rounded-lg"
        />
      </section>

      <p className="mt-4 text-sm text-gray-cool">
        Pay <span className="font-semibold text-light">{fmtPeso(booking.totalAmount)}</span> using
        GCash, Maya, your banking app, or any QRPh-supported method. Put{' '}
        <span className="font-semibold text-light">{booking.reference}</span> in the notes if your
        app allows it.
      </p>

      <PayForm token={booking.publicToken} expiresAt={booking.expiresAt?.toISOString() ?? null} />
    </main>
  );
}
