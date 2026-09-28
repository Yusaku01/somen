import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { parseDocument, toMarkup, exampleDocument, FlowValidationError } from '../dist/model.js';
import { connectionPath } from '../dist/layout.js';

test('public imports work on an SSR server without window or HTMLElement', async () => {
  const core = await import('../dist/index.js');
  core.defineFlowElements();
  await import('../dist/register.js');
  assert.equal(core.parseDocument(exampleDocument).version, 1);
});
test('the shared model normalizes defaults without mutating the project', () => {
  const input = structuredClone(exampleDocument);
  delete input.connections[0].shape;
  const before = structuredClone(input);
  assert.equal(parseDocument(input).connections[0].shape, 'circle');
  assert.deepEqual(input, before);
});
test('invalid references, duplicate ids and unsupported versions are rejected', () => {
  for (const edit of [
    (doc) => doc.nodes.push({ ...doc.nodes[0] }),
    (doc) => {
      doc.connections[0].to = 'missing';
    },
    (doc) => {
      doc.connections[0].to = doc.connections[0].from;
    },
    (doc) => {
      doc.version = 2;
    },
    (doc) => {
      doc.layout = ['auto'];
    },
    (doc) => {
      doc.connections[0].shape = ['circle'];
    },
    (doc) => {
      doc.connections[0].duration = Infinity;
    },
    (doc) => {
      doc.connections[0].color = 'url(https://example.com)';
    },
    (doc) => {
      doc.appearance = { controls: 'false' };
    },
    (doc) => {
      doc.appearance = { variant: '<invalid>' };
    },
  ]) {
    const doc = structuredClone(exampleDocument);
    edit(doc);
    assert.throws(() => parseDocument(doc), FlowValidationError);
  }
});
test('export places connections between nodes and keeps nonadjacent endpoints explicit', () => {
  const doc = structuredClone(exampleDocument);
  doc.nodes.push({ id: 'db', label: 'Database' });
  doc.connections.push({ id: 'direct', from: 'client', to: 'db', label: 'Direct' });
  const html = toMarkup(doc);
  assert.ok(
    html.indexOf('<flow-node name="client"') < html.indexOf('<flow-connection name="request"'),
  );
  assert.ok(
    html.indexOf('<flow-connection name="request"') < html.indexOf('<flow-node name="server"'),
  );
  assert.match(html, /<flow-connection name="request" label=/);
  assert.match(html, /name="response" from="server" to="client"/);
  assert.match(html, /name="direct" from="client" to="db"/);
});
test('appearance options survive project normalization and HTML export', () => {
  const doc = structuredClone(exampleDocument);
  doc.appearance = {
    variant: 'plain',
    caption: false,
    legend: false,
    controls: false,
    buttonText: false,
  };
  assert.deepEqual(parseDocument(doc).appearance, doc.appearance);
  const html = toMarkup(doc);
  for (const attr of [
    'variant="plain"',
    'caption="hidden"',
    'legend="hidden"',
    'controls="hidden"',
    'button-text="hidden"',
  ])
    assert.ok(html.includes(attr));
  assert.equal(parseDocument(exampleDocument).appearance.controls, true);
});
test('HTML export cannot turn user labels into elements or attributes', () => {
  const doc = structuredClone(exampleDocument);
  doc.label = '" onmouseover="bad()';
  doc.nodes[0].label = '<script>alert("x")</script> &';
  const html = toMarkup(doc);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&quot; onmouseover=&quot;bad()'));
});
test('routing anchors forward and reverse connections to the facing edges', () => {
  const a = { x: 24, y: 24, width: 144, height: 60 };
  const b = { x: 224, y: 24, width: 144, height: 60 };
  assert.equal(connectionPath(a, b, false), 'M168 54 C196 54 196 54 224 54');
  assert.equal(connectionPath(b, a, false), 'M224 54 C196 54 196 54 168 54');
  const below = { ...a, y: 140 };
  assert.equal(connectionPath(a, below, true), 'M96 84 C96 112 96 112 96 140');
  assert.match(connectionPath(a, b, false, 0, true), /^M96 24 V8 H296 V24$/);
});
