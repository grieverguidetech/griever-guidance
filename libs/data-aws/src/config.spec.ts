import { loadAwsConfig, loadLocalConfig, LOCAL_ENDPOINTS } from './config.js';

describe('loadAwsConfig', () => {
  it('uses the shared endpoint for both services', () => {
    const config = loadAwsConfig({ AWS_ENDPOINT_URL: 'http://example.test:9' });
    expect(config.dynamoEndpoint).toBe('http://example.test:9');
    expect(config.sesEndpoint).toBe('http://example.test:9');
  });

  it('lets a per-service endpoint win', () => {
    const config = loadAwsConfig({
      AWS_ENDPOINT_URL: 'http://a.test',
      AWS_ENDPOINT_URL_DYNAMODB: 'http://b.test',
      AWS_ENDPOINT_URL_SESV2: 'http://c.test',
    });
    expect(config.dynamoEndpoint).toBe('http://b.test');
    expect(config.sesEndpoint).toBe('http://c.test');
  });

  it('has no endpoint by default, so the SDK uses real AWS', () => {
    const config = loadAwsConfig({});
    expect(config.dynamoEndpoint).toBeUndefined();
    expect(config.sesEndpoint).toBeUndefined();
  });

  it('names the plan v4 tables by default', () => {
    const config = loadAwsConfig({});
    expect(config.dataTable).toBe('gg-data');
    expect(config.contentTable).toBe('gg-content');
  });

  it('falls back to fake credentials', () => {
    expect(loadAwsConfig({}).credentials.accessKeyId).toBe('localfakekey');
  });
});

describe('loadLocalConfig', () => {
  it('points at the compose ports when no endpoint is set', () => {
    const config = loadLocalConfig({});
    expect(config.dynamoEndpoint).toBe(LOCAL_ENDPOINTS.dynamo);
    expect(config.sesEndpoint).toBe(LOCAL_ENDPOINTS.ses);
  });

  it('keeps an endpoint from the environment', () => {
    expect(loadLocalConfig({ AWS_ENDPOINT_URL_DYNAMODB: 'http://x.test' }).dynamoEndpoint).toBe(
      'http://x.test',
    );
  });
});
