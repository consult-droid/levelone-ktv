import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Wordmark } from '@/components/Logo';

export const dynamic = 'force-dynamic';

const FALLBACK = [
  { name: 'Purple Rain', color: '#8B5CF6', tagline: 'Sing loud. Stay late.' },
  { name: 'Bad Romance', color: '#EC4899', tagline: 'Bring the drama.' },
  { name: 'Moonlight Blue', color: '#3B82F6', tagline: 'Your night. Your playlist.' },
];

const STEPS = ['Pick your room', 'Choose your time', 'Scan & pay', 'Upload proof', "You're booked"];

export default async function Home() {
  let rooms = FALLBACK;
  try {
    const live = await prisma.room.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (live.length) rooms = live.map((r) => ({ name: r.name, color: r.color, tagline: r.tagline }));
  } catch {
    // Database not reachable yet — the marketing page still renders.
  }

  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-16 pt-8">
      <Wordmark />

      <section className="mt-12">
        <p className="eyebrow">KTV at LevelOne</p>
        <h1 className="mt-3 text-[2.6rem] font-extrabold leading-[1.05] tracking-tight">
          YOUR ROOM.
          <br />
          YOUR TIME.
          <br />
          <span className="bg-gradient-to-r from-purple to-lilac bg-clip-text text-transparent">
            YOUR VIBE.
          </span>
        </h1>
        <p className="mt-4 text-gray-cool">
          Choose your room. Pick your time. Pay. You&rsquo;re in.
        </p>
        <Link href="/book" className="btn-primary mt-7 w-full text-base tracking-wide">
          BOOK A ROOM
        </Link>
      </section>

      <section className="mt-12 space-y-3">
        {rooms.map((room) => (
          <div
            key={room.name}
            className="card slash relative overflow-hidden"
            style={{ borderColor: `${room.color}55` }}
          >
            <div
              className="absolute inset-y-0 left-0 w-1"
              style={{ background: room.color }}
              aria-hidden
            />
            <div className="pl-2">
              <h2 className="text-lg font-bold tracking-wide">{room.name.toUpperCase()}</h2>
              <p className="mt-1 text-sm text-gray-cool">{room.tagline}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="eyebrow">How it works</h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-center gap-4">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-raised text-sm font-bold text-lilac">
                {i + 1}
              </span>
              <span className="text-sm">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card mt-10">
        <h2 className="eyebrow">Rates</h2>
        <div className="mt-3 flex items-baseline justify-between border-b border-line pb-3">
          <span className="text-sm text-gray-cool">2&ndash;3 guests</span>
          <span className="text-lg font-bold">&#8369;250 / hour</span>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-sm text-gray-cool">4+ guests</span>
          <span className="text-lg font-bold">&#8369;450 / hour</span>
        </div>
      </section>

      <footer className="mt-14 border-t border-line pt-6 text-center">
        <p className="text-xs tracking-[0.2em] text-gray-cool">
          MORE THAN A SPACE. <span className="text-lilac">A HIGHER LEVEL.</span>
        </p>
      </footer>
    </main>
  );
}
