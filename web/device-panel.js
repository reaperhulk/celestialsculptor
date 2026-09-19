// Sustained device performance recording (View → Device performance test).
import { DeviceRecording, deviceScenario, deviceScenarioSpeed } from './device-test.js';
import { preserveOriginal } from './notebook.js';

export function installDevicePanel(app) {
  const { $, send, toast, storage, download, viewSettings, autosave, inspect } = app;
  let recording = null,
    scenarioName = 'current',
    generation = 0,
    preparedGeneration = -1;
  const modelLabel = document.createElement('label'),
    model = document.createElement('input'),
    category = document.createElement('select'),
    physicalLabel = document.createElement('label'),
    physical = document.createElement('input');
  model.id = 'device-model';
  modelLabel.htmlFor = model.id;
  modelLabel.textContent = 'Device model and browser version';
  model.maxLength = 120;
  model.placeholder = 'e.g. iPhone 15, Safari 18';
  category.setAttribute('aria-label', 'Device category');
  for (const value of ['desktop', 'iphone', 'ipad', 'android', 'other'])
    category.add(new Option(value, value));
  physical.type = 'checkbox';
  physicalLabel.append(
    physical,
    document.createTextNode('Recording on this physical device (no emulation)'),
  );
  $('record-device').before(modelLabel, model, category, physicalLabel);

  function stop(reason) {
    if (recording && !recording.done) {
      recording.stop(reason);
      $('device-status').textContent =
        `Recording ended: ${reason}. Download its partial report or start a new recording.`;
      toast('Device recording ended. Its timing report is ready in View.');
    }
  }
  addEventListener('resize', () => stop('viewport changed'));
  $('prepare-device').onclick = async () => {
    try {
      await send('play', { value: false });
      const original = await send('original');
      app.notebook.entries = preserveOriginal(
        storage,
        app.notebook.entries,
        original.replay,
        original.snapshot,
      );
      scenarioName = $('device-scenario').value;
      app.bumpSaveEpoch();
      await send('import', { replay: JSON.stringify(deviceScenario(scenarioName)) });
      await send('speed', { value: deviceScenarioSpeed(scenarioName) });
      await send('event_policy', { value: 'off' });
      preparedGeneration = app.state.generation;
      app.renderer?.fit();
      if (scenarioName === 'moons') {
        app.selectedBody = 1;
        app.renderer?.focus(1);
        inspect();
      }
      $('device-status').textContent =
        `Scenario ready at ${app.state.speed}× speed. Your original is in the notebook. Start recording, then pan, zoom and open Observe while it runs.`;
      await autosave();
    } catch (error) {
      $('device-status').textContent = error.message;
    }
  };
  $('record-device').onclick = async () => {
    try {
      const response = await fetch(new URL('./build-info.json', import.meta.url));
      if (!response.ok) throw new Error('Build details could not load. Try recording again.');
      const build = await response.json();
      await send('play', { value: true });
      const state = app.state;
      generation = state.generation;
      const { replay } = await send('export');
      recording = new DeviceRecording({
        revision: build.revision,
        wasmHash: build.assets?.['pkg/celestial_wasm_bg.wasm']?.sha256,
        dirty: build.dirty,
        physicsSubsteps: state.physics_substeps,
        physicalDevice: physical.checked,
        deviceModel: model.value.trim(),
        deviceClass: category.value,
        speed: state.speed,
        scenario: preparedGeneration === state.generation ? scenarioName : 'current',
        replay: JSON.parse(replay),
        browser: navigator.userAgent,
        viewport: { width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio },
        quality: { ...viewSettings },
        dpr: app.renderer?.dpr,
        created: new Date().toISOString(),
      });
      $('device-status').textContent =
        'Recording five minutes of visible running time. Pauses are excluded. Changing speed, quality or window size ends the report; download early for a partial report.';
      $('download-device').disabled = false;
      $('display-dialog').close();
      toast('Five-minute recording started. Navigate and open charts as you watch.');
    } catch (error) {
      $('device-status').textContent = error.message;
    }
  };
  $('download-device').onclick = () => {
    if (recording)
      download(JSON.stringify(recording.report(), null, 2), 'celestial-device-performance.json');
  };
  return {
    stop,
    /** Called once per drawn frame with the CPU draw cost. */
    frame(time, drawMs, drawn) {
      if (!recording || recording.done) return;
      const state = app.state;
      if (state?.generation !== generation) recording.stop('system changed');
      recording.record(
        time,
        drawMs,
        state?.tick || 0,
        Boolean(drawn && state?.playing && !document.hidden),
      );
      if (recording.done) {
        $('device-status').textContent =
          `Recording ${recording.reason}. Download the report in View.`;
        toast('Device recording finished. Its report is ready in View.');
      }
    },
    /** Visibility changes record an explicit idle sample. */
    idle() {
      recording?.record(performance.now(), 0, app.state?.tick || 0, false);
    },
  };
}
