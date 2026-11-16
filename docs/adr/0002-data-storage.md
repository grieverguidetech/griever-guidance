# 0002: Data storage on DynamoDB behind the data function

Status: proposed, waiting for the product owner. Ticket: #885.

## Context

This records a decision that is already made and built. Until late October 2026 the app had two
backends. Convex held the session sync (`/sync/pull`, `/sync/push`) and, before #37, the identity
tables. Supabase held accounts (Supabase Auth) and the shared people data (Postgres with RLS, #130).

The Convex sync never worked in production. It ran only with a dev auth stub (`GG_DEV_AUTH`), and
its data was test data (#140, #203, DATA.md §6). The goal of #203 was to pay for and look after one
less service. Peter agreed to delete it on 2026-10-24 (#203 comment, PR #288).

On 2026-10-19 Peter decided to remove Supabase and move data to AWS, with the gateway kept on
Cloudflare Workers (commit 0fa71de, `docs/aws-migration-plan.md`). The first draft of that plan had
recommended keeping Supabase, for RLS and to avoid a password reset (commit abcac27). The plan's
version 4 sets an AWS budget of $10 a month for all AWS services (`docs/aws-migration-plan.md`).
Convex and Supabase held only test data and 3 to 4 test users, so no data was moved (plan decision 9,
#287).

## Decision

1. **DynamoDB is the only server database.** User data is in one table, `gg-data`, with keys `pk`,
   `sk` and one index, `gsi1` (`infra/aws/data.yml`, DATA.md §5 "Shared people"). Profiles,
   memberships, invites and people are items in that table. A second table, `gg-content`, holds no
   user data (REQUIREMENTS §6 "Database").
2. **No RDS or Postgres.** The smallest RDS Postgres instance costs more than the whole $10 AWS
   budget (plan decision 2).
3. **One data function owns the data.** The Lambda `gg-app-data` (Node 22, arm64) is the only code
   that reads or writes the tables (`docs/aws-data-function.md`, plan point 2). It has one user
   endpoint, `POST /v1 {action, args}`, with exactly the actions in `DATA_ACTIONS`
   (`libs/shared/src/dataApi.ts`, DATA.md §5).
4. **Access rules are TypeScript, not RLS.** The rules are `libs/data-access/src/rules/*`. They
   replaced Supabase RLS and definer functions, and they enforce C11 (DATA.md §5, plan point 5).
   Row locks became conditional DynamoDB transactions (plan point 6).
5. **The gateway stays on Cloudflare Workers** (plan decision 4). The plan gives the reason: it is
   free, with no cold starts (`docs/aws-migration-plan.md`, "Apps and features"). It checks the
   token, validates input (C8) and calls the data function. Domain logic stays in the
   `libs/gateway-*` libs and `libs/identity` (REQUIREMENTS §6 rule 2b).
6. **Accounts are Clerk.** The data function stores the profile, not the email (plan decision 1,
   DATA.md "The profile item").

### Security boundary (already true)

- **Only the gateway holds server credentials** (REQUIREMENTS §6 rule 2a). The apps call the
  gateway's REST routes. The AWS key pair and the service secret are Worker secrets
  (REQUIREMENTS §6 "Environment variables").
- **The Function URL uses `AWS_IAM`.** The gateway signs each call with SigV4 as the IAM user
  `gg-app-data-worker` (`libs/gateway-auth/src/dataFunction.ts`). That user can only invoke this
  function through its URL and cannot read the tables. An unsigned call gets 403
  (`docs/aws-data-function.md` §8, #281 comment).
- **The Clerk token is checked twice.** The gateway checks it, then forwards it in
  `x-gg-user-token`. The data function checks it again, and every user action runs as that caller
  (DATA.md §5 "Access rules", plan point 4).
- **The service path has a second lock.** `POST /internal/delete-user` takes no user token. It needs
  the SigV4 check and the shared secret in `x-gg-service-secret` (`DATA_SERVICE_SECRET`, compared in
  constant time). With no secret set it answers 404 (DATA.md §7 "Account deletion", #327).

### What this does not do

- **No server copy of contacts, contact ids or message wording.** Contacts and ids never reach the
  gateway or the data function (C3, C4). Drafts, `messageOverride` and who was messaged stay on the
  device (C2, DATA.md §5 "What never syncs"). The four planning messages do sync (ADR 0001).
- **No server copy of session progress** (plan decision 6). The cursor sync in `libs/data-sync` is
  kept but unused. Only `apps/web/package.json` lists it, and no source imports it (DATA.md §4,
  PR #288). Person sync is `useFlowSync` in `libs/hooks`.
- **No reads from `gg-content` yet.** The table exists, and no action reads it (REQUIREMENTS §6
  "Database").
- **No automated deploy of the data function.** Peter deploys it by hand, because the deploy role
  cannot create IAM roles (`docs/aws-data-function.md`).

## Trade-offs accepted

- **Rules in code, not in the database.** The first plan said this "weakens a database-level rule
  into application code" (commit abcac27). Version 4 accepts it because the plan ports every pgTAP
  case to Vitest against DynamoDB Local (plan point 7, "Fit for DynamoDB").
- **Longer code for memberships and invites.** Their rules join several rows. In DynamoDB this needs
  extra key items and transactions (plan, "Fit for DynamoDB").
- **A long-lived AWS key on the Worker.** Workers cannot use OIDC. The key can only invoke the
  function, the function checks the user token too, and the key is rotated every 90 days (plan
  point 3, `docs/aws-data-function.md`).
- **One region.** Everything runs in `us-east-2`, because the account's SCP allows only that region
  (#185, `docs/aws-data-function.md`).
- **The 90-day session purge cron went with Convex** (DATA.md §7). Deleted people are purged by a
  DynamoDB TTL instead (#216).

## Consequences

A new server field goes through the data function and the shared key list (ADR 0001), never into a
second store. Changing the data function means a hand deploy before the merge when clients send new
keys (ADR 0001 addendum, "Deploy order"). Moving off DynamoDB or the Workers gateway needs a new ADR.

## Open questions for the product owner

1. Why was Supabase replaced at all? Commit 0fa71de says only that Peter decided on 2026-10-19. The
   first draft (commit abcac27) had recommended keeping it.
2. Why AWS, and not another host for the data function? No issue or doc gives the reason.
3. Is the $10 a month AWS budget still the limit to judge future storage choices by?
