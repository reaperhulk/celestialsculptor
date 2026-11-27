import { test, expect } from './fixtures.js';

test('16× bodies and trail segments follow a tight circular orbit between snapshots', async ({
  page,
}) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const { default: init, Simulation } = await import('./pkg/celestial_wasm.js');
    const { Runtime } = await import('./runtime.js');
    const { Renderer } = await import('./renderer.js');
    await init();
    const renderer = new Renderer(document.body.appendChild(document.createElement('canvas')));
    const runtime = new Runtime(Simulation, (message) => {
      if (message.type === 'error') throw new Error(message.message);
      renderer.setState(message);
    });
    runtime.receive({ type: 'reset', config: { seed: 42, mission: null, star_mass: 1 } });
    runtime.receive({
      type: 'command',
      command: { type: 'launch', kind: 'rocky', radius: 0.4, angle: 0, speed: 1 },
    });
    runtime.receive({ type: 'speed', value: 16 });
    runtime.receive({ type: 'play', value: true });
    runtime.advanceElapsed(1 / 30);
    runtime.state();
    // Render halfway through the actual 54-tick interval.
    renderer.previousReceived = 1;
    renderer.receivedAt = 1 + 1 / 30;
    renderer.draw(1.05);
    const position = renderer.displayPositions.get(1);
    const lines = renderer.lineStream.view();
    const radii = [];
    for (let i = 0; i < lines.length; i += 12) {
      const x = (lines[i] + lines[i + 6]) / 2;
      const y = (lines[i + 1] + lines[i + 7]) / 2;
      radii.push(Math.hypot(x, y));
    }
    return {
      tick: runtime.sim.tick(),
      bodyRadius: Math.hypot(position.x, position.y),
      segments: radii.length,
      minRadius: Math.min(...radii),
      endpointError: Math.hypot(lines.at(-6) - position.x, lines.at(-5) - position.y),
    };
  });
  expect(result.tick).toBe(54);
  expect(result.bodyRadius).toBeCloseTo(0.4, 2);
  expect(result.minRadius).toBeGreaterThan(0.395);
  expect(result.endpointError).toBeLessThan(1e-6);
  expect(result.segments).toBeGreaterThan(8);
});
