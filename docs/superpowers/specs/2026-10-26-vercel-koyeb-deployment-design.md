# E4S Vercel + Koyeb Free Deployment Design

## Intent

Move the E4S test deployment away from Render's exhausted monthly-hour allowance. The replacement must remain free for a small pilot, may cold-start after inactivity, must preserve the existing Supabase/PostgreSQL data and scenario accounts, and must not expose provider or email secrets to the browser.

## Goals

- Host the Vite frontend on Vercel and the Fastify API on one Koyeb Free Web Service.
- Keep the existing external PostgreSQL/Supabase database and S3-compatible object storage.
- Keep the API and background worker in the same Koyeb service because the free tier permits only one Web Service and no separate Worker Service.
- Preserve cross-origin cookie authentication, audio uploads/playback, AI generation, Resend email, migrations, demo data, and remote scenario-account seeding.
- Make deployment reproducible from the `gftsaimedia-cpu` branch without committing secrets.
- Keep Render configuration available until the new deployment passes smoke tests, so rollback is immediate.

## Non-goals

- Moving PostgreSQL into Koyeb's limited free database.
- Rewriting Fastify for Vercel Functions or Cloudflare Workers.
- Making a free Koyeb instance production-grade or eliminating cold starts.
- Supporting Vercel preview URLs against the production API in the first migration; only the production Vercel origin is allowed by CORS.

## Constraints and accepted trade-offs

- Koyeb Free provides one small Web Service and scales it to zero after inactivity. The first API request may be slow.
- The worker sleeps with the API. Queued jobs resume only after traffic wakes the service; this is acceptable for the pilot.
- The API and web use different sites (`*.koyeb.app` and `*.vercel.app`). Existing production cookies already use `Secure; SameSite=None`, and browser requests already use `credentials: "include"`; CORS must allow the exact production Vercel URL.
- Vercel's frontend environment variable is embedded at build time, so changing the Koyeb URL requires a Vercel redeploy.
- The Koyeb runtime must retain the tooling required by the existing migration/seed command. A dedicated Dockerfile is preferred over relying on buildpack pruning behavior.

## Approaches considered

1. **Selected: Vercel frontend + one Koyeb Free API/worker container + existing Supabase/S3.** Lowest migration risk, no backend rewrite, and no fixed 750-hour allowance.
2. **Google Cloud Run + Vercel.** Better regional choice and scaling, but requires a billing account and uses monthly resource quotas.
3. **Oracle Always Free VM + Vercel.** More compute and no sleep, but introduces server administration, patching, TLS, deployment, and capacity-management work.

## Target architecture

```text
Browser
  -> Vercel static site (React/Vite)
       -> HTTPS + credentials to Koyeb API
            -> Supabase/PostgreSQL
            -> S3-compatible storage
            -> Anthropic/Groq, media providers, Resend
            -> background worker in the same container
```

## Repository changes

### Vercel

- Add a root `vercel.json` that builds from the monorepo root using `pnpm --filter @e4s/web... build`, publishes `apps/web/dist`, and rewrites application routes to `index.html`.
- Add `VITE_API_BASE_URL=https://<koyeb-service>.koyeb.app` in the Vercel Production environment only.
- Deploy production from `gftsaimedia-cpu`.

### Koyeb

- Add a dedicated multi-stage `Dockerfile.koyeb` and `.dockerignore` so Koyeb builds the pnpm monorepo predictably with Node 24.
- Build the existing packages, API, and worker. Keep the runtime files required by `scripts/prepare-local.ts` until the bootstrap is later converted to compiled JavaScript.
- Start in this order:
  1. run the idempotent migration/demo/scenario bootstrap;
  2. launch the worker in the background;
  3. launch Fastify as PID 1 on `0.0.0.0:$PORT`.
- Configure HTTP health check `/api/readiness`.
- Deploy from the same production branch.

## Environment contract

### Koyeb public configuration

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `COOKIE_SECURE=true`
- `WEB_ORIGIN=https://<vercel-production>.vercel.app`
- `E4S_SEED_SCENARIOS=true`
- `E4S_ALLOW_REMOTE_SCENARIOS=true`
- `S3_REGION=us-east-1`
- `S3_EVIDENCE_BUCKET=e4s-evidence`
- `S3_MEDIA_BUCKET=e4s-media`
- provider/model names already used on Render

### Koyeb secrets

- `DATABASE_URL`
- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- `ANTHROPIC_API_KEY` and/or `GROQ_API_KEY`
- `PEXELS_API_KEY`, `PIXABAY_API_KEY` when used
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `AUTH_OTP_SECRET`

### Vercel build configuration

- `VITE_API_BASE_URL=https://<koyeb-service>.koyeb.app`

No API, database, storage, AI, or email secret is added to Vercel.

## Data and security

- Reuse the current `DATABASE_URL`; no export/import is required.
- Bootstrap remains idempotent. Scenario accounts retain their fixed IDs and are reconciled on startup.
- Preserve credentialed CORS with one exact production origin.
- Preserve `Secure; SameSite=None; HttpOnly` session cookies for cross-site authentication.
- Never print secret values in build logs, health responses, or documentation.

## Verification and cutover

1. Build the Koyeb image locally and run focused bootstrap, API readiness, CORS, identity, audio, and worker tests.
2. Deploy Koyeb and confirm `/api/readiness` returns `200` after a cold wake.
3. Verify scenario-account login directly against the Koyeb API.
4. Deploy Vercel with the final Koyeb URL.
5. Smoke-test learner, operator, and manager login; lesson completion; AI generation; mini game; weekly assignment; audio upload/replay; forgot-PIN email; and logout.
6. Wait more than one hour, then verify the first request wakes Koyeb and authentication still works.
7. Keep Render untouched during observation. Remove or pause Render only after the new pair passes all checks.

## Rollback

- Restore the previous Render web URL to users or redeploy Vercel with `VITE_API_BASE_URL=https://e4s-api.onrender.com`.
- Because both deployments use the same external database and S3 storage, rollback does not require data migration.

## Success criteria

- Vercel serves all SPA routes without 404s.
- Koyeb wakes from sleep and reaches readiness without manual intervention.
- All three roles authenticate and retain sessions across refreshes.
- API/worker jobs, scenario accounts, AI generation, email, and audio evidence work against existing persistent services.
- No secret is present in frontend output or Git history.
