import { assert, test } from 'vitest';
import { readFileSync } from 'node:fs';

import { BenchSource } from '$lib/results_schema.ts';
import { SIZE_TIER_LIMITS } from '../../bench/corpus.ts';
import { ADAPTERS } from '../../bench/libraries.ts';

// these pages state by hand what the harness defines, because the site never imports it
const corpus_page = readFileSync(
	new URL('../routes/docs/corpus/+page.svelte', import.meta.url),
	'utf8'
);
const corpus_readme = readFileSync(
	new URL('../../bench/corpus/README.md', import.meta.url),
	'utf8'
);
const adapters_page = readFileSync(
	new URL('../routes/docs/adapters/+page.svelte', import.meta.url),
	'utf8'
);

const format_bytes = (bytes: number): string => bytes.toLocaleString('en-US');

test('the corpus docs name every source', () => {
	for (const source of BenchSource.options) {
		assert.ok(corpus_page.includes(`<code>${source}</code>`), `the tome lacks "${source}"`);
		assert.ok(corpus_readme.includes(`\`${source}\``), `the readme lacks "${source}"`);
	}
});

test('the corpus docs state the size tiers as the harness defines them', () => {
	for (const { size, below } of SIZE_TIER_LIMITS) {
		assert.ok(corpus_page.includes(`<code>${size}</code>`), `the tome lacks "${size}"`);
		assert.ok(corpus_readme.includes(`\`${size}\``), `the readme lacks "${size}"`);
		if (below === Infinity) continue;
		assert.ok(corpus_page.includes(format_bytes(below)), `the tome lacks ${below}`);
		assert.ok(corpus_readme.includes(format_bytes(below)), `the readme lacks ${below}`);
	}
});

test('the adapters tome names every library', () => {
	for (const adapter of ADAPTERS) {
		// the two Shiki adapters share one row
		const name = adapter.label.replace(/ \(.*\)$/, '');
		assert.ok(adapters_page.includes(name), `missing library "${name}"`);
	}
});
