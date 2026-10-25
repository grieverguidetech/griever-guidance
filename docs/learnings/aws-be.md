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

- **Why does a test fail when a fact has an extra key?** `parseFlowFacts` rejects unknown keys. It does
  not drop them. So a stray `contactId` gets an error, not a silent save (C8).

### Step 2: listFlows, who sees which people

**What we built.** `listFlows()` in `libs/data-access/src/rules/flows.ts` returns the people the caller
may see, each with a role.

**The decision.** On Supabase, RLS policies hid other people's rows. DynamoDB has no RLS. So we get the
same effect by choosing which partitions we query. We query the caller's own partition. If the caller has
a `MEMBER_OF` item, we also query the owner's partition. We never query anyone else's partition, so a
stranger gets `[]`.

```mermaid
flowchart TD
  A[listFlows caller] --> B["Query USER#caller<br/>sk begins with FLOW#"]
  B --> C[Each item: role = owner]
  A --> D{"MEMBER_OF item<br/>for the caller?"}
  D -- no --> F[Return the list]
  D -- yes --> E["Query USER#ownerId<br/>sk begins with FLOW#"]
  E --> G[Each item: role = member]
  C --> F
  G --> F
```

**Questions and answers.**

- **Why did Vitest find no tests?** The `it(...)` blocks were inside `beforeAll`. Vitest only collects
  tests at the `describe` level.

### Step 3: createFlow, one transaction with four checks

**What we built.** `createFlow()` in `libs/data-access/src/rules/flows.ts` creates a person for the
caller, as owner. A member can never create one (C11).

**The decision.** On Supabase, a trigger and a row lock kept this safe. In DynamoDB, one
`TransactWriteItems` call writes or checks four items, and either all succeed or none do. Each item has a
position. When a condition fails, DynamoDB reports the position, and the rule turns it into a reason.

```mermaid
flowchart TD
  S["createFlow caller, id, facts"] --> V{"Facts and id valid?"}
  V -- no --> INV[invalid]
  V -- yes --> R["Read the profile<br/>inside runAction"]
  R --> M{"accountType = member?"}
  M -- yes --> REF["throw Refusal<br/>forbidden, nothing written"]
  M -- no --> TX

  subgraph TX ["One transaction: all or nothing"]
    P0["0 Put guard FLOW#id<br/>if it does not exist"]
    P1["1 Put the flow item<br/>built by encodeFlow"]
    P2["2 Check MEMBER_OF<br/>does not exist"]
    P3["3 Profile: bump version if unchanged and owner,<br/>or create it as owner"]
  end

  TX --> OK[ok: the new FlowRecord]
  TX -. "0 fails" .-> CON[conflict: the id is taken]
  TX -. "2 fails" .-> FOR[forbidden: caller is a member]
  TX -. "3 fails" .-> RETRY["Profile changed: read again<br/>up to 3 tries, then busy"]
  RETRY --> R
```

**Questions and answers.**

- **Why do we need the `Refusal` class?** `runAction` always sends the writes that the action returns. It
  has no "stop" option. If a member reached the transaction, position 3 would fail, `runAction` would take
  it for a version change, retry 3 times, and return `busy` instead of `forbidden`. So the action reads the
  profile, sees `member`, and throws. The class lets the `catch` tell our planned "no" apart from a real
  error.
- **Why is the check inside the action and not before `runAction`?** Because of the race. If the profile
  changes mid-write, `runAction` reads again on the retry. That second read must also refuse a member.
- **Could we remove `Refusal`?** Yes, if `runAction` let an action return "no writes, here is the
  answer". That changes `transact.ts`, which is outside #270. We kept `Refusal` for now.
