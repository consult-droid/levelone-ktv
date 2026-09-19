import crypto from 'node:crypto';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'l1_staff';
const SESSION_HOURS = 12;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET is missing or too short.');
    }
    return 'dev-only-insecure-session-secret';
  }
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** Constant-time comparison so the passcode can't be probed by timing. */
export function passcodeMatches(input: string): boolean {
  const expected = process.env.ADMIN_PASSCODE ?? '';
  if (!expected) return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function issueSession(label = 'staff'): { value: string; maxAge: number } {
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  const payload = `${label}.${exp}`;
  return { value: `${payload}.${sign(payload)}`, maxAge: SESSION_HOURS * 3600 };
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [label, exp, mac] = parts;
  const expected = sign(`${label}.${exp}`);
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  if (Number(exp) < Date.now()) return null;
  return label;
}

/** Current staff identity, or null. Server components and route handlers. */
export async function currentStaff(): Promise<string | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function requireStaff(): Promise<string> {
  const staff = await currentStaff();
  if (!staff) throw new UnauthorizedError();
  return staff;
}

export class UnauthorizedError extends Error {
  status = 401;
  constructor() {
    super('Sign in to continue.');
  }
}
