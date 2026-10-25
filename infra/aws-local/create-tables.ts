import { createDynamoClient, ensureTables, loadLocalConfig, waitForDynamo } from '../../libs/data-aws/src/index.js';


const config = loadLocalConfig();
const client = createDynamoClient(config);
await waitForDynamo(client);
const created = await ensureTables(client, config);
console.log(created.length ? `Created tables: ${created.join(', ')}` : 'Tables already exist.');
