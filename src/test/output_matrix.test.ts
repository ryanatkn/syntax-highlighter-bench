import { assert, describe, test } from 'vitest';

import { matrix_row_entry, matrix_row_value } from '$lib/matrix.ts';
import { OUTPUT_MEASURES, to_output_groups, type OutputSelection } from '$lib/output_matrix.ts';
import { BenchSize } from '$lib/results_schema.ts';
import { load_deterministic, load_fixture, to_library_ids } from './site_test_helpers.ts';

const results = load_deterministic();
const libraries = to_library_ids(results);

const NEUTRAL: OutputSelection = {
	langs: ['rust'],
	sizes: BenchSize.options,
	sources: ['neutral'],
	measures: OUTPUT_MEASURES.map((measure) => measure.id),
	compression: 'raw'
};

describe('to_output_groups', () => {
	test('has a row for each measure of each input, with the number its cell states', () => {
		const groups = to_output_groups(results, NEUTRAL);
		assert.deepStrictEqual(
			groups.map((group) => group.key),
			['rust/neutral']
		);
		const inputs = results.cells.filter(
			(cell) => cell.lang === 'rust' && cell.source === 'neutral' && cell.mode === 'html'
		);
		assert.strictEqual(groups[0]!.rows.length, inputs.length * OUTPUT_MEASURES.length);
		for (const html of inputs) {
			const tokenize = results.cells.find((cell) => cell.id === `${html.file}:tokenize`)!;
			const row = (measure: string) =>
				groups[0]!.rows.find(
					(r) => r.key === `${measure === 'tokens' ? tokenize.id : html.id}:${measure}`
				)!;
			for (const id of libraries) {
				assert.strictEqual(matrix_row_value(row('tokens'), id), tokenize.tokens[id]);
				assert.strictEqual(matrix_row_value(row('html_bytes'), id), html.output[id]!.html_bytes);
				assert.strictEqual(matrix_row_value(row('spans'), id), html.output[id]!.spans);
			}
			assert.strictEqual(row('html_bytes').unit, 'bytes');
			assert.strictEqual(row('tokens').unit, 'count');
		}
	});

	test('shows the HTML compressed when a compression is selected', () => {
		for (const compression of ['gzip', 'brotli'] as const) {
			const groups = to_output_groups(results, {
				...NEUTRAL,
				measures: ['html_bytes'],
				compression
			});
			for (const row of groups[0]!.rows) {
				const html = results.cells.find((cell) => `${cell.id}:html_bytes` === row.key)!;
				assert.include(row.note, compression);
				for (const id of libraries) {
					const value = matrix_row_value(row, id)!;
					assert.strictEqual(value, html.compressed[id]![compression]);
					assert.ok(value < html.output[id]!.html_bytes);
				}
			}
		}
	});

	test('shows only the selected measures, and has no summary row', () => {
		const groups = to_output_groups(results, { ...NEUTRAL, measures: ['spans'] });
		for (const row of groups[0]!.rows) {
			assert.ok(row.key.endsWith(':html:spans'));
			assert.strictEqual(row.kind, 'cell');
		}
		assert.deepStrictEqual(to_output_groups(results, { ...NEUTRAL, measures: [] }), []);
	});

	test('an excluded library shows as excluded in every measure of the input', () => {
		const fixture = load_fixture();
		const groups = to_output_groups(fixture, {
			langs: ['rust'],
			sizes: BenchSize.options,
			sources: ['shiki'],
			measures: OUTPUT_MEASURES.map((measure) => measure.id),
			compression: 'gzip'
		});
		assert.strictEqual(groups[0]!.rows.length, OUTPUT_MEASURES.length);
		for (const row of groups[0]!.rows) {
			assert.strictEqual(matrix_row_entry(row, 'prism').kind, 'excluded');
			assert.strictEqual(matrix_row_entry(row, 'fuz_code').kind, 'value');
		}
	});
});
