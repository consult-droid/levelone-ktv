import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertFree } from '@/lib/availability';
import { bad, withStaff } from '@/lib/api';
import { addMinutes } from '@/lib/time';

export const dynamic = 'force-dynamic';

const Body = z.object({
  roomId: z.string().min(1),
  start: z.string().datetime(),
  hours: z.number().min(0.25).max(24),
  reason: z.enum(['Maintenance', 'Private Event', 'Unavailable', 'Other']),
  note: z.string().max(200).optional(),
});

/** Take a room off the grid. Refuses if a live reservation sits in the way. */
export async function POST(req: Request) {
  return withStaff(async (staff) => {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return bad('Check the block details.');
    const d = parsed.data;

    const start = new Date(d.start);
    const end = addMinutes(start, d.hours * 60);

    const block = await prisma.$transaction(async (tx) => {
      await assertFree(tx, d.roomId, start, end);
      const created = await tx.roomBlock.create({
        data: {
          roomId: d.roomId,
          startTime: start,
          endTime: end,
          reason: d.reason,
          note: d.note || null,
          createdBy: staff,
        },
      });
      await tx.auditLog.create({
        data: {
          actor: staff,
          action: 'ROOM_BLOCKED',
          entity: 'RoomBlock',
          entityId: created.id,
          detail: d.reason,
        },
      });
      return created;
    });

    return NextResponse.json({ ok: true, id: block.id });
  });
}
