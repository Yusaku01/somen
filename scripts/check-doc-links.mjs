import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ignored = new Set(['.git', '.astro', 'dist', 'node_modules', 'public', 'test-results']);
const ignoredFiles = new Set(['docs/architecture.md', 'docs/verification.md']);
const markdownFiles = [];

function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) collect(join(directory, entry.name));
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      const file = join(directory, entry.name);
      if (!ignoredFiles.has(relative(root, file))) markdownFiles.push(file);
    }
  }
}

collect(root);
const errors = [];

for (const file of markdownFiles) {
  let inFence = false;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    for (const match of line.matchAll(/!?\[[^\]\n]*\]\(([^)]+)\)/g)) {
      const destination = match[1].trim().replace(/^<|>$/g, '').split(/\s+["']/)[0];
      if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(destination)) continue;
      const pathname = destination.split(/[?#]/, 1)[0];
      if (!pathname) continue;
      const target = resolve(pathname.startsWith('/') ? root : dirname(file), decodeURIComponent(pathname.replace(/^\//, '')));
      if (!existsSync(target)) {
        errors.push(`${relative(root, file)}:${index + 1}: missing local link target ${destination}`);
      }
    }
  });
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Checked local links in ${markdownFiles.length} Markdown files.`);
}
