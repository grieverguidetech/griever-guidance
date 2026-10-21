import {
  createDocClient,
  createDynamoClient,
  ensureTables,
  loadLocalConfig,
  seedContent,
  waitForDynamo,
} from '../../libs/data-aws/src/index.js';


const config = loadLocalConfig();
const client = createDynamoClient(config);
await waitForDynamo(client);
await ensureTables(client, config);
const count = await seedContent(createDocClient(client), config);
console.log(`Seeded ${count} items into ${config.contentTable}.`);
