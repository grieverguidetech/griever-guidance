# AWS migration plan (GRI-8)

Status: proposal, version 4. This document does not change infrastructure. Date: 2026-10-20.

## Overview

We remove Supabase completely. Clerk replaces Supabase Auth, and users sign in with a magic link
(an email link, no password). Amazon DynamoDB replaces Supabase Postgres for all site data. We do
not use RDS. DynamoDB also holds the content that we show to users: the samples, the examples and
the "What you'll need" list. The API gateway stays on Cloudflare Workers. We remove Convex and add
short email alerts to Peter through Amazon SES. The AWS budget is $10 a month for all AWS services
together.

Peter's decisions:

1. **Accounts and sign-in move to Clerk, with magic link** (2026-10-20). This replaces decision 1
   of version 3 ("stay on Supabase Auth"). We do not use Cognito.
2. **All site data goes in DynamoDB. No RDS and no Postgres** (2026-10-20). The smallest RDS
   Postgres instance (db.t4g.micro) costs about $11.68 a month, plus about $2.30 for storage. That
   alone is more than the $10 budget. DynamoDB holds profiles, memberships, invites and shared
   people (`flows`).
3. **DynamoDB holds the content we show to users** (2026-10-20): the samples for the new-user intro
   (GRI-12), the example messages (GRI-16) and the "What you'll need" list items with their reasons
   (GRI-9, GRI-11, GRI-13). Each user's ticks stay on the device, as today.
4. The API gateway stays on Cloudflare Workers.
5. Convex is removed. Its replacement is an email alert to Peter, not a database.
6. We do not keep a server copy of session progress.
7. We use a dedicated AWS account on the Paid plan. All code is TypeScript and serverless.
8. Owner alerts: one email to Peter for each new account, with a summary of counts. Site-use
   counts come from the built-in Lambda and DynamoDB metrics in CloudWatch only. No digest, no
   custom metrics.

The plan in short:

1. **Clerk signs users in.** The web app uses Clerk's React SDK and the mobile app uses Clerk's
   Expo SDK. A user types an email address, gets a link, and taps it. There is no password to keep
   or reset, so the "forgot password" and recovery-link code goes away.
2. **One data function owns the data.** An AWS Lambda function (TypeScript) is the only code that
   can read or write the DynamoDB tables. The gateway calls it through a Lambda function URL with
   IAM sign-in (`AWS_IAM`). AWS rejects unsigned calls before our code runs.
3. **The gateway signs each call with one scoped AWS key.** Workers cannot use OIDC, so the key is
   a Worker secret. The key can only invoke this one function. It cannot read the tables. A stolen
   key alone cannot act as a user, because the function checks the user's token too. We rotate the
   key every 90 days: make a second key, put it in the Worker, deploy, then delete the old key.
4. **Clerk tokens are checked twice.** The gateway checks each Clerk session token against Clerk's
   public keys (JWKS), its issuer and its allowed origins (`libs/gateway-auth`). The data function
   checks the token again in the same way.
5. **Access rules move from the database to one module.** Today Postgres row-level security (RLS)
   and definer functions enforce "a user reaches only their own row", the invite rules and "members
   cannot create a person" (C11). After the move, one access-rules module in the data function
   enforces all of them. Each request runs as the user in the checked token. Nothing else can.
6. **Row locks become conditional writes.** Today `create_invite`, `accept_invite` and the C11
   trigger lock profile rows (`for update`). In DynamoDB, each of these writes uses one
   transaction (`TransactWriteItems`). The transaction updates the user's profile item only if its
   version number is still the one we read. If another request changed it first, the whole
   transaction fails and nothing is written. The profile also keeps a count of people owned, so
   "a joiner who owns people cannot join" is one condition.
7. **Every pgTAP case is ported.** There are 199 pgTAP assertions in 4 files today. Each one
   becomes a Vitest case that runs against DynamoDB Local in CI. We keep a list that maps each old
   case to its new case. We do not switch until every case passes. DynamoDB Local never raises
   transaction conflicts, so the race cases also use a test double that raises one.
8. **Content is read-only for users and cached at the edge.** The gateway serves `GET /content`
   from the content table and caches the answer in the Worker cache for 1 hour. Most requests never
   reach AWS. The apps also ship a bundled copy, so the intro and the list show when the user is
   offline or AWS is down. Peter edits content with a small script, not a deploy.
9. **One owner alert: a new account.** Clerk sends a `user.created` webhook to the gateway. The
   gateway checks the webhook signature and starts the alert function. Peter gets one email
   through SES with a summary of site use, counts only. No email carries a name, an email address,
   a person's details or message content (C1, C2).

**Fit for DynamoDB.** Profiles, shared people and content fit well: each is read by its key.
Memberships and invites fit least. Their rules join several rows (rate limits, "one open invite
per email", "one owner per member"). DynamoDB can do this with extra key items and transactions,
but the code is longer than the SQL it replaces. We accept this, because the 199 ported tests
guard it.

**The content table.** One table, `gg-content`, separate from user data. The key is the kind of
content plus its id:

| Kind (partition key) | Id (sort key) | Holds |
|---|---|---|
| `checklist` | a stable id, for example `ssn-and-id` | The label, the reason it is needed (GRI-9), and its order |
| `sample` | `announcement`, `service`, `thank-you` | The sample text for the new-user intro (GRI-12) |
| `example` | `service-message` | The example of a good message (GRI-16) |

The ticks on the device are keyed by the checklist id, so a checklist id never changes. To remove
an item, we mark it hidden and keep the id. Every item has a `version` number, so the apps can tell
when the bundled copy is out of date. Content has no user data, so it is not under C2.

**Moving users to Clerk.** Users keep their email address. They lose their password, because magic
link needs none. Before move day, we import each Supabase user into Clerk by email, with the email
marked as verified. Clerk makes a new user id. The import script records the old Supabase id next
to the new Clerk id. The data import then writes every item under the Clerk id. After the switch,
each user signs in once with a magic link. Their data is there.

**How the new-account alert works.**

- **Detection:** Clerk sends `user.created` when an account is made. This is better than version 3,
  which could only see an account at its first sign-in. The gateway route checks the webhook
  signature (Svix) and ignores users that the import script made, by their import marker.
- **Sending:** the gateway starts the `owner-alert` function and does not wait for it. If the email
  fails, it is logged and not retried. The next email has correct totals anyway, because they are
  counted at send time.
- **Summary, counted at send time from data we already have (no new state):**
  - from DynamoDB (one scan): accounts (profile items), owners and members; people (shared
    `flows` items, not deleted); open invites and accepted invites
  - from CloudWatch (one `GetMetricData` call): data API calls and data API errors, since the
    previous new account and in the last 7 days
- **Example:** "A new account was created. Accounts: 42 (35 owners, 7 members). People: 31. Open
  invites: 3. Accepted invites: 7. Data API calls: 1,204 since the previous new account (2 days),
  6,880 in the last 7 days. Errors: 0."

**What CloudWatch can see (decided: built-in metrics only).** The gateway stays on Cloudflare
Workers, so CloudWatch sees only AWS traffic: the data function's invocations and errors, and
DynamoDB request counts. **These counts show data API use, not page views.** Content requests that
the Worker cache answers are not counted. Lambda and DynamoDB send these metrics to CloudWatch at
no extra charge. We do not use custom metrics, and the Worker makes no `PutMetricData` calls.

## Apps and features

| App or feature | Current host | Migrate to AWS? (service if yes) | Reason |
|---|---|---|---|
| Web app (`apps/web`) | Cloudflare Pages | No | Free hosting and a global CDN. Its sign-in code changes from Supabase to Clerk. |
| Marketing site (`apps/marketing`) | Cloudflare Pages | No | Free. It has no account or data code. |
| Mobile app (`apps/mobile`) | Expo (device) | No | It runs on the phone. Its sign-in code changes from Supabase to Clerk. |
| DNS and domains | Cloudflare | No | Free on Cloudflare. We add the SES and Clerk records there. |
| API gateway (`apps/gateway`, Hono) | Cloudflare Workers | No | Free, with no cold starts. It checks the token, validates input (C8), caches content and calls the data function. |
| Accounts, sign-in and sign-in email | Supabase Auth | No. Move to Clerk (magic link) | Decision 1. No passwords to store or reset. Clerk is not an AWS service. |
| Token check (`libs/gateway-auth`) | Cloudflare Workers | No | It stays on the Worker. It checks Clerk tokens in place of Supabase tokens. |
| New-account signal | None | No. Clerk `user.created` webhook to the gateway | Clerk tells us at sign-up. Supabase had no hook for this. |
| Profile (`/me/profile`) | Supabase Postgres | Yes: Amazon DynamoDB, through AWS Lambda | One item per user, read by key. The access-rules module allows only the user's own item. |
| Family sharing (members, invites) | Supabase Postgres (definer functions) | Yes: Amazon DynamoDB, through AWS Lambda | Transactions with conditions replace the row locks. This is the hardest part to port. |
| Shared people (`/flows`) | Supabase Postgres (table built, routes not built yet) | Yes: Amazon DynamoDB, through AWS Lambda | One item per person, keyed by the id the device makes (C5). C11 moves into the access-rules module. |
| Samples, examples and the "What you'll need" list | Code (`WhatYoullNeed.tsx`, `templates.ts`) | Yes: Amazon DynamoDB (`gg-content`), served by the gateway | Decision 3. Peter can change content without a deploy. The apps keep a bundled copy for offline use. |
| "What you'll need" ticks | Device (IndexedDB, AsyncStorage) | No | Each user's ticks stay on the device. |
| Access rules and their tests (RLS, pgTAP) | Supabase Postgres, CI | Yes: TypeScript module, Vitest with DynamoDB Local in CI | One place for the rules. All 199 cases are ported before the switch. |
| Gateway to data path | Supabase PostgREST | Yes: AWS Lambda function URL (`AWS_IAM`) | AWS rejects unsigned calls. The Worker's key can invoke only this function. |
| Relational database | Supabase Postgres | No. Remove it (no RDS) | Decision 2. RDS costs more than the whole budget. |
| Backups | Supabase | Yes: DynamoDB point-in-time recovery | Restore to any second in the last 35 days. The tables are small, so the cost is cents. |
| Invite email | Resend (from the gateway) | No | It works today. SES in the sandbox cannot send to invitees. See question 4. |
| Owner alert (new account, with a usage summary) | None (Convex is removed) | Yes: Amazon SES, AWS Lambda | One email to Peter for each new account. Counts only, never user details. |
| Site-use counts in the alert | None | Yes: Amazon CloudWatch built-in Lambda and DynamoDB metrics, read with `GetMetricData` | No extra charge for the metrics. CloudWatch sees data API calls only, not page views. |
| Session sync (`/sync/pull`, `/sync/push`) | Convex | No. Remove it | Decision 6. It never worked in production. |
| Session data and purge job | Convex | No. Remove it | We export it to confirm it is empty, then delete it. |
| Cost protection | None | Yes: AWS Budgets, Cost Anomaly Detection | Alerts at $5 and $10 before any service runs. |
| Deploy access for GitHub Actions | None | Yes: AWS IAM with GitHub OIDC | Short-lived access. No AWS keys in GitHub. |
| AWS infrastructure setup | None | Yes: AWS CloudFormation | Each change is a file we can review and roll back. |
| CI and deploy (`ci.yml`, `deploy.yml`) | GitHub Actions | No | We replace the pgTAP, Supabase and Convex steps with DynamoDB Local tests and a CloudFormation deploy. |
| AI obituary draft (`POST /obituary`) | Workers + Anthropic | No | One outbound call. The feature is off today. |

## Steps

1. Set up the AWS account on the Paid plan. Turn on MFA for the root user.
2. Add the budget alerts, the anomaly alert and the GitHub deploy role (`infra/aws/`).
3. Export Convex production data and count it. If the count is 0, remove Convex.
4. Make the Clerk application. Turn on email magic link and turn off passwords. Add the Clerk DNS
   records in Cloudflare. Use a Clerk development instance for CI and preview.
5. Build the data function, the access-rules module and both tables. Port all 199 pgTAP cases to
   Vitest. Run them in CI against DynamoDB Local.
6. Move sign-in in the web app, the mobile app and `libs/gateway-auth` from Supabase to Clerk. Keep
   it behind the existing `AUTH` feature flag until move day.
7. Load the content table from the current code copy. Add `GET /content` with the Worker cache.
   Point GRI-9, GRI-11, GRI-12, GRI-13 and GRI-16 at it.
8. Verify the `grieversguidance.com` domain in SES (DKIM records in Cloudflare). Verify Peter's
   address. Add the Clerk `user.created` webhook. Send a test alert. Stay in the SES sandbox.
9. Write the import scripts (TypeScript): users into Clerk, then the 4 tables into DynamoDB under
   the new Clerk ids. Each script can run again with the same result. Rehearse with a copy of
   production data in the Clerk development instance.
10. Move day, about 45 minutes on a quiet weekday night: put the gateway in read-only mode. Writes
    answer a calm 503. The sync queue keeps edits on the device and retries (DATA.md), so no edit
    is lost. Import users into Clerk, export the 4 tables and import them.
11. Check: the user count in Clerk matches Supabase. The item count for each table matches the row
    count, and a SHA-256 checksum of each table (sorted, with ids mapped) matches the export. If a
    check fails, stay on Supabase and end the window. Nothing was changed there.
12. Switch the apps and the gateway to Clerk and the data function. Turn off read-only mode. Users
    sign in again once, with a magic link.
13. Fallback: keep the Supabase project unchanged and paused for writes for 30 days. After 30
    days, export a final backup and delete the Supabase project.

## Cost

Assumptions: now = under 1,000 active users and 100,000 API calls a month. 10× = under 10,000
users and 1 million API calls a month. Alerts = one email and one table scan for each new account:
under 100 a month now, under 1,000 at 10×.

| AWS service | Now | 10× |
|---|---|---|
| DynamoDB (on demand, 25 GB storage free, backups, alert scans, content reads) | about $0.05 | about $0.50 |
| Lambda (1 million requests a month free) | $0 | about $0.05 |
| SES ($0.10 for each 1,000 emails) | about $0.01 | about $0.10 |
| CloudWatch Logs (14-day retention, 5 GB free) | about $0.05 | about $0.10 |
| CloudWatch built-in metrics, plus `GetMetricData` (about 4 metrics for each alert) | under $0.01 | about $0.04 |
| Budgets, IAM, CloudFormation | $0 | $0 |
| **Total** | **about $0.10** | **about $0.80** |

Both totals are far under $10. For comparison, RDS alone would be about $14 a month.

Outside the AWS budget: Clerk has a free tier. Sources do not agree on its size (10,000 monthly
active users, or 50,000 monthly retained users since February 2026). Both are far above our user
count. Check the Clerk pricing page before step 4. The Supabase plan cost goes away after step 13.

## How we will build this: hands-on with the AWS CLI

Peter sets up AWS himself with the AWS CLI, one step at a time. Claude teaches. Claude does not do
the work. **Rule: Peter runs every command. Claude explains each command first, then checks the
output with Peter.** Real resources go into CloudFormation templates. Direct commands are for
learning and for checks.

This repo gets its own `LEARNINGS.md`, in the same style as Peter's other projects. Lessons are
numbered and split into parts ("Lesson 4, part 2"). Each new concept gets one entry with
**Concept**, **In this project** (numbered steps), **Related concepts**, **Interview answer**, and,
where it helps, **Simple explanation (high school level)** with an everyday analogy. All of it is
in ASD-STE100.

The lessons follow the Steps above:

1. Account, MFA and CLI sign-in (step 1): `aws login`, `aws sts get-caller-identity`.
2. Budgets and the anomaly alert (step 2): `aws budgets create-budget`, `aws ce create-anomaly-monitor`, `aws ce create-anomaly-subscription`.
3. IAM, the scoped Worker key and GitHub OIDC (step 2): `aws iam create-open-id-connect-provider`, `aws iam create-user`, `aws iam put-user-policy`, `aws iam create-access-key`, `aws iam delete-access-key`.
4. CloudFormation basics (step 2): `aws cloudformation validate-template`, `aws cloudformation deploy`, `aws cloudformation describe-stack-events`.
5. DynamoDB table design and transactions (step 5): `aws dynamodb create-table`, `aws dynamodb transact-write-items`, `aws dynamodb update-continuous-backups`.
6. The data Lambda and its function URL (step 5): `aws lambda create-function-url-config`, `aws lambda add-permission`, `aws logs tail`.
7. The content table (step 7): `aws dynamodb put-item`, `aws dynamodb query`.
8. SES domain and sandbox (step 8): `aws sesv2 create-email-identity`, `aws sesv2 get-account`, `aws sesv2 send-email`.
9. The new-account alert and site-use counts (step 8): `aws lambda invoke --invocation-type Event`, `aws cloudwatch get-metric-data`.
10. Import and checks (steps 9 to 11): `aws dynamodb batch-write-item`, `aws dynamodb scan --select COUNT`.

Clerk is not an AWS service, so its setup (step 4) uses the Clerk dashboard and its API, not the
AWS CLI.

## Outstanding questions

1. **Should the alert include the new user's email address?** Recommendation: no. The email says
   only that an account was created, plus the counts. You can look up the account in the Clerk
   dashboard if you need to.
2. **Do you want "people who used the site this week"?** That needs a "last seen" date on each
   profile item. Recommendation: not now. The CloudWatch counts show use without storing anything
   new about a person.
3. **Magic link on mobile.** A magic link opens in the phone's browser or mail app, and must come
   back to the app. Recommendation: use Clerk's email code (a 6-digit code) on mobile if the link
   does not return to the app reliably. I have not checked Clerk's Expo support for email links.
4. **Invite email: keep Resend or move to SES?** Recommendation: keep Resend now. Owner alerts go
   only to your verified address, so SES can stay in the sandbox.
5. **Users must sign in again once after the switch.** Their sessions end on move day.
   Recommendation: accept this. Show a calm note on the sign-in screen that explains the change.
6. **Who can edit content?** Recommendation: only Peter, with the content script and his AWS
   access. No admin screen now.
7. **Build the `/flows` gateway routes (#131) on Supabase first, or on the data function?**
   Recommendation: build them on the data function, so we write them once.
8. **What happens when an account is deleted?** Clerk sends a `user.deleted` webhook.
   Recommendation: the data function deletes that user's items when it gets the webhook.
9. **Which AWS region?** Recommendation: `us-east-1`.
10. **`POST /obituary` has no sign-in check and no rate limit.** Recommendation: add both before the
    feature is turned on. This is a separate ticket.

## Sources

- RDS PostgreSQL db.t4g.micro on-demand price (about $0.016 an hour in us-east-1): https://aws.amazon.com/rds/postgresql/pricing/ and https://calculator.holori.com/aws/rds/db.t4g.micro
- Clerk pricing (magic links on all plans): https://clerk.com/pricing and https://clerk.com/articles/clerk-pricing-explained
- DynamoDB transactions, conditions and conflicts: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html
- DynamoDB Local differences (no transaction conflicts): https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.UsageNotes.html
- DynamoDB on-demand pricing: https://aws.amazon.com/dynamodb/pricing/on-demand/
- Lambda function URL access (`AWS_IAM`): https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html
- Lambda pricing: https://aws.amazon.com/lambda/pricing/
- SES sandbox and production access: https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html
- SES pricing: https://aws.amazon.com/ses/pricing/
- CloudWatch pricing (metric reads, logs): https://aws.amazon.com/cloudwatch/pricing/
