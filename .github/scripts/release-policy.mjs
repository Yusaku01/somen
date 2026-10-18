// This module is also used by the labeler. Unknown changes stay visible in notes.
export const releaseLabels = {
  'release:internal': ['ededed', 'CI, development tools, or other internal maintenance'],
  'release:include': ['0e8a16', 'Explicitly include a user-facing release change'],
  'release:skip': ['ededed', 'Explicitly omit this PR from release notes'],
  'release:feature': ['a2eeef', 'New capability for package users'],
  'release:fix': ['d73a4a', 'Correction for package users'],
  'release:breaking': ['b60205', 'Requires migration by package users'],
  'release:security': ['b60205', 'Security impact for package users'],
};

function publishedManifest(manifest) {
  const { version: _version, devDependencies: _devDependencies, ...published } = manifest;
  return published;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

export function manifestAffectsUsers(before, after) {
  return (
    JSON.stringify(canonical(publishedManifest(before))) !==
    JSON.stringify(canonical(publishedManifest(after)))
  );
}

export function explicitlyIncluded(labels) {
  return ['release:include', 'release:security', 'release:breaking'].some((label) =>
    labels.includes(label),
  );
}

export function internalChange({ files, complete, labels = [], manifests }) {
  if (!complete || files.length === 0 || explicitlyIncluded(labels)) return false;
  return files.every((file) => {
    // Both sides of a rename matter: moving published code into tests is a removal.
    return [file.filename, file.previous_filename].filter(Boolean).every((path) => {
      if (path === 'packages/core/package.json') {
        return Boolean(manifests) && !manifestAffectsUsers(manifests.before, manifests.after);
      }
      return (
        /^(?:\.github\/|\.agents\/|scripts\/|examples\/|packages\/core\/test\/)/.test(path) ||
        /^(?:AGENTS\.md|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.node-version|\.gitignore|\.markdownlint-cli2\.jsonc|lefthook\.yml|fallow\.toml|vite\.config\.ts|playwright\.config\.ts)$/.test(
          path,
        )
      );
    });
  });
}

export function releaseVersion(version) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/.exec(version);
  if (!match) throw new Error(`Unsupported release version: ${version}`);
  return {
    numbers: match.slice(1, 4).map(Number),
    channel: match[4] || 'latest',
    iteration: match[5] ? Number(match[5]) : 0,
    prerelease: Boolean(match[4]),
  };
}

export function newerVersion(candidate, previous) {
  const a = releaseVersion(candidate);
  const b = releaseVersion(previous);
  const rank = { alpha: 0, beta: 1, rc: 2, latest: 3 };
  const left = [...a.numbers, rank[a.channel], a.iteration];
  const right = [...b.numbers, rank[b.channel], b.iteration];
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}
