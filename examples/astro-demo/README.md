# Use Somen in Astro

[Getting started](../../README.md) · [API reference](../../docs/api.md)

Install `somenflow@alpha` in the Astro project. Register the custom elements once in a `<script>` in the page or layout that displays diagrams, as shown below.

## Markdown and MDX

Write the [HTML diagram example](../../README.md#add-a-diagram) directly in `.md` or `.mdx` content. MDX needs the `@astrojs/mdx` integration. Register the elements in the containing `.astro` page or layout so the browser can render the diagram:

```astro
---
import { getEntry, render } from 'astro:content';
const entry = await getEntry('articles', 'example');
if (!entry) throw new Error('Article not found');
const { Content } = await render(entry);
---
<Content />
<script>import 'somenflow/register';</script>
```

The snippet assumes an `articles` collection with an `example` entry. The demo includes [Markdown](src/content/articles/markdown.md) and [MDX](src/content/articles/mdx.mdx) examples rendered by the [article page](src/pages/content/%5Bid%5D.astro).

## Structured data

For JSON managed by Astro's Content Layer API, validate the entry data and convert it to custom-element HTML:

```astro
---
import { getEntry } from 'astro:content';
import { parseDocument, toMarkup } from 'somenflow';

const entry = await getEntry('diagrams', 'request-flow');
if (!entry) throw new Error('Diagram not found');
const markup = toMarkup(parseDocument(entry.data));
---
<div set:html={markup} />
<script>import 'somenflow/register';</script>
```

This example assumes a `diagrams` collection containing a `request-flow` entry in Somen's [JSON project format](../../docs/api.md#json-projects). See the demo's [collection configuration](src/content.config.ts), [JSON entry](src/content/diagrams/request-flow.json), and [data page](src/pages/data.astro).

Astro's `set:html` inserts HTML without escaping it. Pass the output of `toMarkup()`, which validates project data and escapes labels and attributes, rather than an untrusted HTML string.

## Run the demo

Follow the [repository setup](../../CONTRIBUTING.md#local-setup), then run these commands from the repository root:

```sh
pnpm dev
```

To build the demo:

```sh
pnpm --dir examples/astro-demo build
```

The [examples page](src/pages/examples.astro) shows branches, reverse connections, and appearance customization.
