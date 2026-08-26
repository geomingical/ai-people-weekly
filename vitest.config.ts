import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'pipeline/tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Pure logic only. `.astro` components are covered by the browser suite,
      // and run.ts is the orchestrator whose parts are each tested directly.
      include: ['src/domain/**/*.ts', 'pipeline/src/**/*.ts'],
      exclude: ['pipeline/src/run.ts', 'pipeline/src/contracts.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
