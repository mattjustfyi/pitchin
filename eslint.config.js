import js from '@eslint/js'
import prettier from 'eslint-config-prettier/flat'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['**/dist', '**/node_modules', 'data']),

  // All TypeScript and JavaScript in the repo
  {
    files: ['**/*.{js,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },

  // Node: config files and the events package
  {
    files: ['*.{js,ts}', 'apps/web/vite.config.ts', 'packages/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // Browser + React: the web app
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  // Must be last: turns off rules that conflict with Prettier
  prettier,
])
