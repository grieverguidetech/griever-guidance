import { describe, expect, it, jest } from '@jest/globals';
import { onFlowPullRequest, requestFlowPull } from './requestFlowPull';

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
