# AWS migration plan (GRI-8)

Status: proposal. This document does not change infrastructure. Date: 2026-10-19.

## Overview

We move the backend data and accounts from Supabase to AWS. The API gateway stays on Cloudflare
Workers. The AWS budget is $10 a month for all AWS services together.

Peter's decisions (2026-10-19):

1. We do not keep a server copy of session progress. We remove Convex and do not replace it.
2. We use a dedicated AWS account on the Paid plan.
3. The API gateway stays on Cloudflare Workers.
4. We remove Supabase. AWS replaces Supabase Auth and Supabase Postgres.

The plan in short:

1. **Accounts move to Amazon Cognito.** We import each user with their current password hash.
   Supabase stores bcrypt hashes, and Cognito can import bcrypt hashes. Users keep their passwords.
   Nobody must reset a password. Each user signs in one time again after the move.
2. **Data moves to Amazon DynamoDB.** One AWS Lambda function (TypeScript) reads and writes it. The
   gateway calls this function. Only this function has access to the table.
3. **Access rules move from the database (RLS) to code.** Today Postgres RLS enforces "members
   cannot create a person" (C11). After the move, one access-rules module in the Lambda function
   enforces it. We port every pgTAP test case to a Vitest test that runs against DynamoDB Local in
   CI. We do not switch until all the ported tests pass. C11 stays a tested guarantee.
4. **All email moves to Amazon SES.** Cognito needs SES for production email volume. Invite email
   uses the same SES setup.

Expected AWS cost: **about $0.20 a month** now, and **about $1.50 a month** at 10 times the load.

## Apps and features

| App or feature | Current host | Migrate to AWS? | Reason |
|---|---|---|---|
| Web app (`apps/web`) | Cloudflare Pages | No | Free hosting and a global CDN. The sign-in code changes from Supabase to Cognito. |
| Marketing site (`apps/marketing`) | Cloudflare Pages | No | Free. It has no account or data code. |
| Mobile app (`apps/mobile`) | Expo (device) | No | It runs on the phone. Its sign-in code changes the same way as the web app. |
| DNS and domains (`grieversguidance.com`) | Cloudflare | No | Free on Cloudflare. Route 53 adds cost and nothing else. |
| API gateway (`apps/gateway`, Hono) | Cloudflare Workers | No (decision 3) | Free, with no cold starts. It checks Cognito tokens and calls the data function. |
| Token check (`libs/gateway-auth`) | Cloudflare Workers | No. Change it | It reads Cognito public keys (JWKS) instead of Supabase keys. It also checks the issuer and app client ID. |
| Accounts and sign-in | Supabase Auth | Yes: Amazon Cognito (Lite tier) | 10,000 free monthly active users. Bulk import with bcrypt hashes keeps every password. |
| Sign-up, confirm and password-reset email | Supabase Auth | Yes: Amazon SES (through Cognito) | The default Cognito email has a low daily limit. SES costs $0.10 for each 1,000 emails. |
| Profile (`/me/profile`) | Workers + Supabase Postgres | Yes: AWS Lambda + Amazon DynamoDB | Each user reads and writes only their own row. The access-rules module enforces this. |
| Family sharing (members, invites) | Workers + Supabase Postgres | Yes: AWS Lambda + Amazon DynamoDB | Today definer functions do this. DynamoDB transactions with conditions replace the row locks. |
| Shared people (`/flows`) | Workers + Supabase Postgres | Yes: AWS Lambda + Amazon DynamoDB | C11 moves from RLS to the access-rules module. Every pgTAP case becomes a Vitest case. |
| Database access rules (RLS, pgTAP tests) | Supabase Postgres, CI | Yes: TypeScript module, Vitest + DynamoDB Local in CI | The gateway never reads the table. Only the data function's role can. One place to test. |
| Data path from the gateway to AWS | None | Yes: Lambda function URL with IAM sign-in (`AWS_IAM`) | AWS rejects unsigned calls before our code runs. The function also checks the user's token. |
| Invite email | Resend (from the gateway) | Yes: Amazon SES (from the data function) | We need SES for Cognito anyway. The function's role sends it, so no email key is stored. |
| AI obituary draft (`POST /obituary`) | Workers + Anthropic | No | One outbound call. Free on Workers. The feature is off today. |
| Session sync (`/sync/pull`, `/sync/push`) | Workers + Convex | No. Remove it | Decision 1. The service never ran in production. |
| Session data and purge job | Convex | No. Remove it | Convex holds no production data. We export it to confirm, then delete it. |
| Cost protection (budgets and alerts) | None | Yes: AWS Budgets, Cost Anomaly Detection | Alerts at $5 and $10 before any service runs. |
| Deploy access for GitHub Actions | None | Yes: AWS IAM with GitHub OIDC | Short-lived access. No AWS keys in GitHub. |
| AWS infrastructure setup | None | Yes: AWS CloudFormation | Each change is a file we can review and roll back. |
| CI and deploy (`ci.yml`, `deploy.yml`) | GitHub Actions | No | It stays. We replace the Supabase and Convex steps with DynamoDB Local tests and a CloudFormation deploy. |

## Steps

1. Set up the AWS account on the Paid plan. Turn on MFA for the root user.
2. Add the budget alerts, the anomaly alert and the GitHub deploy role (`infra/aws/`).
3. Export Convex production data and count the rows. If the count is 0, remove Convex.
4. Build the data function, the access-rules module and the DynamoDB table. Port every pgTAP case
   to Vitest. Run the tests in CI against DynamoDB Local.
5. Create the Cognito user pool and the SES domain. Ask AWS to move SES out of the sandbox.
6. Rehearse the move with a copy of production data. Compare the row counts and a checksum for
   each table.
7. Move day: put the gateway in read-only mode for a short, quiet window. Export the Supabase users
   (with password hashes) and all tables. Import them into Cognito and DynamoDB. Check the counts.
   Open invites keep working, because we copy the stored token hashes.
8. Switch the gateway to Cognito and the data function. Turn off read-only mode.
9. Keep the Supabase project for 30 days as a fallback. Then delete it and its GitHub secrets.

## Cost

Assumptions: now = under 1,000 active users, 100,000 API calls and 1,000 emails a month.
10× = under 10,000 users, 1 million API calls and 10,000 emails a month.

| AWS service | Now | 10× |
|---|---|---|
| Cognito (Lite, 10,000 free users) | $0 | $0 |
| Lambda (1 million free requests) | $0 | $0 |
| DynamoDB (on demand, 25 GB free) | about $0.05 | about $0.40 |
| SES ($0.10 for each 1,000 emails) | $0.10 | $1.00 |
| Logs, budgets, IAM, CloudFormation | about $0.05 | about $0.10 |
| **Total** | **about $0.20** | **about $1.50** |

Rejected for cost or speed: an always-on RDS database (the public IPv4 address alone is $3.65 a
month, before the instance), and Aurora Serverless v2 (it can pause to $0, but it takes about
15 seconds to wake up, and 0.5 ACU always on is about $44 a month). Aurora DSQL also fits the
budget, but it has no PL/pgSQL or triggers, so the logic moves to code anyway. Above 10,000 active
users, Cognito Lite costs $0.0055 for each extra user.

## Outstanding questions

1. **Is one new sign-in for every user acceptable?** Current Supabase sessions do not carry over.
   Users keep their passwords, but each user must sign in again one time. Recommendation: yes.
   Show a calm one-line note on the sign-in screen for 30 days.
2. **Bulk import with password hashes, or the Cognito migration trigger?** The trigger checks each
   password against Supabase at sign-in. Users who do not sign in during the window must reset
   their password later. Bulk import has no such gap and does not need Supabase after the move.
   Recommendation: bulk import with bcrypt hashes. Until a user's first sign-in, the app must use
   the `USER_PASSWORD_AUTH` flow (not SRP).
3. **What do we do with users who never confirmed their email?** Cognito import needs a verified
   email. Recommendation: do not import them. They can sign up again. Count them before the move.
4. **Which AWS region?** Recommendation: `us-east-1`. Cognito, SES, Lambda and DynamoDB all run
   there. Choose another region only if most users live outside the US.
5. **When is the move window?** Recommendation: a weekday night (US time), about 30 minutes, in
   read-only mode. Do not run it during an active family-sharing rollout.
6. **How does the gateway sign calls to the data function?** `AWS_IAM` needs one AWS access key in
   a Worker secret. The key can only invoke this one function. Recommendation: accept it, and
   rotate the key every 90 days. The function also checks the user's Cognito token.
7. **Do we need Cognito Essentials instead of Lite?** Both have 10,000 free users. Recommendation:
   Lite, unless the import or email setup needs an Essentials feature. Confirm this when we build
   the pool.
8. **`POST /obituary` has no sign-in check and no rate limit.** Recommendation: add both before the
   feature is turned on. This is a separate ticket.

## Sources

- Cognito pricing: https://aws.amazon.com/cognito/pricing/
- Cognito import with password hashes: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-using-import-tool.html
- Cognito migration trigger: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-migrate-user.html
- Cognito email limits: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html
- SES pricing: https://aws.amazon.com/ses/pricing/
- DynamoDB on-demand pricing: https://aws.amazon.com/dynamodb/pricing/on-demand/
- Lambda pricing: https://aws.amazon.com/lambda/pricing/
- Lambda function URL access: https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html
- Aurora DSQL pricing and limits: https://aws.amazon.com/rds/aurora/dsql/pricing/
- Aurora Serverless pricing and auto-pause: https://aws.amazon.com/rds/aurora/pricing/
- Public IPv4 price: https://aws.amazon.com/vpc/pricing/
