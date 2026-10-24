# Learnings

## AWS infra (ticket #185)

A running log of every command we used to set up AWS for Grievers Guidance (ticket #185), what
each one does, and why it matters for system design. Read it top to bottom: the commands are in
the order we ran them.

> This repo is public. Account IDs, emails and codes are shown as `[placeholders]` on purpose.

## The big picture first

We are building **guardrails before features**. Before any app code runs on AWS, we want three
things in place:

1. **Know who you are.** Every command runs as some identity. Check it before you change anything.
2. **Cap the damage.** Budgets and anomaly alerts tell you fast when money leaks.
3. **No long-lived keys.** GitHub deploys with short-lived credentials (OIDC), not a stored key.

Everything real lives in **CloudFormation templates** under `infra/aws/`. Direct CLI commands are
for learning and for checking. That idea is called **infrastructure as code (IaC)**: the repo is
the source of truth, and you can rebuild the account from it.

---

## 1. Signing in

### `aws login --region us-east-1`

Opens the browser, you sign in, and the CLI gets **temporary credentials**. Nothing permanent is
saved on disk.

**System design:** short-lived credentials are safer than access keys. A leaked key works until
someone deletes it. A leaked session expires on its own. You will see this idea again with OIDC.

### `aws sts get-caller-identity`

Answers "who am I right now?" It prints the account and the identity (user or role).

**System design:** always check identity before you change anything. We checked that the ARN did
**not** end in `:root`. The root user can do everything and cannot be limited, so you use it only
for the few tasks that need it.

### `aws configure set region us-east-2` / `aws configure get region`

Sets and reads the default region in `~/.aws/config`. It changes nothing in AWS.

**System design:** most AWS services are **regional**. A table in Ohio does not exist in
Virginia. If the region is wrong or empty, commands fail or, worse, create things in a region you
never look at.

---

## 2. Working on a ticket branch (git and GitHub)

### `git worktree add .worktrees/aws-185 -b feat/aws-account-185 main`

Makes a second folder with its own branch. `main` stays clean in the first folder while the ticket
lives in the second.

### `pnpm install --frozen-lockfile --prefer-offline`

Each worktree needs its own `node_modules`. `--frozen-lockfile` means "install exactly what the
lockfile says, and fail if it doesn't match."

### `gh project item-edit ...` and `gh issue edit 185 --add-label in-progress`

Moves the ticket to **In progress** on the board, so everyone can see what is being worked on.

**System design:** one ticket, one branch, one PR keeps changes small and easy to review. Small
changes are easier to roll back.

---

## 3. The surprise: an Organization and a region lock

### `aws cloudformation validate-template --template-body file://infra/aws/budgets.yml`

Asks CloudFormation to read a template and check its shape. It creates nothing. The first time,
it failed with `AccessDenied ... explicit deny in a service control policy`.

### `aws organizations describe-organization`

Shows the Organization this account belongs to, including the management account email. A member
account can run this read-only call.

**What we learned:** the account is a **member** of an **AWS Organization**. The management
account (a different account, signed in with root) owns the Organization and its **service control
policies (SCPs)**.

An SCP is a guardrail on a whole account. It wins over everything, even a role with full access.
Our SCP was a **region lock**:

| Region      | What is allowed                                                                    |
| ----------- | ---------------------------------------------------------------------------------- |
| `us-east-1` | Global services only (IAM, Budgets, Cost Explorer, STS, Route 53, CloudFront, ACM) |
| `us-west-2` | Almost nothing (Identity Center, Bedrock, support)                                 |
| `us-east-2` | Everything. This is the home region.                                               |
| Any other   | Blocked                                                                            |

So we moved Grievers Guidance to **`us-east-2` (Ohio)**.

**System design:** this is **defense in depth**. Even if a role is too powerful, the SCP stops it
from creating resources in a region you forgot about. Global services (like IAM and Budgets) still
work, because AWS runs them from `us-east-1` no matter where you call from.

---

## 4. Budgets: a hard number to watch

### `aws cloudformation deploy --template-file infra/aws/budgets.yml --stack-name gg-budgets --parameter-overrides AlertEmail=[your-email]`

Creates or updates a **stack**: one deployed copy of a template. `deploy` builds a **change set**
(the list of differences), applies it, and waits until it finishes. The result was a $10 monthly
budget with email alerts at $5 and $10 of **actual** spend.

**System design:** the email is a **parameter**, not written in the template. Templates stay
reusable and safe to publish. Config goes in at deploy time.

### `aws cloudformation describe-stacks --stack-name gg-budgets`

Shows the stack status. You want `CREATE_COMPLETE` (first deploy) or `UPDATE_COMPLETE` (later
deploys). `ROLLBACK_COMPLETE` means it failed and CloudFormation undid it.

### `aws cloudformation list-stacks`

Lists every stack in the region, even deleted or failed ones. We used it to prove a deploy had
never run at all.

### `aws budgets describe-budgets` / `aws budgets describe-notifications-for-budget`

Read the live budgets and their alerts. This is how we check that AWS matches the template.

**System design:** "the deploy said success" is not the same as "the thing is right." Always read
back the real resource.

### `aws budgets delete-budget --budget-name monthly-5-usd`

Removed a second $5 budget the setup wizard had made by hand. It was not in our templates and
would have sent duplicate emails.

**System design:** resources made outside IaC are **drift**. Drift means the repo no longer tells
the truth about the account. Keep one source of truth.

---

## 5. Email contacts: the alert has to reach you

### `aws notificationscontacts list-email-contacts --region us-east-1`

Lists **AWS User Notifications** email contacts and their status. Ours was `inactive`, meaning
unverified. The budget stack made this contact, so the budget alerts depend on it.

### `aws notificationscontacts get-email-contact --arn [contact-arn]`

Shows one contact with its creation time. The time matched the budget deploy to the second. That
is how we linked the two.

### `aws notificationscontacts send-activation-code --arn [contact-arn]`

Sends a fresh verification email. Codes expire after 12 hours.

### `aws notificationscontacts activate-email-contact --arn [contact-arn] --code [code]`

Activates the contact with the code from the email (it is the `token` in the verify link). We used
the CLI because the browser was signed in to the wrong account, and the CLI was already in the
right one. You get only five attempts.

**System design:** an alert that never reaches a human is not an alert. **Test the path end to
end**, not just the part that fires.

---

## 6. Cost Anomaly Detection: catch the weird spike

### `aws cloudformation deploy --template-file infra/aws/anomaly.yml --stack-name gg-anomaly --parameter-overrides AlertEmail=[your-email]`

Creates a monitor that watches each AWS service's daily spend, plus a daily email when an anomaly
costs $1 or more.

### `aws ce get-anomaly-monitors` / `aws ce get-anomaly-subscriptions`

Read back the monitor and the subscription. The subscriber showed `CONFIRMED`.

**System design:** budgets catch "too much in total." Anomaly detection catches "something
changed." A runaway loop can cost $3 in a day and still be under the budget. Two different signals
cover two different failures.

---

## 7. Saving progress

### `git add infra/aws/budgets.yml infra/aws/anomaly.yml && git commit -m "..."`

Commits the two working templates as a checkpoint before the next lesson.

---

## 8. IAM and GitHub OIDC: deploys without stored keys

### `aws iam list-open-id-connect-providers` / `aws iam list-roles`

Checked what IAM already had, so we would not make a duplicate.

### `aws cloudformation deploy --template-file infra/aws/github-oidc.yml --stack-name gg-github-oidc --capabilities CAPABILITY_IAM`

Created the **OIDC provider**. It tells AWS: "trust tokens that GitHub Actions signs, if they are
meant for `sts.amazonaws.com`."

`--capabilities CAPABILITY_IAM` is you saying "yes, I know this stack touches IAM." CloudFormation
refuses IAM changes without it, so nobody changes permissions by accident.

### Same deploy again with `--capabilities CAPABILITY_NAMED_IAM`

Added the role `gg-github-deploy`. Because we gave the role a fixed **name**, CloudFormation needs
the stronger `CAPABILITY_NAMED_IAM`. This deploy was an **update**: the change set added the role
and left the provider alone.

The role's **trust policy** says who may assume it:

1. Only through the GitHub OIDC provider.
2. Only tokens meant for AWS STS (`aud`).
3. Only from this repo's `main` branch (`sub`). Without this line, **any** GitHub repo could
   assume the role.
4. At most one hour per session.

### `aws iam get-role` / `aws iam list-attached-role-policies` / `aws iam list-role-policies`

Read back the trust policy and confirmed the role has **no permissions yet**. A role that can be
assumed but can do nothing is a safe place to stop.

**System design:**

- **Trust and permissions are separate.** The trust policy is "who can come in." The permissions
  policy is "what they can do once inside." You design and review them separately.
- **Least privilege.** Next, the GitHub role gets only "run CloudFormation on `gg-*` stacks" and
  "hand work to `gg-cfn-exec`." The exec role holds the real resource permissions. A stolen GitHub
  token can then deploy templates, but it cannot touch data directly.

---

## Ideas to remember

| Idea                             | Where we used it                                  |
| -------------------------------- | ------------------------------------------------- |
| Check identity first             | `sts get-caller-identity` before every change     |
| Short-lived credentials          | `aws login`, GitHub OIDC                          |
| Guardrails at the top            | The SCP region lock                               |
| Infrastructure as code           | Every real resource is a template in `infra/aws/` |
| No drift                         | Deleted the hand-made budget                      |
| Read back, don't trust "success" | `describe-*` and `get-*` after every deploy       |
| End-to-end alerts                | Activated the email contact                       |
| Least privilege                  | Trust only `main`; two-role deploy design         |
