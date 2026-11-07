import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, within } from '@testing-library/react-native';
import type { Session } from '@griever/hooks';
import { screenCopy } from '@griever/copy';
import { HubScreen } from './HubScreen';
import { withAccountName } from '../lib/accountName';

let mockProfile: { id: string; senderName: string; firstName?: string | null; contactSource: null; accountType: 'owner' } | null = null;
jest.mock('../lib/AccountProvider', () => ({
  ...jest.requireActual<object>('../lib/AccountProvider'),
  useAccount: () => (mockProfile ? { status: 'signed_in', isSignedIn: true, profile: mockProfile } : null),
}));

const anna = {
  id: 'a', flowId: 'flow-a', ownerId: null, role: 'owner', personName: 'Anna', dateOfPassing: 'May 2, 2026', senderName: '', obituaryUrl: '',
  createdAt: '2026-10-01T00:00:00.000Z', lastOpenedAt: '2026-10-01T00:00:00.000Z',
  drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
} as unknown as Session;

const copy = screenCopy('pathLanding');

const renderHub = () =>
  render(<HubScreen session={anna} others={[]} onSwitch={jest.fn()} onStart={jest.fn()} onEditPerson={jest.fn()} paymentsEnabled={false} />);
const thanksCard = () => screen.getByRole('button', { name: /Send thank-yous/ });

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = null;
});

describe('the thank-you card status with an account name (#695)', () => {
  it('says Needs your name with no account', () => {
    renderHub();
    expect(within(thanksCard()).getByText(/Needs your name/)).toBeTruthy();
  });

  it('does not say Needs your name when the account has a name', () => {
    mockProfile = { id: 'u1', senderName: '', firstName: 'Sam', contactSource: null, accountType: 'owner' };
    renderHub();
    expect(within(thanksCard()).queryByText(/Needs your name/)).toBeNull();
    expect(within(thanksCard()).getByText(copy.statusReady)).toBeTruthy();
  });
});

describe('withAccountName', () => {
  it('fills a missing sender name on a copy and leaves the person alone', () => {
    const view = withAccountName(anna, 'Sam');
    expect(view.senderName).toBe('Sam');
    expect(anna.senderName).toBe('');
  });

  it('keeps a name the person already has', () => {
    const named = { ...anna, senderName: 'The Lee family' } as Session;
    expect(withAccountName(named, 'Sam')).toBe(named);
  });

  it('returns the person as is with no account name', () => {
    expect(withAccountName(anna, '')).toBe(anna);
  });
});
