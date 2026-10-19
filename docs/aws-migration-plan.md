# AWS migration plan (GRI-8)

Status: **proposal for the product owner.** This document changes no infrastructure. It records a
plan only. `REQUIREMENTS.md` §6 and `DATA.md` stay as they are until a phase ships; the ticket
that ships a phase updates them.

Written 2026-10-19 by the architect role, from the code on `main` at `515a7ee`.

## Decisions so far (Peter, 2026-10-19)

- **D1: no server copy of session progress.** The plan stops after Phase 1. Phases 2–4 and tickets
  T4–T11 are not planned. Convex is retired, and AWS holds no app data for now. Progress stays on
  the device (C2).
- **D2: a dedicated AWS account on the Paid plan.**
- **Still open:** D3 (region, only matters once something runs on AWS) and D8 (Supabase plan). To
  answer D8: Supabase dashboard → the project → Settings → Billing shows "Free" or "Pro".
- **What this means for AWS now:** only the Phase 0 guardrails (budgets, anomaly monitor, GitHub
  OIDC role). Expected AWS cost: **$0 a month**. New backend services default to AWS (TypeScript on
  Lambda) and must fit the same $10 budget; each one gets its own cost row in §6.2 before it ships.

---

## 1. Summary and recommendation

1. Move only the Convex job to AWS. Keep everything else where it is.
2. Production Convex holds no user data today. The sync routes refuse every request in
   production, and the web app never starts sync. So there is no data to lose. Phase 1 checks this
   before anything is deleted.
3. Replace Convex with one DynamoDB table and one Lambda function (TypeScript, Node, arm64). The
   Lambda sits behind a Lambda function URL. The Cloudflare gateway forwards `/sync/*` to it.
4. Keep the gateway on Cloudflare Workers. Moving it gives no saving and adds cold starts, a
   custom-domain problem and a new secret store.
5. Keep Supabase for accounts, profiles, memberships, invites and shared people. Row-level
   security (RLS) enforces C11 there. Do not rebuild that on AWS.
6. Keep Cloudflare Pages (web, marketing) and Cloudflare DNS. They are free and work.
7. Expected AWS cost: **about $0.44 a month** with the always-free allowances, and **about $1.06**
   without them. At 10× load: **about $4.31** with them, **about $8.68** without them. All four
   stay under $10 (§6.2).
8. Do step zero first: AWS Budgets alerts at $5 and $10, a cost-anomaly monitor, and a budget
   action that stops the sync Lambda at $10.
9. One decision comes before any AWS build: does Peter want a server copy of session progress at
   all? `C2` says drafts stay on the device. The old Convex design synced the whole session. The
   AWS store in this plan carries progress only (§4). If the answer is "no", do phases 0 and 1
   only. AWS then holds nothing and costs nothing.

---

## 2. Current architecture inventory

Mapped from the code, not from memory. Files are named so each row can be checked.

| Component | Platform | What it does | Data held |
|---|---|---|---|
| `apps/web` | Cloudflare Pages `griever-guidance-web` → `web.grieversguidance.com` | React app; offline-first (IndexedDB, localStorage) | None on the server. Static files only |
| `apps/marketing` | Cloudflare Pages `griever-guidance-marketing` → `grieversguidance.com`, `www.` | Astro static site | None |
| `apps/gateway` | Cloudflare Worker `griever-guidance-gateway` → `api.grieversguidance.com` (`wrangler.toml` `routes`, `custom_domain`) | Hono app; CORS (`CORS_ORIGINS`) and routing only (`src/worker.ts`). `nodejs_compat` flag | None |
| `GET /health` | Worker | Smoke-test target | None |
| `libs/identity`: `GET/PUT /me/profile` | Worker → Supabase PostgREST as the caller | Sender name, contact source | `profiles` row (Supabase) |
| `libs/gateway-flows`: `GET /members`, `POST /invites`, `POST /invites/accept`, `DELETE /invites/:id`, `DELETE /members/:memberId` | Worker → Supabase RPC as the caller; Resend for invite email | Family sharing | `memberships`, `invites` (Supabase) |
| `/flows` routes (#131) | Not built | Shared person facts | Will be `flows` (Supabase) |
| `libs/gateway-messages`: `POST /obituary` | Worker → `api.anthropic.com/v1/messages` (`claude-haiku-4-5-20251001`, `max_tokens: 600`) | AI obituary draft. Flagged off in the UI (`VITE_FEATURE_OBITUARY_DRAFTING`) | None stored. `ANTHROPIC_API_KEY` is not set by `deploy.yml`, so production answers 500 |
| `libs/gateway-sync`: `GET /sync/pull`, `POST /sync/push` | Worker → Convex Cloud (`ConvexHttpClient`, `CONVEX_URL`) | Cursor sync (DATA.md §4) | None in the Worker |
| `libs/gateway-auth` | Worker | Supabase JWT check against JWKS (5-minute cache), PostgREST client as the caller | None |
| Convex Cloud (prod) and self-hosted Docker (dev) | Convex | `sessions`, `counters` tables (`apps/gateway/convex/schema.ts`); `sync.pull`/`sync.push`; daily purge cron at 09:00 UTC (`crons.ts`); `deleteEverything` mutation | **None in production in practice.** `requireUser` (`convex/auth.ts`) throws unless `GG_DEV_AUTH=1`, which `scripts/check-dev-auth.mjs` keeps out of production. `#140` states the sync "never ran in production". The web app calls `setSyncUserId(null)` (`apps/web/src/app/app.tsx`), so it sends no sync requests. Note: `deleteEverything` still refers to a `users` table that the schema no longer has |
| `libs/data-sync` | Browser | Outbox flush, cursor pull, merge, triggers (idle 5 s, 60 s tick, pagehide, online). `flush` sends nothing when the outbox is empty | Device only |
| `libs/data-local` | Browser | IndexedDB stores. The send flow does not write the outbox yet (DS-2 "Not started") | Device only |
| Supabase Auth | Supabase | Email and password accounts. JWKS for the gateway | `auth.users` |
| Supabase Postgres | Supabase | `profiles`, `memberships`, `invites`, `flows` with RLS; definer functions for invites; pgTAP tests (`infra/supabase/tests/*`) | Account and shared-person data |
| Resend | Resend | Invite emails from `INVITE_FROM_EMAIL` | Recipient email (in transit) |
| DNS zone `grieversguidance.com` | Cloudflare (Tumultywebservices account) | All records; Worker custom domain | — |
| CI `ci.yml` | GitHub Actions | Typecheck, test, build (Nx affected); Supabase RLS tests; Playwright e2e | — |
| CD `deploy.yml` | GitHub Actions | After green CI on `main`: Supabase `db push`, `npx convex deploy`, `wrangler deploy` (with `CONVEX_URL`), Pages deploys, smoke tests | Secrets: `CONVEX_DEPLOY_KEY`, `CONVEX_URL`, `CLOUDFLARE_*`, `SUPABASE_*`, `RESEND_API_KEY` |
| Cron and queues | — | Only the Convex purge cron. No queues anywhere | — |

### Current usage (assumptions, stated)

The repo has no analytics and no usage numbers. Web accounts went live on 2026-10-11, eight days
ago. Sync sends no traffic in production. So:

- **Today:** assume fewer than 100 accounts. Convex rows: assumed 0 (Phase 1 checks it).
- **Expected (design point):** 1,000 monthly active accounts. That is 10× today's assumed ceiling.
- **10× load:** 10,000 monthly active accounts.
- **Sync calls per active account per month:** 150 pushes (only when the outbox has edits; edits
  coalesce) and 300 pulls (boot, back online, before a session swap). 450 calls in total.
  Expected: 450,000 calls a month. 10×: 4.5 million.
- **Stored data:** about 3 sessions per account, about 1 KB each (progress only, §4). Expected:
  about 3 MB. 10×: about 30 MB.

---

## 3. Target placement

| Component | Target | Reason |
|---|---|---|
| Web app (static) | **Cloudflare Pages** (stays) | Free. Global CDN. Deploys already work. S3 + CloudFront would cost money and add a second CDN for no user gain |
| Marketing site | **Cloudflare Pages** (stays) | Same reason |
| DNS, TLS, custom domains | **Cloudflare** (stays) | The zone is there. A Route 53 hosted zone costs $0.50 a month ([Route 53 pricing](https://aws.amazon.com/route53/pricing/)) and gives nothing new |
| Gateway (Hono) | **Cloudflare Workers** (stays) | See §5. No cold starts, free plan, custom domain already wired, CORS already correct |
| `/me/profile`, invites, members, `/flows` | **Worker → Supabase** (stays) | RLS is the guarantee for C11 and for "a user reaches only their own row". Moving it means rebuilding RLS by hand in Lambda code. That weakens a database-level rule into application code |
| Accounts (Auth) | **Supabase** (stays) | Accounts are live. Moving users to Cognito means a password reset for every user. A grieving user must not meet that |
| Shared people (`flows`) | **Supabase** (stays) | Same RLS reason (C11) |
| `/obituary` | **Worker** (stays) | One outbound `fetch`. Awaiting a fetch is not CPU time on Workers. No reason to move |
| Invite email | **Resend** (stays) | Works. SES would need domain verification and sandbox exit for no gain |
| **Convex `sessions` + `counters`** | **AWS: DynamoDB + Lambda** | Peter's decision: Convex is dropped for an AWS solution. Serverless TypeScript fits his default stack |
| **Convex purge cron** | **AWS: DynamoDB TTL** | TTL deletes expired items "without consuming write throughput" ([DynamoDB TTL](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html)). No scheduler needed |
| Infrastructure definition | **AWS CloudFormation**, run with the AWS CLI (`aws cloudformation deploy`) | Peter wants the AWS CLI. A template gives a reviewable diff, rollback on a failed update and drift detection. No CDK or Python tooling |

**Not used on AWS, on purpose:** API Gateway, Route 53, CloudFront, NAT gateway, VPC, Secrets
Manager, customer-managed KMS keys, S3, SQS, SNS, EventBridge Scheduler, Cognito, SES. Each one
either costs money at rest or does a job that something above already does. SQS is in Peter's
default stack, but no work here is asynchronous: push is a short synchronous write.

---

## 4. Convex replacement design

### 4.1 What it is for, and what it is not

It is the server half of DATA.md §4: a per-account, cursor-based backup of each session, so that a
user's own second device can restore it and so that a lost phone does not lose the record.

It **does not**:

- hold drafts, edited wording (`messageOverride`), recipients, who was told, contact ids or contact
  data (C2, C3). The Convex design synced `screens` whole with `v.any()`, including
  `selectedContactIds` and `hearsFirstIds`. That is no longer allowed: since the family-sharing G1,
  C2 says "drafts, edited wording and who was messaged stay on the device", and C3 bans contact ids
  in flow sync. The AWS store accepts a **progress-only whitelist** and rejects anything else.
- hold person facts. Those are in Supabase `flows` (shared with members). A second copy here would
  disagree with it.
- share anything with members. Each account sees only its own partition.
- send, queue or schedule anything. No SMS path (C1).
- block the app. The device stays authoritative. Every failure is silent and retried (C5, DATA.md
  §4.6).

**The progress-only whitelist** (lives in `libs/shared`, used by client and server):
`sessionId`, `schemaVersion`, `status`, `cursorScreen`, `lastOpenedAt`, `createdAt`, and per
screen key only `{ status, updatedAt }` plus, for `C1`, each moment's `{ key, status, completedAt }`.
No `values` other than that. Unknown screen keys are kept (DATA.md §2 rule 5), but only their
`status` and `updatedAt`. Item size stays near 1 KB.

**Prerequisite:** nothing writes the outbox today (DS-2 "Not started"). Without DS-2 the store
receives nothing. DS-2 is a ticket in §10.

### 4.2 Data model (one table, `gg-sync`)

On-demand capacity, Standard table class, encryption with the AWS-owned key (no cost), TTL on
`purgeAt`, deletion protection on, CloudFormation `DeletionPolicy: Retain`.

| Item | `pk` | `sk` | Other attributes |
|---|---|---|---|
| Session | `USER#<supabase user id>` | `SESSION#<sessionId>` | `seq` (Number), `updatedAt` (server ms), `deletedAt` (ms or absent), `deviceId`, `doc` (whitelisted map), `purgeAt` (epoch seconds; set only when soft-deleted) |
| Counter | `USER#<id>` | `COUNTER` | `next` (Number: the last `seq` handed out), `opMax` (map: `deviceId` → highest applied `opId`) |

**Local secondary index `bySeq`:** partition `pk`, sort `seq`. The counter item has no `seq`
attribute (it uses `next`), so the index is sparse and holds sessions only.

Why an LSI and not a GSI: a GSI is eventually consistent only. A pull that reads a GSI could see
`seq` 8 before `seq` 7 is visible, move the cursor to 8, and skip 7 for ever. That is silent data
loss. An LSI supports strongly consistent reads, so the cursor never skips. The LSI limit (10 GB
per partition key) is far above one account's few kilobytes.

The user id is the Supabase `sub` from a verified JWT. That answers the old open question of how
`auth.users.id` maps to `sessions.userId` (ID-6), and it retires `GG_DEV_AUTH`.

### 4.3 Access patterns

| Pattern | DynamoDB call |
|---|---|
| Pull (`GET /sync/pull?cursor=N&limit=100`) | `Query` on `bySeq`: `pk = USER#id AND seq > N`, ascending, `Limit 101`, `ConsistentRead: true`. Returns tombstones too (DATA.md §4.2) |
| Push (`POST /sync/push`) | Read the counter (`GetItem`, strongly consistent). Then one `TransactWriteItems`: update the counter (`next = N + k`, condition `next = N`, and each op's `opId` > `opMax[deviceId]`), and put each session with its new `seq`. On a condition failure, re-read and retry up to 3 times |
| Previous-sessions list | Same pull from cursor 0 over the sparse index. The doc is small, so no separate index |
| Delete one session (settings only, C9) | A push op `session.delete` sets `deletedAt` and `purgeAt = deletedAt + 90 days`, with a new `seq` |
| Delete everything (settings only) | `Query` all items for `pk`, then `BatchWriteItem` deletes. No tombstones (DATA.md §7) |
| Purge at 90 days | DynamoDB TTL on `purgeAt`. Pull filters out items past `purgeAt`, so an item waiting for TTL is never served |

### 4.4 How the DATA.md protocol maps over

| DATA.md rule | Convex today | AWS design |
|---|---|---|
| §4.1 per-user gapless `seq`, never a timestamp | `nextSeq` inside a Convex transaction | Counter item updated in the same `TransactWriteItems` as the rows, guarded by `next = N`. A failed transaction allocates nothing, so there are no gaps |
| §4.2 pull loops until `hasMore` is false | `by_user_seq` index | `bySeq` LSI with consistent reads |
| §4.2 live subscription | Convex reactive query | **Dropped.** No WebSocket. The 60 s foreground tick and the boot and online pulls cover it. DATA.md already says multi-device is "a restore story, not a live one" |
| §4.3 idempotent by `opId` (last 1,000 per user) | Array on `counters` | `opMax` per device on the counter. `opId` is an auto-increment per device outbox, so "not greater than the max" means "already applied". Constant size, not 1,000 entries |
| §4.3 ordered per session; coalescing | Client side | Unchanged (client side) |
| §4.4 per-screen last-writer-wins on `updatedAt` | Server merges | Server merges in the Lambda before the put, same rule, same clamp (`serverUpdatedAt` in every ack) |
| §7 soft-delete, 90-day hard purge | Daily cron, full table scan | TTL. Deletion happens "typically within a few days" after `purgeAt`; reads hide it from day 90 |
| §7 delete everything now | `deleteEverything` mutation | Same, as a gateway route, settings only |

### 4.5 Consistency and failure modes

- **Two devices push for one account at once:** one transaction fails its `next = N` condition and
  retries. Both land. No lost write.
- **Lambda times out after the commit:** the client retries; `opMax` makes the retry a no-op that
  still returns the ack.
- **AWS is down, or the $10 budget action has fired:** the gateway answers 503; the client backs
  off (1 s → 5 min) and says nothing. The device keeps working (C5).
- **A record fails the whitelist:** 400 for that batch (C8). The client logs nothing and keeps the
  op for the next attempt, the same as today.
- **Clock skew:** handled by the existing clamp (DATA.md §4.4).

---

## 5. The gateway: stay on Workers or move to Lambda

| Factor | Cloudflare Workers (today) | Lambda |
|---|---|---|
| Cost | Free plan: 100,000 requests a day, 10 ms CPU per call. Paid: $5 a month minimum, 10 M requests included ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)) | Requests $0.20 per million and $0.0000166667 per GB-s ([Lambda pricing](https://aws.amazon.com/lambda/pricing/)). A custom domain needs API Gateway (HTTP API $1.00 per million after a 12-month free tier, [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/)) or CloudFront. Function URLs have no custom domain ([HTTP invoke choice](https://docs.aws.amazon.com/lambda/latest/dg/furls-http-invoke-decision.html)) |
| Latency | Runs at the edge, near the user | One region. Every call crosses to that region |
| Cold starts | None in practice | Present on Node. Visible on `/me/profile` and invites, which are account actions the user waits for |
| `CORS_ORIGINS` | Hono `cors()` with an explicit list; tested | Same Hono code works. Function URL CORS must stay off, or headers duplicate (the Lambda docs warn about `'*, *'`) |
| Hono adapter | `export default app` | `handle(app)` from `hono/aws-lambda`; `process.env` works the same |
| Secrets | `RESEND_API_KEY` is a Worker secret, free | Secrets Manager $0.40 per secret a month ([pricing](https://aws.amazon.com/secrets-manager/pricing/)) or SSM Parameter Store standard (free, [pricing](https://aws.amazon.com/systems-manager/pricing/)) |
| Deploy | `wrangler deploy`, already in `deploy.yml` | New pipeline |

**Recommendation: keep the gateway on Workers.** It is free, faster for the user, and already
correct. Only the sync store moves.

**How the Worker reaches the Lambda.** `libs/gateway-sync`'s router on the Worker forwards
`/sync/*` (method, query, body and the caller's `Authorization` header) to `SYNC_FUNCTION_URL`
(a public `wrangler` var, not a secret). The Lambda verifies the Supabase JWT itself with
`libs/gateway-auth`. Rule 2a holds: the web app still calls only `api.grieversguidance.com`.

I weighed the Worker calling DynamoDB directly (SigV4 with `aws4fetch`). It saves the hop, but it
needs a long-lived IAM access key stored on Cloudflare. The Lambda route needs no AWS key outside
AWS at all. The extra hop and any cold start fall on background sync, which the user never sees.

---

## 6. Cost

### 6.1 Free-tier rules that apply

- **New accounts (sign-up flow since 2025):** a **Free plan** with $100 credit at sign-up and up to
  $100 more. It ends after 6 months or when credits run out. Then "you will need to upgrade to a
  Paid plan", and "if you don't upgrade your account within 90 days, AWS will permanently erase
  your AWS account and all its content" ([Free Tier FAQs](https://aws.amazon.com/free/free-tier-faqs/),
  [AWS Free Tier](https://aws.amazon.com/free/)). **Do not run production on the Free plan.** Upgrade
  to the Paid plan in step zero.
- **Always free (both plans):** "All customers, new and existing, can access over 30 services with
  always free offers" ([FAQs](https://aws.amazon.com/free/free-tier-faqs/)). The Lambda pricing page
  lists 1 M requests and 400,000 GB-s a month. The DynamoDB page lists 25 GB storage and 25 WCU/25
  RCU of **provisioned** capacity, and says on-demand request units are not in it
  ([DynamoDB on-demand pricing](https://aws.amazon.com/dynamodb/pricing/on-demand/)). CloudWatch:
  5 GB of logs and 10 alarms a month ([CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)).
- **12-month offers that end:** API Gateway's 1 M calls a month (not used here).
- **Credits** are temporary. This plan does not count on them.

**The rule this plan follows:** the total must stay under $10 **even with every free allowance set
to zero.** The table shows both.

### 6.2 Cost table (us-east-1 list prices)

| Service | Expected usage (1,000 accounts) | 10× usage | Price and source | Expected $/month (free tier / none) | 10× $/month (free tier / none) |
|---|---|---|---|---|---|
| Lambda requests | 0.45 M | 4.5 M | $0.20 per 1 M ([Lambda](https://aws.amazon.com/lambda/pricing/)) | 0.00 / 0.09 | 0.00 / 0.90 |
| Lambda compute (256 MB, 150 ms avg incl. init) | 16,875 GB-s | 168,750 GB-s | $0.0000166667 per GB-s, x86 rate used as the upper bound ([Lambda](https://aws.amazon.com/lambda/pricing/)) | 0.00 / 0.28 | 0.00 / 2.81 |
| DynamoDB writes (on-demand; push = 2 items × 2 WRU, transactional) | 0.6 M WRU | 6 M WRU | $0.625 per 1 M WRU ([DynamoDB](https://aws.amazon.com/dynamodb/pricing/on-demand/)) | 0.38 / 0.38 | 3.75 / 3.75 |
| DynamoDB reads (on-demand; consistent; ~1 RRU per pull, plus counter read per push) | 0.45 M RRU | 4.5 M RRU | $0.125 per 1 M RRU (same page) | 0.06 / 0.06 | 0.56 / 0.56 |
| DynamoDB storage | ~3 MB | ~30 MB | $0.25 per GB-month; first 25 GB free (same page) | 0.00 / 0.00 | 0.00 / 0.01 |
| DynamoDB backups / PITR | Off | Off | PITR $0.20 per GB-month (same page) | 0.00 | 0.00 |
| CloudWatch Logs (WARN level, ~200 B per call, 14-day retention) | ~0.09 GB | ~0.9 GB | $0.50 per GB ingested; 5 GB free ([CloudWatch](https://aws.amazon.com/cloudwatch/pricing/)) | 0.00 / 0.05 | 0.00 / 0.45 |
| CloudWatch alarms (Lambda errors, Lambda throttles) | 2 | 2 | $0.10 per alarm; 10 free (same page) | 0.00 / 0.20 | 0.00 / 0.20 |
| Function URL | — | — | "no additional charges for the URL endpoint" ([HTTP invoke choice](https://docs.aws.amazon.com/lambda/latest/dg/furls-http-invoke-decision.html)) | 0.00 | 0.00 |
| Data transfer out | ~1 GB | ~9 GB | 100 GB a month free, all services ([EC2 pricing page, data transfer](https://aws.amazon.com/ec2/pricing/on-demand/)) | 0.00 | 0.00 |
| KMS | AWS-owned / AWS-managed keys only | same | Customer key $1 a month; not used ([KMS](https://aws.amazon.com/kms/pricing/)) | 0.00 | 0.00 |
| Secrets Manager / Parameter Store | None needed (only public values: Supabase URL and anon key) | same | $0.40 per secret ([Secrets Manager](https://aws.amazon.com/secrets-manager/pricing/)); standard parameters free ([SSM](https://aws.amazon.com/systems-manager/pricing/)) | 0.00 | 0.00 |
| AWS Budgets (2 budgets, 1 with an action) | 2 | 2 | Monitoring free; first two action-enabled budgets free ([Budgets](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/)) | 0.00 | 0.00 |
| Cost Anomaly Detection | 1 monitor | 1 | "with no effort or cost" ([CAD FAQs](https://aws.amazon.com/aws-cost-management/aws-cost-anomaly-detection/faqs/)) | 0.00 | 0.00 |
| IAM, STS, GitHub OIDC provider, CloudFormation | — | — | No charge (IAM, STS); CloudFormation free for AWS resource types (not re-checked, see §11) | 0.00 | 0.00 |
| Route 53, API Gateway, NAT, CloudFront, S3 | Not used | Not used | — | 0.00 | 0.00 |
| **Total** | | | | **0.44 / 1.06** | **4.31 / 8.68** |

Plain reading: with the always-free allowances, the bill is about **$0.44** expected and **$4.31**
at 10× (on-demand DynamoDB requests are not in the free tier). With no free tier at all: about
**$1.06** and **$8.68**. All four stay under $10.

**Lever if spend nears $5:** switch the table to provisioned 10 WCU / 10 RCU. That sits inside the
always-free 25/25, so DynamoDB requests cost $0. Throttles only delay invisible sync. I did not
make this the default because it adds a throttle path to test, and on-demand already fits.

**Non-AWS costs after the move:** Cloudflare $0 (free plans), Supabase $0 on the Free plan, Convex
$0 (removed). Watch the Workers free cap: at 10× with sync on, sync alone is about 150,000 Worker
requests a day, above the 100,000 free. That needs Workers Paid ($5 a month), which is a Cloudflare
cost, not AWS. See decision D7.

### 6.3 Step zero: guardrails (before any resource that can cost money)

1. Upgrade the account to the **Paid plan**, so it can never auto-close.
2. Root user: MFA on, no access keys. Daily work through IAM Identity Center or an IAM user with
   MFA.
3. **AWS Budgets**, cost type "unblended", monthly:
   - `gg-monthly-5`: alert at 100% of $5 actual, and at 100% of $5 forecast. Email to Peter.
   - `gg-monthly-10`: alert at 80% and 100% of $10 actual. At 100% actual, a **budget action**
     sets the Lambda's reserved concurrency to 0, so it is no longer invoked or billed. A deny-all
     IAM policy alone would not stop paid invocations. Callers get an error and back off silently.
     With D1 = no there is no Lambda yet, so this applies to the first AWS service that ships.
4. **Cost Anomaly Detection:** one "AWS services" monitor, individual email alerts, absolute
   threshold $1.
5. Lambda **reserved concurrency 5** on the sync function, as a hard ceiling on spend from abuse of
   the public function URL. (New accounts can have a low concurrency quota; see §11.)
6. Every log group created by the stack, with a 14-day retention. Lambda log level WARN, system log
   level WARN.

All of this is in one CloudFormation template (`infra/aws/guardrails.yaml`) applied with
`aws cloudformation deploy`. Budgets and anomaly monitors are CloudFormation resource types.

---

## 7. Security and constraints

### 7.1 Constraints C1–C11

| # | Touched? | Impact and guard |
|---|---|---|
| C1 | No | No SMS or email path on AWS. Invites stay on Resend |
| C2 | **Yes** | The store must never hold drafts, wording, recipients or who was told. Guard: the progress-only whitelist in `libs/shared`, checked on the client before the outbox and again in the Lambda; the Lambda never logs a body; tests that a payload with `values.messageOverride` or `drafts` is rejected. This is narrower than the Convex design on purpose |
| C3 | **Yes** | No contact ids. The Convex design carried `selectedContactIds` and `hearsFirstIds`; the whitelist drops them. Test: a payload carrying either is a 400 |
| C4 | No | Contacts never leave the device |
| C5 | **Yes** | Sync stays invisible and non-blocking. AWS outage, cold start, throttle and the $10 kill switch all degrade to "retry later" with no UI |
| C6 | No | Identity stays Supabase. No friends list |
| C7 | No | No new copy |
| C8 | **Yes** | Every Lambda route validates query and body with the shared parsers before any DynamoDB call |
| C9 | **Yes** | Delete routes exist only for the settings screen. No route deletes from inside a flow |
| C10 | No | — |
| C11 | No (guarded) | Stays in Supabase RLS. AWS holds no person, membership or ownership data, so it cannot weaken C11 |

Also kept: **no service-role key anywhere.** The Lambda holds only the public Supabase URL and anon
key, and verifies JWTs through the public JWKS. Tokens travel in the `Authorization` header and are
never logged (REQUIREMENTS §4 Privacy).

### 7.2 IAM, least privilege

- **Sync Lambda execution role:** `dynamodb:GetItem`, `Query`, `PutItem`, `UpdateItem`,
  `DeleteItem`, `BatchWriteItem`, `ConditionCheckItem` on the `gg-sync` table ARN and
  `table/gg-sync/index/*` only. `logs:CreateLogStream`, `logs:PutLogEvents` on its own log group
  only (the stack creates the group, so no `CreateLogGroup`). Nothing else.
- **GitHub Actions deploy role, through OIDC.** No long-lived AWS keys in GitHub. IAM OIDC
  provider `token.actions.githubusercontent.com`; trust condition `aud = sts.amazonaws.com` and
  `sub = repo:grieverguidetech/griever-guidance:environment:production` (a GitHub environment, so
  the `workflow_run` trigger matches). Permissions: `lambda:UpdateFunctionCode`, `GetFunction`,
  `PublishVersion`, `UpdateAlias`, `GetAlias` on the one function ARN. CI does not change
  infrastructure; Peter applies template changes with the AWS CLI.
- The budget action's own role may only attach the one deny policy to the one execution role.

### 7.3 Secrets, region, retention

- **Secrets on AWS: none.** No Secrets Manager or Parameter Store entry is needed.
- **Region:** the same US region as the Supabase project, so JWKS fetches on a cold start stay
  short. If that is `us-east-1`, use it. Data stays in the US. See D3.
- **Retention parity with DATA.md §7:** soft-delete, hidden from reads at 90 days, physically
  removed by TTL within a few days after. "Delete everything" is immediate. CloudWatch logs carry
  no user content and expire at 14 days. No backups or PITR: the device is authoritative and the
  store is a backup itself. A backup copy would also outlive a "delete everything".

---

## 8. Phased migration

Each phase ships on its own, with a cut-over and a rollback. No phase blocks the app.

### Phase 0: guardrails (no app change)

- Do: §6.3 steps 1–6, plus the GitHub OIDC provider and deploy role.
- Check: `aws budgets describe-budgets`, `aws ce get-anomaly-monitors`, a test budget notification.
- Rollback: delete the stack. Nothing in the app depends on it.

### Phase 1: retire Convex (rescopes #140)

1. Peter runs, on his own machine with the production deploy key: `npx convex export` (zip of every
   table) and records the row counts of `sessions` and `counters`. Expected: 0 and 0.
2. Keep the export for 30 days in Peter's own encrypted storage. Not in the repo, not on S3.
3. If counts are 0: remove `apps/gateway/convex`, the Convex client in `libs/gateway-sync`,
   `scripts/check-dev-auth.mjs`, the `convex:*` scripts, `infra/convex`, and from `deploy.yml` the
   check-dev-auth step, `npx convex deploy` and `--var CONVEX_URL`. `/sync/*` answer 404 until
   Phase 2. The web app sends no sync calls today, so users see no change.
4. If counts are not 0: stop and bring it to a gate. The rows can only come from a deploy that had
   `GG_DEV_AUTH` set. Recommend import through the Phase 2 store with the whitelist applied (fields
   outside it are dropped, as C2/C3 require), after a row-count check on both sides.
5. Update REQUIREMENTS DS-1, DS-4, ID-6 and §6 "Stack"/"Database", and DATA.md §3, §6, §7, in the
   same PR.
- Cut-over: merge; CD deploys; the existing smoke tests (`/health`, web shell, marketing, 401s) pass.
- Rollback: revert the PR. The Convex Cloud project still exists for 30 days.
- After 30 quiet days: Peter deletes the Convex Cloud project and the GitHub secrets
  `CONVEX_DEPLOY_KEY` and `CONVEX_URL` (a product-owner action, as #140 asks).

> **Phases 2–4 are not planned (D1 = no, 2026-10-19).** They stay below as the design to reuse if a
> server copy of progress is ever wanted.

### Phase 2: build the AWS store dark (only after D1 says yes)

- Do: `infra/aws/sync.yaml` (table, LSI, TTL, function, alias `live`, function URL on the alias,
  log group, 2 alarms); the DynamoDB store in `libs/gateway-sync`; `apps/sync-function` (Hono via
  `hono/aws-lambda`); the Worker forwarding `/sync/*` when `SYNC_FUNCTION_URL` is set.
- Tests: unit tests with a mocked client; an integration job in CI against DynamoDB Local in Docker,
  the same idea as the Supabase "real migrations" rule (SELF_IMPROVEMENT 2026-10-11): a stub cannot
  see condition expressions or LSI consistency.
- CI/CD: a new `deploy-sync` job in `deploy.yml`, before `deploy-gateway`:
  `permissions: id-token: write`; `aws-actions/configure-aws-credentials` with the OIDC role;
  esbuild bundle → zip → `aws lambda update-function-code` → `aws lambda wait function-updated` →
  `publish-version` → `update-alias live`. New smoke checks: tokenless `GET
  https://api.grieversguidance.com/sync/pull?cursor=0` → 401, and the same against the function
  URL → 401.
- Cut-over: none for users. The web app still does not start sync.
- Rollback: `aws lambda update-alias --function-version <previous>` for code; unset
  `SYNC_FUNCTION_URL` to turn the route off; the table is retained.

### Phase 3: turn on session backup on web

- Needs DS-2 (the send flow writes the outbox) and Phase 2.
- Do: `setSyncUserId` passes the Supabase user id; `createGatewayTransport` sends the bearer token
  instead of `x-gg-user`. Behind a `FEATURE_SESSION_BACKUP` repo variable, off by default.
- Cut-over: Peter sets the variable and re-runs the deploy.
- Rollback: unset the variable. Devices keep everything locally; the server copy is additive, so
  turning it off loses nothing.

### Phase 4: mobile

Later, after mobile accounts are on. Same transport.

**Zero data loss, in one line:** production Convex holds nothing (checked in Phase 1, with an export
kept 30 days), the device stays authoritative throughout, and the AWS store only ever adds a copy.

---

## 9. Risks and open decisions for Peter

| # | Decision or risk | Recommendation |
|---|---|---|
| D1 | **Do you want a server copy of session progress at all?** C2 keeps drafts on the device, so the store can hold progress only (which moments are done, which screen to resume). Value: restore progress on a second device or after a lost phone. Cost: a new service to run | Do Phases 0–1 now. Decide D1 before Phase 2. If "no", stop after Phase 1: AWS then holds nothing and the budget guardrails cost $0 |
| D2 | **Which AWS account, and which plan?** A Free-plan account closes after 6 months or when credits run out, and is erased 90 days later | A dedicated account for Grievers Guidance, upgraded to the Paid plan in step zero |
| D3 | **Region.** I could not see the Supabase project's region from the repo | Use the Supabase project's region. Default `us-east-1` |
| D4 | **How "managed with the AWS CLI" works.** Raw CLI scripts, or CloudFormation applied with the CLI | CloudFormation templates in `infra/aws/`, applied with `aws cloudformation deploy`. Reviewable, can roll back, free |
| D5 | **Purge timing.** TTL removes items "within a few days" after day 90, not at day 90 exactly | Accept, with reads hiding them from day 90. Reword DATA.md §7 when Phase 2 ships |
| D6 | **$10 kill switch.** The budget action stops sync at $10 | Yes. Sync is invisible and the device is authoritative, so stopping it is safe |
| D7 | **Cloudflare Workers free cap** (100,000 requests a day). At 10× with sync on, it is exceeded | Not a problem at today's size. Revisit at 3,000+ active accounts; Workers Paid is $5 a month |
| D8 | **Supabase Free plan:** "paused after 1 week of inactivity", no automatic backups ([Supabase pricing](https://supabase.com/pricing)) | Check which plan the project is on. A pause stops every sign-in. Move to Pro ($25 a month) before sharing ships to real families. Not an AWS cost |
| D9 | **`POST /obituary` has no auth and no rate limit.** Today it answers 500 because no key is set | Before the flag goes on, require a signed-in JWT and add a per-user limit. Separate ticket; not AWS |
| D10 | **Delete the Convex Cloud project** | After 30 quiet days following Phase 1 |
| R1 | Public function URL could be called directly | JWT check on every call, reserved concurrency 5, budgets and kill switch |
| R2 | New accounts may not allow reserved concurrency (low default quota) | If so, request a quota increase, or rely on the budget action until it is granted |
| R3 | Cold start on sync (Node + AWS SDK) | Invisible by design (C5). Keep the bundle small (esbuild, only `@aws-sdk/client-dynamodb`) |
| R4 | `deploy.yml` uses `python3` to read a JWT role | Out of scope here, but replace it with `node -e` in the Phase 2 CI ticket, since Python is dropped |
| R5 | `convex/crons.ts` `deleteEverything` refers to a `users` table that no longer exists | Moot once Phase 1 deletes it; do not port it as is |

---

## 10. Proposed tickets (not created)

| # | Title | Size | Depends on |
|---|---|---|---|
| T1 | [infra] AWS guardrails: Paid plan check, budgets $5/$10 with kill-switch action, anomaly monitor, GitHub OIDC provider and deploy role (`infra/aws/guardrails.yaml`, `infra/aws/README.md`) | S | D2, D3 |
| T2 | [data] Export production Convex and record row counts (PO-run; result on the issue) | S | — |
| T3 | [sync] Retire Convex: remove functions, client, scripts, deploy steps; `/sync/*` off; update REQUIREMENTS and DATA (rescopes #140) | M | T2 |
| T4 | [shared] Progress-only session whitelist and parsers (C2, C3, C8) | S | D1 |
| T5 | [data] DS-2: send flow writes the `data-local` outbox, through the whitelist | M | T4 |
| T6 | [sync] DynamoDB store in `libs/gateway-sync` (pull, push, delete, delete everything) with DynamoDB Local integration tests | M | T4 |
| T7 | [infra] Sync stack: table, LSI, TTL, function, alias, URL, log group, alarms (`infra/aws/sync.yaml`) | S | T1, D1 |
| T8 | [sync] `apps/sync-function`: Hono on Lambda, JWT through `libs/gateway-auth` | S | T6 |
| T9 | [gateway] Forward `/sync/*` to `SYNC_FUNCTION_URL` | S | T8 |
| T10 | [ci] `deploy-sync` job with OIDC, alias rollback and new smoke checks; replace the `python3` check with Node | M | T1, T7, T8 |
| T11 | [web] Turn on session backup behind `FEATURE_SESSION_BACKUP`; bearer token replaces `x-gg-user` | S | T5, T9, T10 |
| T12 | [gateway] Auth and rate limit on `POST /obituary` (D9, independent) | S | — |

Files are disjoint across T4/T6/T7/T8/T9 (shared, gateway-sync, infra, new app, gateway app).

---

## 11. What I checked / did not check

**Checked (this session):**

- Code: `apps/gateway` (worker, wrangler.toml, convex/*), `libs/gateway-sync`, `gateway-messages`,
  `gateway-flows`, `identity`, `gateway-auth`, `data-sync`, `apps/web/src/lib/registerSync.ts`,
  `apps/web/src/app/app.tsx` (sync unbound), `infra/supabase/migrations/*`, `infra/convex/README.md`,
  `.github/workflows/deploy.yml` and `ci.yml`, issues #140, #131, #135, #136 (`gh`).
- Prices by WebFetch, on 2026-10-19, from the pages cited in each row. Several AWS pricing pages did
  not render their tables, so some figures (DynamoDB request and storage rates, CloudWatch Logs,
  Secrets Manager, KMS requests, API Gateway HTTP) come from the worked examples on those same pages.

**Did not check:**

- **The AWS MCP tools did not work.** `search_documentation`, `read_documentation` and
  `run_script` all returned "Unknown tool". So I did not use the AWS Price List API, and I did not
  read the account's Free Tier state, plan, region or concurrency quota.
- That the always-free tier names Lambda's 1 M requests and 400,000 GB-s explicitly. The Free Tier
  pages say "30+ services" without naming them. The cost table does not depend on it.
- Lambda arm64 prices (the x86 rate is used as an upper bound), DynamoDB provisioned rates,
  CloudFormation pricing, and S3 rates.
- That Lambda's system log level WARN suppresses the START/END/REPORT lines.
- The real row count in production Convex. Phase 1 step 1 checks it.
- Real traffic and account numbers. All usage figures are the stated assumptions in §2.
- Cloudflare and Supabase dashboards (current plans and usage), and the Supabase project region.
- Convex's current pricing (the page did not render).
- No code changed, so I ran no typecheck, tests or build. I ran no AWS command of any kind.
