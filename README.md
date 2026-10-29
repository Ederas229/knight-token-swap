<!--
SPDX-FileCopyrightText: 2022 Johannes Loher

SPDX-License-Identifier: MIT
-->

# knight-token-swap

## Development

### Prerequisites

In order to build this module, recent versions of `node` and `npm` are
required. Most likely, using `yarn` also works, but only `npm` is officially
supported. We recommend using the latest lts version of `node`. If you use `nvm`
to manage your `node` versions, you can simply run

```
nvm install
```

in the project's root directory.

You also need to install the project's dependencies. To do so, run

```
npm install
```

### Building

You can build the project by running

```
npm run build
```

Alternatively, you can run

```
npm run build:watch
```

to watch for changes and automatically build as necessary.

### Linking the built project to Foundry VTT

In order to provide a fluent development experience, it is recommended to link
the built module to your local Foundry VTT installation's data folder. In
order to do so, first add a file called `foundryconfig.json` to the project root
with the following content:

```
{
  "dataPath": ["/absolute/path/to/your/FoundryVTT"]
}
```

(if you are using Windows, make sure to use `\` as a path separator instead of
`/`)

Then run

```
npm run link-project
```

On Windows, creating symlinks requires administrator privileges, so
unfortunately you need to run the above command in an administrator terminal for
it to work.

You can also link to multiple data folders by specifying multiple paths in the
`dataPath` array.

### End-to-end tests

The suite drives the built module inside a live Foundry + Knight world with
[foundryvtt-test-framework] (Playwright). It needs a licensed Foundry install
and Node 24 or newer, so it runs on your machine rather than in CI.

Copy `tests/e2e/config.local.example.mjs` to `tests/e2e/config.local.mjs`
(git-ignored) and point it at your Foundry data folder, a world running the
Knight system, and a GM user of that world. `foundryconfig.json`'s first
`dataPath` entry is used when the data folder is left out, and the settings can
also come from `E2E_FOUNDRY_DATA_PATH`, `E2E_WORLD` and `E2E_LOGIN_USER`.

```
npm run setup:e2e   # copies license, system, world and the module build into test-data/
npm run test:e2e    # boots an isolated Foundry server and asserts the swap behaviour
```

During development `node tests/e2e/server.mjs` starts that isolated server on
its own, which is handy for poking at the world by hand. `test-data/` and the
Playwright browser profile are git-ignored.

### Creating a release

The workflow works basically the same as the workflow of the [League Basic JS Module Template], please follow the
instructions given there.

## Licensing

This project is being developed under the terms of the
[LIMITED LICENSE AGREEMENT FOR MODULE DEVELOPMENT] for Foundry Virtual Tabletop.

[League Basic JS Module Template]: https://github.com/League-of-Foundry-Developers/FoundryVTT-Module-Template
[LIMITED LICENSE AGREEMENT FOR MODULE DEVELOPMENT]: https://foundryvtt.com/article/license/
[foundryvtt-test-framework]: https://github.com/Tiamanti/foundryvtt-test-framework
