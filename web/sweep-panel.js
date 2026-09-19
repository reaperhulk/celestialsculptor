// "Vary one condition": seeded variants of a saved checkpoint, run to equal age.
import { variations } from './experiment-lab.js';
import { entry, summarize, writeNotebook } from './notebook.js';
import { parseReplay } from './storage.js';

export function installSweepPanel(app, refresh) {
  const { $, send, storage } = app;
  const panel = document.createElement('section');
  panel.className = 'experiment-lab';
  panel.hidden = true;
  const title = document.createElement('h3'),
    label = document.createElement('label'),
    field = document.createElement('select'),
    valuesLabel = document.createElement('label'),
    values = document.createElement('input'),
    run = document.createElement('button'),
    cancel = document.createElement('button'),
    status = document.createElement('p'),
    results = document.createElement('div');
  title.textContent = 'Vary one condition';
  label.textContent = 'Condition (last matching edit)';
  field.id = 'sweep-condition';
  label.htmlFor = field.id;
  for (const name of ['seed', 'speed', 'radius', 'chaos', 'disorder', 'timescale'])
    field.add(new Option(name, name));
  valuesLabel.textContent = 'One to three values, separated by commas';
  values.id = 'sweep-values';
  valuesLabel.htmlFor = values.id;
  values.value = '41, 42, 43';
  run.textContent = 'Run variations';
  run.id = 'run-sweep';
  cancel.textContent = 'Cancel variations';
  cancel.onclick = () => send('play', { value: false });
  status.setAttribute('role', 'status');
  panel.append(title, label, field, valuesLabel, values, run, cancel, status, results);
  $('notebook-dialog').append(panel);
  let source;
  function open(item) {
    source = item;
    panel.hidden = false;
    title.textContent = 'Vary one condition · ' + item.name;
    results.replaceChildren();
    status.textContent =
      'Each variation starts from the same recorded experiment and runs to the same age. Saved originals stay in the notebook.';
    panel.scrollIntoView({ block: 'nearest' });
  }
  run.onclick = async () => {
    run.disabled = true;
    results.replaceChildren();
    try {
      const variants = variations(
        parseReplay(source.replay),
        field.value,
        values.value.split(',').map((v) => (v.trim() === '' ? NaN : Number(v))),
      );
      status.textContent =
        'Running the variations. Pause cancels without replacing your current system.';
      const result = await send('sweep', { replays: variants.map((v) => v.replay) });
      result.results.forEach((value, i) => {
        const card = document.createElement('article'),
          text = document.createElement('p'),
          save = document.createElement('button');
        const summary = summarize(value.snapshot);
        text.textContent = `${variants[i].label} · year ${summary.years.toFixed(2)} · ${summary.planets} worlds · ${summary.moons} moons · ${summary.collisions} mergers`;
        save.textContent = 'Save ' + variants[i].label;
        save.onclick = () => {
          try {
            const next = [
              ...app.notebook.entries,
              entry(source.name + ' · ' + variants[i].label, value.replay, value.snapshot),
            ];
            writeNotebook(storage, next);
            app.notebook.entries = next;
            refresh();
            save.disabled = true;
          } catch (e) {
            status.textContent = e.message;
          }
        };
        card.append(text, save);
        results.append(card);
      });
      status.textContent =
        'Variations finished at equal age. Save two results to compare their orbits and histories.';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      run.disabled = false;
    }
  };
  return { open };
}
