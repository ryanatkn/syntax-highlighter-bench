import { assert, describe, test } from 'vitest';
import { readFileSync } from 'node:fs';

import { BenchResults, parse_bench_results } from '$lib/results_schema.ts';

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

const EXCLUDED_CELL = 'rust/small/tokenize/shiki/rust.sample.rs';

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
	test('startup, bundle, cells, and excluded can be empty', () => {
		const data = load_fixture();
		data.startup = [];
		data.bundle = {};
		data.cells = [];
		data.meta.excluded = [];
		BenchResults.parse(data);
	});

	test('the noise floor is null until calibrated', () => {
		const data = load_fixture();
		data.meta.noise_floor = null;
		BenchResults.parse(data);
	});

	test('a cell can carry deterministic numbers without timed ones', () => {
		const data = load_fixture();
		for (const cell of data.cells) cell.values = {};
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
		for (const section of ['values', 'tokens', 'output'] as const) {
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
		assert.deepStrictEqual(
			data.meta.excluded.map((e) => [e.cell, e.library]),
			[[EXCLUDED_CELL, 'prism']]
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
		for (const section of ['values', 'tokens', 'output'] as const) {
			const data = load_fixture();
			const cell = data.cells.find((c) => c.id === EXCLUDED_CELL)!;
			(cell[section] as Record<string, unknown>).prism = cell[section].fuz_code;
			assert_rejects(data, 'library "prism" is excluded from this cell');
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
		data.bundle.prism!.docs = { ...data.bundle.prism!.docs!, unsupported: ['xml'] } as any;
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
	for (const cell of data.cells) cell.values = {};
	data.startup = [];
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
		for (const cell of data.cells) cell.values = {};
		data.meta.anchor = null;
		assert_rejects(data, 'a run with timed numbers needs an anchor');
	});
});

describe('startup', () => {
	const find_startup = (data: BenchResults, scenario: string) =>
		data.startup.find((s) => s.scenario === scenario)!;

	test('rejects an unknown library or lang', () => {
		const data = load_fixture();
		find_startup(data, 'core').library = 'highlight_js';
		assert_rejects(data, 'startup.1.library: unknown library "highlight_js"');
		const data2 = load_fixture();
		find_startup(data2, 'lang').lang = 'tsx';
		assert_rejects(data2, 'startup.2.lang: unknown lang "tsx"');
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
		data.bundle = {};
		assert_rejects(data, `library "${entry.library}" doesn't claim lang "${entry.lang}"`);
	});

	test('rejects a set with a lang the library does not claim', () => {
		const data = load_fixture();
		const entry = find_startup(data, 'set');
		entry.set = 'web_rust';
		assert_rejects(data, `doesn't claim every lang of set "web_rust": xml`);
	});

	test('rejects a duplicate entry', () => {
		const data = load_fixture();
		data.startup.push({ ...data.startup[1]!, median_ms: 1 });
		assert_rejects(data, 'duplicate startup entry');
	});

	test('accepts the same scenario bundled and unbundled', () => {
		const data = load_fixture();
		data.startup.push({ ...data.startup[1]!, bundled: !data.startup[1]!.bundled });
		BenchResults.parse(data);
	});
});

describe('cells', () => {
	test('home may name a library outside the roster', () => {
		const data = load_fixture();
		data.cells.find((c) => c.source === 'home')!.home = 'highlight_js';
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
		cell.output = { fuz_code: cell.output.fuz_code! };
		assert_rejects(data, 'lang "xml" is not timed');
	});

	test('rejects two cells measuring the same input, even with distinct ids', () => {
		const data = load_fixture();
		data.cells.push({ ...data.cells[0]!, id: 'another' });
		assert_rejects(data, 'duplicate cell');
	});

	test('accepts the same input in another mode', () => {
		const data = load_fixture();
		const cell = data.cells.find((c) => c.id === EXCLUDED_CELL)!;
		data.cells.push({ ...cell, id: 'another', mode: 'html', values: {}, tokens: {}, output: {} });
		BenchResults.parse(data);
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
								: data.cells[0][at];
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
