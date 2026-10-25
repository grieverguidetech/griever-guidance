import { serve } from '@hono/node-server';
import { createDataApp } from '../../libs/data-access/src/handler/app.js';
import { loadVerifier, wiredRules } from '../../libs/data-access/src/lambda.js';
import { createDocClient, createDynamoClient, loadLocalConfig, waitForDynamo } from '../../libs/data-aws/src/index.js';

// The data function on this machine, against DynamoDB Local. It needs DATA_AUTH_ISSUER and
// DATA_AUTH_JWKS_URL (see docs/aws-local.md). Loopback only: nothing outside this machine can reach it.
const PORT = 3002;
const HOST = '127.0.0.1';

const config = loadLocalConfig();
const client = createDynamoClient(config);
await waitForDynamo(client);

const app = createDataApp({
  rules: wiredRules,
  doc: createDocClient(client),
  table: config.dataTable,
  verify: loadVerifier(process.env),
});

serve({ fetch: app.fetch, hostname: HOST, port: PORT }, () => {
  console.log(`Data function listening at http://${HOST}:${PORT}/v1 (table ${config.dataTable})`);
});
