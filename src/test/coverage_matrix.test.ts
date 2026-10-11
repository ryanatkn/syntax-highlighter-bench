import { assert, describe, test } from 'vitest';

import { to_coverage_matrix } from '#lib/coverage_matrix.ts';
import { load_deterministic } from './site_test_helpers.ts';

const results = load_deterministic();

describe('to_coverage_matrix', () => {
	const matrix = to_coverage_matrix(results);

	test('has a row for each language and a cell for each library', () => {
		assert.deepStrictEqual(
			matrix.rows.map((row) => row.lang.id),
			results.langs.map((lang) => lang.id)
		);
		for (const row of matrix.rows) {
			assert.deepStrictEqual(
				Object.keys(row.cells),
				results.meta.libraries.map((library) => library.id)
			);
		}
	});

	test('a cell says the library covers the language, covers it indirectly, or does not', () => {
		for (const row of matrix.rows) {
			for (const [library, cell] of Object.entries(row.cells)) {
				const entry = results.coverage[library]![row.lang.id];
				if (entry === undefined) assert.deepStrictEqual(cell, { kind: 'unsupported' });
				else if (entry === true) assert.deepStrictEqual(cell, { kind: 'direct' });
				else {
					assert.ok(cell.kind === 'via');
					assert.strictEqual(matrix.footnotes[cell.footnote], entry.via);
				}
			}
		}
		const xml = matrix.rows.find((row) => row.lang.id === 'xml')!;
		assert.strictEqual(xml.cells.twinkleplop!.kind, 'unsupported');
	});

	test('a footnote two libraries share is one footnote, numbered by first use', () => {
		assert.strictEqual(new Set(matrix.footnotes).size, matrix.footnotes.length);
		const xml = matrix.rows.find((row) => row.lang.id === 'xml')!;
		assert.deepStrictEqual(xml.cells.shiki_js, xml.cells.shiki_wasm);
		const used = matrix.rows.flatMap((row) =>
			Object.values(row.cells).flatMap((cell) => (cell.kind === 'via' ? cell.footnote : []))
		);
		const first_uses = [...new Set(used)];
		assert.deepStrictEqual(
			first_uses,
			first_uses.map((_, i) => i)
		);
	});
});
