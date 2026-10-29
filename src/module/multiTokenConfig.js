import { MODULENAME } from './const.js';
import { TEXTURE_FLAGS, applyTokenTexturesForActor } from './function.js';

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Configuration sheet for the three token textures stored as flags on a
 * Knight actor. DocumentSheetV2 supplies `this.document`, the `isEditable`
 * gate, re-rendering on flag changes, and a document-uuid app id, so two
 * actors can be configured side by side.
 */
export class MultiTokenConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ['knight-token-swap', 'multi-token-config'],
    tag: 'form',
    position: {
      width: 480,
      height: 'auto',
    },
    window: {
      icon: 'fas fa-hexagon-image',
      resizable: true,
      contentClasses: ['standard-form'],
    },
    form: {
      closeOnSubmit: true,
      submitOnChange: false,
      handler: MultiTokenConfig._saveFlags,
    },
  };

  static PARTS = {
    config: {
      template: 'modules/knight-token-swap/templates/multitokenconfig.hbs',
    },
  };

  /**
   * DocumentSheetV2 titles the window from the document ("Knight: name"); this
   * panel names itself and keeps the actor for context.
   */
  get title() {
    return `${game.i18n.localize('TOKENSWAP.Title')}: ${this.document.name || this.document.id}`;
  }

  /** @override */
  async _prepareContext() {
    return { files: this.document.flags[MODULENAME] ?? {} };
  }

  /**
   * Write or clear the texture flags (the base handler would write the field
   * names onto the Actor itself, which the Knight model doesn't define), then
   * sync the actor's canvas tokens: Save applies the current wear's texture,
   * Reset restores every managed token's pre-module artwork. The textures are
   * all-or-nothing, so a partial save throws — core surfaces it as an error
   * notification and leaves the window open.
   */
  static async _saveFlags(event, form, formData) {
    if (!this.isEditable) return;
    const data = formData.object;
    const action = event.submitter?.name ?? 'save';

    if (action === 'reset') {
      for (const property of TEXTURE_FLAGS) await this.document.unsetFlag(MODULENAME, property);
    } else {
      // Trimmed: a space would otherwise be stored and later written into
      // texture.src, where the canvas shows a broken image.
      const missing = TEXTURE_FLAGS.filter((property) => !String(data[property] ?? '').trim());
      if (missing.length) {
        const title = game.modules.get(MODULENAME)?.title ?? MODULENAME;
        throw new Error(game.i18n.format('TOKENSWAP.Error.Incomplete', { title }));
      }
      const changes = Object.fromEntries(
        TEXTURE_FLAGS.map((property) => [`flags.${MODULENAME}.${property}`, data[property]]),
      );
      await this.document.update(changes);
    }

    await applyTokenTexturesForActor(this.document);
  }
}
