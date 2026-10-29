/**
 * Shared Playwright driver for the e2e suites.
 *
 * Two workarounds for foundryvtt-test-framework against Foundry v14:
 *  - v14 names the join-form select "userId"; the framework queries "userid"
 *    and would silently skip login.
 *  - the join button is localized, so submit the form instead of matching the
 *    English label.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { FoundryTestFramework } from 'foundryvtt-test-framework';

export class V14Framework extends FoundryTestFramework {
  /**
   * The framework maps `headless: true` to Playwright's removed `"new"` mode.
   * Current Playwright loads MV3 extensions in ordinary headless, so pass the
   * flag through and keep a profile that is ours (not the framework's).
   */
  async _launchBrowser() {
    const { diceOverrideExtensionPath, headless } = this.config;
    const profile = fileURLToPath(new URL('../../.e2e-chrome-profile', import.meta.url));
    this.context = await chromium.launchPersistentContext(profile, {
      headless: headless !== false,
      viewport: null,
      args: [
        `--disable-extensions-except=${diceOverrideExtensionPath}`,
        `--load-extension=${diceOverrideExtensionPath}`,
        '--window-size=1920,1080',
      ],
    });
    console.log(
      `[e2e] Browser up (${headless !== false ? 'headless' : 'headed'}); extension workers: ${this.context.serviceWorkers().length}`,
    );
  }

  async _login() {
    const loginUser = this.config.loginUser ?? 'Gamemaster';
    const selector = 'select[name="userId"], select[name="userid"]';
    const present = await this.page
      .locator(selector)
      .count()
      .catch(() => 0);
    if (!present) {
      console.log('[e2e] No login form - assuming session already active.');
      return;
    }
    const found = await this.page.evaluate(
      ({ sel, name }) => {
        const select = document.querySelector(sel);
        const option = Array.from(select.options).find((o) => o.text === name);
        if (!option) return false;
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      },
      { sel: selector, name: loginUser },
    );
    if (!found) throw new Error(`[e2e] User "${loginUser}" not found in login select`);
    // The join button starts disabled and is localized: re-enable-poll then
    // submit the form element rather than matching a label.
    await this.page.waitForFunction(
      () => {
        const select = document.querySelector('select[name="userId"], select[name="userid"]');
        const form = select?.form ?? select?.closest('form');
        const submit = form?.querySelector('button[type="submit"]');
        if (!submit || submit.disabled) return false;
        submit.click();
        return true;
      },
      null,
      { timeout: 10000 },
    );
    await new Promise((r) => setTimeout(r, 3000));
  }

  /**
   * Framework's navigation flow plus a join retry: joining while the server is
   * still resolving its package index yields a world-activation payload whose
   * `release` is empty, and the client's ReleaseData validation error then
   * leaves game.ready unresolved. Re-joining once the server has settled works.
   */
  async _navigateAndWait() {
    const port = this.config.foundryServerPort ?? 30000;
    const pages = this.context.pages();
    for (const p of pages.slice(1)) await p.close().catch(() => {});
    this.page = pages[0] ?? (await this.context.newPage());
    let releaseError = false;
    this.page.on('pageerror', (err) => {
      releaseError ||= err.message.includes('ReleaseData');
      console.log(`[pageerror] ${err.message.split('\n').slice(0, 3).join(' | ')}`);
    });
    this.page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (text.includes('Invalid Asset')) return;
      console.log(`[page:error] ${text.slice(0, 200)}`);
    });

    await new Promise((r) => setTimeout(r, this.config.serverWarmupMs ?? 5000));
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      console.log(`[e2e] Navigating to Foundry (attempt ${attempt}/${attempts})...`);
      await this.page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle' });
      await this._login();
      releaseError = false;
      if (await this._waitForReady(() => releaseError)) {
        console.log('[foundryvtt-test-framework] Foundry ready.');
        return;
      }
      console.log('[e2e] game.ready not reached; re-joining the world');
      await new Promise((r) => setTimeout(r, 5000));
    }
    await this.screenshot('not-ready.png').catch(() => {});
    throw new Error('Foundry never reached game.ready');
  }

  async _waitForReady(abandon) {
    const deadline = Date.now() + (this.config.foundryReadyTimeout ?? 120000);
    while (Date.now() < deadline) {
      const state = await this.page
        .evaluate(() => ({
          ready: window.game?.ready === true,
          url: location.href,
          html: document.body?.innerHTML.replace(/\s+/g, ' ').slice(0, 160),
        }))
        .catch(() => null);
      if (state?.ready) return true;
      if (abandon()) return false;
      console.log(`[e2e] waiting for game.ready: ${state ? `${state.url} ${state.html}` : 'page unavailable'}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
    return false;
  }
}
