const preset = require('jest-expo/jest-preset');

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  rootDir: __dirname,
  testMatch: ['<rootDir>/src/**/*.spec.ts?(x)'],
  setupFiles: ['<rootDir>/src/test-setup.ts'],
  transform: {
    ...preset.transform,
    // jest-expo looks for babel.config.js, which this app does not have (it uses .babelrc.js, which
    // only applies to files inside apps/mobile). Name the preset here so node_modules and the
    // workspace libs are transformed too, and Metro's config stays untouched.
    '\\.[jt]sx?$': [
      'babel-jest',
      {
        caller: { name: 'metro', bundler: 'metro', platform: 'ios' },
        configFile: false,
        babelrc: false,
        presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
      },
    ],
  },
  // Workspace libs are TypeScript sources that import siblings as './x.js' (NodeNext style).
  moduleNameMapper: { ...preset.moduleNameMapper, '^(\\.{1,2}/.*)\\.js$': '$1' },
  testEnvironmentOptions: { customExportConditions: ['@org/source', 'react-native', 'require', 'default'] },
};
