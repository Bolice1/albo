import { SYNTHETIC_TEST_ENV } from './helpers/test-env.helper';

for (const [key, defaultValue] of Object.entries(SYNTHETIC_TEST_ENV)) {
  if (process.env[key] === undefined) {
    process.env[key] = defaultValue;
  }
}
