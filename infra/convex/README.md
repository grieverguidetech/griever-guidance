# Local Convex backend

Self-hosted Convex, for development only. State lives in a Docker volume (SQLite) — this is not the
production backend.

```bash
docker compose up -d
docker compose exec backend ./generate_admin_key.sh
```

(or from the repo root: `pnpm convex:up`, then run the second command against
`infra/convex/docker-compose.yml`.)

- Backend: `http://127.0.0.1:3210`
- HTTP actions: `http://127.0.0.1:3211`
- Dashboard: `http://localhost:6791`

Copy the printed admin key into `apps/web/.env.local` (git-ignored — it is full administrative
access to this backend, treat it like a root password):

```
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=<paste>
VITE_CONVEX_URL=http://127.0.0.1:3210
```

Then deploy the functions in `convex/` against those env vars:

```bash
pnpm convex:dev
```

## Scripts (from the repo root)

- `pnpm convex:up` — start the backend + dashboard containers.
- `pnpm convex:dev` — deploy `convex/` functions and watch for changes.
- `pnpm convex:reset` — tear down the containers **and delete the volume** (wipes all local data —
  use this to get back to a clean schema, not casually).

## Mobile: reaching this backend from a simulator or device

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

## Re-pinning the image versions

`docker-compose.yml` pins both images by digest, not `:latest`, so a registry push upstream can't
move the backend under the team without a deliberate change here. To take a new version:

```bash
docker pull ghcr.io/get-convex/convex-backend:latest
docker inspect ghcr.io/get-convex/convex-backend:latest --format '{{index .RepoDigests 0}}'
# repeat for ghcr.io/get-convex/convex-dashboard, then paste both digests into docker-compose.yml
```
