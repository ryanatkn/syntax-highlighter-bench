import { assert, describe, test } from 'vitest';

import { HEAP_TOLERANCE_KB, HEAP_TOLERANCE_RATIO } from '#lib/bench_constants.ts';
import {
	HEAP_MEASURES,
	results_have_heap,
	to_heap_floor,
	to_heap_groups
} from '#lib/heap_matrix.ts';
import { matrix_row_entry, matrix_row_value } from '#lib/matrix.ts';
import { load_deterministic, to_library_ids } from './site_test_helpers.ts';

const results = load_deterministic();
const libraries = to_library_ids(results);

describe('to_heap_floor', () => {
	test('is the tolerance against the smallest number, absolute or relative, whichever is larger', () => {
		assert.strictEqual(to_heap_floor([HEAP_TOLERANCE_KB * 1024 * 10, 1e12]), 0.1);
		assert.strictEqual(to_heap_floor([1e12]), HEAP_TOLERANCE_RATIO);
		assert.strictEqual(to_heap_floor([0]), null);
		assert.strictEqual(to_heap_floor([]), null);
	});

	test('a compared row carries it, so readings within the tolerance print as level', () => {
		for (const group of to_heap_groups(results, { langs: ['ts'] })) {
			const row = group.rows[0]!;
			if (row.compared) assert.ok(row.floor !== null && row.floor >= HEAP_TOLERANCE_RATIO);
			else assert.strictEqual(row.floor, null);
		}
	});
});

describe('to_heap_groups', () => {
	test('a group for each measure, a row for each selected timed language, in bytes', () => {
		const groups = to_heap_groups(results, { langs: ['ts', 'xml', 'json'] });
		assert.deepStrictEqual(
			groups.map((group) => group.key),
			HEAP_MEASURES.map((measure) => `heap:${measure.id}`)
		);
		for (const group of groups) {
			// xml is untimed, and has no reading
			assert.deepStrictEqual(
				group.rows.map((row) => row.label),
				['TypeScript', 'JSON']
			);
		}
		const [total, retained, code, external] = groups;
		for (const id of libraries) {
			const heap = results.heap[id]!.ts!;
			assert.strictEqual(matrix_row_value(retained!.rows[0]!, id), heap.retained_kb * 1024);
			assert.strictEqual(matrix_row_value(code!.rows[0]!, id), heap.code_kb * 1024);
			assert.strictEqual(matrix_row_value(external!.rows[0]!, id), heap.external_kb * 1024);
			assert.strictEqual(
				matrix_row_value(total!.rows[0]!, id),
				(heap.retained_kb + heap.code_kb + heap.external_kb) * 1024
			);
		}
	});

	test('ranks the sum, the V8 heap, and the machine code, and not the external memory', () => {
		const groups = to_heap_groups(results, { langs: ['ts'] });
		assert.deepStrictEqual(
			groups.map((group) => group.rows[0]!.compared),
			[true, true, true, false]
		);
		assert.ok(groups.every((group) => group.rows[0]!.direction === 'lower'));
	});

	test('a language a library does not claim is unsupported, and one with no reading unmeasured', () => {
		const changed = structuredClone(results);
		delete changed.coverage.prism!.rust;
		delete changed.heap.shiki_js!.rust;
		const [total] = to_heap_groups(changed, { langs: ['rust'] });
		assert.deepStrictEqual(matrix_row_entry(total!.rows[0]!, 'prism'), {
			kind: 'unsupported',
			langs: ['rust']
		});
		assert.deepStrictEqual(matrix_row_entry(total!.rows[0]!, 'shiki_js'), { kind: 'unmeasured' });
	});

	test('nothing for a file without readings, or a selection without a timed language', () => {
		assert.ok(results_have_heap(results));
		assert.deepStrictEqual(to_heap_groups({ ...results, heap: {} }, { langs: ['ts'] }), []);
		assert.deepStrictEqual(to_heap_groups(results, { langs: ['xml'] }), []);
	});
});
