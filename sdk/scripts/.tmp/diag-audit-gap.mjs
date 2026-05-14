#!/usr/bin/env node
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const { createRegistry } = await import(resolve(REPO_ROOT, 'sdk/dist/query/index.js'));
const { captureGsdToolsOutput } = await import(resolve(REPO_ROOT, 'sdk/dist/golden/capture.js'));
const reg = createRegistry();
const cjs = await captureGsdToolsOutput('audit-open', ['--json'], REPO_ROOT);
const sdk = (await reg.dispatch('audit-open', ['--json'], REPO_ROOT)).data;
console.log('SDK uat_gaps items:');
console.log(JSON.stringify(sdk.items.uat_gaps, null, 2));
console.log('\nCJS uat_gaps items:');
console.log(JSON.stringify(cjs.items.uat_gaps, null, 2));
