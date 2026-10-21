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
| SES stand-in | `aws-ses-v2-local@2.10.2` (Node) | 8105 |

The SES stand-in keeps sent emails in memory. Read them with `GET http://localhost:8105/store`.
Clear them with `POST http://localhost:8105/clear-store`. No email leaves your machine.

## Tables

The code is in `libs/data-aws`. The scripts are in `infra/aws-local`.

| Table | Partition key | Sort key | Index |
|---|---|---|---|
| `gg-content` | `kind` | `id` | none |
| `gg-data` | `pk` | `sk` | `gsi1` on `gsi1pk` and `gsi1sk` |

- Plan v4 names `gg-content` and its keys. It does not name the keys of the data table.
  `gg-data` is the simplest choice: generic `pk` and `sk`, and one index for lookups by email.
  A later ticket can change it before any real data exists.
- `seed` loads the "What you'll need" items, three samples and one example into `gg-content`.
- The checklist is a copy of the list in `WhatYoullNeed.tsx`. A unit test fails if the two differ.
- The sample and example texts come from the templates in `libs/shared`.

## Configuration

Code reads the endpoints from the environment. The names are in `.env.example`. If you set
nothing, the code uses the ports above and fake credentials. Never put real keys in the repo.

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

The `aws-local` job in `.github/workflows/ci.yml` runs on pull requests into `aws-be` only. It
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
