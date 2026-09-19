import { NextResponse } from 'next/server';
import { ConflictError } from './availability';
import { ValidationError } from './booking';
import { currentStaff } from './auth';

/**
 * Every /api/admin route runs through this: session check first, then a single
 * place that turns our error types into sensible HTTP responses and keeps
 * internal failures out of the response body.
 */
export async function withStaff(
  fn: (staff: string) => Promise<NextResponse | Response>,
): Promise<Response> {
  const staff = await currentStaff();
  if (!staff) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });

  try {
    return await fn(staff);
  } catch (err) {
    if (err instanceof ValidationError || err instanceof ConflictError) {
      return NextResponse.json(
        { error: err.message },
        { status: (err as { status?: number }).status ?? 400 },
      );
    }
    console.error('admin route failed', err);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
