#!/usr/bin/env node
// Guards `pnpm convex:deploy` — DATA.md's auth seam (§6/§9) requires that a
// build "fails if GG_DEV_AUTH is set outside development." Convex functions
// can't reliably tell a real production deployment apart from a local
// `npx convex dev` from the inside (see convex/auth.ts's comment for why),
// so this check lives here instead, one layer out, where the deploy target
// URL is actually known.
import { execSync } from "node:child_process";

const url = process.env.CONVEX_SELF_HOSTED_URL ?? process.env.VITE_CONVEX_URL ?? "";
const isLocal = /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url.trim());

let devAuthValue = "";
let checkFailed = false;
try {
  devAuthValue = execSync("npx convex env get GG_DEV_AUTH", {
    cwd: "apps/web",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 15_000,
  })
    .toString()
    .trim();
} catch {
  checkFailed = true; // could mean "unset" (Convex CLIs commonly exit non-zero for
  devAuthValue = ""; // a missing var) or could mean "couldn't reach the deployment" —
} // indistinguishable here, so a non-local target must fail closed, not open.

if (!isLocal && checkFailed) {
  console.error(
    `Refusing to deploy: could not confirm GG_DEV_AUTH is unset on the non-local target ` +
      `(${url || "no CONVEX_SELF_HOSTED_URL/VITE_CONVEX_URL set"}). A check that silently passes ` +
      `when it can't verify is worse than no check — fix connectivity/credentials and retry.`,
  );
  process.exit(1);
}

if (devAuthValue && !isLocal) {
  console.error(
    `Refusing to deploy: GG_DEV_AUTH=${devAuthValue} is set on a non-local Convex deployment ` +
      `(${url || "no CONVEX_SELF_HOSTED_URL/VITE_CONVEX_URL set"}). ` +
      `Run \`npx convex env remove GG_DEV_AUTH\` against that deployment before deploying — ` +
      `a dev auth stub that survives to a real deployment serves one person's session to another.`,
  );
  process.exit(1);
}

console.log("check-dev-auth: ok" + (devAuthValue ? " (GG_DEV_AUTH is set, but the target is local)" : ""));
