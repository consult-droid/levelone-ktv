'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { addDays, fmtDayShort, fmtPeso, fmtTime, phDateString } from '@/lib/time';

/* ------------------------------------------------------------------ types */

type Room = { id: string; name: string; color: string };

type Booking = {
  id: string;
  reference: string;
  roomId: string;
  customerName: string;
  mobile: string;
  email: string | null;
  guestCount: number;
  start: string;
  end: string;
  hourlyRate: number;
  totalAmount: number;
  status: string;
  source: 'ONLINE' | 'WALK_IN';
  notes: string | null;
  payment: { id: string; status: string; method: string; referenceNumber: string | null } | null;
};

type Block = {
  id: string;
  roomId: string;
  start: string;
  end: string;
  reason: string;
  note: string | null;
};

type Settings = {
  openTime: string;
  closeTime: string;
  holdMinutes: number;
  advanceDays: number;
  minGuests: number;
  maxGuests: number;
  minHours: number;
  maxHours: number;
  rateSmall: number;
  rateLarge: number;
  smallPartyMax: number;
  venueName: string;
};

type DayData = {
  date: string;
  opens: string;
  closes: string;
  settings: Settings;
  pendingCount: number;
  revenue: number;
  rooms: Room[];
  bookings: Booking[];
  blocks: Block[];
};

type PendingPayment = {
  id: string;
  submittedAt: string;
  amountExpected: number;
  referenceNumber: string | null;
  proofMime: string | null;
  hasProof: boolean;
  booking: {
    id: string;
    reference: string;
    customerName: string;
    mobile: string;
    email: string | null;
    guestCount: number;
    start: string;
    end: string;
    status: string;
    room: { name: string; color: string };
  };
};

/* ------------------------------------------------------------- utilities */

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  HELD: { label: 'Held', className: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  PAYMENT_SUBMITTED: {
    label: 'To verify',
    className: 'bg-lilac/20 text-lilac border-lilac/50',
  },
  CONFIRMED: { label: 'Confirmed', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  CHECKED_IN: { label: 'Checked in', className: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
  COMPLETED: { label: 'Completed', className: 'bg-white/10 text-gray-cool border-line' },
  CANCELLED: { label: 'Cancelled', className: 'bg-white/5 text-gray-cool border-line' },
  EXPIRED: { label: 'Expired', className: 'bg-white/5 text-gray-cool border-line' },
  PAYMENT_REJECTED: { label: 'Rejected', className: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
};

const LIVE = ['HELD', 'PAYMENT_SUBMITTED', 'CONFIRMED', 'CHECKED_IN'];

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { label: status, className: 'border-line text-gray-cool' };
  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${s.className}`}
    >
      {s.label}
    </span>
  );
}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

/** 15-minute start options across the business day, labelled in Manila time. */
function quarterOptions(opens: string, closes: string) {
  const out: { value: string; label: string }[] = [];
  const end = new Date(closes).getTime();
  for (let t = new Date(opens).getTime(); t < end; t += 15 * 60_000) {
    const d = new Date(t);
    out.push({ value: d.toISOString(), label: fmtTime(d) });
  }
  return out;
}

/* ============================================================== dashboard */

export default function Dashboard({ staff }: { staff: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<'today' | 'payments' | 'search' | 'settings'>('today');
  const [date, setDate] = useState(phDateString());
  const [day, setDay] = useState<DayData | null>(null);
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState<Booking | null>(null);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [showBlock, setShowBlock] = useState(false);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  const loadDay = useCallback(async () => {
    try {
      setDay(await api(`/api/admin/day?date=${date}`));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }, [date]);

  const loadPayments = useCallback(async () => {
    try {
      const data = await api('/api/admin/payments');
      setPayments(data.payments);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    loadDay();
    loadPayments();
    const timer = setInterval(() => {
      loadDay();
      loadPayments();
    }, 30_000);
    return () => clearInterval(timer);
  }, [loadDay, loadPayments]);

  async function refresh() {
    await Promise.all([loadDay(), loadPayments()]);
  }

  async function signOut() {
    await fetch('/api/admin/session', { method: 'DELETE' });
    router.replace('/admin/login');
  }

  const pending = day?.pendingCount ?? payments.length;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo className="h-8" />
          <div>
            <div className="text-sm font-extrabold tracking-[0.18em]">LEVEL ONE — KTV</div>
            <div className="text-xs text-gray-cool">Signed in as {staff}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost px-3 py-2 text-sm" onClick={refresh}>
            Refresh
          </button>
          <button className="btn-ghost px-3 py-2 text-sm" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="mt-6 flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ['today', 'Today'],
            ['payments', `Payments${pending ? ` (${pending})` : ''}`],
            ['search', 'Search'],
            ['settings', 'Settings'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`chip whitespace-nowrap px-4 py-2 text-sm ${tab === key ? 'chip-on' : ''} ${
              key === 'payments' && pending ? 'border-lilac text-lilac' : ''
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {error && (
        <p className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {tab === 'today' && day && (
        <TodayView
          day={day}
          date={date}
          setDate={setDate}
          onSelect={setSelected}
          onWalkIn={() => setShowWalkIn(true)}
          onBlock={() => setShowBlock(true)}
          onUnblock={async (id) => {
            await api(`/api/admin/blocks/${id}`, { method: 'DELETE' });
            flash('Block removed.');
            refresh();
          }}
        />
      )}

      {tab === 'payments' && (
        <PaymentsView
          payments={payments}
          onDone={async (msg) => {
            flash(msg);
            await refresh();
          }}
          onError={setError}
        />
      )}

      {tab === 'search' && <SearchView onSelect={setSelected} />}

      {tab === 'settings' && day && (
        <SettingsView initial={day.settings} onSaved={() => flash('Settings saved.')} />
      )}

      {selected && day && (
        <BookingDrawer
          booking={selected}
          rooms={day.rooms}
          settings={day.settings}
          onClose={() => setSelected(null)}
          onDone={async (msg) => {
            setSelected(null);
            flash(msg);
            await refresh();
          }}
        />
      )}

      {showWalkIn && day && (
        <WalkInDrawer
          day={day}
          onClose={() => setShowWalkIn(false)}
          onDone={async (msg) => {
            setShowWalkIn(false);
            flash(msg);
            await refresh();
          }}
        />
      )}

      {showBlock && day && (
        <BlockDrawer
          day={day}
          onClose={() => setShowBlock(false)}
          onDone={async (msg) => {
            setShowBlock(false);
            flash(msg);
            await refresh();
          }}
        />
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-xl border border-lilac/50 bg-raised px-5 py-3 text-sm font-semibold shadow-glow">
          {toast}
        </div>
      )}
    </main>
  );
}

/* ================================================================== today */

const PX_PER_MIN = 1.5;

function TodayView({
  day,
  date,
  setDate,
  onSelect,
  onWalkIn,
  onBlock,
  onUnblock,
}: {
  day: DayData;
  date: string;
  setDate: (d: string) => void;
  onSelect: (b: Booking) => void;
  onWalkIn: () => void;
  onBlock: () => void;
  onUnblock: (id: string) => void;
}) {
  const opens = new Date(day.opens).getTime();
  const closes = new Date(day.closes).getTime();
  const totalMin = (closes - opens) / 60_000;
  const height = totalMin * PX_PER_MIN;

  const hourMarks = useMemo(() => {
    const marks: { top: number; label: string }[] = [];
    // First whole hour at or after opening.
    const first = Math.ceil(opens / 3_600_000) * 3_600_000;
    for (let t = first; t <= closes; t += 3_600_000) {
      marks.push({ top: ((t - opens) / 60_000) * PX_PER_MIN, label: fmtTime(new Date(t)) });
    }
    return marks;
  }, [opens, closes]);

  const nowTop = (() => {
    const n = Date.now();
    if (n < opens || n > closes) return null;
    return ((n - opens) / 60_000) * PX_PER_MIN;
  })();

  const live = day.bookings.filter((b) => LIVE.includes(b.status));

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className="btn-ghost px-3 py-2 text-sm" onClick={() => setDate(addDays(date, -1))}>
            ‹
          </button>
          <button
            className={`chip px-4 py-2 text-sm ${date === phDateString() ? 'chip-on' : ''}`}
            onClick={() => setDate(phDateString())}
          >
            Today
          </button>
          <input
            type="date"
            className="field w-auto py-2 text-sm"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          <button className="btn-ghost px-3 py-2 text-sm" onClick={() => setDate(addDays(date, 1))}>
            ›
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost px-4 py-2 text-sm" onClick={onBlock}>
            Block room
          </button>
          <button className="btn-primary px-4 py-2 text-sm" onClick={onWalkIn}>
            + Walk-in
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Date" value={fmtDayShort(new Date(day.opens))} />
        <Stat label="Live bookings" value={String(live.length)} />
        <Stat label="To verify" value={String(day.pendingCount)} />
        <Stat label="Revenue" value={fmtPeso(day.revenue)} />
      </div>

      <div className="card mt-4 overflow-x-auto p-3">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[56px_repeat(3,1fr)] gap-2">
            <div />
            {day.rooms.map((room) => (
              <div key={room.id} className="pb-2 text-center">
                <span
                  className="inline-block rounded-md px-3 py-1 text-xs font-bold uppercase tracking-wider"
                  style={{ background: `${room.color}22`, color: room.color }}
                >
                  {room.name}
                </span>
              </div>
            ))}
          </div>

          <div className="relative grid grid-cols-[56px_repeat(3,1fr)] gap-2" style={{ height }}>
            {/* hour gutter */}
            <div className="relative">
              {hourMarks.map((m) => (
                <div
                  key={m.top}
                  className="absolute -translate-y-1/2 text-[10px] font-semibold text-gray-cool"
                  style={{ top: m.top }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            {day.rooms.map((room) => (
              <div key={room.id} className="relative rounded-xl border border-line bg-raised/50">
                {hourMarks.map((m) => (
                  <div
                    key={m.top}
                    className="absolute inset-x-0 border-t border-line/60"
                    style={{ top: m.top }}
                  />
                ))}

                {day.blocks
                  .filter((b) => b.roomId === room.id)
                  .map((b) => {
                    const top = ((new Date(b.start).getTime() - opens) / 60_000) * PX_PER_MIN;
                    const h =
                      ((new Date(b.end).getTime() - new Date(b.start).getTime()) / 60_000) *
                      PX_PER_MIN;
                    return (
                      <button
                        key={b.id}
                        onClick={() => onUnblock(b.id)}
                        title="Click to remove this block"
                        className="absolute inset-x-1 overflow-hidden rounded-lg border border-line bg-[repeating-linear-gradient(115deg,rgba(255,255,255,0.06)_0_8px,transparent_8px_16px)] px-2 py-1 text-left text-[11px] text-gray-cool"
                        style={{ top, height: Math.max(h, 22) }}
                      >
                        <span className="font-bold uppercase tracking-wider">{b.reason}</span>
                      </button>
                    );
                  })}

                {day.bookings
                  .filter((b) => b.roomId === room.id && LIVE.includes(b.status))
                  .map((b) => {
                    const top = ((new Date(b.start).getTime() - opens) / 60_000) * PX_PER_MIN;
                    const h =
                      ((new Date(b.end).getTime() - new Date(b.start).getTime()) / 60_000) *
                      PX_PER_MIN;
                    return (
                      <button
                        key={b.id}
                        onClick={() => onSelect(b)}
                        className="absolute inset-x-1 overflow-hidden rounded-lg border px-2 py-1 text-left transition hover:brightness-125"
                        style={{
                          top,
                          height: Math.max(h, 30),
                          background: `${room.color}26`,
                          borderColor: `${room.color}88`,
                        }}
                      >
                        <div className="truncate text-xs font-bold">{b.customerName}</div>
                        <div className="truncate text-[10px] text-gray-cool">
                          {fmtTime(b.start)}–{fmtTime(b.end)} · {b.guestCount}p
                        </div>
                        <div className="mt-0.5">
                          <StatusPill status={b.status} />
                        </div>
                      </button>
                    );
                  })}
              </div>
            ))}

            {nowTop !== null && (
              <div
                className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-lilac"
                style={{ top: nowTop }}
              >
                <span className="absolute -top-2 left-0 rounded bg-lilac px-1 text-[9px] font-bold text-ink">
                  NOW
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface/70 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-cool">
        {label}
      </div>
      <div className="mt-1 text-lg font-extrabold">{value}</div>
    </div>
  );
}

/* =============================================================== payments */

function PaymentsView({
  payments,
  onDone,
  onError,
}: {
  payments: PendingPayment[];
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<Record<string, string>>({});

  async function act(id: string, action: 'approve' | 'reject', reopen?: boolean) {
    setBusy(id);
    try {
      await api(`/api/admin/payments/${id}`, {
        method: 'POST',
        body: JSON.stringify({ action, note: note[id] ?? '', reopen }),
      });
      onDone(action === 'approve' ? 'Payment approved — booking confirmed.' : 'Payment rejected.');
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  if (!payments.length) {
    return (
      <div className="card mt-6 text-center">
        <p className="text-lg font-bold">Nothing to verify</p>
        <p className="mt-1 text-sm text-gray-cool">
          New payment proofs appear here the moment a customer uploads one.
        </p>
      </div>
    );
  }

  return (
    <section className="mt-6 space-y-4">
      <p className="eyebrow">Payments to verify</p>
      {payments.map((p) => (
        <div key={p.id} className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold">{p.booking.reference}</span>
                <StatusPill status={p.booking.status} />
              </div>
              <div className="mt-1 text-sm text-gray-cool">
                {p.booking.customerName} · {p.booking.mobile || 'no mobile'}
                {p.booking.email ? ` · ${p.booking.email}` : ''}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-extrabold text-lilac">
                {fmtPeso(p.amountExpected)}
              </div>
              <div className="text-xs text-gray-cool">
                Ref: {p.referenceNumber || 'not supplied'}
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <dl className="space-y-1 text-sm">
              <Row k="Room" v={p.booking.room.name} />
              <Row k="Schedule" v={`${fmtDayShort(p.booking.start)} · ${fmtTime(p.booking.start)}–${fmtTime(p.booking.end)}`} />
              <Row k="Guests" v={String(p.booking.guestCount)} />
              <Row k="Submitted" v={fmtTime(p.submittedAt)} />
            </dl>

            {p.hasProof ? (
              p.proofMime === 'application/pdf' ? (
                <a
                  className="btn-ghost h-fit"
                  href={`/api/admin/proof/${p.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open PDF proof
                </a>
              ) : (
                <a href={`/api/admin/proof/${p.id}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/admin/proof/${p.id}`}
                    alt={`Payment proof for ${p.booking.reference}`}
                    className="max-h-64 w-full rounded-xl border border-line object-contain"
                  />
                </a>
              )
            ) : (
              <p className="text-sm text-gray-cool">No file attached.</p>
            )}
          </div>

          <input
            className="field mt-3 text-sm"
            placeholder="Note (shown in the audit log, e.g. amount short by ₱50)"
            value={note[p.id] ?? ''}
            onChange={(e) => setNote({ ...note, [p.id]: e.target.value })}
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="btn-primary px-4 py-2 text-sm"
              disabled={busy === p.id}
              onClick={() => act(p.id, 'approve')}
            >
              Approve payment
            </button>
            <button
              className="btn-ghost px-4 py-2 text-sm"
              disabled={busy === p.id}
              onClick={() => act(p.id, 'reject', false)}
            >
              Reject — let them resend
            </button>
            <button
              className="btn-ghost px-4 py-2 text-sm text-rose-300"
              disabled={busy === p.id}
              onClick={() => act(p.id, 'reject', true)}
            >
              Reject — free the slot
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-cool">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );
}

/* ================================================================= search */

function SearchView({ onSelect }: { onSelect: (b: Booking) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api(`/api/admin/bookings?q=${encodeURIComponent(q.trim())}`);
        setResults(data.bookings);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <section className="mt-6">
      <input
        className="field"
        placeholder="Name, mobile number or booking reference (L1-XXXXXX)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <p className="mt-2 text-xs text-gray-cool">
        {searching ? 'Searching…' : results.length ? `${results.length} result(s)` : ''}
      </p>

      <div className="mt-4 space-y-2">
        {results.map((b) => (
          <button
            key={b.id}
            onClick={() => onSelect(b as Booking)}
            className="card flex w-full flex-wrap items-center justify-between gap-3 text-left hover:border-lilac/50"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold">{b.reference}</span>
                <StatusPill status={b.status} />
                {b.source === 'WALK_IN' && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-cool">
                    Walk-in
                  </span>
                )}
              </div>
              <div className="mt-1 text-sm text-gray-cool">
                {b.customerName} · {b.mobile || '—'} · {b.room.name}
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="font-semibold">{fmtDayShort(b.start)}</div>
              <div className="text-gray-cool">
                {fmtTime(b.start)}–{fmtTime(b.end)} · {fmtPeso(b.totalAmount)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ================================================================ drawers */

function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
          <button className="text-2xl leading-none text-gray-cool" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function BookingDrawer({
  booking,
  rooms,
  settings,
  onClose,
  onDone,
}: {
  booking: Booking;
  rooms: Room[];
  settings: Settings;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [extendHours, setExtendHours] = useState(1);

  async function run(body: object, msg: string) {
    setBusy(true);
    setErr('');
    try {
      const data = await api(`/api/admin/bookings/${booking.id}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onDone(data.message || msg);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const room = rooms.find((r) => r.id === booking.roomId);
  const hours = (new Date(booking.end).getTime() - new Date(booking.start).getTime()) / 3_600_000;

  return (
    <Drawer title={booking.reference} onClose={onClose}>
      <div className="flex items-center gap-2">
        <StatusPill status={booking.status} />
        {booking.source === 'WALK_IN' && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-cool">
            Walk-in
          </span>
        )}
      </div>

      <dl className="mt-4 space-y-1 text-sm">
        <Row k="Customer" v={booking.customerName} />
        <Row k="Mobile" v={booking.mobile || '—'} />
        {booking.email && <Row k="Email" v={booking.email} />}
        <Row k="Room" v={room?.name ?? '—'} />
        <Row k="Date" v={fmtDayShort(booking.start)} />
        <Row k="Time" v={`${fmtTime(booking.start)} – ${fmtTime(booking.end)}`} />
        <Row k="Guests" v={String(booking.guestCount)} />
        <Row k="Rate" v={`${fmtPeso(booking.hourlyRate)}/hr × ${hours}h`} />
        <Row k="Total" v={fmtPeso(booking.totalAmount)} />
        {booking.payment?.referenceNumber && (
          <Row k="Payment ref" v={booking.payment.referenceNumber} />
        )}
      </dl>

      {booking.payment && booking.payment.status === 'SUBMITTED' && (
        <a
          className="btn-ghost mt-4 w-full"
          href={`/api/admin/proof/${booking.payment.id}`}
          target="_blank"
          rel="noreferrer"
        >
          View payment proof
        </a>
      )}

      {err && <p className="mt-4 text-sm font-semibold text-rose-300">{err}</p>}

      <div className="mt-5 space-y-3">
        <div>
          <label className="label">Extend booking</label>
          <div className="flex gap-2">
            <select
              className="field"
              value={extendHours}
              onChange={(e) => setExtendHours(Number(e.target.value))}
            >
              {[1, 2, 3].map((h) => (
                <option key={h} value={h}>
                  +{h} hour{h > 1 ? 's' : ''} · {fmtPeso(booking.hourlyRate * h)}
                </option>
              ))}
            </select>
            <button
              className="btn-primary whitespace-nowrap px-4 py-2 text-sm"
              disabled={busy}
              onClick={() => run({ action: 'extend', hours: extendHours }, 'Booking extended.')}
            >
              Extend
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-cool">
            Refused automatically if another reservation starts before that.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {booking.status === 'CONFIRMED' && (
            <button
              className="btn-ghost px-4 py-2 text-sm"
              disabled={busy}
              onClick={() => run({ action: 'status', status: 'CHECKED_IN' }, 'Checked in.')}
            >
              Check in
            </button>
          )}
          {['CONFIRMED', 'CHECKED_IN'].includes(booking.status) && (
            <button
              className="btn-ghost px-4 py-2 text-sm"
              disabled={busy}
              onClick={() => run({ action: 'status', status: 'COMPLETED' }, 'Marked complete.')}
            >
              Complete
            </button>
          )}
          {LIVE.includes(booking.status) && (
            <button
              className="btn-ghost px-4 py-2 text-sm text-rose-300"
              disabled={busy}
              onClick={() => {
                if (confirm(`Cancel ${booking.reference}? The slot reopens immediately.`)) {
                  run({ action: 'status', status: 'CANCELLED' }, 'Booking cancelled.');
                }
              }}
            >
              Cancel booking
            </button>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-cool">
        Hold window: {settings.holdMinutes} minutes. Every action here is written to the audit log.
      </p>
    </Drawer>
  );
}

function WalkInDrawer({
  day,
  onClose,
  onDone,
}: {
  day: DayData;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const options = useMemo(() => quarterOptions(day.opens, day.closes), [day.opens, day.closes]);

  /** Default to the next 15-minute mark, or opening time if we're early. */
  const defaultStart = useMemo(() => {
    const now = Date.now();
    return (
      options.find((o) => new Date(o.value).getTime() >= now)?.value ??
      options[0]?.value ??
      day.opens
    );
  }, [options, day.opens]);

  const [form, setForm] = useState({
    roomId: day.rooms[0]?.id ?? '',
    start: defaultStart,
    hours: 1,
    guestCount: 2,
    customerName: '',
    mobile: '',
    method: 'CASH' as 'CASH' | 'QRPH' | 'OTHER',
    markPaid: true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const rate =
    form.guestCount <= day.settings.smallPartyMax ? day.settings.rateSmall : day.settings.rateLarge;
  const total = rate * form.hours;

  async function submit() {
    setBusy(true);
    setErr('');
    try {
      const data = await api('/api/admin/bookings', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      onDone(`${data.reference} booked · ${fmtPeso(data.totalAmount)}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Drawer title="Walk-in booking" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Room</label>
          <div className="grid grid-cols-3 gap-2">
            {day.rooms.map((r) => (
              <button
                key={r.id}
                className={`chip py-2 text-xs ${form.roomId === r.id ? 'chip-on' : ''}`}
                onClick={() => setForm({ ...form, roomId: r.id })}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Start</label>
            <select
              className="field"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Duration</label>
            <select
              className="field"
              value={form.hours}
              onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })}
            >
              {Array.from({ length: day.settings.maxHours }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>
                  {h} hour{h > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Guests</label>
          <div className="grid grid-cols-7 gap-1.5">
            {[2, 3, 4, 5, 6, 7, 8].map((g) => (
              <button
                key={g}
                className={`chip px-0 py-2 text-sm ${form.guestCount === g ? 'chip-on' : ''}`}
                onClick={() => setForm({ ...form, guestCount: g })}
              >
                {g === 8 ? '8+' : g}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Customer name</label>
            <input
              className="field"
              value={form.customerName}
              onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              placeholder="Santos"
            />
          </div>
          <div>
            <label className="label">Mobile (optional)</label>
            <input
              className="field"
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              placeholder="0917…"
            />
          </div>
        </div>

        <div>
          <label className="label">Payment</label>
          <div className="grid grid-cols-3 gap-2">
            {(['CASH', 'QRPH', 'OTHER'] as const).map((m) => (
              <button
                key={m}
                className={`chip py-2 text-xs ${form.method === m ? 'chip-on' : ''}`}
                onClick={() => setForm({ ...form, method: m })}
              >
                {m === 'QRPH' ? 'QRPh' : m[0] + m.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.markPaid}
              onChange={(e) => setForm({ ...form, markPaid: e.target.checked })}
            />
            Paid now — confirm immediately
          </label>
        </div>

        <div className="rounded-xl border border-lilac/40 bg-purple/10 px-4 py-3">
          <div className="flex justify-between text-sm text-gray-cool">
            <span>
              {fmtPeso(rate)}/hour × {form.hours}h
            </span>
            <span>{form.guestCount} guests</span>
          </div>
          <div className="mt-1 text-2xl font-extrabold">{fmtPeso(total)}</div>
        </div>

        {err && <p className="text-sm font-semibold text-rose-300">{err}</p>}

        <button
          className="btn-primary w-full"
          disabled={busy || !form.customerName.trim() || !form.roomId}
          onClick={submit}
        >
          {busy ? 'Checking the room…' : 'CREATE BOOKING'}
        </button>
      </div>
    </Drawer>
  );
}

function BlockDrawer({
  day,
  onClose,
  onDone,
}: {
  day: DayData;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const options = useMemo(() => quarterOptions(day.opens, day.closes), [day.opens, day.closes]);
  const [form, setForm] = useState({
    roomId: day.rooms[0]?.id ?? '',
    start: options[0]?.value ?? day.opens,
    hours: 1,
    reason: 'Maintenance' as 'Maintenance' | 'Private Event' | 'Unavailable' | 'Other',
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setBusy(true);
    setErr('');
    try {
      await api('/api/admin/blocks', { method: 'POST', body: JSON.stringify(form) });
      onDone('Room blocked.');
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Drawer title="Block a room" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Room</label>
          <div className="grid grid-cols-3 gap-2">
            {day.rooms.map((r) => (
              <button
                key={r.id}
                className={`chip py-2 text-xs ${form.roomId === r.id ? 'chip-on' : ''}`}
                onClick={() => setForm({ ...form, roomId: r.id })}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">From</label>
            <select
              className="field"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">For</label>
            <select
              className="field"
              value={form.hours}
              onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 6, 8, 12].map((h) => (
                <option key={h} value={h}>
                  {h} hours
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Reason</label>
          <select
            className="field"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value as typeof form.reason })}
          >
            {['Maintenance', 'Private Event', 'Unavailable', 'Other'].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <input
          className="field"
          placeholder="Note (optional)"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />

        {err && <p className="text-sm font-semibold text-rose-300">{err}</p>}

        <button className="btn-primary w-full" disabled={busy} onClick={submit}>
          {busy ? 'Checking…' : 'BLOCK ROOM'}
        </button>
        <p className="text-xs text-gray-cool">
          Tap a block on the timeline to remove it.
        </p>
      </div>
    </Drawer>
  );
}

/* =============================================================== settings */

function SettingsView({ initial, onSaved }: { initial: Settings; onSaved: () => void }) {
  const [form, setForm] = useState<Settings>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: Number(e.target.value) });

  async function save() {
    setBusy(true);
    setErr('');
    try {
      await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(form) });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 space-y-4">
      <div className="card space-y-4">
        <p className="eyebrow">Pricing</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Small party rate (₱/hr)">
            <input className="field" type="number" value={form.rateSmall} onChange={num('rateSmall')} />
          </Field>
          <Field label="Large party rate (₱/hr)">
            <input className="field" type="number" value={form.rateLarge} onChange={num('rateLarge')} />
          </Field>
          <Field label="Small party up to">
            <input
              className="field"
              type="number"
              value={form.smallPartyMax}
              onChange={num('smallPartyMax')}
            />
          </Field>
        </div>
        <p className="text-xs text-gray-cool">
          {form.minGuests}–{form.smallPartyMax} guests pay {fmtPeso(form.rateSmall)}/hour;{' '}
          {form.smallPartyMax + 1}+ pay {fmtPeso(form.rateLarge)}/hour.
        </p>
      </div>

      <div className="card space-y-4">
        <p className="eyebrow">Operating hours</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opens (24h)">
            <input
              className="field"
              value={form.openTime}
              onChange={(e) => setForm({ ...form, openTime: e.target.value })}
              placeholder="10:00"
            />
          </Field>
          <Field label="Closes (24h)">
            <input
              className="field"
              value={form.closeTime}
              onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
              placeholder="02:00"
            />
          </Field>
        </div>
        <p className="text-xs text-gray-cool">
          A closing time earlier than opening means the night runs past midnight.
        </p>
      </div>

      <div className="card space-y-4">
        <p className="eyebrow">Booking rules</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Hold (minutes)">
            <input className="field" type="number" value={form.holdMinutes} onChange={num('holdMinutes')} />
          </Field>
          <Field label="Book ahead (days)">
            <input className="field" type="number" value={form.advanceDays} onChange={num('advanceDays')} />
          </Field>
          <Field label="Min guests">
            <input className="field" type="number" value={form.minGuests} onChange={num('minGuests')} />
          </Field>
          <Field label="Max guests">
            <input className="field" type="number" value={form.maxGuests} onChange={num('maxGuests')} />
          </Field>
          <Field label="Min hours">
            <input className="field" type="number" value={form.minHours} onChange={num('minHours')} />
          </Field>
          <Field label="Max hours">
            <input className="field" type="number" value={form.maxHours} onChange={num('maxHours')} />
          </Field>
        </div>
      </div>

      {err && <p className="text-sm font-semibold text-rose-300">{err}</p>}

      <button className="btn-primary w-full" disabled={busy} onClick={save}>
        {busy ? 'Saving…' : 'SAVE SETTINGS'}
      </button>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
