'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';

export default function StaffLogin() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!passcode) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, passcode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not sign in.');
      router.replace('/admin');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5">
      <div className="card">
        <Logo className="h-10" />
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight">Staff sign in</h1>
        <p className="mt-1 text-sm text-gray-cool">LevelOne KTV bookings</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="name">
              Your name
            </label>
            <input
              id="name"
              className="field"
              placeholder="e.g. Maya"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label" htmlFor="passcode">
              Staff passcode
            </label>
            <input
              id="passcode"
              type="password"
              className="field"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              autoComplete="current-password"
            />
          </div>

          {error && <p className="text-sm font-semibold text-room-romance">{error}</p>}

          <button className="btn-primary w-full" onClick={submit} disabled={busy || !passcode}>
            {busy ? 'Checking…' : 'SIGN IN'}
          </button>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-gray-cool">
        Actions taken here are recorded against your name.
      </p>
    </main>
  );
}
