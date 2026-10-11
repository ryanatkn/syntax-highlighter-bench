import { assert, test } from 'vitest';
import { readFileSync } from 'node:fs';

import { BENCH_ANCHOR_STABLE_BELOW } from '#lib/results_schema.ts';
import { SPREAD_DISTURBED_ABOVE } from '#lib/bench_constants.ts';
import { SITE_DETERMINISTIC_PATH, SITE_LATEST_PATH } from '#lib/server/site_results_load.ts';
import { LOAD_BUSY_ABOVE, RUN_FLAGS } from '../../bench/run_options.ts';

// the page states by hand what the harness and `package.json` define
const page = readFileSync(new URL('../../results/README.md', import.meta.url), 'utf8');
const package_json = JSON.parse(
	readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
) as { scripts: Record<string, string> };

test('every npm script the publishing page quotes exists', () => {
	const scripts = [...page.matchAll(/npm run ([\w:]+)/g)].map((match) => match[1]!);
	assert.ok(scripts.length > 0);
	for (const script of scripts) {
		assert.ok(Object.hasOwn(package_json.scripts, script), `no script "${script}"`);
	}
});

test('every flag the publishing page quotes is one a command takes', () => {
	const known = new Set([
		...RUN_FLAGS.map(({ flag }) => flag),
		// of `bench/deterministic.ts`, `git status`, `node`, and `gro build`
		'--check',
		'--short',
		'--version',
		'--no-install'
	]);
	for (const [flag] of page.matchAll(/(?<![\w-])--[a-z][a-z-]*/g)) {
		assert.ok(known.has(flag), `unknown flag ${flag}`);
	}
});

test('the publishing page states the thresholds and the files the site reads', () => {
	const text = page.replace(/\s+/g, ' ');
	assert.ok(text.includes(`within ${BENCH_ANCHOR_STABLE_BELOW * 100}%`), 'the anchor threshold');
	assert.ok(text.includes(`over ${SPREAD_DISTURBED_ABOVE} after`), 'the spread threshold');
	assert.ok(text.includes(`warns when it is over ${LOAD_BUSY_ABOVE}`), 'the load threshold');
	for (const path of [SITE_DETERMINISTIC_PATH, SITE_LATEST_PATH]) {
		assert.ok(page.includes(`\`${path.replace('results/', '')}\``), path);
	}
});

test('the publishing page publishes through the script, never by hand', () => {
	assert.ok(page.includes('npm run results:publish -- results/'));
	assert.ok(!/\bcp\b[^\n]*latest\.json/.test(page), 'a hand copy to latest.json');
});
