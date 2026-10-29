/**
 * E2E suite: runs knight-token-swap inside a live Foundry v14 + Knight world.
 *
 * The world is an isolated copy of a licensed install under test-data/, made by
 * `npm run setup:e2e`; `npm run test:e2e` then needs Node >= 24.
 *
 * Two behaviours of that world shape these tests:
 *  - `Document#update()` resolves before the local document shows the change,
 *    so every expectation polls for the value instead of reading once.
 *  - the Knight system rewrites a fresh knight's `ascension` wear back to
 *    `tenueCivile`, so that actor can never reach an unmapped wear state. The
 *    restore/claim cycle is therefore exercised on a PNJ actor, whose wear the
 *    system leaves alone.
 */
import assert from 'node:assert/strict';
import { V14Framework } from './v14-framework.mjs';
import config from './config.mjs';

const MODULE_ID = 'knight-token-swap';

// Real assets shipped by the Knight system; the swap stores plain paths.
const TEXTURES = {
  armure: 'systems/knight/assets/banners/actors.webp',
  guardian: 'systems/knight/assets/banners/cards.webp',
  tenueCivile: 'systems/knight/assets/banners/combat.webp',
};

const fw = new V14Framework(config);
let failures = 0;

async function step(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL  ${name}`);
    console.error(`      ${err.message}`);
    await fw.screenshot(`fail-${name.replace(/\W+/g, '_')}.png`).catch(() => {});
  }
}

await fw.start();

// ---------------------------------------------------------------- environment

await step('environment: knight world, GM session, module active', async () => {
  const env = await fw.executeInFoundry(
    (moduleId) => ({
      system: game.system.id,
      gm: game.user.isGM,
      active: game.modules.get(moduleId)?.active === true,
    }),
    MODULE_ID,
  );
  assert.equal(env.system, 'knight', `world system is "${env.system}", expected knight`);
  assert.equal(env.gm, true, 'login is not a GM session');
  assert.equal(env.active, true, 'knight-token-swap is not active in the world');
});

// -------------------------------------------------------------------- fixture

let knight;
await step('fixture: knight actor and scene token on the canvas', async () => {
  knight = await fw.executeInFoundry(
    async () => {
      for (const actor of game.actors.filter((a) => a.name?.startsWith('E2E '))) await actor.delete();

      // Counts token writes for the tokens these tests own. Scoped by id on
      // purpose: an unscoped counter also counts unrelated world writes and
      // then reports counts that look right but mean nothing.
      window.__ktsUpdates = 0;
      window.__ktsTracked = new Set();
      window.__ktsTrack = (id) => window.__ktsTracked.add(id);
      Hooks.on('preUpdateToken', (doc) => {
        if (window.__ktsTracked.has(doc.id)) window.__ktsUpdates += 1;
      });

      // Read token documents from the scene collection: committed writes land
      // there, while a placeable can still belong to an earlier canvas draw.
      window.__ktsDoc = (id) => canvas.scene.tokens.get(id);
      window.__ktsPoll = async (fn, timeout = 10000) => {
        const deadline = Date.now() + timeout;
        let value;
        while (Date.now() < deadline) {
          value = fn();
          if (value) return value;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return value;
      };
      window.__ktsOpenConfig = async (actorId) => {
        const actor = game.actors.get(actorId);
        game.knightTokenSwap.openTokenConfig(actor);
        const app = await window.__ktsPoll(() => {
          const open = Object.values(actor.apps ?? {}).find((a) => a.constructor.name === 'MultiTokenConfig');
          return open?.form ? open : undefined;
        });
        if (!app) throw new Error('MultiTokenConfig never rendered');
        return app;
      };

      const actor = await Actor.create({ name: 'E2E Knight', type: 'knight' });
      const tokenDoc = await TokenDocument.create({ actorId: actor.id, x: 4, y: 4 }, { parent: canvas.scene });
      window.__ktsTrack(tokenDoc.id);
      const rendered = await window.__ktsPoll(
        () => canvas.tokens.placeables.some((t) => t.document.id === tokenDoc.id) || undefined,
      );
      if (!rendered) throw new Error('created token never rendered on the canvas');

      return {
        actorId: actor.id,
        tokenId: tokenDoc.id,
        wear: actor.system.wear,
        originalSrc: tokenDoc.texture.src,
      };
    },
    { moduleId: MODULE_ID },
  );

  assert.ok(TEXTURES[knight.wear], `unexpected default wear: ${knight.wear}`);
  assert.ok(knight.originalSrc, 'fixture token has no texture to back up');
});

// ------------------------------------------ counter hygiene: only count our own

await step('write counter ignores tokens the suite does not own', async () => {
  const r = await fw.executeInFoundry(async () => {
    // Actorless token: outside the module's reach, outside the suite's tracking.
    const stranger = await TokenDocument.create({ x: 12, y: 12, name: 'E2E untracked' }, { parent: canvas.scene });
    const before = window.__ktsUpdates;
    await stranger.update({ name: 'renamed by the counter probe' });
    const landed = await window.__ktsPoll(
      () => canvas.scene.tokens.get(stranger.id)?.name === 'renamed by the counter probe' || undefined,
    );
    const delta = window.__ktsUpdates - before;
    await stranger.delete();
    return { landed: Boolean(landed), delta };
  });

  assert.equal(r.landed, true, 'the untracked token write never landed');
  assert.equal(r.delta, 0, `counter reported ${r.delta} write(s) for a token it does not track`);
});

// ------------------------------------- entry point: the sheet header, not the API

await step('knight sheet header offers the button and it opens the config window', async () => {
  const r = await fw.executeInFoundry(async (k) => {
    const actor = game.actors.get(k.actorId);
    const sheet = await actor.sheet.render(true);
    // Core wires header-button click handlers 500ms after the window is built.
    await new Promise((resolve) => setTimeout(resolve, 900));
    const button = sheet.element[0].querySelector('.header-button.multiToken');
    button?.click();
    const app = await window.__ktsPoll(() => {
      const open = Object.values(actor.apps ?? {}).find((a) => a.constructor.name === 'MultiTokenConfig');
      return open?.form ? open : undefined;
    });
    for (const instance of Object.values(actor.apps ?? {})) {
      if (instance.constructor.name === 'MultiTokenConfig') await instance.close();
    }
    await sheet.close();
    return { offered: Boolean(button), label: button?.textContent.trim() ?? '', opened: Boolean(app) };
  }, knight);

  assert.equal(r.offered, true, 'the knight sheet header offers no token-image button');
  assert.ok(r.label, 'the token-image button renders without a label');
  assert.equal(r.opened, true, 'clicking the header button did not open the config window');
});

// ------------------------------------------------- T1: save applies and backs

await step('save applies the wear texture and backs up the replaced art', async () => {
  const r = await fw.executeInFoundry(
    async (k) => {
      const actor = game.actors.get(k.actorId);
      const app = await window.__ktsOpenConfig(k.actorId);
      for (const [key, value] of Object.entries(k.textures)) app.form.elements.namedItem(key).value = value;

      const before = window.__ktsUpdates;
      app.form.requestSubmit(app.form.querySelector('button[name="save"]'));
      const closed = await window.__ktsPoll(() => (app.rendered ? undefined : true));
      const applied = await window.__ktsPoll(() => {
        const doc = window.__ktsDoc(k.tokenId);
        return doc.texture.src === k.textures[k.wear] ? doc : undefined;
      });

      return {
        closed: Boolean(closed),
        delta: window.__ktsUpdates - before,
        flags: Object.keys(k.textures).map((key) => actor.getFlag(k.moduleId, key)),
        src: applied?.texture.src,
        backup: window.__ktsDoc(k.tokenId).getFlag(k.moduleId, 'originalSrc'),
      };
    },
    { ...knight, moduleId: MODULE_ID, textures: TEXTURES },
  );

  assert.deepEqual(r.flags, Object.values(TEXTURES), 'flags not persisted as submitted');
  assert.equal(r.src, TEXTURES[knight.wear], 'token texture not swapped to the wear texture');
  assert.equal(r.delta, 1, `expected exactly one token update, saw ${r.delta}`);
  assert.equal(r.backup, knight.originalSrc, 'the pre-swap texture was not recorded');
  assert.equal(r.closed, true, 'window did not close after save');
});

// ------------------------------------------------------ T2: partial save toast

await step('partial save rejected: toast, window open, nothing written', async () => {
  const r = await fw.executeInFoundry(
    async (k) => {
      const actor = game.actors.get(k.actorId);
      const app = await window.__ktsOpenConfig(k.actorId);
      for (const [key, value] of Object.entries(k.textures)) app.form.elements.namedItem(key).value = value;
      app.form.elements.namedItem('tenueCivile').value = '';

      // Sampled before the submit: sampling after it would score a write that
      // already happened as "nothing written".
      const before = window.__ktsUpdates;
      app.form.requestSubmit(app.form.querySelector('button[name="save"]'));

      const toasted = await window.__ktsPoll(() =>
        Array.from(document.querySelectorAll('#notifications li')).some((li) => li.textContent.includes('renseignez'))
          ? true
          : undefined,
      );
      await new Promise((resolve) => setTimeout(resolve, 500));

      const result = {
        toasted: Boolean(toasted),
        stillOpen: app.rendered,
        delta: window.__ktsUpdates - before,
        tenueCivile: actor.getFlag(k.moduleId, 'tenueCivile'),
        src: window.__ktsDoc(k.tokenId).texture.src,
      };
      ui.notifications.clear();
      await app.close();
      return result;
    },
    { ...knight, moduleId: MODULE_ID, textures: TEXTURES },
  );

  assert.equal(r.toasted, true, 'no validation toast appeared');
  assert.equal(r.stillOpen, true, 'window closed despite a rejected save');
  assert.equal(r.delta, 0, `rejected save issued ${r.delta} token write(s); expected none`);
  assert.equal(r.tenueCivile, TEXTURES.tenueCivile, 'partial save overwrote the cleared flag');
  assert.equal(r.src, TEXTURES[knight.wear], 'token texture changed after the rejected save');
});

// --------------------------------------------------------- T3: wear swap writes

await step('wear change to guardian swaps the texture with one write', async () => {
  const r = await fw.executeInFoundry(
    async (k) => {
      const actor = game.actors.get(k.actorId);
      const before = window.__ktsUpdates;
      await actor.update({ 'system.wear': 'guardian' });
      const applied = await window.__ktsPoll(() => {
        const doc = window.__ktsDoc(k.tokenId);
        return doc.texture.src === k.textures.guardian ? doc : undefined;
      });
      return { src: applied?.texture.src, delta: window.__ktsUpdates - before };
    },
    { ...knight, textures: TEXTURES },
  );

  assert.equal(r.src, TEXTURES.guardian, 'texture did not follow the wear change');
  assert.equal(r.delta, 1, `expected exactly one token update, saw ${r.delta}`);
});

// -------------------------------------------------- T4: scene reload stays quiet

await step('scene reload re-displays the texture with zero writes', async () => {
  const r = await fw.executeInFoundry(
    async (k) => {
      const before = window.__ktsUpdates;
      try {
        await canvas.app.goto(canvas.scene);
      } catch {
        await canvas.draw();
      }
      const drawn = await window.__ktsPoll(() => {
        const doc = window.__ktsDoc(k.tokenId);
        return canvas.tokens.placeables.some((t) => t.document.id === k.tokenId) &&
          doc?.texture.src === k.textures.guardian
          ? doc
          : undefined;
      }, 30000);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return { src: drawn?.texture.src, delta: window.__ktsUpdates - before };
    },
    { ...knight, textures: TEXTURES },
  );

  assert.equal(r.src, TEXTURES.guardian, 'texture wrong after reload');
  assert.equal(r.delta, 0, `reload issued ${r.delta} token write(s); expected none`);
});

// ------------------------------------------------------ T5: PNJ takes over swap

let pnj;
await step('PNJ token is taken over by a wear swap (type gate removed)', async () => {
  pnj = await fw.executeInFoundry(
    async (f) => {
      const actor = await Actor.create({ name: 'E2E PNJ', type: 'pnj' });
      const tokenDoc = await TokenDocument.create({ actorId: actor.id, x: 8, y: 8 }, { parent: canvas.scene });
      window.__ktsTrack(tokenDoc.id);
      const rendered = await window.__ktsPoll(
        () => canvas.tokens.placeables.some((t) => t.document.id === tokenDoc.id) || undefined,
      );
      if (!rendered) throw new Error('PNJ token never rendered on the canvas');
      const originalSrc = tokenDoc.texture.src;

      const changes = Object.fromEntries(
        Object.entries(f.textures).map(([key, value]) => [`flags.${f.moduleId}.${key}`, value]),
      );
      await actor.update(changes);

      const before = window.__ktsUpdates;
      await actor.update({ 'system.wear': 'guardian' });
      const applied = await window.__ktsPoll(() => {
        const doc = window.__ktsDoc(tokenDoc.id);
        return doc.texture.src === f.textures.guardian ? doc : undefined;
      });

      return {
        actorId: actor.id,
        tokenId: tokenDoc.id,
        originalSrc,
        src: applied?.texture.src,
        delta: window.__ktsUpdates - before,
        backup: window.__ktsDoc(tokenDoc.id).getFlag(f.moduleId, 'originalSrc'),
      };
    },
    { moduleId: MODULE_ID, textures: TEXTURES },
  );

  assert.equal(pnj.src, TEXTURES.guardian, 'PNJ token did not take the wear texture');
  assert.equal(pnj.delta, 1, `PNJ swap issued ${pnj.delta} token write(s); expected 1`);
  assert.equal(pnj.backup, pnj.originalSrc, 'PNJ swap did not record the pre-swap art');
});

// ------------------------------------------- T6: unmapped wear restores PNJ art

await step('PNJ wear to ascension restores the original art and releases the claim', async () => {
  const r = await fw.executeInFoundry(
    async (p) => {
      const actor = game.actors.get(p.actorId);
      const before = window.__ktsUpdates;
      await actor.update({ 'system.wear': 'ascension' });
      const released = await window.__ktsPoll(() => {
        const doc = window.__ktsDoc(p.tokenId);
        const done = doc.texture.src === p.originalSrc && !('originalSrc' in (doc.flags[p.moduleId] ?? {}));
        return done ? doc : undefined;
      });
      const doc = window.__ktsDoc(p.tokenId);
      return {
        released: Boolean(released),
        src: doc.texture.src,
        wear: actor.system.wear,
        delta: window.__ktsUpdates - before,
      };
    },
    { ...pnj, moduleId: MODULE_ID },
  );

  assert.equal(r.wear, 'ascension', `world snapped the PNJ wear back to "${r.wear}"; no unmapped state reached`);
  assert.equal(r.released, true, `restore did not reach ${pnj.originalSrc} with the backup released (src=${r.src})`);
  assert.equal(r.delta, 2, `restore issued ${r.delta} token writes; expected 2 (restore + unsetFlag)`);
});

// ------------------------------ T7: re-save at unmapped wear, then re-apply

await step('PNJ re-save at an unmapped wear claims nothing; wear re-applies', async () => {
  const r = await fw.executeInFoundry(
    async (p) => {
      const actor = game.actors.get(p.actorId);
      const app = await window.__ktsOpenConfig(p.actorId);
      for (const [key, value] of Object.entries(p.textures)) app.form.elements.namedItem(key).value = value;
      app.form.requestSubmit(app.form.querySelector('button[name="save"]'));
      await window.__ktsPoll(() => (app.rendered ? undefined : true));
      await new Promise((resolve) => setTimeout(resolve, 500));

      const afterSave = window.__ktsDoc(p.tokenId);
      const untouched = {
        src: afterSave.texture.src,
        backupPresent: 'originalSrc' in (afterSave.flags[p.moduleId] ?? {}),
      };

      await actor.update({ 'system.wear': 'guardian' });
      const swapped = await window.__ktsPoll(() => {
        const doc = window.__ktsDoc(p.tokenId);
        return doc.texture.src === p.textures.guardian ? doc : undefined;
      });
      return {
        untouched,
        reApplied: Boolean(swapped),
        backupReclaimed: 'originalSrc' in (window.__ktsDoc(p.tokenId).flags[p.moduleId] ?? {}),
      };
    },
    { ...pnj, moduleId: MODULE_ID, textures: TEXTURES },
  );

  assert.equal(r.untouched.src, pnj.originalSrc, 'save at an unmapped wear touched the token');
  assert.equal(r.untouched.backupPresent, false, 'save at an unmapped wear claimed the token');
  assert.equal(r.reApplied, true, 'token did not swap when wear returned to a mapped state');
  assert.equal(r.backupReclaimed, true, 'backup not re-recorded when re-applying');
});

// ------------------------------------------------ T8: reset button restores all

await step('reset clears the flags and restores the original art', async () => {
  const r = await fw.executeInFoundry(
    async (k) => {
      const actor = game.actors.get(k.actorId);
      const app = await window.__ktsOpenConfig(k.actorId);

      const before = window.__ktsUpdates;
      app.form.requestSubmit(app.form.querySelector('button[name="reset"]'));
      const closed = await window.__ktsPoll(() => (app.rendered ? undefined : true));
      const cleared = await window.__ktsPoll(() => {
        const doc = window.__ktsDoc(k.tokenId);
        const done =
          Object.keys(k.textures).every((key) => actor.getFlag(k.moduleId, key) === undefined) &&
          doc.texture.src === k.originalSrc &&
          !('originalSrc' in (doc.flags[k.moduleId] ?? {}));
        return done ? doc : undefined;
      });
      return { cleared: Boolean(cleared), closed: Boolean(closed), delta: window.__ktsUpdates - before };
    },
    { ...knight, moduleId: MODULE_ID, textures: TEXTURES },
  );

  assert.equal(r.cleared, true, 'reset did not clear flags, restore art and release the backup');
  assert.equal(r.closed, true, 'window did not close after reset');
  assert.equal(r.delta, 2, `reset issued ${r.delta} token writes; expected 2 (restore + unsetFlag)`);
});

// ------------------------------------------------------ T9: no duplicate window

await step('double openTokenConfig keeps one window per actor', async () => {
  const r = await fw.executeInFoundry(async (k) => {
    const actor = game.actors.get(k.actorId);
    game.knightTokenSwap.openTokenConfig(actor);
    game.knightTokenSwap.openTokenConfig(actor);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const windows = document.querySelectorAll('.application.multi-token-config').length;
    for (const app of Object.values(actor.apps ?? {})) {
      if (app.constructor.name === 'MultiTokenConfig') await app.close();
    }
    return { windows };
  }, knight);

  assert.equal(r.windows, 1, `${r.windows} config windows open for the same actor`);
});

// ------------------------- T10: two tokens of one actor, one backup each of its own

await step('two tokens of one actor swap and restore from their own backups', async () => {
  const OTHER_ART = 'icons/svg/castle.svg';
  const r = await fw.executeInFoundry(
    async (k) => {
      const actor = game.actors.get(k.actorId);
      const wear = actor.system.wear;
      const wanted = (id) => window.__ktsDoc(id).texture.src;

      // T8 reset left the actor unconfigured; arm it again through the window.
      const config = await window.__ktsOpenConfig(k.actorId);
      for (const [key, value] of Object.entries(k.textures)) config.form.elements.namedItem(key).value = value;
      const beforeSave = window.__ktsUpdates;
      config.form.requestSubmit(config.form.querySelector('button[name="save"]'));
      const armed = await window.__ktsPoll(() => (wanted(k.tokenId) === k.textures[wear] ? true : undefined));
      const saveDelta = window.__ktsUpdates - beforeSave;

      // Second token for the same actor, with artwork of its own.
      const second = await TokenDocument.create(
        { actorId: k.actorId, x: 20, y: 20, texture: { src: k.otherArt } },
        { parent: canvas.scene },
      );
      window.__ktsTrack(second.id);
      // Whether the draw-time sync or the wear change below claims it is the
      // module's choice; settle the claim first so the swap count stays exact.
      await window.__ktsPoll(() => (wanted(second.id) === k.textures[wear] ? true : undefined), 5000);

      const beforeSwap = window.__ktsUpdates;
      await actor.update({ 'system.wear': 'tenueCivile' });
      const swapped = await window.__ktsPoll(() => {
        const a = window.__ktsDoc(k.tokenId);
        const b = window.__ktsDoc(second.id);
        return a.texture.src === k.textures.tenueCivile && b.texture.src === k.textures.tenueCivile ? true : undefined;
      });
      const swapDelta = window.__ktsUpdates - beforeSwap;
      const backups = {
        first: window.__ktsDoc(k.tokenId).getFlag(k.moduleId, 'originalSrc'),
        second: window.__ktsDoc(second.id).getFlag(k.moduleId, 'originalSrc'),
      };

      const reset = await window.__ktsOpenConfig(k.actorId);
      const beforeReset = window.__ktsUpdates;
      reset.form.requestSubmit(reset.form.querySelector('button[name="reset"]'));
      const restored = await window.__ktsPoll(() => {
        const a = window.__ktsDoc(k.tokenId);
        const b = window.__ktsDoc(second.id);
        const clean = (doc) => !('originalSrc' in (doc.flags[k.moduleId] ?? {}));
        return a.texture.src === k.originalSrc && b.texture.src === k.otherArt && clean(a) && clean(b)
          ? true
          : undefined;
      });
      const resetDelta = window.__ktsUpdates - beforeReset;

      const finalSrcs = { first: wanted(k.tokenId), second: wanted(second.id) };
      await second.delete();
      return {
        wear,
        armed: Boolean(armed),
        saveDelta,
        swapped: Boolean(swapped),
        swapDelta,
        backups,
        restored: Boolean(restored),
        resetDelta,
        finalSrcs,
      };
    },
    { ...knight, moduleId: MODULE_ID, textures: TEXTURES, otherArt: OTHER_ART },
  );

  assert.equal(r.armed, true, `re-arming the actor did not apply the ${r.wear} texture`);
  assert.equal(r.saveDelta, 1, `re-arming issued ${r.saveDelta} token write(s); expected 1`);
  assert.equal(r.swapped, true, 'both tokens did not take the tenueCivile texture');
  assert.equal(r.swapDelta, 2, `wear change issued ${r.swapDelta} token write(s); expected one per token`);
  assert.equal(r.backups.first, knight.originalSrc, 'the first token lost its backup');
  assert.equal(r.backups.second, OTHER_ART, 'the second token did not back up its own artwork');
  assert.equal(r.restored, true, 'reset did not restore each token to its own pre-swap artwork');
  assert.equal(r.resetDelta, 4, `reset issued ${r.resetDelta} token write(s); expected two per token`);
  assert.deepEqual(r.finalSrcs, { first: knight.originalSrc, second: OTHER_ART }, 'restored textures wrong');
});

// ------------------------------------------------------------------- teardown

await fw.stop();
console.log(failures ? `\n${failures} step(s) FAILED` : '\nAll steps passed');
process.exit(failures ? 1 : 0);
