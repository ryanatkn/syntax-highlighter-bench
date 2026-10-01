import { assert, test } from 'vitest';
import { readFileSync } from 'node:fs';

import {
	BENCH_ANCHOR_STABLE_BELOW,
	BenchCellValue,
	BenchRunKind,
	BenchRunMetric,
	BenchStartup,
	BenchStartupScenario
} from '$lib/results_schema.ts';
import { SPREAD_DISTURBED_ABOVE } from '$lib/bench_constants.ts';
import { FULL_PARAMS, RUN_FLAGS } from '../../bench/run_options.ts';

// these docs state by hand what the harness defines, because the site never imports it
const docs = {
	tome: readFileSync(new URL('../routes/docs/method/+page.svelte', import.meta.url), 'utf8'),
	readme: readFileSync(new URL('../../README.md', import.meta.url), 'utf8')
};

/** Collapses the line wrapping of prose, so a phrase is found across a line break. */
const unwrap = (text: string): string => text.replace(/\s+/g, ' ');

test('the method docs name every flag of a run', () => {
	for (const [name, text] of Object.entries(docs)) {
		for (const { flag } of RUN_FLAGS) assert.ok(text.includes(flag), `${name} lacks ${flag}`);
	}
});

test('the method docs name every kind of run', () => {
	for (const [name, text] of Object.entries(docs)) {
		for (const kind of BenchRunKind.options)
			assert.ok(text.includes(kind), `${name} lacks ${kind}`);
	}
});

test('the method docs name every number of a cell', () => {
	for (const [name, text] of Object.entries(docs)) {
		for (const key of Object.keys(BenchCellValue.shape)) {
			assert.ok(text.includes(key), `${name} lacks ${key}`);
		}
	}
});

test('the method docs state the parameters of a full run and the anchor threshold', () => {
	const { passes, rounds, target_ms, warmup_ms, rewarm_ms } = FULL_PARAMS;
	const parameters = `in ${passes} processes per cell, each timing ${rounds} rounds of ${target_ms}ms batches, after a ${warmup_ms}ms warmup, with a ${rewarm_ms}ms rewarm`;
	const threshold = `${BENCH_ANCHOR_STABLE_BELOW * 100}%`;
	for (const [name, text] of Object.entries(docs)) {
		assert.ok(unwrap(text).includes(parameters), `${name} lacks "${parameters}"`);
		assert.ok(text.includes(threshold), `${name} lacks ${threshold}`);
	}
});

test('the method docs state the retry threshold and how many retries a full run allows', () => {
	const retries = `is over ${SPREAD_DISTURBED_ABOVE} again, every pass of it, up to \`--retries\` more times (${FULL_PARAMS.retries} by default`;
	for (const [name, text] of Object.entries(docs)) {
		const plain = unwrap(text.replace(/<\/?code>/g, '`'));
		assert.ok(plain.includes(retries), `${name} lacks "${retries}"`);
	}
});

test('the method docs name every cold-start scenario, number, and metric', () => {
	for (const [name, text] of Object.entries(docs)) {
		const plain = text.replace(/<\/?code>/g, '`');
		for (const id of [
			...BenchStartupScenario.options,
			...BenchRunMetric.options,
			...['samples', 'median_ms', 'p10_ms', 'p90_ms', 'spread', 'rss_peak_bytes', 'bundled']
		]) {
			assert.ok(plain.includes(`\`${id}\``), `${name} lacks ${id}`);
		}
		for (const variable of ['NODE_DISABLE_COMPILE_CACHE=1', 'NODE_COMPILE_CACHE']) {
			assert.ok(plain.includes(variable), `${name} lacks ${variable}`);
		}
	}
	// and those are the numbers of an entry
	for (const key of ['samples', 'median_ms', 'p10_ms', 'p90_ms', 'spread', 'rss_peak_bytes']) {
		assert.ok(Object.hasOwn(BenchStartup.shape, key), key);
	}
});

test('the method docs state how many cold-start samples a full run keeps and discards', () => {
	const samples = `keeps ${FULL_PARAMS.startup_samples} samples of each scenario, after ${FULL_PARAMS.startup_discard} discarded rounds`;
	for (const [name, text] of Object.entries(docs)) {
		assert.ok(unwrap(text).includes(samples), `${name} lacks "${samples}"`);
	}
});
