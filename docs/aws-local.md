# Local AWS stack

This stack runs DynamoDB and an SES stand-in on your machine. It needs no AWS account and no real
keys. It supports the `aws-be` branch. Plan: `docs/aws-migration-plan.md` (v4).

## Start and stop

Docker must run on your machine.

```text
pnpm aws:up      # start DynamoDB Local (port 8100) and the SES stand-in (port 8105)
pnpm aws:seed    # create the tables and load the content
pnpm aws:down    # stop both and delete their data
```

- `pnpm aws:seed` is safe to run again. It replaces the content items with the same keys.
- `pnpm aws:tables` creates the tables only.
- The data lives in memory. After `pnpm aws:down`, run `pnpm aws:seed` again.

## What runs

| Service | Image or package | Port |
|---|---|---|
| DynamoDB Local | `amazon/dynamodb-local:3.1.0` | 8100 |
| SES stand-in | `aws-ses-v2-local` 2.10.2 (Node, from the root devDependencies, run in `node:22.22-alpine`) | 8105 |

Run `pnpm install` first. The SES container mounts the repo `node_modules` read-only, so it needs no network at start.
The SES stand-in keeps sent emails in memory. Read them with `GET http://localhost:8105/store`.
Clear them with `POST http://localhost:8105/clear-store`. No email leaves your machine.

## Tables

The code is in `libs/data-aws`. The scripts are in `infra/aws-local`.

| Table | Partition key | Sort key | Index |
|---|---|---|---|
| `gg-content` | `kind` | `id` | none |
| `gg-data` | `pk` | `sk` | `gsi1` on `gsi1pk` and `gsi1sk` |

- Plan v4 names `gg-content` and its keys. It does not name the keys of the data table.
  `gg-data` is the simplest choice: generic `pk` and `sk`, and one index (`gsi1`) for items that point at a user, used only by account deletion. No rule reads it.
  A later ticket can change it before any real data exists.
- `gg-data` has time to live (TTL) on one attribute, named `ttl` (epoch seconds). The table script turns it on, and checks first, so a second run changes nothing.
- The table script waits until each table is ACTIVE. If a table with the same name has other keys or indexes, it stops with an error. Run `pnpm aws:down` and start again.
- `seed` loads the "What you'll need" items, three samples and one example into `gg-content`.
- The checklist is a copy of the list in the web `WhatYoullNeed.tsx` (id, label, reason, and the SSN tip). A unit test compares them in full. It also compares label, reason and tip with the mobile screen, which has its own ids. `data-aws` depends on both apps in Nx, so `check:affected` runs this test when a screen changes.
- The sample and example texts come from the templates in `libs/shared`.

## Configuration

Code reads the endpoints from the environment. The names are in `.env.example`. If you set
nothing, the code uses the ports above. Never put real keys in the repo.

- The local config treats an empty variable as unset.
- It always uses fake credentials.
- It throws unless each endpoint host is `localhost`, `127.0.0.1` or `::1`. So a local run cannot reach real AWS.
- Real AWS needs its own config function, built later. It must leave `credentials` unset, so the SDK default chain applies (including `AWS_SESSION_TOKEN`). Nothing in `libs/data-aws` forces fake credentials onto such a config. A test checks this.

## Data function

One HTTP handler in `libs/data-access/src/handler`. It serves `POST /v1` only. The gateway calls it (#269).
AWS deploy is #281.

```text
pnpm aws:up && pnpm aws:tables
DATA_AUTH_ISSUER=... DATA_AUTH_JWKS_URL=... pnpm dev:data
```

- `pnpm dev:data` listens on `127.0.0.1:3002`, loopback only, against DynamoDB Local.
- The request body is `{ "action": "...", "args": { ... } }`. The user's token is in the `x-gg-user-token` header.
- Order of checks: user token (401), envelope (400), the action's args (400), then the rule. The first three never touch DynamoDB.
- Domain outcomes answer 200 with a `DataResult`. An unexpected error answers 500 with `{"error":"internal"}` and nothing else.
- A log line holds the action name and the error class. It never holds the token, an email or a token hash.
- `deleteUserData` has no route. `acceptInvite` is not wired until #272 lands: it answers 500.

| Action | `args` |
|---|---|
| `getProfile`, `listFlows`, `listMembers` | none |
| `putProfile` | `fields` (an object) |
| `createFlow` | `id` (uuid), `facts` (all six fact keys) |
| `updateFlow` | `id` (uuid), `patch` (fact keys only) |
| `createInvite` | `email`, `tokenHash` (64 lower-case hex) |
| `revokeInvite` | `id` (uuid) |
| `removeMember` | `memberId` |
| `acceptInvite` | `tokenHash` (64 lower-case hex) |

An unknown key in `args` is a 400.

### User token (Clerk)

`verifyToken.ts` checks the signature against the JWKS (RS256 only), the issuer and the expiry.
Keys are cached for 10 minutes. An unknown key id causes one refresh, at most once a minute.
It uses Hono's JWT code, the same call the `hono/jwk` middleware makes. It does not use the middleware: the middleware reads only `Authorization: Bearer`, and fetches the key list on every request.

| Variable | Meaning |
|---|---|
| `DATA_AUTH_ISSUER` | Expected `iss` claim, for example the Clerk frontend API URL |
| `DATA_AUTH_JWKS_URL` | The issuer's JWKS document |
| `DATA_AUTH_AUTHORIZED_PARTIES` | Optional. Comma list of allowed `azp` values (the app origins). If set and the token has `azp`, it must be in the list. A token with no `azp` is allowed, because mobile may send no Origin |
| `GG_DATA_TABLE` | Table name. Required on Lambda (no default) |
| `AWS_REGION` | Required on Lambda. Lambda sets it. Do not set `AWS_ENDPOINT_URL*` on the function: the SDK still reads them |

Required claims. Clerk's default session token has no email, so add `email` and `email_verified` in a Clerk session token customization (Sessions, Customize session token):

```text
{"email": "{{user.primary_email_address}}", "email_verified": "{{user.email_verified}}"}
```

Checks on time claims: `exp` must be present. `exp`, `iat` and `nbf` get 5 seconds of clock leeway.
The key list fetch times out after 3 seconds. If a refresh fails, cached keys stay in use. A cold start with no keys answers 500.

| Claim | Use |
|---|---|
| `sub` | User id (`user_...`). Must match the key rules in `keys.ts` |
| `exp` | Required. A token without it is refused |
| `email` | Trimmed and lower-cased. Missing or blank: 401 |
| `email_verified` | Boolean. Missing or not `true`: treated as not verified |

### Lambda bundle

`pnpm nx build data-access` writes one ESM file, `libs/data-access/dist/lambda.mjs`, for Node 22. The AWS SDK is bundled.
The entry is `handler` (function URL, payload format 2.0, `hono/aws-lambda`). On Lambda, `loadLambdaConfig` leaves credentials and endpoints unset, so the function role applies.

## Tests

```text
pnpm nx test data-aws
```

- Unit tests always run.
- Integration tests use the local stack. They run when DynamoDB Local and the SES stand-in answer.
  If they do not answer, those tests do not run, and Vitest lists them as skipped.
- The integration tests make their own tables with random names. They delete them at the end.
- In CI, `AWS_LOCAL_REQUIRED=true` is set. Then a test fails when the stack does not answer.
  So CI cannot pass without the integration tests.

## CI

The `aws-local` job in `.github/workflows/ci.yml` runs on pull requests into `aws-be` and on the pull request from `aws-be` into `main`. It
starts DynamoDB Local as a service container. It starts the SES stand-in as a process. It runs
`pnpm nx test data-aws`.

## DynamoDB Local differences that matter here

- **No transaction conflicts.** DynamoDB Local never raises `TransactionCanceledException` for a
  conflict between two requests. Race tests need a test double that raises one.
  Condition checks inside a transaction do work.
- **No IAM checks.** Any credentials work (only letters and digits). A test here cannot prove
  that a role has the right permissions.
- **No real limits or timing.** There are no throttling errors. Capacity settings do nothing.
  Point-in-time recovery and metrics are not available.
- **Index updates are not delayed.** Real indexes are eventually consistent. Local ones are not.
- **SES stand-in.** It does not check that sender addresses are verified. It does not apply
  sandbox limits or send real email.
