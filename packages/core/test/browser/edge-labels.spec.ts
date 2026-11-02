import { expect, test } from '@playwright/test';
import type { FlowDiagramElement } from '../../src/elements.js';

function labelsFit(element: Element) {
  const view = element.shadowRoot!.querySelector('.viewport')!.getBoundingClientRect();
  const stage = element.shadowRoot!.querySelector('.stage')!.getBoundingClientRect();
  const labels = [...element.querySelectorAll('flow-connection')]
    .map((label) => label.getBoundingClientRect())
    .filter((box) => box.height > 0);
  const nodes = [...element.querySelectorAll('flow-node')].map((node) =>
    node.getBoundingClientRect(),
  );
  const overlaps = (a: DOMRect, b: DOMRect) =>
    a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  return labels.every(
    (label, index) =>
      label.top >= view.top &&
      label.bottom <= view.bottom &&
      label.left >= stage.left &&
      label.right <= stage.right &&
      labels.slice(index + 1).every((other) => !overlaps(label, other)) &&
      nodes.every((node) => !overlaps(label, node)),
  );
}

for (const width of [1000, 320]) {
  test(`overflowing horizontal flows show the start and preserve reader scroll at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/packages/core/test/browser/fixtures/edge-labels.html');
    const diagram = page.locator('#linear');
    const viewport = diagram.locator('.viewport');
    await expect(diagram.locator('.stage > svg')).toHaveAttribute('data-ready', '');
    await expect(viewport).toHaveAttribute('tabindex', '0');
    expect(await viewport.evaluate((view) => view.scrollLeft)).toBe(0);
    expect(
      await diagram.evaluate((element) => {
        const view = element.shadowRoot!.querySelector('.viewport')!.getBoundingClientRect();
        const start = element.querySelector('[name=start]')!.getBoundingClientRect();
        return start.left >= view.left && start.right <= view.right;
      }),
    ).toBe(true);
    const screenshot = testInfo.outputPath(`horizontal-start-${width}px.png`);
    await diagram.screenshot({ path: screenshot });
    await testInfo.attach('horizontal-start', { path: screenshot, contentType: 'image/png' });
    await viewport.evaluate((view) => {
      view.scrollLeft = 120;
    });
    await diagram.evaluate((element) => {
      element.style.setProperty('--flow-gap', '80px');
    });
    await expect(diagram.locator('.nodes')).toHaveCSS('column-gap', '80px');
    expect(await viewport.evaluate((view) => view.scrollLeft)).toBeCloseTo(120, 0);
    await viewport.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => viewport.evaluate((view) => view.scrollLeft)).toBeGreaterThan(120);
  });

  test(`parallel and reverse labels fit without overlap at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/packages/core/test/browser/fixtures/edge-labels.html');
    const diagram = page.locator('#parallel');
    await expect(diagram.locator('.stage > svg')).toHaveAttribute('data-ready', '');
    for (const grouped of [false, true]) {
      await diagram.evaluate((element) => {
        [...element.querySelectorAll('flow-connection')].forEach((edge, index) => {
          edge.setAttribute('from', index % 2 ? 'server' : 'client');
          edge.setAttribute('to', index % 2 ? 'client' : 'server');
        });
      });
      if (grouped)
        await diagram.evaluate((element) => {
          const group = document.createElement('flow-group');
          group.setAttribute('name', 'messages');
          group.setAttribute('label', 'Message exchange');
          group.append(...element.children);
          element.append(group);
        });
      for (const branches of [false, true]) {
        if (branches)
          await diagram.evaluate((element) => {
            const container = element.querySelector('flow-group') ?? element;
            const node = document.createElement('flow-node');
            node.setAttribute('name', 'other');
            node.textContent = 'Another branch';
            container.append(node);
            // Forward parallel edges share one opening node with a neighboring branch.
            for (const edge of element.querySelectorAll('flow-connection')) {
              edge.setAttribute('from', 'client');
              edge.setAttribute('to', 'server');
            }
            const edge = document.createElement('flow-connection');
            edge.setAttribute('from', 'client');
            edge.setAttribute('to', 'other');
            edge.setAttribute('label', 'Neighboring branch');
            container.append(edge);
          });
        await expect.poll(() => diagram.evaluate(labelsFit)).toBe(true);
        // Explicit horizontal flows remain scrollable on narrow screens. Pan to
        // the connection gap so evidence images show every label in full.
        await diagram.locator('.viewport').evaluate((view) => {
          view.scrollLeft = (view.scrollWidth - view.clientWidth) / 2;
        });
        const screenshot = testInfo.outputPath(
          `labels-${width}px-${grouped ? 'group' : 'plain'}-${branches ? 'branches' : 'pair'}.png`,
        );
        await diagram.screenshot({ path: screenshot });
        await testInfo.attach('parallel-labels', { path: screenshot, contentType: 'image/png' });
        if (!grouped && !branches) {
          // Capture after authored mutations, then resize only through CSS.
          const resized = await diagram.evaluateHandle((element) => {
            const flow = element as FlowDiagramElement;
            flow.pause();
            const svg = flow.shadowRoot!.querySelector('svg')!;
            svg.setCurrentTime(1);
            const path = svg.querySelector<SVGPathElement>('path[part=rail]')!;
            return {
              flow,
              svg,
              path,
              particle: svg.querySelector<SVGGElement>('[part=particle]')!,
              before: path.getAttribute('d'),
            };
          });
          await diagram.evaluate((element) => {
            element.style.width = '720px';
          });
          await expect(diagram).toHaveCSS('width', '720px');
          await expect
            .poll(() => resized.evaluate(({ path, before }) => path.getAttribute('d') !== before))
            .toBe(true);
          await expect
            .poll(() =>
              resized.evaluate(({ flow, svg, path, particle }) => {
                const expected = path
                  .getPointAtLength(path.getTotalLength() / 4)
                  .matrixTransform(path.getScreenCTM()!);
                const actual = new DOMPoint().matrixTransform(particle.getScreenCTM()!);
                return (
                  flow.paused &&
                  svg.animationsPaused() &&
                  Math.abs(svg.getCurrentTime() - 1) < 0.01 &&
                  flow.shadowRoot!.querySelector('svg') === svg &&
                  svg.querySelector('[part=rail]') === path &&
                  svg.querySelector('[part=particle]') === particle &&
                  Math.hypot(expected.x - actual.x, expected.y - actual.y) < 1
                );
              }),
            )
            .toBe(true);
          await diagram.evaluate((element) => {
            element.style.width = '100%';
          });
          await resized.dispose();
        }
        if (branches)
          await diagram.evaluate((element) => {
            element.querySelector('[name=other]')!.remove();
            element.querySelector('flow-connection[to=other]')!.remove();
          });
      }
    }
  });

  test(`detour label stacks stay above nodes and inside groups at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/packages/core/test/browser/fixtures/edge-labels.html');
    const diagram = page.locator('#parallel');
    await expect(diagram.locator('.stage > svg')).toHaveAttribute('data-ready', '');
    await diagram.evaluate((element) => {
      const middle = document.createElement('flow-node');
      middle.setAttribute('name', 'middle');
      middle.textContent = 'Middle step';
      element.querySelector('[name=server]')!.before(middle);
      for (const [from, to] of [
        ['client', 'middle'],
        ['middle', 'server'],
      ]) {
        const edge = document.createElement('flow-connection');
        edge.setAttribute('from', from!);
        edge.setAttribute('to', to!);
        element.append(edge);
      }
      const group = document.createElement('flow-group');
      group.setAttribute('name', 'detours');
      group.setAttribute('label', 'Long connections');
      group.append(...element.children);
      element.append(group);
    });
    await expect.poll(() => diagram.evaluate(labelsFit)).toBe(true);
    expect(
      await diagram.evaluate((element) => {
        const group = element.querySelector('flow-group')!.getBoundingClientRect();
        const nodes = [...element.querySelectorAll('flow-node')].map((node) =>
          node.getBoundingClientRect(),
        );
        return [...element.querySelectorAll('flow-connection[label]')].every((label) => {
          const box = label.getBoundingClientRect();
          return box.top >= group.top && box.bottom < Math.min(...nodes.map((node) => node.top));
        });
      }),
    ).toBe(true);
    await diagram.locator('.viewport').evaluate((view) => {
      view.scrollLeft = (view.scrollWidth - view.clientWidth) / 2;
    });
    const screenshot = testInfo.outputPath(`detour-labels-${width}px.png`);
    await diagram.screenshot({ path: screenshot });
    await testInfo.attach('detour-labels', { path: screenshot, contentType: 'image/png' });
  });
}

test('lane reservation scales to the connection limit and ignores empty labels', async ({
  page,
}) => {
  await page.goto('/packages/core/test/browser/fixtures/edge-labels.html');
  const diagram = page.locator('#parallel');
  await expect(diagram.locator('.stage > svg')).toHaveAttribute('data-ready', '');
  await diagram.evaluate((element) => {
    for (let index = 6; index < 300; index++) {
      const edge = element.querySelector('flow-connection')!.cloneNode() as Element;
      edge.setAttribute('label', `Message ${index + 1}`);
      element.append(edge);
    }
  });
  await expect.poll(() => diagram.evaluate(labelsFit)).toBe(true);
  await diagram
    .locator('flow-connection')
    .evaluateAll((edges) => edges.forEach((edge) => edge.removeAttribute('label')));
  await expect
    .poll(() => diagram.locator('.stage').evaluate((stage) => stage.getBoundingClientRect().height))
    .toBeLessThan(200);
});
