import { SignIn } from '@clerk/react';

/**
 * Clerk's sign-in, with sign-up on the same screen. Rendered inside the app Shell and inside
 * ClerkProvider (lib/clerk.tsx). Hash routing keeps Clerk's steps out of the app's own paths.
 */
export function SignInScreen() {
  return (
    <div className="flex flex-col gap-4 pt-[52px] min-h-full">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-[1.1]">Grievers Guidance</h1>
        <p className="text-[14px] leading-[1.6] m-0" style={{ color: 'var(--text-muted)' }}>
          We'll help you tell people what they need to know. First, somewhere safe to keep it.
        </p>
      </div>
      <SignIn
        withSignUp
        routing="hash"
        appearance={{ elements: { rootBox: 'w-full', cardBox: 'w-full max-w-full shadow-none' } }}
      />
    </div>
  );
}
