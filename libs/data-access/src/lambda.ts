import { createDocClient, createDynamoClient, loadLambdaConfig } from '@griever/data-aws';
import { handle } from 'hono/aws-lambda';
import { createDataApp, type DataAppOptions } from './handler/app.js';
import type { DataRules } from './handler/actions.js';
import { createTokenVerifier } from './handler/verifyToken.js';
import { createFlow, listFlows, updateFlow } from './rules/flows.js';
import { createInvite, revokeInvite } from './rules/invites.js';
import { listMembers, removeMember } from './rules/members.js';
import { getProfile, putProfile } from './rules/profiles.js';

type Env = Record<string, string | undefined>;

/**
 * The real rules, wired in one place. The Lambda and `pnpm dev:data` both use this list.
 * acceptInvite waits for #272: until then it throws, which the app answers as a 500 with no detail.
 */
export const wiredRules: DataRules = {
  getProfile,
  putProfile,
  listFlows,
  createFlow,
  updateFlow,
  createInvite,
  revokeInvite,
  listMembers,
  removeMember,
  acceptInvite: () => {
    throw new Error('acceptInvite is not wired yet');
  },
};

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set.`);
  }
  return value;
}

/** The verifier settings, read from DATA_AUTH_ISSUER and DATA_AUTH_JWKS_URL. */
export function loadVerifier(env: Env): DataAppOptions['verify'] {
  return createTokenVerifier({
    issuer: required(env, 'DATA_AUTH_ISSUER'),
    jwksUrl: required(env, 'DATA_AUTH_JWKS_URL'),
  });
}

/** Builds the Lambda handler (function URL, payload 2.0) from the environment. */
export function createHandler(env: Env = process.env) {
  const config = loadLambdaConfig(env);
  const app = createDataApp({
    rules: wiredRules,
    doc: createDocClient(createDynamoClient(config)),
    table: config.dataTable,
    verify: loadVerifier(env),
  });
  return handle(app);
}

let cached: ReturnType<typeof createHandler> | undefined;

/** The Lambda entry point. The app is built on the first call, so importing this file reads no environment. */
export const handler: ReturnType<typeof createHandler> = (event, context) => {
  cached ??= createHandler(process.env);
  return cached(event, context);
};
