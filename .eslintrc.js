module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    'no-console': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_'
      }
    ],
  },
  overrides: [
    {
      files: ['src/cli.ts', 'src/utils/auth-generator.ts'],
      rules: {
        'no-console': 'off',
      },
    },
    {
      files: ['src/types/global.d.ts'],
      rules: {
        'no-var': 'off',
      },
    },
  ],
};