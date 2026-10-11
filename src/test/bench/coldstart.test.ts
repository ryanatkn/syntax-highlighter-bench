import { afterAll, assert, beforeAll, describe, test } from 'vitest';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { BenchStartup, type BenchRunFilters } from '#lib/results_schema.ts';
import type { HighlighterAdapter } from '../../../bench/adapter.ts';
import { MIN_SNIPPET_SPAN_KINDS } from '../../../bench/check_output.ts';
import {
	STARTUP_DIR,
	STARTUP_SET_ID,
	StartupChildOutput,
	StartupResult,
	check_startup_output,
	plan_startup_round,
	plan_startup_scenarios,
	prepare_startup,
	summarize_startup,
	to_startup_child_path,
	to_startup_child_source,
	to_startup_env,
	to_startup_key,
	type StartupScenario
} from '../../../bench/coldstart.ts';
import { load_corpus_manifest, read_corpus_input } from '../../../bench/corpus.ts';
import { TIMED_LANGS } from '../../../bench/langs.ts';
import { ADAPTERS } from '../../../bench/libraries.ts';
import { FEATURE_SETS } from '../../../bench/sets.ts';
import { GZIP_LEVEL, find_missing_langs, to_bundle_file_name } from '../../../bench/sizes.ts';

const manifest = load_corpus_manifest();

const NO_FILTERS: Pick<BenchRunFilters, 'libraries' | 'langs'> = { libraries: null, langs: null };

const plan = (
	filters: Pick<BenchRunFilters, 'libraries' | 'langs'> = NO_FILTERS,
	adapters: ReadonlyArray<HighlighterAdapter> = ADAPTERS
) => plan_startup_scenarios(adapters, filters, manifest.inputs);

const DOCS = FEATURE_SETS.find((set) => set.id === STARTUP_SET_ID)!;

describe('plan_startup_scenarios', () => {
	test('one bare baseline, then every scenario of every library in both forms', () => {
		const { scenarios, unsupported } = plan();
		assert.deepStrictEqual(unsupported, []);
		const [bare, ...rest] = scenarios;
		assert.deepStrictEqual(bare, {
			scenario: 'bare',
			library: null,
			lang: null,
			set: null,
			bundled: false,
			key: 'bare',
			slot: 'bare',
			entry_set: null,
			snippet: null
		});
		assert.ok(rest.every((s) => s.scenario !== 'bare' && s.library !== null));
		for (const adapter of ADAPTERS) {
			const claimed = TIMED_LANGS.filter((lang) => Object.hasOwn(adapter.langs, lang));
			for (const bundled of [false, true]) {
				const own = rest.filter((s) => s.library === adapter.id && s.bundled === bundled);
				// what each imports is the entry of a feature set: the module bundle size is measured over
				assert.deepStrictEqual(
					own.map((s) => [s.scenario, s.lang, s.set, s.entry_set]),
					[
						['core', null, null, 'core'],
						...claimed.map((lang) => ['lang', lang, null, `single:${lang}`]),
						['set', null, 'docs', 'docs'],
						...claimed.map((lang) => ['first_highlight', lang, null, `single:${lang}`])
					]
				);
			}
		}
	});

	test('keys are unique, and name the library, the scenario, what it loads, and the form', () => {
		const { scenarios } = plan();
		assert.strictEqual(new Set(scenarios.map((s) => s.key)).size, scenarios.length);
		assert.ok(scenarios.every((s) => s.key === to_startup_key(s)));
		const keys = new Set(scenarios.map((s) => s.key));
		for (const key of [
			'bare',
			'fuz_code:core:unbundled',
			'prism:lang:ts:bundled',
			'shiki_wasm:set:docs:unbundled',
			'twinkleplop:first_highlight:json:bundled'
		]) {
			assert.ok(keys.has(key), key);
		}
		// and each has a module of its own to run
		const paths = scenarios.map((s) => to_startup_child_path(s, '/x'));
		assert.strictEqual(new Set(paths).size, scenarios.length);
		assert.ok(paths.includes('/x/bare.mjs'));
		assert.ok(paths.includes('/x/prism/lang_ts.bundled.mjs'));
		assert.ok(paths.includes('/x/shiki_wasm/set_docs.unbundled.mjs'));
	});

	test('only a first highlight has a snippet, and it is its language’s harness snippet', () => {
		for (const scenario of plan().scenarios) {
			if (scenario.scenario !== 'first_highlight') {
				assert.strictEqual(scenario.snippet, null);
				continue;
			}
			assert.strictEqual(scenario.snippet!.source, 'harness');
			assert.strictEqual(scenario.snippet!.lang, scenario.lang);
		}
	});

	test('a library that lacks a language of a scenario is unsupported there, never planned', () => {
		// claims two timed languages, and so neither the docs set nor any other language
		const partial = {
			...ADAPTERS[0]!,
			id: 'partial',
			langs: { ts: 'ts', json: 'json' }
		} as HighlighterAdapter;
		const { scenarios, unsupported } = plan(NO_FILTERS, [partial, ADAPTERS[1]!]);
		const own = scenarios.filter((s) => s.library === 'partial');
		assert.deepStrictEqual(
			own.map((s) => [s.scenario, s.lang, s.bundled]),
			[
				['core', null, false],
				['core', null, true],
				['lang', 'ts', false],
				['lang', 'ts', true],
				['lang', 'json', false],
				['lang', 'json', true],
				['first_highlight', 'ts', false],
				['first_highlight', 'ts', true],
				['first_highlight', 'json', false],
				['first_highlight', 'json', true]
			]
		);
		// named once for the two forms, with what is missing
		assert.ok(unsupported.every((u) => u.library === 'partial'));
		assert.deepStrictEqual(
			unsupported.find((u) => u.scenario === 'set'),
			{
				library: 'partial',
				scenario: 'set',
				lang: null,
				set: 'docs',
				missing: find_missing_langs(partial, DOCS)
			}
		);
		const lacking = TIMED_LANGS.filter((lang) => lang !== 'ts' && lang !== 'json');
		for (const scenario of ['lang', 'first_highlight'] as const) {
			assert.deepStrictEqual(
				unsupported.filter((u) => u.scenario === scenario).map((u) => [u.lang, u.missing]),
				lacking.map((lang) => [lang, [lang]])
			);
		}
		// the other library is whole
		assert.ok(scenarios.some((s) => s.library === ADAPTERS[1]!.id && s.scenario === 'set'));
	});

	test('filters narrow the libraries, and the languages of the per-language scenarios', () => {
		const { scenarios } = plan({ libraries: ['prism'], langs: ['json', 'rust'] });
		assert.deepStrictEqual(
			scenarios.map((s) => s.key),
			[
				'bare',
				'prism:core:unbundled',
				'prism:core:bundled',
				'prism:lang:json:unbundled',
				'prism:lang:json:bundled',
				'prism:lang:rust:unbundled',
				'prism:lang:rust:bundled',
				'prism:set:docs:unbundled',
				'prism:set:docs:bundled',
				'prism:first_highlight:json:unbundled',
				'prism:first_highlight:json:bundled',
				'prism:first_highlight:rust:unbundled',
				'prism:first_highlight:rust:bundled'
			]
		);
	});

	test('only timed languages are loaded alone', () => {
		const langs = new Set(plan().scenarios.flatMap((s) => s.lang ?? []));
		assert.deepStrictEqual([...langs], [...TIMED_LANGS]);
	});
});

describe('plan_startup_round', () => {
	const { scenarios } = plan();

	test('every round holds every scenario once, so the scenarios are interleaved', () => {
		for (const round of [0, 1, 7]) {
			const planned = plan_startup_round(scenarios, round);
			assert.ok(planned.every((p) => p.round === round));
			assert.deepStrictEqual(
				planned.map((p) => p.scenario.key).toSorted(),
				scenarios.map((s) => s.key).toSorted()
			);
		}
	});

	test('a slot is the libraries of one scenario and form, one after another', () => {
		const planned = plan_startup_round(scenarios, 0);
		const slots = [...new Set(planned.map((p) => p.scenario.slot))];
		// each slot's processes are adjacent
		assert.deepStrictEqual(
			planned.map((p) => p.scenario.slot).filter((slot, i, all) => slot !== all[i - 1]),
			slots
		);
		assert.strictEqual(slots[0], 'bare');
		for (const slot of slots.slice(1)) {
			const libraries = planned
				.filter((p) => p.scenario.slot === slot)
				.map((p) => p.scenario.library);
			assert.strictEqual(libraries.length, ADAPTERS.length);
			assert.deepStrictEqual(new Set(libraries), new Set(ADAPTERS.map((a) => a.id)));
		}
	});

	test('the library a slot starts with rotates from round to round and slot to slot', () => {
		const first_of = (round: number, slot: string): string | null =>
			plan_startup_round(scenarios, round).find((p) => p.scenario.slot === slot)!.scenario.library;
		const slots = [...new Set(scenarios.map((s) => s.slot))].slice(1);
		const ids = ADAPTERS.map((a) => a.id);
		// across as many rounds as there are libraries, each starts a slot once
		for (const slot of slots.slice(0, 3)) {
			assert.deepStrictEqual(new Set(ids.map((_id, round) => first_of(round, slot))), new Set(ids));
		}
		// and neighbouring slots of one round start with different libraries
		assert.notStrictEqual(first_of(0, slots[0]!), first_of(0, slots[1]!));
		// within a slot the order is a rotation of the roster
		const round = plan_startup_round(scenarios, 2).filter((p) => p.scenario.slot === slots[0]);
		const start = ids.indexOf(round[0]!.scenario.library!);
		assert.deepStrictEqual(
			round.map((p) => p.scenario.library),
			ids.map((_id, k) => ids[(start + k) % ids.length]!)
		);
	});
});

describe('to_startup_child_source', () => {
	test('the bare baseline imports nothing, and reports as every other process does', () => {
		const bare = to_startup_child_source(null);
		assert.ok(!bare.includes('import '));
		assert.ok(bare.includes('exports: 0,'));
		assert.ok(bare.includes('html: null,'));
		const core = to_startup_child_source('./core.entry.mjs');
		assert.ok(core.includes(`import * as exports from "./core.entry.mjs";`));
		// apart from the import and the export count, the two are the same lines
		const without = (source: string): Array<string> =>
			source.split('\n').filter((line) => !line.includes('exports'));
		assert.deepStrictEqual(without(core), without(bare));
	});

	test('the clock is read after the work and before anything is gathered or written, and the process exits after', () => {
		const source = to_startup_child_source('./single_json.entry.mjs', {
			src: '{"a": "</script>\n"}',
			expression: 'exports.highlight(src)'
		});
		const order = [
			'import * as exports',
			'const src = "{\\"a\\": \\"</script>\\n\\"}";',
			'const html = exports.highlight(src);',
			'html.charCodeAt(0)',
			'const ms = performance.now();',
			'process.resourceUsage().maxRSS',
			'process.stdout.write(',
			'html: html,',
			'getCompileCacheDir()',
			// once the line is written, so a handle the library left open can't hold the process
			'(error) => process.exit(error ? 1 : 0)'
		].map((part) => source.indexOf(part));
		assert.ok(
			order.every((index) => index >= 0),
			JSON.stringify(order)
		);
		assert.deepStrictEqual(
			order,
			order.toSorted((a, b) => a - b)
		);
	});

	test('it is a module with no harness import and no flag to need', () => {
		const source = to_startup_child_source('./x.mjs', { src: 'a', expression: 'exports.h(src)' });
		const lines = source.split('\n');
		assert.deepStrictEqual(
			lines.filter((line) => /^import\b|\bimport\(/.test(line)),
			['import * as exports from "./x.mjs";']
		);
		assert.ok(!/\bgc\(|require\(|argv|process\.env/.test(source));
	});
});

describe('to_startup_env', () => {
	test('turns the compile cache off, and keeps the rest', () => {
		const env = to_startup_env({ PATH: '/bin', NODE_COMPILE_CACHE: '/cache', NODE_OPTIONS: '-x' });
		assert.deepStrictEqual(env, {
			PATH: '/bin',
			NODE_OPTIONS: '-x',
			NODE_DISABLE_COMPILE_CACHE: '1'
		});
	});
});

const HIGHLIGHTED = Array.from(
	{ length: MIN_SNIPPET_SPAN_KINDS },
	(_v, i) => `<span class="k${i}">x</span>`
).join('');

const find_scenario = (key: string): StartupScenario => {
	const scenario = plan().scenarios.find((s) => s.key === key);
	assert.ok(scenario, key);
	return scenario;
};

const create_output = (overrides: Partial<StartupChildOutput> = {}): StartupChildOutput => ({
	ms: 31.5,
	max_rss_kb: 50_000,
	exports: 1,
	html: null,
	compile_cache_dir: null,
	...overrides
});

describe('check_startup_output', () => {
	test('a process that loaded its entry is a sample, with its peak in bytes', () => {
		for (const key of ['bare', 'prism:core:bundled', 'prism:set:docs:unbundled']) {
			const result = check_startup_output(
				find_scenario(key),
				create_output({ exports: key === 'bare' ? 0 : 2 })
			);
			assert.deepStrictEqual(result, {
				key,
				sample: { ms: 31.5, rss_peak_bytes: 50_000 * 1024, output: null },
				excluded: null
			});
			StartupResult.parse(result);
		}
	});

	test('an entry that exports nothing excludes the library, and is not a time', () => {
		const result = check_startup_output(
			find_scenario('prism:core:bundled'),
			create_output({ exports: 0 })
		);
		assert.strictEqual(result.sample, null);
		assert.match(result.excluded!, /exports nothing/);
		StartupResult.parse(result);
	});

	test('a first highlight passes the snippet gate on its HTML, or is excluded', () => {
		const scenario = find_scenario('prism:first_highlight:json:unbundled');
		const passed = check_startup_output(scenario, create_output({ html: HIGHLIGHTED }));
		assert.deepStrictEqual(passed.sample!.output, {
			html_bytes: Buffer.byteLength(HIGHLIGHTED),
			spans: MIN_SNIPPET_SPAN_KINDS
		});
		for (const [html, expected] of [
			[null, /produced no HTML/],
			[
				'<span class="a">x</span> plain text',
				/failed the check on the json snippet: the HTML has 1 kinds of span, under the \d+ that highlighting produces: a plain-text fallback/
			]
		] as const) {
			const result = check_startup_output(scenario, create_output({ html }));
			assert.strictEqual(result.sample, null);
			assert.match(result.excluded!, expected);
		}
	});

	test('a result is a sample or an exclusion, never both or neither', () => {
		const sample = { ms: 1, rss_peak_bytes: 1, output: null };
		assert.ok(!StartupResult.safeParse({ key: 'bare', sample, excluded: 'x' }).success);
		assert.ok(!StartupResult.safeParse({ key: 'bare', sample: null, excluded: null }).success);
		assert.ok(!StartupResult.safeParse({ key: 'bare', sample: { ...sample, ms: 0 } }).success);
	});

	test('what a process prints is strict', () => {
		StartupChildOutput.parse(create_output());
		assert.ok(!StartupChildOutput.safeParse({ ...create_output(), extra: 1 }).success);
		assert.ok(!StartupChildOutput.safeParse(create_output({ ms: 0 })).success);
		assert.ok(!StartupChildOutput.safeParse(create_output({ max_rss_kb: 1.5 })).success);
	});
});

describe('summarize_startup', () => {
	const to_samples = (times: Array<number>, rss: Array<number> = times.map(() => 1000)) =>
		times.map((ms, i) => ({ ms, rss_peak_bytes: rss[i]!, output: null }));

	test('the median, the percentiles, and the slowest over the fastest', () => {
		const summary = summarize_startup(to_samples([30, 20, 40, 25, 35], [5, 1, 3, 2, 400]));
		assert.deepStrictEqual(summary, {
			samples: 5,
			median_ms: 30,
			p10_ms: 22,
			p90_ms: 38,
			spread: 2,
			rss_peak_bytes: 3
		});
	});

	test('one slow process moves neither the median nor the memory', () => {
		const calm = summarize_startup(to_samples([30, 30, 31, 31, 32]));
		const tailed = summarize_startup(
			to_samples([30, 30, 31, 31, 900], [1000, 1000, 1000, 1000, 9])
		);
		assert.strictEqual(tailed.median_ms, calm.median_ms);
		assert.strictEqual(tailed.rss_peak_bytes, calm.rss_peak_bytes);
		assert.strictEqual(tailed.spread, 30);
	});

	test('one sample is a whole summary, as a smoke run takes it', () => {
		const summary = summarize_startup(to_samples([12.5]));
		assert.deepStrictEqual(summary, {
			samples: 1,
			median_ms: 12.5,
			p10_ms: 12.5,
			p90_ms: 12.5,
			spread: 1,
			rss_peak_bytes: 1000
		});
		// with what names a scenario it is a results entry
		const { scenario, library, lang, set, bundled } = find_scenario('prism:core:bundled');
		BenchStartup.parse({ scenario, library, lang, set, bundled, ...summary });
	});
});

describe('prepare_startup', () => {
	// under the repo, as the real directory is, so an entry's imports would resolve
	let dir: string;
	let startup_dir: string;
	let bundles_dir: string;

	beforeAll(() => {
		mkdirSync(dirname(STARTUP_DIR), { recursive: true });
		dir = mkdtempSync(join(dirname(STARTUP_DIR), 'startup_prepare_test_'));
		startup_dir = join(dir, 'startup');
		bundles_dir = join(dir, 'bundles');
	});

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const { scenarios } = plan({ libraries: ['fuz_code'], langs: ['json'] });
	const [fuz_code] = ADAPTERS.filter((a) => a.id === 'fuz_code');
	const unbundled = scenarios.filter((s) => !s.bundled);

	test('writes each scenario its module, and each unbundled entry beside them', async () => {
		const prepared = await prepare_startup(unbundled, ADAPTERS, { dir: startup_dir, bundles_dir });
		assert.deepStrictEqual(prepared, { built: [], mismatched: [] });
		const read = (name: string): string => readFileSync(join(startup_dir, name), 'utf8');
		assert.strictEqual(read('bare.mjs'), to_startup_child_source(null));
		// the entry is the adapter's own, verbatim: what the size build bundles
		assert.strictEqual(read('fuz_code/core.entry.mjs'), fuz_code!.bundle_entry([]));
		assert.strictEqual(read('fuz_code/single_json.entry.mjs'), fuz_code!.bundle_entry(['json']));
		assert.strictEqual(read('fuz_code/docs.entry.mjs'), fuz_code!.bundle_entry(DOCS.langs));
		assert.strictEqual(
			read('fuz_code/core.unbundled.mjs'),
			to_startup_child_source('./core.entry.mjs')
		);
		assert.strictEqual(
			read('fuz_code/lang_json.unbundled.mjs'),
			to_startup_child_source('./single_json.entry.mjs')
		);
		// a first highlight embeds the snippet and the adapter's call, and imports the same entry
		const snippet = manifest.inputs.find((i) => i.source === 'harness' && i.lang === 'json')!;
		const highlight = read('fuz_code/first_highlight_json.unbundled.mjs');
		assert.ok(highlight.includes(`import * as exports from "./single_json.entry.mjs";`));
		assert.ok(highlight.includes(`const html = ${fuz_code!.bundle_html_source('json')};`));
		assert.ok(highlight.includes(`const src = ${JSON.stringify(read_corpus_input(snippet))};`));
		for (const scenario of unbundled)
			assert.ok(existsSync(to_startup_child_path(scenario, startup_dir)));
		// nothing was built, so no bundle was written
		assert.ok(!existsSync(bundles_dir));
	});

	test('a file that already holds its content is left alone', async () => {
		const path = join(startup_dir, 'fuz_code/core.unbundled.mjs');
		const before = statSync(path, { bigint: true }).mtimeNs;
		await prepare_startup(unbundled, ADAPTERS, { dir: startup_dir, bundles_dir });
		assert.strictEqual(statSync(path, { bigint: true }).mtimeNs, before);
		// and one that doesn't is replaced, whole
		writeFileSync(path, 'stale');
		await prepare_startup(unbundled, ADAPTERS, { dir: startup_dir, bundles_dir });
		assert.strictEqual(readFileSync(path, 'utf8'), to_startup_child_source('./core.entry.mjs'));
	});

	test('a bundle of the size the deterministic file reports is used as it is', async () => {
		const core = scenarios.filter((s) => s.scenario === 'core' && s.bundled);
		const path = join(bundles_dir, 'fuz_code', to_bundle_file_name('core'));
		const code = 'export const syntax_styler = 1;\n';
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, code);
		const sizes = {
			raw: Buffer.byteLength(code),
			gzip: gzipSync(code, { level: GZIP_LEVEL }).length,
			brotli: 1,
			wasm: null,
			css: null
		};
		const prepared = await prepare_startup(core, ADAPTERS, {
			dir: startup_dir,
			bundles_dir,
			expected_bundle: { fuz_code: { core: sizes } }
		});
		assert.deepStrictEqual(prepared, { built: [], mismatched: [] });
		assert.strictEqual(readFileSync(path, 'utf8'), code);
		// the process imports the bundle where the size build left it
		assert.strictEqual(
			readFileSync(join(startup_dir, 'fuz_code/core.bundled.mjs'), 'utf8'),
			to_startup_child_source('../../bundles/fuz_code/core.mjs')
		);
	});

	test(
		'a bundle of another size is built again, and one that still differs is reported',
		{ timeout: 60_000 },
		async () => {
			const core = scenarios.filter((s) => s.scenario === 'core' && s.bundled);
			const path = join(bundles_dir, 'fuz_code', to_bundle_file_name('core'));
			const stale = readFileSync(path, 'utf8');
			const prepared = await prepare_startup(core, ADAPTERS, {
				dir: startup_dir,
				bundles_dir,
				expected_bundle: {
					fuz_code: { core: { raw: 1, gzip: 1, brotli: 1, wasm: null, css: null } }
				}
			});
			assert.deepStrictEqual(prepared.built, ['fuz_code core']);
			assert.strictEqual(prepared.mismatched.length, 1);
			assert.match(
				prepared.mismatched[0]!,
				/^fuz_code core: built \d+ bytes \(\d+ gzipped\), and the file has 1 \(1\)$/
			);
			// the real bundle replaced the stale one
			const built = readFileSync(path, 'utf8');
			assert.notStrictEqual(built, stale);
			assert.ok(built.includes('export'));
			// with no sizes to go by, a bundle on disk is never trusted
			writeFileSync(path, stale);
			const untrusted = await prepare_startup(core, ADAPTERS, { dir: startup_dir, bundles_dir });
			assert.deepStrictEqual(untrusted, { built: ['fuz_code core'], mismatched: [] });
			assert.strictEqual(readFileSync(path, 'utf8'), built);
		}
	);
});
