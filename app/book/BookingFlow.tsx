'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Slot = { start: string; durations: number[] };
type RoomStatus =
  | { state: 'available'; until: string | null }
  | { state: 'occupied'; until: string }
  | { state: 'closed' };
type Room = {
  id: string;
  name: string;
  color: string;
  tagline: string;
  status: RoomStatus;
  slots: Slot[];
};
type Availability = {
  date: string;
  rate: number;
  minGuests: number;
  maxGuests: number;
  advanceDays: number;
  opens: string;
  closes: string;
  rooms: Room[];
};

const peso = (n: number) => `\u20B1${n.toLocaleString('en-PH')}`;

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(new Date(iso))
    .replace(/\u202f/g, ' ');

const fmtDay = (dateStr: string) =>
  new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${dateStr}T04:00:00.000Z`));

function manilaToday(offsetDays = 0): string {
  const d = new Date(Date.now() + 8 * 3600_000 + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const GUEST_CHOICES = [2, 3, 4, 5, 6, 7, 8];

export function BookingFlow() {
  const router = useRouter();

  const [date, setDate] = useState(manilaToday());
  const [guests, setGuests] = useState(2);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [hours, setHours] = useState<number | null>(null);

  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');

  const [data, setData] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/availability?date=${date}&guests=${guests}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load availability.');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load availability.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date, guests]);

  useEffect(() => {
    void load();
  }, [load]);

  // Availability moves while the customer is deciding. Refresh quietly so a
  // slot that someone else just took stops being offered.
  useEffect(() => {
    const id = setInterval(() => void load(), 45_000);
    return () => clearInterval(id);
  }, [load]);

  const room = useMemo(() => data?.rooms.find((r) => r.id === roomId) ?? null, [data, roomId]);
  const slot = useMemo(() => room?.slots.find((s) => s.start === start) ?? null, [room, start]);

  // Anything chosen earlier may have gone stale after a refresh; drop it.
  useEffect(() => {
    if (roomId && data && !data.rooms.some((r) => r.id === roomId)) setRoomId(null);
  }, [data, roomId]);
  useEffect(() => {
    if (start && room && !room.slots.some((s) => s.start === start)) setStart(null);
  }, [room, start]);
  useEffect(() => {
    if (hours && slot && !slot.durations.includes(hours)) setHours(null);
  }, [slot, hours]);

  const rate = data?.rate ?? (guests <= 3 ? 250 : 450);
  const total = hours ? rate * hours : 0;
  const endIso = start && hours ? new Date(Date.parse(start) + hours * 3600_000).toISOString() : null;

  const ready = Boolean(roomId && start && hours && name.trim() && mobile.trim().length >= 7);

  async function submit() {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          start,
          hours,
          guestCount: guests,
          customerName: name.trim(),
          mobile: mobile.trim(),
          email: email.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not hold that slot.');
      router.push(`/pay/${json.token}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setSubmitting(false);
      void load();
    }
  }

  return (
    <div className="mt-6 space-y-8">
      {/* 1. Date */}
      <section>
        <h2 className="label">When</h2>
        <div className="grid grid-cols-3 gap-2">
          <button
            className={`chip ${date === manilaToday() ? 'chip-on' : ''}`}
            onClick={() => setDate(manilaToday())}
          >
            Today
          </button>
          <button
            className={`chip ${date === manilaToday(1) ? 'chip-on' : ''}`}
            onClick={() => setDate(manilaToday(1))}
          >
            Tomorrow
          </button>
          <input
            type="date"
            onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
            className={`chip cursor-pointer ${
              date !== manilaToday() && date !== manilaToday(1) ? 'chip-on' : ''
            }`}
            min={manilaToday()}
            max={manilaToday(data?.advanceDays ?? 60)}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </div>
        <p className="mt-2 text-sm text-gray-cool">{fmtDay(date)}</p>
      </section>

      {/* 2. Party size */}
      <section>
        <h2 className="label">How many people?</h2>
        <div className="grid grid-cols-4 gap-2">
          {GUEST_CHOICES.map((n) => (
            <button
              key={n}
              className={`chip ${guests === n ? 'chip-on' : ''}`}
              onClick={() => setGuests(n)}
            >
              {n === 8 ? '8+' : n}
            </button>
          ))}
        </div>
        {guests === 8 && (
          <input
            type="number"
            min={8}
            max={data?.maxGuests ?? 12}
            value={guests}
            onChange={(e) => setGuests(Math.max(8, Number(e.target.value) || 8))}
            className="field mt-2"
            aria-label="Exact number of guests"
          />
        )}
        <p className="mt-3 text-sm">
          Your rate: <span className="font-bold text-lilac">{peso(rate)}/hour</span>
        </p>
      </section>

      {/* 3. Room */}
      <section>
        <h2 className="label">Choose a room</h2>
        {loading && !data && <p className="text-sm text-gray-cool">Checking availability&hellip;</p>}
        {error && !data && <p className="text-sm text-rose-400">{error}</p>}
        <div className="space-y-2">
          {data?.rooms.map((r) => {
            const open = r.slots.length > 0;
            const selected = r.id === roomId;
            return (
              <button
                key={r.id}
                disabled={!open}
                onClick={() => {
                  setRoomId(r.id);
                  setStart(null);
                  setHours(null);
                }}
                className={`card flex w-full items-center justify-between text-left transition
                  ${selected ? 'ring-2' : ''} ${open ? '' : 'opacity-40'}`}
                style={{ borderColor: `${r.color}66`, boxShadow: selected ? `0 0 0 2px ${r.color}` : undefined }}
              >
                <span>
                  <span className="block font-bold tracking-wide">{r.name.toUpperCase()}</span>
                  <span className="mt-1 block text-xs text-gray-cool">
                    {r.status.state === 'available' &&
                      (r.status.until
                        ? `Available until ${fmtTime(r.status.until)}`
                        : 'Available now')}
                    {r.status.state === 'occupied' && `Occupied until ${fmtTime(r.status.until)}`}
                    {r.status.state === 'closed' && 'Closed'}
                    {open ? '' : ' \u00B7 nothing left today'}
                  </span>
                </span>
                <span className="h-9 w-1.5 rounded-full" style={{ background: r.color }} />
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. Start time */}
      {room && (
        <section>
          <h2 className="label">Start time</h2>
          <div className="grid grid-cols-4 gap-2">
            {room.slots.map((s) => (
              <button
                key={s.start}
                className={`chip text-sm ${start === s.start ? 'chip-on' : ''}`}
                onClick={() => {
                  setStart(s.start);
                  setHours(null);
                }}
              >
                {fmtTime(s.start)}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 5. Duration */}
      {slot && (
        <section>
          <h2 className="label">How long would you like the room?</h2>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((h) => {
              const allowed = slot.durations.includes(h);
              return (
                <button
                  key={h}
                  disabled={!allowed}
                  className={`chip text-sm ${hours === h ? 'chip-on' : ''}`}
                  onClick={() => setHours(h)}
                >
                  {h} hr{h > 1 ? 's' : ''}
                </button>
              );
            })}
          </div>
          {slot.durations.length < 4 && (
            <p className="mt-2 text-xs text-gray-cool">
              Longer stays aren&rsquo;t offered here &mdash; another reservation or closing time
              follows.
            </p>
          )}
        </section>
      )}

      {/* 6. Details + summary */}
      {hours && room && start && (
        <>
          <section className="space-y-3">
            <h2 className="label">Your details</h2>
            <input
              className="field"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
            <input
              className="field"
              placeholder="Mobile number"
              inputMode="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              autoComplete="tel"
            />
            <input
              className="field"
              placeholder="Email (optional)"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </section>

          <section className="card" style={{ borderColor: `${room.color}66` }}>
            <p className="text-lg font-extrabold tracking-wide">{room.name.toUpperCase()}</p>
            <p className="mt-2 text-sm text-gray-cool">{fmtDay(date)}</p>
            <p className="text-sm text-gray-cool">
              {fmtTime(start)} &ndash; {endIso && fmtTime(endIso)}
            </p>
            <p className="mt-3 text-sm">
              {guests} guests &middot; {peso(rate)}/hour &times; {hours} hour{hours > 1 ? 's' : ''}
            </p>
            <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
              <span className="eyebrow">Total</span>
              <span className="text-2xl font-extrabold">{peso(total)}</span>
            </div>
          </section>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <button className="btn-primary w-full" disabled={!ready || submitting} onClick={submit}>
            {submitting ? 'Holding your slot\u2026' : 'CONTINUE TO PAYMENT'}
          </button>
          <p className="-mt-4 text-center text-xs text-gray-cool">
            We&rsquo;ll hold this room for 10 minutes while you pay.
          </p>
        </>
      )}
    </div>
  );
}
