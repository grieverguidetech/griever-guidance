import { useRef, useState } from 'react';
import { useSSO } from '@clerk/expo';
import { screenCopy } from '@griever/copy';
import * as AuthSession from 'expo-auth-session';
import { APP_URL_SCHEME } from '../lib/urlScheme';
import { clerkMessage, FACEBOOK_NO_EMAIL } from '../lib/clerkMessages';
import { SecondaryButton, announce } from './authForm';

const copy = screenCopy('signIn');

type Strategy = 'oauth_google' | 'oauth_facebook';

/** Where the browser sends the person back to the app. This exact URL must be allowed in Clerk. */
export const SSO_REDIRECT_PATH = 'sso-callback';

/** The Google and Facebook buttons. Errors go up so the screen can show them in one place. */
export function SocialButtons({
  onError,
  onStart,
  onPendingChange,
  isBlocked,
}: {
  onError: (message: string | null) => void;
  onStart: () => void;
  /** Tells the screen a browser flow is running, so it can ignore its own buttons meanwhile. */
  onPendingChange?: (pending: boolean) => void;
  /** Asks the screen whether it has a request running; presses here are ignored then. Reads a ref. */
  isBlocked?: () => boolean;
}) {
  const { startSSOFlow } = useSSO();
  const [pending, setPending] = useState(false);
  // The ref is the guard (a fast double tap can beat state); `pending` only dims the buttons.
  const inFlight = useRef(false);

  async function start(strategy: Strategy) {
    if (inFlight.current || isBlocked?.()) {
      return;
    }
    inFlight.current = true;
    setPending(true);
    onPendingChange?.(true);
    onStart();
    announce(copy.browserAnnounce);
    try {
      const redirectUrl = AuthSession.makeRedirectUri({ scheme: APP_URL_SCHEME, path: SSO_REDIRECT_PATH });
      const result = await startSSOFlow({ strategy, redirectUrl });
      if (result.createdSessionId && result.setActive) {
        await result.setActive({ session: result.createdSessionId });
      } else if (result.authSessionResult === null) {
        // The browser never opened: Clerk is not loaded, which means no connection.
        onError(clerkMessage({ code: 'network_error' }));
      } else if (result.signUp?.missingFields?.includes('email_address')) {
        // Facebook can return no email. The sign-up stays unfinished, so no account is made.
        onError(FACEBOOK_NO_EMAIL);
      } else if (result.signUp?.missingFields?.length) {
        onError(clerkMessage(null));
      }
      // Anything else is the person closing the browser; nothing to say.
    } catch (error) {
      onError(clerkMessage(error));
    } finally {
      inFlight.current = false;
      setPending(false);
      onPendingChange?.(false);
    }
  }

  return (
    <>
      <SecondaryButton label={copy.google} pending={pending} onPress={() => void start('oauth_google')} />
      <SecondaryButton label={copy.facebook} pending={pending} onPress={() => void start('oauth_facebook')} />
    </>
  );
}
