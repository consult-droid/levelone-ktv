import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSettings, saveSettings } from '@/lib/settings';
import { bad, withStaff } from '@/lib/api';

export const dynamic = 'force-dynamic';

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM.');

const Body = z
  .object({
    openTime: HHMM,
    closeTime: HHMM,
    holdMinutes: z.number().int().min(2).max(120),
    advanceDays: z.number().int().min(0).max(365),
    minGuests: z.number().int().min(1).max(20),
    maxGuests: z.number().int().min(1).max(50),
    minHours: z.number().int().min(1).max(12),
    maxHours: z.number().int().min(1).max(12),
    rateSmall: z.number().int().min(0).max(100_000),
    rateLarge: z.number().int().min(0).max(100_000),
    smallPartyMax: z.number().int().min(1).max(20),
    venueName: z.string().min(1).max(60),
  })
  .partial();

export async function GET() {
  return withStaff(async () => NextResponse.json(await getSettings()));
}

export async function PATCH(req: Request) {
  return withStaff(async (staff) => {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return bad(parsed.error.issues[0]?.message ?? 'Check those values.');
    }
    await saveSettings(parsed.data);
    await prisma.auditLog.create({
      data: {
        actor: staff,
        action: 'SETTINGS_UPDATED',
        entity: 'Setting',
        detail: Object.keys(parsed.data).join(', ').slice(0, 200),
      },
    });
    return NextResponse.json(await getSettings());
  });
}
