import { assert, describe, test } from 'vitest';

import { LangNotSetUpError, type HighlighterAdapter } from '../../../bench/adapter.ts';
import {
	CellResult,
	CellSpec,
	create_timed_call,
	load_adapter,
	read_html_sink,
	run_cell
} from '../../../bench/cell.ts';
import { MIN_SNIPPET_SPAN_KINDS } from '../../../bench/check_output.ts';
import { load_corpus_manifest, read_corpus_input } from '../../../bench/corpus.ts';
import { ADAPTERS } from '../../../bench/libraries.ts';
import type { MeasureDeps } from '../../../bench/measure.ts';
import { SMOKE_PARAMS } from '../../../bench/run_options.ts';

// A file of its own: `run_cell` sets a language up in an adapter, as a cell's
// process does.

/** The real clock, and collections that do nothing: the test process has no `gc`. */
const deps: MeasureDeps = { now: () => process.hrtime.bigint(), collect: () => {} };

const manifest = load_corpus_manifest();
const SNIPPET = 'harness/json/snippet.json';
const INPUT = manifest.inputs.find((i) => i.lang === 'json' && i.source === 'neutral')!.file;
const snippet_src = read_corpus_input(manifest.inputs.find((i) => i.file === SNIPPET)!);

const { passes: _, ...SMOKE_MEASURE } = SMOKE_PARAMS;

const create_spec = (overrides: Partial<CellSpec> = {}): CellSpec => ({
	file: SNIPPET,
	mode: 'tokenize',
	library: 'fuz_code',
	...SMOKE_MEASURE,
	...overrides
});

const HIGHLIGHTED = Array.from(
	{ length: MIN_SNIPPET_SPAN_KINDS },
	(_v, i) => `<span class="k${i}">x</span>`
).join('');

/** A library that claims JSON and returns what the test gives it, logging its calls. */
const create_stub = (
	overrides: Partial<Pick<HighlighterAdapter<number>, 'tokenize' | 'html'>> = {}
): { load: () => Promise<HighlighterAdapter>; log: Array<string> } => {
	const log: Array<string> = [];
	const adapter: HighlighterAdapter<number> = {
		id: 'stub',
		label: 'stub',
		package: 'stub',
		by_maintainer: false,
		note: null,
		langs: { json: 'json' },
		via: {},
		output: 'classes',
		engine: 'regex',
		theme_css: [],
		setup: async (langs) => {
			log.push(`setup ${langs.join(',')}`);
		},
		tokenize: (src, lang) => {
			if (log.at(-1) !== 'tokenize') log.push('tokenize');
			return overrides.tokenize ? overrides.tokenize(src, lang) : 3;
		},
		count_tokens: (tokens) => tokens,
		html: (src, lang) => {
			if (log.at(-1) !== 'html') log.push('html');
			return overrides.html ? overrides.html(src, lang) : HIGHLIGHTED;
		},
		bundle_entry: () => ''
	};
	return { load: () => Promise.resolve(adapter), log };
};

const run_stub = (stub: ReturnType<typeof create_stub>, overrides: Partial<CellSpec> = {}) =>
	run_cell(create_spec({ library: 'stub', ...overrides }), deps, stub.load);

const catch_error = async (run: () => Promise<unknown>): Promise<unknown> => {
	try {
		await run();
	} catch (error) {
		return error;
	}
	return undefined;
};

describe('load_adapter', () => {
	test('loads each library of the roster by its id', async () => {
		for (const adapter of ADAPTERS) {
			assert.strictEqual((await load_adapter(adapter.id)).id, adapter.id);
		}
	});

	test('fails for a library with no adapter', async () => {
		assert.ok((await catch_error(() => load_adapter('highlight_js'))) instanceof Error);
	});
});

describe('create_timed_call', () => {
	test('tokenize returns the library result untouched, and html the string', async () => {
		const stub = create_stub();
		const adapter = await stub.load();
		assert.strictEqual(create_timed_call(adapter, 'tokenize', 'x', 'json')(), 3);
		assert.strictEqual(create_timed_call(adapter, 'html', 'x', 'json')(), HIGHLIGHTED);
	});

	test('html reads the string, which is what flattens a rope', async () => {
		let read = 0;
		const html = {
			charCodeAt: () => {
				read++;
				return 7;
			}
		} as unknown as string;
		const adapter = await create_stub({ html: () => html }).load();
		const before = read_html_sink();
		assert.strictEqual(create_timed_call(adapter, 'html', 'x', 'json')(), html);
		assert.strictEqual(read, 1);
		// the character read is kept, so the read can't be optimised away
		assert.strictEqual(read_html_sink(), before + 7);
	});
});

describe('run_cell', () => {
	test('measures the library and reports the cell', async () => {
		const result = await run_cell(create_spec(), deps);
		CellResult.parse(result);
		assert.strictEqual(result.cell, `${SNIPPET}:tokenize`);
		assert.strictEqual(result.library, 'fuz_code');
		assert.deepStrictEqual(result.loaded_langs, ['json']);
		assert.strictEqual(result.excluded, null);
		const measurement = result.measurement!;
		assert.strictEqual(measurement.ns_per_op.length, SMOKE_PARAMS.rounds);
		assert.ok(measurement.ns_per_op[0]! > 0);
		assert.ok(measurement.iterations > 0);
		assert.ok(measurement.tokens > 0);
		assert.ok(measurement.output.html_bytes > 0);
		// a whole process, in bytes: far more than the kilobytes the OS reports it in
		assert.ok(measurement.rss_peak_bytes > 10_000_000);
	});

	test('the token count and HTML size are the same in both modes of an input', async () => {
		const tokenize = await run_cell(create_spec({ file: INPUT, library: 'prism' }), deps);
		const html = await run_cell(create_spec({ file: INPUT, library: 'prism', mode: 'html' }), deps);
		assert.strictEqual(html.cell, `${INPUT}:html`);
		assert.strictEqual(html.measurement!.tokens, tokenize.measurement!.tokens);
		assert.deepStrictEqual(html.measurement!.output, tokenize.measurement!.output);
	});

	test('sets up exactly the cell language, once, before anything else', async () => {
		const stub = create_stub();
		const result = await run_stub(stub);
		// the check runs both stages, and only then is the cell's mode timed
		assert.deepStrictEqual(stub.log, ['setup json', 'tokenize', 'html', 'tokenize']);
		assert.strictEqual(result.measurement!.tokens, 3);
		assert.strictEqual(result.measurement!.output.html_bytes, HIGHLIGHTED.length);
	});

	test('a library that fails the snippet gate is excluded from every cell of the language', async () => {
		// a plain-text fallback: a line wrapper and nothing else
		const stub = create_stub({ html: (src) => `<span class="line">${src.length}</span>` });
		const reasons: Array<string | null> = [];
		for (const file of [SNIPPET, INPUT]) {
			for (const mode of ['tokenize', 'html'] as const) {
				stub.log.length = 0;
				const result = await run_stub(stub, { file, mode });
				assert.strictEqual(result.measurement, null);
				reasons.push(result.excluded);
				// checked once, on the snippet, and never timed
				assert.deepStrictEqual(stub.log, ['setup json', 'tokenize', 'html']);
				CellResult.parse(result);
			}
		}
		assert.strictEqual(new Set(reasons).size, 1);
		assert.match(reasons[0]!, /^failed the check on the json snippet: .*plain-text fallback/);
	});

	test('a library that passes the gate and fails on the input is excluded from that cell', async () => {
		const stub = create_stub({ html: (src) => (src === snippet_src ? HIGHLIGHTED : '') });
		assert.strictEqual((await run_stub(stub)).excluded, null);
		const on_input = await run_stub(stub, { file: INPUT });
		assert.strictEqual(on_input.measurement, null);
		assert.strictEqual(on_input.excluded, 'produced no HTML');
	});

	test('a language that is not set up crashes the cell instead of excluding the library', async () => {
		const stub = create_stub({
			tokenize: () => {
				throw new LangNotSetUpError('stub', 'json');
			}
		});
		assert.ok((await catch_error(() => run_stub(stub))) instanceof LangNotSetUpError);
	});

	test('a token count that changes between calls fails the cell', async () => {
		let calls = 0;
		// as a tokenizer that hits a time limit on a slow line: fewer tokens, no error
		const stub = create_stub({ tokenize: () => (++calls > 3 ? 2 : 3) });
		const error = await catch_error(() => run_stub(stub));
		assert.ok(error instanceof Error);
		assert.match(error.message, /a result of size 2 .* not the 3 it was checked with/);
	});

	test('refuses a cell it should never have been asked for', async () => {
		const assert_rejects = async (run: () => Promise<unknown>, expected: RegExp): Promise<void> => {
			const error = await catch_error(run);
			assert.ok(error instanceof Error, 'expected the cell to fail');
			assert.match(error.message, expected);
		};
		await assert_rejects(
			() => run_cell(create_spec({ file: 'neutral/json/missing.json' }), deps),
			/unknown corpus input/
		);
		await assert_rejects(
			() => run_cell(create_spec({ file: 'harness/xml/snippet.xml' }), deps),
			/"xml" is not timed/
		);
		// a library that doesn't claim the language is unsupported, and the parent leaves it out
		const rust = manifest.inputs.find((i) => i.lang === 'rust')!;
		await assert_rejects(
			() => run_stub(create_stub(), { file: rust.file }),
			/doesn't claim lang "rust"/
		);
	});
});

describe('CellSpec and CellResult', () => {
	test('a spec is strict about what a cell is asked', () => {
		CellSpec.parse(create_spec());
		assert.ok(!CellSpec.safeParse({ ...create_spec(), extra: 1 }).success);
		assert.ok(!CellSpec.safeParse({ ...create_spec(), library: '../x' }).success);
		assert.ok(!CellSpec.safeParse({ ...create_spec(), mode: 'render' }).success);
		assert.ok(!CellSpec.safeParse({ ...create_spec(), rounds: 0 }).success);
		assert.ok(!CellSpec.safeParse(null).success);
	});

	test('a result is a measurement or an exclusion, never both or neither', () => {
		const base = { cell: 'c', library: 'l', loaded_langs: ['json'] };
		const measurement = {
			tokens: 1,
			output: { html_bytes: 1, spans: 0 },
			iterations: 1,
			ns_per_op: [1],
			rss_peak_bytes: 1
		};
		CellResult.parse({ ...base, measurement, excluded: null });
		CellResult.parse({ ...base, measurement: null, excluded: 'why' });
		assert.ok(!CellResult.safeParse({ ...base, measurement, excluded: 'why' }).success);
		assert.ok(!CellResult.safeParse({ ...base, measurement: null, excluded: null }).success);
	});
});
