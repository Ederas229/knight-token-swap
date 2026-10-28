import { MODULENAME } from './const.js';
import { checkCanvasToken } from './function.js';

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * An unregistered helper sheet for configuring the three token textures that
 * knight-token-swap stores as flags on a Knight actor.
 *
 * It extends DocumentSheetV2 rather than a plain ApplicationV2 so the Actor is
 * handed to the app as `options.document`: that gives us `this.document`, the
 * `isEditable` permission gate, automatic re-rendering when the flags change,
 * and an application id that DocumentSheetV2 derives from the document uuid, so
 * two actors can be configured in two windows at the same time.
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
      title: 'Token Images',
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

  /** @override */
  async _prepareContext() {
    return { files: this.document.flags[MODULENAME] ?? {} };
  }

  /**
   * Persist or clear the texture flags, depending on which button submitted the
   * form, then refresh the textures of that actor's owned tokens. The base sheet
   * would have written the submitted field names onto the Actor itself, which
   * the Knight data model does not define, so the handler replaces it wholesale.
   * Core binds `this` to the application and builds `formData` for us, then
   * closes the window because `closeOnSubmit` is set.
   * @param {SubmitEvent} event         The originating submit event.
   * @param {HTMLFormElement} form      The form element that was submitted.
   * @param {FormDataExtended} formData The submitted values.
   */
  static async _saveFlags(event, form, formData) {
    const data = formData.object;
    const action = event.submitter?.name ?? 'save';

    for (const [property, value] of Object.entries(data)) {
      if (action === 'reset') await this.document.unsetFlag(MODULENAME, property);
      else await this.document.setFlag(MODULENAME, property, value);
    }

    if (action !== 'reset') await checkCanvasToken(this.document, this.document.system.wear);
  }
}
