import { SignIn } from '@clerk/react';
import { useLocation } from 'react-router';
import { isSignInPath } from '../routes/RequireAccount';

/**
 * Clerk's sign-in, with sign-up on the same screen. Rendered inside the app Shell and inside
 * ClerkProvider (lib/clerk.tsx). On /sign-in it uses path routing: Clerk's steps live under /sign-in
 * and replace the entry (see clerk.tsx), so none of them is left for Back. On /join, which stays
 * public and keeps its fragment, it keeps the hash routing it had before #851.
 */
export function SignInScreen() {
  const { pathname } = useLocation();
  return (
    <div className="flex flex-col gap-4 pt-[52px] min-h-full">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-[1.1]">Grievers Guidance</h1>
        <p className="text-[14px] leading-[1.6] m-0" style={{ color: 'var(--text-muted)' }}>
          We'll help you tell people what they need to know. First, somewhere safe to keep it.
        </p>
      </div>
      {isSignInPath(pathname) ? <SignIn withSignUp routing="path" path="/sign-in" /> : <SignIn withSignUp routing="hash" />}
    </div>
  );
}
