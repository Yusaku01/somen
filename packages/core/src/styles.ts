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
.nodes { display:grid; align-items:center; justify-items:center; column-gap:max(var(--flow-gap,3.5rem),var(--_flow-label-column-gap,0px)); row-gap:max(var(--flow-gap,3.5rem),var(--_flow-label-row-gap,0px)); padding:var(--flow-padding,3rem 1rem); }
.nodes > slot { display:contents; }
svg { position:absolute; inset:0; inline-size:100%; block-size:100%; overflow:visible; pointer-events:none; z-index:1; }
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

// Generated placement uses private variables so ordinary consumer CSS can override it.
const itemStyles = `
:host { box-sizing:border-box; min-inline-size:0; grid-column:var(--_flow-column,auto); grid-row:var(--_flow-row,auto); }
* { box-sizing:border-box; }
:host([hidden]) { display:none; }
slot { display:contents; }
`;
export const nodeStyles = `${itemStyles}
:host { display:grid; inline-size:100%; max-inline-size:var(--flow-node-width,11.5rem); min-block-size:var(--flow-node-height,3.5rem); color:var(--flow-node-text,inherit); font-size:.875rem; line-height:1.35; overflow-wrap:anywhere; }
.surface { position:relative; display:grid; align-items:center; padding:.625rem .75rem; border:1px solid var(--flow-node-border,#fff); border-radius:var(--flow-node-radius,4px); background:var(--flow-node-background,#000); }
svg { display:none; position:absolute; inset:0; inline-size:100%; block-size:100%; overflow:visible; pointer-events:none; }
polygon { fill:var(--flow-node-background,#000); stroke:var(--flow-node-border,#fff); stroke-width:1; vector-effect:non-scaling-stroke; }
.content { position:relative; }
:host([shape=decision]) { min-block-size:var(--flow-decision-height,7rem); text-align:center; }
:host([shape=decision]) .surface { border:0; background:transparent; padding:0; grid-template-columns:1fr 2fr 1fr; grid-template-rows:1fr 2fr 1fr; }
:host([shape=decision]) .content { grid-column:2; grid-row:2; }
:host([shape=decision]) svg { display:block; }
`;
export const groupStyles = `${itemStyles}
:host { display:block; inline-size:100%; align-self:stretch; border:1px solid var(--flow-group-border,rgba(255,255,255,.4)); border-radius:var(--flow-group-radius,8px); background:var(--flow-group-background,rgba(128,128,128,.08)); }
section { block-size:100%; display:flex; flex-direction:column; }
#label { position:sticky; inset-inline-start:0; align-self:flex-start; max-inline-size:100%; padding:.875rem 1rem 0; color:var(--flow-group-label-color,inherit); font-size:var(--flow-group-label-size,.8125rem); font-weight:600; overflow-wrap:anywhere; }
.items { flex:1; display:grid; align-items:center; justify-items:center; column-gap:max(var(--flow-gap,3.5rem),var(--_flow-label-column-gap,0px)); row-gap:max(var(--flow-gap,3.5rem),var(--_flow-label-row-gap,0px)); padding:var(--flow-group-padding,1.5rem); }
`;
export const connectionStyles = `
:host { position:absolute; display:block; z-index:2; inline-size:max-content; max-inline-size:var(--flow-label-width,12rem); transform:translate(calc(-50% + var(--flow-label-offset-x,0px) + var(--_flow-label-x,0px)),calc(-50% + var(--flow-label-offset-y,0px) + var(--_flow-label-y,0px))); color:var(--flow-label-color,var(--flow-text,#fff)); font-size:var(--flow-label-size,.75rem); line-height:1.4; text-align:center; overflow-wrap:anywhere; }
[part=label] { display:block; padding:.2rem .5rem; border:1px solid var(--flow-label-border,transparent); border-radius:var(--flow-label-radius,4px); background:var(--flow-label-background,var(--flow-stage-background,var(--flow-background,#000))); }
[hidden] { display:none; }
`;
