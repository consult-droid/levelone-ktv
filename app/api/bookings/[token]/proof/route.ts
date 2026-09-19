import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { submitProof, ValidationError } from '@/lib/booking';
import { ConflictError, expireStaleHolds } from '@/lib/availability';
import {
  ALLOWED_PROOF_TYPES,
  MAX_PROOF_BYTES,
  proofKey,
  putProof,
  s3Enabled,
} from '@/lib/storage';
import { rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!rateLimit(req, 'proof', 10, 60_000)) {
    return NextResponse.json({ error: 'Too many uploads. Wait a minute.' }, { status: 429 });
  }

  const { token } = await ctx.params;
  await expireStaleHolds();

  const booking = await prisma.booking.findUnique({ where: { publicToken: token } });
  if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });

  const form = await req.formData();
  const file = form.get('proof');
  const referenceNumber = String(form.get('referenceNumber') || '').trim() || null;

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Attach a screenshot or PDF of your payment.' }, { status: 400 });
  }
  if (file.size > MAX_PROOF_BYTES) {
    return NextResponse.json({ error: 'That file is larger than 8 MB.' }, { status: 413 });
  }
  if (!ALLOWED_PROOF_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Upload a JPG, PNG or PDF.' }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    if (s3Enabled()) {
      const key = proofKey(booking.reference, file.name);
      await putProof(key, buffer, file.type);
      await submitProof({
        bookingId: booking.id,
        referenceNumber,
        proofKey: key,
        proofMime: file.type,
      });
    } else {
      await submitProof({
        bookingId: booking.id,
        referenceNumber,
        proofData: buffer,
        proofMime: file.type,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ValidationError || err instanceof ConflictError) {
      return NextResponse.json({ error: err.message }, { status: (err as any).status ?? 400 });
    }
    console.error('proof upload failed', err);
    return NextResponse.json({ error: 'Upload failed. Try again.' }, { status: 500 });
  }
}
