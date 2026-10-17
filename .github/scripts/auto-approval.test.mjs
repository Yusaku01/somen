import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isTrivial,
  reconcile,
  reviewedAndGreen,
  REVIEW_MARKER,
  runAutoApproval,
} from './auto-approval.mjs';

const clone = (value) => structuredClone(value);
const pr = {
  number: 15,
  state: 'open',
  draft: false,
  title: 'docs: clarify the overview',
  changed_files: 1,
  labels: [],
  head: { sha: 'head', repo: { full_name: 'Yusaku01/somen' } },
  base: { ref: 'main', sha: 'base', repo: { full_name: 'Yusaku01/somen' } },
};
const file = {
  filename: 'README.md',
  status: 'modified',
  additions: 1,
  deletions: 1,
  before: '# Somen\n\nSomen draws readable diagram.\n',
  after: '# Somen\n\nSomen draws readable diagrams.\n',
};
const review = {
  id: 1,
  user: { id: 199175422, login: 'chatgpt-codex-connector[bot]', type: 'Bot' },
  state: 'COMMENTED',
  body: REVIEW_MARKER,
  commit_id: 'head',
};
const graph = {
  id: 'PR_id',
  headRefOid: 'head',
  baseRefOid: 'base',
  autoMergeRequest: null,
  reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] },
  commits: {
    nodes: [
      {
        commit: {
          oid: 'head',
          statusCheckRollup: {
            state: 'SUCCESS',
            contexts: {
              pageInfo: { hasNextPage: false },
              nodes: [
                {
                  __typename: 'CheckRun',
                  name: 'Checks',
                  status: 'COMPLETED',
                  conclusion: 'SUCCESS',
                  checkSuite: { app: { databaseId: 15368 } },
                },
              ],
            },
          },
        },
      },
    ],
  },
};

test('only tiny paired prose edits qualify; code, contracts, larger diffs and forks do not', () => {
  assert.equal(isTrivial(pr, [file]), true);
  for (const patch of [
    { filename: '.github/automation-policy.md' },
    { filename: 'docs/api.md' },
    { status: 'added' },
    { status: 'renamed' },
    { additions: 2 },
    { before: undefined },
    { before: '```txt\nSimple diagram\n```', after: '```txt\nSimple diagrams\n```' },
    { before: '<!--\nSimple diagram\n-->', after: '<!--\nSimple diagrams\n-->' },
    { before: 'Somen uses API.', after: 'Somen use API.' },
    { before: 'Somen must draw.', after: 'Somen must draws.' },
    { before: 'Somen draws diagrams.', after: 'Somen draws diagrams. a@b.co' },
    { before: 'Somen draws diagrams.', after: 'Somen draws diagrams. www.x.co' },
    { before: 'Contact a@b.co for help.', after: 'Contact a@c.co for help.' },
    { before: 'Run pnpm test.', after: 'Run pnpm build.' },
    { before: 'Simple diagram 1', after: 'Simple diagram 2' },
    { after: '# Somen\n\nCompletely different functionality description.\n' },
  ])
    assert.equal(isTrivial(pr, [{ ...file, ...patch }]), false, JSON.stringify(patch));
  for (const patch of [
    { draft: true },
    { state: 'closed' },
    { title: 'feat: change behavior' },
    { title: 'docs!: change behavior' },
    { changed_files: 2 },
    { head: { ...pr.head, repo: { full_name: 'someone/fork' } } },
    { base: { ...pr.base, ref: 'other' } },
  ])
    assert.equal(isTrivial({ ...pr, ...patch }, [file]), false, JSON.stringify(patch));
  assert.equal(isTrivial(pr, []), false);
});

test('review must be exact-head, explicit, trusted, complete and without outstanding findings', () => {
  assert.equal(reviewedAndGreen('head', [review], graph), true);
  for (const patch of [
    { commit_id: 'old' },
    { body: 'Looks good' },
    { body: `quoted ${REVIEW_MARKER}` },
    { state: 'DISMISSED' },
    { state: 'CHANGES_REQUESTED' },
    { user: { ...review.user, id: 99 } },
    { user: { ...review.user, type: 'User' } },
  ])
    assert.equal(reviewedAndGreen('head', [{ ...review, ...patch }], graph), false);
  assert.equal(
    reviewedAndGreen('head', [review, { ...review, id: 2, body: 'Found a bug' }], graph),
    false,
  );
  const thread = clone(graph);
  thread.reviewThreads.nodes.push({ isResolved: false });
  assert.equal(reviewedAndGreen('head', [review], thread), false);
  thread.reviewThreads.nodes = [];
  thread.reviewThreads.pageInfo.hasNextPage = true;
  assert.equal(reviewedAndGreen('head', [review], thread), false);
  for (const modify of [
    (g) => {
      g.headRefOid = 'old';
    },
    (g) => {
      g.commits.nodes[0].commit.oid = 'old';
    },
    (g) => {
      g.commits.nodes[0].commit.statusCheckRollup.state = 'PENDING';
    },
    (g) => {
      g.commits.nodes[0].commit.statusCheckRollup.contexts.pageInfo.hasNextPage = true;
    },
    (g) => {
      g.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[0].checkSuite.app.databaseId = 99;
    },
    (g) => {
      g.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[0].conclusion = 'SKIPPED';
    },
  ]) {
    const changed = clone(graph);
    modify(changed);
    assert.equal(reviewedAndGreen('head', [review], changed), false);
  }
});

function mock({ race, mergeError, readError, labelError, merged = true } = {}) {
  const pull = clone(pr);
  const state = clone(graph);
  const reviews = [clone(review)];
  const calls = [];
  let gets = 0;
  const api = {
    pulls: {
      get: async () => {
        gets++;
        if (race && gets === 2) pull.head.sha = 'new-head';
        return { data: clone(pull) };
      },
      list: async () => [clone(pull)],
      listReviews: async () => clone(reviews),
      listFiles: async () => {
        if (readError) throw new Error('API unavailable');
        return [clone(file)];
      },
      createReview: async (args) => {
        calls.push(['approve', args.commit_id]);
        reviews.push({
          ...args,
          id: 2,
          state: 'APPROVED',
          user: { login: 'github-actions[bot]', type: 'Bot' },
        });
      },
      dismissReview: async (args) => {
        calls.push(['dismiss', args.review_id]);
        reviews.find((r) => r.id === args.review_id).state = 'DISMISSED';
      },
      merge: async (args) => {
        calls.push(['merge', args.sha]);
        if (mergeError) throw new Error('Head changed');
        if (merged) pull.state = 'closed';
        return { data: { merged } };
      },
    },
    repos: {
      getContent: async (args) => ({
        data: {
          type: 'file',
          encoding: 'base64',
          size: 80,
          content: Buffer.from(args.ref === 'base' ? file.before : file.after).toString('base64'),
        },
      }),
    },
    issues: {
      listComments: async () => [],
      getLabel: async () => {},
      addLabels: async () => {
        calls.push(['label']);
        pull.labels = [{ name: 'Auto Approval' }];
      },
      removeLabel: async () => {
        calls.push(['unlabel']);
        if (labelError)
          throw Object.assign(new Error('Cannot remove label'), { status: labelError });
        pull.labels = [];
      },
    },
  };
  const deps = {
    context: { repo: { owner: 'Yusaku01', repo: 'somen' }, payload: {} },
    core: { info: () => {}, setFailed: (message) => calls.push(['failed', message]) },
    github: {
      rest: api,
      paginate: (method, args) => method(args),
      graphql: async () => ({ repository: { pullRequest: clone(state) } }),
    },
  };
  return { deps, calls, pull, state, reviews };
}

test('protected squash merge and formal approval bind to the reviewed revision', async () => {
  const { deps, calls } = mock();
  await reconcile(deps, 15);
  assert.deepEqual(calls, [['label'], ['approve', 'head'], ['merge', 'head']]);
});

test('new head between assessment and approval receives neither approval nor auto-merge', async () => {
  const { deps, calls } = mock({ race: true });
  await reconcile(deps, 15);
  assert.deepEqual(calls, []);
});

test('label cannot bypass review; existing automatic approval is revoked', async () => {
  const { deps, calls, pull, reviews } = mock();
  pull.labels = [{ name: 'Auto Approval' }];
  reviews[0].commit_id = 'old';
  reviews.push({
    id: 2,
    state: 'APPROVED',
    body: '<!-- somen-auto-approval -->',
    user: { login: 'github-actions[bot]', type: 'Bot' },
  });
  await reconcile(deps, 15);
  assert.deepEqual(calls, [['unlabel'], ['dismiss', 2]]);
});

test('failed merge revokes the newly created approval and label', async () => {
  const { deps, calls } = mock({ mergeError: true });
  await assert.rejects(reconcile(deps, 15), /Head changed/);
  assert.deepEqual(calls, [
    ['label'],
    ['approve', 'head'],
    ['merge', 'head'],
    ['unlabel'],
    ['dismiss', 2],
  ]);
});

test('API failure fails visibly and revokes labels; invalid inputs cannot select PRs', async () => {
  const { deps, calls, pull } = mock({ readError: true });
  pull.labels = [{ name: 'Auto Approval' }];
  await runAutoApproval(deps, '15');
  assert.equal(calls[0][0], 'unlabel');
  assert.equal(calls[1][0], 'failed');
  for (const number of ['0', '-1', '15; echo unsafe', '9007199254740993']) {
    await assert.rejects(runAutoApproval(deps, number), /positive pull request number/);
  }
});

test('a commented review never clears an earlier change request', () => {
  const human = { id: 9, login: 'reviewer', type: 'User' };
  const old = {
    id: 2,
    user: human,
    state: 'CHANGES_REQUESTED',
    commit_id: 'head',
    body: 'Fix this',
  };
  const comment = { ...old, id: 3, state: 'COMMENTED', body: 'Additional context' };
  assert.equal(reviewedAndGreen('head', [review, old, comment], graph), false);
});

test('merged:false does not leave an approval; a label error still attempts approval dismissal', async () => {
  const { deps, calls } = mock({ merged: false, labelError: 403 });
  await assert.rejects(reconcile(deps, 15), /cleanup failed/);
  assert.equal(
    calls.some(([method]) => method === 'dismiss'),
    true,
  );
});

test('a human auto-merge reservation is left alone and receives no bot approval', async () => {
  const { deps, calls, state } = mock();
  state.autoMergeRequest = { enabledBy: { login: 'Yusaku01' } };
  await reconcile(deps, 15);
  assert.deepEqual(calls, []);
});

test('a later comment by the shared Actions bot does not hide an approval from cleanup', async () => {
  const { deps, calls, reviews } = mock();
  reviews[0].commit_id = 'old';
  const user = { login: 'github-actions[bot]', type: 'Bot' };
  reviews.push({ id: 2, user, state: 'APPROVED', body: '<!-- somen-auto-approval -->' });
  reviews.push({ id: 3, user, state: 'COMMENTED', body: 'Another workflow comment' });
  await reconcile(deps, 15);
  assert.deepEqual(calls, [['dismiss', 2]]);
});

test('the trusted provider summary binds clean completion to the current head', () => {
  const state = {
    code_review: {
      commit_sha: 'head',
      status: 'completed',
      has_any_findings: false,
      has_unresolved_findings: false,
    },
    security_review: { commit_sha: null, status: null },
  };
  const summary = (value, user = review.user) => ({
    id: 7,
    user,
    body: `<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 ${JSON.stringify(value)} -->`,
  });
  assert.equal(reviewedAndGreen('head', [], graph, [summary(state)]), true);
  for (const patch of [
    { commit_sha: 'old' },
    { status: 'running' },
    { status: 'failed' },
    { has_any_findings: true },
    { has_any_findings: null },
    { has_unresolved_findings: true },
    { has_unresolved_findings: undefined },
  ]) {
    const comment = summary({ ...state, code_review: { ...state.code_review, ...patch } });
    assert.equal(reviewedAndGreen('head', [review], graph, [comment]), false);
  }
  assert.equal(
    reviewedAndGreen('head', [], graph, [summary(state, { ...review.user, id: 99 })]),
    false,
  );
  assert.equal(reviewedAndGreen('head', [], graph, [summary(state), summary(state)]), false);
  const malformed = summary(state);
  malformed.body =
    '<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 invalid-json -->';
  assert.equal(reviewedAndGreen('head', [review], graph, [malformed]), false);
  const unknown = summary(state);
  unknown.body = unknown.body.replace('state:v1', 'state:v2');
  assert.equal(reviewedAndGreen('head', [review], graph, [unknown]), false);
  for (const extra of [
    '\n<!-- codex-review-state:v2 {"code_review":{"status":"running"}} -->',
    '\n<!-- codex-review-state:v1 {\n"code_review":{"status":"running"}} -->',
  ]) {
    const mixed = summary(state);
    mixed.body += extra;
    assert.equal(reviewedAndGreen('head', [review], graph, [mixed]), false);
  }
});
