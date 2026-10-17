const LABEL = 'Auto Approval';
export const REVIEW_MARKER = '<!-- somen-code-review:pass -->';
const OWN_MARKER = '<!-- somen-auto-approval -->';
const CODEX_ID = 199175422;
const BOT = 'github-actions[bot]';
const prosePaths = new Set(['README.md', 'README.ja.md', 'packages/core/README.md']);

function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) {
      next.push(Math.min(next[j] + 1, previous[j + 1] + 1, previous[j] + (a[i] === b[j] ? 0 : 1)));
    }
    previous = next;
  }
  return previous[b.length];
}

function paragraphAt(lines, index) {
  let fence;
  for (let i = 0; i <= index; i++) {
    if (!fence && /[<>]/.test(lines[i])) return false;
    const match = lines[i].match(/^ {0,3}(`{3,}|~{3,})/);
    if (match) {
      if (!fence) fence = match[1];
      else if (
        match[1][0] === fence[0] &&
        match[1].length >= fence.length &&
        /^ {0,3}[`~]+\s*$/.test(lines[i])
      )
        fence = undefined;
    }
    if (i === index && (match || fence)) return false;
  }
  const line = lines[index];
  if (/^ {0,3}[-=]+\s*$/.test(lines[index + 1] ?? '')) return false;
  return (
    line.length > 0 &&
    line.length <= 500 &&
    !/^[\s#>*+\-\d]|[`~<>|[\]{}\\/=:_*@\d]|https?\b|www\./i.test(line) &&
    !/\b(api|must|shall|required|default|license|security|permission|copyright|not|never|npm|pnpm|npx|node|git|gh|yarn|bun|deno|docker|curl|wget|make|python|run|execute|install)\b|必須|禁止|既定|ライセンス|セキュリティ|権限|できな|ならない|ません|ない/iu.test(
      line,
    )
  );
}

// Read complete base/head blobs: a harmless-looking patch inside a code fence is still code.
export function isTrivial(pr, files) {
  if (
    pr.state !== 'open' ||
    pr.draft ||
    pr.base.ref !== 'main' ||
    !pr.head.repo ||
    pr.head.repo.full_name !== pr.base.repo.full_name ||
    !/^docs(?:\([a-z-]+\))?:\s/.test(pr.title) ||
    /\[(?:skip ci|ci skip)\]/i.test(pr.title) ||
    files.length === 0 ||
    files.length > 2 ||
    files.length !== pr.changed_files
  )
    return false;

  let edits = 0;
  let linesChanged = 0;
  for (const file of files) {
    if (!prosePaths.has(file.filename) || file.status !== 'modified') return false;
    if (typeof file.before !== 'string' || typeof file.after !== 'string') return false;
    if (file.before.length > 65_536 || file.after.length > 65_536) return false;
    const before = file.before.split('\n');
    const after = file.after.split('\n');
    if (before.length !== after.length) return false;
    let additions = 0;
    for (let i = 0; i < before.length; i++) {
      if (before[i] === after[i]) continue;
      if (!paragraphAt(before, i) || !paragraphAt(after, i)) return false;
      additions++;
      linesChanged++;
      edits += distance(before[i], after[i]);
    }
    if (!additions || file.additions !== additions || file.deletions !== additions) return false;
  }
  return edits > 0 && edits <= 12 && linesChanged <= 4;
}

function latestReviews(reviews) {
  const latest = new Map();
  for (const review of [...reviews].sort((a, b) => a.id - b.id)) {
    if (review.state !== 'PENDING') latest.set(review.user.login, review);
  }
  return [...latest.values()];
}

export function reviewedAndGreen(head, reviews, graph) {
  if (graph.reviewDecision === 'CHANGES_REQUESTED') return false;
  if (graph.headRefOid !== head || graph.reviewThreads.pageInfo.hasNextPage) return false;
  if (graph.reviewThreads.nodes.some((thread) => !thread.isResolved)) return false;
  const latest = latestReviews(reviews);
  const opinions = latestReviews(reviews.filter((review) => review.state !== 'COMMENTED'));
  if (opinions.some((review) => review.state === 'CHANGES_REQUESTED')) return false;
  const cleanReview = latest.some(
    (review) =>
      review.user.id === CODEX_ID &&
      review.user.type === 'Bot' &&
      review.user.login === 'chatgpt-codex-connector[bot]' &&
      review.commit_id === head &&
      (review.state === 'APPROVED' ||
        (review.state === 'COMMENTED' && review.body.split('\n').includes(REVIEW_MARKER))),
  );
  const rollup = graph.commits.nodes[0]?.commit;
  if (!cleanReview || rollup?.oid !== head || !rollup.statusCheckRollup) return false;
  const checks = rollup.statusCheckRollup;
  if (checks.state !== 'SUCCESS' || checks.contexts.pageInfo.hasNextPage) return false;
  return checks.contexts.nodes.some(
    (check) =>
      check.__typename === 'CheckRun' &&
      check.name === 'Checks' &&
      check.status === 'COMPLETED' &&
      check.conclusion === 'SUCCESS' &&
      check.checkSuite?.app?.databaseId === 15368,
  );
}

const QUERY = `query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) { pullRequest(number: $number) {
    headRefOid baseRefOid reviewDecision autoMergeRequest { enabledBy { login } }
    reviewThreads(first: 100) { pageInfo { hasNextPage } nodes { isResolved } }
    commits(last: 1) { nodes { commit { oid statusCheckRollup {
      state contexts(first: 100) { pageInfo { hasNextPage } nodes {
        __typename ... on CheckRun { name status conclusion checkSuite { app { databaseId } } }
      } }
    } } } }
  } }
}`;

export async function reconcile({ github, context, core }, number) {
  const repo = context.repo;
  const key = { ...repo, pull_number: number };
  const { data: pr } = await github.rest.pulls.get(key);
  if (pr.state !== 'open') return;
  const graph = (await github.graphql(QUERY, { ...repo, number })).repository.pullRequest;
  const reviews = await github.paginate(github.rest.pulls.listReviews, { ...key, per_page: 100 });
  const ownedReviews = reviews.filter(
    (review) =>
      review.user.login === BOT &&
      review.user.type === 'Bot' &&
      review.state === 'APPROVED' &&
      review.body.includes(OWN_MARKER),
  );
  const withdraw = () => revokeCurrent({ github, context }, number);

  // API metadata and contents are data only; never import, check out, or run PR code here.
  const files = await github.paginate(github.rest.pulls.listFiles, { ...key, per_page: 100 });
  if (
    files.length <= 2 &&
    files.every((file) => prosePaths.has(file.filename) && file.status === 'modified')
  ) {
    for (const file of files) {
      for (const [property, ref] of [
        ['before', pr.base.sha],
        ['after', pr.head.sha],
      ]) {
        const { data } = await github.rest.repos.getContent({ ...repo, path: file.filename, ref });
        if (data.type !== 'file' || data.encoding !== 'base64' || data.size > 65_536) break;
        file[property] = new TextDecoder('utf-8', { fatal: true }).decode(
          Buffer.from(data.content, 'base64'),
        );
      }
    }
  }
  if (
    !isTrivial(pr, files) ||
    graph.autoMergeRequest ||
    graph.baseRefOid !== pr.base.sha ||
    !reviewedAndGreen(pr.head.sha, reviews, graph)
  ) {
    await withdraw();
    core.info(
      `PR #${number}: waiting for trivial prose, current-head review, and successful Checks.`,
    );
    return;
  }
  const { data: fresh } = await github.rest.pulls.get(key);
  if (
    fresh.head.sha !== pr.head.sha ||
    fresh.base.sha !== pr.base.sha ||
    !isTrivial(fresh, files)
  ) {
    await withdraw();
    return;
  }
  try {
    await github.rest.issues.getLabel({ ...repo, name: LABEL });
  } catch (error) {
    if (error.status !== 404) throw error;
    try {
      await github.rest.issues.createLabel({
        ...repo,
        name: LABEL,
        color: 'c5def5',
        description: 'Trivial prose; independent current-head review and CI passed.',
      });
    } catch (creationError) {
      if (creationError.status !== 422) throw creationError;
    }
  }
  try {
    await github.rest.issues.addLabels({ ...repo, issue_number: number, labels: [LABEL] });
    if (!ownedReviews.some((review) => review.commit_id === pr.head.sha)) {
      await github.rest.pulls.createReview({
        ...key,
        commit_id: pr.head.sha,
        event: 'APPROVE',
        body: `${OWN_MARKER}\nTrivial prose passed independent current-head code review and CI.`,
      });
    }
    // Normal merge permission enforces branch protection; sha rejects a concurrent push.
    const { data: result } = await github.rest.pulls.merge({
      ...key,
      sha: pr.head.sha,
      merge_method: 'squash',
    });
    if (!result.merged) throw new Error('Protected merge was not completed.');
  } catch (error) {
    // Refetch so a just-created approval/label is also revoked after a failed merge.
    await revokeCurrent({ github, context }, number);
    throw error;
  }
  core.info(`PR #${number}: protected automatic merge completed at ${pr.head.sha}.`);
}

async function revokeCurrent({ github, context }, number) {
  const repo = context.repo;
  const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: number });
  if (pr.state !== 'open') return;
  const errors = [];
  if (pr.labels.some((label) => label.name === LABEL)) {
    try {
      await github.rest.issues.removeLabel({ ...repo, issue_number: number, name: LABEL });
    } catch (error) {
      if (error.status !== 404) errors.push(error);
    }
  }
  const reviews = await github.paginate(github.rest.pulls.listReviews, {
    ...repo,
    pull_number: number,
    per_page: 100,
  });
  for (const review of reviews) {
    if (
      review.user.login === BOT &&
      review.user.type === 'Bot' &&
      review.state === 'APPROVED' &&
      review.body.includes(OWN_MARKER)
    ) {
      try {
        await github.rest.pulls.dismissReview({
          ...repo,
          pull_number: number,
          review_id: review.id,
          message: 'Automatic approval conditions no longer hold.',
        });
      } catch (error) {
        errors.push(error);
      }
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Automatic approval cleanup failed.');
}

export async function runAutoApproval(deps, requestedNumber = '') {
  let numbers;
  if (requestedNumber) {
    if (!/^[1-9]\d*$/.test(requestedNumber) || !Number.isSafeInteger(Number(requestedNumber))) {
      throw new Error('A positive pull request number is required.');
    }
    numbers = [Number(requestedNumber)];
  } else if (deps.context.payload.pull_request) {
    numbers = [deps.context.payload.pull_request.number];
  } else {
    const pulls = await deps.github.paginate(deps.github.rest.pulls.list, {
      ...deps.context.repo,
      state: 'open',
      per_page: 100,
    });
    numbers = pulls.map((pr) => pr.number);
  }
  for (const number of numbers) {
    try {
      await reconcile(deps, number);
    } catch (error) {
      try {
        await revokeCurrent(deps, number);
      } catch (cleanupError) {
        deps.core.setFailed(
          `PR #${number}: could not revoke automatic approval: ${cleanupError.message}`,
        );
      }
      deps.core.setFailed(`PR #${number}: ${error.message}`);
    }
  }
}
