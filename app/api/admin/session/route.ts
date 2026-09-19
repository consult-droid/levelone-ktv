import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, issueSession, passcodeMatches } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Sign in with the shared staff passcode. */
export async function POST(req: Request) {
  if (!rateLimit(req, 'login', 8, 5 * 60_000)) {
    return NextResponse.json({ error: 'Too many attempts. Wait five minutes.' }, { status: 429 });
  }

  const { passcode, name } = await req.json().catch(() => ({ passcode: '', name: '' }));
  if (!passcode || !passcodeMatches(String(passcode))) {
    return NextResponse.json({ error: 'Wrong passcode.' }, { status: 401 });
  }

  const label = String(name || 'staff')
    .trim()
    .slice(0, 24)
    .replace(/[^\w\s-]/g, '') || 'staff';

  const session = issueSession(label);
  const store = await cookies();
  store.set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: session.maxAge,
  });

  await prisma.auditLog.create({ data: { actor: label, action: 'SIGN_IN', entity: 'Session' } });
  return NextResponse.json({ ok: true, staff: label });
}

/** Sign out. */
export async function DELETE() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
