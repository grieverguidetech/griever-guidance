import { loadLocalConfig, LOCAL_ENDPOINTS } from './config.js';
import { createDynamoClient } from './clients.js';

describe('loadLocalConfig', () => {
  it('points at the compose ports when no endpoint is set', () => {
    const config = loadLocalConfig({});
    expect(config.dynamoEndpoint).toBe(LOCAL_ENDPOINTS.dynamo);
    expect(config.sesEndpoint).toBe(LOCAL_ENDPOINTS.ses);
  });

  it('uses the shared endpoint for both services', () => {
    const config = loadLocalConfig({ AWS_ENDPOINT_URL: 'http://127.0.0.1:9' });
    expect(config.dynamoEndpoint).toBe('http://127.0.0.1:9');
    expect(config.sesEndpoint).toBe('http://127.0.0.1:9');
  });

  it('lets a per-service endpoint win', () => {
    const config = loadLocalConfig({
      AWS_ENDPOINT_URL: 'http://localhost:1',
      AWS_ENDPOINT_URL_DYNAMODB: 'http://localhost:2',
      AWS_ENDPOINT_URL_SESV2: 'http://[::1]:3',
    });
    expect(config.dynamoEndpoint).toBe('http://localhost:2');
    expect(config.sesEndpoint).toBe('http://[::1]:3');
  });

  it('treats empty and blank endpoint variables as unset', () => {
    const config = loadLocalConfig({
      AWS_ENDPOINT_URL: '',
      AWS_ENDPOINT_URL_DYNAMODB: '',
      AWS_ENDPOINT_URL_SESV2: '   ',
      AWS_REGION: '',
    });
    expect(config.dynamoEndpoint).toBe(LOCAL_ENDPOINTS.dynamo);
    expect(config.sesEndpoint).toBe(LOCAL_ENDPOINTS.ses);
    expect(config.region).toBe('us-east-1');
  });

  it('throws when an endpoint is not on this machine', () => {
    expect(() => loadLocalConfig({ AWS_ENDPOINT_URL_DYNAMODB: 'https://dynamodb.us-east-1.amazonaws.com' })).toThrow(
      /must point at localhost/,
    );
    expect(() => loadLocalConfig({ AWS_ENDPOINT_URL: 'http://10.0.0.5:8000' })).toThrow(/must point at localhost/);
    expect(() => loadLocalConfig({ AWS_ENDPOINT_URL_SESV2: 'http://localhost.evil.test' })).toThrow(
      /must point at localhost/,
    );
    expect(() => loadLocalConfig({ AWS_ENDPOINT_URL: 'not a url' })).toThrow(/not a valid URL/);
  });

  it('always uses the fake credentials, even when real-looking keys are in the environment', () => {
    const config = loadLocalConfig({
      AWS_ACCESS_KEY_ID: 'AKIAREALLOOKING',
      AWS_SECRET_ACCESS_KEY: 'secret',
      AWS_SESSION_TOKEN: 'token',
    });
    expect(config.credentials).toEqual({ accessKeyId: 'localfakekey', secretAccessKey: 'localfakesecret' });
  });

  it('names the plan v4 tables by default', () => {
    const config = loadLocalConfig({});
    expect(config.dataTable).toBe('gg-data');
    expect(config.contentTable).toBe('gg-content');
  });
});

describe('createDynamoClient', () => {
  it('does not force fake credentials on a config without credentials', async () => {
    const client = createDynamoClient({
      region: 'us-east-1',
      dataTable: 'a',
      contentTable: 'b',
    });
    // The SDK default chain is in use, so the credentials provider is not our fake pair.
    const resolved = client.config.credentials;
    expect(typeof resolved).toBe('function');
    process.env['AWS_ACCESS_KEY_ID'] = 'ASIAFROMCHAIN';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'chainsecret';
    process.env['AWS_SESSION_TOKEN'] = 'chaintoken';
    try {
      const fresh = createDynamoClient({ region: 'us-east-1', dataTable: 'a', contentTable: 'b' });
      const creds = await fresh.config.credentials();
      expect(creds.accessKeyId).toBe('ASIAFROMCHAIN');
      expect(creds.sessionToken).toBe('chaintoken');
    } finally {
      delete process.env['AWS_ACCESS_KEY_ID'];
      delete process.env['AWS_SECRET_ACCESS_KEY'];
      delete process.env['AWS_SESSION_TOKEN'];
    }
  });
});
