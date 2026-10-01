import { assert, describe, test } from 'vitest';

import { NO_TIMED_RESULTS, to_headline_groups } from '$lib/headline.ts';
import { matrix_row_entry, matrix_row_value } from '$lib/matrix.ts';
import { load_deterministic, load_fixture, to_library_ids } from './site_test_helpers.ts';

describe('to_headline_groups', () => {
	test('with no timed run, the timed rows say so and hold no number', () => {
		const results = load_deterministic();
		const [throughput, startup, bundle, beside] = to_headline_groups(results);
		assert.strictEqual(throughput!.rows.length, 2);
		for (const row of [...throughput!.rows, ...startup!.rows]) {
			assert.strictEqual(row.empty, NO_TIMED_RESULTS);
			assert.deepStrictEqual(row.entries, {});
		}
		// and the deterministic rows hold the committed numbers
		const sizes = results.bundle.prism!.docs!;
		assert.ok(!('unsupported' in sizes));
		assert.strictEqual(bundle!.rows[0]!.empty, null);
		assert.strictEqual(matrix_row_value(bundle!.rows[0]!, 'prism'), sizes.gzip);
		assert.strictEqual(matrix_row_value(beside!.rows[1]!, 'prism'), sizes.css!.gzip);
		// everything loaded: the JavaScript, the wasm binary, and the stylesheet
		const wasm = results.bundle.shiki_wasm!.docs!;
		assert.ok(!('unsupported' in wasm));
		assert.strictEqual(bundle!.rows[1]!.label, 'everything loaded');
		assert.strictEqual(
			matrix_row_value(bundle!.rows[1]!, 'shiki_wasm'),
			wasm.gzip + wasm.wasm!.gzip
		);
		assert.strictEqual(matrix_row_value(bundle!.rows[1]!, 'prism'), sizes.gzip + sizes.css!.gzip);
	});

	test('with a timed run, each timed row is a geometric mean over the neutral inputs', () => {
		const results = load_fixture();
		const libraries = to_library_ids(results);
		const [throughput, startup] = to_headline_groups(results);
		assert.deepStrictEqual(
			throughput!.rows.map((row) => row.label),
			['geomean · neutral · tokenize', 'geomean · neutral · html']
		);
		for (const row of [...throughput!.rows, ...startup!.rows]) {
			assert.strictEqual(row.empty, null);
			assert.strictEqual(row.kind, 'summary');
			for (const id of libraries) assert.strictEqual(matrix_row_entry(row, id).kind, 'value');
		}
		assert.strictEqual(startup!.rows[0]!.label, 'first highlight');
		assert.include(throughput!.note, 'neutral');
	});

	test('only the timed throughput rows are read against the noise floor', () => {
		const results = load_fixture();
		const [throughput, ...rest] = to_headline_groups(results);
		for (const row of throughput!.rows) {
			assert.strictEqual(row.floor, results.meta.noise_floor!.geomean);
		}
		// cold start has no calibrated floor, and a byte count has no noise
		for (const group of rest) {
			for (const row of group.rows) assert.strictEqual(row.floor, null, row.key);
		}
		for (const group of to_headline_groups(load_deterministic())) {
			for (const row of group.rows) assert.strictEqual(row.floor, null, row.key);
		}
	});
});
