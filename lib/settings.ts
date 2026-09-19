import { prisma } from './db';

export type Settings = {
  openTime: string; // Manila wall clock "HH:MM"
  closeTime: string; // may be <= openTime, meaning it crosses midnight
  holdMinutes: number; // temporary lock while the customer pays
  advanceDays: number; // how far ahead customers may book
  minGuests: number;
  maxGuests: number;
  minHours: number;
  maxHours: number;
  rateSmall: number; // 2–3 guests, pesos per hour
  rateLarge: number; // 4+ guests, pesos per hour
  smallPartyMax: number; // last guest count that pays rateSmall
  venueName: string;
};

export const DEFAULT_SETTINGS: Settings = {
  openTime: '10:00',
  closeTime: '02:00',
  holdMinutes: 10,
  advanceDays: 60,
  minGuests: 2,
  maxGuests: 12,
  minHours: 1,
  maxHours: 4,
  rateSmall: 250,
  rateLarge: 450,
  smallPartyMax: 3,
  venueName: 'LevelOne Cafe Lucena',
};

const NUMERIC_KEYS: (keyof Settings)[] = [
  'holdMinutes',
  'advanceDays',
  'minGuests',
  'maxGuests',
  'minHours',
  'maxHours',
  'rateSmall',
  'rateLarge',
  'smallPartyMax',
];

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (!(row.key in out)) continue;
    const key = row.key as keyof Settings;
    if (NUMERIC_KEYS.includes(key)) {
      const n = Number(row.value);
      if (Number.isFinite(n)) (out as Record<string, unknown>)[key] = n;
    } else {
      (out as Record<string, unknown>)[key] = row.value;
    }
  }
  return out;
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const entries = Object.entries(patch).filter(([k]) => k in DEFAULT_SETTINGS);
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      }),
    ),
  );
}

export function hourlyRate(guestCount: number, s: Settings): number {
  return guestCount <= s.smallPartyMax ? s.rateSmall : s.rateLarge;
}

export function quote(guestCount: number, hours: number, s: Settings) {
  const rate = hourlyRate(guestCount, s);
  return { hourlyRate: rate, hours, totalAmount: Math.round(rate * hours) };
}
