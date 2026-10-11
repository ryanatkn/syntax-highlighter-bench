import { assert, describe, test } from 'vitest';

import {
	format_cell_group_label,
	format_source_key,
	format_source_note,
	group_cells,
	to_excluded_reasons,
	to_missing_cell_entry,
	to_source_key,
	to_source_keys
} from '#lib/cell_groups.ts';
import { BenchMode, BenchSize } from '#lib/results_schema.ts';
import { load_deterministic, load_fixture } from './site_test_helpers.ts';

const deterministic = load_deterministic();
const fixture = load_fixture();

const EVERYTHING = {
	langs: deterministic.langs.map((lang) => lang.id),
	sizes: BenchSize.options,
	modes: BenchMode.options,
	sources: to_source_keys(deterministic.cells)
};

describe('source keys', () => {
	test('a home input is keyed by its owner, so two libraries are never one source', () => {
		assert.strictEqual(to_source_key({ source: 'neutral', home: null }), 'neutral');
		assert.strictEqual(to_source_key({ source: 'home', home: 'fuz_code' }), 'home:fuz_code');
		assert.deepStrictEqual(to_source_keys(deterministic.cells), [
			'neutral',
			'shiki',
			'home:fuz_code',
			'home:twinkleplop',
			'harness',
			'stress'
		]);
	});

	test('a home label and note name the library whose samples they are', () => {
		assert.strictEqual(format_source_key('home:twinkleplop'), 'home: twinkleplop');
		assert.include(format_source_note('home:twinkleplop'), 'home turf');
		assert.include(format_source_note('home:twinkleplop'), "twinkleplop's own samples");
		assert.strictEqual(format_source_key('neutral'), 'neutral');
		assert.notInclude(format_source_note('neutral'), 'home turf');
	});
});

describe('group_cells', () => {
	test('groups by language in roster order, then by source', () => {
		const groups = group_cells(deterministic, EVERYTHING);
		const langs = [...new Set(groups.map((group) => group.lang.id))];
		assert.deepStrictEqual(
			langs,
			deterministic.langs.filter((lang) => lang.timed).map((lang) => lang.id)
		);
		const ts = groups.filter((group) => group.lang.id === 'ts').map((group) => group.source_key);
		assert.deepStrictEqual(ts, [
			'neutral',
			'shiki',
			'home:fuz_code',
			'home:twinkleplop',
			'harness',
			'stress'
		]);
		assert.strictEqual(
			groups.reduce((sum, group) => sum + group.cells.length, 0),
			deterministic.cells.length
		);
		assert.strictEqual(new Set(groups.map((group) => group.key)).size, groups.length);
	});

	test('a group holds one language and one source, ordered by size, file, then mode', () => {
		for (const group of group_cells(deterministic, EVERYTHING)) {
			const ranks = group.cells.map((cell) => {
				assert.strictEqual(cell.lang, group.lang.id);
				assert.strictEqual(to_source_key(cell), group.source_key);
				return BenchSize.options.indexOf(cell.size);
			});
			assert.deepStrictEqual(
				ranks,
				[...ranks].sort((a, b) => a - b)
			);
			for (let i = 0; i < group.cells.length; i += 2) {
				assert.strictEqual(group.cells[i]!.mode, 'tokenize');
				assert.strictEqual(group.cells[i + 1]!.mode, 'html');
				assert.strictEqual(group.cells[i]!.file, group.cells[i + 1]!.file);
			}
		}
	});

	test('keeps only what is selected', () => {
		const groups = group_cells(deterministic, {
			langs: ['rust', 'md'],
			sizes: ['large'],
			modes: ['html'],
			sources: ['neutral', 'home:twinkleplop']
		});
		assert.ok(groups.length > 0);
		for (const group of groups) {
			assert.include(['rust', 'md'], group.lang.id);
			assert.include(['neutral', 'home:twinkleplop'], group.source_key);
			for (const cell of group.cells) {
				assert.strictEqual(cell.size, 'large');
				assert.strictEqual(cell.mode, 'html');
			}
		}
		assert.deepStrictEqual(group_cells(deterministic, { ...EVERYTHING, sources: [] }), []);
	});

	test('labels a group by its language and its source', () => {
		const group = group_cells(deterministic, { ...EVERYTHING, sources: ['home:fuz_code'] })[0]!;
		assert.strictEqual(format_cell_group_label(group), `${group.lang.label} · home: fuz_code`);
	});
});

describe('to_missing_cell_entry', () => {
	const excluded = to_excluded_reasons(fixture);
	const cell = fixture.cells.find((c) => c.id === 'shiki/rust/rust.sample:tokenize')!;

	test('an excluded library carries its reason', () => {
		assert.deepStrictEqual(to_missing_cell_entry(fixture, excluded, cell, 'prism'), {
			kind: 'excluded',
			reason: 'produced no tokens'
		});
	});

	test('a library that does not claim the language is unsupported, which is not excluded', () => {
		const coverage = { ...fixture.coverage, prism: {} };
		assert.deepStrictEqual(to_missing_cell_entry({ coverage }, new Map(), cell, 'prism'), {
			kind: 'unsupported',
			langs: ['rust']
		});
	});

	test('a claimed language with no number and no exclusion is unmeasured', () => {
		assert.deepStrictEqual(to_missing_cell_entry(fixture, new Map(), cell, 'prism'), {
			kind: 'unmeasured'
		});
	});
});
