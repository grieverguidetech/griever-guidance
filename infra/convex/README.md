# Convex — local and production

Two separate Convex deployments, on purpose: a self-hosted one for local development, and a
Convex Cloud one for production. Nothing in `apps/gateway/convex/` differs between them — only
which deployment `npx convex dev`/`deploy` targets, chosen entirely by environment variables.

## Local (self-hosted, development only)

State lives in a Docker volume (SQLite) — this is not the production backend.

```bash
docker compose up -d
docker compose exec backend ./generate_admin_key.sh
```

(or from the repo root: `pnpm convex:up`, then run the second command against
`infra/convex/docker-compose.yml`.)

- Backend: `http://127.0.0.1:3210`
- HTTP actions: `http://127.0.0.1:3211`
- Dashboard: `http://localhost:6791`

Copy the printed admin key into `apps/gateway/.env` (git-ignored — it is full administrative
access to this backend, treat it like a root password):

```
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=<paste>
```

Then deploy the functions in `apps/gateway/convex/` against those env vars:

```bash
pnpm convex:dev
```

This also writes `CONVEX_URL` (and `CONVEX_SITE_URL`) to `apps/gateway/.env.local` automatically —
that's what the gateway's own runtime (`apps/gateway/src/app/convexClient.ts`) reads to reach
Convex. `apps/web` never sees any of this; it only ever calls the gateway (CLAUDE.md rule 2a).

## Production (Convex Cloud)

Production does **not** use the self-hosted Docker backend — it uses Convex's own managed cloud
hosting. `npx convex deploy`'s target selection only looks at `CONVEX_DEPLOYMENT` (local machine,
interactive) or `CONVEX_DEPLOY_KEY` (CI) — it never looks at `CONVEX_SELF_HOSTED_URL`, so this is
safe to run from a machine that also has local self-hosted env vars sitting in `apps/gateway/.env`.

**One-time setup (requires your own Convex account — interactive, can't be scripted):**

```bash
cd apps/gateway
npx convex login          # opens a browser to authenticate the CLI
npx convex deploy         # first run prompts to create/link a Convex Cloud project
```

Once the project exists, get the two values CI needs from the
[Convex dashboard](https://dashboard.convex.dev) for that project's **production** deployment:

- **Deploy key** (Settings → Deploy Keys → production) → GitHub secret `CONVEX_DEPLOY_KEY`.
- **Deployment URL** (Settings → URL & Deploy Key, looks like `https://happy-otter-123.convex.cloud`)
  → GitHub secret `CONVEX_URL`.

`.github/workflows/deploy.yml`'s `deploy-gateway` job uses these to (1) guard against the
`GG_DEV_AUTH` dev-auth stub ever reaching this deployment, (2) push `apps/gateway/convex`'s
schema/functions to it on every merge to `main`, and (3) tell the deployed Cloudflare Worker where
to reach it at runtime.

**Deploying by hand** (rare — CI does this on every push to `main`):

```bash
cd apps/gateway && npx convex deploy
```

## Scripts (from the repo root)

- `pnpm convex:up` — start the local backend + dashboard containers.
- `pnpm convex:dev` — deploy `apps/gateway/convex` functions to the **local** self-hosted backend
  and watch for changes.
- `pnpm convex:reset` — tear down the local containers **and delete the volume** (wipes all local
  data — use this to get back to a clean schema, not casually).
- `pnpm convex:deploy` — deploy to **production** (Convex Cloud), guarded by
  `scripts/check-dev-auth.mjs`.

## Mobile: reaching the local backend from a simulator or device

`127.0.0.1` inside the iOS Simulator or Android emulator refers to the simulator/emulator itself,
not your Mac — it will not reach a backend bound to your host's loopback. This costs an afternoon to
rediscover every time, so:

- **Android emulator**: run `adb reverse tcp:3210 tcp:3210` (and `tcp:3211` if you need HTTP
  actions) to tunnel the emulator's `localhost:3210` to your host's `127.0.0.1:3210`. Re-run this
  after every emulator restart — it doesn't persist.
- **iOS Simulator**: the simulator shares the host's network namespace, so `127.0.0.1:3210` from
  inside the simulator already reaches your Mac. No tunnel needed — this is the one case where
  `127.0.0.1` "just works."
- **A physical device** (either platform): use your machine's LAN IP instead of `127.0.0.1`
  (`ipconfig getifaddr en0` on macOS), and make sure the device is on the same network. Set
  `EXPO_PUBLIC_CONVEX_URL=http://<lan-ip>:3210` for that run rather than editing the shared env file.

## Re-pinning the local image versions

`docker-compose.yml` pins both images by digest, not `:latest`, so a registry push upstream can't
move the backend under the team without a deliberate change here. To take a new version:

```bash
docker pull ghcr.io/get-convex/convex-backend:latest
docker inspect ghcr.io/get-convex/convex-backend:latest --format '{{index .RepoDigests 0}}'
# repeat for ghcr.io/get-convex/convex-dashboard, then paste both digests into docker-compose.yml
```
