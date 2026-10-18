const managedStatus = ['triage:needs-info', 'triage:needs-review'];
const definitions = {
  'triage:needs-info': ['d4c5f9', 'More reproduction or use-case evidence is needed'],
  'triage:needs-review': ['fbca04', 'Ready for evidence-based maintainer triage'],
  'area:core': ['1d76db', 'Framework-independent diagram runtime or model'],
  'area:cli': ['1d76db', 'Portable project CLI'],
  'area:demo': ['1d76db', 'Examples and browser presentation'],
  'area:docs': ['1d76db', 'Documentation'],
  'area:automation': ['1d76db', 'Repository development automation'],
  roadmap: ['5319e7', 'A tracked plan with multiple deliverables'],
  bug: ['d73a4a', 'Something is not working as expected'],
  enhancement: ['a2eeef', 'New feature or improvement'],
  documentation: ['0075ca', 'Documentation improvements'],
};

/** Metadata suggestions only: never infer priority, close issues, or approve changes. */
export function classifyIssue({ title = '', body = '', labels = [] }) {
  const text = `${title}\n${body}`;
  const result = new Set();
  const kind =
    labels.find((name) => ['bug', 'enhancement', 'documentation'].includes(name)) ??
    (/^(?:\[bug\]|bug:|fix:)|不具合|回帰|バグ/i.test(title)
      ? 'bug'
      : /^(?:\[roadmap\]|roadmap:|feat:|feature:)|機能追加|拡張|要望/i.test(title)
        ? 'enhancement'
        : /^(?:docs:|\[docs\])|ドキュメント|文書|誤字|typo|readme/i.test(title)
          ? 'documentation'
          : undefined);
  if (kind) result.add(kind);
  if (/^\[roadmap\]|^roadmap:/i.test(title)) result.add('roadmap');
  for (const [area, pattern] of [
    [
      'core',
      /packages\/core\/src|flow-(?:diagram|node|group|connection)|Web Component|レイアウト|ノード/i,
    ],
    ['cli', /\bCLI\b|somen (?:init|validate|export)/i],
    ['demo', /examples\/astro-demo|Astroデモ|Astro demo|スクリーンショット/i],
    ['docs', /\bREADME\b|docs\/|ドキュメント|文書/i],
    ['automation', /GitHub Actions|\.github\/|自動マージ|auto.?merge|自動レビュー|triage/i],
  ])
    if (pattern.test(text)) result.add(`area:${area}`);
  const section = (heading) => {
    const match = body.match(new RegExp(`### ${heading}\\s*\\n([\\s\\S]*?)(?=\\n### |$)`, 'i'));
    const value = match?.[1]?.trim() ?? '';
    return value.length >= 12 && !/^_?No response_?$/i.test(value);
  };
  const sufficient =
    kind === 'bug'
      ? section('Steps to reproduce') && section('Actual behavior')
      : kind === 'enhancement' && /^### Use case/m.test(body)
        ? section('Use case')
        : body.trim().length >= 40;
  result.add(sufficient ? 'triage:needs-review' : 'triage:needs-info');
  return [...result];
}

/** Runs only from the trusted default-branch checkout. Issue text stays data. */
export async function runTriage({ github, context, core }, requestedNumber) {
  const number = context.payload.issue?.number ?? Number(requestedNumber);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error('A positive issue number is required.');
  const repo = context.repo;
  const { data: issue } = await github.rest.issues.get({ ...repo, issue_number: number });
  if (issue.pull_request || issue.state !== 'open') return;
  const existing = issue.labels.map((label) => (typeof label === 'string' ? label : label.name));
  const desired = classifyIssue({ title: issue.title, body: issue.body ?? '', labels: existing });
  for (const name of desired) {
    const [color, description] = definitions[name];
    try {
      await github.rest.issues.getLabel({ ...repo, name });
    } catch (error) {
      if (error.status !== 404) throw error;
      try {
        await github.rest.issues.createLabel({ ...repo, name, color, description });
      } catch (creationError) {
        if (creationError.status !== 422) throw creationError;
      }
    }
  }
  const additions = desired.filter((name) => !existing.includes(name));
  if (additions.length)
    await github.rest.issues.addLabels({ ...repo, issue_number: number, labels: additions });
  // Only the two automation-owned statuses are replaced; maintainer labels survive edits.
  for (const name of managedStatus.filter(
    (name) => existing.includes(name) && !desired.includes(name),
  )) {
    try {
      await github.rest.issues.removeLabel({ ...repo, issue_number: number, name });
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }
  core.info(`Issue #${number}: ${desired.join(', ')}`);
}
