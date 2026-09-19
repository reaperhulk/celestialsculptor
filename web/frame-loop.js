// The render loop: paced by FrameClock, measured by FrameMeter, never fatal.
import { FrameClock } from './cadence.js';
import { FrameMeter, simulationPace } from './performance.js';
import { writeViewSettings } from './preferences.js';

export function installFrameLoop(app, device) {
  const { $, toast, viewSettings, storage } = app;
  const frameClock = new FrameClock(),
    frameMeter = new FrameMeter();
  $('show-fps').checked = viewSettings.showFps;
  $('fps-overlay').hidden = !viewSettings.showFps;
  $('show-fps').onchange = () => {
    viewSettings.showFps = $('show-fps').checked;
    $('fps-overlay').hidden = !viewSettings.showFps;
    writeViewSettings(storage, viewSettings);
    frameMeter.reset(performance.now(), app.state?.tick || 0);
  };
  let drawFailures = 0;
  function frame(time) {
    try {
      drawFrame(time);
    } catch (error) {
      // Rendering must never take the frame loop down with it; physics and
      // controls keep working and the renderer's own recovery can retry.
      drawFailures++;
      if (drawFailures === 1)
        toast(`Drawing failed: ${error?.message || error}. Physics continues.`);
      if (drawFailures <= 3) console.error(error);
    } finally {
      requestAnimationFrame(frame);
    }
  }
  function drawFrame(time) {
    const state = app.state,
      renderer = app.renderer;
    if (
      !frameClock.due(time, {
        playing: state?.playing || time < (renderer?.cameraActiveUntil || 0),
        batterySaver: viewSettings.maxDpr === 1,
        reduceMotion: viewSettings.reduceMotion,
        hidden: document.hidden,
      })
    )
      return;
    const start = performance.now(),
      drawn = renderer?.draw(time / 1000);
    if (drawn && $('scene-context').textContent !== renderer.sceneLabel)
      $('scene-context').textContent = renderer.sceneLabel;
    device.frame(time, performance.now() - start, drawn);
    if (viewSettings.showFps && drawn) {
      frameMeter.record(time, performance.now() - start);
      const report = frameMeter.report(time, state?.tick || 0);
      if (report) {
        const pace = simulationPace(report.ticksPerSecond, state.speed, state.playing);
        globalThis.__celestialPerformance = {
          ...report,
          ...pace,
          bodies: state.bodies.length,
          dpr: renderer.dpr,
          camera: { ...renderer.center, zoom: renderer.zoom, following: renderer.follow },
        };
        $('fps-overlay').textContent =
          `${report.fps.toFixed(0)} fps · p95 ${report.p95.toFixed(1)} ms\nDraw CPU ${report.drawMs.toFixed(1)} ms · ${report.ticksPerSecond.toFixed(0)} ticks/s\n${state.playing ? `Physics ${pace.achievedSpeed.toFixed(2)}× / ${state.speed}× requested` : 'Physics paused'}\n${state.bodies.length} bodies · DPR ${renderer.dpr}`;
      }
    }
  }
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => {
    frameMeter.reset(performance.now(), app.state?.tick || 0);
    device.idle();
  });
  return { frameMeter };
}
