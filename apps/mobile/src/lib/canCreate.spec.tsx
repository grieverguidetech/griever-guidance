import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';

let mockAccount: { profile: { accountType?: string } | null } | null = null;
jest.mock('./AccountProvider', () => ({ useAccount: () => mockAccount }));
import { useCanCreate } from './canCreate';

describe('useCanCreate', () => {
  beforeEach(() => {
    mockAccount = null;
  });

  it('is true with no account (accounts off or unavailable)', () => {
    expect(renderHook(() => useCanCreate()).result.current).toBe(true);
  });

  it('is true while the profile has not loaded', () => {
    mockAccount = { profile: null };
    expect(renderHook(() => useCanCreate()).result.current).toBe(true);
  });

  it('is true for an owner', () => {
    mockAccount = { profile: { accountType: 'owner' } };
    expect(renderHook(() => useCanCreate()).result.current).toBe(true);
  });

  it('is true when the profile has no accountType (fails open, the server enforces C11)', () => {
    mockAccount = { profile: {} };
    expect(renderHook(() => useCanCreate()).result.current).toBe(true);
  });

  it('is false for a member', () => {
    mockAccount = { profile: { accountType: 'member' } };
    expect(renderHook(() => useCanCreate()).result.current).toBe(false);
  });
});
