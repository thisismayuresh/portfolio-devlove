/**
 * ESLint flat config.
 *
 * Optional. The editor runs without it — this exists so a contributor can
 * check their patch before opening a pull request, and so CI can do the same:
 *
 *     npm install && npm run lint
 *
 * The rules are deliberately few. They catch mistakes (an unused import, a
 * fall-through `case`, an accidental global), not style — style is Prettier's
 * job, and arguing about it in review is a waste of everyone's afternoon.
 */

import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**'],
  },

  js.configs.recommended,

  {
    // The editor: ES modules running in a browser.
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  {
    // The worker has its own globals (`self`, no `window`).
    files: ['js/workers/**/*.js'],
    languageOptions: {
      globals: globals.worker,
    },
  },

  {
    // Tests and tooling run in Node.
    files: ['tests/**/*.{js,mjs}', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
    },
  },
];
