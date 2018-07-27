
'use strict'

module.exports = {
  testEnvironment: 'node',
  bail: false,
  verbose: true,
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  moduleFileExtensions: [
    'js',
    'json'
  ],
  collectCoverage: false,
  coverageDirectory: '<rootDir>/.coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!**/node_modules/**'
  ],
  watchman: false,
  setupTestFrameworkScriptFile: 'jest-extended'
}


