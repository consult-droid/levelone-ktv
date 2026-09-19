import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withStaff } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withStaff(async (staff) => {
    const { id } = await ctx.params;
    await prisma.roomBlock.delete({ where: { id } });
    await prisma.auditLog.create({
      data: { actor: staff, action: 'ROOM_UNBLOCKED', entity: 'RoomBlock', entityId: id },
    });
    return NextResponse.json({ ok: true });
  });
}
