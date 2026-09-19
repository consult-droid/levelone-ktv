/**
 * Small in-memory limiter for the public endpoints. One Railway instance means
 * one bucket; if the service is ever scaled horizontally, swap the Map for
 * Redis. Enough to stop a script hammering the hold endpoint.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown').trim();
}

export function rateLimit(req: Request, scope: string, limit: number, windowMs: number): boolean {
  const key = `${scope}:${clientKey(req)}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
    }
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}
