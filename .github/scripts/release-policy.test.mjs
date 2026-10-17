import assert from 'node:assert/strict';
import test from 'node:test';
import {
  internalChange,
  manifestAffectsUsers,
  newerVersion,
  releaseVersion,
} from './release-policy.mjs';
import { automaticReleaseEvent, prepareRelease, successfulChecks } from './prepare-release.mjs';
import { labelRelease } from './label-release.mjs';

const manifest = {
  name: 'somenflow',
  version: '0.1.0-alpha.4',
  engines: { node: '>=22' },
  devDependencies: { typescript: '7.0.2' },
};
const change = (paths, extra = {}) =>
  internalChange({
    files: paths.map((filename) => ({ filename })),
    complete: true,
    ...extra,
  });

test('CI, private development dependencies and package devDependencies stay internal', () => {
  assert.equal(change(['.github/workflows/ci.yml', 'pnpm-lock.yaml', 'package.json']), true);
  assert.equal(
    change(['packages/core/package.json', 'pnpm-lock.yaml'], {
      manifests: {
        before: manifest,
        after: { ...manifest, devDependencies: { typescript: '8.0.0' } },
      },
    }),
    true,
  );
});

test('published dependencies, engines, build behavior and mixed changes stay visible', () => {
  for (const update of [
    { dependencies: { runtime: '1.0.0' } },
    { engines: { node: '>=24' } },
    { scripts: { prepack: 'new-build' } },
  ]) {
    const after = { ...manifest, ...update };
    assert.equal(manifestAffectsUsers(manifest, after), true);
    assert.equal(
      change(['packages/core/package.json'], { manifests: { before: manifest, after } }),
      false,
    );
  }
  assert.equal(change(['.github/workflows/ci.yml', 'packages/core/src/index.ts']), false);
  assert.equal(change(['packages/core/README.md']), false);
  assert.equal(change(['unknown-config.json']), false);
});

test('missing evidence, renames out of source and security overrides never hide changes', () => {
  assert.equal(change(['packages/core/package.json']), false);
  assert.equal(change(['.github/workflows/ci.yml'], { complete: false }), false);
  assert.equal(change([]), false);
  assert.equal(
    internalChange({
      files: [
        { filename: 'packages/core/test/old.ts', previous_filename: 'packages/core/src/old.ts' },
      ],
      complete: true,
    }),
    false,
  );
  for (const label of ['release:include', 'release:security', 'release:breaking']) {
    assert.equal(change(['pnpm-lock.yaml'], { labels: [label] }), false);
  }
});

test('version metadata alone is not user impact; object key order is immaterial', () => {
  assert.equal(manifestAffectsUsers(manifest, { ...manifest, version: '0.1.0-alpha.5' }), false);
  assert.equal(
    manifestAffectsUsers(
      { engines: { npm: '>=10', node: '>=22' } },
      { engines: { node: '>=22', npm: '>=10' } },
    ),
    false,
  );
});

test('release versions advance while retaining the selected prerelease channel', () => {
  assert.equal(newerVersion('0.1.0-alpha.5', '0.1.0-alpha.4'), true);
  assert.equal(newerVersion('0.1.0-alpha.10', '0.1.0-alpha.9'), true);
  assert.equal(newerVersion('0.1.0', '0.1.0-rc.2'), true);
  assert.equal(newerVersion('0.1.0-alpha.5', '0.1.0'), false);
  assert.equal(newerVersion('0.1.0-alpha.4', '0.1.0-alpha.4'), false);
  assert.equal(newerVersion('0.1.0-alpha.3', '0.1.0-alpha.4'), false);
  assert.equal(releaseVersion('0.1.0-alpha.5').channel, 'alpha');
  assert.equal(releaseVersion('0.1.0').channel, 'latest');
  for (const version of ['v0.1.0', '0.1.0-alpha.05', '0.1.0-unknown.1', '0.01.0']) {
    assert.throws(() => releaseVersion(version));
  }
});

const context = {
  eventName: 'workflow_run',
  repo: { owner: 'Yusaku01', repo: 'somen' },
  payload: {
    workflow_run: {
      event: 'push',
      head_branch: 'main',
      head_repository: { full_name: 'Yusaku01/somen' },
      path: '.github/workflows/ci.yml',
      conclusion: 'success',
      head_sha: 'a'.repeat(40),
    },
  },
};

test('only the successful canonical main push CI event can trigger an automatic release', () => {
  assert.equal(automaticReleaseEvent(context), true);
  for (const update of [
    { event: 'pull_request' },
    { head_branch: 'feature' },
    { conclusion: 'failure' },
    { head_repository: { full_name: 'attacker/somen' } },
    { path: '.github/workflows/other.yml' },
  ]) {
    assert.equal(
      automaticReleaseEvent({
        ...context,
        payload: { workflow_run: { ...context.payload.workflow_run, ...update } },
      }),
      false,
    );
  }
});

const checks = ['Checks', 'Analyze (actions)', 'Analyze (javascript-typescript)'].map(
  (name, index) => ({
    id: index + 1,
    name,
    app: { id: 15368 },
    status: 'completed',
    conclusion: 'success',
  }),
);

test('all current official check results must succeed; stale or spoofed successes cannot pass', () => {
  assert.equal(successfulChecks(checks), true);
  assert.equal(successfulChecks(checks.slice(1)), false);
  assert.equal(successfulChecks(checks.map((check) => ({ ...check, app: { id: 1 } }))), false);
  assert.equal(
    successfulChecks([...checks, { ...checks[0], id: 9, conclusion: 'failure' }]),
    false,
  );
  assert.equal(
    successfulChecks([...checks, { ...checks[0], id: 9, status: 'in_progress', conclusion: null }]),
    false,
  );
});

test('a superseded main run exits before inspecting or publishing a version', async () => {
  const outputs = {};
  await prepareRelease({
    context,
    core: {
      info() {},
      setOutput: (name, value) => {
        outputs[name] = value;
      },
    },
    github: {
      rest: { git: { getRef: async () => ({ data: { object: { sha: 'b'.repeat(40) } } }) } },
    },
  });
  assert.deepEqual(outputs, { ready: 'false' });
});

test('labeler preserves unrelated/manual labels and removes stale internal classification', async () => {
  const removed = [];
  const added = [];
  const pr = {
    labels: [{ name: 'release:internal' }, { name: 'dependencies' }, { name: 'release:security' }],
    changed_files: 1,
  };
  await labelRelease({
    context,
    number: 7,
    github: {
      paginate: async () => [{ filename: 'pnpm-lock.yaml' }],
      rest: {
        pulls: { get: async () => ({ data: pr }), listFiles() {} },
        issues: {
          getLabel: async () => ({}),
          addLabels: async (args) => added.push(args),
          removeLabel: async (args) => removed.push(args.name),
        },
      },
    },
  });
  assert.deepEqual(removed, ['release:internal']);
  assert.deepEqual(added, []);
});

async function planFixture({
  paths = 'packages/core/src/model.ts',
  included = false,
  tagged = false,
  checksForRelease = checks,
  advanceMain = false,
} = {}) {
  const outputs = {};
  let mainReads = 0;
  const mainSha = context.payload.workflow_run.head_sha;
  const github = {
    paginate: async (method) => {
      if (method === 'releases') return [{ tag_name: 'v0.1.0-alpha.4', draft: false }];
      if (method === 'pulls')
        return included
          ? [
              {
                merged_at: '2026-10-17',
                merge_commit_sha: mainSha,
                labels: [{ name: 'release:security' }],
              },
            ]
          : [];
      return checksForRelease;
    },
    rest: {
      git: {
        getRef: async ({ ref }) => {
          if (ref.startsWith('tags/')) {
            if (tagged) return { data: { object: { sha: mainSha } } };
            throw Object.assign(new Error('Not Found'), { status: 404 });
          }
          mainReads++;
          return {
            data: { object: { sha: advanceMain && mainReads > 1 ? 'b'.repeat(40) : mainSha } },
          };
        },
      },
      repos: { listReleases: 'releases' },
      pulls: { list: 'pulls' },
      checks: { listForRef: 'checks' },
    },
  };
  await prepareRelease({
    github,
    context,
    core: {
      info() {},
      setOutput: (name, value) => {
        outputs[name] = value;
      },
    },
    wait: async () => {},
    runGit: (...args) => {
      if (args[0] === 'show')
        return JSON.stringify({
          ...manifest,
          version: args[1].startsWith(mainSha) ? '0.1.0-alpha.5' : manifest.version,
        });
      if (args[0] === 'rev-list') return mainSha;
      if (args[0] === 'diff') return paths;
      if (args[0] === 'merge-base') return '';
      throw new Error(`Unexpected git call: ${args.join(' ')}`);
    },
  });
  return outputs;
}

test('a reviewed version advance plus user changes and successful checks prepares an alpha release', async () => {
  const outputs = await planFixture();
  assert.equal(outputs.ready, 'true');
  assert.equal(outputs.tag, 'v0.1.0-alpha.5');
  assert.equal(outputs.dist_tag, 'alpha');
  assert.equal(outputs.prerelease, 'true');
  assert.equal(outputs.sha, context.payload.workflow_run.head_sha);
});

test('maintenance or version-only changes cannot cause an automatic package release', async () => {
  assert.deepEqual(await planFixture({ paths: '' }), { ready: 'false' });
  assert.deepEqual(await planFixture({ tagged: true }), { ready: 'false' });
});

test('explicit user security impact can release a development-tool fix', async () => {
  assert.equal((await planFixture({ paths: '', included: true })).ready, 'true');
});

test('missing/failed checks or main advancing cannot prepare publication', async () => {
  await assert.rejects(planFixture({ checksForRelease: [] }), /CI and CodeQL must succeed/);
  assert.deepEqual(await planFixture({ advanceMain: true }), { ready: 'false' });
});
