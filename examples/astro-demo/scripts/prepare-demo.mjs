import { cp, mkdir, rm } from 'node:fs/promises';
await mkdir(new URL('../public/', import.meta.url), { recursive: true });
const target = new URL('../public/runtime/', import.meta.url);
await rm(target, { recursive: true, force: true });
await cp(new URL('../../../packages/core/dist/', import.meta.url), target, { recursive: true });
