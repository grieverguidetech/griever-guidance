// Read-only factory dashboard server. Runs only `gh` and `git` read commands.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  ciStateFromChecks,
  computeDrift,
  computeNeedsYou,
  countPorcelainLines,
  groupByStatus,
  issueFromBranch,
  issueFromPr,
  listAreas,
  parseBoardItems,
  parseLeftRight,
  parseWorktrees,
  splitRuns,
  type BoardItem,
  type Issue,
  type Pr,
  type Run,
  type Worktree,
} from './model';

const run = promisify(execFile);
const REPO = 'grieverguidetech/griever-guidance';
const REPO_URL = `https://github.com/${REPO}`;
const HEALTH_URL = 'https://api.grieversguidance.com/health';
const CACHE_MS = 30_000;
const HERE = dirname(fileURLToPath(import.meta.url));

type SourceStatus = { ok: boolean; error?: string };

async function exec(command: string, args: string[], cwd?: string): Promise<string> {
  const { stdout } = await run(command, args, { cwd, maxBuffer: 64 * 1024 * 1024, timeout: 60_000 });
  return stdout;
}

async function ghJson(args: string[]): Promise<unknown> {
  return JSON.parse(await exec('gh', args));
}

async function guarded<T>(
  name: string,
  sources: Record<string, SourceStatus>,
  fallback: T,
  load: () => Promise<T>,
): Promise<T> {
  try {
    const value = await load();
    sources[name] = { ok: true };
    return value;
  } catch (error) {
    sources[name] = { ok: false, error: error instanceof Error ? error.message.slice(0, 300) : 'failed' };
    return fallback;
  }
}

type RawIssue = { number: number; title: string; url: string; updatedAt: string; labels: { name: string }[] };

function toIssue(raw: RawIssue): Issue {
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    updatedAt: raw.updatedAt,
    labels: raw.labels.map((label) => label.name),
  };
}

function loadIssues(state: 'open' | 'closed', limit: number): Promise<Issue[]> {
  const fields = 'number,title,labels,url,updatedAt';
  return ghJson(['issue', 'list', '--repo', REPO, '--state', state, '--limit', String(limit), '--json', fields]).then(
    (data) => (data as RawIssue[]).map(toIssue),
  );
}

type RawPr = {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  headRefName: string;
  reviewDecision: string;
  statusCheckRollup: never[];
  updatedAt: string;
  body: string;
};

async function loadPrs(): Promise<Pr[]> {
  const fields =
    'number,title,url,isDraft,headRefName,reviewDecision,statusCheckRollup,updatedAt,body';
  const data = (await ghJson(['pr', 'list', '--repo', REPO, '--json', fields])) as RawPr[];
  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    url: pr.url,
    isDraft: pr.isDraft,
    headRefName: pr.headRefName,
    reviewDecision: pr.reviewDecision ?? '',
    ci: ciStateFromChecks(pr.statusCheckRollup),
    issueNumber: issueFromPr(pr.body, pr.headRefName),
    updatedAt: pr.updatedAt,
  }));
}

async function loadBoard(): Promise<BoardItem[]> {
  const data = await ghJson(['project', 'item-list', '4', '--owner', 'ptums', '--format', 'json', '--limit', '500']);
  return parseBoardItems(data).map((item) => ({
    ...item,
    url: item.url ?? (item.number ? `${REPO_URL}/issues/${item.number}` : null),
  }));
}

function loadRuns(): Promise<Run[]> {
  const fields = 'databaseId,workflowName,headBranch,status,conclusion,url,createdAt';
  return ghJson(['run', 'list', '--repo', REPO, '--limit', '15', '--json', fields]).then((data) => data as Run[]);
}

async function mainRepoRoot(): Promise<string> {
  const common = (await exec('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim();
  return dirname(common);
}

async function describeWorktree(tree: Worktree): Promise<Worktree> {
  const [status, counts] = await Promise.allSettled([
    exec('git', ['-C', tree.path, 'status', '--porcelain']),
    exec('git', ['-C', tree.path, 'rev-list', '--left-right', '--count', 'origin/main...HEAD']),
  ]);
  const parsed = counts.status === 'fulfilled' ? parseLeftRight(counts.value) : null;
  return {
    ...tree,
    dirty: status.status === 'fulfilled' ? countPorcelainLines(status.value) : null,
    ahead: parsed ? parsed.ahead : null,
    behind: parsed ? parsed.behind : null,
  };
}

async function loadWorktrees(): Promise<Worktree[]> {
  const root = await mainRepoRoot();
  const trees = parseWorktrees(await exec('git', ['worktree', 'list', '--porcelain'], root));
  return Promise.all(trees.map(describeWorktree));
}

async function loadHealth(): Promise<{ status: number; ms: number; url: string }> {
  const started = Date.now();
  const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(5000) });
  return { status: response.status, ms: Date.now() - started, url: HEALTH_URL };
}

async function buildState() {
  const sources: Record<string, SourceStatus> = {};
  const [board, openIssues, closedIssues, prs, runs, worktrees, health] = await Promise.all([
    guarded('board', sources, [] as BoardItem[], loadBoard),
    guarded('openIssues', sources, [] as Issue[], () => loadIssues('open', 300)),
    guarded('closedIssues', sources, [] as Issue[], () => loadIssues('closed', 100)),
    guarded('prs', sources, [] as Pr[], loadPrs),
    guarded('runs', sources, [] as Run[], loadRuns),
    guarded('worktrees', sources, [] as Worktree[], loadWorktrees),
    guarded('health', sources, null, loadHealth),
  ]);
  const allIssues = [...openIssues, ...closedIssues];
  const labelsFor = (n: number | null): string[] => allIssues.find((issue) => issue.number === n)?.labels ?? [];
  const treesWithLabels = worktrees.map((tree) => ({ ...tree, labels: labelsFor(tree.issueNumber) }));
  const prsWithLabels = prs.map((pr) => ({ ...pr, labels: labelsFor(pr.issueNumber) }));
  const runsWithLabels = runs.map((item) => ({ ...item, labels: labelsFor(issueFromBranch(item.headBranch)) }));
  const split = splitRuns(runsWithLabels);
  return {
    generatedAt: new Date().toISOString(),
    sources,
    needsYou: computeNeedsYou(prs, openIssues),
    board: { items: board, groups: groupByStatus(board) },
    prs: prsWithLabels,
    worktrees: treesWithLabels,
    runs: split,
    health,
    drift: computeDrift({ board, openIssues, closedIssues, prs, worktrees }),
    areas: listAreas(allIssues.map((issue) => issue.labels)),
  };
}

let cache: { at: number; value: Awaited<ReturnType<typeof buildState>> } | null = null;

async function getState(refresh: boolean) {
  if (!refresh && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.value;
  }
  const value = await buildState();
  cache = { at: Date.now(), value };
  return value;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (request.method !== 'GET') {
    response.writeHead(405).end();
    return;
  }
  try {
    if (url.pathname === '/') {
      const html = await readFile(join(HERE, '..', 'public', 'index.html'));
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
    } else if (url.pathname === '/api/state') {
      const state = await getState(url.searchParams.get('refresh') === '1');
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify(state));
    } else {
      response.writeHead(404).end('Not found');
    }
  } catch (error) {
    response.writeHead(500).end(error instanceof Error ? error.message : 'error');
  }
});

const port = Number(process.env['FACTORY_PORT'] ?? 4317);
server.listen(port, '127.0.0.1', () => {
  console.log(`Factory dashboard: http://127.0.0.1:${port}`);
});
