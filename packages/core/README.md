# Somen

[Source on GitHub](https://github.com/Yusaku01/somen) · [日本語](https://github.com/Yusaku01/somen/blob/main/README.ja.md)

Somen displays animated flow diagrams from HTML nodes and connections. It uses Web Components and native SVG motion, with no runtime dependencies. The layout adapts to the diagram's width.

This is an alpha release under the MIT license.

## Install

```sh
npm install somenflow@alpha
```

The CLI requires Node.js 22 or later. Browser imports using the package name require a bundler or import map.

## Add a diagram

Register the elements once in a browser-side entry point:

```js
import 'somenflow/register';
```

```html
<flow-diagram label="Request flow" autoplay>
  <flow-node name="client">Client</flow-node>
  <flow-connection label="Request"></flow-connection>
  <flow-node name="server">Server</flow-node>
</flow-diagram>
```

A connection between two nodes infers its endpoints. Set `from` and `to` for branches or reverse connections. Nodes appear in source order; the default layout changes to a column when space is limited.

## Edit and export

Run the CLI through `npx` from the project where `somenflow` is installed:

```sh
npx somen init diagram.json
npx somen validate diagram.json
npx somen export diagram.json --out site --lang ja
```

Serve the exported folder over HTTP. It contains `index.html` and the runtime modules, so Astro and a bundler are not needed. `init` and `export` refuse to overwrite existing destinations.

## Scope and limitations

Somen targets small ordered flows. It does not automatically lay out complex graphs or guarantee that lines never cross. Without JavaScript, node text remains readable, but connections are not rendered.

Playback starts automatically only with `autoplay`, and a reduced-motion preference prevents initial playback. The built-in control lets visitors pause and resume a diagram. Browser interaction checks cover Chromium; Firefox, Safari, and assistive technology have not yet been verified.

## Documentation

- [API reference](https://github.com/Yusaku01/somen/blob/main/docs/api.md): attributes, appearance, playback, and JSON projects
- [Astro guide](https://github.com/Yusaku01/somen/blob/main/examples/astro-demo/README.md): Markdown, MDX, and structured data
- [Contributing](https://github.com/Yusaku01/somen/blob/main/CONTRIBUTING.md)
- [Security policy](https://github.com/Yusaku01/somen/blob/main/SECURITY.md)
