import { describe, expect, it } from 'vitest';
import {
  areaOf,
  summarizePr,
  summarizeIssue,
  openBoardItems,
  buildProduct,
  toShippedPr,
  shippedPerDay,
  roadmapStacks,
  computeProductKpis,
  SUMMARY_MAX,
  buildEngineering,
  formatDuration,
  mergedSearchDate,
  computeCiHealth,
  computeRunStrip,
  dependsOn,
  waitsForPeter,
  boardStacks,
  computeDeploys,
  computeThroughput,
  flakyIssues,
  medianOf,
  computeLaunchBlockers,
  computeRoadmap,
  parseFeatureFlags,
  shippedMayBeCutOff,
  shippedSearchDate,
  shippedThisWeek,
  boardTruncation,
  failedSources,
  isAllowedHost,
  decideRestart,
  codeChanged,
  CACHE_MS,
  CLOSED_WINDOW_DAYS,
  joinBacklogReview,
  parseBacklogReviews,
  parsePort,
  ciStateFromChecks,
  computeDrift,
  computeNeedsYou,
  countPorcelainLines,
  filterByArea,
  groupByStatus,
  isGreenForReview,
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

const PORCELAIN = `worktree /repo/griever-guidance
HEAD aaaaaaaa
branch refs/heads/main

worktree /repo/griever-guidance/.worktrees/830
HEAD bbbbbbbb
branch refs/heads/ticket/830

worktree /repo/griever-guidance/.worktrees/detached
HEAD cccccccc
detached
`;

function issue(number: number, labels: string[] = []): Issue {
  return { number, title: `Issue ${number}`, url: `https://x/${number}`, labels, updatedAt: '' };
}

function boardItem(number: number | null, status: string | null, labels: string[] = []): BoardItem {
  return { number, title: `Item ${number}`, status, type: 'Issue', url: `https://x/${number}`, labels };
}

function pr(overrides: Partial<Pr> = {}): Pr {
  return {
    number: 900,
    title: 'PR',
    url: 'https://x/pr/900',
    isDraft: false,
    headRefName: 'ticket/830',
    reviewDecision: '',
    ci: 'green',
    issueNumber: 830,
    updatedAt: '',
    ...overrides,
  };
}

function tree(issueNumber: number | null): Worktree {
  return {
    path: `/w/${issueNumber}`,
    branch: `ticket/${issueNumber}`,
    head: 'x',
    isMain: false,
    issueNumber,
    dirty: 0,
    ahead: 0,
    behind: 0,
    labels: [],
  };
}

describe('parseWorktrees', () => {
  it('parses main, ticket and detached worktrees', () => {
    const trees = parseWorktrees(PORCELAIN);
    expect(trees).toHaveLength(3);
    expect(trees[0]).toMatchObject({ path: '/repo/griever-guidance', branch: 'main', isMain: true, issueNumber: null });
    expect(trees[1]).toMatchObject({ branch: 'ticket/830', isMain: false, issueNumber: 830 });
    expect(trees[2]).toMatchObject({ branch: null, issueNumber: null });
  });

  it('returns an empty list for empty output', () => {
    expect(parseWorktrees('')).toEqual([]);
  });
});

describe('issueFromBranch', () => {
  it('reads the number from ticket branches', () => {
    expect(issueFromBranch('ticket/42')).toBe(42);
    expect(issueFromBranch('ticket/42-short-name')).toBe(42);
  });

  it('returns null for other branches', () => {
    expect(issueFromBranch('main')).toBeNull();
    expect(issueFromBranch(null)).toBeNull();
    expect(issueFromBranch('feature/42')).toBeNull();
  });
});

describe('git output helpers', () => {
  it('counts porcelain lines', () => {
    expect(countPorcelainLines(' M a.ts\n?? b.ts\n')).toBe(2);
    expect(countPorcelainLines('')).toBe(0);
  });

  it('parses left-right counts as behind then ahead', () => {
    expect(parseLeftRight('3\t5\n')).toEqual({ behind: 3, ahead: 5 });
    expect(parseLeftRight('garbage')).toBeNull();
  });
});

describe('issueFromPr', () => {
  it('prefers Closes #N in the body', () => {
    expect(issueFromPr('Summary\n\nCloses #123', 'ticket/9')).toBe(123);
    expect(issueFromPr('fixes #7', 'other')).toBe(7);
  });

  it('falls back to the branch name', () => {
    expect(issueFromPr('no link', 'ticket/9')).toBe(9);
    expect(issueFromPr(null, 'ticket/9')).toBe(9);
  });

  it('returns null with no link at all', () => {
    expect(issueFromPr('', 'dependabot/npm')).toBeNull();
  });
});

describe('ciStateFromChecks', () => {
  it('is none without checks', () => {
    expect(ciStateFromChecks([])).toBe('none');
    expect(ciStateFromChecks(null)).toBe('none');
  });

  it('is green when all checks pass or skip', () => {
    expect(
      ciStateFromChecks([
        { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
        { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SKIPPED' },
        { __typename: 'StatusContext', state: 'SUCCESS' },
      ]),
    ).toBe('green');
  });

  it('is red when any check fails, even if another is pending', () => {
    expect(
      ciStateFromChecks([
        { status: 'IN_PROGRESS' },
        { status: 'COMPLETED', conclusion: 'FAILURE' },
      ]),
    ).toBe('red');
  });

  it('ignores the merge gate check, which is red until the label is added', () => {
    const gate = { __typename: 'CheckRun', name: 'Ready to merge', status: 'COMPLETED', conclusion: 'FAILURE' };
    const passing = { __typename: 'CheckRun', name: 'Typecheck', status: 'COMPLETED', conclusion: 'SUCCESS' };
    expect(ciStateFromChecks([passing, gate])).toBe('green');
    expect(ciStateFromChecks([gate])).toBe('none');
  });

  it('is pending when a check is still running', () => {
    expect(
      ciStateFromChecks([
        { status: 'COMPLETED', conclusion: 'SUCCESS' },
        { status: 'QUEUED' },
      ]),
    ).toBe('pending');
    expect(ciStateFromChecks([{ __typename: 'StatusContext', state: 'PENDING' }])).toBe('pending');
  });
});

describe('areas', () => {
  it('reads the area label or none', () => {
    expect(areaOf(['ticket', 'area:web'])).toBe('web');
    expect(areaOf(['ticket'])).toBe('none');
  });

  it('lists areas sorted with none last', () => {
    expect(listAreas([['area:web'], [], ['area:gateway'], ['area:web']])).toEqual(['gateway', 'web', 'none']);
  });

  it('filters by area, including none', () => {
    const items = [
      { id: 1, labels: ['area:web'] },
      { id: 2, labels: [] },
      { id: 3, labels: ['area:gateway'] },
    ];
    expect(filterByArea(items, 'web').map((i) => i.id)).toEqual([1]);
    expect(filterByArea(items, 'none').map((i) => i.id)).toEqual([2]);
    expect(filterByArea(items, 'all')).toHaveLength(3);
    expect(filterByArea(items, null)).toHaveLength(3);
  });
});

describe('groupByStatus', () => {
  it('groups known statuses and puts the rest under No status', () => {
    const groups = groupByStatus([
      boardItem(1, 'Ready'),
      boardItem(2, 'In review'),
      boardItem(3, null),
      boardItem(4, 'Ready'),
      boardItem(5, 'Weird'),
    ]);
    expect(groups['Ready']!.map((i) => i.number)).toEqual([1, 4]);
    expect(groups['In review']).toHaveLength(1);
    expect(groups['Backlog']).toEqual([]);
    expect(groups['No status']!.map((i) => i.number)).toEqual([3, 5]);
  });
});

describe('needs you', () => {
  it('treats only non-draft PRs with green CI as G2', () => {
    expect(isGreenForReview(pr())).toBe(true);
    expect(isGreenForReview(pr({ isDraft: true }))).toBe(false);
    expect(isGreenForReview(pr({ ci: 'pending' }))).toBe(false);
    expect(isGreenForReview(pr({ ci: 'red' }))).toBe(false);
  });

  it('lists green PRs, blocked issues and ready-for-human issues', () => {
    const items = computeNeedsYou(
      [pr(), pr({ number: 901, isDraft: true }), pr({ number: 902, ci: 'red' })],
      [issue(830, ['area:ci']), issue(5, ['blocked']), issue(6, ['ready-for-human']), issue(7, ['ready'])],
    );
    expect(items.map((i) => `${i.kind}:${i.number}`)).toEqual(['pr-green:900', 'blocked:5', 'ready-for-human:6']);
    expect(items[0]!.labels).toEqual(['area:ci']);
  });
});

describe('dependsOn', () => {
  it('reads the issue numbers in the Depends on section', () => {
    const body = '### Context\nSee #1.\n\n### Depends on\n#12 and #34, also #12.\n\n### Size\nM #99';
    expect(dependsOn(body)).toEqual([12, 34]);
  });

  it('is empty for None, a missing section, and no body', () => {
    expect(dependsOn('### Depends on\nNone\n')).toEqual([]);
    expect(dependsOn('### Context\n#5')).toEqual([]);
    expect(dependsOn(undefined)).toEqual([]);
    expect(dependsOn(null)).toEqual([]);
  });

  it('accepts a different heading level, case and CRLF line ends', () => {
    expect(dependsOn('## depends on\r\n- #7\r\n- #8\r\n')).toEqual([7, 8]);
  });
});

describe('needs you rules', () => {
  it('keeps a blocked issue only when none of its dependencies is open', () => {
    const items = computeNeedsYou(
      [],
      [
        { ...issue(1, ['blocked']), dependsOn: [2] },
        issue(2),
        { ...issue(3, ['blocked']), dependsOn: [99] },
        { ...issue(4, ['blocked']), dependsOn: [] },
      ],
    );
    expect(items.map((i) => i.number)).toEqual([3, 4]);
  });

  it('keeps a blocked issue when only some dependencies are closed, and drops it if any is open', () => {
    const open = [{ ...issue(1, ['blocked']), dependsOn: [50, 2] }, issue(2)];
    expect(computeNeedsYou([], open).map((i) => i.number)).toEqual([]);
  });

  it('adds ready-for-human issues even when they have dependencies', () => {
    const items = computeNeedsYou([], [{ ...issue(6, ['ready-for-human']), dependsOn: [7] }, issue(7)]);
    expect(items.map((i) => `${i.kind}:${i.number}`)).toEqual(['ready-for-human:6']);
  });

  it('keeps ready-to-merge PRs, even drafts, and does not match text', () => {
    expect(waitsForPeter(pr({ isDraft: true, ci: 'pending', prLabels: ['ready-to-merge'] }))).toBe(true);
    expect(waitsForPeter(pr({ isDraft: true, ci: 'pending', prLabels: ['other'] }))).toBe(false);
    expect(waitsForPeter(pr({ title: 'HUMAN TODO', ci: 'red' }))).toBe(false);
  });

  it('uses the PR summary first, then the issue summary', () => {
    const issues = [{ ...issue(830), summary: 'from issue' }];
    expect(computeNeedsYou([pr({ summary: 'from pr' })], issues)[0]!.summary).toBe('from pr');
    expect(computeNeedsYou([pr()], issues)[0]!.summary).toBe('from issue');
  });
});

describe('boardStacks', () => {
  const item = (n: number, status: string | null, labels: string[] = []): BoardItem => ({ ...boardItem(n, status), labels });

  it('emits an all stack and one per area, with segments in a fixed order', () => {
    const stacks = boardStacks([
      item(1, 'Ready', ['area:web']),
      item(2, 'Ready', ['area:web']),
      item(3, 'Blocked', ['area:ci']),
      item(4, 'Backlog'),
    ]);
    expect(stacks.map((s) => s.area)).toEqual(['all', 'ci', 'none', 'web']);
    expect(stacks[0]!.segments.map((seg) => seg.name)).toEqual(['Ready', 'In progress', 'In review', 'Blocked', 'Backlog']);
    expect(stacks[0]!.segments.map((seg) => seg.value)).toEqual([2, 0, 0, 1, 1]);
    expect(stacks.find((s) => s.area === 'web')!.total).toBe(2);
  });

  it('counts No status and Done outside the bar', () => {
    const [all] = boardStacks([item(1, null), item(2, 'Done'), item(3, 'Weird'), item(4, 'Ready')]);
    expect(all!.total).toBe(1);
    expect(all!.noStatus).toBe(2);
  });

  it('gives an empty all stack for no items', () => {
    expect(boardStacks([])).toEqual([{ area: 'all', total: 0, noStatus: 0, segments: expect.any(Array) }]);
  });
});

describe('computeDrift', () => {
  const base = { board: [], openIssues: [], closedIssues: [], prs: [], worktrees: [] };

  it('flags In review with no open PR, but not when a PR links it', () => {
    const board = [boardItem(1, 'In review'), boardItem(2, 'In review')];
    const drift = computeDrift({ ...base, board, prs: [pr({ issueNumber: 2 })] });
    expect(drift.filter((d) => d.rule === 'in-review-no-pr').map((d) => d.number)).toEqual([1]);
  });

  it('flags In progress with no worktree and no PR', () => {
    const board = [boardItem(1, 'In progress'), boardItem(2, 'In progress'), boardItem(3, 'In progress')];
    const drift = computeDrift({ ...base, board, prs: [pr({ issueNumber: 2 })], worktrees: [tree(3)] });
    expect(drift.filter((d) => d.rule === 'in-progress-no-work').map((d) => d.number)).toEqual([1]);
  });

  it('flags closed issues whose board status is not Done', () => {
    const closedIssues = [issue(1), issue(2), issue(3)];
    const board = [boardItem(1, 'Done'), boardItem(2, 'Ready'), boardItem(3, null)];
    const drift = computeDrift({ ...base, board, closedIssues });
    expect(drift.filter((d) => d.rule === 'closed-not-done').map((d) => d.number)).toEqual([2, 3]);
  });

  it('does not flag a closed issue that is not on the board', () => {
    const drift = computeDrift({ ...base, board: [boardItem(1, 'Done')], closedIssues: [issue(1), issue(99)] });
    expect(drift.filter((d) => d.rule === 'closed-not-done')).toEqual([]);
  });

  it('ignores PullRequest board items in In review', () => {
    const prItem: BoardItem = { ...boardItem(900, 'In review'), type: 'PullRequest' };
    const drift = computeDrift({ ...base, board: [prItem] });
    expect(drift).toEqual([]);
  });

  it('flags open issues with no status or not on the board', () => {
    const openIssues = [issue(1), issue(2), issue(3)];
    const board = [boardItem(1, 'Ready'), boardItem(2, null)];
    const drift = computeDrift({ ...base, board, openIssues });
    const found = drift.filter((d) => d.rule === 'open-no-status');
    expect(found.map((d) => d.number)).toEqual([2, 3]);
    expect(found[0]!.detail).toContain('no status');
    expect(found[1]!.detail).toContain('not on the board');
  });

  it('flags worktrees whose issue is closed', () => {
    const drift = computeDrift({ ...base, closedIssues: [issue(830)], worktrees: [tree(830), tree(831)] });
    const found = drift.filter((d) => d.rule === 'worktree-closed-issue');
    expect(found.map((d) => d.number)).toEqual([830]);
  });

  it('is empty when everything agrees', () => {
    const drift = computeDrift({
      board: [boardItem(1, 'In progress')],
      openIssues: [issue(1)],
      closedIssues: [],
      prs: [],
      worktrees: [tree(1)],
    });
    expect(drift).toEqual([]);
  });
});

describe('splitRuns', () => {
  it('splits deploy runs from CI runs by workflow name', () => {
    const make = (workflowName: string): Run => ({
      databaseId: 1,
      workflowName,
      headBranch: 'main',
      status: 'completed',
      conclusion: 'success',
      url: '',
      createdAt: '',
    });
    const { ci, deploy } = splitRuns([make('CI'), make('Deploy'), make('E2E stress')]);
    expect(ci.map((r) => r.workflowName)).toEqual(['CI', 'E2E stress']);
    expect(deploy.map((r) => r.workflowName)).toEqual(['Deploy']);
  });
});

describe('parseBoardItems', () => {
  it('maps gh project items to board items', () => {
    const items = parseBoardItems({
      items: [
        {
          status: 'In review',
          title: 'T',
          labels: ['area:web'],
          content: { number: 12, type: 'Issue', title: 'T', url: 'https://x/12' },
        },
        { title: 'Draft idea', content: { type: 'DraftIssue' } },
      ],
    });
    expect(items[0]).toMatchObject({ number: 12, status: 'In review', labels: ['area:web'], type: 'Issue' });
    expect(items[1]).toMatchObject({ number: null, status: null, title: 'Draft idea' });
  });

  it('handles missing items', () => {
    expect(parseBoardItems(null)).toEqual([]);
  });
});

describe('parsePort', () => {
  it('accepts integers from 1 to 65535', () => {
    expect(parsePort('4318')).toBe(4318);
    expect(parsePort('1')).toBe(1);
    expect(parsePort('65535')).toBe(65535);
  });

  it('falls back to 4317 for anything else', () => {
    for (const bad of [undefined, '', 'abc', '0', '65536', '-1', '43.5', '4317x', '1e3']) {
      expect(parsePort(bad)).toBe(4317);
    }
  });
});

describe('isAllowedHost', () => {
  it('allows only loopback names with the exact port', () => {
    expect(isAllowedHost('127.0.0.1:4317', 4317)).toBe(true);
    expect(isAllowedHost('localhost:4317', 4317)).toBe(true);
  });

  it('allows the friendly name with the exact port only', () => {
    expect(isAllowedHost('gg-tech-dashboard.localhost:4317', 4317)).toBe(true);
  });

  it('rejects other hosts, ports and a missing header', () => {
    for (const bad of ['gg-tech-dashboard.localhost', 'evil.example', 'evil.example:4317', '127.0.0.1', '127.0.0.1:4318', 'localhost.evil.com:4317', 'gg-tech-dashboard.localhost:4318', 'gg-tech-dashboard.localhost.evil.com', 'evil.gg-tech-dashboard.localhost', undefined]) {
      expect(isAllowedHost(bad, 4317)).toBe(false);
    }
  });
});

describe('failedSources', () => {
  it('names the sources that failed or are missing', () => {
    const sources = { board: { ok: true }, prs: { ok: false, error: 'x' }, runs: { ok: false } };
    expect(failedSources(sources, ['board', 'prs', 'openIssues'])).toEqual(['prs', 'openIssues']);
  });

  it('is empty when every named source loaded', () => {
    expect(failedSources({ board: { ok: true } }, ['board'])).toEqual([]);
  });
});

describe('boardTruncation', () => {
  it('reports shown and total when they differ', () => {
    expect(boardTruncation({ items: [{}, {}], totalCount: 5 })).toEqual({ shown: 2, total: 5 });
  });

  it('is null when the counts match or totalCount is missing', () => {
    expect(boardTruncation({ items: [{}, {}], totalCount: 2 })).toBeNull();
    expect(boardTruncation({ items: [{}] })).toBeNull();
    expect(boardTruncation(null)).toBeNull();
  });
});

describe('backlog review', () => {
  const issue = (number: number, title = `Issue ${number}`): Issue => ({
    number,
    title,
    url: `https://github.com/x/y/issues/${number}`,
    labels: [],
    updatedAt: '2026-11-15T00:00:00Z',
  });
  const review = (number: number, action: 'close' | 'decide' | 'rewrite' | 'keep') => ({
    number,
    action,
    recommendation: `rec ${number}`,
    why: `why ${number}`,
  });
  const file = (reviews: ReturnType<typeof review>[]) => ({ reviewedAt: '2026-11-15', reviews });

  it('joins a review with its open issue', () => {
    const result = joinBacklogReview(file([review(1, 'close')]), [issue(1, 'Old thing')]);
    expect(result.rows).toEqual([
      {
        number: 1,
        title: 'Old thing',
        url: 'https://github.com/x/y/issues/1',
        action: 'close',
        recommendation: 'rec 1',
        why: 'why 1',
        summary: '',
      },
    ]);
    expect(result.reviewedAt).toBe('2026-11-15');
  });

  it('shows open issues with no review as Not reviewed', () => {
    const [row] = joinBacklogReview(file([]), [issue(7)]).rows;
    expect(row?.action).toBe('not-reviewed');
    expect(row?.recommendation).toBe('Not reviewed');
  });

  it('drops reviews for closed issues and counts them', () => {
    const result = joinBacklogReview(file([review(1, 'close'), review(2, 'keep')]), [issue(2)]);
    expect(result.rows.map((row) => row.number)).toEqual([2]);
    expect(result.dropped).toBe(1);
  });

  it('sorts close, decide, rewrite, not reviewed, keep, then by number', () => {
    const reviews = [review(1, 'keep'), review(2, 'rewrite'), review(3, 'decide'), review(4, 'close'), review(6, 'close')];
    const open = [issue(6), issue(5), issue(4), issue(3), issue(2), issue(1)];
    const order = joinBacklogReview(file(reviews), open).rows.map((row) => row.number);
    expect(order).toEqual([4, 6, 3, 2, 5, 1]);
  });

  it('accepts a good file', () => {
    expect(parseBacklogReviews(file([review(1, 'keep')]))).toEqual(file([review(1, 'keep')]));
  });

  it('rejects bad files with a reason', () => {
    expect(() => parseBacklogReviews(null)).toThrow('reviewedAt');
    expect(() => parseBacklogReviews({ reviewedAt: 'today', reviews: [] })).toThrow('reviewedAt');
    expect(() => parseBacklogReviews({ reviewedAt: '2026-11-15' })).toThrow('reviews must be a list');
    expect(() => parseBacklogReviews(file([{ ...review(1, 'keep'), action: 'delete' as never }]))).toThrow('action');
    expect(() => parseBacklogReviews(file([{ ...review(1, 'keep'), why: '' }]))).toThrow('why');
    expect(() => parseBacklogReviews(file([{ ...review(0, 'keep') }]))).toThrow('number');
    expect(() => parseBacklogReviews(file([review(1, 'keep'), review(1, 'close')]))).toThrow('twice');
  });
});

describe('parseFeatureFlags', () => {
  it('maps values to On, Off and unset, and sorts by name', () => {
    const flags = parseFeatureFlags([
      { name: 'FEATURE_B', value: 'true' },
      { name: 'EXPO_PUBLIC_FEATURE_A', value: 'false' },
      { name: 'FEATURE_C', value: '' },
      { name: 'FEATURE_D', value: 'maybe' },
      { name: 'FEATURE_E', value: ' TRUE ' },
    ]);
    expect(flags).toEqual([
      { name: 'EXPO_PUBLIC_FEATURE_A', state: 'Off' },
      { name: 'FEATURE_B', state: 'On' },
      { name: 'FEATURE_C', state: 'Not set' },
      { name: 'FEATURE_D', state: 'Not set' },
      { name: 'FEATURE_E', state: 'On' },
    ]);
  });

  it('lists only flag names and never other variables or values', () => {
    const flags = parseFeatureFlags([
      { name: 'CLOUDFLARE_API_TOKEN', value: 'secret' },
      { name: 'MY_FEATURE_X', value: 'true' },
      { name: 'FEATURE_OK', value: 'secret-looking' },
      { value: 'true' },
    ]);
    expect(flags).toEqual([{ name: 'FEATURE_OK', state: 'Not set' }]);
    expect(JSON.stringify(flags)).not.toContain('secret');
  });

  it('returns an empty list for bad input', () => {
    expect(parseFeatureFlags(null)).toEqual([]);
    expect(parseFeatureFlags({})).toEqual([]);
  });
});

describe('shippedThisWeek', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  const pr = (number: number, mergedAt: string) => ({ number, title: `PR ${number}`, url: 'https://x', mergedAt });

  it('keeps PRs merged in the last 7 days, newest first', () => {
    const result = shippedThisWeek(
      [pr(1, '2026-11-10T00:00:00Z'), pr(2, '2026-11-14T00:00:00Z'), pr(3, '2026-11-12T00:00:00Z')],
      now,
    );
    expect(result.map((item) => item.number)).toEqual([2, 3, 1]);
  });

  it('drops a PR merged just over 7 days ago and keeps one just inside', () => {
    const result = shippedThisWeek(
      [pr(1, '2026-11-08T11:59:00Z'), pr(2, '2026-11-08T12:01:00Z'), pr(3, '2026-11-07T12:00:00Z')],
      now,
    );
    expect(result.map((item) => item.number)).toEqual([2]);
  });

  it('drops entries whose title is not a string', () => {
    const bad = { number: 9, title: null, url: 'https://x', mergedAt: '2026-11-14T00:00:00Z' } as never;
    expect(shippedThisWeek([bad, pr(1, '2026-11-14T00:00:00Z')], now).map((item) => item.number)).toEqual([1]);
  });

  it('builds the search date 7 days back in UTC', () => {
    expect(shippedSearchDate(now)).toBe('2026-11-08');
    expect(shippedSearchDate(new Date('2026-03-02T00:30:00Z'))).toBe('2026-02-23');
  });

  it('flags a result that fills the limit', () => {
    expect(shippedMayBeCutOff(499)).toBe(false);
    expect(shippedMayBeCutOff(500)).toBe(true);
  });

  it('ignores bad dates and future dates', () => {
    expect(shippedThisWeek([pr(1, 'nope'), pr(2, '2026-11-16T00:00:00Z')], now)).toEqual([]);
  });
});

describe('launch blockers', () => {
  const issue = (number: number, title: string, labels: string[]): Issue => ({
    number,
    title,
    url: `https://github.com/x/${number}`,
    labels,
    updatedAt: '',
  });
  const boardItem = (number: number, status: string | null): BoardItem => ({
    number,
    title: '',
    status,
    type: 'Issue',
    url: null,
    labels: [],
  });

  it('matches the label or the title marker, with board status', () => {
    const result = computeLaunchBlockers(
      [
        issue(5, 'Plain', ['launch-blocker']),
        issue(3, '[Launch Roadmap] Store listing', []),
        issue(4, 'Other', ['area:web']),
        issue(6, 'Unplaced', ['launch-blocker']),
      ],
      [boardItem(5, 'In progress'), boardItem(3, 'Ready'), boardItem(4, 'Ready')],
    );
    expect(result.map((item) => [item.number, item.status])).toEqual([
      [3, 'Ready'],
      [5, 'In progress'],
      [6, 'No status'],
    ]);
  });
});

describe('computeRoadmap', () => {
  const issue = (number: number, labels: string[]): Issue => ({ number, title: '', url: '', labels, updatedAt: '' });
  const boardItem = (number: number, status: string | null): BoardItem => ({
    number,
    title: '',
    status,
    type: 'Issue',
    url: null,
    labels: [],
  });

  it('counts open issues by area and status, with Other for the rest', () => {
    const rows = computeRoadmap(
      [
        issue(1, ['area:web']),
        issue(2, ['area:web']),
        issue(3, ['area:web']),
        issue(4, ['area:api']),
        issue(5, []),
        issue(6, ['area:web']),
        issue(7, ['area:web']),
        issue(8, ['area:api']),
      ],
      [
        boardItem(1, 'Ready'),
        boardItem(2, 'Ready'),
        boardItem(3, 'In review'),
        boardItem(4, 'Blocked'),
        boardItem(5, 'Backlog'),
        boardItem(7, 'In progress'),
        boardItem(8, 'Done'),
      ],
    );
    expect(rows.map((row) => row.area)).toEqual(['api', 'web', 'none']);
    expect(rows[0]).toEqual({ area: 'api', counts: { Ready: 0, 'In progress': 0, Blocked: 1, Backlog: 0, Other: 1 }, total: 2 });
    expect(rows[1]?.counts).toEqual({ Ready: 2, 'In progress': 1, Blocked: 0, Backlog: 0, Other: 2 });
    expect(rows[1]?.total).toBe(5);
    expect(rows[2]?.counts['Backlog']).toBe(1);
  });

  it('returns no rows when nothing is open', () => {
    expect(computeRoadmap([], [])).toEqual([]);
  });
});

describe('computeCiHealth', () => {
  const run = (id: number, conclusion: string, status = 'completed', createdAt = '2026-11-14T00:00:00Z'): Run => ({
    databaseId: id,
    workflowName: 'CI',
    headBranch: 'main',
    status,
    conclusion,
    url: `https://x/${id}`,
    createdAt,
  });

  it('ignores cancelled and unfinished runs', () => {
    const health = computeCiHealth([run(1, 'success'), run(2, 'cancelled'), run(3, '', 'in_progress'), run(4, 'failure')]);
    expect(health).toMatchObject({ passed: 1, failed: 1, counted: 2, ignored: 2, passPercent: 50 });
  });

  it('counts failure, timed_out and other non-success conclusions as failures', () => {
    const health = computeCiHealth([run(1, 'success'), run(2, 'timed_out'), run(3, 'failure'), run(4, 'startup_failure')]);
    expect(health.failed).toBe(3);
    expect(health.passPercent).toBe(25);
  });

  it('picks the newest failure', () => {
    const health = computeCiHealth([
      run(1, 'failure', 'completed', '2026-11-10T00:00:00Z'),
      run(2, 'failure', 'completed', '2026-11-13T00:00:00Z'),
      run(3, 'success', 'completed', '2026-11-14T00:00:00Z'),
    ]);
    expect(health.lastFailure?.databaseId).toBe(2);
  });

  it('returns no rate and no failure when nothing finished', () => {
    expect(computeCiHealth([])).toMatchObject({ counted: 0, passPercent: null, lastFailure: null });
    expect(computeCiHealth([run(1, 'cancelled')]).passPercent).toBeNull();
  });
});

describe('computeRunStrip', () => {
  const run = (id: number, conclusion: string, status = 'completed', createdAt = '2026-11-14T00:00:00Z'): Run => ({
    databaseId: id,
    workflowName: 'CI',
    headBranch: 'main',
    status,
    conclusion,
    url: `https://x/${id}`,
    createdAt,
  });

  it('puts the oldest run first, whatever the input order', () => {
    const strip = computeRunStrip([
      run(3, 'success', 'completed', '2026-11-14T00:00:00Z'),
      run(1, 'success', 'completed', '2026-11-12T00:00:00Z'),
      run(2, 'success', 'completed', '2026-11-13T00:00:00Z'),
    ]);
    expect(strip.map((mark) => mark.id)).toEqual([1, 2, 3]);
  });

  it('marks pass, fail and ignored with the same rule as the pass rate', () => {
    const strip = computeRunStrip([
      run(1, 'success', 'completed', '2026-11-10T00:00:00Z'),
      run(2, 'timed_out', 'completed', '2026-11-11T00:00:00Z'),
      run(3, 'cancelled', 'completed', '2026-11-12T00:00:00Z'),
      run(4, '', 'in_progress', '2026-11-13T00:00:00Z'),
    ]);
    expect(strip.map((mark) => mark.result)).toEqual(['pass', 'fail', 'ignored', 'ignored']);
    expect(strip.map((mark) => mark.text)).toEqual(['Passed', 'Failed (timed_out)', 'Ignored (cancelled)', 'Ignored (in_progress)']);
  });

  it('counts match computeCiHealth, and the strip rides on ciHealth', () => {
    const runs = [run(1, 'success'), run(2, 'failure'), run(3, 'cancelled')];
    const health = computeCiHealth(runs);
    const strip = computeRunStrip(runs);
    expect(strip.filter((mark) => mark.result === 'pass')).toHaveLength(health.passed);
    expect(strip.filter((mark) => mark.result === 'fail')).toHaveLength(health.failed);
    expect(strip.filter((mark) => mark.result === 'ignored')).toHaveLength(health.ignored);
    expect(health.strip).toEqual(strip);
  });

  it('keeps a run with a bad date and puts it first', () => {
    const strip = computeRunStrip([
      run(2, 'success', 'completed', '2026-11-13T00:00:00Z'),
      run(1, 'failure', 'completed', 'not a date'),
      run(3, 'success', 'completed', '2026-11-12T00:00:00Z'),
    ]);
    expect(strip.map((mark) => mark.id)).toEqual([1, 3, 2]);
  });

  it('is empty when there are no runs', () => {
    expect(computeRunStrip([])).toEqual([]);
  });
});

describe('flakyIssues', () => {
  const issue = (number: number, title: string, labels: string[] = []) => ({
    number,
    title,
    url: 'https://x',
    updatedAt: '',
    labels,
  });

  it('matches "flaky" in the title, any case, with or without labels', () => {
    expect(flakyIssues([issue(2, 'Flaky e2e login'), issue(1, 'the FLAKY smoke test'), issue(3, 'Other')]).map((i) => i.number)).toEqual([1, 2]);
  });

  it('matches retry or times out only with the tests label', () => {
    const found = flakyIssues([
      issue(1, 'e2e needs retry', ['tests']),
      issue(2, 'e2e needs retry', ['area:web']),
      issue(3, 'Step times out', ['tests']),
      issue(4, 'Step times out'),
    ]);
    expect(found.map((i) => i.number)).toEqual([1, 3]);
  });
});

describe('computeDeploys', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  const deploy = (id: number, conclusion: string, createdAt: string, status = 'completed'): Run => ({
    databaseId: id,
    workflowName: 'Deploy',
    headBranch: 'main',
    status,
    conclusion,
    url: 'https://x',
    createdAt,
  });

  it('shows the 5 newest and finds the last good deploy', () => {
    const runs = [
      deploy(1, 'failure', '2026-11-15T11:00:00Z'),
      deploy(2, 'success', '2026-11-15T06:00:00Z'),
      deploy(3, 'success', '2026-11-14T06:00:00Z'),
      deploy(4, 'skipped', '2026-11-13T06:00:00Z'),
      deploy(5, 'skipped', '2026-11-12T06:00:00Z'),
      deploy(6, 'skipped', '2026-11-11T06:00:00Z'),
    ];
    const result = computeDeploys(runs, now);
    expect(result.recent.map((r) => r.databaseId)).toEqual([1, 2, 3, 4, 5]);
    expect(result.lastGood?.databaseId).toBe(2);
    expect(result.hoursSinceGood).toBe(6);
  });

  it('does not count unfinished, failed or skipped runs as good', () => {
    const result = computeDeploys([deploy(1, '', '2026-11-15T11:00:00Z', 'in_progress'), deploy(2, 'skipped', '2026-11-15T10:00:00Z')], now);
    expect(result.lastGood).toBeNull();
    expect(result.hoursSinceGood).toBeNull();
  });
});

describe('medianOf', () => {
  it('handles odd, even and empty lists', () => {
    expect(medianOf([5, 1, 3])).toBe(3);
    expect(medianOf([4, 1, 3, 2])).toBe(2.5);
    expect(medianOf([])).toBeNull();
  });
});

describe('computeThroughput', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const pr = (number: number, mergedDaysAgo: number, openHours: number | null) => ({
    number,
    title: 'x',
    url: 'https://x',
    mergedAt: daysAgo(mergedDaysAgo),
    createdAt: openHours === null ? undefined : new Date(now.getTime() - mergedDaysAgo * 86_400_000 - openHours * 3_600_000).toISOString(),
  });

  it('buckets merges into 4 weeks, newest first, and drops older ones', () => {
    const result = computeThroughput([pr(1, 1, 1), pr(2, 6.9, 1), pr(3, 7.1, 1), pr(4, 20, 1), pr(5, 27.9, 1), pr(6, 28.1, 1)], now);
    expect(result.weeks.map((w) => w.count)).toEqual([2, 1, 1, 1]);
    expect(result.total).toBe(5);
    expect(result.weeks[0]?.label).toBe('Last 7 days');
  });

  it('takes the median hours from opened to merged', () => {
    const result = computeThroughput([pr(1, 1, 2), pr(2, 2, 10), pr(3, 3, 4)], now);
    expect(result.medianHours).toBe(4);
  });

  it('skips missing or bad dates and returns null with nothing to measure', () => {
    const result = computeThroughput([pr(1, 1, null), { ...pr(2, 1, 1), mergedAt: 'nope' }], now);
    expect(result.total).toBe(1);
    expect(result.medianHours).toBeNull();
  });

  it('ignores future merges', () => {
    expect(computeThroughput([pr(1, -1, 1)], now).total).toBe(0);
  });
});

describe('shippedSearchDate window', () => {
  it('can widen to 28 days', () => {
    expect(shippedSearchDate(new Date('2026-11-15T12:00:00Z'), 28)).toBe('2026-10-18');
  });
});

describe('boundaries shared by Shipped and Throughput', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  const at = (days: number) => ({
    number: 1,
    title: 'x',
    url: 'https://x',
    mergedAt: new Date(now.getTime() - days * 86_400_000).toISOString(),
  });

  it('puts a PR merged exactly 7 days ago in both "Shipped this week" and week 0', () => {
    expect(shippedThisWeek([at(7)], now)).toHaveLength(1);
    expect(computeThroughput([at(7)], now).weeks.map((w) => w.count)).toEqual([1, 0, 0, 0]);
  });

  it('drops a PR just over 7 days from Shipped and puts it in week 1', () => {
    expect(shippedThisWeek([at(7.001)], now)).toHaveLength(0);
    expect(computeThroughput([at(7.001)], now).weeks.map((w) => w.count)).toEqual([0, 1, 0, 0]);
  });

  it('keeps a PR merged exactly 28 days ago in week 3 and drops one just over', () => {
    expect(computeThroughput([at(28)], now).weeks.map((w) => w.count)).toEqual([0, 0, 0, 1]);
    expect(computeThroughput([at(28.001)], now).total).toBe(0);
  });
});

describe('mergedSearchDate', () => {
  it('goes back 28 days in UTC', () => {
    expect(mergedSearchDate(new Date('2026-11-15T12:00:00Z'))).toBe('2026-10-18');
  });
});

describe('formatDuration', () => {
  it('uses minutes under an hour and singular at exactly 1', () => {
    expect(formatDuration(0.5)).toBe('30 minutes');
    expect(formatDuration(1 / 60)).toBe('1 minute');
    expect(formatDuration(0.001)).toBe('less than 1 minute');
    expect(formatDuration(1)).toBe('1 hour');
    expect(formatDuration(1.5)).toBe('1.5 hours');
    expect(formatDuration(6)).toBe('6 hours');
  });
});

describe('buildEngineering', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  const data = { board: [], ciMainRuns: [], openIssues: [], deployRuns: [], mergedPrs: [] };
  const ok = { ok: true };
  const allOk = { board: ok, ciMain: ok, openIssues: ok, deploys: ok, mergedPrs: ok };

  it('fills every field when all sources load', () => {
    const result = buildEngineering(allOk, data, now);
    expect(result.ciHealth).not.toBeNull();
    expect(result.flaky).toEqual([]);
    expect(result.deploys?.sinceGoodText).toBe('Unknown');
    expect(result.throughput?.medianText).toBe('Unknown');
  });

  it.each([
    ['ciMain', 'ciHealth'],
    ['openIssues', 'flaky'],
    ['deploys', 'deploys'],
    ['mergedPrs', 'throughput'],
    ['board', 'boardStacks'],
  ] as const)('a failed %s source nulls only %s', (source, field) => {
    const result = buildEngineering({ ...allOk, [source]: { ok: false, error: 'x' } }, data, now);
    for (const key of ['ciHealth', 'flaky', 'deploys', 'throughput', 'boardStacks'] as const) {
      if (key === field) {
        expect(result[key]).toBeNull();
      } else {
        expect(result[key]).not.toBeNull();
      }
    }
  });
});

describe('summarizePr', () => {
  it('takes the first bullet under ## What', () => {
    const body = '## Why\nBecause.\n\n## What\n\n- Adds the **layout kit** to the dashboard\n- Second bullet\n\n## Tests\n- x';
    expect(summarizePr(body)).toBe('Adds the layout kit to the dashboard');
  });

  it('takes the first sentence when the What section is prose', () => {
    expect(summarizePr('## What\nMakes the tab easier to read. It also adds charts.\n')).toBe('Makes the tab easier to read.');
  });

  it('skips a lead-in line that ends with a colon', () => {
    expect(summarizePr('## What\nNew sections at the top:\n- Real first item\n- Second')).toBe('Real first item');
    expect(summarizePr('## What\nOnly a lead-in:')).toBe('Only a lead-in:');
  });

  it('falls back to the first non-empty line when there is no What section', () => {
    expect(summarizePr('\n\n## Summary\nFixes the [login bug](https://x.test) for good\nMore text')).toBe('Fixes the login bug for good');
    expect(summarizePr('\nFixes the [login bug](https://x.test) for good\nMore text')).toBe('Fixes the login bug for good');
  });

  it('falls back to the first usable line when the What section is empty', () => {
    expect(summarizePr('Adds the thing\n\n## What\n\n## Tests\n- x')).toBe('Adds the thing');
  });

  it('never returns a bare Closes line', () => {
    expect(summarizePr('Closes #871')).toBe('');
    expect(summarizePr('## What\n\n- Fixes #12\n- Part of #3\n\nCloses #871\n')).toBe('');
    expect(summarizePr('Closes #5\n\n## What\n\n## Tests\n- x')).toBe('x');
    expect(summarizePr('#12, #13 and #14\nAdds the router')).toBe('Adds the router');
  });

  it('skips headings, quotes and fenced code', () => {
    const body = '# Title\n> a quoted note\n```\nnpm test\n```\nReal line here';
    expect(summarizePr(body)).toBe('Real line here');
  });

  it('keeps code spans whole: names with underscores and JSX', () => {
    expect(summarizePr('## What\n- Adds `FEATURE_SHARE_LINK` and renders `<App/>` in tests')).toBe(
      'Adds FEATURE_SHARE_LINK and renders <App/> in tests',
    );
  });

  it('strips emphasis only when it is paired around words', () => {
    expect(summarizePr('## What\n- Uses _real_ names like some_file_name and 2 * 3 * 4')).toBe(
      'Uses real names like some_file_name and 2 * 3 * 4',
    );
  });

  it('skips a quote after a lead-in colon and takes the first bullet', () => {
    const body = '## What\nNew sections at the top:\n> Note: this is a quote\n- Real first item. More words.\n- Second';
    expect(summarizePr(body)).toBe('Real first item.');
  });

  it('keeps a bullet that ends with a colon (only plain lead-ins are skipped)', () => {
    expect(summarizePr('## What\n- Adds these:\n- Second')).toBe('Adds these:');
  });

  it('cuts a bullet to its first sentence', () => {
    expect(summarizePr('## What\n- First part. Second part.')).toBe('First part.');
  });

  it('caps at a word boundary', () => {
    const result = summarizePr('## What\n- ' + 'alpha beta '.repeat(30));
    expect(result.length).toBeLessThanOrEqual(140);
    expect(result).toMatch(/(alpha|beta)\u2026$/);
  });

  it('strips markdown, html comments, tags, quotes and checkboxes', () => {
    const body = '<!-- template note -->\n## What\n- [x] `code` and _emphasis_ with <b>tags</b> and ![img](a.png)';
    expect(summarizePr(body)).toBe('code and emphasis with tags and img');
  });

  it('handles CRLF line endings', () => {
    expect(summarizePr('## What\r\n- First\r\n- Second\r\n')).toBe('First');
  });

  it('returns an empty string for missing or blank bodies', () => {
    expect(summarizePr(null)).toBe('');
    expect(summarizePr(undefined)).toBe('');
    expect(summarizePr('  \n \n')).toBe('');
  });

  it('caps the summary at 140 characters', () => {
    const long = 'word '.repeat(60);
    const result = summarizePr('## What\n- ' + long);
    expect(SUMMARY_MAX).toBe(140);
    expect(result.length).toBeLessThanOrEqual(140);
    expect(result.endsWith('\u2026')).toBe(true);
    expect(summarizePr('x'.repeat(140))).toBe('x'.repeat(140));
    expect(summarizePr('x'.repeat(141)).length).toBe(140);
  });
});

describe('toShippedPr', () => {
  const labelsFor = (n: number | null): string[] => (n === 7 ? ['area:web'] : []);

  it('keeps a summary and an area, and drops the full body', () => {
    const pr = { number: 1, title: 'T', url: 'https://x', mergedAt: '2026-11-14T00:00:00Z', body: '## What\n- Does a thing\n\nCloses #7', headRefName: 'ticket/9' };
    const result = toShippedPr(pr, labelsFor);
    expect(result).toEqual({ number: 1, title: 'T', url: 'https://x', mergedAt: '2026-11-14T00:00:00Z', summary: 'Does a thing', area: 'web' });
    expect('body' in result).toBe(false);
  });

  it('falls back to the linked issue summary when the PR body has nothing', () => {
    const pr = { number: 3, title: 'T', url: 'https://x', mergedAt: '2026-11-14T00:00:00Z', body: 'Closes #7' };
    expect(toShippedPr(pr, labelsFor, (n) => (n === 7 ? 'Issue says this' : '')).summary).toBe('Issue says this');
    expect(toShippedPr(pr, labelsFor).summary).toBe('');
  });

  it('uses area none when the issue is unknown', () => {
    const pr = { number: 2, title: 'T', url: 'https://x', mergedAt: '2026-11-14T00:00:00Z' };
    expect(toShippedPr(pr, labelsFor)).toMatchObject({ summary: '', area: 'none' });
  });
});

describe('product KPIs and roadmap stacks', () => {
  const now = new Date('2026-11-15T12:00:00Z');

  it('puts PRs into 7 daily buckets, oldest first', () => {
    const days = shippedPerDay(
      [{ mergedAt: '2026-11-15T10:00:00Z' }, { mergedAt: '2026-11-15T01:00:00Z' }, { mergedAt: '2026-11-09T13:00:00Z' }, { mergedAt: '2026-11-01T00:00:00Z' }],
      now,
    );
    expect(days).toEqual([0, 1, 0, 0, 0, 0, 2]);
  });

  it('keeps a PR exactly 7 days old, so the buckets add up to shippedThisWeek', () => {
    const prs = [
      { number: 1, title: 'a', url: 'u', mergedAt: '2026-11-08T12:00:00Z' },
      { number: 2, title: 'b', url: 'u', mergedAt: '2026-11-15T11:00:00Z' },
      { number: 3, title: 'c', url: 'u', mergedAt: '2026-11-12T00:00:00Z' },
    ];
    const shipped = shippedThisWeek(prs, now);
    const days = shippedPerDay(shipped, now);
    expect(days.reduce((a, b) => a + b, 0)).toBe(shipped.length);
    expect(shipped.length).toBe(3);
  });

  it('labels the sparkline points from the last 24 hours back', () => {
    const kpis = computeProductKpis({ launchBlockers: [], shipped: [], flags: [], openIssueCount: 0, now });
    expect(kpis.perDay.map((day) => day.label)).toEqual(['6 days ago', '5 days ago', '4 days ago', '3 days ago', '2 days ago', '1 day ago', 'Last 24 h']);
  });

  it('counts blockers, shipped, flags on of total and open issues', () => {
    const kpis = computeProductKpis({
      launchBlockers: [{ number: 1, title: '', url: '', status: 'Ready', labels: [], summary: '' }],
      shipped: [{ mergedAt: '2026-11-14T00:00:00Z' }, { mergedAt: '2026-11-13T00:00:00Z' }],
      flags: [
        { name: 'A', state: 'On' },
        { name: 'B', state: 'Off' },
        { name: 'C', state: 'Not set' },
      ],
      openIssueCount: 12,
      now,
    });
    expect(kpis).toMatchObject({ launchBlockers: 1, shipped: 2, flagsOn: 1, flagsTotal: 3, openIssues: 12 });
  });

  it('reports unknown blockers and issue count as null', () => {
    const kpis = computeProductKpis({ launchBlockers: null, shipped: [], flags: [], openIssueCount: null, now });
    expect(kpis).toMatchObject({ launchBlockers: null, openIssues: null, flagsOn: 0, flagsTotal: 0 });
  });

  it('builds stack segments in the fixed status order, keeping zeros', () => {
    const stacks = roadmapStacks([{ area: 'web', counts: { Ready: 2, 'In progress': 0, Blocked: 1, Backlog: 3, Other: 0 }, total: 6 }]);
    expect(stacks).toEqual([
      {
        area: 'web',
        total: 6,
        segments: [
          { name: 'Ready', value: 2 },
          { name: 'In progress', value: 0 },
          { name: 'Blocked', value: 1 },
          { name: 'Backlog', value: 3 },
          { name: 'Other', value: 0 },
        ],
      },
    ]);
  });
});

describe('summarizeIssue', () => {
  const body = [
    '### Context',
    'Rewritten from #12 after the first plan was too big.',
    'Split from #20 (the dashboard epic).',
    'Peter (Founder & CTO) asked for a **readability sweep** of the dashboard: charts, columns and brief PR summaries. This ticket builds the kit.',
    '',
    '### Acceptance criteria',
    '- [ ] Layout kit in index.html, with a grid',
    '- [ ] PR summaries',
  ].join('\n');

  it('takes the first Context sentence and skips Rewritten and Split from lead-ins', () => {
    expect(summarizeIssue(body)).toBe('Peter (Founder & CTO) asked for a readability sweep of the dashboard: charts, columns and brief PR summaries.');
  });

  it('skips lead-ins that share a line with the real sentence', () => {
    expect(summarizeIssue('### Context\nRewritten from #12. The login page shows no error. More.')).toBe('The login page shows no error.');
  });

  it('falls back to the first acceptance criterion', () => {
    expect(summarizeIssue('### Acceptance criteria\n- [ ] The `FEATURE_X` flag hides the panel. And more\n- [ ] Second')).toBe('The FEATURE_X flag hides the panel.');
  });

  it('falls back to the first usable line, never a bare Closes line', () => {
    expect(summarizeIssue('Closes #4\n\nJust a plain note about the work')).toBe('Just a plain note about the work');
    expect(summarizeIssue('## Heading only\n')).toBe('');
    expect(summarizeIssue(null)).toBe('');
  });

  it('caps at 140 characters', () => {
    expect(summarizeIssue('### Context\n' + 'word '.repeat(60)).length).toBeLessThanOrEqual(140);
  });
});

describe('openBoardItems', () => {
  const item = (number: number | null, status: string | null): BoardItem => ({ number, title: '', status, type: 'Issue', url: null, labels: [] });

  it('does not count a closed issue that is still In review', () => {
    const board = [item(1, 'In review'), item(2, 'In review'), item(3, 'In review'), item(null, 'Backlog')];
    const open = openBoardItems(board, new Set([1]), new Set([2, 3]));
    expect(open.map((entry) => entry.number)).toEqual([1, null]);
    expect(groupByStatus(open)['In review']).toHaveLength(1);
    expect(groupByStatus(board)['In review']).toHaveLength(3);
  });

  it('keeps everything when the closed list is empty (source failed)', () => {
    expect(openBoardItems([item(1, 'Done')], new Set(), new Set())).toHaveLength(1);
  });
});

describe('buildProduct', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  const issue = { number: 586, title: '[launch roadmap] Clerk', url: 'https://x/586', labels: ['area:web'], updatedAt: '', summary: 'Set up Clerk.' };

  it('sends summaries only, never a PR or issue body', () => {
    const result = buildProduct({
      sources: { board: { ok: true }, openIssues: { ok: true }, mergedPrs: { ok: true } },
      flags: [],
      mergedPrs: [
        { number: 9, title: 'PR', url: 'https://x/9', mergedAt: '2026-11-14T00:00:00Z', body: '## What\n- Short line\n\nSECOND_PARAGRAPH_TOKEN and more words', headRefName: 'ticket/586' },
      ],
      openIssues: [{ ...issue, body: 'ISSUE_BODY_TOKEN' } as never],
      board: [],
      labelsFor: () => ['area:web'],
      issueSummaryFor: () => '',
      now,
    });
    const json = JSON.stringify(result);
    expect(json).not.toContain('"body"');
    expect(json).not.toContain('SECOND_PARAGRAPH_TOKEN');
    expect(json).not.toContain('ISSUE_BODY_TOKEN');
    expect(result.shipped[0]?.summary).toBe('Short line');
    expect(result.launchBlockers?.[0]?.summary).toBe('Set up Clerk.');
    expect(result.kpis.perDay.reduce((sum, day) => sum + day.count, 0)).toBe(result.shipped.length);
  });

  it('reports blockers as unknown when a source failed', () => {
    const result = buildProduct({
      sources: { board: { ok: false, error: 'x' }, openIssues: { ok: true } },
      flags: [],
      mergedPrs: [],
      openIssues: [],
      board: [],
      labelsFor: () => [],
      issueSummaryFor: () => '',
      now,
    });
    expect(result.launchBlockers).toBeNull();
    expect(result.blockedBy).toEqual(['board']);
  });
});

describe('decideRestart', () => {
  const good = {
    method: 'POST',
    host: '127.0.0.1:4399',
    origin: 'http://127.0.0.1:4399',
    restartHeader: '1',
    restartEnabled: true,
    port: 4399,
  };

  it('allows a complete request', () => {
    expect(decideRestart(good)).toEqual({ allowed: true });
  });

  it('allows the friendly host as the origin', () => {
    const friendly = 'gg-tech-dashboard.localhost:4399';
    expect(decideRestart({ ...good, host: friendly, origin: `http://${friendly}` })).toEqual({ allowed: true });
  });

  it('refuses other methods with 405', () => {
    for (const method of ['GET', 'OPTIONS', 'PUT', 'DELETE', undefined]) {
      expect(decideRestart({ ...good, method })).toMatchObject({ allowed: false, status: 405 });
    }
  });

  it('refuses a host that is not allowed', () => {
    expect(decideRestart({ ...good, host: 'evil.example:4399' })).toMatchObject({ allowed: false, status: 403 });
    expect(decideRestart({ ...good, host: undefined })).toMatchObject({ allowed: false, status: 403 });
  });

  it('refuses when restart is not enabled', () => {
    expect(decideRestart({ ...good, restartEnabled: false })).toMatchObject({ allowed: false, status: 403 });
  });

  it('refuses a missing or wrong origin', () => {
    for (const origin of [undefined, 'null', 'https://127.0.0.1:4399', 'http://evil.example', 'http://127.0.0.1:4399/', 'http://127.0.0.1:1', 'http://127.0.0.1:4399.evil.com']) {
      expect(decideRestart({ ...good, origin })).toMatchObject({ allowed: false, status: 403 });
    }
  });

  it('refuses a missing or wrong restart header', () => {
    for (const restartHeader of [undefined, '', '0', 'true']) {
      expect(decideRestart({ ...good, restartHeader })).toMatchObject({ allowed: false, status: 403 });
    }
  });
});

describe('codeChanged', () => {
  it('is false for the same time and true for a newer or an older one', () => {
    expect(codeChanged(100, 100)).toBe(false);
    expect(codeChanged(100, 200)).toBe(true);
    expect(codeChanged(100, 50)).toBe(true);
  });
});

describe('cache and closed window', () => {
  it('caches for 5 minutes and reads 28 days of closed issues', () => {
    expect(CACHE_MS).toBe(300_000);
    expect(CLOSED_WINDOW_DAYS).toBe(28);
    expect(shippedSearchDate(new Date('2026-11-29T00:00:00Z'), CLOSED_WINDOW_DAYS)).toBe('2026-11-01');
  });
});
