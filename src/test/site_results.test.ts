import { assert, describe, test } from 'vitest';

import {
	BENCH_ANCHOR_STABLE_BELOW,
	describe_bench_run,
	type BenchResults
} from '$lib/results_schema.ts';
import {
	bench_results_are_timed,
	find_first_difference,
	find_moved_since,
	resolve_site_results
} from '$lib/site_results.ts';
import {
	load_deterministic_json,
	load_fixture_json,
	to_calibration,
	to_deterministic_only,
	to_smoke
} from './site_test_helpers.ts';

/** The deterministic-only file that describes the fixture run: same libraries, corpus, and numbers. */
const load_matching_json = (): BenchResults => to_deterministic_only(load_fixture_json());

/** Resolves a latest run against the deterministic file that describes it. */
const resolve_latest = (latest: unknown, deterministic: unknown = load_matching_json()) =>
	resolve_site_results({ deterministic, latest, fixture: null });

/** Asserts that a latest run is refused with a message including each part. */
const assert_refused = (latest: unknown, ...parts: Array<string>): void => {
	try {
		resolve_latest(latest);
	} catch (error) {
		assert(error instanceof Error);
		for (const part of parts) assert.include(error.message, part);
		return;
	}
	assert.fail('expected the run to be refused');
};

/**
 * The runs that parse and are not results, each of which the site refuses as
 * the published run: what it changes, and what the refusal says.
 */
const UNPUBLISHABLE: Array<[label: string, change: (data: BenchResults) => void, says: string]> = [
	['a smoke run', (data) => to_smoke(data), 'kind: smoke'],
	['a calibration', (data) => to_calibration(data), 'kind: calibrate'],
	[
		'a filtered run',
		(data) => (data.meta.run!.filters.sources = ['neutral', 'shiki', 'home']),
		'filters: sources'
	],
	['a run from a dirty commit', (data) => (data.meta.commit += '-dirty'), '-dirty'],
	['a run with no noise floor', (data) => (data.meta.noise_floor = null), 'noise floor: none'],
	[
		'a run whose anchor drifted',
		(data) => (data.meta.anchor = { drift: BENCH_ANCHOR_STABLE_BELOW + 0.02, stable: false }),
		'drifted by'
	],
	[
		'a run whose anchor drifted the other way',
		(data) => (data.meta.anchor = { drift: -BENCH_ANCHOR_STABLE_BELOW, stable: false }),
		'run it again'
	]
];

/** The runs a schema check stops before the publishable rule is asked: each fails to parse. */
const INVALID: Array<[label: string, change: (data: BenchResults) => void]> = [
	['a run with a gap in a cell', (data) => delete data.cells[0]!.values.fuz_code],
	[
		'a run with a gap in its cold start',
		(data) => (data.startup = data.startup.filter((entry) => entry.library !== 'twinkleplop'))
	],
	['a timed run with no anchor', (data) => (data.meta.anchor = null)],
	['a timed run with no commit', (data) => (data.meta.commit = null)],
	['a timed run with no machine', (data) => (data.meta.machine = null)]
];

describe('resolve_site_results', () => {
	test('with no published run, renders the deterministic results', () => {
		const site = resolve_site_results({
			deterministic: load_deterministic_json(),
			latest: null,
			fixture: null
		});
		assert.strictEqual(site.source, 'deterministic');
		assert.deepStrictEqual(site.moved, []);
		assert.ok(site.corpus_current);
		assert.deepStrictEqual(site.results, load_deterministic_json());
		assert.ok(!bench_results_are_timed(site.results));
		assert.strictEqual(site.results.meta.machine, null);
		assert.strictEqual(site.results.startup.length, 0);
		assert.ok(site.results.cells.every((cell) => Object.keys(cell.values).length === 0));
	});

	test('with the fixture given, renders it as the fixture, whatever else exists', () => {
		const unpublishable = to_smoke(load_fixture_json());
		for (const latest of [null, load_fixture_json(), unpublishable]) {
			const site = resolve_site_results({
				deterministic: load_deterministic_json(),
				latest,
				fixture: load_fixture_json()
			});
			assert.strictEqual(site.source, 'fixture');
			assert.deepStrictEqual(site.moved, []);
			assert.ok(!site.corpus_current);
		}
	});

	test('refuses a file that does not parse, wherever it is', () => {
		const broken = { ...load_fixture_json(), extra: 1 };
		const files = { deterministic: load_deterministic_json(), latest: null, fixture: null };
		for (const key of ['deterministic', 'latest', 'fixture'] as const) {
			assert.throws(
				() => resolve_site_results({ ...files, [key]: broken }),
				/invalid bench results/
			);
		}
	});

	test('refuses a deterministic file that holds timed numbers', () => {
		assert.throws(
			() =>
				resolve_site_results({ deterministic: load_fixture_json(), latest: null, fixture: null }),
			/results\/deterministic.json holds timed numbers/
		);
	});
});

describe('a published run', () => {
	test('is rendered when it is publishable and agrees with the deterministic results', () => {
		const site = resolve_latest(load_fixture_json());
		assert.strictEqual(site.source, 'published');
		assert.deepStrictEqual(site.moved, []);
		assert.ok(site.corpus_current);
		assert.ok(bench_results_are_timed(site.results));
		assert.deepStrictEqual(site.results, load_fixture_json());
	});

	test.each(UNPUBLISHABLE)('%s is refused, and the refusal says why', (_label, change, says) => {
		const latest = load_fixture_json();
		change(latest);
		assert_refused(latest, 'results/latest.json is not a publishable run', says);
	});

	test.each(INVALID)('%s is refused: it does not parse', (_label, change) => {
		const latest = load_fixture_json();
		change(latest);
		assert_refused(latest, 'invalid bench results');
	});

	test('a deterministic-only file is refused as the published run', () => {
		assert_refused(load_matching_json(), 'not a publishable run', 'it holds no timed run');
		assert_refused(load_deterministic_json(), 'it holds no timed run');
	});

	test('a drifted run is never rendered, however little else is wrong with it', () => {
		const latest = load_fixture_json();
		latest.meta.anchor = { drift: BENCH_ANCHOR_STABLE_BELOW, stable: false };
		assert_refused(latest, 'not a publishable run', 'drifted by');
	});
});

describe('a published run beside the deterministic results', () => {
	const DIFFERENCES: Array<[label: string, change: (data: BenchResults) => void, at: string]> = [
		[
			'a token count',
			(data) => (data.cells.find((cell) => cell.mode === 'tokenize')!.tokens.fuz_code! += 1),
			'cells.neutral/ts/checker_excerpt.ts:tokenize.tokens.fuz_code'
		],
		[
			'an output size',
			(data) => (data.cells.find((cell) => cell.mode === 'html')!.output.prism!.spans += 1),
			'cells.neutral/ts/checker_excerpt.ts:html.output.prism.spans'
		],
		[
			'a bundle size',
			(data) => {
				const entry = data.bundle.prism!.docs!;
				if (!('unsupported' in entry)) entry.raw += 1;
			},
			'bundle.prism.docs.raw'
		],
		[
			'a compressed HTML size',
			(data) => (data.cells.find((cell) => cell.mode === 'html')!.compressed.prism!.gzip += 1),
			'cells.neutral/ts/checker_excerpt.ts:html.compressed.prism.gzip'
		],
		['an install footprint', (data) => (data.install.prism!.files += 1), 'install.prism.files'],
		['a coverage footnote', (data) => (data.coverage.fuz_code!.js = true), 'coverage.fuz_code.js'],
		['a feature set', (data) => data.sets.at(-1)!.langs.pop(), 'sets.']
	];

	test.each(DIFFERENCES)(
		'with the same versions and corpus, %s that differs fails, naming the place',
		(_label, change, at) => {
			const deterministic = load_matching_json();
			change(deterministic);
			try {
				resolve_latest(load_fixture_json(), deterministic);
			} catch (error) {
				assert(error instanceof Error);
				assert.include(error.message, 'their deterministic numbers differ');
				assert.include(error.message, at);
				return;
			}
			assert.fail('expected the difference to fail');
		}
	);

	test('a library at another version is a snapshot with a notice, and is not compared', () => {
		const deterministic = load_matching_json();
		const library = deterministic.meta.libraries.find((l) => l.id === 'fuz_code')!;
		const measured = library.version;
		library.version = '99.0.0';
		// numbers differ too, as they do after a version moves
		deterministic.cells[0]!.tokens.fuz_code! += 1;
		const site = resolve_latest(load_fixture_json(), deterministic);
		assert.strictEqual(site.source, 'published');
		assert.deepStrictEqual(site.moved, [
			`fuz_code was measured at ${measured} and is now at 99.0.0`
		]);
		assert.deepStrictEqual(site.results, load_fixture_json());
	});

	test('a library whose dependencies moved is a snapshot with a notice, and is not compared', () => {
		const deterministic = load_matching_json();
		deterministic.install.shiki_js!.closure = '0'.repeat(64);
		// a dependency renders Shiki's HTML, so its numbers may differ too
		deterministic.cells.find((cell) => cell.mode === 'html')!.compressed.shiki_js!.gzip += 1;
		const site = resolve_latest(load_fixture_json(), deterministic);
		assert.strictEqual(site.source, 'published');
		assert.deepStrictEqual(site.moved, ['the dependencies of shiki_js']);
	});

	test('an extra package at another version, and a changed corpus, are named too', () => {
		const deterministic = load_matching_json();
		const library = deterministic.meta.libraries.find((l) => l.extra_packages)!;
		const [name] = Object.keys(library.extra_packages!);
		library.extra_packages![name!] = '99.0.0';
		deterministic.meta.corpus_hash = 'f'.repeat(64);
		const { moved, corpus_current } = resolve_latest(load_fixture_json(), deterministic);
		assert.ok(!corpus_current);
		assert.strictEqual(moved.length, 2);
		assert.include(moved[0], library.id);
		assert.include(moved[0], 'extra packages');
		assert.strictEqual(moved[1], 'the corpus changed');
	});

	test('the fixture run against the committed results has moved, and says what', () => {
		const moved = find_moved_since(load_fixture_json(), load_deterministic_json());
		assert.include(moved, 'the corpus changed');
		assert.deepStrictEqual(find_moved_since(load_fixture_json(), load_matching_json()), []);
	});
});

describe('find_first_difference', () => {
	test('is null for equal values, whatever the order of their keys', () => {
		assert.strictEqual(
			find_first_difference({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }),
			null
		);
		assert.strictEqual(find_first_difference(null, null), null);
	});

	test('names the path of the first difference', () => {
		assert.strictEqual(find_first_difference({ a: { b: [1, 2] } }, { a: { b: [1, 3] } }), 'a.b.1');
		assert.strictEqual(find_first_difference({ a: 1 }, { a: 1, b: 2 }), 'b');
		assert.strictEqual(find_first_difference({ a: null }, { a: {} }), 'a');
		assert.strictEqual(find_first_difference({ a: [] }, { a: {} }), 'a');
		assert.strictEqual(find_first_difference({ a: true }, { a: { via: 'x' } }), 'a');
	});
});

test('describe_bench_run states the facts a refusal rests on, the drift as a percentage', () => {
	const fixture = load_fixture_json();
	const description = describe_bench_run(fixture);
	for (const part of [
		'kind: full',
		'filters: none',
		`anchor: stable, drift ${(fixture.meta.anchor!.drift * 100).toFixed(1)}%`,
		'noise floor: present',
		'cells without a number: 0'
	]) {
		assert.include(description, part);
	}
	fixture.meta.anchor = { drift: 0.05, stable: false };
	assert.include(describe_bench_run(fixture), 'drifted by 5.0%');
});
