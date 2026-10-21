import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import type { AwsConfig } from './config.js';

export function createDynamoClient(config: AwsConfig): DynamoDBClient {
  return new DynamoDBClient({
    region: config.region,
    endpoint: config.dynamoEndpoint,
    credentials: config.credentials,
  });
}

export function createDocClient(client: DynamoDBClient): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

export function createSesClient(config: AwsConfig): SESv2Client {
  return new SESv2Client({
    region: config.region,
    endpoint: config.sesEndpoint,
    credentials: config.credentials,
  });
}
