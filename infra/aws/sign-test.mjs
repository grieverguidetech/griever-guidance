// Signs one POST to the data function, the same way libs/gateway-auth/src/dataFunction.ts does.
// Usage: WORKER_KEY=... WORKER_SECRET=... FN_URL=... [USER_TOKEN=...] node infra/aws/sign-test.mjs
// aws4fetch is not a root dependency, so it is imported from the gateway-auth lib's node_modules.
import { AwsClient } from '../../libs/gateway-auth/node_modules/aws4fetch/dist/aws4fetch.esm.mjs';

const { WORKER_KEY, WORKER_SECRET, FN_URL, USER_TOKEN } = process.env;

if (!WORKER_KEY || !WORKER_SECRET || !FN_URL) {
  console.error('Set WORKER_KEY, WORKER_SECRET and FN_URL, then run this again.');
  process.exit(1);
}

// Same value as DATA_USER_TOKEN_HEADER in libs/shared/src/dataApi.ts.
const USER_TOKEN_HEADER = 'x-gg-user-token';

const headers = { 'content-type': 'application/json' };
if (USER_TOKEN) {
  headers[USER_TOKEN_HEADER] = USER_TOKEN;
}

const aws = new AwsClient({
  accessKeyId: WORKER_KEY,
  secretAccessKey: WORKER_SECRET,
  service: 'lambda',
  region: 'us-east-2',
});

try {
  const url = `${FN_URL.replace(/\/$/, '')}/v1`;
  const body = JSON.stringify({ action: 'getProfile', args: {} });
  const res = await fetch(await aws.sign(url, { method: 'POST', headers, body }));
  const text = await res.text();
  console.log(res.status);
  console.log(text.slice(0, 120));
} catch {
  console.error('The request failed before AWS answered.');
  process.exit(1);
}
