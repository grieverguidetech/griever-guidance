import { describe, expect, it, jest } from '@jest/globals';
import { canPullNow, onFlowPullRequest, pullNow, registerManualPull, requestFlowPull } from './requestFlowPull';

describe('requestFlowPull', () => {
  it('tells a listener about each request', () => {
    const listener = jest.fn();
    const stop = onFlowPullRequest(listener);
    requestFlowPull();
    requestFlowPull();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
  });

  it('does not tell a listener that has unsubscribed', () => {
    const listener = jest.fn();
    onFlowPullRequest(listener)();
    requestFlowPull();
    expect(listener).not.toHaveBeenCalled();
  });

  it('does nothing with no listeners', () => {
    expect(() => requestFlowPull()).not.toThrow();
  });
});

describe('pullNow', () => {
  it('is false and offers nothing with no pull registered', async () => {
    expect(canPullNow()).toBe(false);
    await expect(pullNow()).resolves.toBe(false);
  });

  it('returns what the registered pull says, and false if it throws', async () => {
    const pull = jest.fn(async () => true);
    const stop = registerManualPull(pull);
    await expect(pullNow()).resolves.toBe(true);
    pull.mockRejectedValueOnce(new Error('x'));
    await expect(pullNow()).resolves.toBe(false);
    stop();
    expect(canPullNow()).toBe(false);
  });
});
