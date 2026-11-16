// Read-only factory dashboard server. Runs only `gh` and `git` read commands.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  ciStateFromChecks,
  computeDrift,
  computeLaunchBlockers,
  computeNeedsYou,
  computeRoadmap,
  MERGED_PR_LIMIT,
  buildEngineering,
  mergedSearchDate,
  CI_HEALTH_RUNS,
  DEPLOY_FETCHED,
  shippedMayBeCutOff,
  parseFeatureFlags,
  shippedThisWeek,
  toShippedPr,
  computeProductKpis,
  roadmapStacks,
  boardTruncation,
  failedSources,
  FRIENDLY_HOST,
  isAllowedHost,
  joinBacklogReview,
  parseBacklogReviews,
  parsePort,
  countPorcelainLines,
  groupByStatus,
  issueFromBranch,
  issueFromPr,
  listAreas,
  parseBoardItems,
  parseLeftRight,
  parseWorktrees,
  splitRuns,
  type BacklogReviewFile,
  type BoardItem,
  type BoardTruncation,
  type FeatureFlag,
  type MergedPr,
  type SourceStatus,
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
const REVIEW_FILE = join(HERE, '..', 'backlog-review.json');

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
  const data = (await ghJson(['pr', 'list', '--repo', REPO, '--limit', '200', '--json', fields])) as RawPr[];
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

type BoardResult = { items: BoardItem[]; truncated: BoardTruncation | null };

async function loadFeatureFlags(): Promise<FeatureFlag[]> {
  // Names and values only. `gh secret` is never called.
  return parseFeatureFlags(await ghJson(['variable', 'list', '--repo', REPO, '--json', 'name,value']));
}

// One query for Shipped (7 days) and Throughput (28 days). The search sets the window, so the limit is not what cuts the list.
async function loadMergedPrs(): Promise<MergedPr[]> {
  const fields = 'number,title,url,mergedAt,createdAt,body,headRefName';
  const search = `merged:>=${mergedSearchDate(new Date())}`;
  const args = ['pr', 'list', '--repo', REPO, '--state', 'merged', '--search', search];
  const data = await ghJson([...args, '--limit', String(MERGED_PR_LIMIT), '--json', fields]);
  return data as MergedPr[];
}

async function loadBoard(): Promise<BoardResult> {
  const data = await ghJson(['project', 'item-list', '4', '--owner', 'ptums', '--format', 'json', '--limit', '500']);
  const items = parseBoardItems(data).map((item) => ({
    ...item,
    url: item.url ?? (item.number ? `${REPO_URL}/issues/${item.number}` : null),
  }));
  return { items, truncated: boardTruncation(data) };
}

function loadRuns(): Promise<Run[]> {
  const fields = 'databaseId,workflowName,headBranch,status,conclusion,url,createdAt';
  return ghJson(['run', 'list', '--repo', REPO, '--limit', '15', '--json', fields]).then((data) => data as Run[]);
}

function loadWorkflowRuns(workflow: string, limit: number, branch?: string): Promise<Run[]> {
  const fields = 'databaseId,workflowName,headBranch,status,conclusion,url,createdAt';
  const args = ['run', 'list', '--repo', REPO, '--workflow', workflow, '--limit', String(limit)];
  if (branch) {
    // Pushes to main only, so PR-event runs on a branch named main do not count.
    args.push('--branch', branch, '--event', 'push');
  }
  return ghJson([...args, '--json', fields]).then((data) => data as Run[]);
}

// Read on every refresh, so an edit shows without a restart.
async function loadBacklogReviews(): Promise<BacklogReviewFile> {
  return parseBacklogReviews(JSON.parse(await readFile(REVIEW_FILE, 'utf8')));
}

async function mainRepoRoot(): Promise<string> {
  const common = (await exec('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim();
  return dirname(common);
}

async function describeWorktree(tree: Worktree): Promise<Worktree> {
  const [status, counts] = await Promise.allSettled([
    exec('git', ['-C', tree.path, '--no-optional-locks', 'status', '--porcelain']),
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
  const [boardResult, openIssues, closedIssues, prs, runs, worktrees, health, flags, mergedPrs, ciMainRuns, deployRuns] = await Promise.all([
    guarded('board', sources, { items: [], truncated: null } as BoardResult, loadBoard),
    guarded('openIssues', sources, [] as Issue[], () => loadIssues('open', 300)),
    guarded('closedIssues', sources, [] as Issue[], () => loadIssues('closed', 1000)),
    guarded('prs', sources, [] as Pr[], loadPrs),
    guarded('runs', sources, [] as Run[], loadRuns),
    guarded('worktrees', sources, [] as Worktree[], loadWorktrees),
    guarded('health', sources, null, loadHealth),
    guarded('featureFlags', sources, [] as FeatureFlag[], loadFeatureFlags),
    guarded('mergedPrs', sources, [] as MergedPr[], loadMergedPrs),
    guarded('ciMain', sources, [] as Run[], () => loadWorkflowRuns('ci.yml', CI_HEALTH_RUNS, 'main')),
    guarded('deploys', sources, [] as Run[], () => loadWorkflowRuns('deploy.yml', DEPLOY_FETCHED)),
  ]);
  const reviewFile = await guarded('backlogReview', sources, null as BacklogReviewFile | null, loadBacklogReviews);
  const backlogReview =
    reviewFile && sources['openIssues']?.ok ? joinBacklogReview(reviewFile, openIssues) : null;
  const board = boardResult.items;
  const allIssues = [...openIssues, ...closedIssues];
  const labelsFor = (n: number | null): string[] => allIssues.find((issue) => issue.number === n)?.labels ?? [];
  const treesWithLabels = worktrees.map((tree) => ({ ...tree, labels: labelsFor(tree.issueNumber) }));
  const prsWithLabels = prs.map((pr) => ({ ...pr, labels: labelsFor(pr.issueNumber) }));
  const runsWithLabels = runs.map((item) => ({ ...item, labels: labelsFor(issueFromBranch(item.headBranch)) }));
  const split = splitRuns(runsWithLabels);
  const driftBlockedBy = failedSources(sources, ['board', 'openIssues', 'closedIssues', 'prs', 'worktrees']);
  const needsYouBlockedBy = failedSources(sources, ['prs', 'openIssues']);
  const generatedAt = new Date();
  const productBlockedBy = failedSources(sources, ['board', 'openIssues']);
  const shipped = shippedThisWeek(mergedPrs, generatedAt).map((pr) => toShippedPr(pr, labelsFor));
  const launchBlockers = productBlockedBy.length > 0 ? null : computeLaunchBlockers(openIssues, board);
  const roadmap = productBlockedBy.length > 0 ? null : computeRoadmap(openIssues, board);
  return {
    generatedAt: generatedAt.toISOString(),
    sources,
    needsYou: needsYouBlockedBy.length > 0 ? null : computeNeedsYou(prs, openIssues),
    needsYouBlockedBy,
    boardTruncated: boardResult.truncated,
    board: { items: board, groups: groupByStatus(board) },
    prs: prsWithLabels,
    worktrees: treesWithLabels,
    runs: split,
    health,
    drift: driftBlockedBy.length > 0 ? null : computeDrift({ board, openIssues, closedIssues, prs, worktrees }),
    driftBlockedBy,
    backlogReview,
    product: {
      flags,
      shipped,
      kpis: computeProductKpis({
        launchBlockers,
        shipped,
        flags,
        openIssueCount: sources['openIssues']?.ok ? openIssues.length : null,
        now: generatedAt,
      }),
      roadmapStacks: roadmap === null ? null : roadmapStacks(roadmap),
      shippedMayBeCutOff: shippedMayBeCutOff(mergedPrs.length),
      launchBlockers,
      roadmap,
      blockedBy: productBlockedBy,
    },
    engineering: buildEngineering(sources, { ciMainRuns, openIssues, deployRuns, mergedPrs }, generatedAt),
    areas: listAreas(allIssues.map((issue) => issue.labels)),
  };
}

type State = Awaited<ReturnType<typeof buildState>>;
let cache: { at: number; value: State } | null = null;
let inFlight: Promise<State> | null = null;

// Concurrent requests share one load.
function getState(refresh: boolean): Promise<State> {
  if (!refresh && cache && Date.now() - cache.at < CACHE_MS) {
    return Promise.resolve(cache.value);
  }
  if (!inFlight) {
    inFlight = buildState()
      .then((value) => {
        cache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

const port = parsePort(process.env['FACTORY_PORT']);

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!isAllowedHost(request.headers.host, port)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
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
}

const servers = [createServer(handle), createServer(handle)];

servers[0]?.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    // Exit 0 so launchd (KeepAlive on failure only) does not restart in a loop.
    console.error(`Port ${port} in use`);
    process.exit(0);
  }
  console.error(`Cannot listen on 127.0.0.1: ${error.message}`);
  process.exit(1);
});
servers[0]?.listen(port, '127.0.0.1', () => {
  console.log(`Factory dashboard: http://127.0.0.1:${port}`);
  console.log(`Friendly URL: http://${FRIENDLY_HOST}:${port}`);
});

// The macOS resolver returns ::1 for *.localhost, so listen there too.
servers[1]?.on('error', (error) => {
  console.error(`Not listening on ::1: ${error.message}`);
});
servers[1]?.listen(port, '::1');
