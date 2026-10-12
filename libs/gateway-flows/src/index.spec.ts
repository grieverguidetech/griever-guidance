import { describe, expect, it } from 'vitest';
import { GATEWAY_FLOWS_LIB } from '@griever/gateway-flows';

describe('@griever/gateway-flows', () => {
  it('resolves from source', () => {
    expect(GATEWAY_FLOWS_LIB).toBe('@griever/gateway-flows');
  });
});
