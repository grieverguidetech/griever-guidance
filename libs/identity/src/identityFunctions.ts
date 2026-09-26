import { makeFunctionReference } from 'convex/server';

/**
 * Typed references to `apps/gateway/convex/identity.ts`'s functions, by
 * string path rather than importing generated code that lives outside this
 * lib's `src/` — see `libs/gateway-sync/src/convexFunctions.ts` for why
 * (the same reasoning applies here unchanged).
 */

export type IdentityAuthProvider = 'google' | 'facebook' | 'instagram' | 'x' | 'password';

export type FindOrCreateIdentityArgs = {
  serviceSecret: string;
  authProvider: IdentityAuthProvider;
  providerSub: string;
  email: string | null;
  emailVerified: boolean;
};
export type FindOrCreateIdentityResult = { userId: string; isNewIdentity: boolean };

export type GetIdentityAndProfileArgs = { serviceSecret: string; userId: string };
export type GetIdentityAndProfileResult = {
  userId: string;
  authProvider: IdentityAuthProvider;
  email: string | null;
  emailVerified: boolean;
  senderName: string | null;
  contactSource: 'import' | 'manual';
  checklistTicks: string[];
} | null;

export const findOrCreateIdentity = makeFunctionReference<
  'mutation',
  FindOrCreateIdentityArgs,
  FindOrCreateIdentityResult
>('identity:findOrCreateIdentity');

export const getIdentityAndProfile = makeFunctionReference<
  'query',
  GetIdentityAndProfileArgs,
  GetIdentityAndProfileResult
>('identity:getIdentityAndProfile');

export type SignUpWithPasswordArgs = {
  serviceSecret: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  senderName: string;
};
export type SignUpWithPasswordResult = { userId: string; isNewIdentity: boolean };

export type GetPasswordCredentialArgs = { serviceSecret: string; email: string };
export type GetPasswordCredentialResult = { userId: string; passwordHash: string; passwordSalt: string } | null;

export const signUpWithPassword = makeFunctionReference<
  'mutation',
  SignUpWithPasswordArgs,
  SignUpWithPasswordResult
>('identity:signUpWithPassword');

export const getPasswordCredential = makeFunctionReference<
  'query',
  GetPasswordCredentialArgs,
  GetPasswordCredentialResult
>('identity:getPasswordCredential');
