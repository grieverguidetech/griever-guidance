import { describe, expect, it } from 'vitest';
import {
  areaOf,
  boardTruncation,
  failedSources,
  isAllowedHost,
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

  it('rejects other hosts, ports and a missing header', () => {
    for (const bad of ['evil.example', 'evil.example:4317', '127.0.0.1', '127.0.0.1:4318', 'localhost.evil.com:4317', undefined]) {
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
