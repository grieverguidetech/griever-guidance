# AWS migration plan (GRI-8)

Status: proposal. This document does not change infrastructure. Date: 2026-10-19.

## Overview

We want to move backend services to AWS where it makes sense. The AWS budget is $10 a month for all
AWS services together.

Peter made two decisions on 2026-10-19:

1. We do not keep a server copy of session progress. Progress stays on the device.
2. We use a dedicated AWS account on the Paid plan. A Free-plan account closes after 6 months.

Because of decision 1, we remove Convex and do not replace it. Today, Convex holds no user data in
production. The sync service never ran there. We export Convex first to confirm this.

Most services stay where they are. Cloudflare hosts the sites, the DNS and the API for free.
Supabase holds the accounts and protects shared data with row-level security (RLS). Moving these
services gives no saving and adds risk for the user.

The first AWS work is cost protection: budget alerts at $5 and $10, a cost-anomaly alert, and a
GitHub deploy role with no stored keys. These cost $0. New backend services go to AWS (TypeScript
on Lambda). Each new service must show its monthly cost before it ships.

Expected AWS cost after this plan: **$0 a month**.

## Apps and features

| App or feature | Current host | Migrate to AWS? | Reason |
|---|---|---|---|
| Web app (`apps/web`) | Cloudflare Pages | No | Free hosting and a global CDN. It works now. |
| Marketing site (`apps/marketing`) | Cloudflare Pages | No | Same as the web app. |
| DNS and domains (`grieversguidance.com`) | Cloudflare | No | Free on Cloudflare. Route 53 costs $0.50 a month and adds nothing. |
| API gateway (`apps/gateway`, Hono) | Cloudflare Workers | No | Free, with no cold starts. The domain and CORS work now. See question 1. |
| Health check (`GET /health`) | Cloudflare Workers | No | Part of the API gateway. |
| Profile (`/me/profile`) | Cloudflare Workers + Supabase | No | Supabase RLS makes sure each user sees only their own data. |
| Family sharing (members and invites) | Cloudflare Workers + Supabase | No | Supabase RLS protects shared data (C11). |
| Shared people (`/flows`, not built yet) | Supabase (planned) | No | Same RLS reason. |
| Accounts and sign-in | Supabase Auth | No | Accounts are live. A move to Cognito forces every user to reset their password. |
| Database (profiles, memberships, invites) | Supabase Postgres | No | RLS rules are tested in CI. We do not rebuild them in app code. |
| AI obituary draft (`POST /obituary`) | Cloudflare Workers + Anthropic | No | One outbound call. It is free on Workers. The feature is off today. |
| Invite email | Resend | No | It works now. Amazon SES needs domain setup and gives no gain. See question 2. |
| Session sync (`/sync/pull`, `/sync/push`) | Cloudflare Workers + Convex | No. Remove it | Decision 1: no server copy of progress. The service never ran in production. |
| Session data and purge job | Convex | No. Remove it | Convex holds no production data. We export it to confirm, then delete it. |
| Cost protection (budgets and alerts) | None | Yes: AWS Budgets, Cost Anomaly Detection | This protects the $10 budget before any service runs on AWS. |
| Deploy access for GitHub Actions | None | Yes: AWS IAM with GitHub OIDC | Deploys use short-lived access. No AWS keys are stored in GitHub. |
| AWS infrastructure setup | None | Yes: AWS CloudFormation, run with the AWS CLI | Each change is a file we can review and roll back. |
| New backend services (future) | None | Yes: AWS Lambda (TypeScript), DynamoDB, SQS as needed | This is Peter's default stack. Each service must fit the $10 budget. |
| CI and deploy (`ci.yml`, `deploy.yml`) | GitHub Actions | No | It stays. We remove the Convex steps from it. |

## Steps

1. Set up the AWS account on the Paid plan. Turn on MFA for the root user.
2. Add the budget alerts, the cost-anomaly alert and the GitHub deploy role (one CloudFormation
   template in `infra/aws/`).
3. Export Convex production data and count the rows. We expect 0.
4. If the count is 0, remove Convex from the code and from `deploy.yml`. If it is not 0, stop and
   decide again.
5. After 30 days with no problems, delete the Convex project and its GitHub secrets.

## Outstanding questions

1. **Do you want to move the API gateway to AWS Lambda anyway?** This puts real backend code on AWS.
   The cost is about $0 at today's traffic. It adds cold starts and a domain change.
   Recommendation: no. Keep it on Workers until there is a reason to move.
2. **Do you want invite email on Amazon SES instead of Resend?** SES costs about $0.10 for each
   1,000 emails. It needs domain verification and an exit from the SES sandbox.
   Recommendation: no, unless Resend starts to cost money.
3. **Which Supabase plan is the project on?** Look in the Supabase dashboard: your project →
   Settings → Billing. A Free project pauses after 1 week with no activity and has no backups.
   Recommendation: move to Pro ($25 a month, not an AWS cost) before family sharing goes to real
   families.
4. **Which AWS region?** Use the same region as the Supabase project. Default: `us-east-1`.
5. **`POST /obituary` has no sign-in check and no rate limit.** Recommendation: add both before the
   feature is turned on. This is a separate ticket.

The full technical design (the DynamoDB sync store, price sources and ticket list) is in commit
`abcac27`, if we ever want a server copy of progress.
