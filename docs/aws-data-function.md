# Deploy the data function (AWS)

Ticket #281. Peter runs every command. Region is always `us-east-2` (the account SCP allows only this
region, and the gateway has no default). Nothing here prints a secret. Never paste an access key into
a file, an issue, a PR or a chat.

## What this creates

| Stack | Template | What |
|---|---|---|
| `gg-artifacts` | `infra/aws/artifacts.yml` | Private S3 bucket for the zipped Lambda code |
| `gg-app-data` | `infra/aws/data.yml` | `gg-data` and `gg-content` tables (on demand, PITR, deletion protection), Lambda `gg-app-data` (Node 22, arm64), 14-day log group, execution role, function URL (`AWS_IAM`), IAM user `gg-app-data-worker` with one policy (invoke this function URL only) |

Why by hand: the first deploy creates IAM roles and the deploy role `gg-github-deploy` cannot do that
(and `gg-cfn-exec` has no permissions yet, see the PR notes). Run the first deploy with your own
admin session. Later code-only deploys can move into `deploy.yml` in a follow-up ticket.

## 1. Sign in

```text
aws login
aws sts get-caller-identity --query Arn --output text
export AWS_REGION=us-east-2 AWS_DEFAULT_REGION=us-east-2
export AWS_PAGER=""
```

## 2. Build the bundle and zip it

Run from the repo root.

```text
pnpm install --frozen-lockfile
pnpm nx build data-access --skip-nx-cache
mkdir -p .aws-build && (cd libs/data-access/dist && zip -q -j ../../../.aws-build/lambda.zip lambda.mjs)
export CODE_KEY="lambda-$(shasum -a 256 .aws-build/lambda.zip | cut -c1-16).zip"
echo "$CODE_KEY"
```

`.aws-build` is not tracked; delete it when done. The key changes whenever the code changes, so
CloudFormation sees the update.

## 3. Create the code bucket and upload

```text
aws cloudformation deploy --stack-name gg-artifacts --template-file infra/aws/artifacts.yml --region us-east-2
export CODE_BUCKET=$(aws cloudformation describe-stacks --stack-name gg-artifacts --region us-east-2 \
  --query "Stacks[0].Outputs[?OutputKey=='CodeBucketName'].OutputValue" --output text)
aws s3 cp .aws-build/lambda.zip "s3://$CODE_BUCKET/$CODE_KEY" --region us-east-2
```

## 4. Deploy the data stack

Account deletion (#327) needs a service secret: a random value shared by the data function (CloudFormation
parameter `ServiceSecret`, NoEcho) and the Worker (GitHub secret `DATA_FUNCTION_SERVICE_SECRET`). Make it once
and store it without printing it. Keep the same value on every later stack update (pass it again, or use
`UsePreviousValue`), and rotate by changing both and redeploying.

```text
SERVICE_SECRET=$(openssl rand -hex 32)
printf '%s' "$SERVICE_SECRET" | gh secret set DATA_FUNCTION_SERVICE_SECRET
```

Then set the Clerk webhook: in the Clerk dashboard add an endpoint `https://api.grieversguidance.com/webhooks/clerk`
subscribed to `user.deleted` only, copy its signing secret (`whsec_...`) and run
`gh secret set CLERK_WEBHOOK_SECRET` (paste when asked). Then run the Deploy workflow.

Use your Clerk issuer (the repo variable `CLERK_ISSUER`; it is public). The JWKS URL is the issuer
plus `/.well-known/jwks.json`.

```text
export CLERK_ISSUER=$(gh variable get CLERK_ISSUER)
CLERK_ISSUER=${CLERK_ISSUER%/}
aws cloudformation deploy --stack-name gg-app-data --template-file infra/aws/data.yml \
  --capabilities CAPABILITY_NAMED_IAM --region us-east-2 \
  --parameter-overrides CodeBucket="$CODE_BUCKET" CodeKey="$CODE_KEY" \
    AuthIssuer="$CLERK_ISSUER" AuthJwksUrl="$CLERK_ISSUER/.well-known/jwks.json" \
    ServiceSecret="$SERVICE_SECRET"
```

If the first deploy fails, the stack sits in `ROLLBACK_COMPLETE` and must be deleted before a retry.
Do this only while the tables are empty (a first deploy). The tables and some named IAM items are
retained or protected, so clean up in this order:

```text
aws cloudformation delete-stack --stack-name gg-app-data --region us-east-2
aws cloudformation wait stack-delete-complete --stack-name gg-app-data --region us-east-2
for t in gg-data gg-content; do
  aws dynamodb update-table --table-name $t --no-deletion-protection-enabled --region us-east-2 \
    && aws dynamodb delete-table --table-name $t --region us-east-2
done
```

- If the stack delete fails because `gg-app-data-worker` still has an access key, delete the key first:
  `aws iam list-access-keys --user-name gg-app-data-worker`, then
  `aws iam delete-access-key --user-name gg-app-data-worker --access-key-id <id>`, and delete the stack again.
- If the user `gg-app-data-worker` or the role `gg-app-data-function` is left behind (fixed names make a
  retry fail with "already exists"), remove them: `aws iam delete-user-policy --user-name gg-app-data-worker
  --policy-name invoke-data-function-url` then `aws iam delete-user --user-name gg-app-data-worker`; and
  `aws iam delete-role-policy --role-name gg-app-data-function --policy-name gg-app-data-function` then
  `aws iam delete-role --role-name gg-app-data-function`.

## 5. Read the outputs

```text
aws cloudformation describe-stacks --stack-name gg-app-data --region us-east-2 \
  --query "Stacks[0].Outputs[].[OutputKey,OutputValue]" --output text
export FN_URL=$(aws lambda get-function-url-config --function-name gg-app-data --query FunctionUrl --output text)
FN_URL=${FN_URL%/}
```

## 6. Verify the tables

```text
aws dynamodb describe-continuous-backups --table-name gg-data --region us-east-2 \
  --query "ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus"
aws dynamodb describe-continuous-backups --table-name gg-content --region us-east-2 \
  --query "ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus"
aws dynamodb describe-table --table-name gg-data --region us-east-2 \
  --query "Table.[DeletionProtectionEnabled,GlobalSecondaryIndexes[0].IndexName]"
aws dynamodb describe-time-to-live --table-name gg-data --region us-east-2
```

Expect `"ENABLED"` twice, `[true, "gsi1"]`, and TTL `ENABLED` on `ttl`. Put the output in the PR.

## 7. Create the Worker access key and store it

This pipes the key straight into GitHub secrets. It prints nothing. `jq` is needed.
It keeps the pair in two shell variables (not exported) for step 8; close the terminal afterwards.

```text
KEY_JSON=$(aws iam create-access-key --user-name gg-app-data-worker --output json)
if [ -z "$KEY_JSON" ]; then
  echo "create-access-key failed; stop here"
else
  printf '%s' "$KEY_JSON" | jq -j .AccessKey.AccessKeyId | gh secret set DATA_FUNCTION_ACCESS_KEY_ID
  printf '%s' "$KEY_JSON" | jq -j .AccessKey.SecretAccessKey | gh secret set DATA_FUNCTION_SECRET_ACCESS_KEY
  WORKER_KEY=$(printf '%s' "$KEY_JSON" | jq -j .AccessKey.AccessKeyId)
  WORKER_SECRET=$(printf '%s' "$KEY_JSON" | jq -j .AccessKey.SecretAccessKey)
fi
unset KEY_JSON
```

Check the two secrets are listed (names only): `gh secret list | grep DATA_FUNCTION`.

Set the URL as a repo variable (public), then run the Deploy workflow (`gh workflow run deploy.yml`)
so the Worker gets the URL and both secrets:

```text
gh variable set DATA_FUNCTION_URL --body "$FN_URL"
```

## 8. Verify the function URL

Unsigned call. Expect `403`:

```text
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$FN_URL/v1" \
  -H 'content-type: application/json' -d '{"action":"getProfile","args":{}}'
```

Signed call. Clerk session tokens last about 60 seconds, so copy a fresh one right before you run
this. Expect `401` without `USER_TOKEN` and `200` with a fresh one. The script prints only the status
code and the first 120 characters of the body. The script reads the keys from the line, so nothing is
exported.

```text
WORKER_KEY=... WORKER_SECRET=... FN_URL="$FN_URL" node infra/aws/sign-test.mjs
WORKER_KEY=... WORKER_SECRET=... FN_URL="$FN_URL" USER_TOKEN=... node infra/aws/sign-test.mjs
```

We dropped `curl --aws-sigv4` because it returned `403 Forbidden` for a call that aws4fetch signs
correctly. We did not find the root cause.

With an expired or bad token you should get `401` (not `403`): that proves AWS let the call in and the
function rejected the user. If the signed call returns `403`, see "If the signed call is denied" below.

The Worker user cannot read the tables. Expect `implicitDeny` for every row:

```text
USER_ARN=$(aws iam get-user --user-name gg-app-data-worker --query User.Arn --output text)
TABLE_ARN=$(aws dynamodb describe-table --table-name gg-data --region us-east-2 --query Table.TableArn --output text)
CONTENT_ARN=$(aws dynamodb describe-table --table-name gg-content --region us-east-2 --query Table.TableArn --output text)
aws iam simulate-principal-policy --policy-source-arn "$USER_ARN" \
  --action-names dynamodb:GetItem dynamodb:Query dynamodb:PutItem dynamodb:Scan \
  --resource-arns "$TABLE_ARN" "$TABLE_ARN/index/gsi1" "$CONTENT_ARN" \
  --query "EvaluationResults[].[EvalActionName,EvalResourceName,EvalDecision]" --output text
```

The Worker user can invoke the function through its URL only. Expect `allowed` for the first call and
`implicitDeny` for the second (no URL context):

```text
FN_ARN=$(aws cloudformation describe-stack-resources --stack-name gg-app-data --region us-east-2 \
  --logical-resource-id DataFunction --query "StackResources[0].PhysicalResourceId" --output text | \
  xargs -I{} aws lambda get-function --function-name {} --region us-east-2 --query Configuration.FunctionArn --output text)
aws iam simulate-principal-policy --policy-source-arn "$USER_ARN" --action-names lambda:InvokeFunction \
  --resource-arns "$FN_ARN" \
  --context-entries ContextKeyName=lambda:InvokedViaFunctionUrl,ContextKeyValues=true,ContextKeyType=boolean \
  --query "EvaluationResults[].[EvalActionName,EvalDecision]" --output text
aws iam simulate-principal-policy --policy-source-arn "$USER_ARN" --action-names lambda:InvokeFunction \
  --resource-arns "$FN_ARN" --query "EvaluationResults[].[EvalActionName,EvalDecision]" --output text
```

## Update the code later

Repeat steps 2, 3 (upload only) and 4 with the new `CODE_KEY`.

## If the signed call is denied

AWS changed function URL checks in late 2025: a call needs `lambda:InvokeFunctionUrl` and also
`lambda:InvokeFunction`. The template grants both on this one function (the second only for calls made
through the URL). If you still get `403`, check the region used for signing (`us-east-2`) and that
`FN_URL` has no path.

## Rotate the Worker key every 90 days

Set a calendar reminder for 90 days after each key is created. An IAM user can hold two keys, so there
is no downtime.

1. List keys, note the old key ID: `aws iam list-access-keys --user-name gg-app-data-worker`
2. Create the second key and store it (same piping as step 7, no printing).
3. Run the Deploy workflow: `gh workflow run deploy.yml`. Wait for it to finish (`gh run watch`).
4. Check: step 8 (unsigned `403`; signed call `200`) and the live app's profile screen.
5. Delete the old key: `aws iam delete-access-key --user-name gg-app-data-worker --access-key-id <old id>`
6. Reset the calendar reminder.

If a key leaks, do step 5 for that key first, then steps 2 to 4.
