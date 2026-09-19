import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { expireStaleHolds } from '@/lib/availability';
import { fmtDay, fmtPeso, fmtRange } from '@/lib/time';
import { Logo } from '@/components/Logo';

export const dynamic = 'force-dynamic';

const VIEW: Record<string, { title: string; note: string; tone: string }> = {
  HELD: {
    title: 'AWAITING PAYMENT',
    note: 'We have your room on hold. Submit your payment proof to keep it.',
    tone: 'text-amber-300',
  },
  PAYMENT_SUBMITTED: {
    title: 'PAYMENT RECEIVED FOR VERIFICATION',
    note: "We've received your payment details. Your KTV schedule is temporarily reserved while LevelOne verifies your payment.",
    tone: 'text-amber-300',
  },
  CONFIRMED: {
    title: 'BOOKING CONFIRMED \u2713',
    note: 'You\u2019re in. Show this page at the counter when you arrive.',
    tone: 'text-emerald-400',
  },
  CHECKED_IN: { title: 'CHECKED IN', note: 'Enjoy the room.', tone: 'text-emerald-400' },
  COMPLETED: { title: 'COMPLETED', note: 'Thanks for singing with us.', tone: 'text-gray-cool' },
  CANCELLED: { title: 'CANCELLED', note: 'This booking was cancelled.', tone: 'text-rose-400' },
  EXPIRED: {
    title: 'HOLD EXPIRED',
    note: 'Payment wasn\u2019t received in time and the slot was released.',
    tone: 'text-rose-400',
  },
  PAYMENT_REJECTED: {
    title: 'PAYMENT NEEDS ANOTHER LOOK',
    note: 'Staff couldn\u2019t match your proof of payment. You can submit it again.',
    tone: 'text-rose-400',
  },
};

export default async function BookingStatus({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await expireStaleHolds();

  const booking = await prisma.booking.findUnique({
    where: { publicToken: token },
    include: { room: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!booking) notFound();

  const view = VIEW[booking.status] ?? VIEW.HELD;
  const payment = booking.payments[0];
  const canRetry = booking.status === 'HELD' || booking.status === 'PAYMENT_REJECTED';

  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-16 pt-6">
      <Logo className="h-7" />

      <h1 className={`mt-8 text-2xl font-extrabold tracking-tight ${view.tone}`}>{view.title}</h1>
      <p className="mt-3 text-sm text-gray-cool">{view.note}</p>
      {payment?.rejectionNote && booking.status === 'PAYMENT_REJECTED' && (
        <p className="mt-2 text-sm text-rose-400">Staff note: {payment.rejectionNote}</p>
      )}

      <section className="card mt-6" style={{ borderColor: `${booking.room.color}66` }}>
        <dl className="space-y-3 text-sm">
          <Row label="Booking reference" value={booking.reference} strong />
          <Row label="Room" value={booking.room.name} />
          <Row label="Date" value={fmtDay(booking.startTime)} />
          <Row label="Time" value={fmtRange(booking.startTime, booking.endTime)} />
          <Row label="Guests" value={String(booking.guestCount)} />
          <Row label="Amount" value={fmtPeso(booking.totalAmount)} strong />
          {payment?.referenceNumber && (
            <Row label="Payment reference" value={payment.referenceNumber} />
          )}
        </dl>
      </section>

      {canRetry && (
        <Link href={`/pay/${booking.publicToken}`} className="btn-primary mt-6 w-full">
          SUBMIT PAYMENT PROOF
        </Link>
      )}

      <p className="mt-8 text-center text-xs text-gray-cool">
        Keep this link &mdash; it&rsquo;s your booking. Questions? Message LevelOne Cafe Lucena.
      </p>
    </main>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-gray-cool">{label}</dt>
      <dd className={`text-right ${strong ? 'font-bold' : ''}`}>{value}</dd>
    </div>
  );
}
