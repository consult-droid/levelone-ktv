'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function PayForm({ token, expiresAt }: { token: string; expiresAt: string | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);

  // Countdown on the hold. Purely informational — the server is the authority.
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setLeft(Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const expired = left !== null && left <= 0;

  async function submit() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Attach your payment screenshot first.');
      return;
    }
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append('proof', file);
    body.append('referenceNumber', reference.trim());
    try {
      const res = await fetch(`/api/bookings/${token}/proof`, { method: 'POST', body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed.');
      router.push(`/booking/${token}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-4">
      {left !== null && (
        <p className={`text-center text-sm ${expired ? 'text-rose-400' : 'text-gray-cool'}`}>
          {expired ? (
            <>
              This hold has expired.{' '}
              <a href="/book" className="underline">
                Start again
              </a>
              .
            </>
          ) : (
            <>
              Room held for{' '}
              <span className="font-semibold text-lilac">
                {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
              </span>
            </>
          )}
        </p>
      )}

      <div>
        <label className="label" htmlFor="ref">
          Payment reference number (if you have one)
        </label>
        <input
          id="ref"
          className="field"
          placeholder="e.g. 1234567890"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>

      <div>
        <label className="label">Proof of payment</label>
        <button
          type="button"
          className="btn-ghost w-full"
          onClick={() => fileRef.current?.click()}
          disabled={expired}
        >
          {fileName ?? 'UPLOAD PROOF OF PAYMENT'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        <p className="mt-2 text-xs text-gray-cool">JPG, PNG or PDF &middot; up to 8 MB</p>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <button className="btn-primary w-full" onClick={submit} disabled={busy || expired}>
        {busy ? 'Sending\u2026' : 'SUBMIT PAYMENT'}
      </button>
    </div>
  );
}
