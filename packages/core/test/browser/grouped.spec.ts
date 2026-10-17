import { expect, test } from '@playwright/test';
import type { FlowDiagramElement } from '../../src/elements.js';

test('groups and decisions retain readable geometry and labels when resized while paused', async ({
  page,
}, testInfo) => {
  await page.goto('/packages/core/test/browser/fixtures/grouped.html');
  const islands = page.locator('#islands');
  const decision = page.locator('#decision');
  await expect(islands.locator('.stage > svg')).toHaveAttribute('data-ready', '');
  await expect(decision.locator('.stage > svg')).toHaveAttribute('data-ready', '');
  await expect(islands.getByRole('region', { name: 'Navigationの前' })).toBeVisible();
  await expect(decision.locator('strong')).toHaveText('はい');

  const state = await islands.evaluateHandle((element) => {
    const diagram = element as FlowDiagramElement;
    diagram.pause();
    const svg = diagram.shadowRoot!.querySelector('svg')!;
    svg.setCurrentTime(1);
    return {
      diagram,
      svg,
      path: svg.querySelector<SVGPathElement>('[part=rail]')!,
      particle: svg.querySelector<SVGGElement>('[part=particle]')!,
    };
  });
  const oldPath = await state.evaluate(({ path }) => path.getAttribute('d'));

  for (const width of [900, 320]) {
    await page.setViewportSize({ width: Math.max(width, 320), height: 900 });
    await page
      .locator('flow-diagram')
      .evaluateAll(
        (diagrams, width) =>
          diagrams.forEach((d) => ((d as HTMLElement).style.width = `${width}px`)),
        width,
      );
    await expect(islands.locator('.stage')).toHaveAttribute(
      'data-layout',
      width === 900 ? 'horizontal' : 'vertical',
    );
    // Compare rendered geometry against the real paths, rather than duplicating the routing algorithm.
    await expect
      .poll(() =>
        decision.evaluate((diagram) => {
          const svg = diagram.shadowRoot!.querySelector('svg')!;
          return [...diagram.querySelectorAll('flow-connection')].every((label, i) => {
            const path = svg.querySelectorAll<SVGPathElement>('[part=rail]')[i]!;
            const point = path
              .getPointAtLength(path.getTotalLength() / 2)
              .matrixTransform(path.getScreenCTM()!);
            const box = label.getBoundingClientRect();
            return (
              Math.hypot(box.x + box.width / 2 - point.x, box.y + box.height / 2 - point.y) < 1
            );
          });
        }),
      )
      .toBe(true);
    const geometry = await islands.evaluate((diagram) => {
      const nodes = [...diagram.querySelectorAll('flow-node')];
      return nodes.every((node) => {
        const box = node.getBoundingClientRect();
        const group = node.parentElement!.getBoundingClientRect();
        return (
          box.left >= group.left &&
          box.right <= group.right &&
          box.top >= group.top &&
          box.bottom <= group.bottom
        );
      });
    });
    expect(geometry).toBe(true);
    const branches = await decision.evaluate((diagram) => {
      const box = (id: string) => diagram.querySelector(`[name=${id}]`)!.getBoundingClientRect();
      return {
        separate: box('normal').right < box('dom').left,
        order: box('freeze').bottom < box('dom').top && box('dom').bottom < box('worker').top,
      };
    });
    expect(branches).toEqual({ separate: true, order: true });
    const screenshot = testInfo.outputPath(`grouped-${width}px.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach(`grouped-${width}px`, {
      path: screenshot,
      contentType: 'image/png',
    });
  }
  await expect(decision.locator('.viewport')).toHaveAttribute('tabindex', '0');
  const openingVisible = await decision.evaluate((diagram) => {
    const view = diagram.shadowRoot!.querySelector('.viewport')!.getBoundingClientRect();
    const question = diagram.querySelector('[name=freeze]')!.getBoundingClientRect();
    return question.left >= view.left && question.right <= view.right;
  });
  expect(openingVisible).toBe(true);
  const viewport = decision.locator('.viewport');
  const beforeScroll = await viewport.evaluate((element) => element.scrollLeft);
  await viewport.focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(beforeScroll);

  const after = await state.evaluate(({ diagram, svg, path, particle }) => {
    const expected = path
      .getPointAtLength(path.getTotalLength() / 4)
      .matrixTransform(path.getScreenCTM()!);
    const actual = new DOMPoint().matrixTransform(particle.getScreenCTM()!);
    return {
      paused: diagram.paused,
      time: svg.getCurrentTime(),
      distance: Math.hypot(actual.x - expected.x, actual.y - expected.y),
      same:
        svg === diagram.shadowRoot!.querySelector('svg') &&
        path === svg.querySelector('[part=rail]'),
      path: path.getAttribute('d'),
    };
  });
  expect(after.paused).toBe(true);
  expect(after.time).toBeCloseTo(1, 5);
  expect(after.same).toBe(true);
  expect(after.distance).toBeLessThan(1);
  expect(after.path).not.toBe(oldPath);
  await state.dispose();
  await decision.getByRole('button').focus();
  await page.keyboard.press('Enter');
  await expect(decision.getByRole('button')).toHaveAccessibleName('Pause: Worker判断');
  await page.keyboard.press('Enter');
  await expect(decision.getByRole('button')).toHaveAccessibleName('Play: Worker判断');
});

test('grouped HTML exports the same graph and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/packages/core/test/browser/fixtures/grouped.html');
  const diagram = page.locator('#islands');
  await expect(diagram.locator('.stage > svg')).toHaveAttribute('data-ready', '');
  await expect(diagram.getByRole('button')).toHaveAccessibleName('Play: Islands');
  await expect(diagram.locator('[part=particle]').first()).toHaveCSS('visibility', 'hidden');
  const same = await diagram.evaluate(async (element) => {
    const entry = '/packages/core/dist/index.js';
    const { toMarkup } = (await import(entry)) as typeof import('../../src/index.js');
    const original = (element as FlowDiagramElement).toJSON();
    const holder = document.createElement('div');
    holder.innerHTML = toMarkup(original);
    document.body.append(holder);
    const copy = holder.querySelector<FlowDiagramElement>('flow-diagram')!.toJSON();
    holder.remove();
    const sort = <T extends { id: string }>(values: T[]) =>
      values.sort((a, b) => a.id.localeCompare(b.id));
    return (
      JSON.stringify({ ...original, connections: sort(original.connections) }) ===
      JSON.stringify({ ...copy, connections: sort(copy.connections) })
    );
  });
  expect(same).toBe(true);
});

test('node attribute labels remain visible and yield to HTML content', async ({
  page,
}, testInfo) => {
  await page.goto('/packages/core/test/browser/fixtures/grouped.html');
  const diagram = page.locator('#decision');
  const node = diagram.locator('flow-node[name=freeze]');
  await node.evaluate((element) => {
    element.setAttribute('label', 'UIが固まるか');
    element.textContent = ' \n ';
  });
  await expect(node.getByText('UIが固まるか', { exact: true })).toBeVisible();
  const exported = await diagram.evaluate((element) => (element as FlowDiagramElement).toJSON());
  expect(exported.nodes.find((item) => item.id === 'freeze')?.label).toBe('UIが固まるか');
  await node.evaluate((element) => element.setAttribute('label', '処理中にUIが固まるか'));
  await expect(node.getByText('処理中にUIが固まるか', { exact: true })).toBeVisible();
  const screenshot = testInfo.outputPath('node-label-fallback.png');
  await diagram.screenshot({ path: screenshot });
  await testInfo.attach('node-label-fallback', { path: screenshot, contentType: 'image/png' });
  await node.evaluate((element) => {
    element.firstChild!.nodeValue = 'HTMLの内容';
  });
  await expect(node).toContainText('HTMLの内容');
  await expect(node.locator('slot')).not.toHaveAttribute('hidden', '');
  await expect(node.getByText('処理中にUIが固まるか', { exact: true })).toBeHidden();
});

test('connection labels handle whitespace-only HTML and later text edits', async ({ page }) => {
  await page.goto('/packages/core/test/browser/fixtures/grouped.html');
  const edge = page.locator('#decision flow-connection').first();
  await edge.evaluate((element) => {
    element.setAttribute('label', 'Fallback');
    element.textContent = '  \n  ';
  });
  await expect(edge.getByText('Fallback', { exact: true })).toBeVisible();
  await edge.evaluate((element) => {
    element.firstChild!.nodeValue = 'Edited';
  });
  await expect(edge).toContainText('Edited');
  await expect(edge).toBeVisible();
  await expect(edge.getByText('Fallback', { exact: true })).toBeHidden();
});

test('opposite-direction labels stay separate in horizontal and vertical flows', async ({
  page,
}) => {
  await page.goto('/packages/core/test/browser/fixtures/paused-resize.html');
  const diagram = page.locator('flow-diagram');
  await diagram.evaluate((element) => {
    const response = document.createElement('flow-connection');
    response.setAttribute('from', 'server');
    response.setAttribute('to', 'client');
    response.setAttribute('label', 'Response');
    element.append(response);
  });
  for (const width of [800, 320]) {
    await diagram.evaluate(
      (element, width) => ((element as HTMLElement).style.width = `${width}px`),
      width,
    );
    await expect(diagram.locator('.stage')).toHaveAttribute(
      'data-layout',
      width === 800 ? 'horizontal' : 'vertical',
    );
    await expect
      .poll(() =>
        diagram.evaluate((element) => {
          const [a, b] = [...element.querySelectorAll('flow-connection')].map((e) =>
            e.getBoundingClientRect(),
          );
          return (
            a!.right <= b!.left || b!.right <= a!.left || a!.bottom <= b!.top || b!.bottom <= a!.top
          );
        }),
      )
      .toBe(true);
  }
});

test('long questions fit inside decisions and ordinary labels reserve enough space', async ({
  page,
}) => {
  await page.goto('/packages/core/test/browser/fixtures/grouped.html');
  const question = page.locator('#decision flow-node[name=freeze]');
  await question.evaluate((element) => {
    element.textContent =
      'Does processing prevent the user from continuing to interact with the interface?';
  });
  await expect
    .poll(() =>
      question.evaluate((element) => {
        const polygon = element.shadowRoot!.querySelector('polygon')!;
        const inverse = polygon.getScreenCTM()!.inverse();
        const range = document.createRange();
        range.selectNodeContents(element);
        return [...range.getClientRects()].every((box) =>
          [
            [box.left, box.top],
            [box.right, box.top],
            [box.left, box.bottom],
            [box.right, box.bottom],
          ].every(([x, y]) => polygon.isPointInFill(new DOMPoint(x, y).matrixTransform(inverse))),
        );
      }),
    )
    .toBe(true);

  await page.goto('/packages/core/test/browser/fixtures/paused-resize.html');
  const diagram = page.locator('flow-diagram');
  await diagram.evaluate((element) => {
    element.style.width = '460px';
    element.querySelector('flow-connection')!.setAttribute('label', 'HTTP Request');
  });
  await expect(diagram.locator('.stage')).toHaveAttribute('data-layout', 'vertical');
  await diagram.evaluate((element) => element.setAttribute('layout', 'horizontal'));
  await expect(diagram.locator('.stage')).toHaveAttribute('data-layout', 'horizontal');
  await expect
    .poll(() =>
      diagram.evaluate((element) => {
        const label = element.querySelector('flow-connection')!.getBoundingClientRect();
        return [...element.querySelectorAll('flow-node')].every((node) => {
          const box = node.getBoundingClientRect();
          return (
            box.right <= label.left ||
            box.left >= label.right ||
            box.bottom <= label.top ||
            box.top >= label.bottom
          );
        });
      }),
    )
    .toBe(true);
});
