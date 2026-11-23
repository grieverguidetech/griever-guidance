import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../..');
const agentToml = readFileSync(resolve(__dirname, '../wrangler.toml'), 'utf8');
/** Non-comment lines only, so a comment that mentions a key cannot satisfy or break a check. */
const lines = agentToml
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l !== '' && !l.startsWith('#'));

function wranglerFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === '.worktrees' || name === 'dist') {
      continue;
    }
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      found.push(...wranglerFiles(full));
    } else if (name === 'wrangler.toml') {
      found.push(full);
    }
  }
  return found;
}

describe('apps/agent wrangler.toml', () => {
  it('is the agent Worker', () => {
    expect(lines).toContain('name = "griever-guidance-agent"');
  });

  it('has no routes and no workers.dev or preview URLs', () => {
    expect(lines.some((l) => /^\s*routes?\s*=/.test(l))).toBe(false);
    expect(lines.some((l) => /^\s*\[\[?routes/.test(l))).toBe(false);
    expect(lines.some((l) => l.startsWith('[env.'))).toBe(false);
    expect(lines.some((l) => /^\s*(workers_dev|preview_urls)\s*=\s*true/.test(l))).toBe(false);
    expect(lines).toContain('workers_dev = false');
    expect(lines).toContain('preview_urls = false');
  });

  it('declares AGENT_RATE_LIMITER at 300 per 60 s', () => {
    expect(lines).toContain('name = "AGENT_RATE_LIMITER"');
    expect(lines).toContain('namespace_id = "1003"');
    expect(lines).toContain('simple = { limit = 300, period = 60 }');
  });

  it('uses a rate limiter namespace_id no other wrangler.toml uses', () => {
    const ids = (text: string) => [...text.matchAll(/^\s*namespace_id\s*=\s*"?(\d+)"?/gm)].map((m) => m[1]);
    const mine = ids(agentToml);
    const others = wranglerFiles(repoRoot)
      .filter((f) => f !== resolve(__dirname, '../wrangler.toml'))
      .flatMap((f) => ids(readFileSync(f, 'utf8')));
    expect(others.length).toBeGreaterThan(0);
    for (const id of mine) {
      expect(others).not.toContain(id);
    }
  });
});
