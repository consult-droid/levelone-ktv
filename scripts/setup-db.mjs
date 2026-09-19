#!/usr/bin/env node
/**
 * Runs on every Railway deploy, before the server starts.
 *
 *   1. Pushes the Prisma schema to Postgres (idempotent).
 *   2. Installs the overlap exclusion constraint — the database-level backstop
 *      that makes double-booking impossible even if two requests race past the
 *      application check at the same instant.
 *   3. Seeds the three KTV rooms once, if the table is empty.
 *
 * Safe to run repeatedly. Never drops data.
 */
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const step = (msg) => console.log(`\n▸ ${msg}`);

step('Pushing Prisma schema');
execSync('npx prisma db push --skip-generate --accept-data-loss=false', { stdio: 'inherit' });

const prisma = new PrismaClient();

try {
  step('Installing overlap protection');
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'booking_no_overlap'
      ) THEN
        ALTER TABLE "Booking"
          ADD CONSTRAINT booking_no_overlap
          EXCLUDE USING gist (
            "roomId" WITH =,
            tstzrange("startTime", "endTime", '[)') WITH &&
          )
          WHERE (
            "status" IN ('HELD','PAYMENT_SUBMITTED','CONFIRMED','CHECKED_IN')
          );
      END IF;
    END
    $$;
  `);
  console.log('  booking_no_overlap ✓');

  step('Seeding rooms');
  const count = await prisma.room.count();
  if (count === 0) {
    await prisma.room.createMany({
      data: [
        {
          name: 'Purple Rain',
          slug: 'purple-rain',
          color: '#8B5CF6',
          tagline: 'Sing loud. Stay late.',
          sortOrder: 1,
        },
        {
          name: 'Bad Romance',
          slug: 'bad-romance',
          color: '#EC4899',
          tagline: 'Bring the drama.',
          sortOrder: 2,
        },
        {
          name: 'Moonlight Blue',
          slug: 'moonlight-blue',
          color: '#3B82F6',
          tagline: 'Your night. Your playlist.',
          sortOrder: 3,
        },
      ],
    });
    console.log('  3 rooms created ✓');
  } else {
    console.log(`  ${count} rooms already present — left alone ✓`);
  }

  step('Ready');
} catch (err) {
  console.error('\nSetup failed:', err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
