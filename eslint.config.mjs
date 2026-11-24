// @ts-check
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/dist/**',
    '**/coverage/**',
    'apps/api/test/fixtures/**',
    'ai-service/**',
    '.koni-harness/**',
    '.agents/**',
    '.claude/**',
    'docs/**',
  ]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{js,cjs,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/shared/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // US-5.1 AC-11, AGENTS › Invariant 9: the allocation engine reads no clock and no randomness, so
    // its result depends on its input alone. dependency-cruiser keeps its imports inside the folder.
    files: ['apps/api/src/modules/allocation/domain/**/*.ts'],
    ignores: ['apps/api/src/modules/allocation/domain/__tests__/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['Date', 'performance', 'crypto', 'process', 'setTimeout', 'setInterval'].map((name) => ({
          name,
          message: 'The allocation engine is pure: pass times and other values in through its input.',
        })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'The allocation engine is deterministic: no randomness.' },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    // shadcn primitives export variants (buttonVariants) and hooks (useSidebar) next to components
    // by design (CONTEXT D26); hot reload of these files only falls back to a full reload.
    files: ['apps/web/src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
);
