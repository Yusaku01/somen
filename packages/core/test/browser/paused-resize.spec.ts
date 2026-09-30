import { expect, test } from '@playwright/test';
import type { FlowDiagramElement } from '../../src/elements.js';

test('resizing a paused diagram keeps its time and moves the particle onto the new path', async ({
  page,
}) => {
  await page.goto('/packages/core/test/browser/fixtures/paused-resize.html');
  const diagram = page.locator('flow-diagram');
  await expect(diagram.locator('[part=stage]')).toHaveAttribute('data-layout', 'horizontal');
  await expect(diagram.locator('svg')).toHaveAttribute('data-ready', '');

  const elements = await diagram.evaluateHandle((element) => {
    const diagram = element as FlowDiagramElement;
    const root = diagram.shadowRoot!;
    const svg = root.querySelector('svg')!;
    const path = root.querySelector<SVGPathElement>('[part=rail]')!;
    const particle = root.querySelector<SVGGElement>('[part=particle]')!;
    diagram.pause();
    svg.setCurrentTime(1);
    return { diagram, svg, path, particle };
  });

  const readState = () =>
    elements.evaluate(({ diagram, svg, path, particle }) => {
      // The first particle starts at 0s; 1s of a 4s linear traversal is a quarter of the path.
      const expected = path
        .getPointAtLength(path.getTotalLength() * 0.25)
        .matrixTransform(path.getScreenCTM()!);
      const actual = new DOMPoint(0, 0).matrixTransform(particle.getScreenCTM()!);
      return {
        paused: diagram.paused,
        animationsPaused: svg.animationsPaused(),
        time: svg.getCurrentTime(),
        path: path.getAttribute('d'),
        distance: Math.hypot(actual.x - expected.x, actual.y - expected.y),
        sameElements:
          diagram.shadowRoot!.querySelector('svg') === svg &&
          diagram.shadowRoot!.querySelector('[part=rail]') === path &&
          diagram.shadowRoot!.querySelector('[part=particle]') === particle,
      };
    });

  // Observe the stopped position before resizing so a stale SMIL transform cannot go unnoticed.
  await expect.poll(async () => (await readState()).distance).toBeLessThan(1);
  const before = await readState();
  expect(before.paused).toBe(true);
  expect(before.animationsPaused).toBe(true);
  expect(before.time).toBeCloseTo(1, 5);

  // Only change CSS width: changing the diagram definition would rebuild and resample the SVG.
  await diagram.evaluate((element) => ((element as HTMLElement).style.width = '320px'));
  await expect(diagram.locator('[part=stage]')).toHaveAttribute('data-layout', 'vertical');
  await expect.poll(async () => (await readState()).path).not.toBe(before.path);
  await expect.poll(async () => (await readState()).distance).toBeLessThan(1);

  const after = await readState();
  expect(after.sameElements).toBe(true);
  expect(after.paused).toBe(true);
  expect(after.animationsPaused).toBe(true);
  expect(after.time).toBeCloseTo(before.time, 5);
  await elements.dispose();
});
