# Somen API reference

[Getting started](../README.md) · [CLI](../packages/core/README.md#edit-and-export) · [Astro guide](../examples/astro-demo/README.md)

## HTML attributes

Nodes and connections must be direct children of `flow-diagram`. Each diagram needs a nonempty `label` or text in its `caption` slot. Each node needs a unique `name` and nonempty text content; each connection needs a nonempty `label`.

| Element | Attribute | Purpose |
| --- | --- | --- |
| `flow-diagram` | `label` | Name the diagram; used as the default caption and accessible name. |
| | `layout="auto\|horizontal\|vertical"` | Choose the layout; `auto` is the default. |
| | `autoplay` | Opt in to initial playback. |
| | `variant="plain"` | Remove the panel background and border. |
| | `caption="hidden"`, `legend="hidden"`, `controls="hidden"`, `button-text="hidden"` | Hide each visible part independently. |
| `flow-node` | `name` | Identify a node for connections. |
| `flow-connection` | `from`, `to` | Name the endpoints when their positions in HTML are insufficient. |
| | `label` | Describe the connection in the legend and text summary. |
| | `name` | Optionally identify a connection with a unique name. |
| | `color`, `shape`, `duration` | Set particle color, shape (`circle`, `square`, `diamond`), and traversal time in seconds. |

An omitted `from` or `to` uses the nearest node on that side of the connection. A missing node produces a validation error. Self connections are not supported. `duration` accepts 0.5–120 seconds and defaults to `4`; `color` accepts `#RGB` or `#RRGGBB` and defaults to `#70a0ff`. The default particle shape is `circle`. Node and connection names start with an ASCII letter and use only letters, numbers, `_`, or `-`.

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

CSS custom properties are grouped by the part they affect:

| Part | Properties |
| --- | --- |
| Panel | `--flow-background`, `--flow-text`, `--flow-border`, `--flow-radius` |
| Canvas | `--flow-stage-background`, `--flow-grid`, `--flow-gap`, `--flow-padding` |
| Nodes | `--flow-node-background`, `--flow-node-text`, `--flow-node-border`, `--flow-node-radius`, `--flow-node-width`, `--flow-node-height` |
| Connections | `--flow-rail`, `--flow-rail-width` |
| Caption and toolbar | `--flow-toolbar`, `--flow-caption-color`, `--flow-caption-size`, `--flow-caption-weight` |
| Playback control | `--flow-control-background`, `--flow-control-color`, `--flow-control-border`, `--flow-control-hover`, `--flow-control-radius`, `--flow-control-size` |
| Legend | `--flow-legend-background`, `--flow-legend-color`, `--flow-legend-border`, `--flow-legend-size`, `--flow-mark-border` |
| Focus and errors | `--flow-focus`, `--flow-error` |

Call `play()` and `pause()` on a `flow-diagram` element to control it from JavaScript. Hiding the built-in control does not pause playback, so provide another pause control if the diagram moves without it. The read-only `paused` property and `flow-playback` event's `detail.paused` report the requested playback state. The `flow-error` event exposes the validation error in `detail`. Both events bubble and cross shadow boundaries.

## JSON projects

The CLI and the JavaScript API share the `FlowDocument` format. Save the following as `diagram.json` to validate or export it with the CLI:

```json
{
  "version": 1,
  "label": "Request flow",
  "nodes": [
    { "id": "client", "label": "Client" },
    { "id": "server", "label": "Server" }
  ],
  "connections": [
    { "id": "request", "from": "client", "to": "server", "label": "Request" }
  ]
}
```

`version`, `label`, `nodes`, and `connections` are required. Node IDs and connection IDs must each be unique within their own list, start with an ASCII letter, and contain only letters, numbers, `_`, or `-`. Projects accept 1–100 nodes and at most 300 connections. JSON connections require explicit `from` and `to` values.

| Optional field | Default | Values |
| --- | --- | --- |
| `layout` | `"auto"` | `"auto"`, `"horizontal"`, `"vertical"` |
| `autoplay` | `false` | Boolean |
| `appearance.variant` | `"panel"` | `"panel"`, `"plain"` |
| `appearance.caption`, `appearance.legend`, `appearance.controls`, `appearance.buttonText` | `true` | Boolean; `false` hides the corresponding part |
| Connection `color` | `"#70a0ff"` | `#RGB` or `#RRGGBB` |
| Connection `shape` | `"circle"` | `"circle"`, `"square"`, `"diamond"` |
| Connection `duration` | `4` | Number of seconds, from 0.5 to 120 |

### Convert JSON to HTML

Import `parseDocument()` and `toMarkup()` from the package's main entry point:

```js
import { parseDocument, toMarkup } from 'somenflow';

const document = parseDocument(JSON.parse(jsonText));
const markup = toMarkup(document);
```

`jsonText` is the content of a JSON project such as the example above. `parseDocument()` validates it and fills in defaults. Invalid input throws `FlowValidationError`, whose `issues` property lists the validation messages. `toMarkup()` returns custom-element HTML with escaped labels and attributes; register `somenflow/register` in the browser to render it.

Call `toJSON()` on a registered `flow-diagram` element to obtain its project data. Node content becomes text labels; slots and rich HTML content are not preserved in JSON.

## Accessibility

Authored node content remains HTML. The connection SVG is hidden from assistive technology, while the caption and a text summary describe the diagram's connections. Hiding the caption preserves the diagram's accessible name. Playback controls support keyboard operation.

Motion starts only with `autoplay`. A reduced-motion preference prevents initial playback; visitors can still start playback explicitly. Hidden tabs temporarily suspend animation without changing the requested playback state.
