import { assert, test } from 'vitest';
import { readFileSync } from 'node:fs';

import {
	BenchBundleSizes,
	BenchCellCompressed,
	BenchCellOutput,
	BenchHeap,
	BenchInstall
} from '$lib/results_schema.ts';
import { HEAP_TOLERANCE_KB, HEAP_TOLERANCE_RATIO } from '$lib/bench_constants.ts';
import { HEAP_NODE_FLAGS } from '../../bench/heap.ts';
import { ADAPTERS } from '../../bench/libraries.ts';
import { BROTLI_QUALITY, GZIP_LEVEL } from '../../bench/sizes.ts';

// these docs state by hand what the harness defines, because the site never imports it
const docs = {
	tome: readFileSync(
		new URL('../routes/docs/deterministic/+page.svelte', import.meta.url),
		'utf8'
	).replace(/<\/?code>/g, '`'),
	readme: readFileSync(new URL('../../README.md', import.meta.url), 'utf8')
};

/** Collapses the line wrapping of prose, so a phrase is found across a line break. */
const unwrap = (text: string): string => text.replace(/\s+/g, ' ');

test('the deterministic docs state the compression levels as the harness defines them', () => {
	for (const [name, text] of Object.entries(docs)) {
		const plain = unwrap(text);
		assert.ok(plain.includes(`gzipped at level ${GZIP_LEVEL}`), `${name} lacks the gzip level`);
		assert.ok(
			plain.includes(`brotli-compressed at quality ${BROTLI_QUALITY}`),
			`${name} lacks the brotli quality`
		);
	}
});

test('the deterministic docs name every size of a bundle, an output, an install, and a heap', () => {
	const keys = [
		...Object.keys(BenchBundleSizes.shape),
		...Object.keys(BenchCellOutput.shape),
		...Object.keys(BenchCellCompressed.shape),
		...Object.keys(BenchInstall.shape),
		...Object.keys(BenchHeap.shape)
	];
	for (const [name, text] of Object.entries(docs)) {
		for (const key of keys) assert.ok(text.includes(`\`${key}\``), `${name} lacks ${key}`);
	}
});

test('the deterministic docs give every flag a heap process runs with', () => {
	for (const [name, text] of Object.entries(docs)) {
		for (const flag of HEAP_NODE_FLAGS) {
			assert.ok(text.includes(`\`${flag}\``), `${name} lacks ${flag}`);
		}
	}
});

test('the README states the heap tolerance as the check applies it', () => {
	// the tome renders it from the constants
	assert.ok(
		unwrap(docs.readme).includes(`${HEAP_TOLERANCE_KB} KiB or ${HEAP_TOLERANCE_RATIO * 100}%`)
	);
});

test('the deterministic docs give the command and its check', () => {
	const scripts: Record<string, string> = JSON.parse(
		readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
	).scripts;
	assert.strictEqual(scripts['bench:deterministic'], 'node bench/deterministic.ts');
	for (const [name, text] of Object.entries(docs)) {
		assert.ok(text.includes('npm run bench:deterministic'), `${name} lacks the command`);
		assert.ok(text.includes('bench:deterministic -- --check'), `${name} lacks the check`);
	}
});

test('the deterministic docs name every library whose bundle entry they describe', () => {
	for (const [name, text] of Object.entries(docs)) {
		for (const adapter of ADAPTERS) {
			// the two Shiki adapters share one row
			const label = adapter.label.replace(/ \(.*\)$/, '');
			assert.ok(text.includes(label), `${name} lacks "${label}"`);
		}
	}
});
