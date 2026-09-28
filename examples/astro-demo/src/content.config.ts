import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const articles = defineCollection({
  loader: glob({ base: './src/content/articles', pattern: '**/*.{md,mdx}' }),
  schema: z.object({ title: z.string() }),
});

const diagrams = defineCollection({
  loader: glob({ base: './src/content/diagrams', pattern: '**/*.json' }),
});

export const collections = { articles, diagrams };
