# SniffTown

A neighborhood dog community app for discovering familiar dogs, building packs, finding parks, and coordinating casual walks.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Supabase and Resend are accessed through Replit Connectors; no provider keys are stored in the codebase.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/snifftown-app/` — React/Vite customer app
- `artifacts/api-server/src/routes/` — Supabase-backed auth/community endpoints and Resend contact delivery
- `lib/api-spec/openapi.yaml` — source of truth for the frontend/backend API contract
- `artifacts/snifftown-app/src/index.css` — SniffTown visual tokens and global styling

## Architecture decisions

- Keep the browser on same-origin `/api` routes; the API server owns provider access and secure session cookies.
- Supabase remains the system of record so the app can build on the existing Lovable data.
- Public discovery works without an account; profile creation and pack actions require a verified Supabase session.

## Product

- Discover nearby dogs, Austin parks, and public packs.
- Sign up, verify email, sign in, and sign out with Supabase Auth.
- Create a dog profile and add nearby dogs to a pack.
- Send contact messages through Resend.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Apply `supabase/migrations/20261011120000_account_deletion_blocks_and_user_reports.sql` in the Supabase SQL editor before relying on account deletion, blocking or member reports. Until it is applied, block filters fall back to "nobody blocked" and `DELETE /api/auth/account` / reports return errors. `supabase/tests/account_deletion_blocks_and_user_reports.sql` is the matching rollback-only check.
- Member reports land in the Supabase `user_reports` table. Set `SNIFFTOWN_MODERATION_EMAIL` to also get an email for each report (sent through the Resend connector). App Store rules expect reports to be acted on within 24 hours.
- Mobile store builds use `artifacts/snifftown-mobile/eas.json`; production builds point the app at `https://snifftown.com/api`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
