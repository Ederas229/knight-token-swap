import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: ['**/dist'],
  },
  ...compat.extends(
    'eslint:recommended',
    '@typhonjs-fvtt/eslint-config-foundry.js/0.8.0',
    'plugin:prettier/recommended',
  ),
  {
    plugins: {},

    languageOptions: {
      globals: {
        ...globals.browser,
      },

      ecmaVersion: 2020,
      sourceType: 'module',

      parserOptions: {
        extraFileExtensions: ['.cjs', '.mjs'],
      },
    },

    rules: {},
  },
  {
    files: ['./*.js', './*.cjs', './*.mjs'],

    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
