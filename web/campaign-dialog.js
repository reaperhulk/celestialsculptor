// The challenge map: ten discoveries, unlocked in order, with mastery medals.
import { canPlay } from './progression.js';

export function installCampaignDialog(app) {
  const { $, confirmReset, reset } = app;
  $('campaign').onclick = () => {
    if (!app.ready) return;
    const profile = app.profile;
    $('mission-list').replaceChildren();
    app.missions.forEach((m, i) => {
      const button = document.createElement('button');
      button.className = 'mission-choice';
      button.disabled = !canPlay(profile, i);
      const number = document.createElement('span');
      number.className = 'mission-number';
      number.textContent = profile.completed.includes(i) ? '✓' : String(i + 1).padStart(2, '0');
      const label = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = m.name;
      const brief = document.createElement('small');
      brief.textContent = button.disabled ? 'Complete the preceding challenge' : m.brief;
      label.append(title, brief);
      const medals = (profile.mastery || [])
        .filter((code) => code.startsWith(`${i}:`))
        .map((code) => (code.endsWith(':economy') ? 'Economy' : 'Restraint'));
      if (medals.length) {
        const badge = document.createElement('small');
        badge.className = 'mastery-badge';
        badge.textContent = '◇ ' + medals.join(' · ');
        label.append(badge);
      }
      button.append(number, label);
      button.onclick = () => {
        $('mission-dialog').close();
        confirmReset(() => reset(i));
      };
      $('mission-list').append(button);
    });
    $('mission-dialog').showModal();
  };
  $('close-missions').onclick = () => $('mission-dialog').close();
}
