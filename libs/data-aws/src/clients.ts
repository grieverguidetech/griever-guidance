import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import type { AwsConfig } from './config.js';

// `credentials` is passed only when the config has them. Otherwise the SDK default chain runs.
function common(config: AwsConfig, endpoint: string | undefined) {
  return {
    region: config.region,
    ...(endpoint ? { endpoint } : {}),
    ...(config.credentials ? { credentials: config.credentials } : {}),
  };
}

export function createDynamoClient(config: AwsConfig): DynamoDBClient {
  return new DynamoDBClient(common(config, config.dynamoEndpoint));
}

export function createDocClient(client: DynamoDBClient): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

export function createSesClient(config: AwsConfig): SESv2Client {
  return new SESv2Client(common(config, config.sesEndpoint));
}
