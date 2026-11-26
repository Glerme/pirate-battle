import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'public', 'playwright-report', 'test-results', 'tests/e2e/__screenshots__'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  { files: ['src/**/*.{ts,tsx}'], plugins: { 'react-hooks': reactHooks }, rules: reactHooks.configs.recommended.rules },
)
