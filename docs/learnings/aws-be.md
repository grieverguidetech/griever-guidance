# Learning log: the aws-be move

Peter builds the `aws-be` tickets himself, one step at a time. Each step records the system decision, the
questions Peter asked, and the answers. The focus is the concepts and the decisions, not line-by-line code.

## #270: profile and shared-people access rules

### Step 1: the flow item codec

**What we built.** `encodeFlow()` in `libs/data-access/src/items/flowItem.ts` turns one shared person into
the exact DynamoDB item that is stored, and nothing more.

**The decision.** On Supabase, the `flows` table has fixed columns, so the database itself refuses an
unknown field. DynamoDB stores any attribute it is given. So the "columns" now live in code: the codec
lists every attribute by name, and a test fails if one is added or if a name looks like contact data,
drafts or message text (C2, C3). The facts go through `parseFlowFacts` from `libs/shared`, the same
whitelist the apps use, so the server and the apps cannot disagree on what a fact is.

**Questions and answers.**

- _(to be filled in after Peter's questions)_
