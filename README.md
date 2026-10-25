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
- **Contacts stay on the device (C3, C4).** They never reach the gateway. Only contact
  ids appear in synced data, and only seven fields are kept.
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
| `gateway` | Hono on Cloudflare Workers (locally on `@hono/node-server`, port 3001). It composes the identity, messages and flows routers into one HTTP surface. |
| `marketing` | Astro. The public site. |
| `web-e2e` | Playwright end-to-end tests for the web app. Run in CI only. |

### Libraries (`libs/`)

| Library | What it is for |
|---|---|
| `shared` | Types, interfaces and message templates used by more than one project. |
| `api-client` | Gateway HTTP calls for the app. Sync traffic goes through `data-sync` (and the web service worker). |
| `hooks` | Shared React hooks, such as `useSendFlow` and `useAccount`. Also the `sms:` link builder, `buildSmsLink`. No platform-specific code. |
| `data-local` | IndexedDB storage in the browser: the session document, the outbox, and contacts. |
| `data-sync` | The offline sync engine (outbox, cursor client, merge). It has no backend now that Convex is removed (#203) and no app uses it. |
| `contacts` | Contact import logic shared by web and mobile: the source interface, normalizing, de-duplicating, and the review-and-commit steps. |
| `identity` | The gateway's account side. It verifies the Clerk token and serves `GET` and `PUT /me/profile`. |
| `gateway-messages` | The gateway's AI-drafted obituary route. Nothing here sends messages. |

`identity`, `gateway-messages` and `gateway-flows` each own a Hono router and do not import each
other. `apps/gateway` only mounts them.

Other folders: `infra/aws/` (CloudFormation) and `infra/aws-local/` (local DynamoDB tools), `scripts/`.

## Stack

- **pnpm and Nx.** Never npm or yarn.
- **Web:** React, Vite, Tailwind.
- **Mobile:** Expo SDK 54 and React Native 0.81. React is pinned to 19.1.0 (a root pnpm override).
- **Gateway:** Hono on Cloudflare Workers.
- **Accounts:** Clerk. **Data:** DynamoDB behind an AWS Lambda data function. Supabase was retired (#326).
- **Session sync:** none. Convex was removed (#203).
- **Marketing:** Astro.
- **Tests:** Vitest and React Testing Library, jest-expo for mobile, DynamoDB Local for the data function,
  Playwright and axe for end-to-end.

## Local setup

You need:

- Node 22.
- pnpm 10.34.1. The `packageManager` field in `package.json` pins it; run `corepack enable` once so Corepack uses that version.

Then:

```sh
corepack enable
pnpm install
```

`pnpm install && pnpm dev` is enough for the default flow (auth off). Clerk keys and the
data function (`pnpm dev:data`) are only needed for accounts and sharing.

Run things from the repo root:

```sh
pnpm dev            # gateway and web together
pnpm dev:gateway    # gateway on port 3001
pnpm dev:web        # web on port 5173
pnpm dev:mobile     # Expo
pnpm dev:marketing  # Astro
```

`pnpm dev:mobile` builds the workspace libs mobile imports first and rebuilds them on change (`mobile:watch-deps`); `pnpm nx run mobile:export` builds them first too.

Env files, with your own values (never commit them):

- Web and mobile: copy `apps/<app>/.env.example` to `apps/<app>/.env.local`.
- Gateway: `apps/gateway/.env.local` for `CORS_ORIGINS` and the Clerk and data function variables.

 See [Environment variables](#environment-variables).

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
- `CLERK_ISSUER`, `CLERK_AUTHORIZED_PARTIES` (public. The production slots are in `wrangler.toml`
  `[vars]`; the deploy workflow passes `CLERK_ISSUER` from the repo variable of the same name.)
- `DATA_FUNCTION_URL` and the other `DATA_FUNCTION_*` names (unset means `/me/*` answers 503).

**`apps/web`**
- `VITE_API_URL`
- `VITE_FEATURE_AUTH`, `VITE_FEATURE_OBITUARY_DRAFTING`
- `VITE_CLERK_PUBLISHABLE_KEY` (read only when `VITE_FEATURE_AUTH` is `true`)

**Production (GitHub repo variables, not secrets)**
- `CLERK_ISSUER`, `CLERK_PUBLISHABLE_KEY`, `DATA_FUNCTION_URL` (public values). The deploy workflow
  passes them to the gateway and the web build.
- `FEATURE_AUTH` becomes `VITE_FEATURE_AUTH` in the web build. To turn accounts on: set
  `FEATURE_AUTH=true` and re-run the deploy. With it `true`, the deploy stops if a Clerk
  variable is empty or the key looks like a secret key.
- Mobile (`EXPO_PUBLIC_*`, EAS) is not wired yet.

**`apps/mobile`**
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_FEATURE_AUTH`

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
2. AWS local stack: DynamoDB Local and an SES stand-in, for the data function tests.
3. E2E: Playwright on desktop, Android and iPhone profiles.

**`mobile-bundle.yml`** runs on the same triggers and exports the Android bundle. It does not gate
deploys.

**`deploy.yml`** runs only after CI succeeds on a push to `main` (or by hand; a manual run skips the CI gate). It deploys:

- The gateway to Cloudflare Workers.
- The web app to Cloudflare Pages.
- The marketing site to Cloudflare Pages.

A smoke test then checks `api.grieversguidance.com/health`, `web.grieversguidance.com` and
`grieversguidance.com`.

Live addresses: `grieversguidance.com`, `www.grieversguidance.com`, `web.grieversguidance.com`,
`api.grieversguidance.com/health`.

## How work is done here

- [AGENTS.md](AGENTS.md): ground rules, roles, and commands.
- [PROCESS.md](PROCESS.md): the loop from request to deploy, and the testing rules.
- Work is tracked on GitHub Project #4 (owned by `ptums`). One ticket is one branch and one pull
  request, and the pull request links its issue. Only a person merges.
