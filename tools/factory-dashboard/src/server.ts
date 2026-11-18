// Read-only factory dashboard server. Runs only `gh`, `git` and `aws ce get-cost-and-usage` read commands, and reads docs/**/*.md (Mermaid blocks) and the Mermaid bundle in node_modules. It also makes one read-only Linear GraphQL query (key from the macOS Keychain, never sent to the page). It writes only one cache file (the AWS cost reading).
import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  ciStateFromChecks,
  computeDrift,
  computeNeedsYou,
  MERGED_PR_LIMIT,
  buildEngineering,
  buildDelivery,
  type PrLeadInput,
  mergedSearchDate,
  shippedSearchDate,
  CI_HEALTH_RUNS,
  DEPLOY_FETCHED,
  DEPLOY_FETCH_DAYS,
  parseFeatureFlags,
  parseMilestones,
  type Milestone,
  buildProduct,
  openBoardItems,
  summarizeIssue,
  summarizePr,
  dependsOn,
  boardTruncation,
  failedSources,
  FRIENDLY_HOST,
  isAllowedHost,
  decideRestart,
  codeChanged,
  CACHE_MS,
  COST_BUDGET_USD,
  GIT_LOG_FORMAT,
  COMMITS_SHOWN,
  costErrorMessage,
  linearErrorMessage,
  toLinearRows,
  type LinearRow,
  makeCostReader,
  validateCostReading,
  parseAdr,
  extractMermaidBlocks,
  diagramGroup,
  diagramAge,
  DIAGRAM_GROUPS,
  DIAGRAM_STALE_DAYS,
  parseCostExplorer,
  parseGitLog,
  closedIssueArgs,
  RESTART_HEADER,
  joinBacklogReview,
  parseBacklogReviews,
  parseBusiness,
  buildBusiness,
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
  type AdrInfo,
  type CostReading,
  type CostResult,
  type CommitInfo,
  type BacklogReviewFile,
  type BusinessFile,
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
const HERE = dirname(fileURLToPath(import.meta.url));
const REVIEW_FILE = join(HERE, '..', 'backlog-review.json');
const BUSINESS_FILE = join(HERE, '..', 'business.json');
const RESTART_ON_CHANGE = process.env['FACTORY_RESTART_ON_CHANGE'] === '1';
const WATCH_MS = 30_000;

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

type RawIssue = { number: number; title: string; url: string; updatedAt: string; createdAt?: string; closedAt?: string; stateReason?: string; labels: { name: string }[]; body?: string; assignees?: { login: string }[] };

function toIssue(raw: RawIssue): Issue {
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    updatedAt: raw.updatedAt,
    labels: raw.labels.map((label) => label.name),
    ...(raw.assignees === undefined ? {} : { assignee: raw.assignees[0]?.login ?? null }),
    ...(raw.createdAt === undefined || raw.closedAt === undefined ? {} : { createdAt: raw.createdAt, closedAt: raw.closedAt, stateReason: raw.stateReason }),
    // Only the one-line summary is kept. The body is dropped here.
    ...(raw.body === undefined ? {} : { summary: summarizeIssue(raw.body), dependsOn: dependsOn(raw.body) }),
  };
}

function loadIssues(state: 'open' | 'closed', limit: number): Promise<Issue[]> {
  // Bodies only for open issues: they feed the one-line summaries. Closed issues are many, so they stay light.
  const fields = state === 'open' ? 'number,title,labels,url,updatedAt,body,assignees' : 'number,title,labels,url,updatedAt,createdAt,closedAt,stateReason';
  const base =
    state === 'closed'
      ? closedIssueArgs(new Date(), REPO, limit)
      : ['issue', 'list', '--repo', REPO, '--state', state, '--limit', String(limit)];
  return ghJson([...base, '--json', fields]).then((data) => (data as RawIssue[]).map(toIssue));
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
  labels?: { name: string }[];
};

async function loadPrs(): Promise<Pr[]> {
  const fields =
    'number,title,url,isDraft,headRefName,reviewDecision,statusCheckRollup,updatedAt,body,labels';
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
    // Only the one-line summary and the label names are kept. The body is dropped here.
    summary: summarizePr(pr.body),
    prLabels: (pr.labels ?? []).map((label) => label.name),
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

type RawLeadNode = {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  mergedAt: string;
  mergeCommit: { oid: string } | null;
  commits: { nodes: { commit: { authoredDate: string } }[] };
};

const LEAD_QUERY =
  'query($q:String!,$after:String){search(query:$q,type:ISSUE,first:100,after:$after){pageInfo{hasNextPage endCursor} nodes{... on PullRequest{number title url createdAt mergedAt mergeCommit{oid} commits(first:1){nodes{commit{authoredDate}}}}}}}';
const LEAD_MAX_PAGES = 10;

type LeadResult = { prs: PrLeadInput[]; truncated: boolean };

// PRs merged in the last 28 days with the time of their first commit. `gh pr list --json commits` is too big for the
// GraphQL limit at this size, so this is one read-only search query, 100 PRs a page, 10 pages at most. Only 1 commit per PR is asked.
// At the page limit it stops and says so (truncated) instead of failing.
async function loadPrLeadInputs(): Promise<LeadResult> {
  const search = `repo:${REPO} base:main is:pr is:merged merged:>=${mergedSearchDate(new Date())}`;
  const found: PrLeadInput[] = [];
  let after: string | null = null;
  for (let page = 0; page < LEAD_MAX_PAGES; page += 1) {
    const args = ['api', 'graphql', '-f', `query=${LEAD_QUERY}`, '-f', `q=${search}`];
    if (after !== null) {
      args.push('-f', `after=${after}`);
    }
    const reply = (await ghJson(args)) as {
      errors?: { message?: string }[];
      data?: { search: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: RawLeadNode[] } };
    };
    if (!reply.data || reply.errors) {
      throw new Error(reply.errors?.[0]?.message?.slice(0, 200) ?? 'GraphQL reply had no data');
    }
    for (const node of reply.data.search.nodes) {
      found.push({
        number: node.number,
        title: node.title,
        url: node.url,
        createdAt: node.createdAt,
        mergedAt: node.mergedAt,
        mergeSha: node.mergeCommit?.oid ?? null,
        firstCommitAt: node.commits.nodes[0]?.commit.authoredDate ?? null,
      });
    }
    if (!reply.data.search.pageInfo.hasNextPage) {
      return { prs: found, truncated: false };
    }
    after = reply.data.search.pageInfo.endCursor;
  }
  return { prs: found, truncated: true };
}

// Issues closed in the Shipped window, for the summary of a PR whose own body says nothing useful.
function loadRecentClosedIssues(): Promise<Issue[]> {
  const search = `closed:>=${shippedSearchDate(new Date())}`;
  const args = ['issue', 'list', '--repo', REPO, '--state', 'closed', '--search', search, '--limit', '300'];
  return ghJson([...args, '--json', 'number,title,labels,url,updatedAt,body']).then((data) =>
    (data as RawIssue[]).map(toIssue),
  );
}

// Open milestones. REST, read-only. 100 is the page maximum and far more than this repo has.
async function loadMilestones(): Promise<Milestone[]> {
  return parseMilestones(await ghJson(['api', `repos/${REPO}/milestones?state=open&per_page=100`]));
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

function loadWorkflowRuns(workflow: string, limit: number, branch?: string, since?: string): Promise<Run[]> {
  const fields = 'databaseId,workflowName,headBranch,status,conclusion,url,createdAt,updatedAt,headSha';
  const args = ['run', 'list', '--repo', REPO, '--workflow', workflow, '--limit', String(limit)];
  if (branch) {
    // Pushes to main only, so PR-event runs on a branch named main do not count.
    args.push('--branch', branch, '--event', 'push');
  }
  if (since) {
    args.push('--created', `>=${since}`);
  }
  return ghJson([...args, '--json', fields]).then((data) => data as Run[]);
}

// Read on every refresh, so an edit shows without a restart.
async function loadBacklogReviews(): Promise<BacklogReviewFile> {
  return parseBacklogReviews(JSON.parse(await readFile(REVIEW_FILE, 'utf8')));
}

// Read on every refresh, like the backlog review.
// business.json is private and not in git, so a missing file is normal and gives null.
async function loadBusiness(): Promise<BusinessFile | null> {
  let text: string;
  try {
    text = await readFile(BUSINESS_FILE, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
  return parseBusiness(JSON.parse(text));
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

// The origin/main that is already local. No fetch.
async function loadCommits(): Promise<CommitInfo[]> {
  const root = await mainRepoRoot();
  const args = ['log', 'origin/main', `-${COMMITS_SHOWN}`, `--format=${GIT_LOG_FORMAT}`];
  return parseGitLog(await exec('git', args, root), new Date());
}

// Reads docs/adr/*.md from the main checkout. A missing folder is an empty list.
async function loadAdrs(): Promise<AdrInfo[]> {
  const dir = join(await mainRepoRoot(), 'docs', 'adr');
  const names = (await readdir(dir).catch(() => [] as string[])).filter((name) => name.endsWith('.md')).sort();
  return Promise.all(names.map(async (name) => parseAdr(name, await readFile(join(dir, name), 'utf8'))));
}

// Architecture tab: every ```mermaid block in docs/*.md, docs/adr/*.md and docs/learnings/*.md of the main checkout.
// Read on each request (not cached), so a new block shows after a reload. The age comes from `git log -1` for the file.
const DIAGRAM_DIRS = ['docs', 'docs/adr', 'docs/learnings'];

async function lastChanged(root: string, file: string): Promise<string | null> {
  try {
    return (await exec('git', ['log', '-1', '--format=%cI', '--', file], root)).trim() || null;
  } catch {
    return null;
  }
}

async function mermaidVersion(): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(join(HERE, '..', 'node_modules', 'mermaid', 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0';
  } catch {
    return '0';
  }
}

async function loadDiagrams() {
  const root = await mainRepoRoot();
  const now = new Date();
  const files = (
    await Promise.all(
      DIAGRAM_DIRS.map(async (dir) =>
        (await readdir(join(root, dir)).catch(() => [] as string[])).filter((name) => name.endsWith('.md')).sort().map((name) => `${dir}/${name}`),
      ),
    )
  ).flat();
  const diagrams = (
    await Promise.all(
      files.map(async (file) => {
        const text = await readFile(join(root, file), 'utf8').catch(() => null);
        const blocks = text === null ? [] : extractMermaidBlocks(file, text);
        if (blocks.length === 0) {
          return [];
        }
        const changed = await lastChanged(root, file);
        const age = diagramAge(changed, now);
        return blocks.map((block) => ({
          ...block,
          group: diagramGroup(file),
          url: `${REPO_URL}/blob/main/${file}?plain=1#L${block.line}`,
          lastChanged: changed,
          daysAgo: age.days,
          stale: age.stale,
        }));
      }),
    )
  ).flat();
  return {
    generatedAt: now.toISOString(),
    staleDays: DIAGRAM_STALE_DAYS,
    mermaidVersion: await mermaidVersion(),
    groups: DIAGRAM_GROUPS.map((name) => ({ name, diagrams: diagrams.filter((d) => d.group === name) })),
  };
}

// The Mermaid browser bundle, served from node_modules (no CDN). Read when asked, so the server starts without it.
// The page asks for it with ?v=<version>, so a new Mermaid version is not served from the browser cache.
const MERMAID_FILE = join(HERE, '..', 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');

// Cost Explorer bills $0.01 a call. makeCostReader keeps a good reading for 12 hours (and for the month
// it was read in). The reading is also saved to one file outside the repo, so a restart does not call again.
// Refresh does not clear it. This is the only file the dashboard writes.
const COST_CACHE_DIR = join(homedir(), 'Library', 'Caches', 'gg-factory');
const COST_CACHE_FILE = join(COST_CACHE_DIR, 'aws-cost.json');

async function callCostExplorer(period: { start: string; end: string }): Promise<CostResult> {
  const args = [
    'ce', 'get-cost-and-usage',
    '--time-period', `Start=${period.start},End=${period.end}`,
    '--granularity', 'MONTHLY',
    '--metrics', 'UnblendedCost',
    '--output', 'json',
  ];
  let reply: string;
  try {
    reply = await exec('aws', args);
  } catch (error) {
    // Only stderr or the message is judged, then mapped to a plain reason. Nothing raw is passed on.
    const detail = error as { stderr?: string; message?: string };
    throw new Error(costErrorMessage(detail.stderr || detail.message || ''));
  }
  let parsed: CostResult | null = null;
  try {
    parsed = parseCostExplorer(JSON.parse(reply));
  } catch {
    parsed = null;
  }
  if (parsed === null) {
    throw new Error(costErrorMessage('Unreadable reply'));
  }
  return parsed;
}

const readCost = makeCostReader({
  call: callCostExplorer,
  now: () => Date.now(),
  load: async () => validateCostReading(JSON.parse(await readFile(COST_CACHE_FILE, 'utf8'))),
  save: async (reading) => {
    await mkdir(COST_CACHE_DIR, { recursive: true });
    await writeFile(COST_CACHE_FILE, JSON.stringify(reading), 'utf8');
  },
});

// Linear (team GRI): one read-only GraphQL query. The personal API key is read from the macOS Keychain on each
// call and kept only in a local variable. It is never logged, never sent to the page and never written anywhere.
const LINEAR_URL = 'https://api.linear.app/graphql';
const LINEAR_CACHE_MS = 10 * 60 * 1000;
const LINEAR_NO_KEY = 'Linear key not set. See the README.';
const LINEAR_QUERY = `query ($after: String) {
  teams(filter: { key: { eq: "GRI" } }) {
    nodes {
      issues(first: 100, after: $after, filter: { state: { type: { nin: ["completed", "canceled"] } } }) {
        nodes { identifier title url state { name type } priority priorityLabel assignee { name } updatedAt }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;
const LINEAR_MAX_PAGES = 10;

type LinearReading = { rows: LinearRow[]; at: number };
let linearCache: LinearReading | null = null;

async function readLinearKey(): Promise<string> {
  try {
    const { stdout } = await run('security', ['find-generic-password', '-s', 'gg-dashboard-linear', '-w'], { timeout: 10_000 });
    const key = stdout.trim();
    if (key !== '') {
      return key;
    }
  } catch {
    // Not found in the Keychain: handled below.
  }
  throw new Error(LINEAR_NO_KEY);
}

async function fetchLinearRows(key: string): Promise<LinearRow[]> {
  const nodes: unknown[] = [];
  let after: string | null = null;
  for (let page = 0; page < LINEAR_MAX_PAGES; page += 1) {
    const response = await fetch(LINEAR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: key },
      body: JSON.stringify({ query: LINEAR_QUERY, variables: { after } }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`Linear answered ${response.status}`);
    }
    const body = (await response.json()) as {
      errors?: { message?: string }[];
      data?: { teams?: { nodes?: { issues?: { nodes?: unknown[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } } }[] } };
    };
    if (body.errors && body.errors.length > 0) {
      throw new Error(body.errors[0]?.message ?? 'Linear returned an error');
    }
    const issues = body.data?.teams?.nodes?.[0]?.issues;
    if (!issues) {
      throw new Error('Team GRI not found');
    }
    nodes.push(...(issues.nodes ?? []));
    if (!issues.pageInfo?.hasNextPage || !issues.pageInfo.endCursor) {
      break;
    }
    after = issues.pageInfo.endCursor;
  }
  return toLinearRows(nodes);
}

async function readLinear(): Promise<LinearReading> {
  if (linearCache && Date.now() - linearCache.at < LINEAR_CACHE_MS) {
    return linearCache;
  }
  const key = await readLinearKey();
  try {
    linearCache = { rows: await fetchLinearRows(key), at: Date.now() };
    return linearCache;
  } catch (error) {
    throw new Error(linearErrorMessage(error instanceof Error ? error.message : '', key));
  }
}

async function buildState() {
  const sources: Record<string, SourceStatus> = {};
  const [boardResult, openIssues, closedIssues, prs, runs, worktrees, health, flags, mergedPrs, ciMainRuns, deployRuns, recentClosed, commits, adrs, costReading, prLead, milestones, linear] = await Promise.all([
    guarded('board', sources, { items: [], truncated: null } as BoardResult, loadBoard),
    guarded('openIssues', sources, [] as Issue[], () => loadIssues('open', 300)),
    guarded('closedIssues', sources, [] as Issue[], () => loadIssues('closed', 500)),
    guarded('prs', sources, [] as Pr[], loadPrs),
    guarded('runs', sources, [] as Run[], loadRuns),
    guarded('worktrees', sources, [] as Worktree[], loadWorktrees),
    guarded('health', sources, null, loadHealth),
    guarded('featureFlags', sources, [] as FeatureFlag[], loadFeatureFlags),
    guarded('mergedPrs', sources, [] as MergedPr[], loadMergedPrs),
    guarded('ciMain', sources, [] as Run[], () => loadWorkflowRuns('ci.yml', CI_HEALTH_RUNS, 'main')),
    guarded('deploys', sources, [] as Run[], () => loadWorkflowRuns('deploy.yml', DEPLOY_FETCHED, undefined, shippedSearchDate(new Date(), DEPLOY_FETCH_DAYS))),
    guarded('recentClosed', sources, [] as Issue[], loadRecentClosedIssues),
    guarded('commits', sources, [] as CommitInfo[], loadCommits),
    guarded('adrs', sources, [] as AdrInfo[], loadAdrs),
    guarded('awsCost', sources, null as CostReading | null, readCost),
    guarded('prLeadInputs', sources, { prs: [], truncated: false } as LeadResult, loadPrLeadInputs),
    guarded('milestones', sources, [] as Milestone[], loadMilestones),
    guarded('linear', sources, null as LinearReading | null, readLinear),
  ]);
  const reviewFile = await guarded('backlogReview', sources, null as BacklogReviewFile | null, loadBacklogReviews);
  const businessFile = await guarded('business', sources, null as BusinessFile | null, loadBusiness);
  if (sources['business']?.ok && businessFile === null) {
    sources['business'] = { ok: true, missing: true };
  }
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
  const summaries = new Map<number, string>();
  for (const issue of [...recentClosed, ...openIssues]) {
    summaries.set(issue.number, issue.summary ?? '');
  }
  const summaryFor = (n: number | null): string => (n === null ? '' : (summaries.get(n) ?? ''));
  const withSummary = <T extends { number: number | null }>(item: T): T & { summary: string } => ({
    ...item,
    summary: summaryFor(item.number),
  });
  const openBoard = openBoardItems(board, new Set(openIssues.map((issue) => issue.number))).map(withSummary);
  const drift = driftBlockedBy.length > 0 ? null : computeDrift({ board, openIssues, closedIssues, prs, worktrees });
  return {
    generatedAt: generatedAt.toISOString(),
    sources,
    needsYou: needsYouBlockedBy.length > 0 ? null : computeNeedsYou(prs, openIssues),
    needsYouBlockedBy,
    boardTruncated: boardResult.truncated,
    board: { items: openBoard, groups: groupByStatus(openBoard) },
    prs: prsWithLabels,
    worktrees: treesWithLabels,
    runs: split,
    health,
    drift: drift === null ? null : drift.map(withSummary),
    driftBlockedBy,
    backlogReview,
    business: businessFile ? buildBusiness(businessFile, generatedAt) : null,
    product: buildProduct({
      sources,
      flags,
      mergedPrs,
      openIssues,
      board,
      labelsFor,
      issueSummaryFor: summaryFor,
      milestones,
      now: generatedAt,
    }),
    engineering: buildEngineering(sources, { board: openBoard, ciMainRuns, openIssues, deployRuns, mergedPrs }, generatedAt),
    delivery: buildDelivery(sources, { board: openBoard, closedIssues, deployRuns, prLeadInputs: prLead.prs, prLeadTruncated: prLead.truncated }, generatedAt),
    commits,
    adrs: adrs.map((adr) => ({ ...adr, url: `${REPO_URL}/blob/main/docs/adr/${adr.file}` })),
    cost:
      costReading === null
        ? null
        : { dollars: costReading.dollars, estimated: costReading.estimated, budget: COST_BUDGET_USD, checkedAt: new Date(costReading.at).toISOString() },
    linear: linear === null ? null : { rows: linear.rows, checkedAt: new Date(linear.at).toISOString() },
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

// No CORS headers are ever sent, so a preflight from another origin fails.
function handleRestart(request: IncomingMessage, response: ServerResponse): void {
  const decision = decideRestart({
    method: request.method,
    host: request.headers.host,
    origin: request.headers.origin,
    restartHeader: request.headers[RESTART_HEADER] as string | undefined,
    restartEnabled: RESTART_ON_CHANGE,
    port,
  });
  if (!decision.allowed) {
    response.writeHead(decision.status).end(decision.reason);
    return;
  }
  console.log('Restart requested from the page');
  response.writeHead(202, { 'content-type': 'text/plain' });
  // Exit 1 so launchd (KeepAlive on failure) starts the server again on the latest code.
  response.end('Restarting', () => {
    setTimeout(() => process.exit(1), 100);
  });
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!isAllowedHost(request.headers.host, port)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/api/restart') {
    handleRestart(request, response);
    return;
  }
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
      response.end(JSON.stringify({ ...state, restartAvailable: RESTART_ON_CHANGE }));
    } else if (url.pathname === '/api/diagrams') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify(await loadDiagrams()));
    } else if (url.pathname === '/vendor/mermaid.min.js') {
      const script = await readFile(MERMAID_FILE);
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'max-age=86400' }).end(script);
    } else {
      response.writeHead(404).end('Not found');
    }
  } catch (error) {
    response.writeHead(500).end(error instanceof Error ? error.message : 'error');
  }
}

// Newest file time under a folder, in ms. A missing folder counts as 0.
async function newestMtime(dir: string): Promise<number> {
  let newest = 0;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const path = join(dir, entry.name);
    const time = entry.isDirectory() ? await newestMtime(path) : await stat(path).then((s) => s.mtimeMs, () => 0);
    newest = Math.max(newest, time);
  }
  return newest;
}

async function newestCodeMtime(): Promise<number> {
  const times = await Promise.all([newestMtime(join(HERE)), newestMtime(join(HERE, '..', 'public'))]);
  return Math.max(...times);
}

// Only under launchd: exit 1 when the code changes, so KeepAlive starts the new code.
if (RESTART_ON_CHANGE) {
  newestCodeMtime()
    .then((baseline) => {
    setInterval(() => {
      newestCodeMtime()
        .then((current) => {
          if (codeChanged(baseline, current)) {
            console.log('Code changed, restarting');
            process.exit(1);
          }
        })
        .catch((error: Error) => console.error(`Code check failed: ${error.message}`));
    }, WATCH_MS);
    })
    .catch((error: Error) => console.error(`Code watch not started: ${error.message}`));
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
