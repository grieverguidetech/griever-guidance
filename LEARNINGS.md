# Learnings

## AWS infra (ticket #185)

This is a step-by-step story of how we set up AWS for Grievers Guidance. Each command gets two
short parts:

- **What it does:** the plain job of the command.
- **Why it matters:** the system design idea behind it.

Read it top to bottom. The commands are in the order we ran them.

> This repo is public. So account IDs, emails and codes show as `[placeholders]`.

## The big picture

We build **guardrails first** and features later. Think of it like a new house. You put in smoke
alarms and locks before you move the furniture in.

Before any app code runs on AWS, we want three things:

1. **Know who you are.** Every command runs as someone. Check who before you change anything.
2. **Cap the damage.** If money starts to leak, an alert tells you fast.
3. **No stored keys.** GitHub deploys with short-lived passes, not a key that lasts forever.

All the real AWS resources live in **templates** in `infra/aws/`. We type CLI commands to learn
and to check. We do not type them to build. This idea is called **infrastructure as code
(IaC)**. The repo is the source of truth. If the account were wiped, you could rebuild it from
the repo.

---

## 1. Signing in

### `aws login --region us-east-1`

**What it does:** It opens your browser. You sign in. The CLI gets **temporary credentials**.
Nothing permanent is saved on your laptop.

**Why it matters:** Short-lived credentials are safer than access keys. A stolen key works until
someone deletes it. A stolen session dies on its own after a while. You will see this idea again
with GitHub OIDC.

### `aws sts get-caller-identity`

**What it does:** It answers one question: "Who am I right now?" It prints the account and the
user or role.

**Why it matters:** Always check who you are before you change things. We made sure the answer
did **not** end in `:root`. The root user can do everything, and nothing can limit it. So you use
root only for the few jobs that need it.

### `aws configure set region us-east-2` / `aws configure get region`

**What it does:** It saves your default region in `~/.aws/config`, and then reads it back. It
changes nothing inside AWS.

**Why it matters:** Most AWS services are **regional**. A table in Ohio does not exist in
Virginia. If the region is wrong or empty, commands fail. Or worse, they build things in a region
you never look at.

---

## 2. Working on a ticket branch (git and GitHub)

### `git worktree add .worktrees/aws-185 -b feat/aws-account-185 main`

**What it does:** It makes a second folder with its own branch. Your first folder stays on
`main`. The ticket work lives in the second folder.

### `pnpm install --frozen-lockfile --prefer-offline`

**What it does:** It installs packages in the new folder. Each worktree needs its own
`node_modules`. `--frozen-lockfile` means "install exactly what the lockfile says, or stop."

### `gh project item-edit ...` and `gh issue edit 185 --add-label in-progress`

**What it does:** It moves the ticket to **In progress** on the board. Now everyone can see what
is being worked on.

**Why it matters:** One ticket, one branch, one PR. That keeps each change small. Small changes
are easy to review and easy to undo.

---

## 3. The surprise: an Organization and a region lock

### `aws cloudformation validate-template --template-body file://infra/aws/budgets.yml`

**What it does:** It asks CloudFormation to read a template and check its shape. It builds
nothing.

The first time we ran it, it failed:

```text
AccessDenied ... explicit deny in a service control policy
```

### `aws organizations describe-organization`

**What it does:** It shows the Organization your account belongs to. It also shows the email of
the account in charge. It only reads.

**What we learned:** Our account is a **member** of an **AWS Organization**. A different account,
the **management account**, is in charge. That account sets rules called **service control
policies (SCPs)**.

An SCP is like a rule from the landlord. It beats everything else, even a role with "full
access." Our SCP was a **region lock**:

| Region | What is allowed |
|---|---|
| `us-east-1` | Only global services (IAM, Budgets, Cost Explorer, STS, Route 53, CloudFront, ACM) |
| `us-west-2` | Almost nothing (Identity Center, Bedrock, support) |
| `us-east-2` | Everything. This is our home region. |
| Any other | Blocked |

So we moved Grievers Guidance to **`us-east-2` (Ohio)**.

**Why it matters:** This is **defense in depth**. That means more than one layer of protection.
Even if a role has too much power, the SCP stops it from building in a region you forgot about.
Global services like IAM and Budgets still work. AWS runs them from `us-east-1`, wherever you
call from.

---

## 4. Budgets: a number to watch

### `aws cloudformation deploy --template-file infra/aws/budgets.yml --stack-name gg-budgets --parameter-overrides AlertEmail=[your-email]`

**What it does:** It creates (or updates) a **stack**. A stack is one live copy of a template.
First, `deploy` makes a **change set**, which is a list of what will change. Then it applies the
change set and waits until it ends.

The result: a $10 monthly budget. It emails you when **actual** spending goes over $5, and again
over $10.

**Why it matters:** The email is a **parameter**. You give it when you deploy. It is not written
in the template. So the template is safe to share, and you can reuse it.

### `aws cloudformation describe-stacks --stack-name gg-budgets`

**What it does:** It shows the stack's status. Here is what to look for:

- `CREATE_COMPLETE`: the first deploy worked.
- `UPDATE_COMPLETE`: a later deploy worked.
- `ROLLBACK_COMPLETE`: it failed, and CloudFormation undid it.

### `aws cloudformation list-stacks`

**What it does:** It lists every stack in the region. That includes deleted and failed ones. We
used it to prove a deploy had never run at all.

### `aws budgets describe-budgets` / `aws budgets describe-notifications-for-budget`

**What it does:** It reads the live budgets and their alerts.

**Why it matters:** "The deploy said success" is not the same as "the thing is right." Always
read back the real resource. Then compare it with what you expected.

### `aws budgets delete-budget --budget-name monthly-5-usd`

**What it does:** It deletes a second $5 budget. The setup wizard had made it by hand. It was not
in our templates, and it would have sent you two emails for the same event.

**Why it matters:** Things made outside your templates are called **drift**. Drift means the repo
no longer tells the truth about the account. Keep one source of truth.

---

## 5. Email contacts: the alert has to reach you

### `aws notificationscontacts list-email-contacts --region us-east-1`

**What it does:** It lists the email contacts for **AWS User Notifications**, with their status.
Ours said `inactive`. That means the address was not verified yet. Our budget stack made this
contact, so the budget alerts depend on it.

### `aws notificationscontacts get-email-contact --arn [contact-arn]`

**What it does:** It shows one contact and when it was made. The time matched the budget deploy
to within 8 seconds. That is how we connected the two.

### `aws notificationscontacts send-activation-code --arn [contact-arn]`

**What it does:** It sends a fresh verify email. Each code lasts 12 hours.

### `aws notificationscontacts activate-email-contact --arn [contact-arn] --code [code]`

**What it does:** It turns the contact on with the code from the email. The code is the `token`
part of the verify link.

We used the CLI here for a reason. The browser was signed in to the wrong account, but the CLI
was already in the right one. Be careful: you only get five tries.

**Why it matters:** An alert that never reaches a person is not really an alert. **Test the whole
path**, from the alarm all the way to your inbox.

---

## 6. Cost Anomaly Detection: catch the weird spike

### `aws cloudformation deploy --template-file infra/aws/anomaly.yml --stack-name gg-anomaly --parameter-overrides AlertEmail=[your-email]`

**What it does:** It makes a monitor that watches each AWS service's daily spending. When
something looks unusual and costs $1 or more, you get a daily email.

### `aws ce get-anomaly-monitors` / `aws ce get-anomaly-subscriptions`

**What it does:** It reads back the monitor and the email subscription. The subscriber said
`CONFIRMED`.

**Why it matters:** A budget catches "too much in total." Anomaly detection catches "something
changed." For example, a broken loop could cost $3 in one day. That is still under the budget,
but it is not normal. Two signals catch two kinds of problems.

---

## 7. Saving progress

### `git add infra/aws/budgets.yml infra/aws/anomaly.yml && git commit -m "..."`

**What it does:** It saves the two working templates as a checkpoint before the next lesson.

---

## 8. IAM and GitHub OIDC: deploys without stored keys

First, a quick idea. GitHub Actions needs to deploy to AWS. The old way is to store an AWS key in
GitHub. But a stolen key works until someone deletes it.

**OIDC** works differently. GitHub gives each workflow run a short, signed pass. AWS checks the
pass and swaps it for credentials that last about one hour. No key is stored anywhere.

### `aws iam list-open-id-connect-providers` / `aws iam list-roles`

**What it does:** It shows what IAM already has. We checked so we would not make a copy.

### `aws cloudformation deploy --template-file infra/aws/github-oidc.yml --stack-name gg-github-oidc --capabilities CAPABILITY_IAM`

**What it does:** It creates the **OIDC provider**. This tells AWS: "Trust passes that GitHub
Actions signs, if they are meant for `sts.amazonaws.com`."

`--capabilities CAPABILITY_IAM` is you saying "Yes, I know this touches IAM." CloudFormation will
not change IAM without it. That way, nobody changes permissions by accident.

### The same deploy again, with `--capabilities CAPABILITY_NAMED_IAM`

**What it does:** It adds the role `gg-github-deploy`. We gave the role a fixed **name**, so
CloudFormation needs the stronger `CAPABILITY_NAMED_IAM`. This deploy was an **update**. The
change set added the role and left the provider alone.

The role's **trust policy** says who may use the role:

1. Only callers that come through the GitHub OIDC provider.
2. Only passes meant for AWS STS (`aud`).
3. Only this repo's `main` branch (`sub`). Without this line, **any** GitHub repo could use the
   role.
4. One hour at most for each session.

### `aws iam get-role` / `aws iam list-attached-role-policies` / `aws iam list-role-policies`

**What it does:** It reads back the trust policy. At that point, the role had **no
permissions**. A role that can be used but can do nothing is a safe place to pause. (Section 9
gives it permissions.)

**Why it matters:**

- **Trust and permissions are two different things.** The trust policy is "who can come in." The
  permissions policy is "what they can do once inside." Design and review them one at a time.
- **Least privilege** means giving only the access a job needs. Next, the GitHub role gets only
  two powers. It can run CloudFormation on `gg-app-*` stacks. It can hand work to `gg-cfn-exec`.
  The exec role holds the real power. So a stolen GitHub pass can deploy templates, but it cannot
  touch data directly.

---

## 9. Two roles: the deploy role and the exec role

### The same deploy, now with `gg-cfn-exec` and a policy

**What it does:** It adds a second role, `gg-cfn-exec`. It also gives `gg-github-deploy` a small
policy.

Here is how the two roles split the work:

| Role | Who can use it | What it can do |
|---|---|---|
| `gg-github-deploy` | GitHub Actions, this repo, `main` only | Make and run change sets on `gg-app-*` stacks, and hand `gg-cfn-exec` to CloudFormation |
| `gg-cfn-exec` | The CloudFormation service, for this account only | Nothing yet. Ticket #281 adds Lambda and DynamoDB permissions |

A good way to picture it: GitHub is a delivery driver. It can drop a box (a template) at the
loading dock. Only the warehouse staff (`gg-cfn-exec`) can open the box and put things on the
shelves.

Four small details in the policy do a lot of work:

1. **`gg-app-*`, not `gg-*`.** `gg-*` would also match `gg-github-oidc`. That is the stack that
   holds the deploy role itself. Then GitHub could rewrite its own permissions. That is called
   **privilege escalation**.
2. **`cloudformation:RoleArn`.** GitHub may make a change set only if it uses `gg-cfn-exec`.
   Without this rule, a change set with no role runs with GitHub's own permissions.
3. **`iam:PassedToService`.** GitHub may hand `gg-cfn-exec` to CloudFormation, and to nothing
   else.
4. **`aws:SourceAccount`** on the exec role. CloudFormation may use the role only for this
   account. This stops the **confused deputy** problem. That is when a trusted service gets
   tricked into working for someone else.

**A YAML trap we hit:** `Policies:` was two spaces too far left. So YAML thought it was a
neighbor of `Properties`, not inside it. CloudFormation said `Invalid template resource property
'Policies'`. In YAML, the spaces *are* the structure.

**Another trap:** `validate-template` needs `file://` before the path. Without it, the CLI sends
the path text itself as the template. Then you get `unsupported structure`. But `deploy` takes a
plain path with `--template-file`.

---

## 10. Proving the policy: the IAM policy simulator

### `aws iam simulate-principal-policy`

**What it does:** It asks IAM a "what if" question: "If this role tried this action on this
thing, would it be allowed?" Nothing really runs, so it is safe.

You give it four things:

- **Who:** `--policy-source-arn`
- **What:** `--action-names`
- **Where:** `--resource-arns`
- **Extra facts** for conditions: `--context-entries`

IAM then decides in three steps:

1. Does any rule say `Deny`? Then the answer is **`explicitDeny`**.
2. If not, does a rule say `Allow`, and match everything? Then it is **`allowed`**.
3. If not, the answer is **`implicitDeny`**. That is IAM's default "no."

Our final results, all in `us-east-2`:

| Test | Result |
|---|---|
| `CreateChangeSet` on `gg-app-test` with `gg-cfn-exec` | allowed |
| `CreateChangeSet` on `gg-app-test` with no role | implicitDeny |
| `CreateChangeSet` on `gg-app-test` with another role | implicitDeny |
| `ExecuteChangeSet` on `gg-app-test` | allowed |
| `CreateChangeSet` / `ExecuteChangeSet` on `gg-github-oidc` | implicitDeny |
| `PassRole` `gg-cfn-exec` to Lambda | implicitDeny |
| `PassRole` `gg-cfn-exec` to CloudFormation | allowed |

**What surprised us:** On the first run, even `gg-app-test` said `explicitDeny`. The output said
`AllowedByOrganizations: false`. So the simulator **does** check SCPs. We had not told it the
region, so it hit the region lock. When we added `aws:RequestedRegion=us-east-2`, it worked.

The lesson from that: any GitHub workflow that uses this role must set `aws-region: us-east-2`.

**A zsh trap:** `$A:role` lost its `:r`. In zsh, `:r` is a special code that means "remove the
file extension." Use `${A}` with braces when a colon comes right after a variable.

**Why it matters:** Test the **no** answers, not only the yes answers. A policy can allow the
right thing and still allow too much. The guard is proven only when the wrong requests fail.

---

## 11. Lesson 4: CloudFormation basics, all in one place

Here are the main words:

| Word | What it means |
|---|---|
| **Template** | A YAML file that describes resources. It lives in the repo (`infra/aws/*.yml`). |
| **Stack** | One live copy of a template. We have `gg-budgets`, `gg-anomaly` and `gg-github-oidc`. |
| **Parameter** | A value you give at deploy time, like `AlertEmail`. It keeps private data out of the template. |
| **Change set** | A list of what will change between the live stack and the new template. `deploy` makes one, then runs it. |
| **Capabilities** | Your OK for IAM changes. Use `CAPABILITY_IAM` when CloudFormation picks the names, and `CAPABILITY_NAMED_IAM` when you pick them. |
| **Intrinsic functions** | Small helpers. `!Ref` gets a parameter or a resource's main ID. `!Sub` fills `${...}` into a string. `!GetAtt` gets one detail, like a role's ARN. |
| **Rollback** | If a deploy fails, CloudFormation undoes it. A failed first deploy ends in `ROLLBACK_COMPLETE`. You must delete that stack before you try again. |

And here are the commands, in the order you use them:

1. `aws cloudformation validate-template --template-body file://<path>`: check the shape. It
   builds nothing.
2. `aws cloudformation deploy --template-file <path> --stack-name <name> [--parameter-overrides ...] [--capabilities ...]`:
   create or update the stack.
3. `aws cloudformation describe-stacks --stack-name <name>`: read the status.
4. `aws cloudformation describe-stack-events --stack-name <name>`: read what happened, step by
   step, when something fails.
5. Read back the real resources (`get-*`, `describe-*`). Check that AWS matches the template.

**Why it matters:** CloudFormation is **declarative**. You write *what* should exist.
CloudFormation works out *how* to get there from what exists now. So the template is the record
of the system. You do not have to remember which commands you ran.

---

## Ideas to remember

| Idea | Where we used it |
|---|---|
| Check who you are first | `sts get-caller-identity` before every change |
| Short-lived credentials | `aws login`, GitHub OIDC |
| Guardrails at the top | The SCP region lock |
| Infrastructure as code | Every real resource is a template in `infra/aws/` |
| No drift | We deleted the hand-made budget |
| Read back, don't trust "success" | `describe-*` and `get-*` after every deploy |
| Test the whole alert path | We turned on the email contact |
| Least privilege | Trust only `main`; the two-role deploy design |
| Block privilege escalation | The `gg-app-*` prefix and `cloudformation:RoleArn` |
| Test the "no" answers | The IAM policy simulator |
