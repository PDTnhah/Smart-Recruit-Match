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
