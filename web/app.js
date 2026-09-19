import { BodyFrames } from './body-frame.js';
const bodyFrames = new BodyFrames();
import { Inspector } from './inspector.js';
import { draftOutsideView, draftZoom } from './preview.js';
import { PlayControl } from './play-control.js';
import { resonanceText } from './resonance-reading.js';
import { orbitalWatchSpeed } from './playback.js';
import { Renderer } from './renderer.js';
import { installNotebookPanel } from './notebook-panel.js';
import { installSweepPanel } from './sweep-panel.js';
import { installDevicePanel } from './device-panel.js';
import { installFrameLoop } from './frame-loop.js';
import { installGpuPanel } from './gpu-panel.js';
import { installCampaignDialog } from './campaign-dialog.js';
import { installRecipesDialog } from './recipes-dialog.js';
import { clampZoom } from './camera.js';
import { fpsFlag } from './performance.js';
import { installInput } from './input.js';
import {
  readProfile,
  writeProfile,
  canPlay,
  nextMission,
  award,
  normalizeProfile,
} from './progression.js';
import {
  deviceStorage,
  parseReplay,
  saveExperiment,
  savedExperiments,
  archiveExperiment,
  parseArchive,
} from './storage.js';
import { Soundscape } from './audio.js';
import { shouldPresent } from './presentation.js';
import { parseSeed, parseLaunchFields, placementIssue } from './conditions.js';
import { RequestChannel } from './channel.js';
import { EventCursor } from './events.js';
import { CoalescedTask } from './coalesce.js';
import { goalMessage } from './guidance.js';
import { diagnosticReport } from './report.js';
import { diskCommand, diskIssue } from './disk.js';
import { readViewSettings, writeViewSettings } from './preferences.js';
import { readNotebook, preserveOriginal } from './notebook.js';
import { moonRegion } from './moons.js';
import { spinRate } from './readings.js';
import { Observatory } from './observatory.js';
import { ChallengeGuide } from './challenges.js';
import { GeneratorControls } from './generation.js';

const $ = (id) => document.getElementById(id);
let state = null,
  missions = [],
  mission = 0,
  renderer,
  selectedBody = null,
  ready = false,
  restoring = true,
  toastTimer;
const storage = deviceStorage();
const viewSettings = readViewSettings(
  storage,
  matchMedia('(prefers-reduced-motion: reduce)').matches,
);
viewSettings.showFps = fpsFlag(location.search, viewSettings.showFps);
const sound = new Soundscape();
sound.setVolume(viewSettings.volume);
const eventCursor = new EventCursor();
let notebookEntries = readNotebook(storage);
let profile = readProfile(storage),
  awardedThisRun = false,
  saveEpoch = 0,
  autosaveTimer;

function positionToast() {
  const canvas = $('universe').getBoundingClientRect();
  $('toast').style.bottom = Math.max(12, innerHeight - canvas.bottom + 16) + 'px';
}
addEventListener('resize', positionToast);
function toast(message) {
  positionToast();
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 5000);
}
function fail(message) {
  $('loading').hidden = false;
  $('loading').querySelector('p').textContent = message;
  $('play').disabled = true;
  $('reload').hidden = false;
}
$('reload').onclick = () => location.reload();
try {
  renderer = new Renderer($('universe'), toast);
} catch (error) {
  fail(error.message + ' You can still sculpt, run, inspect and export using the controls.');
}
let worker, startupError;
try {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
} catch (error) {
  startupError = 'The simulation worker could not start. Reload to try again. ' + error.message;
}
const channel = new RequestChannel((message) => worker.postMessage(message));
const playback = new PlayControl(
  (type, data, current) => sendRequest(type, data, current),
  (playing, pending = false) => {
    $('play').textContent = state?.busy
      ? 'Cancel replay'
      : pending
        ? playing
          ? 'Starting…'
          : 'Pausing…'
        : playing
          ? 'Ⅱ Pause'
          : '▶ Run';
    $('play').setAttribute('aria-label', $('play').textContent.replace(/^[▶Ⅱ]\s*/, ''));
    $('play').setAttribute('aria-pressed', String(playing));
    $('play').setAttribute('aria-busy', String(pending));
  },
);
async function sendRequest(type, data = {}, current = null) {
  if (
    state?.reviewing &&
    (['command', 'step', 'undo', 'rewind'].includes(type) || (type === 'play' && data.value))
  ) {
    const original = await channel.send('original');
    if (current && !current()) return { playing: playback.playing };
    notebookEntries = preserveOriginal(
      storage,
      notebookEntries,
      original.replay,
      original.snapshot,
    );
  }
  return channel.send(type, data).then((reply) => {
    if (['command', 'undo', 'rewind', 'step'].includes(type)) {
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(autosave, 250);
    }
    return reply;
  });
}
function send(type, data = {}) {
  return type === 'play' ? playback.set(data.value) : sendRequest(type, data);
}
function workerFailed(message) {
  ready = false;
  clearTimeout(startupTimer);
  worker?.terminate();
  channel.close(message);
  document.body.dataset.ready = 'error';
  for (const id of ['launch', 'step', 'undo', 'rewind']) $(id).disabled = true;
  fail(message);
}
const startupTimer = setTimeout(
  () =>
    workerFailed('The simulation is taking too long to load. Check your connection and reload.'),
  30000,
);
if (startupError) workerFailed(startupError);
function action(type, data = {}) {
  return send(type, data).catch((error) => toast(error.message));
}
function draft() {
  return {
    ...parseLaunchFields({
      kind: $('kind').value,
      radius: $('radius').value,
      angle: $('angle').value,
      speed: $('speed').value,
    }),
    mass: Number($('body-mass').value),
  };
}
function updateDraft() {
  let d;
  try {
    d = draft();
  } catch (error) {
    if (renderer) renderer.draft = null;
    $('launch').disabled = true;
    $('orbit-reading').textContent = error.message;
    return;
  }
  if (renderer) renderer.draft = { ...d, speed: d.speed * Number($('orbit-direction').value) };
  $('radius-range').value = String(d.radius);
  $('speed-range').value = String(d.speed * 100);
  const tool = state?.status.tools.find((t) => t.kind === d.kind);
  $('body-mass').min = String(tool?.min_mass ?? 0.1);
  $('body-mass').max = String(tool?.max_mass ?? 10);
  $('mass-summary').textContent = `Mass & launch angle · ${d.mass} Earth${d.mass === 1 ? '' : 's'}`;
  $('mass-help').textContent =
    `Costs ${d.mass} matter. More mass means stronger gravity and a larger world.`;
  const issue = placementIssue(state?.status, d.kind, d.mass);
  $('launch').disabled = !ready || Boolean(issue);
  $('launch').title = issue;
  $('orbit-reading').textContent =
    issue ||
    (d.speed > Math.SQRT2
      ? 'Escape trajectory · a world without a sun'
      : Math.abs(d.speed - 1) < 0.015
        ? 'Circular orbit · a quiet beginning'
        : d.speed < 0.2
          ? 'Falling inward · likely stellar impact'
          : 'Elliptical orbit · watch the close approach');
}
function setMissionUI() {
  const m = mission === null ? null : state?.mission_definition || missions[mission];
  $('campaign').setAttribute('aria-pressed', String(mission !== null));
  $('sandbox').setAttribute('aria-pressed', String(mission === null));
  $('campaign').classList.toggle('active', mission !== null);
  $('sandbox').classList.toggle('active', mission === null);
  $('mission-index').textContent = m
    ? `CHALLENGE ${String(mission + 1).padStart(2, '0')} / 10`
    : 'OPEN EXPLORATION';
  $('mission-name').textContent = m?.name || 'Your universe';
  $('mission-brief').textContent =
    m?.brief || 'No goal, no hurry. Follow an idea and see what gravity makes of it.';
  $('mission-hint').textContent =
    m?.hint ||
    'Try a crowded belt, a giant on an eccentric orbit, or a system around a smaller star.';
  $('reward').textContent = m?.unlock || 'Every tool is available';
  const speedLimit = mission === 6 ? 135 : 220;
  $('speed').max = String(speedLimit);
  $('speed-range').max = String(speedLimit);
  if (Number($('speed').value) > speedLimit) $('speed').value = String(speedLimit);
  $('launch-form').hidden = Boolean(
    mission !== null && ((mission >= 3 && mission <= 5) || mission === 7),
  );
  const dust = state?.status.tools.find((t) => t.kind === 'dust');
  $('seed-belt').hidden = !dust?.unlocked;
  $('disk-tools').hidden = !dust?.unlocked;
  if (mission !== null && mission >= 3 && mission <= 5) $('disk-tools').open = true;
  $('recipes').hidden = mission !== null;
  $('star-mass').disabled = mission !== null && mission < 2;
  $('next-mission').hidden = true;
  updateDraft();
}
async function reset(next = mission, overrides = {}) {
  if (!ready) return false;
  if (next !== null && !canPlay(profile, next)) {
    toast('Complete the previous challenges first.');
    return false;
  }
  try {
    const config = {
      seed: parseSeed($('seed').value),
      mission: next,
      star_mass: next !== null && next < 2 ? 1 : Number($('star-mass').value),
      ...overrides,
    };
    saveEpoch++;
    await send('reset', { config });
    awardedThisRun = false;
    setMissionUI();
    if (next === 7) {
      selectedBody = 1;
      if (renderer) {
        renderer.selected = 1;
        renderer.focus(1);
      }
      inspect();
      $('moon-tools').open = true;
    }
    await autosave();
    return true;
  } catch (error) {
    if (state) {
      mission = state.config.mission;
      $('star-mass').value = String(state.config.star_mass);
      $('seed').value = String(state.config.seed);
      setMissionUI();
    }
    toast(error.message);
    return false;
  }
}
let moonHost = null;
let inspectorIds = '';
const bodyInspector = new Inspector($('inspector'));
function inspect() {
  const listed = (state?.bodies || []).slice(0, 256),
    chosen = state?.bodies.find((b) => b.id === selectedBody);
  if (chosen && !listed.some((b) => b.id === chosen.id)) listed.push(chosen);
  const ids = listed.map((b) => b.id).join(',');
  if (ids !== inspectorIds) {
    inspectorIds = ids;
    $('inspect-body').replaceChildren();
    for (const b of listed) {
      const option = document.createElement('option');
      option.value = String(b.id);
      option.textContent = b.id === 0 ? 'The star' : `World ${b.id} · ${b.kind}`;
      $('inspect-body').append(option);
    }
  }
  const body = state?.bodies.find((b) => b.id === selectedBody);
  $('migration-tools').hidden = mission !== null || !body || body.id === 0 || body.parent !== null;
  $('spin-controls').hidden = !body || body.id === 0;
  $('moon-tools').hidden =
    !body || body.id === 0 || body.parent !== null || !state?.moons_available;
  if (body && !$('moon-tools').hidden) {
    const hostKey = `${state.generation}:${body.id}`;
    if (hostKey !== moonHost) {
      moonHost = hostKey;
      const mass = Math.max(0.001, Math.min(0.1, (body.mass / 3.003e-6) * 0.01));
      $('moon-mass').value = String(Number(mass.toFixed(3)));
      const region = moonRegion(
        body,
        state.orbits.find(([id]) => id === body.id)?.[1],
        state.bodies[0].mass,
        mass,
      );
      $('moon-distance').value = String(Number(Math.sqrt(region.min * region.max).toFixed(4)));
    }
    updateMoonRegion(body);
  }
  $('watch-orbit').disabled = !body || body.id === 0;
  $('follow-body').disabled = !body;
  $('show-orbit').disabled = !body || body.id === 0;
  $('nudge-controls').hidden = !body || body.id === 0 || !state?.burns_available;
  if (body && body.id !== 0)
    $('nudge-controls').querySelector('p').textContent =
      `Adjust orbit around ${state.moon_orbits?.some(([id]) => id === body.id) ? `World ${body.parent}` : 'the star'} · 1 matter per burn. Boost follows the orbital direction; strength is a fraction of circular speed around this host.`;
  bodyInspector.update(state, body);
  if (body) $('inspect-body').value = String(body.id);
}
function updateMoonRegion(body = state?.bodies.find((b) => b.id === selectedBody)) {
  if (!body || body.id === 0) return;
  const mass = Number($('moon-mass').value),
    distance = Number($('moon-distance').value),
    region = moonRegion(
      body,
      state.orbits.find(([id]) => id === body.id)?.[1],
      state.bodies[0].mass,
      mass,
    );
  $('moon-mass').max = String(Math.min(10, (body.mass / 3.003e-6) * 0.1));
  $('add-moon').disabled =
    !region.available ||
    distance < region.min ||
    distance > region.max ||
    mass > state.status.remaining;
  $('moon-guidance').textContent = region.available
    ? `World ${body.id}. For this mass, start between ${region.min.toFixed(4)} and ${region.max.toFixed(4)} AU. Space moons apart; all bodies can perturb them.`
    : 'This mass or host orbit has no supported starting region. Try a lighter moon or a calmer, more distant host.';
}
$('moon-mass').oninput = () => updateMoonRegion();
$('moon-distance').oninput = () => updateMoonRegion();
function selectBody(id, reveal = false) {
  selectedBody = id;
  if (state?.bodies.length > 256)
    send('inspect', { body: id }).catch((error) => toast(error.message));
  if (renderer) renderer.selected = id;
  inspect();
  if (reveal) {
    setPlacement(false);
    document.querySelector('.mobile-tabs [data-panel="sculpt"]').click();
    const panel = document.querySelector('.sculpt-panel');
    panel.scrollTop +=
      $('inspector').getBoundingClientRect().top - panel.getBoundingClientRect().top - 8;
  }
}
$('inspect-body').onchange = () => selectBody(Number($('inspect-body').value));
for (const button of document.querySelectorAll('[data-nudge]'))
  button.onclick = () => {
    const command = { type: 'nudge', id: selectedBody, tangential: 0, radial: 0 };
    command[button.dataset.nudge] = Number(button.dataset.amount);
    action('command', { command });
  };
let lastUI = 0,
  lastEventSignature = '',
  lastObjectives = '';
function renderState(next) {
  if (
    !state ||
    next.generation !== state.generation ||
    next.speed !== state.speed ||
    next.playing !== state.playing ||
    next.tick < state.tick
  )
    frameLoop.frameMeter.reset(performance.now(), next.tick);
  const present = shouldPresent(state, next, lastUI, performance.now());
  if (state && next.speed !== state.speed) devicePanel.stop('playback speed changed');
  if (next.generation !== state?.generation) {
    frameLoop.frameMeter.reset(performance.now(), next.tick);
    setPlacement(false);
  }
  const changedMission = next.config.mission !== mission;
  if (changedMission) {
    mission = next.config.mission;
    awardedThisRun = false;
  }
  $('star-mass').value = String(next.config.star_mass);
  if (document.activeElement !== $('seed')) $('seed').value = String(next.config.seed);
  $('system-label').textContent = `EXPERIMENT ${String(next.config.seed).padStart(4, '0')}`;
  if (!next.bodies.some((body) => body.id === selectedBody))
    selectedBody = next.bodies[0]?.id ?? null;
  state = next;
  if (changedMission) setMissionUI();
  renderer?.setState(next);
  $('universe').dataset.tick = String(next.tick);
  $('universe').dataset.playing = String(next.playing);
  if (!present) return;
  lastUI = performance.now();
  notebookPanel.updateHistory();
  const s = next.status,
    m = next.mission_definition || (mission === null ? null : missions[mission]);
  for (const tool of s.tools) {
    const option = [...$('kind').options].find((option) => option.value === tool.kind);
    if (option) option.disabled = !tool.unlocked;
  }
  if ($('kind').selectedOptions[0]?.disabled) {
    const first = [...$('kind').options].find((o) => !o.disabled);
    if (first) {
      $('kind').value = first.value;
      $('body-mass').value = String({ rocky: 1, ice: 2, giant: 318, dust: 0.25 }[first.value]);
    }
  }
  updateDraft();
  updateDisk();
  for (const button of document.querySelectorAll('[data-nudge]'))
    button.disabled = s.remaining < 1 || s.actions_remaining === 0;
  const objectives = JSON.stringify(s.objectives);
  if (objectives !== lastObjectives) {
    lastObjectives = objectives;
    $('objectives').replaceChildren();
    for (const goal of s.objectives.filter(Boolean)) {
      const li = document.createElement('li'),
        label = document.createElement('span'),
        value = document.createElement('strong');
      label.textContent = goal.label;
      value.textContent = `${goal.current} / ${goal.target}`;
      li.classList.toggle('met', goal.current >= goal.target);
      li.append(label, value);
      $('objectives').append(li);
    }
  }
  if (s.completed && mission !== null && !awardedThisRun) {
    awardedThisRun = true;
    profile = award(
      profile,
      mission,
      next.assessment?.mastery.filter((goal) => goal.earned).map((goal) => goal.code) || [],
    );
    if (!writeProfile(storage, profile))
      toast(
        'Discovery earned. Device storage is unavailable, so progress will last for this session.',
      );
    else toast(`Discovery: ${m.unlock}`);
  }
  $('playback-note').textContent = next.busy
    ? 'Rebuilding experiment…'
    : `${next.bodies.length} bodies · ${s.moons} bound moon${s.moons === 1 ? '' : 's'} · ${s.formed} worlds formed from debris`;
  updateResonanceReadings(next);
  $('next-mission').hidden = !s.completed || mission === null;
  $('next-mission').textContent = mission === 9 ? 'Explore the sandbox' : 'Next challenge';
  $('collection').textContent =
    `${profile.completed.length} / 10 discoveries${profile.mastery?.length ? ` · ${profile.mastery.length} mastery medals` : ''}`;
  $('time-speed').value = String(next.speed);
  $('sim-years').textContent = s.years.toFixed(2);
  $('matter').textContent = s.remaining.toLocaleString(undefined, { maximumFractionDigits: 2 });
  $('planet-count').textContent = String(s.planets);
  $('calm-count').textContent = String(s.calm);
  $('habitable-count').textContent = String(s.habitable);
  $('goal-progress').value = s.progress;
  $('goal-time').textContent = m
    ? m.hold_years
      ? `${s.held_years.toFixed(1)} / ${m.hold_years} yr`
      : s.completed
        ? 'Complete'
        : 'Discovery'
    : 'Free play';
  $('goal-state').textContent = goalMessage(s, mission, next.bodies.length, next);
  if ([4, 6, 8].includes(mission) && !s.exhausted && next.assessment)
    $('goal-state').textContent = next.assessment.message;
  challengeGuide.update(next);
  generatorControls.update();
  $('goal-label').textContent = m
    ? m.hold_years
      ? 'Maintain conditions'
      : 'Make a discovery'
    : 'Open exploration';
  $('goal-progress').hidden = mission === null;
  $('outcome-totals').textContent =
    `${s.collisions} mergers · ${s.grazes || 0} grazes · ${s.disruptions || 0} disruptions · ${s.ejections} escapes · ${s.absorbed} stellar impacts`;
  playback.observe(next);
  $('play').disabled = !ready || restoring || s.exhausted;
  for (const id of ['step', 'undo', 'rewind', 'sandbox', 'campaign', 'clear', 'generate'])
    $(id).disabled = restoring;
  document.querySelector('.sculpt-panel').inert = restoring;
  document.querySelector('.mission-panel').inert = restoring;
  $('system-title').textContent = s.completed
    ? 'A little order, from the unknown.'
    : s.planets > 0
      ? 'Gravity has the pen now.'
      : 'A beginning, in starlight.';
  const eventSignature = JSON.stringify(next.events);
  for (const event of eventCursor.consume(next.generation, next.events)) sound.event(event.kind);
  if (eventSignature !== lastEventSignature) {
    lastEventSignature = eventSignature;
    $('events').replaceChildren();
    if (!next.events.length) {
      const li = document.createElement('li');
      li.textContent = 'Your star is waiting.';
      $('events').append(li);
    }
    for (const event of [...next.events].reverse().slice(0, 5)) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.className = 'journal-event';
      button.textContent = `${(event.tick / 512).toFixed(2)} yr · ${event.text}`;
      button.onclick = () => {
        renderer?.focusEvent(event);
        selectedBody = event.body;
        inspect();
        if (!state.bodies.some((b) => b.id === event.body))
          toast(
            `Event location at year ${(event.tick / 512).toFixed(2)}. Use the notebook timeline to review the earlier system.`,
          );
      };
      li.append(button);
      $('events').append(li);
    }
  }
  inspect();
}
if (worker)
  worker.onmessage = async ({ data }) => {
    if (data.type === 'state' && data.frame) data = bodyFrames.decode(data);
    if (data.type === 'ready') {
      clearTimeout(startupTimer);
      missions = data.missions;
      ready = true;
      if (renderer) $('loading').hidden = true;
      document.body.dataset.ready = 'true';
      let restored = false;
      for (const replay of savedExperiments(storage)) {
        try {
          const data = parseReplay(replay);
          if (data.config.mission !== null && !canPlay(profile, data.config.mission)) continue;
          await send('reset', { config: data.config });
          await send('import', { replay });
          toast('Your experiment is restored, paused.');
          restored = true;
          break;
        } catch {
          /* Try backup before starting fresh. */
        }
      }
      if (!restored) await reset(nextMission(profile));
      restoring = false;
      if (state) renderState(state);
      await autosave();
    } else if (data.type === 'state') {
      renderState(data);
    } else if (data.type === 'fatal') {
      workerFailed(data.message);
    } else if (data.type === 'progress')
      $('playback-note').textContent =
        `Rebuilding experiment · ${(data.tick / 512).toFixed(1)} / ${(data.end_tick / 512).toFixed(1)} years`;
    if (!channel.receive(data) && data.type === 'error') toast(data.message);
  };
if (worker) {
  // Before the worker reports ready, any error is a startup failure. Afterwards
  // the worker is still alive and the experiment is intact, so keep the session.
  worker.onerror = (event) => {
    if (!ready) return workerFailed('The simulation could not start. Reload to try again.');
    event?.preventDefault?.();
    toast(
      `Simulation error: ${event?.message || 'unexpected failure'}. Your experiment is unchanged.`,
    );
  };
  worker.onmessageerror = () => toast('A simulation message could not be decoded.');
}
let confirming = false;
async function confirmReset(callback, onCancel = () => {}) {
  if (confirming) return;
  if (!state || state.bodies.length === 1) {
    try {
      await callback();
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  confirming = true;
  const wasPlaying = state.playing,
    generation = state.generation;
  try {
    if (wasPlaying) await send('play', { value: false });
    const dialog = $('confirm-dialog');
    let accepted = false;
    dialog.onclose = () => {
      confirming = false;
      if (!accepted) {
        onCancel();
        if (wasPlaying && state?.generation === generation && !document.hidden)
          action('play', { value: true });
      }
    };
    $('confirm-ok').onclick = async () => {
      accepted = true;
      dialog.close();
      try {
        await callback();
      } catch (error) {
        toast(error.message);
      }
    };
    dialog.showModal();
  } catch (error) {
    confirming = false;
    toast(error.message);
  }
}
async function saveSnapshot() {
  if (!ready || !state || restoring || state.busy) return;
  const epoch = saveEpoch;
  try {
    const { replay } = await send('export');
    if (epoch === saveEpoch && !restoring && !state?.busy)
      $('save-status').textContent = saveExperiment(storage, replay)
        ? 'Saved on this device'
        : 'Saving unavailable · export to keep';
  } catch {
    $('save-status').textContent = 'Save pending';
  }
}
const saveTask = new CoalescedTask(saveSnapshot);
function autosave() {
  return saveTask.run();
}
setInterval(autosave, 3000);
function download(content, name) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('export').onclick = async () => {
  try {
    const { replay } = await send('export');
    download(replay, 'celestial-experiment.json');
  } catch (error) {
    toast(error.message);
  }
};
$('backup').onclick = async () => {
  try {
    const { replay } = await send('export');
    download(archiveExperiment(replay, profile), 'celestial-backup.json');
  } catch (error) {
    toast(error.message);
  }
};
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = async () => {
  const file = $('import-file').files[0];
  $('import-file').value = '';
  if (!file) return;
  try {
    if (file.size > 600_000) throw new Error('Choose an experiment or backup smaller than 600 KB.');
    const archive = parseArchive(await file.text()),
      replay = archive.replay,
      data = parseReplay(replay);
    const merged = normalizeProfile({
      version: 1,
      completed: [...profile.completed, ...(archive.profile?.completed || [])],
      mastery: [...(profile.mastery || []), ...(archive.profile?.mastery || [])],
    });
    if (data.config.mission !== null && !canPlay(merged, data.config.mission))
      throw new Error('Complete earlier challenges before importing this challenge.');
    confirmReset(async () => {
      try {
        saveEpoch++;
        await send('import', { replay });
        profile = merged;
        if (state.status.completed && mission !== null)
          profile = award(
            profile,
            mission,
            state.assessment?.mastery.filter((goal) => goal.earned).map((goal) => goal.code) || [],
          );
        writeProfile(storage, profile);
        renderState(state);
        renderer?.trails.clear();
        await autosave();
        toast('Experiment imported, paused.');
      } catch (error) {
        toast(error.message);
      }
    });
  } catch (error) {
    toast(error.message);
  }
};
$('confirm-cancel').onclick = () => $('confirm-dialog').close();
$('sandbox').onclick = () => confirmReset(() => reset(null));
$('next-mission').onclick = () => reset(mission === 9 ? null : mission + 1);
$('clear').onclick = () => confirmReset(() => reset());
$('star-mass').onchange = () => {
  const star_mass = Number($('star-mass').value);
  confirmReset(
    () => reset(mission, { star_mass }),
    () => {
      $('star-mass').value = String(state.config.star_mass);
    },
  );
};
$('seed').onchange = () => {
  try {
    const seed = parseSeed($('seed').value);
    confirmReset(
      () => reset(mission, { seed }),
      () => {
        $('seed').value = String(state.config.seed);
      },
    );
  } catch (error) {
    toast(error.message);
    $('seed').value = String(state?.config.seed ?? 42);
  }
};
function launchCommand() {
  const d = draft();
  d.speed *= Number($('orbit-direction').value);
  return { type: 'launch_mass', ...d };
}
$('launch-form').onsubmit = (event) => {
  event.preventDefault();
  if (ready)
    send('command', { command: launchCommand() })
      .then(() => setPlacement(false))
      .catch((error) => toast(error.message));
};
$('seed-belt').onclick = () =>
  action('command', { command: { type: 'seed_belt', radius: Number($('radius').value) } });
function diskDraft() {
  return diskCommand({
    radius: $('disk-radius').value,
    spread: $('disk-width').value,
    count: $('disk-count').value,
    disorder: $('disk-disorder').value,
  });
}
function updateDisk() {
  $('disk-disorder-value').textContent = $('disk-disorder').value + '%';
  try {
    const command = diskDraft(),
      issue = diskIssue(command, state?.status);
    $('seed-disk').disabled = !ready || Boolean(issue);
    $('disk-summary').textContent =
      issue ||
      `${command.count} fragments · ${(command.radius - command.spread / 2).toFixed(2)}–${(command.radius + command.spread / 2).toFixed(2)} AU`;
  } catch (error) {
    $('seed-disk').disabled = true;
    $('disk-summary').textContent = error.message;
  }
}
for (const id of ['disk-radius', 'disk-width', 'disk-count', 'disk-disorder'])
  $(id).oninput = updateDisk;
$('disk-form').onsubmit = (event) => {
  event.preventDefault();
  try {
    send('command', { command: diskDraft() })
      .then(() => toast('Debris placed. Run the system to watch it evolve.'))
      .catch((error) => toast(error.message));
  } catch (error) {
    toast(error.message);
  }
};
$('kind').addEventListener('change', () => {
  $('body-mass').value = String({ rocky: 1, ice: 2, giant: 318, dust: 0.25 }[$('kind').value]);
  updateDraft();
});
for (const id of ['kind', 'radius', 'speed', 'angle', 'body-mass', 'orbit-direction'])
  $(id).addEventListener('input', updateDraft);
for (const id of ['radius', 'speed'])
  $(id + '-range').oninput = () => {
    $(id).value = $(id + '-range').value;
    updateDraft();
  };
$('play').onclick = () =>
  send('play', { value: state?.busy ? false : !playback.playing }).catch((error) =>
    toast(error.message),
  );
$('step').onclick = () => action('step');
$('rewind').onclick = () => action('rewind');
$('undo').onclick = () => action('undo').then(() => renderer?.trails.clear());
$('time-speed').onchange = () => action('speed', { value: Number($('time-speed').value) });
$('view').onclick = () => {
  if (renderer) {
    renderer.tilt = renderer.tilt === 1 ? 0.62 : 1;
    $('view').textContent = renderer.tilt === 1 ? 'Tilt view' : 'Top view';
  }
};
$('display').onclick = () => $('display-dialog').showModal();
$('close-display').onclick = () => $('display-dialog').close();
for (const [id, key] of [
  ['show-grid', 'showGrid'],
  ['show-trails', 'showTrails'],
  ['show-preview', 'showPreview'],
  ['reduce-motion', 'reduceMotion'],
]) {
  $(id).checked = viewSettings[key];
  if (renderer) renderer[key] = viewSettings[key];
  $(id).onchange = () => {
    devicePanel.stop('display settings changed');
    if (key === 'reduceMotion') viewSettings.reduceMotionPinned = true;
    viewSettings[key] = $(id).checked;
    if (renderer) renderer[key] = viewSettings[key];
    writeViewSettings(storage, viewSettings);
  };
}
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (event) => {
  if (viewSettings.reduceMotionPinned) return;
  viewSettings.reduceMotion = event.matches;
  $('reduce-motion').checked = event.matches;
  if (renderer) renderer.reduceMotion = event.matches;
});
$('render-quality').value = String(viewSettings.maxDpr);
if (renderer) renderer.maxDpr = viewSettings.maxDpr;
$('render-quality').onchange = () => {
  devicePanel.stop('rendering quality changed');
  viewSettings.maxDpr = Number($('render-quality').value);
  if (renderer) renderer.maxDpr = viewSettings.maxDpr;
  writeViewSettings(storage, viewSettings);
};
$('reset-view').onclick = () => {
  if (renderer) {
    renderer.follow = null;
    renderer.cameraTo(state?.bodies[0].pos || { x: 0, y: 0 }, 3.5);
    renderer.tilt = 0.62;
    $('view').textContent = 'Top view';
  }
};
function setPlacement(enabled, reveal = false) {
  if (renderer) {
    renderer.inputMode = enabled ? 'place' : 'navigate';
    if (enabled && reveal && renderer.draft && state) {
      const d = renderer.draft,
        star = state.bodies[0],
        point = renderer.toScreen(
          star.pos.x + d.radius * Math.cos(d.angle),
          star.pos.y + d.radius * Math.sin(d.angle),
        ),
        canvas = $('universe');
      if (draftOutsideView(point, canvas.clientWidth, canvas.clientHeight)) {
        renderer.follow = null;
        renderer.cameraTo(
          star.pos,
          draftZoom(d, canvas.clientWidth, canvas.clientHeight, renderer.tilt, renderer.zoom),
        );
      }
    }
  }
  $('place-mode').setAttribute('aria-pressed', String(enabled));
  $('place-mode').classList.toggle('active', enabled);
  $('scene-hint').textContent = enabled
    ? 'Tap or drag to choose a launch position · Place world to create it'
    : 'Drag to pan · Pinch to zoom · Tap a body for statistics';
}
$('place-mode').onclick = () => {
  const enabled = renderer?.inputMode !== 'place';
  setPlacement(enabled, true);
  if (enabled) {
    document.querySelector('.mobile-tabs [data-panel="sculpt"]').click();
    const panel = document.querySelector('.sculpt-panel');
    panel.scrollTop = 0;
    updateDraft();
  }
};
$('moon-form').onsubmit = (event) => {
  event.preventDefault();
  send('command', {
    command: {
      type: 'launch_moon',
      parent: selectedBody,
      kind: 'rocky',
      mass: Number($('moon-mass').value),
      distance: Number($('moon-distance').value),
      angle: (Number($('moon-angle').value) * Math.PI) / 180,
      speed: (Number($('moon-direction').value) * Number($('moon-speed').value)) / 100,
    },
  })
    .then(() => {
      renderer?.focus(selectedBody);
      toast('Moon placed. Every body contributes to its orbit.');
    })
    .catch((error) => toast(error.message));
};
for (const [id, direction] of [
  ['spin-forward', 1],
  ['spin-reverse', -1],
])
  $(id).onclick = () => {
    try {
      action('command', {
        command: {
          type: 'spin',
          id: selectedBody,
          rate: spinRate($('spin-rate').value, direction),
        },
      });
    } catch (error) {
      toast(error.message);
    }
  };
$('spin-stop').onclick = () =>
  action('command', { command: { type: 'spin', id: selectedBody, rate: 0 } });
$('fit-view').onclick = () => renderer?.fit();
$('follow-body').onclick = () => renderer?.focus(selectedBody);
$('show-orbit').onclick = () => {
  if (renderer) renderer.selected = selectedBody;
  toast('Blue: current orbit. Amber: the strongest neighboring gravitational pull.');
};
$('zoom-in').onclick = () => {
  if (renderer) renderer.cameraTo(renderer.center, clampZoom(renderer.zoom * 0.8));
};
$('zoom-out').onclick = () => {
  if (renderer) renderer.cameraTo(renderer.center, clampZoom(renderer.zoom / 0.8));
};
for (const button of document.querySelectorAll('[data-panel]'))
  if (button.tagName === 'BUTTON')
    button.onclick = () => {
      document.body.dataset.panel = button.dataset.panel;
      if (button.dataset.panel === 'observe') {
        $('analysis-tools').open = true;
        const panel = document.querySelector('.sculpt-panel');
        panel.scrollTop +=
          $('analysis-tools').getBoundingClientRect().top - panel.getBoundingClientRect().top - 8;
      }
      for (const other of document.querySelectorAll('.mobile-tabs button')) {
        other.classList.toggle('active', other === button);
        other.setAttribute('aria-pressed', String(other === button));
      }
    };
$('help').onclick = () => $('help-dialog').showModal();
for (const button of document.querySelectorAll('.dialog-close'))
  button.onclick = () => $('help-dialog').close();
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ready) {
    if (playback.playing) action('play', { value: false });
    autosave();
  }
});
$('sound').onclick = async () => {
  $('sound').disabled = true;
  try {
    const enabled = await sound.toggle();
    $('sound').setAttribute('aria-pressed', String(enabled));
    $('sound').setAttribute('aria-label', enabled ? 'Mute sound' : 'Enable sound');
    $('sound').classList.toggle('active', enabled);
  } catch (error) {
    toast(error.message);
  } finally {
    $('sound').disabled = false;
  }
};
document.addEventListener('visibilitychange', () =>
  sound.visibility(document.hidden).catch(() => {}),
);
if (renderer)
  installInput($('universe'), renderer, {
    onDraft: ({ radius, angle }) => {
      $('radius').value = radius.toFixed(2);
      $('angle').value = String(Math.round(angle));
      updateDraft();
    },
    onSelect: () => selectBody(renderer.selected, true),
  });
document.addEventListener('keydown', (event) => {
  if (
    !ready ||
    document.querySelector('dialog[open]') ||
    /INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName)
  )
    return;
  if (event.repeat && (event.code === 'Space' || ['l', 'r'].includes(event.key.toLowerCase())))
    return;
  if (event.code === 'Space') {
    event.preventDefault();
    $('play').click();
  } else if (event.key.toLowerCase() === 'f') {
    event.preventDefault();
    renderer?.fit();
  } else if (event.key === 'Escape' && renderer?.inputMode === 'place') $('place-mode').click();
  else if (['w', 'a', 's', 'd'].includes(event.key.toLowerCase()) && renderer) {
    event.preventDefault();
    renderer.follow = null;
    renderer.cameraTween = null;
    renderer.panVelocity = null;
    renderer.center = {
      x: renderer.center.x + ({ a: -1, d: 1 }[event.key.toLowerCase()] || 0) * renderer.zoom * 0.08,
      y: renderer.center.y + ({ w: 1, s: -1 }[event.key.toLowerCase()] || 0) * renderer.zoom * 0.08,
    };
    renderer.cameraActiveUntil = performance.now() + 300;
  } else if (event.key.toLowerCase() === 'r') $('rewind').click();
  else if (event.key.toLowerCase() === 'l') $('launch-form').requestSubmit();
  else if (event.key === '+' || event.key === '=') $('zoom-in').click();
  else if (event.key === '-') $('zoom-out').click();
  else if (event.target === $('universe') && event.key.startsWith('Arrow')) {
    event.preventDefault();
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      $('angle').value = String(
        (Number($('angle').value) + (event.key === 'ArrowLeft' ? 5 : 355)) % 360,
      );
    else
      $('radius').value = Math.max(
        0.25,
        Math.min(6, Number($('radius').value) + (event.key === 'ArrowUp' ? 0.05 : -0.05)),
      ).toFixed(2);
    updateDraft();
  }
});
updateDraft();

$('debug-report').onclick = async () => {
  try {
    const { replay } = await send('export');
    const response = await fetch(new URL('./build-info.json', import.meta.url));
    if (!response.ok)
      throw new Error('Build details could not load. Export the experiment instead.');
    const build = await response.json();
    const { balances } = await send('balances');
    download(
      diagnosticReport(replay, profile, build, {
        balances,
        browser: navigator.userAgent,
        viewport: { width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio },
        webgl: Boolean(renderer),
        view: viewSettings,
        performance: globalThis.__celestialPerformance || null,
      }),
      'celestial-bug-report.json',
    );
  } catch (error) {
    toast(error.message);
  }
};

$('sound-volume').value = String(Math.round(viewSettings.volume * 100));
$('sound-volume-value').textContent = $('sound-volume').value + '%';
$('sound-volume').oninput = () => {
  viewSettings.volume = Number($('sound-volume').value) / 100;
  sound.setVolume(viewSettings.volume);
  $('sound-volume-value').textContent = $('sound-volume').value + '%';
  writeViewSettings(storage, viewSettings);
};

let lastResonanceText = '';
function updateResonanceReadings(snapshot) {
  const text = resonanceText(snapshot);
  if (text !== lastResonanceText) {
    lastResonanceText = text;
    $('resonance-readings').textContent = text;
  }
}
$('start-migration').onclick = () =>
  action('command', {
    command: { type: 'migration', id: selectedBody, timescale: Number($('migration-time').value) },
  });
$('stop-migration').onclick = () =>
  action('command', { command: { type: 'migration', id: selectedBody, timescale: 0 } });

const _observatory = new Observatory({
  send,
  trackHistory: (command) => action('command', { command }),
  seek: (tick) => notebookPanel.reviewHistory(tick),
  getState: () => state,
  getSelected: () => selectedBody,
  selectEvent: (event) => {
    selectedBody = event.body;
    if (renderer) {
      renderer.focusEvent(event);
      renderer.encounterOverlay = event.impact || null;
    }
    inspect();
  },
});
const challengeGuide = new ChallengeGuide({
  send,
  getState: () => state,
  trySetup: async (replay) => {
    if (!canPlay(profile, replay.config.mission))
      throw new Error('Complete earlier challenges first.');
    const original = await send('original');
    notebookEntries = preserveOriginal(
      storage,
      notebookEntries,
      original.replay,
      original.snapshot,
    );
    saveEpoch++;
    await send('import', { replay: JSON.stringify(replay) });
    renderer?.fit();
    document.querySelector('.mobile-tabs [data-panel="sculpt"]')?.click();
    await autosave();
    toast(
      'Example setup ready at year zero. Your previous run is in the notebook. Change a condition and run.',
    );
  },
});
const generatorControls = new GeneratorControls({
  storage,
  getState: () => state,
  create: ({ seed, command, play }) =>
    confirmReset(async () => {
      if (await reset(null, { seed })) {
        await send('command', { command });
        generatorControls.record(state.config, command, state.rules_version);
        renderer?.fit();
        if (command.style === 'resonance') {
          await send('speed', { value: 16 });
          $('resonance-panel').open = true;
        }
        await autosave();
        if (play) await send('play', { value: true });
        toast(
          'Your seeded universe is ready. Watch an encounter, then try changing one condition.',
        );
      }
    }),
  repeat: ({ config, command, version }) =>
    confirmReset(async () => {
      saveEpoch++;
      await send('import', {
        replay: JSON.stringify({ version, config, commands: [{ tick: 0, command }], end_tick: 0 }),
      });
      renderer?.fit();
      await autosave();
      await send('play', { value: true });
      toast('The same seed and conditions are running again.');
    }),
  save: () => {
    $('checkpoint-name').value =
      `Seed ${state.config.seed} · year ${state.status.years.toFixed(2)}`;
    $('notebook').click();
  },
});

$('watch-orbit').onclick = async () => {
  try {
    const orbit = (state.moon_orbits.find(([id]) => id === selectedBody) ||
      state.orbits.find(([id]) => id === selectedBody))?.[1];
    const speed = orbitalWatchSpeed(orbit?.period_years);
    await send('speed', { value: speed });
    renderer?.focus(selectedBody);
    await send('play', { value: true });
    toast(`Following this orbit at ${speed}×. Use Time to adjust the pace.`);
  } catch (error) {
    toast(error.message);
  }
};

// Editing a launch starts an explicit placement session; disclosure focus is irrelevant.
$('launch-form').addEventListener('input', () => setPlacement(true, true));
$('launch-form').addEventListener('change', () => setPlacement(true, true));

// Feature panels receive one narrow view of the application instead of its
// module state, so each can be exercised in Node with a fake context.
const app = {
  $,
  toast,
  send,
  action,
  download,
  storage,
  viewSettings,
  inspect,
  confirmReset,
  autosave,
  reset,
  bumpSaveEpoch: () => saveEpoch++,
  get state() {
    return state;
  },
  get renderer() {
    return renderer;
  },
  get ready() {
    return ready;
  },
  get profile() {
    return profile;
  },
  get missions() {
    return missions;
  },
  get selectedBody() {
    return selectedBody;
  },
  set selectedBody(id) {
    selectedBody = id;
  },
  notebook: {
    get entries() {
      return notebookEntries;
    },
    set entries(next) {
      notebookEntries = next;
    },
  },
};
const devicePanel = installDevicePanel(app);
const frameLoop = installFrameLoop(app, devicePanel);
const sweepPanel = installSweepPanel(app, () => notebookPanel.show());
const notebookPanel = installNotebookPanel(app, sweepPanel);
installGpuPanel(app);
installCampaignDialog(app);
installRecipesDialog(app);
