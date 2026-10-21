/**
 * Where the AWS clients connect. Read from the environment so that local runs
 * point at DynamoDB Local and the SES stand-in, and real runs point at AWS.
 * Variable names are listed in .env.example (no values here).
 */
export interface AwsConfig {
  region: string;
  /** DynamoDB endpoint. Undefined means the real AWS endpoint. */
  dynamoEndpoint?: string;
  /** SES endpoint. Undefined means the real AWS endpoint. */
  sesEndpoint?: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
  dataTable: string;
  contentTable: string;
}

type Env = Record<string, string | undefined>;

/** Obviously fake. DynamoDB Local wants letters and digits only. Never real keys. */
const LOCAL_CREDENTIALS = { accessKeyId: 'localfakekey', secretAccessKey: 'localfakesecret' };

export function loadAwsConfig(env: Env = process.env): AwsConfig {
  const shared = env['AWS_ENDPOINT_URL'];
  const accessKeyId = env['AWS_ACCESS_KEY_ID'];
  const secretAccessKey = env['AWS_SECRET_ACCESS_KEY'];
  return {
    region: env['AWS_REGION'] ?? 'us-east-1',
    dynamoEndpoint: env['AWS_ENDPOINT_URL_DYNAMODB'] ?? shared,
    sesEndpoint: env['AWS_ENDPOINT_URL_SESV2'] ?? shared,
    credentials:
      accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : LOCAL_CREDENTIALS,
    dataTable: env['GG_DATA_TABLE'] ?? 'gg-data',
    contentTable: env['GG_CONTENT_TABLE'] ?? 'gg-content',
  };
}

/** The ports in docker-compose.yml. Scripts and tests use these when no endpoint is set. */
export const LOCAL_ENDPOINTS = {
  dynamo: 'http://localhost:8100',
  ses: 'http://localhost:8105',
} as const;

/** Config for the local stack: the env wins, then the compose ports. */
export function loadLocalConfig(env: Env = process.env): AwsConfig {
  const config = loadAwsConfig(env);
  return {
    ...config,
    dynamoEndpoint: config.dynamoEndpoint ?? LOCAL_ENDPOINTS.dynamo,
    sesEndpoint: config.sesEndpoint ?? LOCAL_ENDPOINTS.ses,
  };
}
