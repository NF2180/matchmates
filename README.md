# MatchMates 🏏

A mobile-first cricket match organizing and scoring platform. **Phase 1**: match creation, player profiles, WhatsApp invites, attendance tracking.

## Stack

- React + TypeScript + Vite
- Tailwind CSS v4
- Supabase (Postgres + REST API)
- Hosted on GitHub Pages as a PWA-ready SPA

## Project Setup (already done for this repo)

### 1. Database

Run `supabase/schema.sql` in your Supabase project's SQL Editor (Dashboard → SQL Editor → New query → paste → Run). This creates all Phase 1 tables (`grounds`, `players`, `matches`, `participation`) with Row Level Security policies.

> **Security note:** Phase 1 has no authentication system. RLS policies are intentionally permissive (anyone with the anon key can read/write) because access control happens via the unguessable `join_token` shared through WhatsApp, not via Supabase auth. This should be revisited once a real auth layer is added.

### 2. Environment variables

Copy `.env.example` to `.env` and fill in your Supabase project URL and anon key (found in Supabase Dashboard → Settings → API):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

The anon key is safe to expose client-side — it's designed for this. Never use the `service_role` key in frontend code.

### 3. GitHub Pages deployment

This repo deploys automatically via GitHub Actions (`.github/workflows/deploy.yml`) on every push to `main`.

**One-time setup required in the GitHub repo settings:**

1. Go to **Settings → Pages** → set Source to **GitHub Actions**
2. Go to **Settings → Secrets and variables → Actions** → add two repository secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

After that, every push to `main` rebuilds and redeploys automatically.

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Architecture notes

- **Routing**: uses `HashRouter` (not `BrowserRouter`) because GitHub Pages can't do server-side rewrites — hash routing avoids 404s on refresh for any deep link.
- **No-auth join flow**: players identify themselves with name + mobile number (no OTP in Phase 1 — would require a paid SMS provider like Twilio wired into Supabase Auth). Returning players are remembered via `localStorage` on their device.
- **Dedup**: players are matched by mobile number on join, so the same person joining multiple matches reuses one profile automatically.
- **Future phases**: schema is designed to extend cleanly — `matches.sport` already supports future sports, and team/scoring tables (Phase 2+) will reference `participation` records without altering them, per the PRD's requirement that downstream modules never mutate scoring data.

## Known gaps (by design, for Phase 1)

- No OTP/phone verification
- No team creation or live scoring (Phase 2)
- No statistics or match history beyond a basic list (Phase 3)
- No voice scoring (Phase 4)
