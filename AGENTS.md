# AGENTS.md

Foundry VTT module for the Knight system. `src/` is the source, `dist/` is the built module (git-ignored).

## Commands

| task | command |
| --- | --- |
| build | `npm run build` (gulp: rollup bundle + copies, `dist/` is cleaned first) |
| watch build | `npm run build:watch` |
| lint | `npm run lint` — Prettier runs through ESLint, so almost every failure is formatting: `npm run lint:fix` |
| e2e | `npm run setup:e2e` then `npm run test:e2e` (~4 min, 14 steps) |
| hand-driven test server | `node tests/e2e/server.mjs` (Ctrl+C stops it) |

- No unit tests, no typecheck script. CI (`.github/workflows/checks.yml`) runs only `lint` and `build` on Node 20.
- **e2e needs Node >= 24** (Foundry 14 ships a Node 24 server) even though `.nvmrc` is `lts/*` and CI is Node 20. On this machine the shell default is Node 20.15.0; select 24 first (`nvm use 24.1.0`).
- Required order when source changed: `npm run build` before `npm run test:e2e`. `test-data/Data/modules/knight-token-swap` is a symlink to `dist/`, so a rebuilt bundle reaches the test world without re-running setup; re-run setup only when the manifest, system or world changed.
- Shell is PowerShell: chain commands with `;`, not `&&`.

## Build and manifest

- Rollup entry `src/module/knight-token-swap.js` produces one file, `dist/module/knight-token-swap.js`. `src/module/*.js` are not separate runtime files, so imports must be rollup-resolvable.
- gulp copies only `src/{assets,fonts,lang,packs,templates,module.json}` and only `src/styles/knight-token-swap.css` (the name must match `packageId` in `gulpfile.mjs`). New asset folders need adding to `staticFiles`.
- Keep the literal `"This is auto replaced"` values for `url`, `version`, `manifest`, `download` in `src/module.json`: `release.yml` substitutes them when a GitHub release is published (tag `vX.Y.Z` becomes `version`). Do not hardcode them.
- `socket: false` in the manifest; declaring `game.socket` listeners also requires flipping it.
- The manifest targets Foundry `minimum: 13`, `verified: 14`, so write for that intersection: `unsetFlag()` rather than the v14-deprecated `-=` key operator, `Collection#contents` rather than `#entities`.

## Foundry API ground truth

- Your licensed install ships the core **unminified with JSDoc**: read `App/resources/app/client/**` and `App/resources/app/common/**` instead of guessing signatures. `client/hooks.mjs` is the index of core-dispatched hooks; the Knight system's own code is at `Data/systems/knight`.
- Core builds application hook names from the class inheritance chain, e.g. `getKnightSheetHeaderButtons` for a class named `KnightSheet`. Grepping the system for that literal string finds nothing — the name is generated. V1 header buttons use `{ class, icon, label, onclick }` and core dispatches the click by `classList.contains(class)`, so the class must be module-namespaced. V2 uses `getHeaderControls<ClassName>` with `{ action, icon, label, onClick }`.
- `DocumentSheetV2#title` ignores `options.window.title`; override the `title` getter on the sheet class instead.

## Module invariants (deliberate — do not "fix")

- Only actors with `type === 'knight'` are in scope (`isSwapActor`). PNJ and the other human-mixin types carry `system.wear` too and must stay untouched.
- The system's fourth wear state, `ascension`, deliberately has no texture row: entering it restores the token's pre-swap artwork.
- The pre-swap backup is a **TokenDocument** flag (`originalSrc`), never actor-level, so two tokens of one actor restore to their own artwork.
- "Module-managed" is tested by flag-key presence (`'originalSrc' in flags`), not truthiness — the backup can legitimately be `null`.
- Token write counts are asserted by the suite: 1 for a save or wear swap (texture + backup in one update), 2 per token for a restore or reset (texture update, then `unsetFlag`), 0 for a scene reload. Sync only walks `canvas.tokens.ownedTokens` of the current scene.

## E2E suite (`tests/e2e/`, live Foundry, developer-local)

- Machine values: `tests/e2e/config.local.mjs` (git-ignored) layered over the first `dataPath` of `foundryconfig.json`; env overrides are `E2E_FOUNDRY_DATA_PATH`, `E2E_WORLD`, `E2E_LOGIN_USER`, `E2E_PORT` (default 30005).
- Close the Foundry app before `setup:e2e`: it holds `Data/worlds/<world>/data/*/LOCK` and the copy aborts with `EBUSY`.
- To delete `test-data/`, remove the module symlink first — `(Get-Item test-data\Data\modules\knight-token-swap).Delete()` — recursive deletion can follow it into `dist/`.
- Inside `executeInFoundry` page functions: `Document#update()` resolves **before** the local document reflects the write, so every expectation polls, and token documents are read from `canvas.scene.tokens.get(id)` rather than the placeable you created.
- The token write counter must stay scoped to the ids the suite created (`window.__ktsTracked`); an unscoped counter also counts unrelated world writes and reports numbers that look right but mean nothing.
- The Knight system pins a bare knight's wear (`#checkArmor` in `Data/systems/knight/module/documents/models/actors/knight-data-model.mjs`), so `ascension` cannot be forced on a fresh knight. Reach the "current wear has no texture" path by clearing that wear's flag and reloading the scene.
- To check French, set `"language": "fr.core"` in `test-data/Config/options.json`. Write that file **without a BOM** — the Foundry server aborts on a BOM.

## Strings

- Every user-visible string is a `TOKENSWAP.*` key in `src/lang/en.json` and `src/lang/fr.json`; core localizes the V1 header button label, and the template uses `{{localize}}`.
- `TOKENSWAP.Title` and `TOKENSWAP.Configure` carry the module name; all other values translate freely (`Enregistrer`, `Réinitialiser`).
- The validation failure is thrown as an `Error` built with `game.i18n.format('TOKENSWAP.Error.Incomplete', { title })`, where `{title}` is the module title — core surfaces it as an error notification and leaves the window open.
- The suite compares rendered text against `game.i18n.localize` / `game.i18n.format` output, never against English literals, so it must stay language-agnostic.

## Comments

Keep comments in `src/module/*` minimal: only those recording a non-obvious constraint or a deliberate choice (the write counts above are the pattern).
