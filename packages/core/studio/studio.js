import '../runtime/register.js';
import { parseDocument, toMarkup, exampleDocument } from '../runtime/model.js';

let doc = structuredClone(exampleDocument);
let history = [];
let dirty = false;
const $ = (id) => document.getElementById(id);
const nodeList = $('nodes');
const edgeList = $('connections');
const status = (message) => {
  $('status').textContent = message;
};

function element(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
  return node;
}
function field(text, value, attrs, choices) {
  const label = element('label', text);
  const input = element(choices ? 'select' : 'input', '', attrs);
  if (choices) choices.forEach(([value, text]) => input.append(element('option', text, { value })));
  input.value = value;
  label.append(input);
  return label;
}
function action(text, attrs) {
  return element('button', text, { type: 'button', ...attrs });
}
function renderEditor() {
  $('title').value = doc.label;
  $('layout').value = doc.layout;
  $('autoplay').checked = doc.autoplay;
  $('variant').value = doc.appearance?.variant ?? 'panel';
  document.querySelectorAll('[data-appearance]').forEach((input) => {
    input.checked = doc.appearance?.[input.dataset.appearance] !== false;
  });
  nodeList.replaceChildren();
  edgeList.replaceChildren();
  doc.nodes.forEach((node, i) => {
    const card = element('div', '', { class: 'card' });
    const head = element('div', '', { class: 'card-heading' });
    head.append(element('strong', `ノード ${i + 1}`));
    const actions = element('div', '', { class: 'card-actions' });
    const up = action('↑', {
      'data-action': 'up',
      'data-node': node.id,
      'aria-label': `${node.label}を前に移動`,
    });
    up.disabled = i === 0;
    const remove = action('削除', { 'data-action': 'delete-node', 'data-node': node.id });
    remove.disabled = doc.nodes.length === 1;
    actions.append(up, remove);
    head.append(actions);
    card.append(head, field('表示名', node.label, { 'data-node': node.id, 'data-field': 'label' }));
    nodeList.append(card);
  });
  doc.connections.forEach((edge, i) => {
    const card = element('div', '', { class: 'card' });
    const head = element('div', '', { class: 'card-heading' });
    head.append(
      element('strong', `接続 ${i + 1}`),
      action('削除', { 'data-action': 'delete-edge', 'data-edge': edge.id }),
    );
    const attrs = (fieldName) => ({ 'data-edge': edge.id, 'data-field': fieldName });
    const pair = element('div', '', { class: 'pair' });
    const choices = doc.nodes.map((node) => [node.id, node.label]);
    pair.append(
      field('出発', edge.from, attrs('from'), choices),
      field('到着', edge.to, attrs('to'), choices),
    );
    const style = element('div', '', { class: 'pair' });
    style.append(
      field('色', edge.color, { ...attrs('color'), type: 'color' }),
      field('粒の形', edge.shape, attrs('shape'), [
        ['circle', '丸'],
        ['square', '四角'],
        ['diamond', 'ひし形'],
      ]),
    );
    card.append(
      head,
      field('凡例に表示する名前', edge.label, attrs('label')),
      pair,
      style,
      field('片道の時間（秒）', edge.duration, {
        ...attrs('duration'),
        type: 'number',
        min: '0.5',
        max: '120',
        step: '0.5',
      }),
    );
    edgeList.append(card);
  });
  $('add-connection').disabled = doc.nodes.length < 2;
  $('undo').disabled = !history.length;
}
function renderPreview() {
  try {
    const valid = parseDocument(doc);
    const markup = toMarkup(valid);
    // toMarkup escapes all author content and only emits a fixed, validated vocabulary.
    $('preview').innerHTML = markup;
    const diagram = $('preview').querySelector('flow-diagram');
    diagram.append(
      element('span', '一時停止', { slot: 'pause-label' }),
      element('span', '再生', { slot: 'play-label' }),
    );
    $('markup').value = markup;
    $('error').hidden = true;
    $('copy').disabled = false;
    $('save').disabled = false;
  } catch (error) {
    $('error').textContent = error.message;
    $('error').hidden = false;
    $('copy').disabled = true;
    $('save').disabled = true;
  }
}
function change(edit, redraw = false) {
  history.push(structuredClone(doc));
  if (history.length > 50) history.shift();
  edit();
  dirty = true;
  if (redraw) renderEditor();
  $('undo').disabled = false;
  renderPreview();
}
function nextId(prefix, records) {
  let i = 1;
  while (records.some((record) => record.id === `${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

$('variant').addEventListener('change', (event) =>
  change(() => {
    doc.appearance = { ...doc.appearance, variant: event.target.value };
  }),
);
document.querySelectorAll('[data-appearance]').forEach((input) =>
  input.addEventListener('change', () =>
    change(() => {
      doc.appearance = { ...doc.appearance, [input.dataset.appearance]: input.checked };
    }),
  ),
);

$('title').addEventListener('input', (event) =>
  change(() => {
    doc.label = event.target.value;
  }),
);
$('layout').addEventListener('change', (event) =>
  change(() => {
    doc.layout = event.target.value;
  }),
);
$('autoplay').addEventListener('change', (event) =>
  change(() => {
    doc.autoplay = event.target.checked;
  }),
);
document.querySelector('.editor').addEventListener('input', (event) => {
  const input = event.target;
  if (!input.dataset.field) return;
  const record = input.dataset.node
    ? doc.nodes.find((node) => node.id === input.dataset.node)
    : doc.connections.find((edge) => edge.id === input.dataset.edge);
  change(() => {
    record[input.dataset.field] =
      input.dataset.field === 'duration' ? Number(input.value) : input.value;
  });
  if (input.dataset.node)
    edgeList.querySelectorAll('option').forEach((option) => {
      if (option.value === record.id) option.textContent = record.label;
    });
});
document.querySelector('.editor').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  change(() => {
    if (button.dataset.action === 'delete-node') {
      doc.nodes = doc.nodes.filter((node) => node.id !== button.dataset.node);
      doc.connections = doc.connections.filter(
        (edge) => edge.from !== button.dataset.node && edge.to !== button.dataset.node,
      );
      status('ノードと、そのノードにつながる接続を削除しました。「元に戻す」で戻せます。');
    } else if (button.dataset.action === 'delete-edge')
      doc.connections = doc.connections.filter((edge) => edge.id !== button.dataset.edge);
    else {
      const index = doc.nodes.findIndex((node) => node.id === button.dataset.node);
      if (index > 0)
        [doc.nodes[index - 1], doc.nodes[index]] = [doc.nodes[index], doc.nodes[index - 1]];
    }
  }, true);
});
$('add-node').addEventListener('click', () => {
  const id = nextId('node', doc.nodes);
  change(() => doc.nodes.push({ id, label: '新しいノード' }), true);
  nodeList.querySelector(`input[data-node="${id}"]`).focus();
});
$('add-connection').addEventListener('click', () =>
  change(
    () =>
      doc.connections.push({
        id: nextId('edge', doc.connections),
        from: doc.nodes[0].id,
        to: doc.nodes[1].id,
        label: '新しい接続',
        color: '#f7bc79',
        shape: 'circle',
        duration: 4,
      }),
    true,
  ),
);
$('undo').addEventListener('click', () => {
  if (!history.length) return;
  doc = history.pop();
  dirty = true;
  renderEditor();
  renderPreview();
});
document.querySelectorAll('[data-preview]').forEach((button) =>
  button.addEventListener('click', () => {
    $('preview').dataset.width = button.dataset.preview;
    document
      .querySelectorAll('[data-preview]')
      .forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
  }),
);
$('save').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(parseDocument(doc), null, 2) + '\n'], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = element('a', '', { href: url, download: 'diagram.json' });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  dirty = false;
  status('プロジェクトを書き出しました。');
});
$('open').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const next = parseDocument(JSON.parse(await file.text()));
    change(() => {
      doc = next;
    }, true);
    status(`${file.name}を開きました。`);
  } catch (error) {
    $('error').textContent = error.message;
    $('error').hidden = false;
  }
  event.target.value = '';
});
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('markup').value);
    status('埋め込みHTMLをコピーしました。');
  } catch {
    $('markup').focus();
    $('markup').select();
    status('HTMLを選択しました。コピー操作で保存してください。');
  }
});
window.addEventListener('beforeunload', (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});
renderEditor();
renderPreview();
