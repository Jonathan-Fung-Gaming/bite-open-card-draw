# Phase 0 Cloud Project Prep

This document records the optional Phase 0.21 cloud setup work.

## Vercel

Status: PARTIAL PASS

Created Vercel project shell:

- Scope: `jonathansminigameparty`
- Project name: `bite-open-card-draw`
- Project ID: `prj_ErtnAKr3XvY7Ud3ftaNvyIDkzI5k`
- Root directory: `.`
- Node.js version: `24.x`
- Framework preset: `Other`

Notes:

- The framework preset is expected to remain `Other` until Phase 1 scaffolds the Next.js app.
- No Vercel environment variables were set during Phase 0.
- No `.vercel/` directory was committed.
- Link the local project and set framework/build settings after Phase 1 creates the app scaffold.

Commands run:

```bash
rtk vercel whoami
rtk vercel teams ls
rtk vercel project list --scope jonathansminigameparty
rtk vercel project inspect bite-open-card-draw --scope jonathansminigameparty
rtk vercel project add bite-open-card-draw --scope jonathansminigameparty
rtk vercel project inspect bite-open-card-draw --scope jonathansminigameparty
```

## Supabase

Status: PARTIAL PASS

Supabase CLI access works through `npx`:

```bash
rtk npx supabase --version
rtk npx supabase orgs list
rtk npx supabase projects list
```

Current observed Supabase organization:

- Organization name: `jfung9021's Org`

Current observed Supabase projects:

- `bite-open-card-draw` in `us-east-2`
- `jonathans-minigame-party` in `us-east-2`

Created/observed Supabase project shell:

- Project name: `bite-open-card-draw`
- Project ref: `gsiyqhkcgegjrvqcqioc`
- Region: `us-east-2`
- Status: `ACTIVE_HEALTHY`
- Database host: `db.gsiyqhkcgegjrvqcqioc.supabase.co`

Known browser-safe values have been provided outside Git:

- `NEXT_PUBLIC_SUPABASE_URL`
- Supabase publishable key

Do not paste the database password, service-role key, admin password, password hash, or session secret into chat or committed files.

Values to save privately after project creation:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
Database password
```

Do not add real values to Git. Add them to `.env.local` only after Phase 1 scaffolds the app, or set them in Vercel project settings when deployment work begins.

Local helper:

```bash
rtk powershell -NoProfile -ExecutionPolicy Bypass -File scripts/write-local-env.ps1
```

This helper writes `.env.local`, which is ignored by Git. It does not commit or print server-only values.

## Manual Phase 0 Work Remaining

- Save the Supabase database password in a private password manager.
- Retrieve and privately store the Supabase service-role key from the Supabase dashboard before server-side implementation work needs it.
- Decide whether the publishable key should be mapped to `NEXT_PUBLIC_SUPABASE_ANON_KEY` during Phase 1, or whether the app should rename the environment variable to Supabase's current publishable-key terminology.
- Generate `ADMIN_PASSWORD_HASH` later from the real shared admin password without committing or pasting the plaintext password.
- Generate `SESSION_SECRET` later and store it only in `.env.local` and Vercel environment variables.
- Store production/staging environment variables in Vercel project settings later; do not commit them.
- Link the Vercel project to the local repo after Phase 1 creates the Next.js app.
- `main` now exists on GitHub and is the repository default branch.
- Review the GitHub warning about `public/brand/tournament-logo.png` being larger than 50 MB and decide in Phase 1 or Phase 3 whether to replace it with an optimized committed asset or use external controlled storage.
