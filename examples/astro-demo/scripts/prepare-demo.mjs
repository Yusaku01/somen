import { cp, mkdir, rm } from 'node:fs/promises';
await mkdir(new URL('../public/', import.meta.url), { recursive: true });
for (const [source, destination] of [['dist', 'runtime'], ['studio', 'studio']]) {
  const target = new URL(`../public/${destination}/`, import.meta.url);
  await rm(target, { recursive: true, force: true });
  await cp(new URL(`../../../packages/core/${source}/`, import.meta.url), target, { recursive: true });
}
