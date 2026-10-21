import { ListTablesCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';

/** Waits until DynamoDB Local answers, so `pnpm aws:up && pnpm aws:seed` works on a cold start. */
export async function waitForDynamo(client: DynamoDBClient, attempts = 30): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await client.send(new ListTablesCommand({ Limit: 1 }));
      return;
    } catch (error) {
      if (i >= attempts) throw new Error(`DynamoDB Local did not answer: ${String(error)}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

/** True when DynamoDB answers within one second. Used to guard the integration tests. */
export async function isDynamoReachable(client: DynamoDBClient): Promise<boolean> {
  try {
    await client.send(new ListTablesCommand({ Limit: 1 }), { abortSignal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}
