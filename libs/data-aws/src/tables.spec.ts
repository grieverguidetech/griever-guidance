import { loadAwsConfig } from './config.js';
import { tableDefinitions } from './tables.js';

describe('tableDefinitions', () => {
  const [data, content] = tableDefinitions(loadAwsConfig({}));

  it('keys gg-content by kind and id (plan v4)', () => {
    expect(content?.TableName).toBe('gg-content');
    expect(content?.KeySchema).toEqual([
      { AttributeName: 'kind', KeyType: 'HASH' },
      { AttributeName: 'id', KeyType: 'RANGE' },
    ]);
  });

  it('keys the data table by pk and sk, with one index gsi1', () => {
    expect(data?.TableName).toBe('gg-data');
    expect(data?.KeySchema?.map((k) => k.AttributeName)).toEqual(['pk', 'sk']);
    expect(data?.GlobalSecondaryIndexes?.map((g) => g.IndexName)).toEqual(['gsi1']);
  });

  it('declares every key attribute and nothing else', () => {
    for (const def of [data, content]) {
      const declared = def?.AttributeDefinitions?.map((a) => a.AttributeName).sort();
      const used = [
        ...(def?.KeySchema ?? []),
        ...(def?.GlobalSecondaryIndexes ?? []).flatMap((g) => g.KeySchema ?? []),
      ]
        .map((k) => k.AttributeName)
        .sort();
      expect(declared).toEqual(used);
    }
  });
});
