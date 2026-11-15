// Pure logic for the factory dashboard. No I/O. Every function here has a spec.

export interface BoardItem {
  number: number | null;
  title: string;
  status: string | null;
  type: string;
  url: string | null;
  labels: string[];
}

export interface Issue {
  number: number;
  title: string;
  url: string;
  labels: string[];
  updatedAt: string;
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
  status?: string;
  conclusion?: string;
  state?: string;
}

const BAD_CONCLUSIONS = ['FAILURE', 'TIMED_OUT', 'CANCELLED', 'STARTUP_FAILURE', 'ACTION_REQUIRED'];
const GOOD_CONCLUSIONS = ['SUCCESS', 'NEUTRAL', 'SKIPPED'];

export function ciStateFromChecks(checks: RawCheck[] | null | undefined): CiState {
  if (!checks || checks.length === 0) {
    return 'none';
  }
  const states = checks.map(checkState);
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

export function isGreenForReview(pr: Pr): boolean {
  return !pr.isDraft && pr.ci === 'green';
}

export function computeNeedsYou(prs: Pr[], issues: Issue[]): NeedsYouItem[] {
  const items: NeedsYouItem[] = [];
  for (const pr of prs.filter(isGreenForReview)) {
    items.push({
      kind: 'pr-green',
      number: pr.number,
      title: pr.title,
      url: pr.url,
      labels: issueLabelsFor(pr, issues),
    });
  }
  for (const issue of issues) {
    if (issue.labels.includes('blocked')) {
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

export function worktreeLabels(tree: Worktree, issues: Issue[]): string[] {
  const issue = issues.find((candidate) => candidate.number === tree.issueNumber);
  return issue ? issue.labels : [];
}

export interface Run {
  databaseId: number;
  workflowName: string;
  headBranch: string;
  status: string;
  conclusion: string;
  url: string;
  createdAt: string;
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
