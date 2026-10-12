import { describe, expect, it } from 'vitest';
import { GATEWAY_AUTH_LIB } from '@griever/gateway-auth';

describe('@griever/gateway-auth', () => {
  it('resolves from source', () => {
    expect(GATEWAY_AUTH_LIB).toBe('@griever/gateway-auth');
  });
});
