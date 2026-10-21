import {defineConfig} from 'vitest/config';
// Playwright .spec.ts suites require a browser and must never run in Vitest.
export default defineConfig({test:{include:['tests/**/*.test.ts'],environment:'node'}});
