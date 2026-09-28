# Somen

[Source on GitHub](https://github.com/Yusaku01/somen) · [日本語](https://github.com/Yusaku01/somen/blob/main/README.ja.md)

Somen displays animated flow diagrams from HTML nodes and connections. It uses Web Components and native SVG motion, with no runtime dependencies. The layout adapts to the diagram's width.

This is an alpha release under the MIT license.

## Install

Install Somen in the project that will use it:

```sh
npm install somenflow@alpha
```

The CLI requires Node.js 22 or later. Bare `somenflow` imports in a browser page require a bundler or import map; `somen export` creates a page with relative module paths when neither is available.

## Add a diagram

Register the elements once in a browser-side entry point. In Astro, put the import in a `<script>` tag.

```js
import 'somenflow/register';
```

```html
<flow-diagram label="Request flow" autoplay>
  <flow-node name="client">Client</flow-node>
  <flow-connection label="Request"></flow-connection>
  <flow-node name="api">API</flow-node>
</flow-diagram>
```

Placing a connection between two nodes lets Somen infer its endpoints. Set `from` and `to` to node names for branches or reverse connections. Nodes appear in the order written. The default `layout="auto"` changes from a row to a column when space is limited.

## Use in Astro content

Write the same `<flow-diagram>` markup directly in `.md` or `.mdx` content. MDX needs the `@astrojs/mdx` integration. Register the elements in the containing `.astro` page or layout so the browser can render the diagram:

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

The repository has working [Markdown](https://github.com/Yusaku01/somen/blob/main/examples/astro-demo/src/content/articles/markdown.md), [MDX](https://github.com/Yusaku01/somen/blob/main/examples/astro-demo/src/content/articles/mdx.mdx), and [Content Layer JSON](https://github.com/Yusaku01/somen/blob/main/examples/astro-demo/src/content/diagrams/request-flow.json) examples. For structured data, validate it with `parseDocument()` and pass `toMarkup()` output to Astro's `set:html` directive, as shown in the [data page](https://github.com/Yusaku01/somen/blob/main/examples/astro-demo/src/pages/data.astro). Do not pass untrusted HTML strings directly to `set:html`.

## Edit and export

Studio edits diagrams in a browser and downloads a versioned JSON project. The CLI accepts the same project format:

```sh
somen studio
somen init diagram.json
somen validate diagram.json
somen export diagram.json --out site --lang ja
```

Serve the exported folder over HTTP. It contains `index.html` and the runtime modules, so Astro is not needed. `init` and `export` refuse to overwrite existing destinations. Studio does not save projects to a server.

## HTML API

Nodes and connections must be direct children of `flow-diagram`. Each diagram needs a `label`; each node needs a unique `name`; each connection needs a `label`.

| Element | Attribute | Purpose |
| --- | --- | --- |
| `flow-diagram` | `layout="auto\|horizontal\|vertical"` | Choose the layout; `auto` is the default. |
| | `autoplay` | Opt in to initial playback. |
| | `variant="plain"` | Remove the panel background and border. |
| | `caption="hidden"`, `legend="hidden"`, `controls="hidden"`, `button-text="hidden"` | Hide each visible part independently. |
| `flow-node` | `name` | Identify a node for connections. |
| `flow-connection` | `from`, `to` | Name the endpoints when their positions in HTML are insufficient. |
| | `name` | Optionally identify a connection. |
| | `color`, `shape`, `duration` | Set particle color, shape (`circle`, `square`, `diamond`), and traversal time in seconds. |

An omitted `from` or `to` uses the nearest node on that side of the connection. A missing node produces a validation error. Self connections are not supported. `duration` accepts 0.5–120 seconds; `color` accepts `#RGB` or `#RRGGBB`.

## Appearance and playback

The default appearance uses a black dotted canvas, outlined nodes, white connection lines, and color on the moving particles. The legend sits above the canvas. Slots named `caption`, `legend`, `play-label`, and `pause-label` replace the corresponding default content. CSS custom properties control colors, sizes, spacing, and corners. Shadow parts expose individual elements for styling.

```css
flow-diagram {
  --flow-background: #fff;
  --flow-text: #172033;
  --flow-node-background: #f1f5f9;
  --flow-node-border: #cbd5e1;
  --flow-rail: #334155;
  --flow-grid: rgba(23, 32, 51, 0.16);
  --flow-control-background: #2563eb;
  --flow-control-color: #fff;
  --flow-control-border: #2563eb;
}

flow-diagram::part(rail) { stroke-width: 2; }
```

The full set of public CSS properties is `--flow-background`, `--flow-toolbar`, `--flow-stage-background`, `--flow-grid`, `--flow-rail`, `--flow-rail-width`, `--flow-text`, `--flow-border`, `--flow-node-background`, `--flow-node-text`, `--flow-node-border`, `--flow-radius`, `--flow-node-radius`, `--flow-gap`, `--flow-padding`, `--flow-node-width`, `--flow-node-height`, `--flow-focus`, `--flow-error`, `--flow-caption-color`, `--flow-caption-size`, `--flow-caption-weight`, `--flow-control-background`, `--flow-control-color`, `--flow-control-border`, `--flow-control-hover`, `--flow-control-radius`, `--flow-control-size`, `--flow-legend-background`, `--flow-legend-color`, `--flow-legend-border`, `--flow-mark-border`, and `--flow-legend-size`.

Call `play()` and `pause()` on a `flow-diagram` element to control it from JavaScript. Hiding the built-in control does not pause playback, so provide another pause control if the diagram moves without it. The `flow-playback` event reports the paused state; `flow-error` reports a validation failure.

## Accessibility and limits

Somen keeps authored node content as HTML. The SVG is hidden from assistive technology; a caption and connection summary describe the diagram. Motion starts only when `autoplay` is present, and a reduced-motion preference prevents initial playback. Playback controls remain keyboard accessible.

Without JavaScript, node text remains readable, but the connections and motion are not rendered. This alpha targets small ordered flows. It does not automatically lay out complex graphs or guarantee that lines never cross. Browser interaction checks currently cover Chromium; Safari, Firefox, and assistive technology still need release checks.
