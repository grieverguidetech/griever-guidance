import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SignInScreen } from './SignInScreen';
import { SignUpScreen } from './SignUpScreen';

type Result = Promise<{ error: unknown }>;
const ok = async () => ({ error: null });
const fail = (code: string) => async () => ({ error: { code } });

const mockSignIn = {
  status: 'needs_first_factor',
  password: jest.fn<() => Result>(),
  create: jest.fn<() => Result>(),
  emailCode: { sendCode: jest.fn<() => Result>(), verifyCode: jest.fn<() => Result>() },
  mfa: { sendEmailCode: jest.fn<() => Result>(), verifyEmailCode: jest.fn<() => Result>() },
  finalize: jest.fn<() => Result>(),
  reset: jest.fn(async () => ({ error: null })),
};
const mockSignUp = {
  status: 'missing_requirements',
  password: jest.fn<() => Result>(),
  verifications: { sendEmailCode: jest.fn<() => Result>(), verifyEmailCode: jest.fn<() => Result>() },
  finalize: jest.fn<() => Result>(),
};
const mockStartSSO = jest.fn<(p: { strategy: string; redirectUrl: string }) => Promise<unknown>>();

jest.mock('@clerk/expo', () => ({
  useSignIn: () => ({ signIn: mockSignIn }),
  useSignUp: () => ({ signUp: mockSignUp }),
  useSSO: () => ({ startSSOFlow: mockStartSSO }),
}));
jest.mock('expo-auth-session', () => ({ makeRedirectUri: (o: { scheme: string; path: string }) => `${o.scheme}://${o.path}` }));

const OFFLINE = "You need a connection to do this. Nothing you've typed is lost.";
const type = (label: string, text: string) => fireEvent.changeText(screen.getByLabelText(label), text);
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
const value = (label: string) => screen.getByLabelText(label).props.value;

beforeEach(() => {
  jest.clearAllMocks();
  mockSignIn.status = 'needs_first_factor';
  mockSignUp.status = 'missing_requirements';
  for (const fn of [mockSignIn.password, mockSignIn.create, mockSignIn.emailCode.sendCode, mockSignIn.emailCode.verifyCode, mockSignIn.mfa.sendEmailCode, mockSignIn.mfa.verifyEmailCode, mockSignIn.finalize, mockSignUp.password, mockSignUp.verifications.sendEmailCode, mockSignUp.verifications.verifyEmailCode, mockSignUp.finalize]) {
    fn.mockImplementation(ok);
  }
});

describe('sign in', () => {
  const renderSignIn = (onAttempt = jest.fn()) => {
    render(<SignInScreen onSwitchToSignUp={() => undefined} onAttempt={onAttempt} />);
    type('Email', ' a@b.co ');
    type('Password', 'secret-pass');
    return onAttempt;
  };

  it('signs in with email and password, then finalizes', async () => {
    mockSignIn.password.mockImplementation(async () => {
      mockSignIn.status = 'complete';
      return { error: null };
    });
    const onAttempt = renderSignIn();
    press('Sign in');
    await waitFor(() => expect(mockSignIn.finalize).toHaveBeenCalledTimes(1));
    expect(mockSignIn.password).toHaveBeenCalledWith({ emailAddress: 'a@b.co', password: 'secret-pass' });
    expect(onAttempt).toHaveBeenCalledWith('a@b.co');
  });

  it('keeps the typed fields and shows calm copy on a wrong password', async () => {
    mockSignIn.password.mockImplementation(fail('form_password_incorrect'));
    renderSignIn();
    press('Sign in');
    await screen.findByText("That email and password don't match. Please try again.");
    expect(value('Email')).toBe(' a@b.co ');
    expect(value('Password')).toBe('secret-pass');
    expect(mockSignIn.finalize).not.toHaveBeenCalled();
  });

  it('shows the connection copy for a network error and keeps the fields', async () => {
    mockSignIn.password.mockImplementation(fail('network_error'));
    renderSignIn();
    press('Sign in');
    await screen.findByText(OFFLINE);
    expect(value('Password')).toBe('secret-pass');
  });

  it('shows the connection copy when Clerk throws a network error', async () => {
    mockSignIn.password.mockRejectedValue({ code: 'network_error' });
    renderSignIn();
    press('Sign in');
    await screen.findByText(OFFLINE);
  });

  it('asks for an emailed code on a new device, then finalizes', async () => {
    mockSignIn.password.mockImplementation(async () => {
      mockSignIn.status = 'needs_client_trust';
      return { error: null };
    });
    mockSignIn.mfa.verifyEmailCode.mockImplementation(async () => {
      mockSignIn.status = 'complete';
      return { error: null };
    });
    renderSignIn();
    press('Sign in');
    await screen.findByRole('header', { name: 'Check your email' });
    expect(mockSignIn.mfa.sendEmailCode).toHaveBeenCalledTimes(1);
    type('6-digit code', ' 123456 ');
    press('Sign in');
    await waitFor(() => expect(mockSignIn.finalize).toHaveBeenCalledTimes(1));
    expect(mockSignIn.mfa.verifyEmailCode).toHaveBeenCalledWith({ code: '123456' });
  });

  it('signs in with an emailed code instead of a password', async () => {
    mockSignIn.emailCode.verifyCode.mockImplementation(async () => {
      mockSignIn.status = 'complete';
      return { error: null };
    });
    renderSignIn();
    press('Email me a code instead');
    await screen.findByRole('header', { name: 'Check your email' });
    expect(mockSignIn.create).toHaveBeenCalledWith({ identifier: 'a@b.co' });
    expect(mockSignIn.emailCode.sendCode).toHaveBeenCalledWith({ emailAddress: 'a@b.co' });
    expect(mockSignIn.password).not.toHaveBeenCalled();
    type('6-digit code', '123456');
    press('Sign in');
    await waitFor(() => expect(mockSignIn.finalize).toHaveBeenCalledTimes(1));
    expect(mockSignIn.emailCode.verifyCode).toHaveBeenCalledWith({ code: '123456' });
  });

  it('stays on the code step and keeps the code after a wrong one', async () => {
    mockSignIn.emailCode.verifyCode.mockImplementation(fail('form_code_incorrect'));
    renderSignIn();
    press('Email me a code instead');
    await screen.findByLabelText('6-digit code');
    type('6-digit code', '000000');
    press('Sign in');
    await screen.findByText("That code doesn't match. Please check it and try again.");
    expect(value('6-digit code')).toBe('000000');
    expect(mockSignIn.finalize).not.toHaveBeenCalled();
  });

  it('does not ask for a code without an email', async () => {
    render(<SignInScreen onSwitchToSignUp={() => undefined} onAttempt={() => undefined} />);
    press('Email me a code instead');
    await screen.findByText("That doesn't look like an email address. Please check it and try again.");
    expect(mockSignIn.create).not.toHaveBeenCalled();
  });

  describe('Google and Facebook', () => {
    it('starts Google with the app redirect and activates the new session', async () => {
      const setActive = jest.fn(async () => undefined);
      mockStartSSO.mockResolvedValue({ createdSessionId: 'sess_1', setActive });
      renderSignIn();
      press('Continue with Google');
      await waitFor(() => expect(setActive).toHaveBeenCalledWith({ session: 'sess_1' }));
      expect(mockStartSSO).toHaveBeenCalledWith({ strategy: 'oauth_google', redirectUrl: 'mobile://sso-callback' });
    });

    it('says to use email or Google when Facebook gives no email, and makes no session', async () => {
      const setActive = jest.fn(async () => undefined);
      mockStartSSO.mockResolvedValue({ createdSessionId: null, setActive, signUp: { missingFields: ['email_address'] } });
      renderSignIn();
      press('Continue with Facebook');
      await screen.findByText('Please use your email or Google to sign in.');
      expect(mockStartSSO).toHaveBeenCalledWith({ strategy: 'oauth_facebook', redirectUrl: 'mobile://sso-callback' });
      expect(setActive).not.toHaveBeenCalled();
    });

    it('says nothing when the person closes the browser', async () => {
      mockStartSSO.mockResolvedValue({ createdSessionId: null, authSessionResult: { type: 'cancel' } });
      renderSignIn();
      press('Continue with Facebook');
      await waitFor(() => expect(mockStartSSO).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByRole('button', { name: 'Continue with Facebook' }).props.accessibilityState.disabled).toBe(false));
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('shows the connection copy when the browser flow fails offline', async () => {
      mockStartSSO.mockRejectedValue({ code: 'network_error' });
      renderSignIn();
      press('Continue with Google');
      await screen.findByText(OFFLINE);
    });
  });

  it('has no exclamation marks and touch targets of at least 44', () => {
    renderSignIn();
    expect(screen.queryAllByText(/!/)).toHaveLength(0);
    for (const name of ['Sign in', 'Email me a code instead', 'Continue with Google', 'Continue with Facebook', 'Create an account']) {
      expect(StyleSheet.flatten(screen.getByRole('button', { name }).props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
  });
});

describe('sign up', () => {
  const onCreated = jest.fn();
  function renderSignUp() {
    render(<SignUpScreen onSwitchToSignIn={() => undefined} onCreated={onCreated} />);
  }
  function fill(name = 'Sam', password = 'a-long-password') {
    type('Your name', name);
    type('Email', ' sam@x.co ');
    type('Password', password);
  }

  it('creates the account with a 6-digit code, hands up the name, then finalizes', async () => {
    mockSignUp.verifications.verifyEmailCode.mockImplementation(async () => {
      mockSignUp.status = 'complete';
      return { error: null };
    });
    renderSignUp();
    fill(' Sam ');
    press('Create account');
    await screen.findByRole('header', { name: 'Check your email' });
    expect(mockSignUp.password).toHaveBeenCalledWith({ emailAddress: 'sam@x.co', password: 'a-long-password' });
    expect(mockSignUp.verifications.sendEmailCode).toHaveBeenCalledTimes(1);
    expect(mockSignUp.finalize).not.toHaveBeenCalled();
    type('6-digit code', '123456');
    press('Create account');
    await waitFor(() => expect(mockSignUp.finalize).toHaveBeenCalledTimes(1));
    expect(mockSignUp.verifications.verifyEmailCode).toHaveBeenCalledWith({ code: '123456' });
    expect(onCreated).toHaveBeenCalledWith('Sam', 'sam@x.co');
  });

  it('does not hand up the name or finalize when the code is wrong', async () => {
    mockSignUp.verifications.verifyEmailCode.mockImplementation(fail('form_code_incorrect'));
    renderSignUp();
    fill();
    press('Create account');
    await screen.findByLabelText('6-digit code');
    type('6-digit code', '000000');
    press('Create account');
    await screen.findByText("That code doesn't match. Please check it and try again.");
    expect(onCreated).not.toHaveBeenCalled();
    expect(mockSignUp.finalize).not.toHaveBeenCalled();
  });

  it('shows the duplicate-email copy and keeps the fields', async () => {
    mockSignUp.password.mockImplementation(fail('form_identifier_exists'));
    renderSignUp();
    fill();
    press('Create account');
    await screen.findByText('This email already has an account. Sign in instead.');
    expect(value('Your name')).toBe('Sam');
    expect(value('Password')).toBe('a-long-password');
    expect(mockSignUp.verifications.sendEmailCode).not.toHaveBeenCalled();
  });

  it('keeps the fields when offline', async () => {
    mockSignUp.password.mockImplementation(fail('network_error'));
    renderSignUp();
    fill();
    press('Create account');
    await screen.findByText(OFFLINE);
    expect(value('Email')).toBe(' sam@x.co ');
  });

  it('shows the password hint and attaches it to the input', () => {
    renderSignUp();
    expect(screen.getByText('Use at least 8 characters.', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByLabelText('Password').props.accessibilityHint).toBe('Use at least 8 characters.');
  });

  it('does not call the network for a short password or a blank name', async () => {
    renderSignUp();
    fill('Sam', 'short');
    press('Create account');
    await screen.findByText('Please choose a password with at least 8 characters.');
    type('Your name', '   ');
    type('Password', 'a-long-password');
    press('Create account');
    await screen.findByText('Please enter your name.');
    expect(mockSignUp.password).not.toHaveBeenCalled();
  });

  it('disables submit while the request is pending', async () => {
    let finish: () => void = () => undefined;
    mockSignUp.password.mockImplementation(() => new Promise((resolve) => (finish = () => resolve({ error: { code: 'x' } }))));
    renderSignUp();
    fill();
    press('Create account');
    const busy = await screen.findByRole('button', { name: 'Creating account' });
    expect(busy.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    fireEvent.press(busy);
    expect(mockSignUp.password).toHaveBeenCalledTimes(1);
    finish();
    await screen.findByRole('button', { name: 'Create account' });
  });
});
