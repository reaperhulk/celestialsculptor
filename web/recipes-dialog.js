// Sandbox starting points: authored setups imported as year-zero replays.
import { parseSeed } from './conditions.js';
import { SAVE_VERSION } from './version.js';

export function installRecipesDialog(app) {
  const { $, send, toast, confirmReset, autosave, inspect } = app;
  let recipes = null;
  $('recipes').onclick = async () => {
    try {
      if (!recipes) {
        const response = await fetch(new URL('./recipes.json', import.meta.url));
        if (!response.ok) throw new Error('Starting points could not load. Try again.');
        recipes = await response.json();
      }
      $('recipe-list').replaceChildren();
      for (const recipe of recipes) {
        const button = document.createElement('button');
        button.className = 'recipe-choice';
        const title = document.createElement('strong'),
          description = document.createElement('span');
        title.textContent = recipe.name;
        description.textContent = recipe.description;
        button.append(title, description);
        button.onclick = () => {
          $('recipes-dialog').close();
          confirmReset(async () => {
            try {
              app.bumpSaveEpoch();
              const replay = JSON.stringify({
                version: recipe.version || SAVE_VERSION,
                config: { ...recipe.config, seed: parseSeed($('seed').value) },
                commands: recipe.commands.map((command) => ({ tick: 0, command })),
                end_tick: 0,
              });
              await send('import', { replay });
              await autosave();
              app.renderer?.fit();
              if (recipe.focus !== undefined) {
                app.selectedBody = recipe.focus;
                app.renderer?.focus(recipe.focus);
                inspect();
              }
              if (recipe.speed) await send('speed', { value: recipe.speed });
              if (recipe.id.includes('resonan')) $('resonance-panel').open = true;
              toast(recipe.name + ' is ready. Run it or make it your own.');
            } catch (error) {
              toast(error.message);
            }
          });
        };
        $('recipe-list').append(button);
      }
      $('recipes-dialog').showModal();
    } catch (error) {
      toast(error.message);
    }
  };
  $('close-recipes').onclick = () => $('recipes-dialog').close();
}
