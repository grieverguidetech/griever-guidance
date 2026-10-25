import { DATA_ACTIONS, DATA_ERROR_CODES, DATA_USER_TOKEN_HEADER, isDataErrorCode } from './dataApi.js';

describe('dataApi', () => {
  it('names the user token header in lower case', () => {
    expect(DATA_USER_TOKEN_HEADER).toBe('x-gg-user-token');
  });

  it('lists exactly the actions the data function exposes', () => {
    expect([...DATA_ACTIONS]).toEqual([
      'getProfile',
      'putProfile',
      'listFlows',
      'createFlow',
      'updateFlow',
      'createInvite',
      'revokeInvite',
      'listMembers',
      'removeMember',
      'acceptInvite',
    ]);
  });

  it('never exposes deleteUserData', () => {
    expect(DATA_ACTIONS as readonly string[]).not.toContain('deleteUserData');
  });

  it('has no duplicate actions or codes', () => {
    expect(new Set(DATA_ACTIONS).size).toBe(DATA_ACTIONS.length);
    expect(new Set(DATA_ERROR_CODES).size).toBe(DATA_ERROR_CODES.length);
  });

  it('recognises error codes', () => {
    expect(isDataErrorCode('busy')).toBe(true);
    expect(isDataErrorCode('unauthorized')).toBe(true);
    expect(isDataErrorCode('unusable')).toBe(true);
    expect(isDataErrorCode('nope')).toBe(false);
    expect(isDataErrorCode(42)).toBe(false);
  });
});
