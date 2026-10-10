import { assert, describe, test } from 'vitest';

import {
	find_core_set,
	find_single_set,
	find_timed_set,
	find_without_set,
	INSTALL_MEASURES,
	to_bundle_beside_group,
	to_bundle_cost_groups,
	to_bundle_increment_entry,
	to_bundle_loaded_entry,
	to_bundle_size_entry,
	to_bundle_sum_entry,
	to_bundle_total_groups,
	to_combined_sets,
	to_install_group
} from '$lib/bundle_matrix.ts';
import {
	matrix_row_entry,
	matrix_row_value,
	to_matrix_ratios,
	type MatrixEntry
} from '$lib/matrix.ts';
import type { BenchBundleSizes } from '$lib/results_schema.ts';
import { load_deterministic, to_library_ids } from './site_test_helpers.ts';

// the committed results, so the tables are checked against real sizes
const results = load_deterministic();
const libraries = to_library_ids(results);
const langs = results.langs.map((lang) => lang.id);

const sizes = (library: string, set: string): BenchBundleSizes => {
	const entry = results.bundle[library]![set]!;
	assert.ok(!('unsupported' in entry), `${library} has no sizes for ${set}`);
	return entry;
};

/** A library that claims every language of the file. */
const FULL = 'prism';
/** A library that lacks a language, and the language. */
const PARTIAL = 'twinkleplop';
const LACKED = 'xml';

describe('finding the sets', () => {
	test('the core set is the one with no language, and a single set holds one alone', () => {
		assert.strictEqual(find_core_set(results.sets)!.id, 'core');
		for (const lang of langs) {
			assert.deepStrictEqual(find_single_set(results.sets, lang)!.langs, [lang]);
		}
		assert.strictEqual(find_single_set(results.sets, 'nope'), null);
		assert.strictEqual(find_core_set([]), null);
	});

	test('sets holding the same languages are one combined set that names them all', () => {
		const combined = to_combined_sets(results.sets, results.langs);
		const ids = combined.map((set) => set.ids);
		// the sets that leave one timed language out are not shown
		assert.deepStrictEqual(ids, [['docs'], ['web_rust', 'all'], ['timed']]);
		const merged = combined[1]!;
		assert.strictEqual(merged.label, 'web + rust = all');
		assert.strictEqual(merged.footnote, results.sets.find((s) => s.id === 'web_rust')!.footnote);
		// the order of the languages doesn't make two sets different
		const reordered = to_combined_sets(
			[
				{ id: 'x', label: 'x', langs: ['a', 'b'], footnote: null },
				{ id: 'y', label: 'y', langs: ['b', 'a'], footnote: 'note' },
				{ id: 'z', label: 'z', langs: ['a', 'c'], footnote: null }
			],
			[]
		);
		assert.deepStrictEqual(
			reordered.map((set) => [set.ids, set.footnote]),
			[
				[['x', 'y'], 'note'],
				[['z'], null]
			]
		);
	});
});

describe('incremental cost', () => {
	test('is the single-language set less the core set, in each compression', () => {
		for (const compression of ['raw', 'gzip', 'brotli'] as const) {
			for (const library of libraries) {
				const entry = to_bundle_increment_entry(results, library, 'rust', compression);
				assert.ok(entry.kind === 'value');
				assert.strictEqual(
					entry.value,
					sizes(library, 'single:rust')[compression] - sizes(library, 'core')[compression]
				);
			}
		}
	});

	test('is unsupported, naming the language, for a library that lacks it', () => {
		assert.deepStrictEqual(to_bundle_increment_entry(results, PARTIAL, LACKED, 'gzip'), {
			kind: 'unsupported',
			langs: [LACKED]
		});
	});

	test('is unmeasured, never a zero, when the file has no sizes', () => {
		const empty = { ...results, bundle: {} };
		assert.deepStrictEqual(to_bundle_increment_entry(empty, FULL, 'rust', 'gzip'), {
			kind: 'unmeasured'
		});
		assert.deepStrictEqual(
			to_bundle_cost_groups(empty, { langs, set: 'docs', compression: 'gzip' }),
			[]
		);
		assert.deepStrictEqual(to_bundle_total_groups(empty, { set: 'docs', compression: 'gzip' }), []);
	});
});

describe('the sum of a set beside its measured size', () => {
	const docs = results.sets.find((set) => set.id === 'docs')!;

	test('the sum is the core set plus each language of the set', () => {
		for (const library of libraries) {
			const entry = to_bundle_sum_entry(results, library, docs.langs, 'gzip');
			assert.ok(entry.kind === 'value');
			const core = sizes(library, 'core').gzip;
			const expected = docs.langs.reduce(
				(sum, lang) => sum + sizes(library, `single:${lang}`).gzip - core,
				core
			);
			assert.strictEqual(entry.value, expected);
		}
	});

	test('the sum and the measured size differ where a library shares code between languages', () => {
		const differ = libraries.filter((library) => {
			const sum = to_bundle_sum_entry(results, library, docs.langs, 'raw');
			const measured = to_bundle_size_entry(results, library, docs, 'raw');
			assert.ok(sum.kind === 'value' && measured.kind === 'value');
			return sum.value !== measured.value;
		});
		assert.ok(differ.length > 0, 'no library shares code between languages');
	});

	test('a set holding a language the library lacks is unsupported for both, naming it', () => {
		const all = results.sets.find((set) => set.id === 'all')!;
		const expected: MatrixEntry = { kind: 'unsupported', langs: [LACKED] };
		assert.deepStrictEqual(to_bundle_sum_entry(results, PARTIAL, all.langs, 'gzip'), expected);
		assert.deepStrictEqual(to_bundle_size_entry(results, PARTIAL, all, 'gzip'), expected);
	});
});

describe('to_bundle_cost_groups', () => {
	const groups = to_bundle_cost_groups(results, { langs, set: 'docs', compression: 'gzip' });

	test('has the floor, the first and one more language, the selected set, and what loads beside', () => {
		assert.deepStrictEqual(
			groups.map((group) => group.key),
			['core', 'langs', 'marginal', 'set', 'beside']
		);
		assert.strictEqual(matrix_row_value(groups[0]!.rows[0]!, FULL), sizes(FULL, 'core').gzip);
	});

	test('has a row for each selected language, in roster order', () => {
		assert.deepStrictEqual(
			groups[1]!.rows.map((row) => row.key),
			langs.map((lang) => `lang:${lang}`)
		);
		const narrowed = to_bundle_cost_groups(results, {
			langs: ['rust', 'ts'],
			set: 'docs',
			compression: 'gzip'
		});
		assert.deepStrictEqual(
			narrowed[1]!.rows.map((row) => row.key),
			['lang:ts', 'lang:rust']
		);
		// one more language has a row for each selected timed language
		assert.deepStrictEqual(
			narrowed[2]!.rows.map((row) => row.key),
			['marginal:ts', 'marginal:rust']
		);
		// the sum is over the set's languages, whatever rows are shown
		assert.deepStrictEqual(narrowed[3], groups[3]);
	});

	test('the set group is a sum row and a measured row, and says which set', () => {
		const [sum, measured] = groups[3]!.rows;
		assert.strictEqual(sum!.kind, 'summary');
		assert.strictEqual(measured!.kind, 'summary');
		// the sum is not a bundle, so no library is ranked by it, and the measured size is
		assert.include(sum!.note, 'not a bundle');
		assert.ok(!sum!.compared);
		assert.deepStrictEqual(to_matrix_ratios(sum!, libraries, null), {});
		assert.deepStrictEqual(to_matrix_ratios(sum!, libraries, FULL), {});
		assert.strictEqual(to_matrix_ratios(measured!, libraries, FULL)[FULL], 1);
		assert.strictEqual(matrix_row_value(measured!, FULL), sizes(FULL, 'docs').gzip);
		assert.include(groups[3]!.label, 'docs');
	});

	test('a set that holds the languages of another is shown once, with its home-turf note', () => {
		const group = to_bundle_cost_groups(results, {
			langs,
			set: 'web_rust',
			compression: 'gzip'
		})[3]!;
		assert.include(group.label, 'web + rust = all');
		assert.include(group.note, 'home turf');
		assert.deepStrictEqual(matrix_row_entry(group.rows[1]!, PARTIAL), {
			kind: 'unsupported',
			langs: [LACKED]
		});
	});

	test('an unknown set has no set group', () => {
		const without = to_bundle_cost_groups(results, { langs, set: 'nope', compression: 'gzip' });
		assert.deepStrictEqual(
			without.map((group) => group.key),
			['core', 'langs', 'marginal', 'beside']
		);
	});

	test('one more language is every timed language less the set without it, minified', () => {
		const marginal = groups[2]!;
		const timed_langs = results.langs.filter((lang) => lang.timed).map((lang) => lang.id);
		assert.deepStrictEqual(
			marginal.rows.map((row) => row.key),
			timed_langs.map((lang) => `marginal:${lang}`)
		);
		const rust = marginal.rows.find((row) => row.key === 'marginal:rust')!;
		for (const library of libraries) {
			assert.strictEqual(
				matrix_row_value(rust, library),
				sizes(library, 'timed').raw - sizes(library, 'without:rust').raw,
				library
			);
		}
		// every library claims every timed language, so none is unsupported here
		for (const row of marginal.rows) {
			for (const library of libraries) assert.ok(matrix_row_value(row, library) !== null);
		}
	});
});

describe('finding the leave-one-out sets', () => {
	test('by what they hold, not by their ids', () => {
		const timed = find_timed_set(results.sets, results.langs)!;
		assert.deepStrictEqual(
			[...timed.langs].sort(),
			results.langs
				.filter((lang) => lang.timed)
				.map((lang) => lang.id)
				.sort()
		);
		const without = find_without_set(results.sets, results.langs, 'ts')!;
		assert.ok(!without.langs.includes('ts'));
		assert.strictEqual(without.langs.length, timed.langs.length - 1);
		// an untimed language has no such set
		assert.strictEqual(find_without_set(results.sets, results.langs, 'xml'), null);
	});
});

describe('to_bundle_total_groups', () => {
	const groups = to_bundle_total_groups(results, { set: 'docs', compression: 'brotli' });

	test('has the core set and each combined set once, as measured', () => {
		assert.deepStrictEqual(
			groups.map((group) => group.key),
			['sets', 'loaded', 'beside']
		);
		const [sets] = groups;
		assert.deepStrictEqual(
			sets!.rows.map((row) => row.key),
			['core', 'set:docs', 'set:web_rust', 'set:timed']
		);
		const merged = sets!.rows[2]!;
		assert.strictEqual(merged.label, 'web + rust = all');
		assert.include(merged.note, 'the same languages');
		assert.strictEqual(matrix_row_value(merged, FULL), sizes(FULL, 'web_rust').brotli);
		assert.strictEqual(matrix_row_value(merged, FULL), sizes(FULL, 'all').brotli);
		assert.strictEqual(matrix_row_entry(merged, PARTIAL).kind, 'unsupported');
	});

	test('everything loaded has a row for each of the same sets, with ratios', () => {
		const loaded = groups[1]!;
		assert.deepStrictEqual(
			loaded.rows.map((row) => row.key),
			['loaded:core', 'loaded:set:docs', 'loaded:set:web_rust', 'loaded:set:timed']
		);
		const docs = loaded.rows[1]!;
		assert.ok(docs.compared);
		const ratios = to_matrix_ratios(docs, libraries, null);
		assert.deepStrictEqual(Object.keys(ratios), libraries);
		assert.include(Object.values(ratios), 1);
	});
});

describe('to_bundle_loaded_entry', () => {
	const docs = results.sets.find((set) => set.id === 'docs')!;

	test('adds the wasm binary and the stylesheet to the JS, in one compression', () => {
		for (const compression of ['raw', 'gzip', 'brotli'] as const) {
			for (const library of libraries) {
				const entry = sizes(library, 'docs');
				const loaded = to_bundle_loaded_entry(results, library, docs, compression);
				assert.ok(loaded.kind === 'value');
				assert.strictEqual(
					loaded.value,
					entry[compression] + (entry.wasm?.[compression] ?? 0) + (entry.css?.[compression] ?? 0)
				);
			}
		}
	});

	test('a library with neither adds nothing, and one with both adds both', () => {
		const with_none = { raw: 1000, gzip: 400, brotli: 300, wasm: null, css: null };
		const with_both = {
			...with_none,
			wasm: { raw: 5000, gzip: 2000, brotli: 1500 },
			css: { raw: 100, gzip: 50, brotli: 40 }
		};
		const to_loaded = (entry: BenchBundleSizes): MatrixEntry =>
			to_bundle_loaded_entry({ bundle: { lib: { docs: entry } } }, 'lib', docs, 'gzip');
		const none = to_loaded(with_none);
		assert.ok(none.kind === 'value');
		assert.strictEqual(none.value, 400);
		assert.include(none.details.join('\n'), 'no wasm binary');
		const both = to_loaded(with_both);
		assert.ok(both.kind === 'value');
		assert.strictEqual(both.value, 400 + 2000 + 50);
	});

	test('the real data has a library with a wasm binary and one with no stylesheet', () => {
		assert.ok(libraries.some((id) => sizes(id, 'docs').wasm !== null));
		assert.ok(libraries.some((id) => sizes(id, 'docs').css === null));
	});

	test('is unsupported for a set the library lacks a language of, and unmeasured with no sizes', () => {
		const all = results.sets.find((set) => set.id === 'all')!;
		assert.deepStrictEqual(to_bundle_loaded_entry(results, PARTIAL, all, 'gzip'), {
			kind: 'unsupported',
			langs: [LACKED]
		});
		assert.deepStrictEqual(to_bundle_loaded_entry({ bundle: {} }, FULL, docs, 'gzip'), {
			kind: 'unmeasured'
		});
	});
});

describe('to_bundle_beside_group', () => {
	const group = to_bundle_beside_group(results, { set: 'docs', compression: 'gzip' });
	const [wasm, css, schemes] = group.rows;

	test('its note is true wherever the group is shown, under a row that includes it too', () => {
		assert.strictEqual(group.note, 'each on its own');
	});

	test('the wasm binary and the stylesheet are their own rows, outside the JS', () => {
		assert.strictEqual(
			matrix_row_value(wasm!, 'shiki_wasm'),
			sizes('shiki_wasm', 'docs').wasm!.gzip
		);
		assert.deepStrictEqual(matrix_row_entry(wasm!, FULL), { kind: 'none', text: 'none' });
		assert.strictEqual(matrix_row_value(css!, FULL), sizes(FULL, 'docs').css!.gzip);
	});

	test('a library with inline styles has no stylesheet, and that is said, not shown as zero', () => {
		const entry = matrix_row_entry(css!, 'shiki_js');
		assert.ok(entry.kind === 'none');
		assert.include(entry.text, 'inline styles');
	});

	test('the color schemes a theme covers are beside its size', () => {
		for (const library of results.meta.libraries) {
			assert.deepStrictEqual(matrix_row_entry(schemes!, library.id), {
				kind: 'none',
				text: library.theme_schemes.join(' + ')
			});
		}
	});

	test('falls back to the core set for a library the selected set does not support', () => {
		const beside = to_bundle_beside_group(results, { set: 'all', compression: 'gzip' });
		assert.strictEqual(
			matrix_row_value(beside.rows[1]!, PARTIAL),
			sizes(PARTIAL, 'core').css!.gzip
		);
	});
});

describe('to_install_group', () => {
	test('has a row for each number of the footprint, for every library', () => {
		const group = to_install_group(results)!;
		assert.deepStrictEqual(
			group.rows.map((row) => row.key),
			INSTALL_MEASURES.map((measure) => `install:${measure.id}`)
		);
		for (const [i, measure] of INSTALL_MEASURES.entries()) {
			const row = group.rows[i]!;
			assert.strictEqual(row.unit, measure.unit);
			for (const id of libraries) {
				assert.strictEqual(matrix_row_value(row, id), results.install[id]![measure.id]);
			}
		}
	});

	test('is null for a file with no footprints', () => {
		assert.strictEqual(to_install_group({ ...results, install: {} }), null);
	});
});
