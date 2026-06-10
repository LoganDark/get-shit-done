import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const matchersPath = fileURLToPath(new URL('../tests/__tools__/vitest-matchers.ts', import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          setupFiles: [matchersPath],
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.integration.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          setupFiles: [matchersPath],
          include: ['src/**/*.integration.test.ts'],
          testTimeout: 120_000,
        },
      },
    ],
  },
});
