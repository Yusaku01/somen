#!/usr/bin/env node
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument, toMarkup, escapeHTML, exampleDocument } from '../dist/model.js';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const [command, input] = args;
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}
const load = async (path) => {
  if (!path || path.startsWith('--')) throw new Error('Specify a diagram JSON file.');
  return parseDocument(JSON.parse(await readFile(resolve(path), 'utf8')));
};
const help = `somen — coordinate-free native SVG diagrams

  somen init [diagram.json]             Create a project (never overwrites a file)
  somen validate diagram.json           Validate the shared authoring format
  somen export diagram.json --out DIR [--lang ja]  Create a portable HTML + runtime folder

Exported folders can be hosted by any static HTTP server. No Astro is needed.
`;

try {
  if (!command || ['help', '--help', '-h'].includes(command)) process.stdout.write(help);
  else if (command === 'init') {
    const target = resolve(input ?? 'diagram.json');
    await writeFile(target, JSON.stringify(exampleDocument, null, 2) + '\n', { flag: 'wx' });
    process.stdout.write(`Created ${target}\n`);
  } else if (command === 'validate') {
    const doc = await load(input);
    process.stdout.write(
      JSON.stringify({
        valid: true,
        version: doc.version,
        nodes: doc.nodes.length,
        connections: doc.connections.length,
      }) + '\n',
    );
  } else if (command === 'export') {
    const doc = await load(input);
    const language = option('--lang', 'ja');
    if (!/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(language))
      throw new Error('--lang must be a language tag such as ja or en-US.');
    const out = resolve(option('--out', 'flow-export'));
    // Require a fresh folder, preventing accidental replacement of an existing site.
    await mkdir(dirname(out), { recursive: true });
    await mkdir(out);
    await cp(join(packageRoot, 'dist'), join(out, 'runtime'), { recursive: true });
    await writeFile(join(out, 'diagram.json'), JSON.stringify(doc, null, 2) + '\n');
    await writeFile(
      join(out, 'index.html'),
      `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(doc.label)}</title>
<style>body{margin:0;font-family:system-ui;background:#0f172a;color:#e2e8f0}main{box-sizing:border-box;width:min(100%,800px);margin:3rem auto;padding:1rem}flow-diagram{display:block}flow-node:not(:defined){display:block;padding:1rem}flow-connection:not(:defined){display:none}</style>
<script type="module" src="./runtime/register.js"></script></head><body><main>
${toMarkup(doc)}
</main></body></html>\n`,
    );
    process.stdout.write(`Exported ${out}/index.html\n`);
  } else throw new Error(`Unknown command: ${command}. Run somen --help.`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
