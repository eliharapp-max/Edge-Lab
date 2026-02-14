# next-odds

This is a standalone Next.js 14 (App Router) project living alongside the existing Vite app.
The Vite app remains unchanged and separate.

## Setup

```bash
cd next-odds
npm install
```

Create `.env` from `.env.example` and fill in values.

## Run

```bash
npm run dev
```

Open http://localhost:3000 and visit `/odds`.

## Prisma migrations

Ensure `DATABASE_URL` is set, then:

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init_odds
```

## Cron endpoint (local)

```bash
curl "http://localhost:3000/api/cron/odds-refresh?secret=YOUR_CRON_SECRET"
```

## Notes

- This Next.js app is isolated in `next-odds/`.
- The Vite app in the repo root is untouched.
