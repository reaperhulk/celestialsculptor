import { series, chartGeometry, drawChart } from './observatory.js';
import { quantity } from './readings.js';
export const HINTS = {
  3: [
    'Fragments only grow when their paths cross. Keep the disk narrow so neighbours meet.',
    'Disorder spreads speeds: a little makes encounters, too much scatters survivors onto eccentric orbits that never count as calm.',
    'Try 24 fragments in a 0.6 AU disk at 15–25% disorder, then branch and compare a wider or calmer disk at the same age.',
  ],
  4: [
    'Watch the whole garden orbit, not just its current position.',
    'A narrower nursery encourages encounters; lower speed disorder limits how far fragments wander.',
    'Try a compact disk outside the garden, then branch and move it closer. Compare survival and time to formation.',
  ],
  5: [
    'The giant clears a wide lane around its whole orbit. Nurseries inside about half its distance survive longest.',
    'Fragments near the giant are stretched onto eccentric paths; a compact disk far inside keeps meetings gentle.',
    'Try a disk centred near 1 AU with modest disorder, then compare one moved outward toward the giant.',
  ],
  6: [
    'The giant must be near the crossing when your world arrives.',
    'Change launch angle while keeping mass, speed and distance fixed. The orbit-size graph reveals energy gained in the encounter.',
    'Try a bound launch just inside the giant and trailing it. Compare distances around 1.6–1.8 AU, with a launch speed near the challenge limit.',
  ],
  7: [
    'Moons orbit their planet while the star perturbs the whole family.',
    'Leave room between the complete moon paths. Reversing an orbit does not reverse axial rotation.',
    'Try a light inner moon and a more distant outer moon, then compare opposite orbital directions.',
  ],
  8: [
    'A near 2:1 period ratio is a candidate, not a completed resonance.',
    'Watch the resonant-angle graph. A bounded swing differs from an angle that continually circulates.',
    'The detector needs at least eight outer orbits and measurable eccentricity. Massive neighbors interact more strongly; lighter pairs can need more time.',
  ],
  9: [
    'Build in the order you learned: a debris disk first, then a garden orbit with room, then a moon around a calm host.',
    'The garden must keep its whole orbit inside the band while accretion happens nearby; give it distance from the nursery.',
    'A moon needs a calm, massive host well away from the disk. Place the host early so it settles before the moon.',
  ],
};
export function lessonSetup(example) {
  const replay = example.replay;
  return {
    ...replay,
    end_tick: 0,
    commands: replay.commands.filter((action) => action.tick === 0),
  };
}
export class ChallengeGuide {
  constructor({ send, getState, trySetup }) {
    this.send = send;
    this.getState = getState;
    this.$ = (id) => document.getElementById(id);
    this.step = 0;
    this.mission = null;
    this.$('next-hint').onclick = () => {
      this.step++;
      this.hint();
    };
    this.$('try-lesson').onclick = async () => {
      this.$('try-lesson').disabled = true;
      try {
        await trySetup(lessonSetup(this.lesson.cases[Number(this.$('lesson-case').value)]));
        this.$('lesson-dialog').close();
      } catch (error) {
        this.$('lesson-outcome').textContent = error.message;
      } finally {
        this.$('try-lesson').disabled = false;
      }
    };
    this.$('study-example').onclick = () => this.study();
    this.$('close-lesson').onclick = () => this.$('lesson-dialog').close();
    this.$('lesson-case').onchange = () => this.drawLesson();
  }
  update(state) {
    const mission = state.config.mission;
    if (mission !== this.mission || state.generation !== this.generation) {
      this.step = 0;
      this.mission = mission;
      this.generation = state.generation;
    }
    this.$('next-hint').hidden = !HINTS[mission];
    this.$('study-example').hidden = ![4, 6, 8].includes(mission);
    this.hint();
    const assessment = state.assessment;
    this.$('challenge-evidence').textContent = assessment?.evidence.join('\n') || '';
    const signature = JSON.stringify(assessment?.mastery);
    if (signature !== this.signature) {
      this.signature = signature;
      this.$('mastery-goals').replaceChildren();
      for (const goal of assessment?.mastery || []) {
        const li = document.createElement('li');
        li.textContent = `${goal.earned ? '✓' : '◇'} ${goal.label}`;
        this.$('mastery-goals').append(li);
      }
    }
  }
  hint() {
    const hints = HINTS[this.mission];
    if (!hints) return;
    const index = Math.min(this.step, hints.length - 1);
    this.$('mission-hint').textContent = hints[index];
    this.$('next-hint').textContent =
      `Hint ${index + 1} / ${hints.length} · ${index === hints.length - 1 ? 'All hints shown' : 'more guidance'}`;
    this.$('next-hint').disabled = index === hints.length - 1;
  }
  async study() {
    this.$('study-example').disabled = true;
    try {
      await this.send('play', { value: false });
      if (!this.lessons) {
        const response = await fetch(new URL('./lessons.json', import.meta.url));
        if (!response.ok) throw new Error('Examples could not load. Try again.');
        this.lessons = await response.json();
      }
      this.lesson = this.lessons.find(
        (lesson) => lesson.mission === this.getState().config.mission,
      );
      if (!this.lesson) return;
      this.result = await this.send('compare', {
        replays: this.lesson.cases.map((c) => JSON.stringify(c.replay)),
        include_history: true,
      });
      this.$('lesson-title').textContent = this.lesson.title;
      this.$('lesson-description').textContent = this.lesson.description;
      this.$('lesson-case').replaceChildren(
        ...this.lesson.cases.map((c, i) => new Option(c.name, String(i))),
      );
      this.drawLesson();
      this.$('lesson-dialog').showModal();
    } catch (error) {
      this.$('challenge-evidence').textContent = error.message;
    } finally {
      this.$('study-example').disabled = false;
    }
  }
  drawLesson() {
    const index = Number(this.$('lesson-case').value),
      state = this.result.states[index],
      history = this.result.histories[index];
    drawChart(
      this.$('lesson-chart'),
      chartGeometry(
        series(history, this.lesson.body, this.lesson.metric, this.lesson.pair),
        this.lesson.metric,
      ),
      this.lesson.metric === 'angle' ? 'Resonant angle · degrees' : 'Orbital size · AU',
    );
    this.$('lesson-outcome').textContent =
      `Year ${quantity(state.tick / 512)} · ${state.status.formed} calm worlds formed · ${state.status.assisted_ejections} gravity-assisted escapes · ${state.resonances.filter((r) => r.librating).length} librating pairs. ${state.status.completed ? 'The challenge was achieved.' : 'The challenge was not achieved in this observation window.'}`;
    this.$('lesson-conditions').replaceChildren();
    for (const { command: c, tick } of this.lesson.cases[index].replay.commands) {
      const li = document.createElement('li');
      li.textContent =
        c.type === 'seed_disk'
          ? `Year ${quantity(tick / 512)}: ${c.count} fragments centered at ${c.radius} AU, width ${c.spread} AU, ${quantity(c.disorder * 100)}% disorder.`
          : c.type === 'launch_mass'
            ? `Year ${quantity(tick / 512)}: ${c.mass} Earth masses, ${c.radius} AU, ${quantity(c.speed * 100)}% orbital speed, phase ${quantity((c.angle * 180) / Math.PI)}°.`
            : 'An orbital intervention.';
      this.$('lesson-conditions').append(li);
    }
  }
}
