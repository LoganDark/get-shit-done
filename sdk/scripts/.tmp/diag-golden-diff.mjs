#!/usr/bin/env node
/**
 * Diagnostic: run the 5 failing parity tests' code paths and dump diffs.
 * Usage: node sdk/scripts/.tmp/diag-golden-diff.mjs [case]
 *   case = roadmap | health | sync | audit | state | all (default all)
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

// Import compiled SDK + the capture helper (use source via tsx-compatible paths)
const { createRegistry } = await import(resolve(REPO_ROOT, 'sdk/dist/query/index.js'));
const { captureGsdToolsOutput } = await import(resolve(REPO_ROOT, 'sdk/dist/golden/capture.js'));

function diff(label, sdk, cjs) {
	console.log(`\n========== ${label} ==========`);
	const sdkKeys = Object.keys(sdk || {}).sort();
	const cjsKeys = Object.keys(cjs || {}).sort();
	console.log(`SDK keys (${sdkKeys.length}):`, sdkKeys.join(', '));
	console.log(`CJS keys (${cjsKeys.length}):`, cjsKeys.join(', '));
	const onlyInSdk = sdkKeys.filter(k => !cjsKeys.includes(k));
	const onlyInCjs = cjsKeys.filter(k => !sdkKeys.includes(k));
	if (onlyInSdk.length) console.log(`  only in SDK: ${onlyInSdk.join(', ')}`);
	if (onlyInCjs.length) console.log(`  only in CJS: ${onlyInCjs.join(', ')}`);
	// Per-key diff
	const all = [...new Set([...sdkKeys, ...cjsKeys])].sort();
	for (const k of all) {
		const a = JSON.stringify(sdk?.[k]);
		const b = JSON.stringify(cjs?.[k]);
		if (a !== b) {
			console.log(`  DIFF "${k}":`);
			console.log(`    SDK: ${a?.slice(0, 400)}${a && a.length > 400 ? '…' : ''}`);
			console.log(`    CJS: ${b?.slice(0, 400)}${b && b.length > 400 ? '…' : ''}`);
		}
	}
}

const which = process.argv[2] || 'all';

async function runCase(name) {
	const reg = createRegistry();
	if (name === 'roadmap' || name === 'all') {
		const cjs = await captureGsdToolsOutput('roadmap', ['analyze'], REPO_ROOT);
		const sdk = (await reg.dispatch('roadmap.analyze', [], REPO_ROOT)).data;
		diff('roadmap.analyze', sdk, cjs);
	}
	if (name === 'health' || name === 'all') {
		const cjs = await captureGsdToolsOutput('validate', ['health'], REPO_ROOT);
		const sdk = (await reg.dispatch('validate.health', [], REPO_ROOT)).data;
		diff('validate.health', sdk, cjs);
	}
	if (name === 'sync' || name === 'all') {
		const cjs = await captureGsdToolsOutput('state', ['sync', '--verify'], REPO_ROOT);
		const sdk = (await reg.dispatch('state.sync', ['--verify'], REPO_ROOT)).data;
		diff('state.sync --verify', sdk, cjs);
	}
	if (name === 'audit' || name === 'all') {
		const cjs = await captureGsdToolsOutput('audit-open', ['--json'], REPO_ROOT);
		const sdk = (await reg.dispatch('audit-open', ['--json'], REPO_ROOT)).data;
		const strip = (d) => { const o = { ...d }; delete o.scanned_at; delete o.has_scan_errors; return o; };
		diff('audit-open', strip(sdk), strip(cjs));
	}
	if (name === 'state' || name === 'all') {
		const cjs = await captureGsdToolsOutput('state', ['json'], REPO_ROOT);
		const sdk = (await reg.dispatch('state.json', [], REPO_ROOT)).data;
		const strip = (d) => { const o = { ...d }; delete o.last_updated; return o; };
		diff('state.json', strip(sdk), strip(cjs));
	}
}

await runCase(which);
