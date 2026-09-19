import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withStaff } from '@/lib/api';
import { signedProofUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The only way to see a payment screenshot. Requires a staff session, so proof
 * URLs are never public and never enumerable.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withStaff(async () => {
    const { id } = await ctx.params;
    const payment = await prisma.payment.findUnique({
      where: { id },
      select: { proofKey: true, proofData: true, proofMime: true },
    });
    if (!payment) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

    if (payment.proofKey) {
      return NextResponse.redirect(await signedProofUrl(payment.proofKey, 900));
    }
    if (payment.proofData) {
      return new NextResponse(Buffer.from(payment.proofData), {
        headers: {
          'Content-Type': payment.proofMime || 'application/octet-stream',
          'Cache-Control': 'private, max-age=60',
          'Content-Disposition': 'inline',
        },
      });
    }
    return NextResponse.json({ error: 'No proof on file.' }, { status: 404 });
  });
}
