import { assert, describe, test } from 'vitest';

import { HEAP_TOLERANCE_KB, HEAP_TOLERANCE_RATIO } from '$lib/bench_constants.ts';
import { heap_readings_agree } from '$lib/results_schema.ts';
import {
	HEAP_CODE_SPACES,
	HEAP_NODE_FLAGS,
	to_bench_heap,
	to_heap_child_source
} from '../../../bench/heap.ts';

describe('heap_readings_agree', () => {
	test('accepts the larger of the absolute and the relative tolerance', () => {
		assert.ok(heap_readings_agree(100, 100));
		assert.ok(heap_readings_agree(100, 100 + HEAP_TOLERANCE_KB));
		assert.ok(!heap_readings_agree(100, 101 + HEAP_TOLERANCE_KB));
		const large = 100_000;
		const relative = Math.floor(large * HEAP_TOLERANCE_RATIO);
		assert.ok(relative > HEAP_TOLERANCE_KB);
		assert.ok(heap_readings_agree(large, large - relative));
		assert.ok(!heap_readings_agree(large, large - relative - HEAP_TOLERANCE_KB * 2));
	});
});

describe('to_bench_heap', () => {
	test('is the reading over the bare one, in whole kibibytes', () => {
		assert.deepStrictEqual(
			to_bench_heap(
				{ heap_bytes: 5_000_000, code_bytes: 600_000, external_bytes: 2_000_000 },
				{ heap_bytes: 4_000_000, code_bytes: 100_000, external_bytes: 1_000_000 }
			),
			{ retained_kb: 977, code_kb: 488, external_kb: 977 }
		);
	});

	test('a reading under the bare one is zero, never negative', () => {
		assert.deepStrictEqual(
			to_bench_heap(
				{ heap_bytes: 4_000_000, code_bytes: 90_000, external_bytes: 999_000 },
				{ heap_bytes: 4_000_100, code_bytes: 100_000, external_bytes: 1_000_000 }
			),
			{ retained_kb: 0, code_kb: 0, external_kb: 0 }
		);
	});
});

describe('to_heap_child_source', () => {
	const highlight = { src: 'a "b"', expression: 'exports.h(src)' };

	test('the bare module is the same, without the import and the call', () => {
		const bare = to_heap_child_source(null, highlight);
		const own = to_heap_child_source('./single_json.mjs', highlight);
		assert.notInclude(bare, 'import');
		assert.notInclude(bare, 'exports.h');
		assert.include(own, 'import * as exports from "./single_json.mjs";');
		assert.include(own, 'let html = exports.h(src);');
		// both hold the snippet, so its text cancels out
		for (const source of [bare, own]) {
			assert.include(source, `const src = ${JSON.stringify(highlight.src)};`);
		}
	});

	test('drops the HTML before collecting, and reads machine code apart', () => {
		const own = to_heap_child_source('./x.mjs', highlight);
		assert.ok(own.indexOf('html = null;') < own.indexOf('globalThis.gc()'));
		assert.include(own, JSON.stringify(HEAP_CODE_SPACES));
		assert.include(own, 'code_bytes += space.space_used_size');
		assert.include(own, 'process.memoryUsage().external');
	});

	test('nothing of the harness is imported', () => {
		const own = to_heap_child_source('./x.mjs', highlight);
		assert.deepStrictEqual(own.match(/^import .*$/gm), ['import * as exports from "./x.mjs";']);
	});
});

test('the flags expose collection and pin the young generation', () => {
	assert.include(HEAP_NODE_FLAGS, '--expose-gc');
	assert.ok(HEAP_NODE_FLAGS.some((flag) => flag.startsWith('--max-semi-space-size=')));
	assert.include(HEAP_NODE_FLAGS, '--single-threaded');
});
