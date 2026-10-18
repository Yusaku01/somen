import { execFileSync } from 'node:child_process';
import {
  explicitlyIncluded,
  manifestAffectsUsers,
  newerVersion,
  releaseVersion,
} from './release-policy.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

export function automaticReleaseEvent(context) {
  const run = context.payload.workflow_run;
  return (
    context.eventName === 'workflow_run' &&
    run?.event === 'push' &&
    run.head_branch === 'main' &&
    run.head_repository?.full_name === `${context.repo.owner}/${context.repo.repo}` &&
    run.path === '.github/workflows/ci.yml' &&
    run.conclusion === 'success'
  );
}

export function successfulChecks(checks) {
  return ['Checks', 'Analyze (actions)', 'Analyze (javascript-typescript)'].every((name) => {
    const latest = checks
      .filter((check) => check.name === name && check.app?.id === 15368)
      .sort((a, b) => b.id - a.id)[0];
    return latest?.status === 'completed' && latest.conclusion === 'success';
  });
}

export async function prepareRelease({
  github,
  context,
  core,
  runGit = git,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const manifestAt = (ref) => JSON.parse(runGit('show', `${ref}:packages/core/package.json`));
  const repo = context.repo;
  const automatic = context.eventName === 'workflow_run';
  const skip = (reason) => {
    core.info(reason);
    core.setOutput('ready', 'false');
  };
  if (automatic && !automaticReleaseEvent(context))
    return skip('Not a successful main push CI run.');
  const { data: main } = await github.rest.git.getRef({ ...repo, ref: 'heads/main' });
  let sha;
  if (automatic) {
    sha = context.payload.workflow_run.head_sha;
    if (sha !== main.object.sha) return skip('A newer main commit must finish CI first.');
  } else {
    const tag =
      context.eventName === 'workflow_dispatch'
        ? context.payload.inputs?.tag
        : context.ref.replace('refs/tags/', '');
    if (!/^v\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/.test(tag || '')) {
      throw new Error('Retry requires an existing v<version> tag.');
    }
    sha = runGit('rev-parse', '--verify', `refs/tags/${tag}^{commit}`);
    if (manifestAt(sha).version !== tag.slice(1))
      throw new Error('Tag and package version differ.');
  }
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Invalid release commit.');
  runGit('merge-base', '--is-ancestor', sha, 'origin/main');
  const version = manifestAt(sha).version;
  const meta = releaseVersion(version);
  const tag = `v${version}`;
  if (automatic) {
    try {
      await github.rest.git.getRef({ ...repo, ref: `tags/${tag}` });
      return skip('Version already tagged; maintenance changes do not trigger publication.');
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
  const releases = await github.paginate(github.rest.repos.listReleases, {
    ...repo,
    per_page: 100,
  });
  const published = releases
    .filter((release) => !release.draft && release.tag_name !== tag)
    .filter((release) => /^v\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/.test(release.tag_name))
    .sort((a, b) => (newerVersion(a.tag_name.slice(1), b.tag_name.slice(1)) ? -1 : 1));
  const previous = published[0]?.tag_name;
  if (!previous) throw new Error('A previous published release is required for comparison.');
  if (!newerVersion(version, previous.slice(1))) throw new Error('Release version must advance.');
  runGit('merge-base', '--is-ancestor', `${previous}^{commit}`, sha);
  const commits = new Set(runGit('rev-list', `${previous}..${sha}`).split('\n'));
  const prs = await github.paginate(github.rest.pulls.list, {
    ...repo,
    state: 'closed',
    per_page: 100,
  });
  const included = prs.some(
    (pr) =>
      pr.merged_at &&
      commits.has(pr.merge_commit_sha) &&
      explicitlyIncluded(pr.labels.map(({ name }) => name)),
  );
  const paths = runGit(
    'diff',
    '--name-only',
    previous,
    sha,
    '--',
    'packages/core/src',
    'packages/core/cli',
  );
  const consumerChange =
    Boolean(paths) || manifestAffectsUsers(manifestAt(previous), manifestAt(sha));
  if (!consumerChange && !included)
    return skip('No package change or explicit release impact since the previous release.');

  // CI and CodeQL run independently. Wait for their results at this exact commit.
  let passed = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const checks = await github.paginate(github.rest.checks.listForRef, {
      ...repo,
      ref: sha,
      per_page: 100,
    });
    if (successfulChecks(checks)) {
      passed = true;
      break;
    }
    await wait(10000);
  }
  if (!passed) throw new Error('CI and CodeQL must succeed at the release commit.');
  if (automatic) {
    const { data: current } = await github.rest.git.getRef({ ...repo, ref: 'heads/main' });
    if (current.object.sha !== sha) return skip('Main advanced while checks were running.');
  }
  for (const [name, value] of Object.entries({
    ready: true,
    sha,
    tag,
    version,
    previous,
    dist_tag: meta.channel,
    prerelease: meta.prerelease,
  }))
    core.setOutput(name, String(value));
}
