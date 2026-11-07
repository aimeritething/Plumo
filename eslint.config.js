import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'coverage',
    'src-tauri/target/',
    'src-tauri/gen/',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'react-hooks/refs': 'error',
      'react-hooks/set-state-in-effect': 'error',
    },
  },
  // `asChild` and the `data-state` attribute are Radix's. Outside src/ui a
  // feature composes with a src/ui component's `render` and reads its state
  // off aria (`aria-expanded:`) or a src/ui variant, so the move to Base UI
  // touches src/ui only (ADR-0013).
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/ui/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='asChild']",
          message: 'No `asChild` outside src/ui: pass the element as the src/ui component\'s `render` (ADR-0013).',
        },
        {
          selector: "JSXAttribute[name.name='data-state']",
          message: 'No `data-state` outside src/ui: it is Radix\'s; use aria or a src/ui variant (ADR-0013).',
        },
        {
          selector: 'Literal[value=/data-\\[?state/]',
          message: 'No `data-state` or `data-[state=…]` outside src/ui: use aria (`aria-expanded:`) or a src/ui variant or helper (ADR-0013).',
        },
        {
          selector: 'TemplateElement[value.raw=/data-\\[?state/]',
          message: 'No `data-state` or `data-[state=…]` outside src/ui: use aria (`aria-expanded:`) or a src/ui variant or helper (ADR-0013).',
        },
      ],
    },
  },
])
