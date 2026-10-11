import { assert, describe, test } from 'vitest';
import { readFileSync } from 'node:fs';

import {
	BENCH_ANCHOR_STABLE_BELOW,
	BenchInput,
	BenchResults,
	bench_results_find_gaps,
	bench_results_find_startup_gaps,
	bench_results_is_publishable,
	bench_run_is_complete,
	parse_bench_results,
	to_bench_cell_id,
	type BenchStartupKey,
	to_max_compressed_bytes
} from '#lib/results_schema.ts';

const FIXTURE_URL = new URL('./fixtures/results/fixture_run.json', import.meta.url);

const fixture_text = readFileSync(FIXTURE_URL, 'utf8');

/** A fresh, mutable copy of the fixture run. */
const load_fixture = (): BenchResults => JSON.parse(fixture_text);

/** Asserts that parsing fails with an issue whose message includes `expected`. */
const assert_rejects = (data: unknown, expected: string): void => {
	const parsed = BenchResults.safeParse(data);
	assert.ok(!parsed.success, 'expected the parse to fail');
	const messages = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
	assert.ok(
		messages.some((m) => m.includes(expected)),
		`expected an issue including "${expected}", got:\n${messages.join('\n')}`
	);
};

const EXCLUDED_CELL = 'shiki/rust/rust.sample:tokenize';

/** The per-library sections of a cell. */
const SECTIONS = ['values', 'tokens', 'output', 'compressed'] as const;

/** The deterministic section a cell states: `tokens` on a tokenize cell, `output` on an html one. */
const to_stated = (cell: BenchResults['cells'][number]): 'tokens' | 'output' =>
	cell.mode === 'tokenize' ? 'tokens' : 'output';

/** The sections of a cell that hold numbers: its values, and the deterministic one it states. */
const to_filled = (cell: BenchResults['cells'][number]): Array<(typeof SECTIONS)[number]> => [
	'values',
	to_stated(cell)
];

/** Removes every cell value, and the process noise taken from them. */
const clear_values = (data: BenchResults): void => {
	for (const cell of data.cells) cell.values = {};
	data.meta.process_noise = null;
};

/**
 * Recounts the process noise's pairs after values were removed, so a test of
 * another rule isn't refused for the count. The figures are left as they were.
 */
const fit_process_noise = (data: BenchResults): BenchResults => {
	const noise = data.meta.process_noise;
	if (noise) {
		const passes = data.meta.run!.passes;
		const values = data.cells.reduce((n, cell) => n + Object.keys(cell.values).length, 0);
		noise.pairs = (values * passes * (passes - 1)) / 2;
	}
	return data;
};

/**
 * Removes the sizes of the deterministic pass, which come together: the bundle
 * sizes and what they were built with, the install footprints, the retained
 * heaps, and the HTML's compressed sizes.
 */
const clear_bundle = (data: BenchResults): void => {
	data.bundle = {};
	data.install = {};
	data.heap = {};
	data.meta.bundler = null;
	for (const cell of data.cells) cell.compressed = {};
};

/** Removes the cold start: its entries and its exclusions. */
const clear_startup = (data: BenchResults): void => {
	data.startup = [];
	data.meta.startup_excluded = [];
};

/** Removes the cold start, and how it was sampled: what a run that measured none records. */
const clear_startup_run = (data: BenchResults): void => {
	clear_startup(data);
	const run = data.meta.run!;
	run.startup_samples = run.startup_discard = run.startup_compile_cache = null;
};

/** Marks the fixture as a smoke run, which is neither retried nor resumed nor carries a floor. */
const to_smoke = (data: BenchResults): BenchResults => {
	const run = data.meta.run!;
	run.kind = 'smoke';
	run.retries = 0;
	run.segments = 1;
	data.meta.noise_floor = null;
	for (const cell of data.cells) {
		for (const value of Object.values(cell.values)) value.attempts = 1;
	}
	return data;
};

describe('round trip', () => {
	test('the fixture parses and serializes back to itself', () => {
		const parsed = BenchResults.parse(JSON.parse(fixture_text));
		assert.strictEqual(JSON.stringify(parsed, null, '\t') + '\n', fixture_text);
	});

	test('parse_bench_results returns the same data', () => {
		assert.deepStrictEqual(parse_bench_results(load_fixture()), load_fixture());
	});

	test('parse_bench_results throws one readable error', () => {
		const data = load_fixture();
		(data.meta as any).node = 24;
		assert.throws(() => parse_bench_results(data), /invalid bench results/);
	});
});

describe('sections later filled', () => {
	test('startup, bundle, cells, inputs, and excluded can be empty', () => {
		const data = load_fixture();
		clear_startup(data);
		clear_bundle(data);
		data.cells = [];
		data.inputs = [];
		data.meta.excluded = [];
		data.meta.process_noise = null;
		BenchResults.parse(data);
	});

	test('every value has a median for each pass', () => {
		const data = load_fixture();
		const value = Object.values(data.cells[0]!.values)[0]!;
		value.pass_medians_ns.pop();
		assert_rejects(data, "a median for each of the run's 3 passes");
	});

	test('the process noise is there exactly when a value has two passes', () => {
		const data = load_fixture();
		data.meta.process_noise = null;
		assert_rejects(data, 'process noise is set exactly when');
		const one_pass = to_smoke(load_fixture());
		one_pass.meta.run!.passes = 1;
		for (const cell of one_pass.cells) {
			for (const value of Object.values(cell.values)) value.pass_medians_ns = [value.ns_per_op];
		}
		assert_rejects(one_pass, 'process noise is set exactly when');
		one_pass.meta.process_noise = null;
		BenchResults.parse(one_pass);
	});

	test('the process noise is ordered and has a pair', () => {
		const data = load_fixture();
		data.meta.process_noise!.median = data.meta.process_noise!.p95 + 0.01;
		assert_rejects(data, 'the median is at most the 95th percentile');
		const data2 = load_fixture();
		data2.meta.process_noise!.max = data2.meta.process_noise!.p95 / 2;
		assert_rejects(data2, 'the median is at most the 95th percentile');
		const data3 = load_fixture();
		data3.meta.process_noise!.pairs = 0;
		assert_rejects(data3, 'process_noise.pairs');
	});

	test('the process noise counts every pair of passes of every value', () => {
		const data = load_fixture();
		const values = data.cells.reduce((n, cell) => n + Object.keys(cell.values).length, 0);
		// three passes give three pairs a value
		assert.strictEqual(data.meta.process_noise!.pairs, values * 3);
		data.meta.process_noise!.pairs += 1;
		assert_rejects(data, `meta.process_noise.pairs: ${values * 3} pairs`);
		// a value removed is three pairs fewer
		const data2 = load_fixture();
		const [cell] = data2.cells;
		const [library] = Object.keys(cell!.values);
		delete cell!.values[library!];
		assert_rejects(data2, `meta.process_noise.pairs: ${(values - 1) * 3} pairs`);
	});

	test('the noise floor is null until calibrated', () => {
		const data = load_fixture();
		data.meta.noise_floor = null;
		BenchResults.parse(data);
	});

	test('a cell can carry deterministic numbers without timed ones', () => {
		const data = load_fixture();
		clear_values(data);
		BenchResults.parse(data);
	});
});

describe('strictness', () => {
	test('rejects an unknown key at the top level', () => {
		assert_rejects({ ...load_fixture(), extra: 1 }, 'Unrecognized key');
	});

	test('rejects an unknown key in a nested object', () => {
		const data = load_fixture();
		(data.meta.machine as any).os = 'linux';
		assert_rejects(data, 'Unrecognized key');
		const data2 = load_fixture();
		(data2.cells[0]!.values.fuz_code as any).mean = 1;
		assert_rejects(data2, 'Unrecognized key');
	});

	test('rejects a missing section', () => {
		const { startup: _, ...data } = load_fixture();
		assert_rejects(data, 'startup');
	});

	test('rejects an unknown version', () => {
		const data = load_fixture();
		data.meta.libraries[0]!.version = 'unknown';
		assert_rejects(data, 'which version');
	});

	test('rejects a zero token count', () => {
		const data = load_fixture();
		data.cells[0]!.tokens.fuz_code = 0;
		assert_rejects(data, 'cells.0.tokens.fuz_code');
	});
});

describe('rosters', () => {
	test('rejects duplicate library, lang, set, and cell ids', () => {
		for (const [key, kind] of [
			['langs', 'lang'],
			['sets', 'set'],
			['cells', 'cell']
		] as const) {
			const data = load_fixture();
			(data[key] as Array<unknown>).push(data[key][0]);
			assert_rejects(data, `duplicate ${kind} id`);
		}
		const data = load_fixture();
		data.meta.libraries.push(data.meta.libraries[0]!);
		assert_rejects(data, 'duplicate library id');
	});

	test('rejects a cell value for a library not in the roster', () => {
		for (const section of to_filled(load_fixture().cells[0]!)) {
			const data = load_fixture();
			const cell = data.cells[0]!;
			(cell[section] as Record<string, unknown>).highlight_js = cell[section].fuz_code;
			assert_rejects(data, 'unknown library "highlight_js"');
		}
	});

	test('rejects a set, cell, or coverage entry naming an unknown lang', () => {
		const data = load_fixture();
		data.sets[0]!.langs.push('tsx');
		assert_rejects(data, 'unknown lang "tsx"');
		const data2 = load_fixture();
		data2.cells[0]!.lang = 'tsx';
		assert_rejects(data2, 'unknown lang "tsx"');
		// one issue for the cell, not another for every library with numbers in it
		const parsed = BenchResults.safeParse(data2);
		assert.ok(!parsed.success);
		assert.ok(parsed.error.issues.every((i) => !i.message.includes("doesn't claim")));
		const data4 = load_fixture();
		data4.cells.find((c) => c.id === EXCLUDED_CELL)!.lang = 'tsx';
		const parsed4 = BenchResults.safeParse(data4);
		assert.ok(!parsed4.success);
		assert.ok(parsed4.error.issues.every((i) => !i.message.includes('not excluded')));
		const data3 = load_fixture();
		data3.coverage.prism!.tsx = true;
		assert_rejects(data3, 'unknown lang "tsx"');
	});

	test('rejects a library without a coverage entry', () => {
		const data = load_fixture();
		delete data.coverage.prism;
		assert_rejects(data, 'library "prism" has no coverage entry');
	});

	test('rejects coverage and bundle entries for an unknown library', () => {
		const data = load_fixture();
		data.coverage.highlight_js = {};
		assert_rejects(data, 'unknown library "highlight_js"');
		const data2 = load_fixture();
		data2.bundle.highlight_js = {};
		assert_rejects(data2, 'unknown library "highlight_js"');
	});

	test('rejects a home source without its library, and the reverse', () => {
		const data = load_fixture();
		data.cells.find((c) => c.source === 'home')!.home = null;
		assert_rejects(data, 'home is set exactly when');
		const data2 = load_fixture();
		data2.cells.find((c) => c.source === 'neutral')!.home = 'fuz_code';
		assert_rejects(data2, 'home is set exactly when');
	});

	test('rejects startup entries that disagree with the rosters', () => {
		const data = load_fixture();
		data.startup.find((s) => s.scenario === 'bare')!.library = 'prism';
		assert_rejects(data, 'library is null exactly for the bare scenario');
		const data2 = load_fixture();
		data2.startup.find((s) => s.set !== null)!.set = 'everything';
		assert_rejects(data2, 'unknown set "everything"');
	});
});

describe('unsupported and excluded', () => {
	test('the fixture shows both, differently', () => {
		const data = load_fixture();
		// unsupported: no coverage entry, and a bundle entry naming the language
		assert.strictEqual(data.coverage.prism!.xml, undefined);
		assert.deepStrictEqual(data.bundle.prism!.web_rust, { unsupported: ['xml'] });
		// excluded: claimed in coverage, listed in meta, absent from the cell
		assert.strictEqual(data.coverage.prism!.rust, true);
		// in both of the input's cells: the check runs before either mode is timed
		assert.deepStrictEqual(
			data.meta.excluded.map((e) => [e.cell, e.library]),
			[
				[EXCLUDED_CELL, 'prism'],
				['shiki/rust/rust.sample:html', 'prism']
			]
		);
		const cell = data.cells.find((c) => c.id === EXCLUDED_CELL)!;
		assert.ok(!('prism' in cell.values));
		assert.ok('fuz_code' in cell.values);
	});

	test('rejects numbers for a language the library does not claim', () => {
		const data = load_fixture();
		const cell = data.cells[0]!;
		delete data.coverage.prism![cell.lang];
		assert_rejects(data, `library "prism" doesn't claim lang "${cell.lang}"`);
	});

	test('rejects numbers for a library excluded from the cell', () => {
		// in the tokenize cell and the html one, which state different sections
		for (const mode of ['tokenize', 'html'] as const) {
			const id = to_bench_cell_id('shiki/rust/rust.sample', mode);
			for (const section of to_filled(load_fixture().cells.find((c) => c.id === id)!)) {
				const data = load_fixture();
				const cell = data.cells.find((c) => c.id === id)!;
				(cell[section] as Record<string, unknown>).prism = cell[section].fuz_code;
				assert_rejects(data, 'library "prism" is excluded from this cell');
			}
		}
	});

	test('rejects an excluded entry for an unclaimed language', () => {
		const data = load_fixture();
		delete data.coverage.prism!.rust;
		assert_rejects(data, 'so it is unsupported there, not excluded');
	});

	test('rejects an excluded entry naming an unknown cell or library', () => {
		const data = load_fixture();
		data.meta.excluded[0]!.cell = 'nope';
		assert_rejects(data, 'unknown cell "nope"');
		const data2 = load_fixture();
		data2.meta.excluded[0]!.library = 'highlight_js';
		assert_rejects(data2, 'unknown library "highlight_js"');
	});

	test('rejects a duplicate excluded entry', () => {
		const data = load_fixture();
		data.meta.excluded.push(data.meta.excluded[0]!);
		assert_rejects(data, 'duplicate excluded entry');
	});

	test('rejects bundle sizes for a set with an unclaimed language', () => {
		const data = load_fixture();
		data.bundle.prism!.web_rust = data.bundle.prism!.docs!;
		assert_rejects(data, `library "prism" has sizes but doesn't claim: xml`);
		// the set that needs the language is unsupported, and the ones that don't are measured
		assert.deepStrictEqual(load_fixture().bundle.prism!['single:xml'], { unsupported: ['xml'] });
		assert.ok('raw' in load_fixture().bundle.prism!['single:ts']!);
	});

	test('rejects an unsupported bundle entry that misnames the missing languages', () => {
		const data = load_fixture();
		data.bundle.prism!.web_rust = { unsupported: ['rust'] };
		assert_rejects(data, 'expected the langs of set "web_rust"');
		const data2 = load_fixture();
		data2.bundle.fuz_code!.docs = { unsupported: ['xml'] };
		assert_rejects(data2, 'expected the langs of set "docs"');
	});

	test('rejects a bundle entry that is both or neither shape', () => {
		const data = load_fixture();
		data.bundle.prism!.docs = { ...data.bundle.prism!.docs!, unsupported: ['xml'] };
		assert.ok(!BenchResults.safeParse(data).success);
		const data2 = load_fixture();
		data2.bundle.prism!.docs = { unsupported: [] };
		assert.ok(!BenchResults.safeParse(data2).success);
	});

	test('rejects a bundle entry for an unknown set', () => {
		const data = load_fixture();
		data.bundle.prism!.everything = data.bundle.prism!.docs!;
		assert_rejects(data, 'unknown set "everything"');
	});
});

/** The fixture with every timed number removed. */
const load_deterministic_fixture = (): BenchResults => {
	const data = load_fixture();
	clear_values(data);
	clear_startup(data);
	return data;
};

describe('anchor', () => {
	test('a deterministic-only run parses with a null anchor', () => {
		const data = load_deterministic_fixture();
		data.meta.anchor = null;
		BenchResults.parse(data);
	});

	test('rejects a null anchor when a cell has timed values', () => {
		const data = load_fixture();
		data.startup = [];
		data.meta.anchor = null;
		assert_rejects(data, 'a run with timed numbers needs an anchor');
	});

	test('rejects a null anchor when startup was measured', () => {
		const data = load_fixture();
		clear_values(data);
		data.meta.anchor = null;
		assert_rejects(data, 'a run with timed numbers needs an anchor');
	});
});

describe('run', () => {
	test('a run records that only a minor collection came before each batch', () => {
		// a file measured with a forced full collection per round never parses, so it is never carried
		const data = load_fixture();
		delete (data.meta.run as any).collection;
		assert_rejects(data, 'meta.run.collection');
		(data.meta.run as any).collection = 'full';
		assert_rejects(data, 'meta.run.collection');
	});

	test('a run with timed numbers records how they were measured', () => {
		const data = load_fixture();
		data.meta.run = null;
		assert_rejects(data, 'a run with timed numbers records how they were measured');
		// cold start alone is timed too, and its samples are among the parameters
		const data2 = load_fixture();
		clear_values(data2);
		data2.meta.run = null;
		assert_rejects(data2, 'a run with timed numbers records how they were measured');
	});

	test('a run that timed nothing needs no run parameters', () => {
		const data = load_deterministic_fixture();
		data.meta.run = null;
		data.meta.anchor = null;
		BenchResults.parse(data);
	});

	test('the kinds of run are told apart', () => {
		for (const kind of ['full', 'calibrate'] as const) {
			const data = load_fixture();
			data.meta.run!.kind = kind;
			// a calibration measures the cells only
			if (kind === 'calibrate') clear_startup_run(data);
			BenchResults.parse(data);
		}
		const data = load_fixture();
		(data.meta.run as any).kind = 'partial';
		assert_rejects(data, 'meta.run.kind');
	});

	test('a smoke run carries no noise floor', () => {
		const data = to_smoke(load_fixture());
		BenchResults.parse(data);
		data.meta.noise_floor = load_fixture().meta.noise_floor;
		assert_rejects(data, 'meta.noise_floor: a smoke run carries no noise floor');
	});

	test('a smoke run is neither retried nor resumed', () => {
		for (const key of ['retries', 'segments'] as const) {
			const data = to_smoke(load_fixture());
			data.meta.run![key] = 2;
			assert_rejects(data, 'meta.run: a smoke run is neither retried nor resumed');
		}
	});

	test('a run records its retries and segments, and a value its attempts', () => {
		const data = load_fixture();
		assert.strictEqual(data.meta.run!.segments, 1);
		data.meta.run!.segments = 3;
		BenchResults.parse(data);
		for (const [key, value] of [
			['segments', 0],
			['retries', -1],
			['retries', 1.5]
		] as const) {
			const data2 = load_fixture();
			data2.meta.run![key] = value;
			assert_rejects(data2, `meta.run.${key}`);
		}
		// the fixture has a value that was measured again
		const retried = data.cells
			.flatMap((c) => Object.values(c.values))
			.filter((v) => v.attempts > 1);
		assert.ok(retried.length > 0);
		const data3 = load_fixture();
		data3.cells[0]!.values.fuz_code!.attempts = 0;
		assert_rejects(data3, 'cells.0.values.fuz_code.attempts');
		// no more attempts than the retries allow
		const data4 = load_fixture();
		data4.cells[0]!.values.fuz_code!.attempts = data4.meta.run!.retries + 2;
		assert_rejects(data4, 'cells.0.values.fuz_code.attempts: more attempts than');
		data4.cells[0]!.values.fuz_code!.attempts = data4.meta.run!.retries + 1;
		BenchResults.parse(data4);
	});

	/** The fixture narrowed to one of its cells, with the filters that describe exactly that. */
	const load_filtered_fixture = (): BenchResults => {
		const data = load_fixture();
		const cell = data.cells[0]!;
		const libraries = Object.keys(cell.values);
		data.cells = [cell];
		data.meta.excluded = [];
		clear_startup_run(data);
		clear_bundle(data);
		data.meta.libraries = data.meta.libraries.filter((l) => libraries.includes(l.id));
		data.coverage = Object.fromEntries(
			data.meta.libraries.map((l) => [l.id, data.coverage[l.id]!])
		);
		data.meta.run!.filters = {
			libraries: data.meta.libraries.map((l) => l.id),
			langs: [cell.lang],
			sizes: [cell.size],
			modes: [cell.mode],
			sources: [cell.source],
			metrics: ['throughput']
		};
		return fit_process_noise(data);
	};

	test('filters are null, or describe what the file holds', () => {
		BenchResults.parse(load_filtered_fixture());
	});

	test('rejects a cell outside a filter', () => {
		for (const [key, value] of [
			['langs', 'rust'],
			['sizes', 'micro'],
			['modes', 'html'],
			['sources', 'shiki']
		] as const) {
			const data = load_filtered_fixture();
			const inside = (data.meta.run!.filters[key] as Array<string>)[0]!;
			assert.notStrictEqual(inside, value);
			(data.meta.run!.filters as any)[key] = [value];
			assert_rejects(data, `cells.0: "${inside}" is outside the run's ${key} filter`);
		}
	});

	test('a run filtered by library lists exactly those libraries', () => {
		const message = 'a run filtered by library lists exactly those libraries';
		const data = load_filtered_fixture();
		data.meta.run!.filters.libraries!.pop();
		assert_rejects(data, message);
		const data2 = load_filtered_fixture();
		data2.meta.run!.filters.libraries = ['highlight_js'];
		assert_rejects(data2, message);
		const data3 = load_filtered_fixture();
		data3.meta.run!.filters.libraries!.reverse();
		assert_rejects(data3, message);
		// the fixture's own roster, named in full, is a filter too
		const data4 = load_fixture();
		data4.meta.run!.filters.libraries = data4.meta.libraries.map((l) => l.id);
		BenchResults.parse(data4);
	});

	test('rejects a filter that is empty, misnamed, or repeats an id', () => {
		const data = load_filtered_fixture();
		data.meta.run!.filters.langs = ['tsx'];
		assert_rejects(data, 'meta.run.filters.langs.0: unknown lang "tsx"');
		for (const key of ['libraries', 'langs', 'sizes', 'modes', 'sources'] as const) {
			const data2 = load_filtered_fixture();
			(data2.meta.run!.filters as any)[key] = [];
			assert_rejects(data2, `meta.run.filters.${key}`);
			const data3 = load_filtered_fixture();
			(data3.meta.run!.filters as any)[key] = ['nope!'];
			assert_rejects(data3, `meta.run.filters.${key}`);
			const data4 = load_filtered_fixture();
			const filter = data4.meta.run!.filters[key] as Array<string>;
			filter.push(filter[0]!);
			assert_rejects(
				data4,
				`meta.run.filters.${key}.${filter.length - 1}: duplicate "${filter[0]}" in the filter`
			);
		}
	});

	test('what is publishable is a complete, steady, clean full run', () => {
		assert.ok(bench_results_is_publishable(load_fixture()));
		assert.ok(bench_run_is_complete(load_fixture().meta.run!));
		const changes: Array<(data: BenchResults) => void> = [
			(data) => (data.meta.run = null),
			(data) => (data.meta.run!.kind = 'calibrate'),
			(data) => to_smoke(data),
			(data) => (data.meta.run!.filters.sizes = ['medium']),
			(data) => (data.meta.run!.filters.libraries = data.meta.libraries.map((l) => l.id)),
			(data) => (data.meta.anchor = { drift: 0.5, stable: false }),
			(data) => (data.meta.anchor = null),
			(data) => (data.meta.commit += '-dirty')
		];
		for (const [i, change] of changes.entries()) {
			const data = load_fixture();
			change(data);
			assert.ok(!bench_results_is_publishable(data), `change ${i}`);
		}
		assert.ok(!bench_run_is_complete(load_filtered_fixture().meta.run!));
		// a run that was stopped and resumed is a result like any other
		const resumed = load_fixture();
		resumed.meta.run!.segments = 2;
		assert.ok(bench_results_is_publishable(BenchResults.parse(resumed)));
	});

	/** Removes a library's numbers from a cell. */
	const remove_library = (data: BenchResults, cell_id: string, library: string): void => {
		const cell = data.cells.find((c) => c.id === cell_id)!;
		for (const section of SECTIONS) delete cell[section][library];
		fit_process_noise(data);
	};

	test('a run with no filters has every claiming library in every cell, or excludes it', () => {
		const cell_id = 'neutral/ts/checker_excerpt.ts:html';
		const message =
			'library "prism" claims lang "ts" and has neither a value nor an excluded entry here';
		for (const kind of ['full', 'calibrate'] as const) {
			const data = load_fixture();
			data.meta.run!.kind = kind;
			if (kind === 'calibrate') clear_startup_run(data);
			remove_library(data, cell_id, 'prism');
			assert_rejects(data, `cells.1.values: ${message}`);
			// the predicate says so of a file that was never parsed too
			assert.ok(!bench_results_is_publishable(data));
			assert.deepStrictEqual(bench_results_find_gaps(data), [
				{ path: ['cells', 1, 'values'], message }
			]);
			// excluded there, it is accounted for
			data.meta.excluded.push({ cell: cell_id, library: 'prism', reason: 'produced no tokens' });
			BenchResults.parse(data);
			assert.strictEqual(bench_results_is_publishable(data), kind === 'full');
		}
	});

	test('a library that does not claim the language is not a gap: it is unsupported', () => {
		const data = load_fixture();
		for (const cell of data.cells.filter((c) => c.lang === 'rust')) {
			remove_library(data, cell.id, 'twinkleplop');
		}
		delete data.coverage.twinkleplop!.rust;
		clear_bundle(data);
		// and so are the cold-start scenarios that load it
		data.startup = data.startup.filter((s) => !(s.library === 'twinkleplop' && s.lang === 'rust'));
		assert.deepStrictEqual(bench_results_find_startup_gaps(data), []);
		assert.ok(bench_results_is_publishable(BenchResults.parse(data)));
	});

	test('a run with no filters has a cell for every listed input in every mode', () => {
		const data = load_fixture();
		const [removed] = data.cells.splice(1, 1);
		assert.strictEqual(removed!.mode, 'html');
		assert_rejects(data, `inputs.0: input "${removed!.file}" has no html cell`);
		assert.ok(!bench_results_is_publishable(data));
	});

	test('the modes a run must cover are the ones its cells use, not a list of the schema', () => {
		// a whole mode missing can't be seen from the file, like an input missing altogether
		const data = load_fixture();
		data.cells = data.cells.filter((c) => c.mode === 'tokenize');
		fit_process_noise(data);
		data.meta.excluded = data.meta.excluded.filter((e) => e.cell.endsWith(':tokenize'));
		assert.deepStrictEqual(bench_results_find_gaps(data), []);
		BenchResults.parse(data);
	});

	test('a filtered or smoke run, and one that timed no cell, may have gaps', () => {
		const filtered = load_filtered_fixture();
		assert.ok(bench_results_find_gaps(filtered).length > 0);
		BenchResults.parse(filtered);
		const smoke = to_smoke(load_fixture());
		remove_library(smoke, 'neutral/ts/checker_excerpt.ts:html', 'prism');
		BenchResults.parse(smoke);
		const untimed = load_fixture();
		clear_values(untimed);
		BenchResults.parse(untimed);
	});

	test('rejects parameters that are not positive', () => {
		for (const key of ['passes', 'rounds', 'target_ms'] as const) {
			const data = load_fixture();
			data.meta.run![key] = 0;
			assert_rejects(data, `meta.run.${key}`);
		}
		const data = load_fixture();
		data.meta.run!.rounds = 1.5;
		assert_rejects(data, 'meta.run.rounds');
	});

	test('the commit is a full hash, marked when the tree was dirty', () => {
		const data = load_fixture();
		data.meta.commit = `${data.meta.commit}-dirty`;
		BenchResults.parse(data);
		for (const commit of ['abc123', 'main', `${'0'.repeat(40)}-changed`, `${'0'.repeat(40)} `]) {
			const data2 = load_fixture();
			data2.meta.commit = commit;
			assert_rejects(data2, 'meta.commit');
		}
	});
});

describe('startup', () => {
	const find_startup = (data: BenchResults, scenario: string) =>
		data.startup.find((s) => s.scenario === scenario)!;

	/** What names a scenario, without its numbers or its reason. */
	const to_scenario = ({ scenario, library, lang, set, bundled }: BenchStartupKey) => ({
		scenario,
		library,
		lang,
		set,
		bundled
	});
	const to_key = (entry: BenchStartupKey): string => JSON.stringify(to_scenario(entry));

	test('rejects an unknown library or lang', () => {
		const data = load_fixture();
		const core = find_startup(data, 'core');
		core.library = 'highlight_js';
		assert_rejects(
			data,
			`startup.${data.startup.indexOf(core)}.library: unknown library "highlight_js"`
		);
		const data2 = load_fixture();
		const lang = find_startup(data2, 'lang');
		lang.lang = 'tsx';
		assert_rejects(data2, `startup.${data2.startup.indexOf(lang)}.lang: unknown lang "tsx"`);
	});

	test('rejects a lang on a scenario that loads none, and a missing one', () => {
		for (const scenario of ['bare', 'core', 'set']) {
			const data = load_fixture();
			find_startup(data, scenario).lang = 'ts';
			assert_rejects(data, 'lang is set exactly for');
		}
		for (const scenario of ['lang', 'first_highlight']) {
			const data = load_fixture();
			find_startup(data, scenario).lang = null;
			assert_rejects(data, 'lang is set exactly for');
		}
	});

	test('rejects a set on a scenario that loads none, and a missing one', () => {
		for (const scenario of ['bare', 'core', 'lang', 'first_highlight']) {
			const data = load_fixture();
			find_startup(data, scenario).set = 'docs';
			assert_rejects(data, 'set is set exactly for the set scenario');
		}
		const data = load_fixture();
		find_startup(data, 'set').set = null;
		assert_rejects(data, 'set is set exactly for the set scenario');
	});

	test('rejects a missing library outside the bare scenario', () => {
		const data = load_fixture();
		find_startup(data, 'core').library = null;
		assert_rejects(data, 'library is null exactly for the bare scenario');
	});

	test('rejects a bundled bare scenario', () => {
		const data = load_fixture();
		find_startup(data, 'bare').bundled = true;
		assert_rejects(data, 'the bare scenario loads nothing to bundle');
	});

	test('rejects a lang the library does not claim', () => {
		const data = load_fixture();
		const entry = find_startup(data, 'lang');
		delete data.coverage[entry.library!]![entry.lang!];
		// drop the cells so only the startup entry refers to the language
		data.cells = [];
		data.meta.excluded = [];
		clear_bundle(data);
		assert_rejects(data, `library "${entry.library}" doesn't claim lang "${entry.lang}"`);
	});

	test('rejects a set with a lang the library does not claim', () => {
		const data = load_fixture();
		const entry = data.startup.find((s) => s.scenario === 'set' && s.library === 'twinkleplop')!;
		entry.set = 'web_rust';
		assert_rejects(data, `doesn't claim every lang of set "web_rust": xml`);
	});

	test('a set may hold an untimed lang, and a scenario of one language may not be one', () => {
		// fuz_code claims xml, which no cell covers: a set that holds it can still be started cold
		const data = load_fixture();
		const set_entries = data.startup.filter(
			(s) => s.scenario === 'set' && s.library === 'fuz_code'
		);
		assert.strictEqual(set_entries.length, 2);
		data.startup.push(...set_entries.map((entry) => ({ ...entry, set: 'web_rust' })));
		BenchResults.parse(data);
		for (const scenario of ['lang', 'first_highlight']) {
			const data2 = load_fixture();
			const entry = data2.startup.find((s) => s.scenario === scenario && s.library === 'fuz_code')!;
			entry.lang = 'xml';
			assert_rejects(data2, 'lang "xml" is not timed, so no cold-start scenario loads it alone');
		}
	});

	test('every entry keeps the samples the run says, and orders its percentiles', () => {
		const data = load_fixture();
		find_startup(data, 'core').samples = data.meta.run!.startup_samples! - 1;
		assert_rejects(data, `samples: every scenario keeps the run's 20 samples`);
		const data2 = load_fixture();
		const entry = find_startup(data2, 'core');
		entry.p10_ms = entry.p90_ms + 1;
		assert_rejects(data2, 'the median is between the 10th and the 90th percentile');
		for (const [key, factor] of [
			['p10_ms', 1.01],
			['p90_ms', 0.99]
		] as const) {
			const data5 = load_fixture();
			const own = find_startup(data5, 'core');
			own[key] = own.median_ms * factor;
			assert_rejects(data5, 'median_ms: the median is between the 10th and the 90th percentile');
		}
		for (const key of ['median_ms', 'rss_peak_bytes', 'samples'] as const) {
			const data3 = load_fixture();
			find_startup(data3, 'core')[key] = 0;
			assert_rejects(data3, key);
		}
		const data4 = load_fixture();
		find_startup(data4, 'core').spread = 0.9;
		assert_rejects(data4, 'spread');
	});

	test('the run says how cold start was sampled', () => {
		for (const key of ['startup_samples', 'startup_discard', 'startup_compile_cache'] as const) {
			const data = load_fixture();
			delete (data.meta.run as any)[key];
			assert_rejects(data, `meta.run.${key}`);
		}
		const data = load_fixture();
		(data.meta.run as any).startup_compile_cache = 'enabled';
		assert_rejects(data, 'meta.run.startup_compile_cache');
		const data2 = load_fixture();
		data2.meta.run!.startup_samples = 0;
		assert_rejects(data2, 'meta.run.startup_samples');
	});

	test('how cold start was sampled is recorded exactly when the run measured any', () => {
		const KEYS = ['startup_samples', 'startup_discard', 'startup_compile_cache'] as const;
		// a run that measures cold start says how
		for (const key of KEYS) {
			const data = load_fixture();
			data.meta.run![key] = null;
			assert_rejects(
				data,
				`meta.run.${key}: ${key} is set exactly when the run measures cold start`
			);
		}
		// a calibration, and a run that left cold start out, sampled nothing
		const to_cells_only = [
			(data: BenchResults) => (data.meta.run!.kind = 'calibrate'),
			(data: BenchResults) => (data.meta.run!.filters.metrics = ['throughput'])
		];
		for (const change of to_cells_only) {
			const data = load_fixture();
			clear_startup_run(data);
			change(data);
			BenchResults.parse(data);
			for (const key of KEYS) {
				const data2 = load_fixture();
				clear_startup(data2);
				change(data2);
				const run = data2.meta.run!;
				for (const other of KEYS) if (other !== key) (run[other] as unknown) = null;
				assert_rejects(data2, `meta.run.${key}: ${key} is set exactly when`);
			}
		}
	});

	test('excluded is an entry with a reason, and never beside a number', () => {
		const data = load_fixture();
		assert.ok(data.meta.startup_excluded.length > 0);
		const [excluded] = data.meta.startup_excluded;
		assert.ok(!data.startup.some((s) => to_key(s) === to_key(excluded!)));
		// measured and excluded at once
		data.startup.push({ ...find_startup(data, 'core'), ...to_scenario(excluded!) });
		assert_rejects(data, 'meta.startup_excluded.0: duplicate startup entry');
		// the shape rules are the entries'
		const data2 = load_fixture();
		data2.meta.startup_excluded[0]!.lang = null;
		assert_rejects(data2, 'meta.startup_excluded.0.lang: lang is set exactly for');
		const data3 = load_fixture();
		delete data3.coverage.prism!.rust;
		for (const cell of data3.cells) for (const section of SECTIONS) delete cell[section].prism;
		data3.meta.excluded = [];
		clear_bundle(data3);
		data3.startup = data3.startup.filter((s) => !(s.library === 'prism' && s.lang === 'rust'));
		assert_rejects(data3, `library "prism" doesn't claim lang "rust"`);
		// the baseline loads no library, so nothing can exclude it
		const data4 = load_fixture();
		(data4.meta.startup_excluded[0] as any).library = null;
		assert_rejects(data4, 'meta.startup_excluded.0.library');
		const data5 = load_fixture();
		(data5.meta.startup_excluded[0] as any).reason = '';
		assert_rejects(data5, 'meta.startup_excluded.0.reason');
	});

	test('a full run with no filters has every scenario it implies, or excludes it', () => {
		const data = load_fixture();
		assert.deepStrictEqual(bench_results_find_startup_gaps(data), []);
		const index = data.startup.findIndex(
			(s) => s.scenario === 'lang' && s.library === 'prism' && s.lang === 'ts' && s.bundled
		);
		const [removed] = data.startup.splice(index, 1);
		const message =
			'library "prism" has neither an entry nor an excluded entry for the bundled lang scenario of lang "ts"';
		assert_rejects(data, `startup: ${message}`);
		assert.deepStrictEqual(bench_results_find_startup_gaps(data), [{ path: ['startup'], message }]);
		assert.ok(!bench_results_is_publishable(data));
		// excluded there, it is accounted for
		data.meta.startup_excluded.push({ ...to_scenario(removed!), library: 'prism', reason: 'x' });
		assert.ok(bench_results_is_publishable(BenchResults.parse(data)));
		// the baseline is implied too, and every form of every scenario
		const data2 = load_fixture();
		data2.startup.shift();
		assert_rejects(data2, 'the bare baseline has neither an entry nor an excluded entry');
		const data3 = load_fixture();
		data3.startup = data3.startup.filter((s) => !(s.scenario === 'set' && s.bundled));
		assert_rejects(
			data3,
			'library "fuz_code" has neither an entry nor an excluded entry for the bundled set scenario of set "docs"'
		);
		// with no cold start at all, a full run that timed its cells is not whole
		const data4 = load_fixture();
		clear_startup(data4);
		assert_rejects(data4, 'the bare baseline has neither an entry');
	});

	test('a filtered, smoke, or calibration run need not hold every scenario', () => {
		const smoke = to_smoke(load_fixture());
		smoke.startup.pop();
		BenchResults.parse(smoke);
		const filtered = load_fixture();
		filtered.meta.run!.filters.langs = ['ts'];
		filtered.cells = filtered.cells.filter((c) => c.lang === 'ts');
		fit_process_noise(filtered);
		filtered.inputs = filtered.inputs.filter((i) => i.lang === 'ts');
		filtered.meta.excluded = [];
		filtered.startup = filtered.startup.filter((s) => s.lang === null || s.lang === 'ts');
		filtered.meta.startup_excluded = [];
		filtered.startup.pop();
		BenchResults.parse(filtered);
	});

	test('the filters describe the cold start too', () => {
		const data = load_fixture();
		data.meta.run!.filters.langs = ['ts'];
		assert_rejects(data, `is outside the run's langs filter`);
		const data2 = load_fixture();
		data2.meta.run!.filters.metrics = ['throughput'];
		assert_rejects(data2, `startup: cold start is outside the run's metrics filter`);
		const data3 = load_fixture();
		data3.meta.run!.filters.metrics = ['startup'];
		assert_rejects(data3, `cells: timed cells are outside the run's metrics filter`);
		// cold start alone: the cells are not timed
		clear_values(data3);
		BenchResults.parse(data3);
		const data4 = load_fixture();
		data4.meta.run!.kind = 'calibrate';
		assert_rejects(data4, 'startup: a calibration measures no cold start');
	});

	test('rejects a duplicate entry', () => {
		const data = load_fixture();
		data.startup.push({ ...data.startup[1]!, median_ms: 1 });
		assert_rejects(data, 'duplicate startup entry');
	});

	test('holds the same scenario bundled and unbundled', () => {
		const data = load_fixture();
		const forms = data.startup
			.filter((s) => s.scenario === 'core' && s.library === 'fuz_code')
			.map((s) => s.bundled);
		assert.deepStrictEqual(forms, [false, true]);
	});
});

describe('cells', () => {
	test('home may name a library outside the roster', () => {
		const data = load_fixture();
		for (const cell of data.cells.filter((c) => c.source === 'home')) cell.home = 'highlight_js';
		data.inputs.find((i) => i.source === 'home')!.home = 'highlight_js';
		BenchResults.parse(data);
	});

	test('rejects a home that is not shaped like a library id', () => {
		const data = load_fixture();
		data.cells.find((c) => c.source === 'home')!.home = 'Highlight.js';
		assert_rejects(data, '.home: ');
	});

	test('rejects a cell for an untimed lang', () => {
		const data = load_fixture();
		const cell = data.cells[0]!;
		cell.lang = 'xml';
		cell.values = { fuz_code: cell.values.fuz_code! };
		cell.tokens = { fuz_code: cell.tokens.fuz_code! };
		assert_rejects(data, 'lang "xml" is not timed');
	});

	test('rejects two cells measuring the same input', () => {
		const data = load_fixture();
		data.cells.push({ ...data.cells[0]! });
		assert_rejects(data, 'duplicate cell');
		assert_rejects(data, 'duplicate cell id');
	});

	test('a cell is named after its file and mode', () => {
		const data = load_fixture();
		for (const cell of data.cells) {
			assert.strictEqual(cell.id, to_bench_cell_id(cell.file, cell.mode));
			assert.strictEqual(cell.id, `${cell.file}:${cell.mode}`);
		}
		const cell = data.cells[0]!;
		cell.id = 'another';
		assert_rejects(data, `cells.0.id: expected "${cell.file}:${cell.mode}"`);
	});

	test('accepts the same input in another mode', () => {
		const data = load_fixture();
		const cell = data.cells.find((c) => c.id === EXCLUDED_CELL)!;
		const other = data.cells.find((c) => c.id === to_bench_cell_id(cell.file, 'html'))!;
		assert.strictEqual(other.file, cell.file);
		assert.notStrictEqual(other.mode, cell.mode);
	});
});

describe('inputs', () => {
	test('rejects a cell whose file is not a listed input', () => {
		const data = load_fixture();
		data.inputs = data.inputs.filter((i) => i.file !== data.cells[0]!.file);
		assert_rejects(data, `unknown input "${data.cells[0]!.file}"`);
	});

	test('rejects a cell that describes its input differently', () => {
		for (const [key, value] of [
			['size', 'large'],
			['bytes', 1],
			['lines', 1],
			['synthetic', true],
			['source', 'shiki']
		] as const) {
			const data = load_fixture();
			(data.cells[0] as any)[key] = value;
			assert_rejects(data, `${key} disagrees with input`);
		}
	});

	test('an input no cell measured is allowed in a run that is not complete', () => {
		const data = load_fixture();
		data.cells = data.cells.filter((c) => c.file !== data.inputs[0]!.file);
		fit_process_noise(data);
		assert_rejects(data, 'has no tokenize cell');
		// any filter makes the run partial, and a partial run lists what it has
		data.meta.run!.filters.sizes = ['micro', 'small', 'medium', 'large'];
		BenchResults.parse(data);
	});

	test('rejects a duplicate input file', () => {
		const data = load_fixture();
		data.inputs.push({ ...data.inputs[0]! });
		assert_rejects(data, 'duplicate input file');
	});

	test('rejects an input naming an unknown lang', () => {
		const data = load_fixture();
		data.inputs.push({
			...data.inputs[0]!,
			file: 'neutral/tsx/other.tsx',
			lang: 'tsx'
		});
		assert_rejects(data, 'inputs.4.lang: unknown lang "tsx"');
	});

	test('a harness input has no provenance, and every other input has some', () => {
		const input: BenchInput = {
			file: 'harness/ts/snippet.ts',
			source: 'harness',
			home: null,
			lang: 'ts',
			size: 'micro',
			bytes: 100,
			lines: 5,
			sha256: 'a'.repeat(64),
			synthetic: false,
			provenance: [],
			derivation: null
		};
		BenchInput.parse(input);
		const pin = load_fixture().inputs[0]!.provenance[0]!;
		assert.ok(!BenchInput.safeParse({ ...input, provenance: [pin] }).success);
		assert.ok(!BenchInput.safeParse({ ...input, source: 'neutral' }).success);
		// a stress input may be written here too, or come from upstream
		BenchInput.parse({ ...input, file: 'stress/ts/a.ts', source: 'stress' });
		BenchInput.parse({
			...input,
			file: 'stress/ts/a.ts',
			source: 'stress',
			sha256: pin.sha256,
			provenance: [pin]
		});
	});

	test('a derived input differs from its one pin, names how, and is synthetic', () => {
		const input = load_fixture().inputs.find((i) => i.provenance.length === 1)!;
		const derived = {
			...input,
			file: 'stress/ts/a.min.ts',
			source: 'stress' as const,
			sha256: 'b'.repeat(64),
			synthetic: true,
			derivation: 'minified'
		};
		BenchInput.parse(derived);
		assert.ok(!BenchInput.safeParse({ ...derived, derivation: null }).success);
		assert.ok(!BenchInput.safeParse({ ...derived, synthetic: false }).success);
		assert.ok(!BenchInput.safeParse({ ...derived, provenance: [] }).success);
		assert.ok(!BenchInput.safeParse({ ...derived, derivation: '' }).success);
	});

	test('only a stress input is derived, and a written one is not synthetic', () => {
		const input = load_fixture().inputs.find((i) => i.provenance.length === 1)!;
		const derived = {
			...input,
			file: 'stress/ts/a.min.ts',
			source: 'stress' as const,
			sha256: 'b'.repeat(64),
			synthetic: true,
			derivation: 'minified'
		};
		BenchInput.parse(derived);
		const neutral = { ...derived, file: 'neutral/ts/a.min.ts', source: 'neutral' as const };
		assert.match(
			JSON.stringify(BenchInput.safeParse(neutral).error?.issues),
			/only a stress input is derived/
		);
		const written = { ...derived, provenance: [], derivation: null, synthetic: false };
		BenchInput.parse(written);
		assert.ok(!BenchInput.safeParse({ ...written, synthetic: true }).success);
	});

	test('one upstream file is a verbatim copy, and several make the input synthetic', () => {
		const input = load_fixture().inputs.find((i) => i.provenance.length === 1)!;
		const pin = input.provenance[0]!;
		BenchInput.parse(input);
		const changed = { ...input, provenance: [{ ...pin, sha256: 'b'.repeat(64) }] };
		assert.ok(!BenchInput.safeParse(changed).success);
		const joined = { ...changed, provenance: [...changed.provenance, pin] };
		assert.ok(!BenchInput.safeParse(joined).success);
		BenchInput.parse({ ...joined, synthetic: true });
	});

	test('rejects a home input without its library, and the reverse', () => {
		const data = load_fixture();
		const home = data.inputs.find((i) => i.source === 'home')!;
		assert.ok(!BenchInput.safeParse({ ...home, home: null }).success);
		const neutral = data.inputs.find((i) => i.source === 'neutral')!;
		assert.ok(!BenchInput.safeParse({ ...neutral, home: 'fuz_code' }).success);
	});

	test('rejects a pin that is not a full commit or hash', () => {
		const input = load_fixture().inputs[0]!;
		const pin = input.provenance[0]!;
		assert.ok(
			!BenchInput.safeParse({ ...input, provenance: [{ ...pin, commit: 'main' }] }).success
		);
		assert.ok(!BenchInput.safeParse({ ...input, sha256: 'abc' }).success);
	});

	test('a pin names an https repository and a path that stays inside it', () => {
		const input = load_fixture().inputs[0]!;
		const pin = input.provenance[0]!;
		const parses = (changed: Partial<typeof pin>): boolean =>
			BenchInput.safeParse({ ...input, provenance: [{ ...pin, ...changed }] }).success;
		assert.ok(parses({}));
		// the repository is rendered as a link, so nothing but https
		for (const repo of [
			'java' + 'script:alert(1)',
			'http://github.com/a/b',
			'git@github.com:a/b',
			'a/b',
			// only the host and a path: no userinfo, query, fragment, or trailing slash
			'https://user@github.com/a/b',
			'https://user:token@github.com/a/b',
			'https://github.com/a/b?tab=readme',
			'https://github.com/a/b#readme',
			'https://github.com/a/b/',
			'https://github.com',
			'https://github.com/',
			'https://github.com/a b'
		]) {
			assert.ok(!parses({ repo }), repo);
		}
		for (const path of ['../other/file.ts', 'src/../../file.ts', './file.ts', 'src/./file.ts']) {
			assert.ok(!parses({ path }), path);
		}
		assert.ok(parses({ path: 'src/.config/a..b.ts' }));
	});

	test("an input's file is a relative path that stays inside the corpus", () => {
		const input = load_fixture().inputs[0]!;
		const parses = (file: string): boolean => BenchInput.safeParse({ ...input, file }).success;
		assert.ok(parses(input.file));
		assert.ok(parses('neutral/ts/.config/a..b.ts'));
		for (const file of [
			'/etc/passwd',
			'../outside.ts',
			'neutral/../../outside.ts',
			'./neutral/ts/a.ts',
			'neutral/./ts/a.ts',
			'neutral//a.ts',
			'neutral/ts/'
		]) {
			assert.ok(!parses(file), file);
		}
	});

	test('the corpus hash is a full SHA-256', () => {
		const data = load_fixture();
		data.meta.corpus_hash = '0000000000000000';
		assert_rejects(data, 'meta.corpus_hash');
	});
});

describe('libraries', () => {
	test('a library records the color schemes its default theme covers', () => {
		const data = load_fixture();
		assert.deepStrictEqual(
			data.meta.libraries.map((l) => [l.id, l.theme_schemes]),
			[
				['fuz_code', ['light', 'dark']],
				['twinkleplop', ['light', 'dark']],
				['prism', ['light']],
				['shiki_js', ['light']],
				['shiki_wasm', ['light']]
			]
		);
		for (const schemes of [[], ['sepia'], undefined]) {
			const data2 = load_fixture();
			(data2.meta.libraries[0] as any).theme_schemes = schemes;
			assert_rejects(data2, 'meta.libraries.0.theme_schemes');
		}
	});

	test('a library may record the versions of its separately versioned packages', () => {
		const data = load_fixture();
		const library = data.meta.libraries.find((l) => l.extra_packages)!;
		assert.deepStrictEqual(library.extra_packages, { '@twinkleplop/typescript': '0.1.5' });
		delete library.extra_packages;
		BenchResults.parse(data);
		const data2 = load_fixture();
		data2.meta.libraries[0]!.extra_packages = { 'prism-svelte': '' };
		assert.ok(!BenchResults.safeParse(data2).success);
	});
});

describe('ids', () => {
	test('rejects a set that repeats a lang', () => {
		const data = load_fixture();
		const set = data.sets.find((s) => s.id === 'docs')!;
		set.langs.push(set.langs[0]!);
		assert_rejects(data, `duplicate lang "${set.langs[0]}" in set "docs"`);
	});

	test('rejects library and lang ids that are not lowercase names', () => {
		for (const id of ['Prism', 'shiki-js', '', '__proto__', '1st']) {
			const data = load_fixture();
			data.meta.libraries[0]!.id = id;
			assert_rejects(data, 'meta.libraries.0.id');
			const data2 = load_fixture();
			data2.langs[0]!.id = id;
			assert_rejects(data2, 'langs.0.id');
		}
	});

	test('a library named after an Object.prototype member still needs coverage', () => {
		const data = load_fixture();
		data.meta.libraries.push({ ...data.meta.libraries[0]!, id: 'constructor' });
		assert_rejects(data, 'library "constructor" has no coverage entry');
	});

	test('an inherited member is not a claim', () => {
		const data = load_fixture();
		data.meta.libraries.push({ ...data.meta.libraries[0]!, id: 'constructor' });
		const cell = data.cells[0]!;
		Object.defineProperty(cell.tokens, 'constructor', { value: 1, enumerable: true });
		assert_rejects(data, `library "constructor" doesn't claim lang "${cell.lang}"`);
		const data2 = load_fixture();
		data2.langs.push({ id: 'constructor', label: 'Constructor', timed: true });
		data2.cells[0]!.lang = 'constructor';
		assert_rejects(data2, `doesn't claim lang "constructor"`);
	});

	test('rejects a __proto__ key in any record instead of dropping it', () => {
		const text = (key: string, at: string): string => {
			const data: any = load_fixture();
			const target =
				at === 'coverage'
					? data.coverage
					: at === 'coverage.prism'
						? data.coverage.prism
						: at === 'bundle'
							? data.bundle
							: at === 'bundle.prism'
								? data.bundle.prism
								: data.cells[at === 'output' ? 1 : 0][at];
			// a placeholder key, renamed in the JSON text so it parses as an own property
			target.PLACEHOLDER = structuredClone(Object.values(target)[0]);
			return JSON.stringify(data).replace('"PLACEHOLDER"', JSON.stringify(key));
		};
		for (const at of [
			'coverage',
			'coverage.prism',
			'bundle',
			'bundle.prism',
			'values',
			'tokens',
			'output'
		]) {
			const data = JSON.parse(text('__proto__', at));
			assert_rejects(data, '"__proto__" key is not allowed');
		}
	});
});

describe('deterministic numbers', () => {
	test('a tokenize cell states token counts, and an html cell output sizes', () => {
		const data = load_fixture();
		for (const cell of data.cells) {
			assert.ok(Object.keys(cell[to_stated(cell)]).length > 0, cell.id);
			assert.deepStrictEqual(cell[cell.mode === 'tokenize' ? 'output' : 'tokens'], {}, cell.id);
		}
	});

	test('rejects a number stated on the other cell of its input', () => {
		const data = load_fixture();
		const [tokenize, html] = data.cells;
		assert.strictEqual(tokenize!.mode, 'tokenize');
		assert.strictEqual(html!.mode, 'html');
		tokenize!.output = html!.output;
		assert_rejects(data, "cells.0.output: output is stated on the input's html cell");
		const data2 = load_fixture();
		data2.cells[1]!.tokens = data2.cells[0]!.tokens;
		assert_rejects(data2, "cells.1.tokens: tokens is stated on the input's tokenize cell");
	});

	test('rejects a timed value without the deterministic number of its cell', () => {
		const data = load_fixture();
		delete data.cells[0]!.tokens.prism;
		assert_rejects(data, 'cells.0.tokens: library "prism" has a value here and no tokens');
		const data2 = load_fixture();
		delete data2.cells[1]!.output.prism;
		assert_rejects(data2, 'cells.1.output: library "prism" has a value here and no output');
	});
});

/** The fixture as a deterministic-only file: nothing timed, and nothing that says where or when. */
const load_deterministic_only = (): BenchResults => {
	const data = load_deterministic_fixture();
	data.meta.run = null;
	data.meta.anchor = null;
	data.meta.noise_floor = null;
	data.meta.generated_at = null;
	data.meta.machine = null;
	data.meta.node = null;
	data.meta.commit = null;
	return data;
};

describe('a deterministic-only file', () => {
	test('records no time, machine, Node version, or commit', () => {
		const data = load_deterministic_only();
		const parsed = BenchResults.parse(data);
		assert.ok(!bench_results_is_publishable(parsed));
		// it still holds every deterministic section
		assert.ok(parsed.cells.length > 0);
		assert.ok(Object.keys(parsed.bundle).length > 0);
		assert.ok(parsed.meta.bundler !== null);
	});

	test('is complete: every claiming library has its number in every cell, or is excluded', () => {
		const data = load_deterministic_only();
		delete data.cells[0]!.tokens.prism;
		assert_rejects(
			data,
			'cells.0.tokens: library "prism" claims lang "ts" and has neither its tokens nor an excluded entry here'
		);
		const data2 = load_deterministic_only();
		delete data2.cells[1]!.output.prism;
		delete data2.cells[1]!.compressed.prism;
		assert_rejects(
			data2,
			'cells.1.output: library "prism" claims lang "ts" and has neither its output nor an excluded entry here'
		);
		assert.deepStrictEqual(bench_results_find_gaps(data2, 'deterministic'), [
			{
				path: ['cells', 1, 'output'],
				message:
					'library "prism" claims lang "ts" and has neither its output nor an excluded entry here'
			}
		]);
		// excluded there, it is accounted for, as in the cells the fixture already excludes it from
		data2.meta.excluded.push({ cell: data2.cells[1]!.id, library: 'prism', reason: 'no HTML' });
		BenchResults.parse(data2);
		assert.deepStrictEqual(bench_results_find_gaps(load_deterministic_only(), 'deterministic'), []);
	});

	test('is complete: every listed input has a cell in each mode', () => {
		const data = load_deterministic_only();
		const [removed] = data.cells.splice(1, 1);
		assert.strictEqual(removed!.mode, 'html');
		assert_rejects(data, `inputs.0: input "${removed!.file}" has no html cell`);
	});

	test('a timed file is not held to it: a filtered run lists what it has', () => {
		const data = load_fixture();
		clear_values(data);
		delete data.cells[0]!.tokens.prism;
		data.meta.run!.filters.sizes = ['micro', 'small', 'medium', 'large'];
		BenchResults.parse(data);
	});

	test('rejects a file with timed numbers that does not say where they came from', () => {
		for (const key of ['generated_at', 'machine', 'node', 'commit'] as const) {
			const data = load_fixture();
			data.meta[key] = null;
			assert_rejects(data, `meta.${key}: a run with timed numbers records its ${key}`);
			// cold start alone is timed too
			const data2 = load_fixture();
			clear_values(data2);
			data2.meta[key] = null;
			assert_rejects(data2, `meta.${key}: a run with timed numbers records its ${key}`);
		}
	});
});

describe('install', () => {
	test('covers every library of the roster exactly when the bundle sizes are there', () => {
		const data = load_fixture();
		delete data.install.prism;
		assert_rejects(data, 'install: library "prism" has no install footprint');
		const data2 = load_fixture();
		clear_bundle(data2);
		data2.install.prism = { packages: 1, files: 1, bytes: 1, closure: 'a'.repeat(64) };
		assert_rejects(data2, 'install footprints come with the bundle sizes');
		const data3 = load_fixture();
		data3.install.highlight_js = { packages: 1, files: 1, bytes: 1, closure: 'a'.repeat(64) };
		assert_rejects(data3, 'unknown library "highlight_js"');
	});

	test('has at least a file for each package', () => {
		const data = load_fixture();
		data.install.prism = { packages: 3, files: 2, bytes: 100, closure: 'a'.repeat(64) };
		assert_rejects(data, 'every package has at least its manifest');
	});
});

describe('heap', () => {
	test('covers every timed language each library claims exactly when the bundle sizes are there', () => {
		const data = load_fixture();
		delete data.heap.prism!.ts;
		assert_rejects(data, 'heap.prism: library "prism" has no retained heap for "ts"');
		const data2 = load_fixture();
		clear_bundle(data2);
		data2.heap.prism = { ts: { retained_kb: 1, code_kb: 0, external_kb: 0 } };
		assert_rejects(data2, 'retained heaps come with the bundle sizes');
		const data3 = load_fixture();
		data3.heap.highlight_js = {};
		assert_rejects(data3, 'unknown library "highlight_js"');
	});

	test('names only timed languages the library claims', () => {
		const data = load_fixture();
		data.heap.fuz_code!.xml = { retained_kb: 1, code_kb: 0, external_kb: 0 };
		assert_rejects(data, '"xml" is not a timed language of the file');
		const data2 = load_fixture();
		delete data2.coverage.prism!.rust;
		delete data2.bundle.prism;
		assert_rejects(data2, `library "prism" doesn't claim "rust"`);
	});

	test('is whole kibibytes, never negative', () => {
		const data = load_fixture();
		data.heap.prism!.ts = { retained_kb: 1.5, code_kb: 0, external_kb: 0 };
		assert_rejects(data, 'heap.prism.ts.retained_kb');
		const data2 = load_fixture();
		data2.heap.prism!.ts = { retained_kb: 1, code_kb: 0, external_kb: -1 };
		assert_rejects(data2, 'heap.prism.ts.external_kb');
	});
});

describe('compressed HTML', () => {
	const find_html = (data: BenchResults) => data.cells.find((cell) => cell.mode === 'html')!;

	test('is stated on the html cell for every library with an output', () => {
		const data = load_fixture();
		delete find_html(data).compressed.prism;
		assert_rejects(data, 'library "prism" has an output and no compressed sizes');
		const data2 = load_fixture();
		const tokenize = data2.cells.find((cell) => cell.mode === 'tokenize')!;
		tokenize.compressed = { ...find_html(data2).compressed };
		assert_rejects(data2, "compressed is stated on the input's html cell");
	});

	test('is empty when the file holds no sizes of the deterministic pass', () => {
		const data = load_fixture();
		const { compressed } = find_html(data);
		clear_bundle(data);
		find_html(data).compressed = compressed;
		assert_rejects(data, 'the file holds no sizes of the deterministic pass');
	});

	test("rejects a size past the raw HTML and a format's own overhead", () => {
		for (const key of ['gzip', 'brotli'] as const) {
			const data = load_fixture();
			const html = find_html(data);
			html.compressed.prism![key] = to_max_compressed_bytes(html.output.prism!.html_bytes) + 1;
			assert_rejects(data, `${key} is larger than html_bytes`);
		}
	});

	test('names no library without an output', () => {
		const data = load_fixture();
		const html = find_html(data);
		html.compressed.highlight_js = { gzip: 1, brotli: 1 };
		assert_rejects(data, 'library "highlight_js" has no output to compress');
	});
});

describe('bundle', () => {
	test("rejects a compressed size past the raw one and a format's own overhead", () => {
		for (const key of ['gzip', 'brotli'] as const) {
			for (const section of ['js', 'css', 'wasm'] as const) {
				const data = load_fixture();
				const entry = data.bundle.shiki_wasm!.docs!;
				const classes = data.bundle.prism!.docs!;
				assert.ok('raw' in entry && 'raw' in classes);
				const sizes = section === 'js' ? entry : section === 'wasm' ? entry.wasm! : classes.css!;
				sizes[key] = to_max_compressed_bytes(sizes.raw) + 1;
				assert_rejects(data, `${key} is larger than raw`);
				// equal to raw, or over it by a header, is what a few bytes compress to
				sizes[key] = sizes.raw + 20;
				BenchResults.parse(data);
			}
		}
		assert.ok(to_max_compressed_bytes(1) >= 1 + 20);
	});

	test('css is null exactly for a library that writes its styles inline', () => {
		const data = load_fixture();
		const classes = data.bundle.prism!.docs!;
		assert.ok('raw' in classes && classes.css !== null);
		assert.deepStrictEqual(Object.keys(classes.css), ['raw', 'gzip', 'brotli']);
		classes.css = null;
		assert_rejects(
			data,
			'bundle.prism.docs.css: library "prism" styles by class, so its stylesheet is measured'
		);
		const data2 = load_fixture();
		const inline = data2.bundle.shiki_js!.docs!;
		assert.ok('raw' in inline && inline.css === null);
		inline.css = { raw: 2000, gzip: 700, brotli: 600 };
		assert_rejects(
			data2,
			'bundle.shiki_js.docs.css: library "shiki_js" writes its styles inline, so it has no stylesheet to measure'
		);
	});

	test('wasm is measured raw and compressed, and null without wasm', () => {
		const data = load_fixture();
		const without = data.bundle.prism!.docs!;
		const with_wasm = data.bundle.shiki_wasm!.docs!;
		assert.ok('raw' in without && 'raw' in with_wasm);
		assert.strictEqual(without.wasm, null);
		assert.deepStrictEqual(Object.keys(with_wasm.wasm!), ['raw', 'gzip', 'brotli']);
		for (const wasm of [0, 1000, { raw: 0, gzip: 0, brotli: 0 }, { raw: 10 }, { raw: 1.5 }]) {
			const data2 = load_fixture();
			(data2.bundle.prism!.docs as any).wasm = wasm;
			assert_rejects(data2, 'bundle.prism.docs');
		}
	});

	test('a malformed entry is reported against the shape it was meant to be', () => {
		const data = load_fixture();
		delete (data.bundle.prism!.docs as any).gzip;
		assert_rejects(data, 'bundle.prism.docs: a bundle entry is sizes');
		assert_rejects(data, 'read as sizes: gzip: ');
		const data2 = load_fixture();
		(data2.bundle.prism!.docs as any).extra = 1;
		assert_rejects(data2, 'read as sizes: Unrecognized key');
		const data3 = load_fixture();
		(data3.bundle.prism!['single:xml'] as any).unsupported = ['XML'];
		// zod names the place itself when only one shape comes close
		assert_rejects(data3, 'bundle.prism.single:xml.unsupported.0: Invalid string');
		const data5 = load_fixture();
		(data5.bundle.prism as any)['single:xml'] = { unsupported: ['xml'], raw: 1 };
		assert_rejects(data5, 'read as unsupported: Unrecognized key');
		const data4 = load_fixture();
		(data4.bundle.prism as any).docs = 12;
		assert_rejects(data4, 'read as sizes: ');
		// the message never falls back to the union's own
		for (const changed of [data, data2, data3, data4, data5]) {
			const parsed = BenchResults.safeParse(changed);
			assert.ok(!parsed.success);
			assert.ok(parsed.error.issues.every((i) => i.message !== 'Invalid input'));
		}
	});

	test('sizes cover every library over every set, or none', () => {
		const data = load_fixture();
		delete data.bundle.prism;
		assert_rejects(data, 'bundle: library "prism" has no bundle entry');
		const data2 = load_fixture();
		delete data2.bundle.prism!.docs;
		assert_rejects(data2, 'bundle.prism: library "prism" has no entry for set "docs"');
		// every set of the fixture has an entry for every library
		const data3 = load_fixture();
		for (const { id } of data3.meta.libraries) {
			assert.deepStrictEqual(
				Object.keys(data3.bundle[id]!),
				data3.sets.map((s) => s.id)
			);
		}
	});

	test('what the sizes were built with is recorded exactly when there are sizes', () => {
		const data = load_fixture();
		data.meta.bundler = null;
		assert_rejects(data, 'meta.bundler: bundler is set exactly when bundle sizes were measured');
		const data2 = load_fixture();
		data2.bundle = {};
		assert_rejects(data2, 'meta.bundler: bundler is set exactly when bundle sizes were measured');
		for (const [key, value] of [
			['gzip_level', 0],
			['gzip_level', 10],
			['brotli_quality', 12],
			['vite', '']
		] as const) {
			const data3 = load_fixture();
			(data3.meta.bundler as any)[key] = value;
			assert_rejects(data3, `meta.bundler.${key}`);
		}
	});

	test('the bundler inside Vite is Rolldown, or Rollup for a file measured before Vite 8', () => {
		const data = load_fixture();
		const bundler: Record<string, unknown> = data.meta.bundler!;
		bundler.rollup = '4.0.0';
		assert_rejects(data, 'meta.bundler: a bundler names exactly one of rolldown and rollup');
		delete bundler.rolldown;
		bundler.vite = '7.0.0';
		BenchResults.parse(data);
		delete bundler.rollup;
		assert_rejects(data, 'meta.bundler: a bundler names exactly one of rolldown and rollup');
	});
});

describe('plausibility of timed numbers', () => {
	test('rejects a 10th percentile over the 90th', () => {
		const data = load_fixture();
		const value = data.cells[0]!.values.fuz_code!;
		[value.p10_ns, value.p90_ns] = [value.p90_ns, value.p10_ns];
		assert_rejects(data, 'cells.0.values.fuz_code.p10_ns: the 10th percentile is at most the 90th');
		value.p10_ns = value.p90_ns;
		BenchResults.parse(data);
	});

	test('stable is exactly a drift under the threshold, either way', () => {
		for (const [drift, stable] of [
			[0, true],
			[BENCH_ANCHOR_STABLE_BELOW - 0.001, true],
			[-(BENCH_ANCHOR_STABLE_BELOW - 0.001), true],
			[BENCH_ANCHOR_STABLE_BELOW, false],
			[-BENCH_ANCHOR_STABLE_BELOW, false],
			[0.5, false]
		] as const) {
			const data = load_fixture();
			data.meta.anchor = { drift, stable };
			BenchResults.parse(data);
			data.meta.anchor = { drift, stable: !stable };
			assert_rejects(data, 'meta.anchor.stable: stable is exactly a drift under');
		}
	});
});
