import { Hono } from 'hono';

/**
 * Placeholder for the account-creation/sign-in service (Google, Facebook, X,
 * email — see the paused account-auth task). No routes exist yet; keeping
 * this boundary in place means apps/gateway/src/worker.ts doesn't change
 * shape when that work resumes — only this lib grows.
 */
export const authRouter = new Hono();
