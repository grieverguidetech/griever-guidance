// Pure logic for the factory dashboard. No I/O. Every function here has a spec.

export interface BoardItem {
  number: number | null;
  title: string;
  status: string | null;
  type: string;
  url: string | null;
  labels: string[];
  summary?: string;
}

export interface Issue {
  number: number;
  title: string;
  url: string;
  labels: string[];
  updatedAt: string;
  // Only on closed issues: the times for cycle time.
  createdAt?: string;
  closedAt?: string;
  // COMPLETED or NOT_PLANNED. Only on closed issues.
  stateReason?: string;
  // One line from the issue body. The body itself never leaves the server.
  summary?: string;
  // Issue numbers from the "### Depends on" section. Only the numbers are kept, never the body.
  dependsOn?: number[];
  // Login of the first assignee. Only on open issues.
  assignee?: string | null;
}

export interface Pr {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  headRefName: string;
  reviewDecision: string;
  ci: CiState;
  issueNumber: number | null;
  updatedAt: string;
  // One line from the PR body. The body itself never leaves the server.
  summary?: string;
  // The PR's own labels, such as ready-to-merge.
  prLabels?: string[];
}

export type CiState = 'green' | 'red' | 'pending' | 'none';

export interface Worktree {
  path: string;
  branch: string | null;
  head: string | null;
  isMain: boolean;
  issueNumber: number | null;
  dirty: number | null;
  ahead: number | null;
  behind: number | null;
  labels: string[];
}

export interface NeedsYouItem {
  kind: 'pr-green' | 'blocked' | 'ready-for-human';
  number: number;
  title: string;
  url: string;
  labels: string[];
  summary?: string;
}

export interface DriftItem {
  rule: string;
  number: number | null;
  title: string;
  url: string | null;
  detail: string;
  labels: string[];
}

export const BOARD_STATUSES = ['Backlog', 'Ready', 'In progress', 'In review', 'Blocked', 'Done'];
export const NO_STATUS = 'No status';
export const NO_AREA = 'none';

export function parseWorktrees(porcelain: string): Worktree[] {
  const blocks = porcelain.split(/\n\s*\n/).filter((block) => block.trim() !== '');
  return blocks.map((block, index) => parseWorktreeBlock(block, index === 0));
}

function parseWorktreeBlock(block: string, isMain: boolean): Worktree {
  let path = '';
  let head: string | null = null;
  let branch: string | null = null;
  for (const line of block.split('\n')) {
    if (line.startsWith('worktree ')) {
      path = line.slice('worktree '.length);
    } else if (line.startsWith('HEAD ')) {
      head = line.slice('HEAD '.length);
    } else if (line.startsWith('branch ')) {
      branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    }
  }
  return {
    path,
    branch,
    head,
    isMain,
    issueNumber: issueFromBranch(branch),
    dirty: null,
    ahead: null,
    behind: null,
    labels: [],
  };
}

export function issueFromBranch(branch: string | null): number | null {
  if (!branch) {
    return null;
  }
  const match = /^ticket\/(\d+)(?:\b|[-_/])/.exec(branch);
  return match ? Number(match[1]) : null;
}

export function countPorcelainLines(statusPorcelain: string): number {
  return statusPorcelain.split('\n').filter((line) => line.trim() !== '').length;
}

// `git rev-list --left-right --count origin/main...HEAD` prints "<behind>\t<ahead>".
export function parseLeftRight(output: string): { behind: number; ahead: number } | null {
  const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(output);
  if (!match) {
    return null;
  }
  return { behind: Number(match[1]), ahead: Number(match[2]) };
}

export function issueFromPr(body: string | null | undefined, headRefName: string): number | null {
  const closes = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i.exec(body ?? '');
  if (closes) {
    return Number(closes[1]);
  }
  return issueFromBranch(headRefName);
}

interface RawCheck {
  __typename?: string;
  name?: string;
  context?: string;
  status?: string;
  conclusion?: string;
  state?: string;
}

// The merge gate stays red until the ready-to-merge label is added, and the label is added only
// after CI is green. Counting it would mark every PR as failing, so it is left out.
const MERGE_GATE_CHECK = 'Ready to merge';

const BAD_CONCLUSIONS = ['FAILURE', 'TIMED_OUT', 'CANCELLED', 'STARTUP_FAILURE', 'ACTION_REQUIRED'];
const GOOD_CONCLUSIONS = ['SUCCESS', 'NEUTRAL', 'SKIPPED'];

export function ciStateFromChecks(checks: RawCheck[] | null | undefined): CiState {
  const counted = (checks ?? []).filter((check) => (check.name ?? check.context) !== MERGE_GATE_CHECK);
  if (counted.length === 0) {
    return 'none';
  }
  const states = counted.map(checkState);
  if (states.includes('red')) {
    return 'red';
  }
  if (states.includes('pending')) {
    return 'pending';
  }
  return 'green';
}

function checkState(check: RawCheck): CiState {
  if (check.__typename === 'StatusContext') {
    return statusContextState(check.state);
  }
  if (check.status && check.status !== 'COMPLETED') {
    return 'pending';
  }
  if (BAD_CONCLUSIONS.includes(check.conclusion ?? '')) {
    return 'red';
  }
  if (GOOD_CONCLUSIONS.includes(check.conclusion ?? '')) {
    return 'green';
  }
  return 'pending';
}

function statusContextState(state: string | undefined): CiState {
  if (state === 'SUCCESS') {
    return 'green';
  }
  if (state === 'FAILURE' || state === 'ERROR') {
    return 'red';
  }
  return 'pending';
}

export function areaOf(labels: string[]): string {
  const area = labels.find((name) => name.startsWith('area:'));
  return area ? area.slice('area:'.length) : NO_AREA;
}

export function listAreas(labelSets: string[][]): string[] {
  const areas = new Set<string>();
  for (const labels of labelSets) {
    areas.add(areaOf(labels));
  }
  return [...areas].sort((a, b) => {
    if (a === NO_AREA) {
      return 1;
    }
    if (b === NO_AREA) {
      return -1;
    }
    return a.localeCompare(b);
  });
}

export function filterByArea<T extends { labels: string[] }>(items: T[], area: string | null): T[] {
  if (!area || area === 'all') {
    return items;
  }
  return items.filter((item) => areaOf(item.labels) === area);
}

export function groupByStatus(items: BoardItem[]): Record<string, BoardItem[]> {
  const groups: Record<string, BoardItem[]> = {};
  for (const status of BOARD_STATUSES) {
    groups[status] = [];
  }
  for (const item of items) {
    const key = item.status && BOARD_STATUSES.includes(item.status) ? item.status : NO_STATUS;
    groups[key] = groups[key] ?? [];
    groups[key].push(item);
  }
  return groups;
}

// Board counts are for open issues only. The open list is complete, so an issue that is not in it is closed
// (however long ago) and is not counted. Draft items and PRs have no issue state and stay.
export function openBoardItems(board: BoardItem[], openNumbers: Set<number>): BoardItem[] {
  return board.filter((item) => item.number === null || item.type === 'PullRequest' || openNumbers.has(item.number));
}

export function isGreenForReview(pr: Pr): boolean {
  return !pr.isDraft && pr.ci === 'green';
}

// A PR waits for Peter when it is non-draft and green, or when it carries the ready-to-merge label.
export function waitsForPeter(pr: Pr): boolean {
  return isGreenForReview(pr) || (pr.prLabels ?? []).includes('ready-to-merge');
}

// The issue numbers named in a "Depends on" section (any heading level, "##" or "###"). "None" and a missing section give an empty list.
export function dependsOn(body: string | null | undefined): number[] {
  const text = normalize(body);
  if (text === null) {
    return [];
  }
  const found = new Set<number>();
  for (const line of sectionLines(text, /^depends on\b/i)) {
    for (const match of line.matchAll(/#(\d+)/g)) {
      found.add(Number(match[1]));
    }
  }
  return [...found];
}

export function computeNeedsYou(prs: Pr[], issues: Issue[]): NeedsYouItem[] {
  const items: NeedsYouItem[] = [];
  const open = new Set(issues.map((issue) => issue.number));
  for (const pr of prs.filter(waitsForPeter)) {
    items.push({
      kind: 'pr-green',
      number: pr.number,
      title: pr.title,
      url: pr.url,
      labels: issueLabelsFor(pr, issues),
      summary: pr.summary || (issues.find((candidate) => candidate.number === pr.issueNumber)?.summary ?? ''),
    });
  }
  for (const issue of issues) {
    // A blocked issue waits for Peter only when none of the issues it depends on is still open.
    const waiting = (issue.dependsOn ?? []).some((n) => open.has(n));
    if (issue.labels.includes('blocked') && !waiting) {
      items.push(issueItem('blocked', issue));
    }
    if (issue.labels.includes('ready-for-human')) {
      items.push(issueItem('ready-for-human', issue));
    }
  }
  return items;
}

function issueItem(kind: NeedsYouItem['kind'], issue: Issue): NeedsYouItem {
  return {
    kind,
    number: issue.number,
    title: issue.title,
    url: issue.url,
    labels: issue.labels,
    summary: issue.summary ?? '',
  };
}

// A PR carries the area of the issue it closes, so the area filter applies to it.
function issueLabelsFor(pr: Pr, issues: Issue[]): string[] {
  const issue = issues.find((candidate) => candidate.number === pr.issueNumber);
  return issue ? issue.labels : [];
}

export interface DriftInput {
  board: BoardItem[];
  openIssues: Issue[];
  closedIssues: Issue[];
  prs: Pr[];
  worktrees: Worktree[];
}

export function computeDrift(input: DriftInput): DriftItem[] {
  return [
    ...inReviewWithoutPr(input),
    ...inProgressWithoutWork(input),
    ...closedNotDone(input),
    ...openWithoutStatus(input),
    ...worktreeOfClosedIssue(input),
  ];
}

function boardIssues(board: BoardItem[]): BoardItem[] {
  return board.filter((item) => item.number !== null && item.type !== 'PullRequest');
}

function inReviewWithoutPr(input: DriftInput): DriftItem[] {
  const prIssues = new Set(input.prs.map((pr) => pr.issueNumber));
  return boardIssues(input.board)
    .filter((item) => item.status === 'In review' && !prIssues.has(item.number))
    .map((item) => boardDrift('in-review-no-pr', item, 'In review, but no open PR is linked'));
}

function inProgressWithoutWork(input: DriftInput): DriftItem[] {
  const prIssues = new Set(input.prs.map((pr) => pr.issueNumber));
  const treeIssues = new Set(input.worktrees.map((tree) => tree.issueNumber));
  return boardIssues(input.board)
    .filter(
      (item) =>
        item.status === 'In progress' && !prIssues.has(item.number) && !treeIssues.has(item.number),
    )
    .map((item) =>
      boardDrift('in-progress-no-work', item, 'In progress, but no worktree and no open PR'),
    );
}

function closedNotDone(input: DriftInput): DriftItem[] {
  const statusByNumber = new Map<number | null, string | null>();
  for (const item of boardIssues(input.board)) {
    statusByNumber.set(item.number, item.status);
  }
  return input.closedIssues
    .filter((issue) => statusByNumber.has(issue.number) && statusByNumber.get(issue.number) !== 'Done')
    .map((issue) =>
      issueDrift(
        'closed-not-done',
        issue,
        `Closed, but the board status is ${statusByNumber.get(issue.number) ?? 'empty'}`,
      ),
    );
}

function openWithoutStatus(input: DriftInput): DriftItem[] {
  const statusByNumber = new Map<number | null, string | null>();
  for (const item of boardIssues(input.board)) {
    statusByNumber.set(item.number, item.status);
  }
  return input.openIssues
    .filter((issue) => !statusByNumber.has(issue.number) || !statusByNumber.get(issue.number))
    .map((issue) =>
      issueDrift(
        'open-no-status',
        issue,
        statusByNumber.has(issue.number) ? 'Open, on the board with no status' : 'Open, not on the board',
      ),
    );
}

function worktreeOfClosedIssue(input: DriftInput): DriftItem[] {
  const closed = new Map(input.closedIssues.map((issue) => [issue.number, issue]));
  const items: DriftItem[] = [];
  for (const tree of input.worktrees) {
    const issue = tree.issueNumber === null ? undefined : closed.get(tree.issueNumber);
    if (issue) {
      items.push(issueDrift('worktree-closed-issue', issue, `Worktree ${tree.path} is still present`));
    }
  }
  return items;
}

function boardDrift(rule: string, item: BoardItem, detail: string): DriftItem {
  return {
    rule,
    number: item.number,
    title: item.title,
    url: item.url,
    detail,
    labels: item.labels,
  };
}

function issueDrift(rule: string, issue: Issue, detail: string): DriftItem {
  return {
    rule,
    number: issue.number,
    title: issue.title,
    url: issue.url,
    detail,
    labels: issue.labels,
  };
}

export interface Run {
  databaseId: number;
  workflowName: string;
  headBranch: string;
  status: string;
  conclusion: string;
  url: string;
  createdAt: string;
  // When the run last changed. For a finished run this is when it ended.
  updatedAt?: string;
  // The commit the run was for. Only the deploy runs are read for it.
  headSha?: string;
}

export function splitRuns(runs: Run[]): { ci: Run[]; deploy: Run[] } {
  const isDeploy = (run: Run): boolean => /deploy/i.test(run.workflowName);
  return { ci: runs.filter((run) => !isDeploy(run)), deploy: runs.filter(isDeploy) };
}

// Normalise `gh project item-list` output into BoardItem.
export function parseBoardItems(raw: unknown): BoardItem[] {
  const items = (raw as { items?: unknown[] } | null)?.items ?? [];
  return items.map((entry) => {
    const item = entry as {
      status?: string;
      title?: string;
      labels?: string[];
      content?: { number?: number; type?: string; url?: string; title?: string };
    };
    return {
      number: item.content?.number ?? null,
      title: item.content?.title ?? item.title ?? '',
      status: item.status ?? null,
      type: item.content?.type ?? 'DraftIssue',
      url: item.content?.url ?? null,
      labels: item.labels ?? [],
    };
  });
}

export const DEFAULT_PORT = 4317;

// Accept only an integer from 1 to 65535. Anything else falls back to the default.
export function parsePort(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) {
    return DEFAULT_PORT;
  }
  const value = Number(raw.trim());
  return value >= 1 && value <= 65535 ? value : DEFAULT_PORT;
}

export const FRIENDLY_HOST = 'gg-tech-dashboard.localhost';

// Blocks DNS rebinding: only the loopback names and the friendly name, each with our own
// port, may talk to the server.
export function isAllowedHost(host: string | undefined, port: number): boolean {
  return (
    host === `127.0.0.1:${port}` ||
    host === `localhost:${port}` ||
    host === `${FRIENDLY_HOST}:${port}`
  );
}

export interface SourceStatus {
  ok: boolean;
  error?: string;
  // The optional business.json is not there. Not an error.
  missing?: boolean;
}

// Names of the sources, among `names`, that did not load. A missing source counts as failed.
export function failedSources(sources: Record<string, SourceStatus>, names: string[]): string[] {
  return names.filter((name) => sources[name]?.ok !== true);
}

export interface BoardTruncation {
  shown: number;
  total: number;
}

// `gh project item-list` reports `totalCount`. When it is larger than the items returned, the board is cut.
export function boardTruncation(raw: unknown): BoardTruncation | null {
  const data = raw as { items?: unknown[]; totalCount?: unknown } | null;
  const shown = data?.items?.length ?? 0;
  const total = data?.totalCount;
  if (typeof total !== 'number' || total === shown) {
    return null;
  }
  return { shown, total };
}

export type ReviewAction = 'close' | 'decide' | 'rewrite' | 'keep';
export type RowAction = ReviewAction | 'not-reviewed';

export interface Review {
  number: number;
  action: ReviewAction;
  recommendation: string;
  why: string;
}

export interface BacklogReviewFile {
  reviewedAt: string;
  reviews: Review[];
}

export interface BacklogRow {
  number: number;
  title: string;
  url: string;
  action: RowAction;
  recommendation: string;
  why: string;
  summary: string;
}

export interface BacklogReview {
  reviewedAt: string;
  rows: BacklogRow[];
  dropped: number;
}

const REVIEW_ACTIONS: string[] = ['close', 'decide', 'rewrite', 'keep'];
// Sort order for the rows: the first action is the one Peter should look at first.
const ACTION_ORDER: RowAction[] = ['close', 'decide', 'rewrite', 'not-reviewed', 'keep'];
export const NOT_REVIEWED = 'Not reviewed';

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

// Checks the shape of backlog-review.json. Throws with a plain reason when it is wrong.
export function parseBacklogReviews(raw: unknown): BacklogReviewFile {
  const data = raw as { reviewedAt?: unknown; reviews?: unknown } | null;
  if (!data || !isText(data.reviewedAt) || !/^\d{4}-\d{2}-\d{2}$/.test(data.reviewedAt) || Number.isNaN(Date.parse(data.reviewedAt))) {
    throw new Error('reviewedAt must be a date like 2026-11-15');
  }
  if (!Array.isArray(data.reviews)) {
    throw new Error('reviews must be a list');
  }
  const seen = new Set<number>();
  const reviews = data.reviews.map((entry: unknown, index: number): Review => {
    const item = entry as Partial<Record<keyof Review, unknown>> | null;
    const where = `reviews[${index}]`;
    if (!item || typeof item.number !== 'number' || !Number.isInteger(item.number) || item.number < 1) {
      throw new Error(`${where}: number must be a positive integer`);
    }
    if (seen.has(item.number)) {
      throw new Error(`${where}: #${item.number} is listed twice`);
    }
    seen.add(item.number);
    if (typeof item.action !== 'string' || !REVIEW_ACTIONS.includes(item.action)) {
      throw new Error(`${where}: action must be one of ${REVIEW_ACTIONS.join(', ')}`);
    }
    if (!isText(item.recommendation) || !isText(item.why)) {
      throw new Error(`${where}: recommendation and why must be text`);
    }
    return {
      number: item.number,
      action: item.action as ReviewAction,
      recommendation: item.recommendation,
      why: item.why,
    };
  });
  return { reviewedAt: data.reviewedAt, reviews };
}

// Joins the reviews with the live open issues. Reviews for closed issues are dropped and counted.
export function joinBacklogReview(file: BacklogReviewFile, openIssues: Issue[]): BacklogReview {
  const byNumber = new Map(file.reviews.map((review) => [review.number, review]));
  const rows: BacklogRow[] = openIssues.map((issue) => {
    const review = byNumber.get(issue.number);
    return {
      number: issue.number,
      title: issue.title,
      url: issue.url,
      action: review ? review.action : 'not-reviewed',
      recommendation: review ? review.recommendation : NOT_REVIEWED,
      why: review ? review.why : 'No review has been written for this issue yet.',
      summary: issue.summary ?? '',
    };
  });
  rows.sort((a, b) => ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action) || a.number - b.number);
  const openNumbers = new Set(openIssues.map((issue) => issue.number));
  const dropped = file.reviews.filter((review) => !openNumbers.has(review.number)).length;
  return { reviewedAt: file.reviewedAt, rows, dropped };
}

// ---- Business tab ----

export interface BusinessDecision {
  question: string;
  options: string[];
  recommendation: string | null;
  decided: string | null;
  owner: string;
  date: string;
}

export interface BusinessStep {
  owner: string;
  task: string;
  due: string | null;
  done: boolean;
}

export interface BusinessCostLine {
  service: string;
  monthly: number | null;
}

export interface BusinessLink {
  label: string;
  url: string;
}

export interface BusinessFile {
  updatedAt: string;
  users: { count: number | null; date: string | null };
  costs: BusinessCostLine[];
  decisions: BusinessDecision[];
  nextSteps: BusinessStep[];
  links: BusinessLink[];
  nextSync: string | null;
}

export interface BusinessStepView extends BusinessStep {
  overdue: boolean;
}

export interface BusinessView {
  updatedAt: string;
  users: { count: number | null; date: string | null };
  costs: BusinessCostLine[];
  // Sum of the lines that are set. Null when no line is set.
  costTotal: number | null;
  costUnset: number;
  openDecisions: BusinessDecision[];
  decidedDecisions: BusinessDecision[];
  stepsByOwner: { owner: string; steps: BusinessStepView[] }[];
  overdueCount: number;
  links: BusinessLink[];
  nextSync: string | null;
}

const MAX_MONTHLY = 1e9;

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  // Round trip: 2026-02-31 would roll over to March, so it does not come back the same.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function optionalDate(value: unknown, where: string): string | null {
  if (value === undefined) {
    throw new Error(`${where} must be present (use null when unknown)`);
  }
  if (value === null) {
    return null;
  }
  if (!isIsoDate(value)) {
    throw new Error(`${where} must be a date like 2026-11-17, or null`);
  }
  return value;
}

function optionalText(value: unknown, where: string): string | null {
  if (value === undefined) {
    throw new Error(`${where} must be present (use null when unknown)`);
  }
  if (value === null) {
    return null;
  }
  if (!isText(value)) {
    throw new Error(`${where} must be text, or null`);
  }
  return value;
}

function listOf<T>(value: unknown, where: string, build: (item: Record<string, unknown>, at: string) => T): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${where} must be a list`);
  }
  return value.map((entry: unknown, index: number) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`${where}[${index}] must be an object`);
    }
    return build(entry as Record<string, unknown>, `${where}[${index}]`);
  });
}

// Checks the shape of business.json. Throws with a plain reason when it is wrong. Unknown numbers are null.
export function parseBusiness(raw: unknown): BusinessFile {
  const data = raw as Record<string, unknown> | null;
  if (!data || typeof data !== 'object' || !isIsoDate(data['updatedAt'])) {
    throw new Error('updatedAt must be a date like 2026-11-15');
  }
  const users = data['users'] as Record<string, unknown> | null;
  if (!users || typeof users !== 'object') {
    throw new Error('users must be an object with count and date');
  }
  const count = users['count'];
  if (count !== null && (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)) {
    throw new Error('users.count must be a whole number, or null');
  }
  const costs = listOf(data['costs'], 'costs', (item, at): BusinessCostLine => {
    if (!isText(item['service'])) {
      throw new Error(`${at}: service must be text`);
    }
    const monthly = item['monthly'];
    if (monthly !== null && (typeof monthly !== 'number' || !Number.isFinite(monthly) || monthly < 0 || monthly >= MAX_MONTHLY)) {
      throw new Error(`${at}: monthly must be a number of US dollars, or null`);
    }
    return { service: item['service'], monthly: monthly as number | null };
  });
  const decisions = listOf(data['decisions'], 'decisions', (item, at): BusinessDecision => {
    if (!isText(item['question']) || !isText(item['owner'])) {
      throw new Error(`${at}: question and owner must be text`);
    }
    const options = item['options'];
    if (!Array.isArray(options) || !options.every(isText)) {
      throw new Error(`${at}: options must be a list of text`);
    }
    if (!isIsoDate(item['date'])) {
      throw new Error(`${at}: date must be a date like 2026-11-17`);
    }
    return {
      question: item['question'],
      options: options as string[],
      recommendation: optionalText(item['recommendation'], `${at}: recommendation`),
      decided: optionalText(item['decided'], `${at}: decided`),
      owner: item['owner'],
      date: item['date'],
    };
  });
  const nextSteps = listOf(data['nextSteps'], 'nextSteps', (item, at): BusinessStep => {
    if (!isText(item['owner']) || !isText(item['task'])) {
      throw new Error(`${at}: owner and task must be text`);
    }
    if (typeof item['done'] !== 'boolean') {
      throw new Error(`${at}: done must be true or false`);
    }
    return {
      owner: item['owner'],
      task: item['task'],
      due: optionalDate(item['due'], `${at}: due`),
      done: item['done'],
    };
  });
  // links is optional. Missing means none. Each url must be https.
  const links = listOf(data['links'] === undefined ? [] : data['links'], 'links', (item, at): BusinessLink => {
    if (!isText(item['label'])) {
      throw new Error(`${at}: label must be text`);
    }
    const url = item['url'];
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      throw new Error(`${at}: url must start with https://`);
    }
    return { label: item['label'], url };
  });
  return {
    updatedAt: data['updatedAt'],
    users: { count: count as number | null, date: optionalDate(users['date'], 'users.date') },
    costs,
    decisions,
    nextSteps,
    links,
    nextSync: optionalDate(data['nextSync'], 'nextSync'),
  };
}

// Today as a local YYYY-MM-DD, so it compares as text with the dates in the file.
export function localDay(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// A step is overdue when it is not done and its due date is before today. No due date is never overdue.
export function isOverdue(step: BusinessStep, today: string): boolean {
  return !step.done && step.due !== null && step.due < today;
}

export function costTotal(costs: BusinessCostLine[]): { total: number | null; unset: number } {
  const known = costs.filter((line) => line.monthly !== null);
  const total = known.length === 0 ? null : known.reduce((sum, line) => sum + (line.monthly as number), 0);
  return { total, unset: costs.length - known.length };
}

// Open decisions first, steps grouped by owner with overdue first, and the cost total.
export function buildBusiness(file: BusinessFile, now: Date): BusinessView {
  const today = localDay(now);
  const cost = costTotal(file.costs);
  const owners: string[] = [];
  for (const step of file.nextSteps) {
    if (!owners.includes(step.owner)) {
      owners.push(step.owner);
    }
  }
  const stepsByOwner = owners.map((owner) => {
    const steps = file.nextSteps
      .filter((step) => step.owner === owner)
      .map((step): BusinessStepView => ({ ...step, overdue: isOverdue(step, today) }));
    // Overdue first, then open, then done. Sort is stable, so the file order is kept inside each group.
    const rank = (step: BusinessStepView): number => (step.overdue ? 0 : step.done ? 2 : 1);
    steps.sort((a, b) => rank(a) - rank(b));
    return { owner, steps };
  });
  return {
    updatedAt: file.updatedAt,
    users: file.users,
    costs: file.costs,
    costTotal: cost.total,
    costUnset: cost.unset,
    openDecisions: file.decisions.filter((d) => d.decided === null),
    decidedDecisions: file.decisions.filter((d) => d.decided !== null),
    stepsByOwner,
    overdueCount: stepsByOwner.reduce((sum, group) => sum + group.steps.filter((s) => s.overdue).length, 0),
    links: file.links,
    nextSync: file.nextSync,
  };
}

// ---- Product tab ----

export interface FeatureFlag {
  name: string;
  state: 'On' | 'Off' | 'Not set';
}

const FLAG_NAME = /^(?:EXPO_PUBLIC_)?FEATURE_/;
const ON_VALUES = ['true', '1', 'on', 'yes'];
const OFF_VALUES = ['false', '0', 'off', 'no'];

// Input is `gh variable list --json name,value`. Only FEATURE_* and EXPO_PUBLIC_FEATURE_* are kept,
// so nothing else (and no secret) can reach the page. Unknown or empty values show as Not set.
export function parseFeatureFlags(raw: unknown): FeatureFlag[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const flags: FeatureFlag[] = [];
  for (const entry of raw) {
    const item = entry as { name?: unknown; value?: unknown } | null;
    if (typeof item?.name !== 'string' || !FLAG_NAME.test(item.name)) {
      continue;
    }
    const value = typeof item.value === 'string' ? item.value.trim().toLowerCase() : '';
    let state: FeatureFlag['state'] = 'Not set';
    if (ON_VALUES.includes(value)) {
      state = 'On';
    } else if (OFF_VALUES.includes(value)) {
      state = 'Off';
    }
    flags.push({ name: item.name, state });
  }
  return flags.sort((a, b) => a.name.localeCompare(b.name));
}

export interface MergedPr {
  number: number;
  title: string;
  url: string;
  mergedAt: string;
  createdAt?: string;
  body?: string;
  headRefName?: string;
}

export const SUMMARY_MAX = 140;

// Code spans are kept whole: their text is set aside, the rest is stripped, then the text comes back.
function stripMarkdown(text: string): string {
  const code: string[] = [];
  const held = text.replace(/`([^`]*)`/g, (_match, inner: string) => {
    code.push(inner);
    return `\u0000${code.length - 1}\u0000`;
  });
  const stripped = held
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*]+?)(?<=\S)\*(?![\w*])/g, '$1$2')
    .replace(/(^|[^\w_])_(?=\S)([^_]+?)(?<=\S)_(?![\w_])/g, '$1$2')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '$1')
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*\[[ xX]\]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => code[Number(index)] ?? '');
}

// Cuts at the last word boundary that leaves room for the ellipsis.
function capSummary(text: string): string {
  if (text.length <= SUMMARY_MAX) {
    return text;
  }
  const room = text.slice(0, SUMMARY_MAX - 1);
  const space = room.lastIndexOf(' ');
  const cut = space > SUMMARY_MAX / 2 ? room.slice(0, space) : room;
  return cut.trimEnd() + '…';
}

const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+/;
const ISSUE_LINK_LINE = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|part of)\s+#\d+\b/i;
const ISSUE_REF_LINE = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?(?:#\d+[\s,;]*(?:and\s+)?)+$/i;

interface UsableLine {
  text: string;
  bullet: boolean;
}

// The lines worth reading: no headings, quotes, fenced code, comments, or lines that only link an issue.
function usableLines(lines: string[]): UsableLine[] {
  const out: UsableLine[] = [];
  let fenced = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(```|~~~)/.test(trimmed)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || trimmed === '' || /^#{1,6}\s/.test(trimmed) || trimmed.startsWith('>')) {
      continue;
    }
    if (ISSUE_LINK_LINE.test(line) || ISSUE_REF_LINE.test(line)) {
      continue;
    }
    const text = stripMarkdown(line.replace(BULLET, ''));
    if (text !== '') {
      out.push({ text, bullet: BULLET.test(line) });
    }
  }
  return out;
}

function firstSentence(text: string): string {
  const match = /^.*?[.!?](?=\s|$)/.exec(text);
  return match ? match[0] : text;
}

// The lines under the first heading that matches, up to the next heading. Empty when none matches.
function sectionLines(body: string, heading: RegExp): string[] {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => /^#{1,6}\s/.test(line.trim()) && heading.test(line.trim().replace(/^#{1,6}\s*/, '')));
  if (start < 0) {
    return [];
  }
  const section: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line.trim())) {
      break;
    }
    section.push(line);
  }
  return section;
}

function normalize(body: string | null | undefined): string | null {
  if (typeof body !== 'string') {
    return null;
  }
  return body.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
}

// A lead-in is a plain line that ends with a colon and only introduces what follows.
function skipLeadIn(lines: UsableLine[]): UsableLine | undefined {
  const first = lines[0];
  if (first && !first.bullet && first.text.endsWith(':') && lines.length > 1) {
    return lines[1];
  }
  return first;
}

function oneLine(line: UsableLine | undefined): string {
  return line ? capSummary(firstSentence(line.text)) : '';
}

// One line for the dashboard: the first bullet or sentence under "## What", else the first usable
// line. Never a heading, a quote, code, or a bare "Closes #N". Empty when nothing is left.
export function summarizePr(body: string | null | undefined): string {
  const clean = normalize(body);
  if (clean === null) {
    return '';
  }
  const what = skipLeadIn(usableLines(sectionLines(clean, /^what\b/i)));
  if (what) {
    return oneLine(what);
  }
  return oneLine(usableLines(clean.split('\n'))[0]);
}

const ISSUE_LEAD_IN = /^(?:rewritten|split from)\b/i;

// One line for an issue: the first sentence of "### Context" (not a "Rewritten ..." or "Split from ..."
// lead-in), else the first acceptance criterion, else the first usable line.
export function summarizeIssue(body: string | null | undefined): string {
  const clean = normalize(body);
  if (clean === null) {
    return '';
  }
  const context = usableLines(sectionLines(clean, /^context\b/i));
  const candidates = context.length > 1 && !context[0]?.bullet && context[0]?.text.endsWith(':') ? context.slice(1) : context;
  for (const line of candidates) {
    const sentences = line.text.split(/(?<=[.!?])\s+/);
    const found = sentences.find((sentence) => !ISSUE_LEAD_IN.test(sentence));
    if (found) {
      return capSummary(found);
    }
  }
  const criteria = usableLines(sectionLines(clean, /^acceptance/i)).find((line) => line.bullet);
  if (criteria) {
    return capSummary(firstSentence(criteria.text));
  }
  return oneLine(usableLines(clean.split('\n'))[0]);
}

// A merged PR as the page sees it: a summary and an area, never the full body.
export interface ShippedPr {
  number: number;
  title: string;
  url: string;
  mergedAt: string;
  summary: string;
  area: string;
}

// The summary falls back to the linked issue's summary when the PR body has nothing else.
export function toShippedPr(
  pr: MergedPr,
  labelsFor: (issue: number | null) => string[],
  issueSummaryFor: (issue: number | null) => string = () => '',
): ShippedPr {
  const issue = issueFromPr(pr.body, pr.headRefName ?? '');
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    mergedAt: pr.mergedAt,
    summary: summarizePr(pr.body) || issueSummaryFor(issue),
    area: areaOf(labelsFor(issue)),
  };
}

// PRs merged per day for the 7 days up to now, oldest first. A PR exactly 7 days old is kept, like
// shippedThisWeek, so the buckets always add up to the shipped count.
export function shippedPerDay(shipped: { mergedAt: string }[], now: Date): number[] {
  const days = new Array<number>(SHIPPED_WINDOW_DAYS).fill(0);
  for (const pr of shipped) {
    const age = now.getTime() - Date.parse(pr.mergedAt);
    if (Number.isNaN(age) || age < 0 || age > SHIPPED_WINDOW_DAYS * DAY_MS) {
      continue;
    }
    const slot = SHIPPED_WINDOW_DAYS - 1 - Math.min(Math.floor(age / DAY_MS), SHIPPED_WINDOW_DAYS - 1);
    days[slot] = (days[slot] ?? 0) + 1;
  }
  return days;
}

// "Last 24 h", "1 day ago" ... for a sparkline point `ago` days before the newest one.
export function dayAgoLabel(ago: number): string {
  if (ago === 0) {
    return 'Last 24 h';
  }
  return ago === 1 ? '1 day ago' : `${ago} days ago`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const SHIPPED_WINDOW_DAYS = 7;

// The merged-PR query covers this many days: 4 weeks for Throughput.
export const THROUGHPUT_WEEKS = 4;
export const MERGED_WINDOW_DAYS = THROUGHPUT_WEEKS * 7;

export const MERGED_PR_LIMIT = 500;

// The `gh pr list --search` date for the window start (UTC, YYYY-MM-DD).
export function shippedSearchDate(now: Date, days: number = SHIPPED_WINDOW_DAYS): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10);
}

// The `gh pr list --search` date for the full merged-PR window (Shipped uses the last 7 days of it).
export function mergedSearchDate(now: Date): string {
  return shippedSearchDate(now, MERGED_WINDOW_DAYS);
}

export function shippedMayBeCutOff(rowCount: number): boolean {
  return rowCount >= MERGED_PR_LIMIT;
}

export function shippedThisWeek(prs: MergedPr[], now: Date): MergedPr[] {
  const cutoff = now.getTime() - SHIPPED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return prs
    .filter((pr) => {
      if (typeof pr.title !== 'string') {
        return false;
      }
      const merged = Date.parse(pr.mergedAt);
      return !Number.isNaN(merged) && merged >= cutoff && merged <= now.getTime();
    })
    .sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt));
}

export interface LaunchBlocker {
  number: number;
  title: string;
  url: string;
  status: string;
  labels: string[];
  summary: string;
}

export function isLaunchBlocker(issue: Issue): boolean {
  return issue.labels.includes('launch-blocker') || issue.title.toLowerCase().includes('[launch roadmap]');
}

function statusByNumber(board: BoardItem[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const item of board) {
    if (item.number !== null) {
      map.set(item.number, item.status ?? NO_STATUS);
    }
  }
  return map;
}

export function computeLaunchBlockers(openIssues: Issue[], board: BoardItem[]): LaunchBlocker[] {
  const statuses = statusByNumber(board);
  return openIssues
    .filter(isLaunchBlocker)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      url: issue.url,
      status: statuses.get(issue.number) ?? NO_STATUS,
      labels: issue.labels,
      summary: issue.summary ?? '',
    }))
    .sort((a, b) => a.number - b.number);
}

export const ROADMAP_STATUSES = ['Ready', 'In progress', 'Blocked', 'Backlog'];
export const ROADMAP_OTHER = 'Other';

export interface RoadmapRow {
  area: string;
  counts: Record<string, number>;
  total: number;
}

// Open issues by area and board status. In review, Done and no status are counted as Other.
export function computeRoadmap(openIssues: Issue[], board: BoardItem[]): RoadmapRow[] {
  const statuses = statusByNumber(board);
  const rows = new Map<string, RoadmapRow>();
  for (const issue of openIssues) {
    const area = areaOf(issue.labels);
    let row = rows.get(area);
    if (!row) {
      row = { area, counts: {}, total: 0 };
      for (const status of [...ROADMAP_STATUSES, ROADMAP_OTHER]) {
        row.counts[status] = 0;
      }
      rows.set(area, row);
    }
    const status = statuses.get(issue.number) ?? NO_STATUS;
    const column = ROADMAP_STATUSES.includes(status) ? status : ROADMAP_OTHER;
    row.counts[column] = (row.counts[column] ?? 0) + 1;
    row.total += 1;
  }
  const order = listAreas([...rows.keys()].map((area) => (area === NO_AREA ? [] : [`area:${area}`])));
  return order.map((area) => rows.get(area) as RoadmapRow);
}

export interface StackSegment {
  name: string;
  value: number;
}

export interface RoadmapStack {
  area: string;
  total: number;
  segments: StackSegment[];
}

// One stacked bar per area, segments in the fixed status order (zero segments kept so the order never moves).
export function roadmapStacks(rows: RoadmapRow[]): RoadmapStack[] {
  return rows.map((row) => ({
    area: row.area,
    total: row.total,
    segments: [...ROADMAP_STATUSES, ROADMAP_OTHER].map((name) => ({ name, value: row.counts[name] ?? 0 })),
  }));
}

export interface ProductKpis {
  launchBlockers: number | null;
  shipped: number;
  flagsOn: number;
  flagsTotal: number;
  openIssues: number | null;
  perDay: { label: string; count: number }[];
}

export function computeProductKpis(input: {
  launchBlockers: LaunchBlocker[] | null;
  shipped: { mergedAt: string }[];
  flags: FeatureFlag[];
  openIssueCount: number | null;
  now: Date;
}): ProductKpis {
  return {
    launchBlockers: input.launchBlockers === null ? null : input.launchBlockers.length,
    shipped: input.shipped.length,
    flagsOn: input.flags.filter((flag) => flag.state === 'On').length,
    flagsTotal: input.flags.length,
    openIssues: input.openIssueCount,
    perDay: shippedPerDay(input.shipped, input.now).map((count, index, all) => ({
      label: dayAgoLabel(all.length - 1 - index),
      count,
    })),
  };
}

export interface ProductInput {
  sources: Record<string, SourceStatus>;
  flags: FeatureFlag[];
  mergedPrs: MergedPr[];
  openIssues: Issue[];
  board: BoardItem[];
  labelsFor: (issue: number | null) => string[];
  issueSummaryFor: (issue: number | null) => string;
  milestones: Milestone[];
  now: Date;
}

// Everything the Product tab shows. Only summaries are sent: no PR or issue body is in the result.
export function buildProduct(input: ProductInput) {
  const blockedBy = failedSources(input.sources, ['board', 'openIssues']);
  const shipped = shippedThisWeek(input.mergedPrs, input.now).map((pr) =>
    toShippedPr(pr, input.labelsFor, input.issueSummaryFor),
  );
  const launchBlockers = blockedBy.length > 0 ? null : computeLaunchBlockers(input.openIssues, input.board);
  const roadmap = blockedBy.length > 0 ? null : computeRoadmap(input.openIssues, input.board);
  return {
    flags: input.flags,
    shipped,
    shippedMayBeCutOff: shippedMayBeCutOff(input.mergedPrs.length),
    kpis: computeProductKpis({
      launchBlockers,
      shipped,
      flags: input.flags,
      openIssueCount: input.sources['openIssues']?.ok ? input.openIssues.length : null,
      now: input.now,
    }),
    launchBlockers,
    roadmap,
    roadmapStacks: roadmap === null ? null : roadmapStacks(roadmap),
    milestones: input.sources['milestones']?.ok ? buildMilestones(input.milestones, input.now) : null,
    issueRows: input.sources['openIssues']?.ok ? buildIssueRows(input.openIssues, input.board, !!input.sources['board']?.ok) : null,
    blockedBy,
  };
}

export interface Milestone {
  title: string;
  url: string;
  dueOn: string | null;
  open: number;
  closed: number;
}

// Reads `gh api repos/.../milestones` (REST). A reply that is not a list is an error, not an empty list.
export function parseMilestones(raw: unknown): Milestone[] {
  if (!Array.isArray(raw)) {
    throw new Error('Milestones reply was not a list');
  }
  return raw.map((entry) => {
    const m = entry as { title?: string; html_url?: string; due_on?: string | null; open_issues?: number; closed_issues?: number };
    return {
      title: String(m.title ?? ''),
      url: String(m.html_url ?? ''),
      dueOn: typeof m.due_on === 'string' ? m.due_on.slice(0, 10) : null,
      open: Number(m.open_issues ?? 0),
      closed: Number(m.closed_issues ?? 0),
    };
  });
}

export interface MilestoneView {
  title: string;
  url: string;
  dueDate: string | null;
  daysLeft: number | null;
  done: number;
  total: number;
  percent: number;
}

// Today's date in America/Chicago. A milestone's due_on is a UTC time (about 07:00), so its UTC date is compared with this.
function chicagoDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(now);
}

function dayNumber(isoDate: string): number {
  return Math.floor(Date.parse(isoDate.slice(0, 10) + 'T00:00:00Z') / DAY_MS);
}

// Days from today (local date) to the due date. Negative means late. Soonest due date first, no date last.
export function buildMilestones(list: Milestone[], now: Date): MilestoneView[] {
  const views = list.map((m) => {
    const total = m.open + m.closed;
    return {
      title: m.title,
      url: m.url,
      dueDate: m.dueOn,
      daysLeft: m.dueOn === null ? null : dayNumber(m.dueOn) - dayNumber(chicagoDay(now)),
      done: m.closed,
      total,
      percent: total === 0 ? 0 : Math.round((100 * m.closed) / total),
    };
  });
  return views.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
}

export interface IssueRow {
  number: number;
  title: string;
  url: string;
  owner: string;
  state: string;
  priority: string;
}

const PRIORITY_ORDER = ['high', 'medium', 'low'];

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Open issues for the Product table: assignee (else Unassigned), board status and the priority:* label.
// If the board did not load, the state is Unknown (the rest of the row is still right).
export function buildIssueRows(openIssues: Issue[], board: BoardItem[], boardLoaded: boolean): IssueRow[] {
  const statuses = statusByNumber(board);
  const rank = (row: IssueRow): number => {
    const found = PRIORITY_ORDER.indexOf(row.priority.toLowerCase());
    return found < 0 ? PRIORITY_ORDER.length : found;
  };
  return openIssues
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      url: issue.url,
      owner: issue.assignee || 'Unassigned',
      state: boardLoaded ? (statuses.get(issue.number) ?? NO_STATUS) : 'Unknown',
      priority: capitalize(issue.labels.find((label) => label.startsWith('priority:'))?.slice('priority:'.length) ?? 'not set'),
    }))
    .sort((a, b) => rank(a) - rank(b) || a.number - b.number);
}

export const CI_HEALTH_RUNS = 30;
export const DEPLOY_SHOWN = 5;
// The deploy run list is limited to the last 8 weeks by date (the deploys-per-week bars and the lead time read all of them;
// "last good deploy" looks at the same runs). This is the safety cap: a list that reaches it may be cut off. About 410 runs in 8 weeks in November 2026.
export const DEPLOY_FETCHED = 500;
// Days of deploy runs fetched (8 weeks).
export const DEPLOY_FETCH_DAYS = 56;

export interface CiHealth {
  passed: number;
  failed: number;
  counted: number;
  ignored: number;
  passPercent: number | null;
  lastFailure: Run | null;
  // The runs as marks for the run strip, oldest first.
  strip: RunMark[];
}

export type RunResult = 'pass' | 'fail' | 'ignored';

export interface RunMark {
  id: number;
  result: RunResult;
  // Plain words for the tooltip and the table view: "Passed", "Failed (timed_out)", "Ignored (cancelled)".
  text: string;
  url: string;
  createdAt: string;
}

// Same rule as the pass rate: cancelled and unfinished runs are ignored, any other finished run that did not succeed failed.
export function computeRunStrip(runs: Run[]): RunMark[] {
  // A run with a bad date goes first, so the sort stays stable and the rest keep their order.
  const time = (run: Run): number => {
    const t = Date.parse(run.createdAt);
    return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
  };
  return [...runs]
    .sort((a, b) => (time(a) === time(b) ? 0 : time(a) < time(b) ? -1 : 1))
    .map((run): RunMark => {
      const mark = { id: run.databaseId, url: run.url, createdAt: run.createdAt };
      if (run.status !== 'completed') {
        return { ...mark, result: 'ignored', text: `Ignored (${run.status})` };
      }
      if (run.conclusion === 'cancelled') {
        return { ...mark, result: 'ignored', text: 'Ignored (cancelled)' };
      }
      if (run.conclusion === 'success') {
        return { ...mark, result: 'pass', text: 'Passed' };
      }
      return { ...mark, result: 'fail', text: `Failed (${run.conclusion || 'no conclusion'})` };
    });
}

// Cancelled and unfinished runs are ignored. Every other finished run that did not succeed counts as a failure.
export function computeCiHealth(runs: Run[]): CiHealth {
  const counted = runs.filter((run) => run.status === 'completed' && run.conclusion !== 'cancelled');
  const passed = counted.filter((run) => run.conclusion === 'success').length;
  const failures = counted
    .filter((run) => run.conclusion !== 'success')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return {
    passed,
    failed: failures.length,
    counted: counted.length,
    ignored: runs.length - counted.length,
    passPercent: counted.length === 0 ? null : Math.round((passed / counted.length) * 100),
    lastFailure: failures[0] ?? null,
    strip: computeRunStrip(runs),
  };
}

export function isFlakyIssue(issue: Issue): boolean {
  const title = issue.title.toLowerCase();
  if (title.includes('flaky')) {
    return true;
  }
  return issue.labels.includes('tests') && (title.includes('retry') || title.includes('times out'));
}

export function flakyIssues(issues: Issue[]): Issue[] {
  return issues.filter(isFlakyIssue).sort((a, b) => a.number - b.number);
}

export interface DeploySummary {
  recent: Run[];
  lastGood: Run | null;
  hoursSinceGood: number | null;
  // Time since the last good deploy STARTED (the run's createdAt). Never "null".
  sinceGoodText: string;
}

// "5 minutes", "1 hour", "6.5 hours". Under 1 hour shows minutes.
export function formatDuration(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    if (minutes < 1) {
      return 'less than 1 minute';
    }
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }
  const rounded = Math.round(hours * 10) / 10;
  return rounded === 1 ? '1 hour' : `${rounded} hours`;
}

export function computeDeploys(runs: Run[], now: Date): DeploySummary {
  const newestFirst = [...runs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const lastGood = newestFirst.find((run) => run.status === 'completed' && run.conclusion === 'success') ?? null;
  const started = lastGood ? Date.parse(lastGood.createdAt) : Number.NaN;
  const hours = Math.max(0, (now.getTime() - started) / (60 * 60 * 1000));
  const hoursSinceGood = lastGood && !Number.isNaN(started) ? hours : null;
  return {
    recent: newestFirst.slice(0, DEPLOY_SHOWN),
    lastGood,
    hoursSinceGood,
    sinceGoodText: hoursSinceGood === null ? 'Unknown' : formatDuration(hoursSinceGood),
  };
}

export interface WeekCount {
  label: string;
  count: number;
}

export interface Throughput {
  weeks: WeekCount[];
  total: number;
  medianHours: number | null;
  medianText: string;
}

export function medianOf(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] as number;
  }
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

function weekLabel(index: number): string {
  if (index === 0) {
    return 'Last 7 days';
  }
  return `${index * 7 + 1} to ${index * 7 + 7} days ago`;
}

// Week 0 is the 7 days up to now; week 3 is the oldest. Same boundary rule as shippedThisWeek:
// a PR merged exactly 7 days ago is in week 0, exactly 28 days ago in week 3. Older, future or bad dates are dropped.
export function computeThroughput(prs: MergedPr[], now: Date): Throughput {
  const counts = new Array<number>(THROUGHPUT_WEEKS).fill(0);
  const hours: number[] = [];
  for (const pr of prs) {
    const merged = Date.parse(pr.mergedAt);
    const age = now.getTime() - merged;
    if (Number.isNaN(merged) || age < 0 || age > MERGED_WINDOW_DAYS * DAY_MS) {
      continue;
    }
    const week = Math.max(0, Math.ceil(age / (7 * DAY_MS)) - 1);
    counts[week] = (counts[week] ?? 0) + 1;
    const opened = Date.parse(pr.createdAt ?? '');
    if (!Number.isNaN(opened) && merged >= opened) {
      hours.push((merged - opened) / (60 * 60 * 1000));
    }
  }
  const median = medianOf(hours);
  return {
    weeks: counts.map((count, index) => ({ label: weekLabel(index), count })),
    total: counts.reduce((sum, count) => sum + count, 0),
    medianHours: median === null ? null : Math.round(median * 10) / 10,
    medianText: median === null ? 'Unknown' : formatDuration(median),
  };
}

export const BOARD_STACK_STATUSES = ['Ready', 'In progress', 'In review', 'Blocked', 'Backlog'];

export interface BoardStack {
  // 'all' or an area name.
  area: string;
  // Issues with a board status in the five segments.
  total: number;
  // Open issues with no board status. They are not in the bar.
  noStatus: number;
  segments: StackSegment[];
}

function stackOf(area: string, items: BoardItem[]): BoardStack {
  const groups = groupByStatus(items);
  const segments = BOARD_STACK_STATUSES.map((name) => ({ name, value: (groups[name] ?? []).length }));
  return {
    area,
    total: segments.reduce((sum, seg) => sum + seg.value, 0),
    noStatus: (groups[NO_STATUS] ?? []).length,
    segments,
  };
}

// One stack for every open board item ('all') and one per area, like roadmapStacks. Done is not in the bar.
export function boardStacks(items: BoardItem[]): BoardStack[] {
  const areas = [...new Set(items.map((item) => areaOf(item.labels)))].sort();
  return [stackOf('all', items), ...areas.map((area) => stackOf(area, items.filter((item) => areaOf(item.labels) === area)))];
}

export interface EngineeringData {
  board: BoardItem[];
  ciMainRuns: Run[];
  openIssues: Issue[];
  deployRuns: Run[];
  mergedPrs: MergedPr[];
}

// Each field is null only when its own source failed.
export function buildEngineering(sources: Record<string, SourceStatus>, data: EngineeringData, now: Date) {
  return {
    ciHealth: sources['ciMain']?.ok ? computeCiHealth(data.ciMainRuns) : null,
    flaky: sources['openIssues']?.ok ? flakyIssues(data.openIssues) : null,
    deploys: sources['deploys']?.ok ? computeDeploys(data.deployRuns, now) : null,
    throughput: sources['mergedPrs']?.ok ? computeThroughput(data.mergedPrs, now) : null,
    // Shipped and Throughput share one merged-PR query, so one limit flag covers both.
    boardStacks: sources['board']?.ok ? boardStacks(data.board) : null,
    throughputMayBeCutOff: shippedMayBeCutOff(data.mergedPrs.length),
  };
}

// ---- Restart (launchd mode only) ----

// ---- Delivery metrics (DORA): Software Factory tab ----

export const DELIVERY_WEEKS = 8;
export const DELIVERY_WINDOW_DAYS = 28;
const HOUR_MS = 60 * 60 * 1000;

export type DoraBand = 'Elite' | 'High' | 'Medium' | 'Low';

// Deploys per day over the window. More than 1 a day is "on demand" (Elite).
export function deployFrequencyBand(perDay: number): DoraBand {
  if (perDay > 1) {
    return 'Elite';
  }
  if (perDay >= 1 / 7) {
    return 'High';
  }
  return perDay >= 1 / 30 ? 'Medium' : 'Low';
}

// Median lead time in hours: under 1 day Elite, up to 1 week High, up to 1 month Medium (30 days), else Low.
export function leadTimeBand(hours: number): DoraBand {
  if (hours < 24) {
    return 'Elite';
  }
  if (hours <= 7 * 24) {
    return 'High';
  }
  return hours <= 30 * 24 ? 'Medium' : 'Low';
}

// "20 minutes", "6.5 hours", "3.2 days". Days from 48 hours up.
export function formatLeadTime(hours: number): string {
  if (hours >= 48) {
    return `${Math.round((hours / 24) * 10) / 10} days`;
  }
  return formatDuration(hours);
}

function isMainDeploy(run: Run): boolean {
  return run.status === 'completed' && run.conclusion === 'success' && run.headBranch === 'main';
}

export interface DeployFrequency {
  // Week 0 is the last 7 days, like Throughput.
  weeks: WeekCount[];
  // Successful deploys in the last 28 days.
  last28: number;
  perWeek: number;
  perWeekText: string;
  band: DoraBand;
  // True when the run list reached its cap.
  mayBeCutOff: boolean;
}

export function computeDeployFrequency(runs: Run[], now: Date): DeployFrequency {
  const counts = new Array<number>(DELIVERY_WEEKS).fill(0);
  let last28 = 0;
  for (const run of runs.filter(isMainDeploy)) {
    const age = now.getTime() - Date.parse(run.createdAt);
    if (Number.isNaN(age) || age < 0 || age > DELIVERY_WEEKS * 7 * DAY_MS) {
      continue;
    }
    const week = Math.max(0, Math.ceil(age / (7 * DAY_MS)) - 1);
    counts[week] = (counts[week] ?? 0) + 1;
    if (age <= DELIVERY_WINDOW_DAYS * DAY_MS) {
      last28 += 1;
    }
  }
  const perWeek = Math.round((last28 / (DELIVERY_WINDOW_DAYS / 7)) * 10) / 10;
  return {
    weeks: counts.map((count, index) => ({ label: weekLabel(index), count })),
    last28,
    perWeek,
    perWeekText: `${perWeek} per week`,
    band: deployFrequencyBand(last28 / DELIVERY_WINDOW_DAYS),
    // The list is already limited to 8 weeks by date, so a full list means runs were left out.
    mayBeCutOff: runs.length >= DEPLOY_FETCHED,
  };
}

// A merged PR with the facts lead time needs. firstCommitAt is the author date of its first commit.
export interface PrLeadInput {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  mergedAt: string;
  mergeSha: string | null;
  firstCommitAt: string | null;
}

export interface LeadTimeRow {
  number: number;
  title: string;
  url: string;
  mergedAt: string;
  // Null when the PR has no first commit time.
  codeHours: number | null;
  reviewHours: number;
  // Null when the PR has no later successful deploy: "Not deployed yet", never 0.
  deployHours: number | null;
  totalHours: number | null;
}

export interface LeadTime {
  rows: LeadTimeRow[];
  deployed: number;
  notDeployed: number;
  // Code: PRs with a first commit time. Review: every merged PR. Deploy and total: deployed PRs only.
  medianCodeHours: number | null;
  medianReviewHours: number | null;
  medianDeployHours: number | null;
  medianTotalHours: number | null;
  band: DoraBand | null;
  // True when the PR search reached its page limit.
  truncated: boolean;
}

function hoursBetween(from: string, to: string): number {
  return Math.max(0, (Date.parse(to) - Date.parse(from)) / HOUR_MS);
}

// The deploy run for a PR: the successful main run for its merge commit, else the first successful run that started after the merge.
// It counts as deployed when the run ends.
function deployFor(pr: PrLeadInput, deploys: Run[]): Run | null {
  const merged = Date.parse(pr.mergedAt);
  const bySha = pr.mergeSha === null ? undefined : deploys.find((run) => run.headSha === pr.mergeSha);
  if (bySha) {
    return bySha;
  }
  const later = deploys.filter((run) => Date.parse(run.createdAt) >= merged);
  later.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return later[0] ?? null;
}

export function computeLeadTime(prs: PrLeadInput[], runs: Run[], now: Date, truncated: boolean = false): LeadTime {
  const deploys = runs.filter(isMainDeploy);
  const rows: LeadTimeRow[] = [];
  for (const pr of prs) {
    const merged = Date.parse(pr.mergedAt);
    const age = now.getTime() - merged;
    if (Number.isNaN(merged) || Number.isNaN(Date.parse(pr.createdAt)) || age < 0 || age > DELIVERY_WINDOW_DAYS * DAY_MS) {
      continue;
    }
    const codeHours = pr.firstCommitAt === null ? null : hoursBetween(pr.firstCommitAt, pr.createdAt);
    const reviewHours = hoursBetween(pr.createdAt, pr.mergedAt);
    const run = deployFor(pr, deploys);
    const deployHours = run === null ? null : hoursBetween(pr.mergedAt, run.updatedAt ?? run.createdAt);
    rows.push({
      number: pr.number,
      title: pr.title,
      url: pr.url,
      mergedAt: pr.mergedAt,
      codeHours,
      reviewHours,
      deployHours,
      // With no first commit time, the total starts when the PR was opened.
      totalHours: deployHours === null ? null : (codeHours ?? 0) + reviewHours + deployHours,
    });
  }
  rows.sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt));
  const deployedRows = rows.filter((row) => row.deployHours !== null);
  const median = (values: number[]): number | null => medianOf(values);
  const total = median(deployedRows.map((row) => row.totalHours as number));
  return {
    rows,
    deployed: deployedRows.length,
    notDeployed: rows.length - deployedRows.length,
    medianCodeHours: median(rows.flatMap((row) => (row.codeHours === null ? [] : [row.codeHours]))),
    medianReviewHours: median(rows.map((row) => row.reviewHours)),
    medianDeployHours: median(deployedRows.map((row) => row.deployHours as number)),
    medianTotalHours: total,
    band: total === null ? null : leadTimeBand(total),
    truncated,
  };
}

export interface CycleTime {
  count: number;
  medianDays: number | null;
  medianText: string;
}

// Issues with the `ticket` label that were closed as completed (not "not planned") in the last 28 days: days from opened to closed.
export function computeCycleTime(closed: Issue[], now: Date): CycleTime {
  const days: number[] = [];
  for (const issue of closed) {
    const opened = Date.parse(issue.createdAt ?? '');
    const done = Date.parse(issue.closedAt ?? '');
    const age = now.getTime() - done;
    if (!issue.labels.includes('ticket') || issue.stateReason !== 'COMPLETED' || Number.isNaN(opened) || Number.isNaN(done) || age < 0 || age > DELIVERY_WINDOW_DAYS * DAY_MS || done < opened) {
      continue;
    }
    days.push((done - opened) / DAY_MS);
  }
  const median = medianOf(days);
  return {
    count: days.length,
    medianDays: median === null ? null : Math.round(median * 10) / 10,
    medianText: median === null ? 'Unknown' : formatLeadTime(median * 24),
  };
}

export interface Wip {
  inProgress: number;
  inReview: number;
  total: number;
}

// Open issues on the board in In progress or In review.
export function computeWip(board: BoardItem[]): Wip {
  const inProgress = board.filter((item) => item.status === 'In progress').length;
  const inReview = board.filter((item) => item.status === 'In review').length;
  return { inProgress, inReview, total: inProgress + inReview };
}

export interface DeliveryData {
  board: BoardItem[];
  closedIssues: Issue[];
  deployRuns: Run[];
  prLeadInputs: PrLeadInput[];
  // The PR search reached its page limit.
  prLeadTruncated: boolean;
}

// Each field is null only when its own sources failed.
export function buildDelivery(sources: Record<string, SourceStatus>, data: DeliveryData, now: Date) {
  const ok = (...names: string[]): boolean => names.every((name) => sources[name]?.ok);
  return {
    deployFrequency: ok('deploys') ? computeDeployFrequency(data.deployRuns, now) : null,
    leadTime: ok('deploys', 'prLeadInputs') ? computeLeadTime(data.prLeadInputs, data.deployRuns, now, data.prLeadTruncated) : null,
    cycleTime: ok('closedIssues') ? computeCycleTime(data.closedIssues, now) : null,
    wip: ok('board') ? computeWip(data.board) : null,
  };
}

export const RESTART_HEADER = 'x-factory-restart';

export interface RestartRequest {
  method: string | undefined;
  host: string | undefined;
  origin: string | undefined;
  restartHeader: string | undefined;
  restartEnabled: boolean;
  port: number;
}

export type RestartDecision = { allowed: true } | { allowed: false; status: number; reason: string };

// Guards POST /api/restart. Every check must pass. The server never sends CORS headers, so a page on
// another origin cannot pass the preflight that the custom header forces.
export function decideRestart(request: RestartRequest): RestartDecision {
  if (request.method !== 'POST') {
    return { allowed: false, status: 405, reason: 'POST only' };
  }
  if (!isAllowedHost(request.host, request.port)) {
    return { allowed: false, status: 403, reason: 'Host not allowed' };
  }
  if (!request.restartEnabled) {
    return { allowed: false, status: 403, reason: 'Restart is not enabled' };
  }
  const origin = request.origin;
  if (origin === undefined || !origin.startsWith('http://') || !isAllowedHost(origin.slice('http://'.length), request.port)) {
    return { allowed: false, status: 403, reason: 'Origin not allowed' };
  }
  if (request.restartHeader !== '1') {
    return { allowed: false, status: 403, reason: 'Missing restart header' };
  }
  return { allowed: true };
}

// True when the newest file time under src/ and public/ differs from the one taken at start.
export function codeChanged(baseline: number, current: number): boolean {
  return current !== baseline;
}

// The cache and the closed-issue window. The closed-issue lookup reads the last 28 days only.
export const CACHE_MS = 5 * 60 * 1000;
export const CLOSED_WINDOW_DAYS = 28;

// The `gh issue list` arguments for closed issues: only the last 28 days (drift and areas use them).
export function closedIssueArgs(now: Date, repo: string, limit: number): string[] {
  const search = `closed:>=${shippedSearchDate(now, CLOSED_WINDOW_DAYS)}`;
  return ['issue', 'list', '--repo', repo, '--state', 'closed', '--search', search, '--limit', String(limit)];
}

// ---- Recent commits, ADRs and AWS cost (CTO tab) ----

export const COMMITS_SHOWN = 8;
// Fields are split by the unit separator, so a subject can hold any other character.
export const GIT_LOG_FORMAT = '%h%x1f%ct%x1f%s';

export interface CommitInfo {
  sha: string;
  subject: string;
  age: string;
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}

export function formatAge(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return plural(minutes, 'minute');
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return plural(hours, 'hour');
  }
  return plural(Math.floor(hours / 24), 'day');
}

// Parses `git log --format=GIT_LOG_FORMAT`. A line that does not fit is skipped.
export function parseGitLog(output: string, now: Date): CommitInfo[] {
  const commits: CommitInfo[] = [];
  for (const line of output.split('\n')) {
    const [sha, time, ...rest] = line.split('\x1f');
    const seconds = Number(time);
    const subject = rest.join('\x1f').trim();
    if (!sha || !time || !Number.isFinite(seconds) || subject === '') {
      continue;
    }
    commits.push({ sha, subject, age: formatAge(now.getTime() / 1000 - seconds) });
  }
  return commits.slice(0, COMMITS_SHOWN);
}

export interface AdrInfo {
  file: string;
  number: string;
  title: string;
  status: string | null;
}

// Title: the first `# ` heading, without a leading "0001:". Status: the first line under `## Status`,
// else a `Status:` line. A file with neither has status null.
export function parseAdr(file: string, text: string): AdrInfo {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  const number = /^(\d+)/.exec(file)?.[1] ?? '';
  const heading = lines.find((line) => line.startsWith('# '));
  const title = (heading ? heading.slice(2) : file.replace(/\.md$/, '')).replace(/^\d+\s*[:.-]\s*/, '').trim();
  let status: string | null = null;
  const at = lines.findIndex((line) => /^##\s+Status\s*$/i.test(line));
  if (at >= 0) {
    const next = lines.slice(at + 1).find((line) => line.trim() !== '');
    if (next !== undefined && !next.startsWith('#')) {
      status = next.trim();
    }
  } else {
    const inline = lines.find((line) => /^Status:\s*\S/i.test(line));
    status = inline ? inline.replace(/^Status:\s*/i, '').trim() : null;
  }
  return { file, number, title, status };
}

export const COST_BUDGET_USD = 10;
export const COST_CACHE_MS = 12 * 60 * 60 * 1000;

// Cost Explorer dates: the first of this month (UTC) to tomorrow (End is exclusive).
export function costPeriod(now: Date): { start: string; end: string } {
  const day = (date: Date): string => date.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return { start: day(start), end: day(end) };
}

export interface CostResult {
  dollars: number;
  // True when Cost Explorer marks any period as an estimate.
  estimated: boolean;
}

// Sums UnblendedCost over ResultsByTime. No periods, a unit other than USD, or a non-number is
// unreadable (null), so it is never cached or shown as $0.
export function parseCostExplorer(data: unknown): CostResult | null {
  const periods = (data as { ResultsByTime?: unknown } | null)?.ResultsByTime;
  if (!Array.isArray(periods) || periods.length === 0) {
    return null;
  }
  let total = 0;
  let estimated = false;
  for (const period of periods) {
    const entry = period as { Estimated?: unknown; Total?: { UnblendedCost?: { Amount?: unknown; Unit?: unknown } } } | null;
    const cost = entry?.Total?.UnblendedCost;
    const value = typeof cost?.Amount === 'string' && cost.Amount.trim() !== '' ? Number(cost.Amount) : Number.NaN;
    if (!Number.isFinite(value) || cost?.Unit !== 'USD') {
      return null;
    }
    total += value;
    estimated = estimated || entry?.Estimated === true;
  }
  return { dollars: Math.round(total * 100) / 100, estimated };
}

export function formatDollars(value: number): string {
  return `$${value.toFixed(2)}`;
}

export interface CostReading extends CostResult {
  at: number;
  // First day of the month the reading is for (from costPeriod).
  start: string;
}

// Fresh for 12 hours and only inside the month it was read for. A future time or no reading is not fresh.
export function isCostFresh(reading: Pick<CostReading, 'at' | 'start'> | null, now: number, periodStart: string): boolean {
  return reading !== null && reading.start === periodStart && now >= reading.at && now - reading.at < COST_CACHE_MS;
}

// Checks a reading read back from the cache file. Anything off gives null.
export function validateCostReading(data: unknown): CostReading | null {
  const r = data as Partial<Record<keyof CostReading, unknown>> | null;
  if (
    !r ||
    typeof r.at !== 'number' ||
    !Number.isFinite(r.at) ||
    typeof r.dollars !== 'number' ||
    !Number.isFinite(r.dollars) ||
    typeof r.start !== 'string' ||
    typeof r.estimated !== 'boolean'
  ) {
    return null;
  }
  return { at: r.at, dollars: r.dollars, estimated: r.estimated, start: r.start };
}

export interface CostReaderDeps {
  // The one billed call. It gets the month start and the end date.
  call: (period: { start: string; end: string }) => Promise<CostResult>;
  now: () => number;
  load: () => Promise<CostReading | null>;
  save: (reading: CostReading) => Promise<void>;
}

// One reader per server. Reads the saved reading once, calls only when it is stale, shares one call
// between concurrent requests, and keeps and saves only good readings. A failed call is retried next time.
export function makeCostReader(deps: CostReaderDeps): () => Promise<CostReading> {
  let memory: CostReading | null | undefined;
  let inFlight: Promise<CostReading> | null = null;
  async function read(): Promise<CostReading> {
    const now = deps.now();
    const period = costPeriod(new Date(now));
    if (memory === undefined) {
      memory = validateCostReading(await deps.load().catch(() => null));
    }
    if (memory !== null && isCostFresh(memory, now, period.start)) {
      return memory;
    }
    const result = await deps.call(period);
    const reading: CostReading = { ...result, at: now, start: period.start };
    memory = reading;
    await deps.save(reading).catch(() => undefined);
    return reading;
  }
  return () => {
    if (!inFlight) {
      inFlight = read().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}

const LOGIN_PROBLEM = /ExpiredToken|token has expired|Unable to locate credentials|SSO|InvalidClientTokenId|UnrecognizedClient/i;

// A plain reason for the page. The raw error is never sent: only its first line, cut short, with the
// CLI boilerplate removed and ARNs, account ids, key ids and long token-like strings redacted.
export function costErrorMessage(raw: string): string {
  if (LOGIN_PROBLEM.test(raw)) {
    return 'AWS login missing or expired. Run: aws login';
  }
  const firstLine = (raw.split('\n').find((line) => line.trim() !== '') ?? '').trim();
  const safe = firstLine
    .replace(/An error occurred \((\w+)\) when calling the \w+ operation:\s*/, '$1: ')
    .replace(/arn:aws:[^\s]+/g, '[removed]')
    .replace(/\b\d{12}\b/g, '[removed]')
    .replace(/\b(AKIA|ASIA)[A-Z0-9]{12,}\b/g, '[removed]')
    .replace(/[A-Za-z0-9/+=_-]{32,}/g, '[removed]')
    .slice(0, 120);
  return safe === '' ? 'Could not read AWS cost.' : `Could not read AWS cost. ${safe}`;
}

// ---- Architecture tab: the Mermaid blocks in the docs ----
export type DiagramGroupName = 'System' | 'User flows' | 'Data';
export const DIAGRAM_GROUPS: DiagramGroupName[] = ['System', 'User flows', 'Data'];
export const DIAGRAM_STALE_DAYS = 30;

export type DiagramBlock = { file: string; line: number; title: string; kind: string; source: string };

// Every ```mermaid block in one doc. `line` is the line of the opening fence (1-based). The title is the
// nearest heading above it (a `#` line outside any code fence), else the file name.
export function extractMermaidBlocks(file: string, text: string): DiagramBlock[] {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  const blocks: DiagramBlock[] = [];
  let heading = file.replace(/\.md$/, '');
  let fence: string | null = null;
  let current: { line: number; title: string; body: string[] } | null = null;
  lines.forEach((line, index) => {
    const open = /^\s*(`{3,}|~{3,})\s*(\S*)/.exec(line);
    if (fence === null) {
      if (open) {
        fence = open[1] ?? '```';
        if ((open[2] ?? '').toLowerCase() === 'mermaid') {
          current = { line: index + 1, title: heading, body: [] };
        }
      } else {
        const found = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
        if (found) {
          heading = (found[1] ?? heading).trim();
        }
      }
      return;
    }
    if (open && line.trim().startsWith(fence) && (open[2] ?? '') === '') {
      fence = null;
      if (current) {
        const source = current.body.join('\n').trim();
        const kind = /^(\S+)/.exec(source)?.[1] ?? 'diagram';
        blocks.push({ file, line: current.line, title: current.title, kind, source });
        current = null;
      }
      return;
    }
    current?.body.push(line);
  });
  return blocks;
}

// docs/frontend.md is User flows, docs/learnings is Data, everything else (backend-services.md, ADRs, any other doc) is System.
export function diagramGroup(file: string): DiagramGroupName {
  if (file === 'docs/frontend.md') {
    return 'User flows';
  }
  return file.startsWith('docs/learnings/') ? 'Data' : 'System';
}

// Whole days since the last commit that touched the file. null when git gave no date.
export function diagramAge(lastChanged: string | null, now: Date): { days: number | null; stale: boolean } {
  const time = lastChanged === null ? NaN : Date.parse(lastChanged);
  if (Number.isNaN(time)) {
    return { days: null, stale: false };
  }
  const days = Math.max(0, Math.floor((now.getTime() - time) / 86_400_000));
  return { days, stale: days > DIAGRAM_STALE_DAYS };
}
