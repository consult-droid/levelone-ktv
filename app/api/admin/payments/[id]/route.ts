import { NextResponse } from 'next/server';
import { z } from 'zod';
import { approvePayment, rejectPayment } from '@/lib/booking';
import { bad, withStaff } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Body = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().max(300).optional(),
  /** true = reopen the slot now; false = give the customer another hold to resubmit. */
  reopen: z.boolean().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withStaff(async (staff) => {
    const { id } = await ctx.params;
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return bad('Unrecognised action.');

    if (parsed.data.action === 'approve') {
      await approvePayment(id, staff);
    } else {
      await rejectPayment(id, staff, parsed.data.note ?? '', parsed.data.reopen ?? false);
    }
    return NextResponse.json({ ok: true });
  });
}
