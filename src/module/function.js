import { MODULENAME } from './const.js';

export async function updateTokenTexture(token, state) {
  const src = token.actor?.getFlag(MODULENAME, state);
  if (!src) return;
  await token.document.update({ texture: { src } });
}

export async function checkCanvasToken(actor, wear) {
  for (const token of canvas.tokens?.ownedTokens ?? []) {
    if (token.actor?.id === actor.id) {
      await updateTokenTexture(token, wear);
    }
  }
}

export function isFlagDefined(actor) {
  const flags = actor.flags[MODULENAME];
  return Boolean(flags?.armure && flags?.guardian && flags?.tenueCivile);
}
