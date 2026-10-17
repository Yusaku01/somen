import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyIssue, runTriage } from './triage.mjs';

test('a roadmap with evidence gets areas and review status without a guessed priority', () => {
  const labels = classifyIssue({
    title: '[Roadmap] 図の拡張',
    body: 'flow-groupを使って説明図を作りたい。examples/astro-demoで実際に表示を確認し、CLIの出力も検証する。',
  });
  assert.ok(labels.includes('roadmap'));
  assert.ok(labels.includes('enhancement'));
  assert.ok(labels.includes('area:core'));
  assert.ok(labels.includes('area:demo'));
  assert.ok(labels.includes('triage:needs-review'));
  assert.ok(!labels.some((label) => /priority|approval/i.test(label)));
});
test('incomplete bugs request information and completed forms reach review', () => {
  assert.ok(classifyIssue({ title: 'bug: broken', body: 'help' }).includes('triage:needs-info'));
  assert.ok(
    classifyIssue({
      title: 'Something changed',
      labels: ['bug'],
      body: '### Steps to reproduce\nResize the request diagram from 800px to 320px.\n### Actual behavior\nThe particle stays at the old position.',
    }).includes('triage:needs-review'),
  );
});
test('triage preserves manual labels and never acts on closed issues or PRs', async () => {
  const added = [],
    removed = [];
  const issue = {
    state: 'open',
    title: 'feat: Improve CLI',
    body: 'Portable CLI exports need to preserve the grouping used in the authoring document.',
    labels: [{ name: 'enhancement' }, { name: 'priority:high' }, { name: 'triage:needs-info' }],
  };
  const github = {
    rest: {
      issues: {
        get: async () => ({ data: issue }),
        getLabel: async () => ({}),
        addLabels: async ({ labels }) => added.push(...labels),
        removeLabel: async ({ name }) => removed.push(name),
      },
    },
  };
  const context = { repo: { owner: 'owner', repo: 'repo' }, payload: { issue: { number: 9 } } };
  await runTriage({ github, context, core: { info() {} } });
  assert.deepEqual(removed, ['triage:needs-info']);
  assert.ok(added.includes('triage:needs-review'));
  assert.ok(!added.includes('priority:high'));
  added.length = 0;
  issue.state = 'closed';
  await runTriage({ github, context, core: { info() {} } });
  assert.equal(added.length, 0);
  issue.state = 'open';
  issue.pull_request = {};
  await runTriage({ github, context, core: { info() {} } });
  assert.equal(added.length, 0);
});

test('empty feature form headings do not count as use-case evidence', () => {
  const labels = classifyIssue({
    title: 'Feature request',
    labels: ['enhancement'],
    body: '### Use case\n_No response_\n\n### Suggested behavior\n_No response_',
  });
  assert.ok(labels.includes('triage:needs-info'));
});
