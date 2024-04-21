import { MODULENAME } from './const.js';

export function updateTokenTexture(token, state) {
  token.document.update({ texture: { src: token.actor.getFlag(MODULENAME, state) } });
}

export async function checkCanvasToken(actor, wear) {
  for (const token of canvas.tokens.ownedTokens) {
    if (token.actor.id == actor.id) {
      updateTokenTexture(token, wear);
    }
  }
}

export function isFlagDefined(actor) {
  const flags = actor.flags[MODULENAME];
  return flags?.armure && flags?.guardian && flags?.tenueCivile ? true : false;
}
