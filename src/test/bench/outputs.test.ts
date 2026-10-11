import { assert, describe, test } from 'vitest';

import { BenchCell, BenchMode } from '#lib/results_schema.ts';
import type { HighlighterAdapter } from '../../../bench/adapter.ts';
import { MIN_SNIPPET_SPAN_KINDS } from '../../../bench/check_output.ts';
import { load_corpus_manifest } from '../../../bench/corpus.ts';
import { TIMED_LANGS } from '../../../bench/langs.ts';
import { ADAPTERS } from '../../../bench/libraries.ts';
import {
	OutputsResult,
	run_outputs,
	to_bench_cell,
	to_deterministic_cells,
	type CellNumbers
} from '../../../bench/outputs.ts';

const manifest = load_corpus_manifest();

const HIGHLIGHTED = Array.from(
	{ length: MIN_SNIPPET_SPAN_KINDS },
	(_v, i) => `<span class="k${i}">x</span>`
).join('');

/** A library that claims JSON and returns what the test gives it, logging what it was set up with. */
const create_stub = (
	html: (src: string) => string = () => HIGHLIGHTED
): { load: () => Promise<HighlighterAdapter>; setups: Array<ReadonlyArray<string>> } => {
	const setups: Array<ReadonlyArray<string>> = [];
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
		theme_schemes: ['light'],
		setup: async (langs) => {
			setups.push(langs);
		},
		tokenize: (src) => Buffer.byteLength(src),
		count_tokens: (tokens) => tokens,
		html,
		bundle_entry: () => '',
		bundle_html: () => HIGHLIGHTED,
		bundle_html_source: () => 'null'
	};
	return { load: () => Promise.resolve(adapter), setups };
};

const JSON_INPUTS = manifest.inputs.filter((input) => input.lang === 'json');

describe('run_outputs', () => {
	test('sets up exactly the language, once, and reports every input of it', async () => {
		const stub = create_stub();
		const result = OutputsResult.parse(
			await run_outputs({ library: 'stub', lang: 'json' }, stub.load)
		);
		assert.deepStrictEqual(stub.setups, [['json']]);
		assert.deepStrictEqual(result.loaded_langs, ['json']);
		assert.deepStrictEqual(
			result.inputs.map((input) => input.file),
			JSON_INPUTS.map((input) => input.file)
		);
		for (const [i, input] of result.inputs.entries()) {
			assert.ok(input.ok);
			assert.strictEqual(input.tokens, JSON_INPUTS[i]!.bytes);
			assert.deepStrictEqual(input.output, {
				html_bytes: Buffer.byteLength(HIGHLIGHTED),
				spans: MIN_SNIPPET_SPAN_KINDS
			});
		}
	});

	test('a library that fails the snippet gate is excluded from every input of the language', async () => {
		const stub = create_stub(() => '<span class="a">x</span>');
		const result = await run_outputs({ library: 'stub', lang: 'json' }, stub.load);
		assert.ok(result.inputs.length > 1);
		for (const input of result.inputs) {
			assert.ok(!input.ok);
			assert.match(input.reason, /^failed the check on the json snippet: /);
		}
	});

	test('a library that fails on one input is excluded from that input alone', async () => {
		const snippet = JSON_INPUTS.find((input) => input.source === 'harness')!;
		const stub = create_stub((src) =>
			Buffer.byteLength(src) === snippet.bytes ? HIGHLIGHTED : ''
		);
		const result = await run_outputs({ library: 'stub', lang: 'json' }, stub.load);
		for (const input of result.inputs) {
			assert.strictEqual(input.ok, input.file === snippet.file, input.file);
			if (!input.ok) assert.strictEqual(input.reason, 'produced no HTML');
		}
	});

	test('refuses a language no cell covers', async () => {
		for (const lang of ['xml', 'tsx']) {
			let error: unknown;
			try {
				await run_outputs({ library: 'stub', lang }, create_stub().load);
			} catch (caught) {
				error = caught;
			}
			assert.ok(error instanceof Error);
			assert.match(error.message, /is not timed/);
		}
	});
});

const NUMBERS = {
	tokens: 7,
	output: { html_bytes: 70, spans: 6 },
	compressed: { gzip: 60, brotli: 50 }
} satisfies CellNumbers;

describe('to_bench_cell', () => {
	const input = JSON_INPUTS[0]!;

	test('states the token counts on the tokenize cell and the output sizes on the html cell', () => {
		const numbers = [
			['fuz_code', NUMBERS],
			['prism', { tokens: 9, output: { html_bytes: 90, spans: 8 }, compressed: null }]
		] as const;
		const tokenize = BenchCell.parse(to_bench_cell(input, 'tokenize', numbers));
		assert.deepStrictEqual(tokenize.tokens, { fuz_code: 7, prism: 9 });
		assert.deepStrictEqual(tokenize.output, {});
		assert.deepStrictEqual(tokenize.compressed, {});
		const html = BenchCell.parse(to_bench_cell(input, 'html', numbers));
		assert.deepStrictEqual(html.tokens, {});
		// a library with no compressed sizes, as in a run that doesn't carry the deterministic file
		assert.deepStrictEqual(html.compressed, { fuz_code: { gzip: 60, brotli: 50 } });
		assert.deepStrictEqual(html.output, {
			fuz_code: { html_bytes: 70, spans: 6 },
			prism: { html_bytes: 90, spans: 8 }
		});
		for (const cell of [tokenize, html]) {
			assert.strictEqual(cell.id, `${input.file}:${cell.mode}`);
			assert.deepStrictEqual(cell.values, {});
			assert.strictEqual(cell.bytes, input.bytes);
			assert.strictEqual(cell.lang, input.lang);
		}
	});
});

describe('to_deterministic_cells', () => {
	const adapters = ADAPTERS.filter((a) => a.id === 'fuz_code' || a.id === 'twinkleplop');

	/** A pass's results where every library got `NUMBERS` on every input, but for `failing`. */
	const create_outputs = (failing: { library: string; file: string } | null = null) =>
		adapters.flatMap((adapter) =>
			TIMED_LANGS.map((lang): OutputsResult => ({
				library: adapter.id,
				lang,
				loaded_langs: [lang],
				inputs: manifest.inputs
					.filter((input) => input.lang === lang)
					.map((input) =>
						failing?.library === adapter.id && failing.file === input.file
							? { file: input.file, ok: false, reason: 'produced no HTML' }
							: { file: input.file, ok: true, ...NUMBERS }
					)
			}))
		);

	test('makes a cell in every mode for every input of a timed language, in manifest order', () => {
		const { inputs, cells, excluded } = to_deterministic_cells(
			manifest.inputs,
			adapters,
			create_outputs()
		);
		const timed = manifest.inputs.filter((input) => input.lang !== 'xml');
		assert.ok(timed.length < manifest.inputs.length);
		assert.deepStrictEqual(inputs, timed);
		assert.deepStrictEqual(
			cells.map((cell) => cell.id),
			timed.flatMap((input) => BenchMode.options.map((mode) => `${input.file}:${mode}`))
		);
		assert.deepStrictEqual(excluded, []);
		for (const cell of cells) {
			assert.deepStrictEqual(cell.values, {});
			// roster order
			assert.deepStrictEqual(Object.keys(cell.mode === 'tokenize' ? cell.tokens : cell.output), [
				'fuz_code',
				'twinkleplop'
			]);
		}
	});

	test('a library that failed on an input is excluded from both of its cells, with the reason', () => {
		const file = JSON_INPUTS[0]!.file;
		const { cells, excluded } = to_deterministic_cells(
			manifest.inputs,
			adapters,
			create_outputs({ library: 'twinkleplop', file })
		);
		assert.deepStrictEqual(
			excluded,
			BenchMode.options.map((mode) => ({
				cell: `${file}:${mode}`,
				library: 'twinkleplop',
				reason: 'produced no HTML'
			}))
		);
		for (const cell of cells.filter((c) => c.file === file)) {
			assert.deepStrictEqual(Object.keys(cell.mode === 'tokenize' ? cell.tokens : cell.output), [
				'fuz_code'
			]);
		}
	});

	test('an input no library claims has no cell, and a claimed one without a result throws', () => {
		const { inputs, cells } = to_deterministic_cells(manifest.inputs, [], []);
		assert.deepStrictEqual(inputs, []);
		assert.deepStrictEqual(cells, []);
		assert.throws(
			() => to_deterministic_cells(manifest.inputs, adapters, create_outputs().slice(1)),
			/fuz_code has no output for/
		);
	});
});
