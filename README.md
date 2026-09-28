# Somen

English | [日本語](README.ja.md)

Somen is a Web Component for animated flow diagrams written with HTML nodes and connections. It calculates node positions and connection paths from the available space and the rendered size of each element.

Somen is an alpha release under the MIT license.

![Animated communication flow between a browser, API, and database, with blue and green particles moving between three nodes](assets/flow-preview.gif)

The preview focuses on one three-node diagram. Visitors can pause and resume a live diagram.

## Try it locally

Development uses Node.js 24.13.0 from `.node-version` and pnpm 12.3.4 from the root `package.json` `packageManager` field. Start Studio to edit a diagram in a form:

```sh
pnpm install
pnpm studio
```

Studio opens at `http://127.0.0.1:4766/`. To see the Astro examples, run `pnpm dev` at the repository root.

## Embed a diagram in HTML

Install `somenflow@alpha` and register the custom elements in a browser-side script:

```sh
npm install somenflow@alpha
```

```js
import 'somenflow/register';
```

Then write the diagram in HTML:

```html
<flow-diagram label="Request flow" autoplay>
  <flow-node name="client">Client</flow-node>
  <flow-connection label="Request"></flow-connection>
  <flow-node name="server">Server</flow-node>
</flow-diagram>
```

Putting a connection between two nodes lets Somen infer its endpoints. Set `from` and `to` for branches or reverse connections. The [Astro examples](examples/astro-demo/src/pages/examples.astro) show multiple nodes and customized appearance.

## Embed a diagram in Astro content

Write the same custom elements directly in `.md` or `.mdx` content. MDX requires the `@astrojs/mdx` integration. Import `somenflow/register` once in a `<script>` in the `.astro` page or layout that renders the content. The demo loads [Markdown](examples/astro-demo/src/content/articles/markdown.md) and [MDX](examples/astro-demo/src/content/articles/mdx.mdx) from a Content Layer API collection and renders them on an [article page](examples/astro-demo/src/pages/content/%5Bid%5D.astro).

For structured data such as JSON, call `getEntry()`, validate the result with `parseDocument()`, and convert it to HTML with `toMarkup()`. See the [JSON entry](examples/astro-demo/src/content/diagrams/request-flow.json) and [data page](examples/astro-demo/src/pages/data.astro). Astro's `set:html` inserts HTML without escaping it, so pass the output of `toMarkup()` rather than an arbitrary HTML string.

## Scope and limitations

Somen targets small communication diagrams and process flows in articles and documentation. Studio can save a diagram as JSON, and the CLI can validate it or export a standalone HTML page. See the [package README](packages/core/README.md) for the element API, attributes, and CLI commands.

Nodes appear in source order, and the layout changes to a column in narrow spaces. Playback starts automatically only when `autoplay` is present. Somen does not lay out complex graphs or guarantee that lines never cross. Browser interaction has been checked in Chromium; Firefox, Safari, and assistive technology have not yet been verified.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution checks and the release process. Report vulnerabilities using the private channel in [SECURITY.md](SECURITY.md).

```sh
pnpm build                          # Build the core package
pnpm dev                            # Start the Astro demo
pnpm test                           # Run core and CLI tests
pnpm code:check                     # Check formatting, lint, and types
pnpm code:format                    # Format the core package
pnpm unused:check                   # Check unused files, exports, and dependencies
pnpm docs:check                     # Check Markdown and local links
pnpm --dir examples/astro-demo build # Build the Astro demo
```
