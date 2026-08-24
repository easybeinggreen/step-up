# Step Up

Voice-guided daily workout routine tracker — a personal PWA for Paul.

## Setup

1. **Supabase** — project "step-up" already exists (`gfbwlelzwjwlgdakapwt`,
   region `ap-southeast-2`). Schema is in `supabase/schema.sql`.
2. **Env** — copy `.env.example` to `.env` and fill in
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see `PROJECT_NOTES.md` for
   the actual values already in use).
3. **GitHub repo secrets** — set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` as repo secrets so `.github/workflows/deploy.yml`
   can build.
4. **GitHub Pages source** — set to "GitHub Actions" in repo settings.
5. **Local dev**:
   ```bash
   npm install
   npm run dev
   ```

## Notes and honest caveats

- Voice input (`SpeechRecognition`) and real push notifications only work on
  a real Android Chrome install — not testable in a desktop preview browser.
- RLS is enabled on every table but permissive (`using (true)`) — this is a
  single-user app, not a real multi-tenant privacy boundary.
- See `PROJECT_NOTES.md` for full architecture, current status, and what's
  built vs. still to do.
