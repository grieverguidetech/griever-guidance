# AWS migration plan (GRI-8)

Status: proposal, version 3. This document does not change infrastructure. Date: 2026-10-19.

## Overview

We move the site's data from Supabase Postgres to Amazon DynamoDB. Accounts and sign-in stay on
Supabase Auth. The API gateway stays on Cloudflare Workers. We remove Convex and add short email
alerts to Peter through Amazon SES. The AWS budget is $10 a month for all AWS services together.

Peter's decisions (2026-10-19):

1. Accounts and sign-in stay on Supabase Auth. We do not use Cognito.
2. DynamoDB holds the site's data: profiles, memberships, invites and shared people (`flows`).
3. The API gateway stays on Cloudflare Workers.
4. Convex is removed. Its replacement is an email alert to Peter, not a database.
5. We do not keep a server copy of session progress.
6. We use a dedicated AWS account on the Paid plan. All code is TypeScript and serverless.
7. Owner alerts: one email to Peter for each new account, with a summary of counts. Site-use
   counts come from the built-in Lambda and DynamoDB metrics in CloudWatch only. No digest, no
   custom metrics.

The plan in short:

1. **One data function owns the data.** An AWS Lambda function (TypeScript) is the only code that
   can read or write the DynamoDB table. The gateway calls it through a Lambda function URL with
   IAM sign-in (`AWS_IAM`). AWS rejects unsigned calls before our code runs.
2. **The gateway signs each call with one scoped AWS key.** Workers cannot use OIDC, so the key is
   a Worker secret. The key can only invoke this one function. It cannot read the table. A stolen
   key alone cannot act as a user, because the function checks the user's token too. We rotate the
   key every 90 days: make a second key, put it in the Worker, deploy, then delete the old key.
3. **Supabase tokens are checked twice.** The gateway checks them as today (`libs/gateway-auth`).
   The data function checks them again against the same Supabase public keys (JWKS) and issuer.
4. **Access rules move from the database to one module.** Today Postgres row-level security (RLS)
   and definer functions enforce "a user reaches only their own row", the invite rules and "members
   cannot create a person" (C11). After the move, one access-rules module in the data function
   enforces all of them. Each request runs as the user in the checked token. Nothing else can.
5. **Row locks become conditional writes.** Today `create_invite`, `accept_invite` and the C11
   trigger lock profile rows (`for update`). In DynamoDB, each of these writes uses one
   transaction (`TransactWriteItems`). The transaction updates the user's profile item only if its
   version number is still the one we read. If another request changed it first, the whole
   transaction fails and nothing is written. Creating a person and accepting an invite both touch
   the same profile item, so they cannot both win. The profile also keeps a count of people owned,
   so "a joiner who owns people cannot join" is one condition.
6. **Every pgTAP case is ported.** There are 199 pgTAP assertions in 4 files today. Each one
   becomes a Vitest case that runs against DynamoDB Local in CI. Cases about grants and policies
   become "the data function has no way to do X" cases. We keep a list that maps each old case to
   its new case. We do not switch until every case passes. DynamoDB Local never raises transaction
   conflicts, so the race cases also use a test double that raises one.
7. **One owner alert: a new account.** Each time a new account is created, Peter gets one email
   through SES. The email has a summary of site use, counts only. There is no other alert and no
   digest. No email carries a name, an email address, a person's details or message content
   (C1, C2).

**Fit for DynamoDB.** Profiles and shared people fit well: each is read by its key. Memberships
and invites fit least. Their rules join several rows (rate limits, "one open invite per email",
"one owner per member"). DynamoDB can do this with extra key items and transactions, but the code
is longer than the SQL it replaces. We accept this, because the 199 ported tests guard it.

**How the new-account alert works.**

- **Detection:** the web app reads `/me/profile` after each sign-in. The first call from a user with
  no profile item creates the item with a "must not exist" condition. If that write succeeds, the
  account is new. Supabase has no hook that runs after sign-up, so we detect the account at its
  first sign-in, not at sign-up.
- **Sending:** the data function then starts a second small function (`owner-alert`) and does not
  wait for it. The user's sign-in is not slowed down. If the email fails, it is logged and not
  retried. The next email has correct totals anyway, because they are counted at send time.
- **Summary, counted at send time from data we already have (no new state):**
  - from DynamoDB (one scan): accounts (profile items), owners and members; people (shared
    `flows` items, not deleted); open invites and accepted invites
  - from CloudWatch (one `GetMetricData` call): data API calls and data API errors, since the
    previous new account and in the last 7 days. "Since the previous new account" uses the newest
    other profile's creation time from the same scan, so it needs no stored "last sent" time.
- **Example:** "A new account was created. Accounts: 42 (35 owners, 7 members). People: 31. Open
  invites: 3. Accepted invites: 7. Data API calls: 1,204 since the previous new account (2 days),
  6,880 in the last 7 days. Errors: 0."

The scan reads the whole table once. The table is small (a few MB at 10×), so one scan costs a
fraction of a cent. We do not count accounts from Supabase Auth, because that needs the
service-role key, which this project does not hold (§6). An account that never signs in is not
counted.

**What CloudWatch can see (decided: built-in metrics only).** The gateway stays on Cloudflare
Workers, so CloudWatch sees only AWS traffic: the data function's invocations and errors, and
DynamoDB request counts. **These counts show data API use, not page views.** They do not include
the gateway's own routes (for example `/obituary`) or visitors without an account. Lambda and
DynamoDB send these metrics to CloudWatch at no extra charge. The alert function reads about 4
metrics with `GetMetricData` for each email. That is the only metrics cost.

We do not use custom metrics, and the Worker makes no `PutMetricData` calls (Peter, 2026-10-19).
Custom metrics would cost $0.30 each a month after 10 free metrics, and `PutMetricData` from the
Worker would be about one call per request. "Active users" would also need stored user ids.

## Apps and features

| App or feature | Current host | Migrate to AWS? (service if yes) | Reason |
|---|---|---|---|
| Web app (`apps/web`) | Cloudflare Pages | No | Free hosting and a global CDN. Its sign-in code does not change. |
| Marketing site (`apps/marketing`) | Cloudflare Pages | No | Free. It has no account or data code. |
| Mobile app (`apps/mobile`) | Expo (device) | No | It runs on the phone. Its sign-in code does not change. |
| DNS and domains | Cloudflare | No | Free on Cloudflare. We add the SES records there. |
| API gateway (`apps/gateway`, Hono) | Cloudflare Workers | No | Free, with no cold starts. It checks the token, validates input (C8) and calls the data function. |
| Accounts, sign-in and account email | Supabase Auth | No | Decision 1. Users keep their sessions and passwords. No move is needed. |
| Token check (`libs/gateway-auth`) | Cloudflare Workers | No | It stays as it is. The data function adds a second check. |
| Profile (`/me/profile`) | Supabase Postgres | Yes: Amazon DynamoDB, through AWS Lambda | One item per user, read by key. The access-rules module allows only the user's own item. |
| Family sharing (members, invites) | Supabase Postgres (definer functions) | Yes: Amazon DynamoDB, through AWS Lambda | Transactions with conditions replace the row locks. This is the hardest part to port. |
| Shared people (`/flows`) | Supabase Postgres (table built, routes not built yet) | Yes: Amazon DynamoDB, through AWS Lambda | One item per person, keyed by the id the device makes (C5). C11 moves into the access-rules module. |
| Access rules and their tests (RLS, pgTAP) | Supabase Postgres, CI | Yes: TypeScript module, Vitest with DynamoDB Local in CI | One place for the rules. All 199 cases are ported before the switch. |
| Gateway to data path | Supabase PostgREST | Yes: AWS Lambda function URL (`AWS_IAM`) | AWS rejects unsigned calls. The Worker's key can invoke only this function. |
| Backups | Supabase | Yes: DynamoDB point-in-time recovery | Restore to any second in the last 35 days. The table is small, so the cost is cents. |
| Invite email | Resend (from the gateway) | No | It works today. SES in the sandbox cannot send to invitees. See question 5. |
| Owner alert (new account, with a usage summary) | None (Convex is removed) | Yes: Amazon SES, AWS Lambda | One email to Peter for each new account. Counts only, never user details. |
| Site-use counts in the alert | None | Yes: Amazon CloudWatch built-in Lambda and DynamoDB metrics, read with `GetMetricData` | No extra charge for the metrics. CloudWatch sees data API calls only, not page views. |
| Session sync (`/sync/pull`, `/sync/push`) | Convex | No. Remove it | Decision 5. It never worked in production. |
| Session data and purge job | Convex | No. Remove it | We export it to confirm it is empty, then delete it. |
| Cost protection | None | Yes: AWS Budgets, Cost Anomaly Detection | Alerts at $5 and $10 before any service runs. |
| Deploy access for GitHub Actions | None | Yes: AWS IAM with GitHub OIDC | Short-lived access. No AWS keys in GitHub. |
| AWS infrastructure setup | None | Yes: AWS CloudFormation | Each change is a file we can review and roll back. |
| CI and deploy (`ci.yml`, `deploy.yml`) | GitHub Actions | No | We replace the pgTAP and Convex steps with DynamoDB Local tests and a CloudFormation deploy. |
| AI obituary draft (`POST /obituary`) | Workers + Anthropic | No | One outbound call. The feature is off today. |

## Steps

1. Set up the AWS account on the Paid plan. Turn on MFA for the root user.
2. Add the budget alerts, the anomaly alert and the GitHub deploy role (`infra/aws/`).
3. Export Convex production data and count it. If the count is 0, remove Convex.
4. Build the data function, the access-rules module and the table. Port all 199 pgTAP cases to
   Vitest. Run them in CI against DynamoDB Local.
5. Verify the `grieversguidance.com` domain in SES (DKIM records in Cloudflare). Verify Peter's
   address. Send a test alert. Stay in the SES sandbox.
6. Write the import script (TypeScript). It reads an export of the 4 tables and writes items. It
   can run again with the same result. Write the reverse script too. Rehearse both with a copy of
   production data.
7. Move day, about 30 minutes on a quiet weekday night: put the gateway in read-only mode. Writes
   answer a calm 503. The sync queue keeps edits on the device and retries (DATA.md), so no edit is
   lost. Export the 4 tables, and the ids of existing accounts so they do not trigger
   "new account" emails. Import them.
8. Check: the item count for each table matches the row count, and a SHA-256 checksum of each
   table (sorted, read back from DynamoDB) matches the checksum of the export. If a check fails,
   stay on Supabase and end the window. Nothing was changed there.
9. Switch the gateway to the data function. Turn off read-only mode.
10. Fallback: keep the Supabase tables unchanged for 30 days. If we must go back, run the reverse
    script for items changed after the switch, then point the gateway at Supabase again. After 30
    days, drop the 4 tables and the definer functions. Supabase Auth stays.

## Cost

Assumptions: now = under 1,000 active users and 100,000 API calls a month. 10× = under 10,000
users and 1 million API calls a month. Alerts = one email and one table scan for each new account:
under 100 a month now, under 1,000 at 10×.

| AWS service | Now | 10× |
|---|---|---|
| DynamoDB (on demand, 25 GB storage free, backups, alert scans) | about $0.05 | about $0.50 |
| Lambda (1 million requests a month free) | $0 | about $0.05 |
| SES ($0.10 for each 1,000 emails) | about $0.01 | about $0.10 |
| CloudWatch Logs (14-day retention, 5 GB free) | about $0.05 | about $0.10 |
| CloudWatch built-in metrics, plus `GetMetricData` (about 4 metrics for each alert, $0.01 for each 1,000) | under $0.01 | about $0.04 |
| Budgets, IAM, CloudFormation | $0 | $0 |
| **Total** | **about $0.10** | **about $0.80** |

Both totals are far under $10. Supabase Auth stays on its current Supabase plan. That cost is
outside the AWS budget and does not change.

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
5. DynamoDB table design and transactions (step 4): `aws dynamodb create-table`, `aws dynamodb transact-write-items`, `aws dynamodb update-continuous-backups`.
6. The data Lambda and its function URL (step 4): `aws lambda create-function-url-config`, `aws lambda add-permission`, `aws logs tail`.
7. SES domain and sandbox (step 5): `aws sesv2 create-email-identity`, `aws sesv2 get-account`, `aws sesv2 send-email`.
8. The new-account alert (step 5): `aws lambda invoke --invocation-type Event`.
9. Site-use counts (step 5): `aws cloudwatch get-metric-data`.
10. Import and checks (steps 6 to 8): `aws dynamodb batch-write-item`, `aws dynamodb scan --select COUNT`.

## Outstanding questions

1. **Should the alert include the new user's email address?** C1 to C11 do not cover email to the
   site owner. C1 keeps people's details out of account email, and §1 asks us to protect a person
   in grief. Recommendation: no. The email says only that an account was created, plus the counts.
   You can look up the account in the Supabase dashboard if you need to.
2. **Do you want "people who used the site this week"?** That needs new state: a "last seen" date
   on each user's profile item, written on the first call each day. Recommendation: not now. The
   API call counts from CloudWatch show use without storing anything new about a person.
3. **Should we catch accounts that sign up but never sign in?** Supabase has no hook after
   sign-up. A trigger on `auth.users` would change Supabase's own schema. Recommendation: no.
   Detect at first sign-in, as planned. Email confirmation comes before sign-in anyway.
4. **Is it acceptable that the alert cannot count page views or visitors without an account?**
   CloudWatch sees only data API use, and visitors without an account send nothing to our servers
   (C5). Recommendation: yes. Do not add tracking to the app.
5. **Invite email: keep Resend or move to SES?** SES in the sandbox can send only to verified
   addresses, so invites need SES production access (AWS answers within 96 hours). Recommendation:
   keep Resend now. Owner alerts go only to your verified address, so they can stay in the sandbox.
   Move invites to SES later only if you want one email provider.
6. **Can the data function trust that a token means a confirmed email?** `create_invite` and
   `accept_invite` check `email_confirmed_at` in `auth.users` today. Without a service-role key, the
   data function cannot read `auth.users`. Recommendation: keep "Confirm email" on in Supabase, so
   an unconfirmed user never gets a token, and also check the token's email-verified claim. Confirm
   both settings before step 4. I have not checked them.
7. **Build the `/flows` gateway routes (#131) on Supabase first, or on the data function?** The
   table exists, but the routes are not built. Recommendation: build them on the data function, so
   we write them once.
8. **What happens when an account is deleted in Supabase?** Today Postgres deletes the user's rows
   by cascade. DynamoDB has no cascade. The app has no "delete account" action today.
   Recommendation: write a small cleanup script now. Add an automatic path when account deletion
   becomes a feature.
9. **Which AWS region?** Recommendation: `us-east-1`. Choose another region only if most users live
   outside the US.
10. **`POST /obituary` has no sign-in check and no rate limit.** Recommendation: add both before the
   feature is turned on. This is a separate ticket.

## Sources

- DynamoDB transactions, conditions and conflicts: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html
- DynamoDB Local differences (no transaction conflicts): https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.UsageNotes.html
- DynamoDB Scan: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Scan.html
- DynamoDB on-demand pricing: https://aws.amazon.com/dynamodb/pricing/on-demand/
- Lambda function URL access (`AWS_IAM`): https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html
- Lambda pricing: https://aws.amazon.com/lambda/pricing/
- SES sandbox and production access: https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html
- SES pricing: https://aws.amazon.com/ses/pricing/
- CloudWatch pricing (metric reads, logs): https://aws.amazon.com/cloudwatch/pricing/
- Supabase Auth hooks (no hook runs after sign-up): https://supabase.com/docs/guides/auth/auth-hooks
- Supabase database webhooks: https://supabase.com/docs/guides/database/webhooks
