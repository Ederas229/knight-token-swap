import { MultiTokenConfig } from './multiTokenConfig.js';
import { applyTokenTexture, applyTokenTexturesForActor, isModuleManaged } from './function.js';

Hooks.once('init', async () => {
  console.log('knight-token-swap | Initializing knight-token-swap');
});

Hooks.once('ready', () => {
  game.knightTokenSwap = { MultiTokenConfig, openTokenConfig };
});

/**
 * Reuses the open window: DocumentSheetV2 derives its app id from the
 * document uuid, so a second instance would stack a duplicate window with
 * the same id. The sheet registers itself in `document.apps` on first render.
 */
function openTokenConfig(actor) {
  const app =
    Object.values(actor.apps ?? {}).find((instance) => instance instanceof MultiTokenConfig) ??
    new MultiTokenConfig({
      document: actor,
      window: { title: `Token Images — ${actor.name}` },
    });
  app.render(true);
}

/**
 * KnightSheet is an Application V1 sheet, so core dispatches
 * `get<ClassName>HeaderButtons` with the V1 button shape.
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
 * Forward compatibility for when the Knight sheet becomes Application V2:
 * core dispatches `getHeaderControls<ClassName>` with control objects of a
 * different shape ({ action, icon, label, onClick }). Harmless while unused.
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

/**
 * Sync freshly-drawn tokens; applyTokenTexture no-ops when the texture
 * already matches, so scene loads issue no writes for correct tokens.
 */
Hooks.on('drawToken', async (token) => {
  if (!token.actor?.isOwner) return;
  if (!isModuleManaged(token)) return;
  await applyTokenTexture(token);
});

/**
 * Hook runs before the update commits, so the new wear is passed explicitly.
 */
Hooks.on('preUpdateActor', async (actor, data) => {
  if (actor.type !== 'knight') return;
  if (!(data.system && 'wear' in data.system)) return;
  await applyTokenTexturesForActor(actor, data.system.wear);
});
