# Somen

English | [日本語](README.ja.md)

Somen is a framework-independent Web Component for animated flow diagrams written with HTML nodes and connections. The layout adapts to the available space and the size of each node.

This is an alpha release under the MIT license. The npm package is `somenflow`.

![Animated communication flow between a browser, API, and database, with blue and green particles moving between three nodes](assets/flow-preview.gif)

## Add a diagram

Install the package in the project that will use it:

```sh
npm install somenflow@alpha
```

Register the custom elements once in a browser-side entry point:

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

A connection between two nodes infers its endpoints. Set `from` and `to` for branches or reverse connections. Browser imports using the package name require a bundler or import map.

## Scope and limitations

Somen targets small communication diagrams and process flows in articles and documentation. Nodes appear in source order; the default layout changes to a column in narrow spaces. The CLI validates JSON projects and exports standalone HTML pages.

Playback starts automatically only with `autoplay`, and a reduced-motion preference prevents initial playback. Visitors can pause and resume a diagram. Without JavaScript, node text remains readable, but connections are not rendered.

Somen does not automatically lay out complex graphs or guarantee that lines never cross. Browser interaction has been checked in Chromium; Firefox, Safari, and assistive technology have not yet been verified.

## Documentation

- [CLI](packages/core/README.md#edit-and-export)
- [API reference](docs/api.md): HTML attributes, appearance, playback, and JSON projects
- [Astro guide](examples/astro-demo/README.md): Markdown, MDX, and structured data
- [Contributing](CONTRIBUTING.md): local setup, checks, and releases
- [Security policy](SECURITY.md): private vulnerability reports
