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

Read back the trust policy and confirmed the role had **no permissions at that point**. A role
that can be assumed but can do nothing is a safe place to stop. (Section 9 adds its permissions.)

**System design:**

- **Trust and permissions are separate.** The trust policy is "who can come in." The permissions
  policy is "what they can do once inside." You design and review them separately.
- **Least privilege.** Next, the GitHub role gets only "run CloudFormation on `gg-app-*` stacks"
  and "hand work to `gg-cfn-exec`." The exec role holds the real resource permissions. A stolen
  GitHub token can then deploy templates, but it cannot touch data directly.

---

## 9. Two roles: the deploy role and the exec role

### Same deploy, now with `gg-cfn-exec` and an inline policy

We added a second role, `gg-cfn-exec`, and gave `gg-github-deploy` a small inline policy.

| Role | Who can assume it | What it can do |
|---|---|---|
| `gg-github-deploy` | GitHub Actions, this repo, `main` only | Make and run change sets on `gg-app-*` stacks, and pass `gg-cfn-exec` to CloudFormation |
| `gg-cfn-exec` | The CloudFormation service, for this account only | Nothing yet. Ticket #281 adds Lambda and DynamoDB permissions |

Four details in the policy matter:

1. **`gg-app-*`, not `gg-*`.** `gg-*` would match `gg-github-oidc`, the stack that holds the
   deploy role itself. Then GitHub could rewrite its own permissions. That is called
   **privilege escalation**.
2. **`cloudformation:RoleArn`.** `CreateChangeSet` is allowed only when the change set uses
   `gg-cfn-exec`. Without this, a change set with no role runs with the caller's own permissions.
3. **`iam:PassedToService`.** The deploy role may hand `gg-cfn-exec` to CloudFormation and to
   nothing else.
4. **`aws:SourceAccount`** on the exec role's trust policy. CloudFormation may use the role only
   for this account. This blocks the **confused deputy** problem, where a trusted service is
   tricked into acting for someone else.

**A YAML trap we hit:** `Policies:` was 2 spaces too far left, so YAML read it as a sibling of
`Properties`. CloudFormation said `Invalid template resource property 'Policies'`. In YAML,
indentation *is* the structure.

**Another trap:** `validate-template` needs `file://` in front of the path. Without it, the CLI
sends the path text itself as the template, and you get `unsupported structure`. `deploy` takes a
plain path with `--template-file`.

---

## 10. Proving the policy: the IAM policy simulator

### `aws iam simulate-principal-policy`

Asks IAM: "if this role tried this action on this resource, would it be allowed?" Nothing runs for
real. You give it a **who** (`--policy-source-arn`), a **what** (`--action-names`), a **where**
(`--resource-arns`), and any condition values (`--context-entries`).

IAM answers with its normal decision logic:

1. An explicit `Deny` anywhere: **`explicitDeny`**.
2. Otherwise, an `Allow` that matches action, resource and conditions: **`allowed`**.
3. Otherwise: **`implicitDeny`**, the default "no".

Our final results, all with `aws:RequestedRegion=us-east-2`:

| Test | Result |
|---|---|
| `CreateChangeSet` on `gg-app-test` with `gg-cfn-exec` | allowed |
| `CreateChangeSet` on `gg-app-test` with no role | implicitDeny |
| `CreateChangeSet` on `gg-app-test` with another role | implicitDeny |
| `ExecuteChangeSet` on `gg-app-test` | allowed |
| `CreateChangeSet` / `ExecuteChangeSet` on `gg-github-oidc` | implicitDeny |
| `PassRole` `gg-cfn-exec` to Lambda | implicitDeny |
| `PassRole` `gg-cfn-exec` to CloudFormation | allowed |

**What surprised us:** the first run said `explicitDeny` even for `gg-app-test`. The result showed
`AllowedByOrganizations: false`. The simulator **does** apply SCPs, and without a region it hit
the region lock. Adding `aws:RequestedRegion=us-east-2` fixed it. So any GitHub workflow that uses
this role must set `aws-region: us-east-2`.

**A zsh trap:** `$A:role` lost the `:r`, because in zsh `:r` is a modifier ("remove extension").
Use `${A}` with braces when a variable is followed by a colon.

**System design:** test the **denials**, not only the allows. A policy that allows the right thing
can still allow too much. The guard is only proven when the wrong requests fail.

---

## 11. Lesson 4: CloudFormation basics, in one place

| Word | Meaning |
|---|---|
| **Template** | A YAML file that describes resources. It lives in the repo (`infra/aws/*.yml`). |
| **Stack** | One deployed copy of a template. We have `gg-budgets`, `gg-anomaly` and `gg-github-oidc`. |
| **Parameter** | A value given at deploy time (`AlertEmail`), so the template holds no private data. |
| **Change set** | The list of differences between the live stack and the new template. `deploy` makes one, then runs it. |
| **Capabilities** | Your OK for IAM changes. `CAPABILITY_IAM` for unnamed IAM resources, `CAPABILITY_NAMED_IAM` when you name them. |
| **Intrinsic functions** | `!Ref` (a parameter or a resource's main ID), `!Sub` (fill `${...}` into a string), `!GetAtt` (one attribute, such as a role's ARN). |
| **Rollback** | If a create or update fails, CloudFormation undoes it. A failed first create ends in `ROLLBACK_COMPLETE`, and you must delete that stack before you try again. |

The commands, in the order you use them:

1. `aws cloudformation validate-template --template-body file://<path>`: check the shape. Creates
   nothing.
2. `aws cloudformation deploy --template-file <path> --stack-name <name> [--parameter-overrides ...] [--capabilities ...]`:
   create or update the stack.
3. `aws cloudformation describe-stacks --stack-name <name>`: read the status.
4. `aws cloudformation describe-stack-events --stack-name <name>`: read what happened, step by
   step, when something fails.
5. Read back the real resources (`get-*`, `describe-*`) to check that AWS matches the template.

**System design:** CloudFormation is **declarative**. You write *what* should exist, and
CloudFormation works out *how* to get there from what exists now. The template, not your memory
of which commands you ran, is the record of the system.

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
| Block privilege escalation       | `gg-app-*` prefix; `cloudformation:RoleArn`       |
| Test the denials                 | The IAM policy simulator                          |
