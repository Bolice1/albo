import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/jest-setup-env.ts'],
  moduleNameMapper: {
    '^@common/(.*)$': '<rootDir>/src/common/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@database/(.*)$': '<rootDir>/src/database/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@integrations/(.*)$': '<rootDir>/src/integrations/$1',
    '^@jobs/(.*)$': '<rootDir>/src/jobs/$1',
  },
};

export default config;
