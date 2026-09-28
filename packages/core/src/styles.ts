/** Defaults are contained by Shadow DOM. Public CSS variables and parts form the theme API. */
export const styles = `
:host { display:block; min-inline-size:0; color:var(--flow-text,#fff); font:inherit; }
* { box-sizing:border-box; }
[hidden] { display:none !important; }
figure { margin:0; overflow:hidden; border:1px solid var(--flow-border,rgba(255,255,255,.2)); border-radius:var(--flow-radius,4px); background:var(--flow-background,#000); }
.toolbar { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem; padding:1.9rem 2rem 1rem; background:var(--flow-toolbar,var(--flow-background,#000)); }
.caption { flex:1 1 12rem; min-inline-size:0; overflow-wrap:anywhere; color:var(--flow-caption-color,inherit); font-size:var(--flow-caption-size,1.3125rem); font-weight:var(--flow-caption-weight,700); line-height:1.3; }
button { display:inline-flex; align-items:center; justify-content:center; gap:.45rem; min-block-size:2.25rem; padding:.4rem .7rem; border:1px solid var(--flow-control-border,#fff); border-radius:var(--flow-control-radius,8px); background:var(--flow-control-background,#000); color:var(--flow-control-color,#fff); font:inherit; font-size:var(--flow-control-size,.75rem); font-weight:600; cursor:pointer; }
button:focus-visible, .viewport:focus-visible { outline:2px solid var(--flow-focus,#70a0ff); outline-offset:2px; }
button:hover { background:var(--flow-control-hover,#1c1c1c); }
.legend { padding:0 2rem 1rem; border-top:1px solid var(--flow-legend-border,transparent); background:var(--flow-legend-background,var(--flow-toolbar,var(--flow-background,#000))); color:var(--flow-legend-color,inherit); font-size:var(--flow-legend-size,.75rem); font-weight:600; }
.legend ul { display:flex; flex-wrap:wrap; gap:.5rem 1.5rem; padding:0; margin:0; list-style:none; }
.legend li { display:inline-flex; align-items:center; gap:.5rem; }
.mark { display:inline-block; inline-size:.875rem; block-size:.875rem; flex:none; border:1px solid var(--flow-mark-border,#fff); border-radius:2px; }
.mark[data-shape=circle] { border-radius:50%; }
.mark[data-shape=diamond] { transform:rotate(45deg) scale(.8); }
.viewport { overflow-x:auto; overscroll-behavior-inline:contain; }
.stage { position:relative; min-inline-size:0; background-color:var(--flow-stage-background,var(--flow-background,#000)); background-image:radial-gradient(var(--flow-grid,rgba(255,255,255,.2)) .7px,transparent .8px); background-size:5px 5px; }
.nodes { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(0,1fr); align-items:center; justify-items:center; gap:var(--flow-gap,3.5rem); padding:var(--flow-padding,3rem 1rem); position:relative; z-index:1; }
.nodes > slot { display:contents; }
.stage[data-layout=vertical] .nodes { grid-auto-flow:row; grid-template-columns:minmax(0,1fr); }
::slotted(flow-node) { box-sizing:border-box; display:flex; align-items:center; justify-content:flex-start; text-align:start; min-inline-size:0; inline-size:100%; max-inline-size:var(--flow-node-width,11.5rem); min-block-size:var(--flow-node-height,3.5rem); padding:.625rem .75rem; overflow-wrap:anywhere; border:1px solid var(--flow-node-border,#fff); border-radius:var(--flow-node-radius,4px); background:var(--flow-node-background,#000); color:var(--flow-node-text,inherit); font-size:.875rem; line-height:1.35; }
::slotted(flow-connection) { display:none; }
svg { position:absolute; inset:0; inline-size:100%; block-size:100%; overflow:visible; pointer-events:none; }
svg:not([data-ready]) { visibility:hidden; }
svg[data-static] .particle { visibility:hidden; }
.rail { stroke:var(--flow-rail,#fff); stroke-width:var(--flow-rail-width,1px); }
.arrow { fill:var(--flow-rail,#fff); }
.particle { stroke:#fff; stroke-width:.75px; }
.hint, .error { font-size:.8125rem; margin:0; padding:.75rem 1rem; }
.error { color:var(--flow-error,#ffb4b4); }
.sr-only { position:absolute; inline-size:1px; block-size:1px; padding:0; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
:host([variant=plain]) figure { border:0; background:transparent; }
:host([variant=plain]) .toolbar, :host([variant=plain]) .legend { background:transparent; }
:host([variant=plain]) .stage { background-color:transparent; background-image:none; }
@media (max-width:600px) {
  .toolbar { padding:1.25rem 1rem .75rem; }
  .legend { padding:0 1rem .75rem; }
  .nodes { padding:var(--flow-padding,2rem 1rem); }
}
`;
