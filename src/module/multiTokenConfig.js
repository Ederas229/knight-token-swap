import { MODULENAME } from './const.js';
import { checkCanvasToken } from './function.js';

export class MultiTokenConfig extends FormApplication {
  constructor(actorSheet) {
    super();
    this.actor = actorSheet.actor;
  }

  static get defaultOptions() {
    const defaults = super.defaultOptions;

    const overrides = {
      height: 'auto',
      width: '480',
      id: 'multiTokenConfig',
      template: './modules/knight-token-swap/templates/multitokenconfig.hbs',
      title: 'Token Images',
      actor: '',
    };

    const mergedOptions = foundry.utils.mergeObject(defaults, overrides);

    return mergedOptions;
  }

  getData() {
    return { files: this.actor.flags[MODULENAME] };
  }

  activateListeners(html) {
    super.activateListeners(html);
  }

  async _updateObject(event, data) {
    if (event.submitter.name == 'save') {
      for (const property in data) {
        await this.actor.setFlag(MODULENAME, property, data[property]);
      }
      checkCanvasToken(this.actor, this.actor.system.wear);
    }
    if (event.submitter.name == 'reset') {
      for (const property in data) {
        this.actor.unsetFlag(MODULENAME, property);
      }
    }
  }
}
