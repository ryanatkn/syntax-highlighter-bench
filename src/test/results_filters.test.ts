import { assert, describe, test } from 'vitest';

import {
	REFERENCE_PARAM,
	RESULTS_CHOICE_KEYS,
	RESULTS_LIST_KEYS,
	decode_results_filters,
	encode_results_filters,
	to_default_results_filters,
	to_results_filter_options,
	to_selected_libraries,
	to_selected_reference,
	type ResultsFilters
} from '#lib/results_filters.ts';
import { load_deterministic } from './site_test_helpers.ts';

const results = load_deterministic();
const options = to_results_filter_options(results);
const defaults = to_default_results_filters(options);

const round_trip = (filters: ResultsFilters): ResultsFilters =>
	decode_results_filters(
		new URLSearchParams(encode_results_filters(filters, defaults).toString()),
		options,
		defaults
	);

describe('the options and the defaults', () => {
	test('the options come from the results file', () => {
		assert.deepStrictEqual(
			options.libraries,
			results.meta.libraries.map((library) => library.id)
		);
		assert.deepStrictEqual(
			options.langs,
			results.langs.map((lang) => lang.id)
		);
		assert.deepStrictEqual(options.sources, [
			'neutral',
			'shiki',
			'home:fuz_code',
			'home:twinkleplop',
			'harness',
			'stress'
		]);
		assert.deepStrictEqual(options.set, ['docs', 'web_rust', 'timed']);
		assert.deepStrictEqual(options.engines, ['scanner', 'grammar_vm', 'regex', 'textmate']);
		assert.deepStrictEqual(options.outputs, ['classes', 'inline_styles']);
	});

	test('the default view is the neutral inputs, bundled, what each language costs, in gzip', () => {
		assert.deepStrictEqual(defaults.sources, ['neutral']);
		assert.deepStrictEqual(defaults.forms, ['bundled']);
		assert.strictEqual(defaults.bundle, 'incremental');
		assert.strictEqual(defaults.compression, 'gzip');
		// the HTML's size starts raw, as the output table always showed it
		assert.strictEqual(defaults.output_compression, 'raw');
		assert.strictEqual(defaults.set, 'docs');
		assert.strictEqual(defaults.unit, 'mb_per_sec');
		assert.strictEqual(defaults.reference, null);
		assert.deepStrictEqual(defaults.libraries, options.libraries);
		assert.deepStrictEqual(defaults.metrics, options.metrics);
		// the retained heap starts at the sum, which is what is ranked
		assert.deepStrictEqual(defaults.parts, ['total']);
	});

	test('every default is one of its options', () => {
		for (const key of RESULTS_LIST_KEYS) {
			for (const id of defaults[key]) assert.include(options[key], id, key);
		}
		for (const key of RESULTS_CHOICE_KEYS) assert.include(options[key], defaults[key], key);
	});
});

describe('encoding', () => {
	test('the default view is an empty query', () => {
		assert.strictEqual(encode_results_filters(defaults, defaults).toString(), '');
		assert.deepStrictEqual(
			decode_results_filters(new URLSearchParams(), options, defaults),
			defaults
		);
	});

	test('only what differs from the defaults is written', () => {
		const params = encode_results_filters(
			{ ...defaults, langs: ['ts', 'rust'], reference: 'prism', compression: 'brotli' },
			defaults
		);
		assert.deepStrictEqual(
			[...params.keys()].sort(),
			['compression', 'langs', REFERENCE_PARAM].sort()
		);
		assert.strictEqual(params.get('langs'), 'ts,rust');
	});

	test('a selection survives the round trip through a query', () => {
		const selections: Array<Partial<ResultsFilters>> = [
			{ langs: ['ts', 'rust'], sizes: ['large'], modes: ['html'] },
			{ sources: ['neutral', 'home:twinkleplop'], reference: 'shiki_wasm' },
			{ libraries: ['fuz_code', 'prism'], engines: ['scanner'], outputs: ['classes'] },
			{ metrics: ['bundle'], bundle: 'totals', compression: 'raw', set: 'web_rust' },
			{ unit: 'ns_per_op', forms: ['bundled', 'unbundled'], measures: ['spans'] },
			{ parts: ['total', 'external'] },
			// nothing selected is a selection too, and differs from the default
			{ libraries: [], langs: [], sources: [] }
		];
		for (const selection of selections) {
			const filters = { ...defaults, ...selection };
			assert.deepStrictEqual(round_trip(filters), filters, JSON.stringify(selection));
		}
	});
});

describe('decoding', () => {
	const decode = (query: string): ResultsFilters =>
		decode_results_filters(new URLSearchParams(query), options, defaults);

	test('ignores unknown keys', () => {
		assert.deepStrictEqual(decode('utm_source=x&nope=1&__proto__=1'), defaults);
	});

	test('drops unknown ids and keeps the known ones', () => {
		assert.deepStrictEqual(decode('langs=ts,klingon,rust').langs, ['ts', 'rust']);
	});

	test('falls back to the default when nothing in a parameter is valid', () => {
		assert.deepStrictEqual(decode('langs=klingon').langs, defaults.langs);
		assert.deepStrictEqual(decode('sources=,,;;').sources, defaults.sources);
		assert.strictEqual(decode('unit=furlongs').unit, defaults.unit);
		assert.strictEqual(decode('set=single:ts').set, defaults.set);
		assert.strictEqual(decode(`${REFERENCE_PARAM}=nobody`).reference, null);
	});

	test('a set shown under another id is read as that set, not as the default', () => {
		assert.deepStrictEqual(options.set_aliases, { all: 'web_rust' });
		assert.strictEqual(decode('set=all').set, 'web_rust');
		assert.strictEqual(decode('set=web_rust').set, 'web_rust');
		assert.notStrictEqual(decode('set=all').set, defaults.set);
		// and the link it encodes back to names the id it is shown under
		assert.strictEqual(encode_results_filters(decode('set=all'), defaults).get('set'), 'web_rust');
		for (const garbage of ['constructor', '__proto__', 'toString']) {
			assert.strictEqual(decode(`set=${garbage}`).set, defaults.set);
		}
	});

	test('an empty value selects nothing', () => {
		assert.deepStrictEqual(decode('langs=').langs, []);
	});

	test('returns ids once, in the order of the options', () => {
		assert.deepStrictEqual(decode('langs=rust,ts,rust,ts').langs, ['ts', 'rust']);
	});

	test('never throws on garbage', () => {
		for (const query of ['%', '=&=&', 'langs=%E0%A4%A', 'libraries[]=a', 'langs=constructor']) {
			assert.doesNotThrow(() => decode(query), query);
		}
		assert.deepStrictEqual(decode('langs=constructor,toString').langs, defaults.langs);
	});

	test('never changes the defaults it was given', () => {
		const before = JSON.stringify(defaults);
		decode('langs=ts&libraries=prism&unit=ns_per_op');
		assert.strictEqual(JSON.stringify(defaults), before);
	});
});

describe('the selected libraries', () => {
	const { libraries } = results.meta;
	const ids = (filters: Partial<ResultsFilters>): Array<string> =>
		to_selected_libraries(libraries, { ...defaults, ...filters }).map((library) => library.id);

	test('are the selected ones whose tags are selected too, in roster order', () => {
		assert.deepStrictEqual(ids({}), options.libraries);
		assert.deepStrictEqual(ids({ libraries: ['prism', 'fuz_code'] }), ['fuz_code', 'prism']);
		assert.deepStrictEqual(ids({ engines: ['textmate'] }), ['shiki_js', 'shiki_wasm']);
		assert.deepStrictEqual(ids({ outputs: ['classes'] }), ['fuz_code', 'twinkleplop', 'prism']);
		assert.deepStrictEqual(ids({ outputs: ['classes'], engines: ['textmate'] }), []);
	});

	test('a reference that is not shown is ignored', () => {
		const shown = to_selected_libraries(libraries, { ...defaults, outputs: ['classes'] });
		assert.strictEqual(to_selected_reference(shown, { reference: 'prism' }), 'prism');
		assert.strictEqual(to_selected_reference(shown, { reference: 'shiki_js' }), null);
		assert.strictEqual(to_selected_reference(shown, { reference: null }), null);
	});
});
