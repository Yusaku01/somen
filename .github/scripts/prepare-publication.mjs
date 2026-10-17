export async function preparePublication({ github, repo, sha, tag, automatic }) {
  if (automatic) {
    const { data: main } = await github.rest.git.getRef({ ...repo, ref: 'heads/main' });
    if (main.object.sha !== sha)
      throw new Error('Main advanced; wait for its CI before publishing.');
  }
  // getReleaseByTag only returns published releases. listReleases also includes drafts.
  const releases = await github.paginate(github.rest.repos.listReleases, {
    ...repo,
    per_page: 100,
  });
  if (releases.some((release) => release.tag_name === tag && release.draft)) {
    throw new Error('A draft release already exists; review it before publishing.');
  }
  const ref = `tags/${tag}`;
  let existing;
  try {
    existing = (await github.rest.git.getRef({ ...repo, ref })).data;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  if (existing) {
    let object = existing.object;
    for (let depth = 0; object.type === 'tag' && depth < 10; depth++) {
      object = (await github.rest.git.getTag({ ...repo, tag_sha: object.sha })).data.object;
    }
    if (object.type !== 'commit' || object.sha !== sha) {
      throw new Error('Existing tag points to a different commit.');
    }
  } else {
    await github.rest.git.createRef({ ...repo, ref: `refs/${ref}`, sha });
  }
}
