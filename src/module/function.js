import { MODULENAME } from './const.js';

/**
 * Actor flag keys holding the three configurable textures. Deliberate gap:
 * the system's fourth wear state (`ascension`) gets no texture by design —
 * a knight entering it restores the token's pre-swap artwork.
 */
export const TEXTURE_FLAGS = ['armure', 'guardian', 'tenueCivile'];

/**
 * True when the module manages this token: the actor has the flag record, or
 * the token carries an `originalSrc` backup from an earlier swap. Key presence
 * is the test, not truthiness: the backup may legitimately be null.
 */
export function isModuleManaged(token) {
  return Boolean(token.actor?.flags[MODULENAME]) || 'originalSrc' in (token.document.flags[MODULENAME] ?? {});
}

/**
 * Apply the texture configured for the token actor's current wear; if none
 * applies, restore the texture saved in `originalSrc` before the module first
 * overwrote it. No-op when the texture already matches: drawToken fires on
 * every canvas load and core does not skip no-change updates.
 * @param {string} [wear] Wear to apply instead of the actor's current one,
 *                        including an explicit null ("wear cleared → restore");
 *                        preUpdateActor runs before the change is committed.
 */
export async function applyTokenTexture(token, wear) {
  const doc = token.document;
  const actor = token.actor;
  const state = wear !== undefined ? wear : actor?.system?.wear;
  const src = state ? actor?.getFlag(MODULENAME, state) : undefined;
  const backup = doc.getFlag(MODULENAME, 'originalSrc');
  const current = doc.texture.src;

  let target;
  let restoring = false;
  if (src) {
    target = src;
  } else if (backup !== undefined) {
    target = backup;
    restoring = true;
  } else {
    // Residue from pre-backup-flag versions: src matching a configured
    // texture can only be module-written, so revert to the prototype
    // texture (null = inherit); anything else is GM artwork, leave it.
    const ours = TEXTURE_FLAGS.map((flag) => actor?.getFlag(MODULENAME, flag)).filter(Boolean);
    target = current && ours.includes(current) ? null : current;
  }

  // Record the backup before claiming a token, even when its artwork already
  // matches a texture, or a later reset would strip GM artwork as residue.
  const needsBackup = Boolean(src) && backup === undefined;
  // A restore with nothing to write still releases the claim, so this stale
  // backup can't overwrite GM edits made while the token already looked right.
  if (restoring && target === current) {
    await doc.unsetFlag(MODULENAME, 'originalSrc');
    return;
  }
  if (target === current && !needsBackup) return;

  if (restoring) {
    // unsetFlag over the "-=key" update operator: deprecated in v14 while we
    // still support v13, and restores are rare enough for a second write.
    if (target !== current) await doc.update({ texture: { src: target } });
    await doc.unsetFlag(MODULENAME, 'originalSrc');
    return;
  }

  const update = {};
  if (target !== current) update.texture = { src: target };
  if (needsBackup) update[`flags.${MODULENAME}.originalSrc`] = current ?? null;
  await doc.update(update);
}

/**
 * Sync every canvas token of an actor; tokens never managed by the module are
 * skipped so partial configuration can't touch custom artwork.
 * @param {string} [wear] Wear value to apply; see applyTokenTexture.
 */
export async function applyTokenTexturesForActor(actor, wear) {
  for (const token of canvas.tokens?.ownedTokens ?? []) {
    if (token.actor?.id !== actor.id || !isModuleManaged(token)) continue;
    await applyTokenTexture(token, wear);
  }
}
