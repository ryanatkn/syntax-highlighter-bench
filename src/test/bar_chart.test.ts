import { assert, describe, test } from 'vitest';

import { to_bar_chart } from '$lib/bar_chart.ts';
import { to_matrix_row, to_value_entry, type MatrixEntry, type MatrixRow } from '$lib/matrix.ts';

const LIBRARIES = ['a', 'b', 'c'];

const to_row = (
	entries: Record<string, MatrixEntry | number>,
	options: Partial<MatrixRow> = {}
): MatrixRow =>
	to_matrix_row({
		key: 'row',
		label: 'row',
		unit: 'ms',
		direction: 'lower',
		entries: Object.fromEntries(
			Object.entries(entries).map(([id, entry]) => [
				id,
				typeof entry === 'number' ? to_value_entry(entry) : entry
			])
		),
		...options
	});

describe('to_bar_chart', () => {
	test('bars are each number over the largest, and the best is the anchor', () => {
		const items = to_bar_chart(to_row({ a: 2, b: 4, c: 8 }), LIBRARIES, null);
		assert.deepStrictEqual(
			items.map((item) => item.fraction),
			[0.25, 0.5, 1]
		);
		assert.deepStrictEqual(
			items.map((item) => item.ratio),
			[1, 2, 4]
		);
		assert.deepStrictEqual(
			items.map((item) => item.anchor),
			[true, false, false]
		);
	});

	test('a longer bar is more of the unit when higher is better', () => {
		const items = to_bar_chart(
			to_row({ a: 2, b: 4, c: 8 }, { direction: 'higher' }),
			LIBRARIES,
			null
		);
		assert.deepStrictEqual(
			items.map((item) => item.fraction),
			[0.25, 0.5, 1]
		);
		assert.deepStrictEqual(
			items.map((item) => item.anchor),
			[false, false, true]
		);
	});

	test('a reference re-baselines the ratios on it', () => {
		const items = to_bar_chart(to_row({ a: 2, b: 4, c: 8 }), LIBRARIES, 'b');
		assert.deepStrictEqual(
			items.map((item) => item.ratio),
			[0.5, 1, 2]
		);
		assert.deepStrictEqual(
			items.map((item) => item.anchor),
			[false, true, false]
		);
	});

	test('an entry without a number has no bar and says why', () => {
		const items = to_bar_chart(
			to_row({ a: 2, b: { kind: 'unsupported', langs: ['xml'] } }),
			LIBRARIES,
			null
		);
		assert.strictEqual(items[1]!.has_value, false);
		assert.strictEqual(items[1]!.fraction, 0);
		assert.strictEqual(items[1]!.text, 'unsupported: no xml');
		assert.strictEqual(items[2]!.text, 'not measured');
		// one number has nothing to compare against
		assert.strictEqual(items[0]!.ratio, undefined);
	});

	test('a ratio inside the floor is marked', () => {
		const items = to_bar_chart(
			to_row({ a: 100, b: 101, c: 200 }, { floor: 0.02 }),
			LIBRARIES,
			null
		);
		assert.deepStrictEqual(
			items.map((item) => item.within_floor),
			[false, true, false]
		);
	});
});
