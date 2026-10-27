import { MultiTokenConfig } from './multiTokenConfig.js';
import { updateTokenTexture, checkCanvasToken, isFlagDefined } from './function.js';

Hooks.once('init', async () => {
  console.log('knight-token-swap | Initializing knight-token-swap');
});

/**
 * Expose a tiny entry point on the game object, both so other modules can open
 * the configuration window and so it can be opened from the console for
 * debugging: game.knightTokenSwap.openTokenConfig(actor).
 */
Hooks.once('ready', () => {
  game.knightTokenSwap = { MultiTokenConfig, openTokenConfig };
});

/**
 * Open the texture configuration window for a given actor.
 * @param {Actor} actor   The actor whose texture flags are edited.
 */
function openTokenConfig(actor) {
  new MultiTokenConfig({
    document: actor,
    window: { title: `Token Images — ${actor.name}` },
  }).render(true);
}

/**
 * Entry point for the Knight actor sheet. Core dispatches
 * `get<ClassName>HeaderButtons` for Application V1 sheets, which is why the hook
 * is named after the Knight system's `KnightSheet` class. The payload shape
 * below ({ class, icon, label, onclick }) is the V1 header button shape.
 */
Hooks.on('getKnightSheetHeaderButtons', (sheet, buttons) => {
  if (!game.user.isGM) return;
  const actor = sheet.actor;
  if (!actor) return;
  buttons.unshift({
    class: 'multiToken',
    icon: 'fas fa-hexagon-image',
    label: 'Token Images',
    onclick: () => openTokenConfig(actor),
  });
});

/**
 * Forward compatibility for the day the Knight sheet becomes an Application V2
 * document sheet: core then dispatches `getHeaderControls<ClassName>` instead,
 * with control objects of a different shape ({ action, icon, label, onClick }).
 * Harmless while unused; confirm the exact hook name against the sheet class
 * name when the system migrates.
 */
Hooks.on('getHeaderControlsKnightSheet', (sheet, controls) => {
  if (!game.user.isGM) return;
  const actor = sheet.actor;
  if (!actor) return;
  controls.push({
    action: 'knight-token-swap.configure',
    icon: 'fas fa-hexagon-image',
    label: 'Token Images',
    onClick: () => openTokenConfig(actor),
  });
});

Hooks.on('drawToken', async (token) => {
  if (!token.actor?.isOwner) return;
  if (!isFlagDefined(token.actor)) return;
  await updateTokenTexture(token, token.actor.system.wear);
});

Hooks.on('preUpdateActor', async (actor, data) => {
  if (!data.system?.wear) return;
  if (actor.type !== 'knight') return;
  if (!isFlagDefined(actor)) return;

  await checkCanvasToken(actor, data.system.wear);
});
