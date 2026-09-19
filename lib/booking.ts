import crypto from 'node:crypto';
import { BookingSource, BookingStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { prisma } from './db';
import { assertFree, ConflictError, dayWindow, isExclusionViolation } from './availability';
import { getSettings, quote, type Settings } from './settings';
import { addMinutes, daysBetween, fmtDay, fmtPeso, fmtRange, phDateString } from './time';
import { queueEmail, staffInbox } from './email';

// No I, O, 0 or 1 — these get read aloud and written on receipts.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomCode(len: number): string {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function newReference(): string {
  return `L1-${randomCode(6)}`;
}

export function newPublicToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export class ValidationError extends Error {
  status = 400;
}

export type CreateBookingInput = {
  roomId: string;
  start: Date;
  hours: number;
  guestCount: number;
  customerName: string;
  mobile: string;
  email?: string | null;
  source?: BookingSource;
  method?: PaymentMethod;
  markPaid?: boolean; // cash walk-ins confirm immediately
  actor?: string;
  notes?: string | null;
};

/** Shared rules for both the public flow and staff walk-ins. */
export function validateWindow(start: Date, hours: number, s: Settings, source: BookingSource) {
  if (!Number.isFinite(hours) || hours < s.minHours || hours > s.maxHours) {
    throw new ValidationError(`Bookings run ${s.minHours}–${s.maxHours} hours.`);
  }
  if (start.getTime() % (15 * 60_000) !== 0) {
    throw new ValidationError('Start times move in 15-minute steps.');
  }

  const end = addMinutes(start, hours * 60);
  const now = new Date();

  if (source === BookingSource.ONLINE) {
    if (end <= now) throw new ValidationError('That time has already passed.');
    const ahead = daysBetween(phDateString(now), phDateString(start));
    if (ahead > s.advanceDays) {
      throw new ValidationError(`Bookings open up to ${s.advanceDays} days ahead.`);
    }
  }

  // The slot must sit inside one business day, which may end after midnight.
  const candidates = [phDateString(start), phDateString(addMinutes(start, -24 * 60))];
  const fits = candidates.some((d) => {
    const { start: open, end: close } = dayWindow(d, s);
    return start >= open && end <= close;
  });
  if (!fits) {
    throw new ValidationError(`That falls outside opening hours (${s.openTime}–${s.closeTime}).`);
  }
  return end;
}

export async function createBooking(input: CreateBookingInput) {
  const s = await getSettings();
  const guests = Math.trunc(input.guestCount);
  if (guests < s.minGuests || guests > s.maxGuests) {
    throw new ValidationError(`Party size runs ${s.minGuests}–${s.maxGuests} guests.`);
  }
  if (!input.customerName?.trim()) throw new ValidationError('A name is required.');

  const source = input.source ?? BookingSource.ONLINE;
  if (source === BookingSource.ONLINE && !/^[0-9+\s()-]{7,20}$/.test(input.mobile || '')) {
    throw new ValidationError('Enter a valid mobile number.');
  }

  const end = validateWindow(input.start, input.hours, s, source);
  const { hourlyRate, totalAmount } = quote(guests, input.hours, s);

  const confirmed = Boolean(input.markPaid);
  const reference = newReference();

  try {
    return await prisma.$transaction(async (tx) => {
      await assertFree(tx, input.roomId, input.start, end);

      const booking = await tx.booking.create({
        data: {
          reference,
          publicToken: newPublicToken(),
          roomId: input.roomId,
          customerName: input.customerName.trim(),
          mobile: (input.mobile || '').trim(),
          email: input.email?.trim() || null,
          guestCount: guests,
          startTime: input.start,
          endTime: end,
          hourlyRate,
          totalAmount,
          status: confirmed ? BookingStatus.CONFIRMED : BookingStatus.HELD,
          source,
          notes: input.notes || null,
          expiresAt: confirmed ? null : addMinutes(new Date(), s.holdMinutes),
        },
        include: { room: true },
      });

      if (confirmed) {
        await tx.payment.create({
          data: {
            bookingId: booking.id,
            method: input.method ?? PaymentMethod.CASH,
            amountExpected: totalAmount,
            status: PaymentStatus.APPROVED,
            verifiedBy: input.actor ?? 'staff',
            verifiedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            actor: input.actor ?? 'staff',
            action: 'WALK_IN_CONFIRMED',
            entity: 'Booking',
            entityId: booking.id,
            detail: `${booking.reference} ${fmtPeso(totalAmount)}`,
          },
        });
      }
      return booking;
    });
  } catch (err) {
    if (isExclusionViolation(err)) {
      throw new ConflictError('Someone just took that time. Pick another slot.');
    }
    throw err;
  }
}

export async function submitProof(opts: {
  bookingId: string;
  referenceNumber?: string | null;
  proofKey?: string | null;
  proofUrl?: string | null;
  proofMime?: string | null;
  proofData?: Buffer | null;
}) {
  const booking = await prisma.booking.findUnique({
    where: { id: opts.bookingId },
    include: { room: true },
  });
  if (!booking) throw new ValidationError('Booking not found.');
  if (booking.status === BookingStatus.EXPIRED) {
    throw new ConflictError('This hold expired. Start a new booking.');
  }
  if (
    booking.status !== BookingStatus.HELD &&
    booking.status !== BookingStatus.PAYMENT_REJECTED &&
    booking.status !== BookingStatus.PAYMENT_SUBMITTED
  ) {
    throw new ConflictError('This booking is not waiting for payment.');
  }

  const [, payment] = await prisma.$transaction([
    prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.PAYMENT_SUBMITTED, expiresAt: null },
    }),
    prisma.payment.create({
      data: {
        bookingId: booking.id,
        method: PaymentMethod.QRPH,
        amountExpected: booking.totalAmount,
        referenceNumber: opts.referenceNumber || null,
        proofKey: opts.proofKey || null,
        proofUrl: opts.proofUrl || null,
        proofMime: opts.proofMime || null,
        proofData: opts.proofData ? new Uint8Array(opts.proofData) : null,
        status: PaymentStatus.SUBMITTED,
      },
    }),
  ]);

  const inbox = staffInbox();
  if (inbox) {
    await queueEmail(
      inbox,
      `New KTV payment — ${booking.reference} — ${booking.room.name} — ${fmtPeso(booking.totalAmount)}`,
      [
        `Customer: ${booking.customerName}`,
        `Mobile: ${booking.mobile}`,
        `Email: ${booking.email ?? '—'}`,
        `Room: ${booking.room.name}`,
        `Date: ${fmtDay(booking.startTime)}`,
        `Time: ${fmtRange(booking.startTime, booking.endTime)}`,
        `Guests: ${booking.guestCount}`,
        `Amount due: ${fmtPeso(booking.totalAmount)}`,
        `Payment reference: ${opts.referenceNumber || '—'}`,
        `Booking reference: ${booking.reference}`,
        '',
        `Verify: ${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/admin/payments`,
      ].join('\n'),
    );
  }
  return payment;
}

export async function approvePayment(paymentId: string, actor: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { booking: { include: { room: true } } },
  });
  if (!payment) throw new ValidationError('Payment not found.');

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.APPROVED, verifiedBy: actor, verifiedAt: new Date() },
    }),
    prisma.booking.update({
      where: { id: payment.bookingId },
      data: { status: BookingStatus.CONFIRMED, expiresAt: null },
    }),
    prisma.auditLog.create({
      data: {
        actor,
        action: 'PAYMENT_APPROVED',
        entity: 'Booking',
        entityId: payment.bookingId,
        detail: `${payment.booking.reference} ${fmtPeso(payment.amountExpected)}`,
      },
    }),
  ]);

  if (payment.booking.email) {
    const b = payment.booking;
    await queueEmail(
      b.email!,
      `Booking confirmed — ${b.reference} — ${b.room.name}`,
      [
        `Your KTV room is confirmed.`,
        '',
        `${b.room.name}`,
        `${fmtDay(b.startTime)}`,
        `${fmtRange(b.startTime, b.endTime)}`,
        `${b.guestCount} guests · ${fmtPeso(b.totalAmount)}`,
        `Reference: ${b.reference}`,
        '',
        `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/booking/${b.publicToken}`,
      ].join('\n'),
    );
  }
}

export async function rejectPayment(paymentId: string, actor: string, note: string, reopen: boolean) {
  const s = await getSettings();
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { booking: true },
  });
  if (!payment) throw new ValidationError('Payment not found.');

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.REJECTED,
        verifiedBy: actor,
        verifiedAt: new Date(),
        rejectionNote: note || null,
      },
    }),
    prisma.booking.update({
      where: { id: payment.bookingId },
      data: reopen
        ? { status: BookingStatus.CANCELLED, expiresAt: null }
        : {
            status: BookingStatus.PAYMENT_REJECTED,
            expiresAt: addMinutes(new Date(), s.holdMinutes),
          },
    }),
    prisma.auditLog.create({
      data: {
        actor,
        action: reopen ? 'PAYMENT_REJECTED_SLOT_REOPENED' : 'PAYMENT_REJECTED_RESUBMIT',
        entity: 'Booking',
        entityId: payment.bookingId,
        detail: note?.slice(0, 200) || null,
      },
    }),
  ]);
}

export async function extendBooking(bookingId: string, hours: number, actor: string) {
  const s = await getSettings();
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new ValidationError('Booking not found.');

  const newEnd = addMinutes(booking.endTime, hours * 60);
  const extra = Math.round(booking.hourlyRate * hours);

  try {
    await prisma.$transaction(async (tx) => {
      await assertFree(tx, booking.roomId, booking.endTime, newEnd, booking.id);

      // The extension must still land inside the same business day.
      const candidates = [phDateString(booking.startTime), phDateString(addMinutes(booking.startTime, -24 * 60))];
      const fits = candidates.some((d) => {
        const { start: open, end: close } = dayWindow(d, s);
        return booking.startTime >= open && newEnd <= close;
      });
      if (!fits) throw new ConflictError('That would run past closing time.');

      await tx.booking.update({
        where: { id: booking.id },
        data: { endTime: newEnd, totalAmount: booking.totalAmount + extra },
      });
      await tx.auditLog.create({
        data: {
          actor,
          action: 'BOOKING_EXTENDED',
          entity: 'Booking',
          entityId: booking.id,
          detail: `+${hours}h ${fmtPeso(extra)}`,
        },
      });
    });
  } catch (err) {
    if (isExclusionViolation(err)) throw new ConflictError('Another reservation blocks that time.');
    throw err;
  }
  return { newEnd, extra };
}

export async function setStatus(bookingId: string, status: BookingStatus, actor: string) {
  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: {
        status,
        expiresAt: null,
        checkedInAt: status === BookingStatus.CHECKED_IN ? new Date() : undefined,
      },
    }),
    prisma.auditLog.create({
      data: { actor, action: `STATUS_${status}`, entity: 'Booking', entityId: bookingId },
    }),
  ]);
}

export async function moveBooking(
  bookingId: string,
  roomId: string,
  start: Date,
  hours: number,
  actor: string,
) {
  const s = await getSettings();
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new ValidationError('Booking not found.');
  const end = validateWindow(start, hours, s, BookingSource.WALK_IN);

  try {
    await prisma.$transaction(async (tx) => {
      await assertFree(tx, roomId, start, end, booking.id);
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          roomId,
          startTime: start,
          endTime: end,
          totalAmount: Math.round(booking.hourlyRate * hours),
        },
      });
      await tx.auditLog.create({
        data: { actor, action: 'BOOKING_MOVED', entity: 'Booking', entityId: booking.id },
      });
    });
  } catch (err) {
    if (isExclusionViolation(err)) throw new ConflictError('That room and time is taken.');
    throw err;
  }
}
