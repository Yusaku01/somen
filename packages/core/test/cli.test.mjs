import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('../cli/index.mjs', import.meta.url));
test('CLI creates, validates and exports a portable project without overwriting files', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'somen-cli-'));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
  try {
    assert.equal(run('init').status, 0);
    const original = await readFile(join(cwd, 'diagram.json'), 'utf8');
    assert.notEqual(run('init').status, 0);
    assert.equal(await readFile(join(cwd, 'diagram.json'), 'utf8'), original);
    assert.deepEqual(JSON.parse(run('validate', 'diagram.json').stdout), {
      valid: true,
      version: 1,
      nodes: 2,
      connections: 2,
    });
    assert.equal(run('export', 'diagram.json', '--out', 'site').status, 0);
    await access(join(cwd, 'site/runtime/register.js'));
    const html = await readFile(join(cwd, 'site/index.html'), 'utf8');
    assert.match(html, /<flow-diagram/);
    assert.ok(!html.includes('astro'));
    assert.notEqual(run('export', 'diagram.json', '--out', 'site').status, 0);
    await writeFile(join(cwd, 'invalid.json'), '{"version":99}');
    assert.notEqual(run('validate', 'invalid.json').status, 0);
    assert.notEqual(run('something-else').status, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
