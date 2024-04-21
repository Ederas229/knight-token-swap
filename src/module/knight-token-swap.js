import { MultiTokenConfig } from './multiTokenConfig.js';
import { updateTokenTexture, checkCanvasToken, isFlagDefined } from './function.js';

Hooks.once('init', async () => {
  console.log('knight-token-swap | Initializing knight-token-swap');
});

Hooks.on('getKnightSheetHeaderButtons', async (sheet, buttons) => {
  if (!game.user.isGM) return;
  buttons.unshift({
    class: 'multiToken',
    icon: 'fas fa-hexagon-image',
    label: 'Token Images',
    onclick: () => {
      new MultiTokenConfig(sheet).render(true);
    },
  });
});

Hooks.on('drawToken', async (token) => {
  if (!token.actor.isOwner) return;
  if (!isFlagDefined(token.actor)) return;
  updateTokenTexture(token, token.actor.system.wear);
});

Hooks.on('preUpdateActor', async (actor, data) => {
  if (!data.system?.wear) return;
  if (actor.type != 'knight') return;
  if (!isFlagDefined(actor)) return;

  checkCanvasToken(actor, data.system.wear);
});
