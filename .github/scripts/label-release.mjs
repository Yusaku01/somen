import { internalChange, releaseLabels } from './release-policy.mjs';

export async function labelRelease({ github, context, number }) {
  const repo = context.repo;
  const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: number });
  const files = await github.paginate(github.rest.pulls.listFiles, {
    ...repo,
    pull_number: number,
    per_page: 100,
  });
  const labels = pr.labels.map(({ name }) => name);
  let manifests;
  if (files.some(({ filename }) => filename === 'packages/core/package.json')) {
    // Read JSON as data, never execute a contributor's code in this privileged job.
    const read = async (ref) => {
      const { data } = await github.rest.repos.getContent({
        ...repo,
        path: 'packages/core/package.json',
        ref,
      });
      return JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
    };
    try {
      manifests = { before: await read(pr.base.sha), after: await read(pr.head.sha) };
    } catch {
      // Missing or unreadable manifests must not hide a change from release notes.
      manifests = undefined;
    }
  }
  for (const [name, [color, description]] of Object.entries(releaseLabels)) {
    try {
      await github.rest.issues.getLabel({ ...repo, name });
    } catch (error) {
      if (error.status !== 404) throw error;
      try {
        await github.rest.issues.createLabel({ ...repo, name, color, description });
      } catch (createError) {
        if (createError.status !== 422) throw createError;
      }
    }
  }
  const internal = internalChange({
    files,
    complete: files.length === pr.changed_files,
    labels,
    manifests,
  });
  if (internal) {
    if (!labels.includes('release:internal')) {
      await github.rest.issues.addLabels({
        ...repo,
        issue_number: number,
        labels: ['release:internal'],
      });
    }
  } else if (labels.includes('release:internal')) {
    await github.rest.issues.removeLabel({
      ...repo,
      issue_number: number,
      name: 'release:internal',
    });
  }
  return { number, internal };
}
