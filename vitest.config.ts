/**
 * Root vitest config — Phase 19 plan 19-11 (vitest revival, locked decision).
 *
 * Replaces upstream's dead config (it still pointed at the retired ./sdk
 * workspace). The fork's jj/vcs coverage core (58 vitest tests + the
 * toBeIdOf matcher) runs from src/vcs/__tests__ against the ported
 * src/vcs/*.cts modules; production imports use `.cjs` specifiers which
 * vite resolves to the `.cts` sources (assumption A4, verified 19-11).
 *
 * Backend selection: GSD_TEST_BACKENDS (e.g. `git,jj`) is read at test time
 * by selectedBackends() / parseBackendsEnv (src/vcs/backends.cts) — the env
 * var needs no config-level wiring, matching the fork's sdk/vitest.config.ts
 * (preserved under the phase-19 .planning harvest/misc directory).
 */

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const matchersPath = fileURLToPath(new URL('./tests/__tools__/vitest-matchers.ts', import.meta.url));

// Vite's default esbuild filter transforms .ts/.tsx/.mts only — the ported
// production modules are .cts (ADR-457), so widen the filter or every
// `.cjs`-specifier import that resolves to a `.cts` source fails to parse
// (A4 empirical finding, 19-11).
const esbuild = {
  include: [/\.ts$/, /\.cts$/, /\.mts$/],
} as const;

export default defineConfig({
  esbuild,
  test: {
    // The jj suite spawns hundreds of short-lived jj/git subprocesses, and
    // most test bodies are fully synchronous (execSync/spawnSync chains)
    // that starve the worker event loop. Under full worker parallelism
    // individual `it` blocks routinely exceed vitest's 5s default on loaded
    // machines (19-11 empirical: different files time out on consecutive
    // runs; the same files pass in <1s when run in isolation), and the
    // long sync stretches starve worker<->main RPC past birpc's hard 60s
    // timeout ("Timeout calling onTaskUpdate" unhandled error → exit 1
    // even with all tests green). maxWorkers: 2 is the empirical sweet
    // spot: zero RPC starvation, full suite ~110s. The raised timeouts are
    // latency headroom, not a behavior change. maxWorkers is a ROOT-level
    // option (ignored inside projects).
    maxWorkers: 2,
    projects: [
      {
        esbuild,
        test: {
          name: 'unit',
          setupFiles: [matchersPath],
          // 19-12: widened from src/vcs/__tests__/** — the fork config ran
          // src/**/*.test.ts (rooted at sdk/), which also covered
          // format-migration/__tests__; the 19-11 include silently dropped
          // those 5 files. The **/__tests__ shape keeps any future vcs
          // sub-tree suites discovered.
          include: ['src/vcs/**/__tests__/**/*.test.{ts,cts}'],
          exclude: ['src/**/*.integration.test.{ts,cts}'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        esbuild,
        test: {
          name: 'integration',
          setupFiles: [matchersPath],
          include: ['src/vcs/**/__tests__/**/*.integration.test.{ts,cts}'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
