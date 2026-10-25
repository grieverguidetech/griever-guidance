/**
 * Where the AWS clients connect. This file builds the LOCAL config only: DynamoDB Local and the
 * SES stand-in. Variable names are listed in .env.example (no values here).
 *
 * A future config for real AWS must be a separate function. It must leave `credentials`
 * undefined, so the SDK default chain applies (env keys, AWS_SESSION_TOKEN, SSO, a Lambda role).
 * Nothing in this lib forces fake credentials onto a config that has `credentials` undefined.
 */
export interface AwsConfig {
  region: string;
  /** DynamoDB endpoint. Undefined means the real AWS endpoint. */
  dynamoEndpoint?: string;
  /** SES endpoint. Undefined means the real AWS endpoint. */
  sesEndpoint?: string;
  /** Undefined means the SDK default credential chain. */
  credentials?: { accessKeyId: string; secretAccessKey: string };
  dataTable: string;
  contentTable: string;
}

type Env = Record<string, string | undefined>;

/** Obviously fake. DynamoDB Local wants letters and digits only. Local config only. */
const LOCAL_CREDENTIALS = { accessKeyId: 'localfakekey', secretAccessKey: 'localfakesecret' };

/** The ports in docker-compose.yml. Used when no endpoint is set. */
export const LOCAL_ENDPOINTS = {
  dynamo: 'http://localhost:8100',
  ses: 'http://localhost:8105',
} as const;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/** An empty or blank variable counts as unset. An empty endpoint must never reach the SDK. */
function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/** Throws unless the endpoint points at this machine, so a local run can never reach real AWS. */
export function assertLoopbackEndpoint(name: string, endpoint: string): string {
  let hostname: string;
  try {
    hostname = new URL(endpoint).hostname.replace(/^\[|\]$/g, '');
  } catch {
    throw new Error(`${name} is not a valid URL.`);
  }
  if (!LOOPBACK_HOSTS.has(hostname)) {
    throw new Error(`${name} must point at localhost, 127.0.0.1 or ::1 (got host "${hostname}").`);
  }
  return endpoint;
}

/**
 * Config for the local stack. Fake credentials always, loopback endpoints only. The CI job also
 * reaches its service containers as localhost (ports are mapped on the runner).
 */
export function loadLocalConfig(env: Env = process.env): AwsConfig {
  const shared = read(env, 'AWS_ENDPOINT_URL');
  const dynamo = read(env, 'AWS_ENDPOINT_URL_DYNAMODB') ?? shared ?? LOCAL_ENDPOINTS.dynamo;
  const ses = read(env, 'AWS_ENDPOINT_URL_SESV2') ?? shared ?? LOCAL_ENDPOINTS.ses;
  return {
    region: read(env, 'AWS_REGION') ?? 'us-east-1',
    dynamoEndpoint: assertLoopbackEndpoint('AWS_ENDPOINT_URL_DYNAMODB', dynamo),
    sesEndpoint: assertLoopbackEndpoint('AWS_ENDPOINT_URL_SESV2', ses),
    credentials: LOCAL_CREDENTIALS,
    dataTable: read(env, 'GG_DATA_TABLE') ?? 'gg-data',
    contentTable: read(env, 'GG_CONTENT_TABLE') ?? 'gg-content',
  };
}

/**
 * Config for the deployed Lambda. It leaves `credentials` and every endpoint undefined, so the SDK
 * default chain applies (the function's role). The SDK itself still honors AWS_ENDPOINT_URL* in
 * process.env, so those must not be set on the function. The table name and region have no default:
 * a deploy that forgot one must fail at start, not write to a table called "gg-data".
 */
export function loadLambdaConfig(env: Env = process.env): AwsConfig {
  const dataTable = read(env, 'GG_DATA_TABLE');
  if (!dataTable) {
    throw new Error('GG_DATA_TABLE is not set.');
  }
  const region = read(env, 'AWS_REGION');
  if (!region) {
    throw new Error('AWS_REGION is not set.');
  }
  return {
    region,
    dataTable,
    contentTable: read(env, 'GG_CONTENT_TABLE') ?? 'gg-content',
  };
}
