# Grievers Guidance

Grievers Guidance helps someone who has just lost a loved one tell people when and where the
service is. The person using it is tired, overwhelmed, and on a phone. The app shows one next thing
and keeps everything else out of the way. Messages are texted from the user's own phone, one
contact at a time.

Product requirements are in [REQUIREMENTS.md](REQUIREMENTS.md). Architecture rules are in its
section 6.

## Constraints that shape the code

These are in [REQUIREMENTS.md section 2](REQUIREMENTS.md#2-non-negotiable-constraints). Breaking one
is a defect. The ones you will meet first:

- **Offline-first (C5).** Nothing after sign-up may wait on the network. The device is the source
  of truth.
- **Contacts stay on the device (C3, C4).** They never reach the gateway or Convex. Only contact
  ids appear in synced data, and only six fields are kept.
- **Messages go out through `sms:` deep links (C1).** One contact at a time, from the user's own
  phone. There is no backend SMS path.
- **Message content is never stored (C2).**
- **Calm copy (C7).** No exclamation points and no celebratory text.
- **Every gateway route validates its input (C8).**

## Layout

### Apps (`apps/`)

| App | What it is |
|---|---|
| `web` | React, Vite and Tailwind. The browser send flow and account screens. Dev port 5173. |
| `mobile` | Expo and React Native, core components only. The main user surface. |
| `gateway` | Hono on Cloudflare Workers (locally on `@hono/node-server`, port 3001). It composes the identity, messages and sync routers into one HTTP surface. It also holds the Convex functions in `apps/gateway/convex/`. `convex/identity.ts` is dead code and is removed in #37. |
| `marketing` | Astro. The public site. |
| `web-e2e` | Playwright end-to-end tests for the web app. Run in CI only. |

### Libraries (`libs/`)

| Library | What it is for |
|---|---|
| `shared` | Types, interfaces and message templates used by more than one project. |
| `api-client` | Gateway HTTP calls for the app, and the Supabase auth calls. Sync traffic goes through `data-sync` (and the web service worker). |
| `hooks` | Shared React hooks, such as `useSendFlow` and `useSupabaseIdentity`. Also the `sms:` link builder, `buildSmsLink`. No platform-specific code. |
| `ui-web` | Unused generator placeholder; being removed in #71. |
| `data-local` | IndexedDB storage in the browser: the session document, the outbox, and contacts. |
| `data-sync` | The offline sync engine. It flushes the outbox and pulls and pushes changes through the gateway. |
| `contacts` | Contact import logic shared by web and mobile: the source interface, normalizing, de-duplicating, and the review-and-commit steps. |
| `identity` | The gateway's account side. It verifies the Supabase access token and serves `GET` and `PUT /me/profile`. |
| `gateway-messages` | The gateway's AI-drafted obituary route. Nothing here sends messages. |
| `gateway-sync` | The gateway's Convex client and the `/sync/pull` and `/sync/push` routes. |

`identity`, `gateway-messages` and `gateway-sync` each own a Hono router and do not import each
other. `apps/gateway` only mounts them.

Other folders: `infra/supabase/` (migrations and database tests), `infra/convex/` (local Convex in
Docker, see its [README](infra/convex/README.md)), `scripts/` (deploy guard).

## Stack

- **pnpm and Nx.** Never npm or yarn.
- **Web:** React, Vite, Tailwind.
- **Mobile:** Expo SDK 54 and React Native 0.81. React is pinned to 19.1.0 (a root pnpm override).
- **Gateway:** Hono on Cloudflare Workers.
- **Accounts:** Supabase Auth and Postgres, with row-level security. Email and password only.
- **Session sync:** Convex. It is dev-only today: `/sync/*` is not usable in production yet.
- **Marketing:** Astro.
- **Tests:** Vitest and React Testing Library, jest-expo for mobile, pgTAP for the database,
  Playwright and axe for end-to-end.

## Local setup

You need:

- Node 22.
- pnpm 10.34.1. The `packageManager` field in `package.json` pins it; run `corepack enable` once so Corepack uses that version.
- Docker, for local Supabase and local Convex.
- The [Supabase CLI](https://supabase.com/docs/guides/cli). CI uses 2.116.0.

Then:

```sh
corepack enable
pnpm install
```

`pnpm install && pnpm dev` is enough for the default flow (auth off). Supabase and Convex are
only needed for accounts and sync.

Run things from the repo root:

```sh
pnpm dev            # gateway and web together
pnpm dev:gateway    # gateway on port 3001
pnpm dev:web        # web on port 5173
pnpm dev:mobile     # Expo
pnpm dev:marketing  # Astro
```

Env files, with your own values (never commit them):

- Web and mobile: copy `apps/<app>/.env.example` to `apps/<app>/.env.local`.
- Gateway: `apps/gateway/.env.local` for `CORS_ORIGINS` and the Supabase variables. The Convex
  admin key goes in `apps/gateway/.env` (see [infra/convex/README.md](infra/convex/README.md)).

 See [Environment variables](#environment-variables).

### Local Supabase

Accounts live in Supabase. The config and migrations are in `infra/supabase/`, so the CLI needs
`--workdir infra`:

```sh
supabase start --workdir infra      # start local Postgres and Auth (needs Docker)
supabase test db --workdir infra    # run the pgTAP row-level security tests
supabase stop --workdir infra
```

After `supabase start`, put its API URL and anon key in the gateway's `SUPABASE_URL` and
`SUPABASE_ANON_KEY`, and in the web app's `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Also set
`VITE_FEATURE_AUTH=true` to see the account screens.

### Local Convex (only for session sync)

```sh
pnpm convex:up      # start the self-hosted backend in Docker
pnpm convex:dev     # deploy apps/gateway/convex and watch for changes
pnpm convex:reset   # stop it and delete its data
```

The admin key steps are in [infra/convex/README.md](infra/convex/README.md).

### Feature flags

Each is off unless set to exactly `true`, at build time.

| Flag | Where | Turns on |
|---|---|---|
| `VITE_FEATURE_AUTH` | web | Sign-up and sign-in screens. |
| `EXPO_PUBLIC_FEATURE_AUTH` | mobile | Sign-up and sign-in screens. |
| `VITE_FEATURE_OBITUARY_DRAFTING` | web | AI obituary drafting. Without it the button is disabled. |

With auth off, onboarding starts at adding contacts and sync never starts.

## Environment variables

Names only. Never commit values. The examples live in `apps/*/.env.example`.

**`apps/gateway`**
- `PORT`
- `CORS_ORIGINS` (comma-separated allowed origins; empty blocks every cross-origin request)
- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` (public; there is no service-role key. The production slots are in
  `wrangler.toml` `[vars]` and are empty today, so `/me/*` answers 503 in production until they
  are set, see #45. Locally, unset also means 503.)
- `CONVEX_SELF_HOSTED_URL`, `CONVEX_SELF_HOSTED_ADMIN_KEY`, `CONVEX_SITE_URL` (local Convex only)
- `CONVEX_DEPLOY_KEY`, `CONVEX_URL` (GitHub secrets; CI and production only)

**`apps/web`**
- `VITE_API_URL`
- `VITE_FEATURE_AUTH`, `VITE_FEATURE_OBITUARY_DRAFTING`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (read only when `VITE_FEATURE_AUTH` is `true`)

**`apps/mobile`**
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_FEATURE_AUTH`
- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`

**`apps/marketing`**
- `PUBLIC_WEB_URL` (set in the deploy workflow)

## Testing

```sh
pnpm check            # typecheck, test and build everything (build skips mobile)
pnpm check:affected   # the same, only for projects changed since main
pnpm typecheck
pnpm test
pnpm build
```

- Libraries and web use **Vitest** with React Testing Library and `fake-indexeddb`.
- Mobile uses **jest-expo** (`pnpm nx test mobile`).
- The database uses **pgTAP** (`supabase test db --workdir infra`).
- Tests must not use `.only`, `.skip` or `.todo`. CI fails if they do.

**End-to-end tests run only in CI. Never run them on your machine** (no `pnpm e2e`, `nx e2e`, or
`playwright test`, including against production). Read results with `gh pr checks` and
`gh run view --log-failed`. The `E2E stress` workflow repeats the suite to find flaky tests. It is
started by hand, so ask first.

The `Mobile bundle` workflow checks that the Android bundle still builds with Metro. It is
separate from `ci.yml` so a mobile-only failure cannot block a deploy, and it is advisory for now.
`nx build mobile` needs the EAS CLI, so `pnpm build` leaves mobile out.

## CI and deploy

**`ci.yml`** runs on every pull request and every push to `main`. It has three jobs:

1. Check: forbid `.only`/`.skip`/`.todo`, then affected typecheck, test and build.
2. Supabase: start a local database and run `supabase test db`.
3. E2E: Playwright on desktop, Android and iPhone profiles.

**`mobile-bundle.yml`** runs on the same triggers and exports the Android bundle. It does not gate
deploys.

**`deploy.yml`** runs only after CI succeeds on a push to `main` (or by hand; a manual run skips the CI gate). It deploys:

- The gateway to Cloudflare Workers, after running Supabase migrations (`supabase db push`, skipped
  if the Supabase secrets are not set) and `convex deploy`. `scripts/check-dev-auth.mjs` stops the
  deploy if the dev auth stub is enabled.
- The web app to Cloudflare Pages.
- The marketing site to Cloudflare Pages.

A smoke test then checks `api.grieversguidance.com/health`, `web.grieversguidance.com` and
`grieversguidance.com`. Migrations must stay compatible with the gateway that is already live.

Live addresses: `grieversguidance.com`, `www.grieversguidance.com`, `web.grieversguidance.com`,
`api.grieversguidance.com/health`.

## How work is done here

- [AGENTS.md](AGENTS.md): ground rules, roles, and commands.
- [PROCESS.md](PROCESS.md): the loop from request to deploy, and the testing rules.
- Work is tracked on GitHub Project #4 (owned by `ptums`). One ticket is one branch and one pull
  request, and the pull request links its issue. Only a person merges.
