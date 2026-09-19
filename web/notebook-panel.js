// Experiment notebook: saved checkpoints, equal-age comparison and timeline review.
import { ExperimentLab } from './experiment-lab.js';
import { experimentDifferences } from './comparison.js';
import { entry, writeNotebook, compare, summarize } from './notebook.js';
import { parseReplay } from './storage.js';
import { canPlay } from './progression.js';

export function installNotebookPanel(app, sweep) {
  const { $, send, toast, storage, download, confirmReset, autosave } = app;
  let comparisonIds = [];
  function updateHistory() {
    const state = app.state;
    if (!state) return;
    const slider = $('history-tick');
    slider.max = String(state.timeline_end || 0);
    slider.disabled = !state.timeline_end;
    if (document.activeElement !== slider) slider.value = String(state.tick);
    $('history-time').textContent =
      `Year ${(Number(slider.value) / 512).toFixed(2)} of ${((state.timeline_end || 0) / 512).toFixed(2)}`;
    $('history-latest').disabled = !state.reviewing || state.tick === state.timeline_end;
  }
  function showNotebook() {
    const entries = app.notebook.entries;
    $('notebook-list').replaceChildren();
    comparisonIds = comparisonIds.filter((id) => entries.some((item) => item.id === id));
    $('notebook-status').textContent =
      `${entries.length} / 12 saved checkpoints. Select two to compare.`;
    for (const item of [...entries].reverse()) {
      const card = document.createElement('article');
      card.className = 'notebook-entry';
      card.dataset.entry = item.id;
      const heading = document.createElement('h3');
      heading.textContent = item.name;
      const description = document.createElement('p');
      description.textContent = `Year ${item.summary.years.toFixed(2)} · ${item.summary.planets} worlds · ${item.summary.moons} moons · ${item.summary.collisions} mergers · ${item.summary.grazes} grazes · ${item.summary.disruptions} disruptions`;
      const checkLabel = document.createElement('label');
      checkLabel.className = 'check-label';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = comparisonIds.includes(item.id);
      check.setAttribute('aria-label', `Compare ${item.name}`);
      check.onchange = () => {
        if (check.checked) {
          if (comparisonIds.length === 2) {
            check.checked = false;
            $('notebook-status').textContent =
              'Choose two checkpoints. Deselect one to change the comparison.';
            return;
          }
          comparisonIds.push(item.id);
        } else comparisonIds = comparisonIds.filter((id) => id !== item.id);
        renderComparison();
      };
      checkLabel.append(check, document.createTextNode('Compare'));
      const actions = document.createElement('div');
      actions.className = 'notebook-actions';
      const open = document.createElement('button');
      open.textContent = 'Open / fork';
      open.onclick = () => {
        $('notebook-dialog').close();
        confirmReset(async () => {
          const data = parseReplay(item.replay);
          if (data.config.mission !== null && !canPlay(app.profile, data.config.mission))
            throw new Error('Complete the earlier challenges before opening this checkpoint.');
          app.bumpSaveEpoch();
          await send('import', { replay: item.replay });
          app.renderer?.fit();
          $('checkpoint-name').value = (item.name + ' variation').slice(0, 64);
          await autosave();
          toast('Checkpoint opened, paused. The saved original stays in your notebook.');
        });
      };
      const save = document.createElement('button');
      save.textContent = 'Export';
      save.onclick = () =>
        download(
          item.replay,
          'celestial-' +
            (item.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .slice(0, 50) || 'checkpoint') +
            '.json',
        );
      const remove = document.createElement('button');
      remove.textContent = 'Remove';
      remove.onclick = () => {
        try {
          const next = app.notebook.entries.filter((value) => value.id !== item.id);
          writeNotebook(storage, next);
          app.notebook.entries = next;
          showNotebook();
        } catch (error) {
          $('notebook-status').textContent = error.message;
        }
      };
      const vary = document.createElement('button');
      vary.textContent = 'Vary one condition';
      vary.onclick = () => sweep.open(item);
      actions.append(open, vary, save, remove);
      card.append(heading, description, checkLabel, actions);
      $('notebook-list').append(card);
    }
    renderComparison();
    updateHistory();
  }
  let comparisonRequest = 0,
    comparisonSelection = '';
  const experimentLab = new ExperimentLab({
    container: $('comparison-wrap'),
    rerender: () => renderComparison(),
  });
  $('comparison-tick').onchange = () => renderComparison();
  async function renderComparison() {
    const request = ++comparisonRequest;
    const selected = comparisonIds.map((id) => app.notebook.entries.find((item) => item.id === id));
    $('comparison-wrap').hidden = selected.length !== 2;
    if (selected.length !== 2) return;
    const [a, b] = selected,
      head = $('comparison').querySelector('thead'),
      body = $('comparison').querySelector('tbody');
    head.replaceChildren();
    body.replaceChildren();
    const row = document.createElement('tr');
    for (const title of ['Outcome', a.name, b.name, 'Change']) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = title;
      row.append(cell);
    }
    head.append(row);
    const number = (value) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    $('comparison-age').textContent = 'Reconstructing both experiments at the same age…';
    const key = comparisonIds.join(':');
    const end = Math.min(parseReplay(a.replay).end_tick, parseReplay(b.replay).end_tick);
    $('comparison-tick').max = String(end);
    if (key !== comparisonSelection) {
      comparisonSelection = key;
      $('comparison-tick').value = String(end);
    }
    try {
      const result = await send('compare', {
        replays: [a.replay, b.replay],
        tick: Number($('comparison-tick').value),
        include_history: true,
        history_filters: experimentLab.filters(),
      });
      if (request !== comparisonRequest) return;
      experimentLab.update(result, [a.name, b.name]);
      const left = parseReplay(a.replay),
        right = parseReplay(b.replay),
        changed =
          left.commands.filter((c, i) => JSON.stringify(c) !== JSON.stringify(right.commands[i]))
            .length + Math.max(0, right.commands.length - left.commands.length);
      $('comparison-age').textContent =
        `Both at year ${(result.tick / 512).toFixed(2)} · ${changed} differing recorded edits${JSON.stringify(left.config) !== JSON.stringify(right.config) ? ' · starting conditions differ' : ''}.`;
      const differences = experimentDifferences(left, right, result.tick);
      $('comparison-edits').replaceChildren(
        ...(differences.length ? differences : ['No recorded conditions differ by this age.']).map(
          (text) => {
            const li = document.createElement('li');
            li.textContent = text;
            return li;
          },
        ),
      );
      for (const metric of compare(
        { summary: summarize(result.states[0]) },
        { summary: summarize(result.states[1]) },
      )) {
        const line = document.createElement('tr');
        for (const [index, value] of [
          metric.label,
          number(metric.before),
          number(metric.after),
          (metric.change > 0 ? '+' : '') + number(metric.change),
        ].entries()) {
          const cell = document.createElement(index === 0 ? 'th' : 'td');
          if (index === 0) cell.scope = 'row';
          cell.textContent = value;
          line.append(cell);
        }
        body.append(line);
      }
    } catch (error) {
      if (request === comparisonRequest) $('comparison-age').textContent = error.message;
    }
  }
  $('notebook').onclick = async () => {
    try {
      await send('play', { value: false });
      showNotebook();
      $('notebook-dialog').showModal();
    } catch (error) {
      toast(error.message);
    }
  };
  $('close-notebook').onclick = () => $('notebook-dialog').close();
  $('checkpoint-form').onsubmit = async (event) => {
    event.preventDefault();
    $('save-checkpoint').disabled = true;
    try {
      await send('play', { value: false });
      await send('cache_checkpoint');
      const { replay } = await send('export');
      const next = [...app.notebook.entries, entry($('checkpoint-name').value, replay, app.state)];
      writeNotebook(storage, next);
      app.notebook.entries = next;
      await autosave();
      showNotebook();
      $('notebook-status').textContent =
        'Checkpoint saved. Open it later to branch without changing this original.';
    } catch (error) {
      $('notebook-status').textContent = error.message;
    } finally {
      $('save-checkpoint').disabled = false;
    }
  };
  $('history-tick').oninput = () => {
    $('history-time').textContent =
      `Year ${(Number($('history-tick').value) / 512).toFixed(2)} of ${((app.state?.timeline_end || 0) / 512).toFixed(2)}`;
  };
  async function reviewHistory(tick) {
    $('history-tick').disabled = true;
    try {
      await send('seek', { tick });
      $('history-tick').value = String(app.state.tick);
      $('history-note').textContent =
        'Reviewing the recorded run. Return to latest to continue it. Running or editing saves the original automatically before branching.';
    } catch (error) {
      $('notebook-status').textContent = error.message;
      throw error;
    } finally {
      updateHistory();
    }
  }
  $('history-tick').onchange = () => reviewHistory(Number($('history-tick').value)).catch(() => {});
  $('history-latest').onclick = () => reviewHistory(app.state.timeline_end).catch(() => {});
  return { show: showNotebook, updateHistory, reviewHistory };
}
