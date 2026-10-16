import { assert, describe, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

import { HEAP_TOLERANCE_KB } from '#lib/bench_constants.ts';
import {
	BenchMode,
	bench_results_is_publishable,
	parse_bench_results,
	type BenchResults
} from '#lib/results_schema.ts';
import { load_corpus_manifest } from '../../../bench/corpus.ts';
import {
	carry_deterministic,
	diff_json,
	keep_agreeing_heaps,
	serialize_results,
	to_deterministic_path,
	to_expected_key
} from '../../../bench/deterministic.ts';
import { to_install_closures } from '../../../bench/install.ts';
import { LANG_ROSTER, TIMED_LANGS, lang_is_timed } from '../../../bench/langs.ts';
import { ADAPTERS } from '../../../bench/libraries.ts';
import { to_bench_coverage, to_bench_libraries } from '../../../bench/library_info.ts';
import { FEATURE_SETS, to_bench_sets } from '../../../bench/sets.ts';
import {
	find_missing_langs,
	measure_theme_css,
	measure_wasm,
	read_bundler
} from '../../../bench/sizes.ts';

// The committed deterministic results file, checked against everything that can
// be derived without building a bundle or running a library. That it matches
// what regenerates is `npm run bench:deterministic -- --check`.

const text = readFileSync(to_deterministic_path(), 'utf8');
const load = (): BenchResults => parse_bench_results(JSON.parse(text));
const results = load();
const manifest = load_corpus_manifest();

describe('the committed deterministic file', () => {
	test('parses, and is written exactly as the schema parsed it', () => {
		assert.strictEqual(serialize_results(results), text);
	});

	test('holds no timed number, and so no time, machine, Node version, or commit', () => {
		const { meta } = results;
		for (const key of ['generated_at', 'machine', 'node', 'commit', 'run', 'anchor'] as const) {
			assert.strictEqual(meta[key], null, key);
		}
		assert.strictEqual(meta.noise_floor, null);
		assert.deepStrictEqual(results.startup, []);
		for (const cell of results.cells) assert.deepStrictEqual(cell.values, {});
		assert.ok(!bench_results_is_publishable(results));
	});

	test('names nothing of the machine that generated it', () => {
		for (const local of [homedir(), process.cwd(), '/tmp/', '/home/', '/Users/', '\\\\']) {
			assert.ok(!text.includes(local), `the file includes "${local}"`);
		}
		// no timestamp
		assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:/.test(text));
	});

	test('its rosters are the harness’s: libraries with their versions, languages, sets, coverage', () => {
		assert.deepStrictEqual(results.meta.libraries, to_bench_libraries(ADAPTERS));
		assert.deepStrictEqual(results.langs, [...LANG_ROSTER]);
		assert.deepStrictEqual(results.sets, to_bench_sets());
		assert.deepStrictEqual(results.coverage, to_bench_coverage(ADAPTERS));
		assert.strictEqual(results.meta.corpus_hash, manifest.corpus_hash);
	});

	test('its coverage carries each adapter’s footnotes, and no other', () => {
		for (const adapter of ADAPTERS) {
			for (const [lang, entry] of Object.entries(results.coverage[adapter.id]!)) {
				const via = (adapter.via as Record<string, string | undefined>)[lang];
				assert.deepStrictEqual(entry, via === undefined ? true : { via }, `${adapter.id} ${lang}`);
			}
		}
		const footnoted = Object.entries(results.coverage).flatMap(([library, langs]) =>
			Object.entries(langs)
				.filter(([, entry]) => entry !== true)
				.map(([lang]) => `${library}:${lang}`)
		);
		assert.deepStrictEqual(footnoted, [
			'prism:xml',
			'prism:svelte',
			'shiki_js:xml',
			'shiki_wasm:xml',
			'fuz_code:js'
		]);
	});

	test('it covers every input of a timed language, in every mode', () => {
		const timed = manifest.inputs.filter((input) => lang_is_timed(input.lang));
		assert.deepStrictEqual(results.inputs, timed);
		assert.deepStrictEqual(
			results.cells.map((cell) => cell.id),
			timed.flatMap((input) => BenchMode.def.map((mode) => `${input.file}:${mode}`))
		);
	});

	test('every library has its number in every cell whose language it claims, or is excluded', () => {
		const excluded = new Set(results.meta.excluded.map((e) => JSON.stringify([e.cell, e.library])));
		for (const cell of results.cells) {
			const stated = cell.mode === 'tokenize' ? cell.tokens : cell.output;
			for (const adapter of ADAPTERS) {
				if (!Object.hasOwn(adapter.langs, cell.lang)) continue;
				assert.ok(
					Object.hasOwn(stated, adapter.id) !== excluded.has(JSON.stringify([cell.id, adapter.id])),
					`${adapter.id} in ${cell.id}`
				);
			}
		}
	});

	test('the two Shiki engines agree on every count: they share grammars and theme', () => {
		for (const cell of results.cells) {
			assert.deepStrictEqual(cell.tokens.shiki_js, cell.tokens.shiki_wasm, cell.id);
			assert.deepStrictEqual(cell.output.shiki_js, cell.output.shiki_wasm, cell.id);
		}
	});

	test('bundle: sizes for every set a library covers, and the missing languages for the rest', async () => {
		assert.deepStrictEqual(results.meta.bundler, await read_bundler());
		for (const adapter of ADAPTERS) {
			const css = await measure_theme_css(adapter);
			const wasm = measure_wasm(adapter);
			for (const set of FEATURE_SETS) {
				const entry = results.bundle[adapter.id]![set.id]!;
				const missing = find_missing_langs(adapter, set);
				if (missing.length > 0) {
					assert.deepStrictEqual(entry, { unsupported: missing }, `${adapter.id} ${set.id}`);
					continue;
				}
				assert.ok('raw' in entry, `${adapter.id} ${set.id}`);
				// the two columns kept out of the JS
				assert.deepStrictEqual(entry.css, css);
				assert.deepStrictEqual(entry.wasm, wasm);
			}
		}
	});

	test('bundle: adding languages never shrinks a bundle', () => {
		for (const adapter of ADAPTERS) {
			const by_set = results.bundle[adapter.id]!;
			const core = by_set.core!;
			assert.ok('raw' in core);
			for (const set of FEATURE_SETS) {
				const entry = by_set[set.id]!;
				if (!('raw' in entry)) continue;
				assert.ok(entry.raw >= core.raw, `${adapter.id} ${set.id} is smaller than core`);
				// and a set is at least as large as each single language in it
				for (const lang of set.langs) {
					const single = by_set[`single:${lang}`]!;
					assert.ok('raw' in single && entry.raw >= single.raw, `${adapter.id} ${set.id} ${lang}`);
				}
			}
		}
	});

	test('heap: a reading for every timed language a library claims, and only those', () => {
		for (const adapter of ADAPTERS) {
			const claimed = TIMED_LANGS.filter((lang) => Object.hasOwn(adapter.langs, lang));
			assert.deepStrictEqual(Object.keys(results.heap[adapter.id]!), claimed, adapter.id);
		}
	});
});

describe('keep_agreeing_heaps', () => {
	test('keeps a committed reading within the tolerance, and takes one outside it', () => {
		const generated = load();
		const committed = load();
		const ts = generated.heap.prism!.ts!;
		committed.heap.prism!.ts = { ...ts, retained_kb: ts.retained_kb + HEAP_TOLERANCE_KB };
		committed.heap.prism!.js = {
			...generated.heap.prism!.js!,
			external_kb: generated.heap.prism!.js!.external_kb + HEAP_TOLERANCE_KB + 1
		};
		const kept = keep_agreeing_heaps(committed, generated);
		assert.deepStrictEqual(kept.heap.prism!.ts, committed.heap.prism!.ts);
		assert.deepStrictEqual(kept.heap.prism!.js, generated.heap.prism!.js);
		// only the heap is touched, and a check then names only the reading outside the tolerance
		assert.deepStrictEqual({ ...kept, heap: generated.heap }, generated);
		assert.deepStrictEqual(
			diff_json(committed, kept).map((line) => line.split(':')[0]),
			['heap.prism.js.external_kb']
		);
	});

	test('takes every reading when there is no committed file', () => {
		assert.strictEqual(keep_agreeing_heaps(null, results), results);
		assert.strictEqual(keep_agreeing_heaps({ heap: 'no' }, results), results);
	});
});

describe('diff_json', () => {
	test('finds nothing in equal values', () => {
		assert.deepStrictEqual(diff_json(JSON.parse(text), results), []);
	});

	test('names each place that differs, and a cell by its id', () => {
		const changed = load();
		const cell = changed.cells.find((c) => c.mode === 'tokenize')!;
		cell.tokens.prism = cell.tokens.prism! + 1;
		const sizes = changed.bundle.prism!.docs!;
		assert.ok('raw' in sizes);
		sizes.gzip += 2;
		assert.deepStrictEqual(diff_json(results, changed), [
			`cells[${cell.id}].tokens.prism: committed ${cell.tokens.prism - 1}, generated ${cell.tokens.prism}`,
			`bundle.prism.docs.gzip: committed ${sizes.gzip - 2}, generated ${sizes.gzip}`
		]);
	});

	test('an entry added to a list is one difference, not one for every entry after it', () => {
		const changed = load();
		const [removed] = changed.cells.splice(0, 1);
		assert.deepStrictEqual(
			diff_json(results, changed).map((line) => line.split(':')[0]),
			[`cells[${removed!.file}`]
		);
		assert.match(diff_json(results, changed)[0]!, /generated nothing$/);
		// a list without ids is compared by position
		assert.deepStrictEqual(diff_json({ a: [1, 2] }, { a: [1, 3, 4] }), [
			'a.1: committed 2, generated 3',
			'a.2: committed nothing, generated 4'
		]);
	});
});

describe('carry_deterministic', () => {
	const context = {
		libraries: to_bench_libraries(ADAPTERS),
		corpus_hash: manifest.corpus_hash,
		sets: to_bench_sets(),
		closures: to_install_closures(ADAPTERS)
	};

	test('a run of this tree takes the bundle sizes and every expected cell number', () => {
		const carried = carry_deterministic(results, context);
		assert.ok(carried.ok);
		assert.deepStrictEqual(carried.bundle, results.bundle);
		assert.deepStrictEqual(carried.heap, results.heap);
		assert.deepStrictEqual(carried.bundler, results.meta.bundler);
		const input = results.inputs[0]!;
		const [tokenize, html] = results.cells;
		for (const adapter of ADAPTERS) {
			assert.deepStrictEqual(carried.expected.get(to_expected_key(input.file, adapter.id)), {
				tokens: tokenize!.tokens[adapter.id]!,
				output: html!.output[adapter.id]!,
				compressed: html!.compressed[adapter.id]!
			});
		}
		assert.strictEqual(carried.expected.size, results.inputs.length * ADAPTERS.length);
	});

	test('a run filtered by library takes only its own libraries', () => {
		const libraries = context.libraries.filter((l) => l.id === 'prism');
		const carried = carry_deterministic(results, { ...context, libraries });
		assert.ok(carried.ok);
		assert.deepStrictEqual(Object.keys(carried.bundle), ['prism']);
		assert.deepStrictEqual(carried.heap, { prism: results.heap.prism! });
		assert.ok([...carried.expected.keys()].every((key) => JSON.parse(key)[1] === 'prism'));
		// which is a results file's whole bundle section for that roster
		assert.deepStrictEqual(carried.bundle.prism, results.bundle.prism);
	});

	test('an excluded library is expected to be excluded, with the reason', () => {
		const changed = load();
		const [tokenize, html] = changed.cells;
		delete tokenize!.tokens.prism;
		delete html!.output.prism;
		delete html!.compressed.prism;
		for (const cell of [tokenize!, html!]) {
			changed.meta.excluded.push({ cell: cell.id, library: 'prism', reason: 'produced no HTML' });
		}
		const carried = carry_deterministic(parse_bench_results(changed), context);
		assert.ok(carried.ok);
		assert.deepStrictEqual(carried.expected.get(to_expected_key(tokenize!.file, 'prism')), {
			excluded: 'produced no HTML'
		});
	});

	test('a file that describes another tree is not carried, and says why', () => {
		const reason = (change: (c: typeof context) => typeof context): string => {
			const carried = carry_deterministic(results, change(structuredClone(context)));
			assert.ok(!carried.ok);
			return carried.reason;
		};
		assert.match(
			reason((c) => ({ ...c, corpus_hash: '0'.repeat(64) })),
			/another corpus/
		);
		assert.match(
			reason((c) => ({ ...c, sets: c.sets.slice(1) })),
			/other feature sets/
		);
		assert.match(
			reason((c) => {
				c.libraries[0]!.version = '99.0.0';
				return c;
			}),
			/it measured twinkleplop with @twinkleplop\/core [^,]+, and this run has @twinkleplop\/core 99\.0\.0/
		);
		assert.match(
			reason((c) => {
				c.libraries.find((l) => l.id === 'prism')!.extra_packages = { 'prism-svelte': '99.0.0' };
				return c;
			}),
			/it measured prism with prism-svelte [^,]+, and this run has prism-svelte 99\.0\.0/
		);
		assert.match(
			reason((c) => {
				c.libraries[0]!.id = 'highlight_js';
				return c;
			}),
			/no library "highlight_js"/
		);
		// a dependency the lockfile moved, under the same version of the library
		assert.match(
			reason((c) => ({ ...c, closures: { ...c.closures, shiki_js: '0'.repeat(64) } })),
			/it measured shiki_js with other versions of its dependencies than this tree installs/
		);
		const without_sizes = load();
		without_sizes.bundle = {};
		without_sizes.meta.bundler = null;
		const carried = carry_deterministic(without_sizes, context);
		assert.ok(!carried.ok);
		assert.match(carried.reason, /no bundle sizes/);
	});
});
