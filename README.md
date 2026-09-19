# LevelOne KTV Booking

Mobile-first KTV room booking for LevelOne Cafe Lucena. One Next.js application,
one Postgres database, deployed on Railway.

Customers scan a QR code, pick a room and time, pay with the venue's existing
QRPh code, and upload proof. Staff use the same system for walk-ins, so online
and walk-in reservations can never collide.

---

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 15 (App Router) + TypeScript — UI and API in one repo |
| Styling | Tailwind CSS, LevelOne brand tokens |
| Database | PostgreSQL (Railway managed) |
| ORM | Prisma |
| Hosting | Railway |
| Proof storage | Postgres by default; any S3-compatible bucket if configured |
| Email | Optional SMTP; the dashboard queue works without it |

Timezone is fixed to `Asia/Manila` for everything a customer sees; timestamps are
stored as UTC.

---

## Deploy: GitHub → Railway

### 1. Push to GitHub

```bash
cd levelone-ktv
git init
git add .
git commit -m "LevelOne KTV booking system"
git branch -M main
git remote add origin https://github.com/<your-org>/levelone-ktv.git
git push -u origin main
```

### 2. Create the Railway project

1. Go to **railway.com → New Project → Deploy from GitHub repo** and pick the repo.
2. In the same project: **New → Database → Add PostgreSQL**.
3. Open the app service → **Variables** → add a reference variable
   `DATABASE_URL` pointing at the Postgres service's `DATABASE_URL`
   (Railway offers this in the variable picker — don't paste the string by hand,
   the reference survives credential rotation).

### 3. Set the remaining variables

On the app service → Variables:

| Variable | Value |
| --- | --- |
| `ADMIN_PASSCODE` | The passcode staff type at `/admin`. Long and random. |
| `SESSION_SECRET` | 32+ random characters. `openssl rand -base64 32` |
| `NEXT_PUBLIC_SITE_URL` | `https://book.levelone.ph` (or the Railway URL for now) |
| `MAIL_TO` | Front-desk inbox for new payment alerts (optional) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | Optional |
| `S3_*` | Optional — see *Payment proof storage* below |

See `.env.example` for the full list.

### 4. Deploy

Railway reads `railway.json`:

- build: `npm ci && npm run build`
- start: `npm run release && npm start`

`npm run release` runs `scripts/setup-db.mjs`, which is idempotent and runs on
every deploy. It pushes the schema, installs the `booking_no_overlap` exclusion
constraint, and seeds the three rooms on first run only.

### 5. Finish

1. **Settings → Networking → Generate Domain**, then point
   `book.levelone.ph` at it with a CNAME.
2. Visit `/api/health` — expect `{"ok":true,"db":"up"}`.
3. Visit `/admin`, sign in with `ADMIN_PASSCODE`, open **Settings**, confirm
   opening hours and rates.
4. Print a QR code pointing at `https://book.levelone.ph` for the tables.

---

## Local development

```bash
npm install
cp .env.example .env        # point DATABASE_URL at any Postgres
npm run db:setup            # schema + constraint + rooms
npm run dev
```

---

## How double-booking is prevented

Three layers, in order:

1. **Availability is computed server-side** from the database on every request.
   The browser's view is a snapshot and is never trusted.
2. **Re-checked inside the write transaction** (`assertFree`) immediately before
   a hold or booking is created.
3. **Postgres exclusion constraint** — `booking_no_overlap` makes two
   overlapping live reservations for the same room physically impossible, even
   if two requests interleave at the same millisecond. This is the guarantee;
   layers 1 and 2 just make the error message friendly.

Blocking statuses: `HELD`, `PAYMENT_SUBMITTED`, `CONFIRMED`, `CHECKED_IN`.

## Booking lifecycle

```
customer proceeds to pay   →  HELD (expires in 10 min, configurable)
proof uploaded in time     →  PAYMENT_SUBMITTED   (slot stays blocked)
hold lapses                →  EXPIRED             (slot reopens)
staff approves             →  CONFIRMED
staff rejects              →  PAYMENT_REJECTED (new short hold to resend)
                              or CANCELLED (slot reopens immediately)
walk-in paid in cash       →  CONFIRMED directly
on arrival / after         →  CHECKED_IN → COMPLETED
```

Expired holds are swept lazily on every availability read and write, so an
abandoned checkout never wedges a room.

## Payment proof storage

Proofs never touch the repo or the Railway filesystem — both are ephemeral.

- **Default:** bytes are stored in Postgres and served only through
  `/api/admin/proof/[id]`, which requires a staff session. Fine at this volume.
- **S3-compatible:** set `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
  (and `S3_ENDPOINT` for Cloudflare R2, Backblaze B2 or similar). Objects are
  private with random keys; the dashboard reads them via 15-minute presigned
  URLs. Switch whenever you like — new uploads follow the new setting.

Accepted: JPG, PNG, WebP, PDF, up to 8 MB.

## Routes

| Path | Who |
| --- | --- |
| `/` | Customer landing page |
| `/book` | Booking flow |
| `/pay/[token]` | QRPh payment + proof upload |
| `/booking/[token]` | Booking status / confirmation |
| `/admin` | Staff: today's timeline, payments, search, settings |
| `/admin/login` | Staff sign-in |
| `/api/health` | Railway healthcheck |

Public booking links use a random 24-byte token, not the database id, so nothing
is enumerable and no customer data leaks through a guessable URL.

## Configurable without a deploy

Set in `/admin` → Settings: opening and closing hours (closing may be after
midnight), hourly rates and the party-size threshold, minimum and maximum
guests, minimum and maximum hours, hold duration, and how far ahead customers
may book.

## Security notes

- No customer accounts, no customer passwords.
- Staff auth is a shared passcode plus an HMAC-signed, httpOnly session cookie
  (12 hours). Compared in constant time; rate-limited to 8 attempts per 5 min.
- Payment approvals, rejections, cancellations, extensions, moves, room blocks
  and settings changes are all written to `AuditLog` against the staff name.
- Public booking and upload endpoints are rate-limited per IP.
- `/admin` and `/api/` are excluded in `robots.ts`.

## Deliberately out of scope for V1

Loyalty programmes, customer accounts, POS integration, coupons, analytics
beyond daily revenue, and direct bank/QRPh API integration. The schema leaves
room for all of them.
