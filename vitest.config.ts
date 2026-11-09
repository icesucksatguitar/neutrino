import { defineConfig } from 'vitest/config';

// Only the vitest suites under tests/unit are collected. The ad-hoc Electron and
// Python scripts elsewhere in tests/ are run by hand and must not be picked up.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
