/**
 * The deterministic numbers of the cells: each library's token count and HTML
 * size on every input, with nothing timed.
 *
 * They are taken the way a timed cell takes them, by the same check
 * (`bench/check_output.ts`) under the same rule: a process sets up exactly one
 * language in one library, runs the snippet gate, and then checks every input
 * of that language. One process per library and language is enough, since
 * nothing is timed, and no process ever loads a second language: Prism's
 * registry is global and only grows, so a second one would change what the
 * first highlights.
 *
 * ```bash
 * node bench/outputs.ts '{"library":"prism","lang":"md"}'
 * ```
 *
 * prints one `OutputsResult` as JSON. `bench/deterministic.ts` runs it for every
 * library and language and folds the results into cells.
 *
 * Node-only.
 *
 * @module
 */

import { fileURLToPath } from 'node:url';
import { map_concurrent } from '@fuzdev/fuz_util/async.js';
import { z } from 'zod';

import {
	BenchCellOutput,
	BenchMode,
	to_bench_cell_id,
	type BenchCell,
	type BenchExcluded,
	type BenchInput
} from '../src/lib/results_schema.ts';
import type { HighlighterAdapter } from './adapter.ts';
import { load_adapter } from './cell.ts';
import { check_output, check_snippet, type OutputCheckResult } from './check_output.ts';
import { load_corpus_manifest, read_corpus_input, type CorpusInput } from './corpus.ts';
import { is_lang, lang_is_timed, TIMED_LANGS } from './langs.ts';
import { run_node_json } from './node_child.ts';

const OUTPUTS_PATH = fileURLToPath(import.meta.url);

/** What one process of the pass is asked for: one library on one language. */
export const OutputsSpec = z.strictObject({
	library: z.string().regex(/^[a-z][a-z0-9_]*$/),
	lang: z.string().min(1)
});
export type OutputsSpec = z.infer<typeof OutputsSpec>;

/** One library's numbers on one input, or why it is excluded there. */
export const InputOutput = z.discriminatedUnion('ok', [
	z.strictObject({
		file: z.string().min(1),
		ok: z.literal(true),
		tokens: z.number().int().positive(),
		output: BenchCellOutput
	}),
	z.strictObject({ file: z.string().min(1), ok: z.literal(false), reason: z.string().min(1) })
]);
export type InputOutput = z.infer<typeof InputOutput>;

/** What one process of the pass reports: every input of the language. */
export const OutputsResult = z.strictObject({
	library: z.string().min(1),
	lang: z.string().min(1),
	loaded_langs: z
		.array(z.string().min(1))
		.meta({ description: 'The languages the library was set up with.' }),
	inputs: z.array(InputOutput)
});
export type OutputsResult = z.infer<typeof OutputsResult>;

/**
 * Checks one library on every input of one language, in this process.
 *
 * A library that fails the snippet gate is excluded from every input of the
 * language, with the gate's reason, exactly as a timed cell excludes it.
 *
 * @param spec - the library and the language
 * @param load - loads a library's adapter by id
 * @throws if the language is unknown, isn't timed, or has no harness snippet
 */
export const run_outputs = async (
	spec: OutputsSpec,
	load: (id: string) => Promise<HighlighterAdapter> = load_adapter
): Promise<OutputsResult> => {
	const { lang } = spec;
	if (!is_lang(lang) || !lang_is_timed(lang)) {
		throw new Error(`lang "${lang}" is not timed, so no cell covers it`);
	}
	const inputs = load_corpus_manifest().inputs.filter((input) => input.lang === lang);
	const snippet = inputs.find((input) => input.source === 'harness');
	if (!snippet) throw new Error(`lang "${lang}" has no harness snippet to gate on`);

	// the loaded-language rule: exactly this language, once
	const loaded_langs = [lang];
	const adapter = await load(spec.library);
	await adapter.setup(loaded_langs);

	const gate = check_snippet(adapter, lang, read_corpus_input(snippet));
	return {
		library: adapter.id,
		lang,
		loaded_langs,
		inputs: inputs.map((input): InputOutput => {
			const check: OutputCheckResult =
				!gate.ok || input === snippet
					? gate
					: check_output(adapter, lang, read_corpus_input(input));
			return { file: input.file, ...check };
		})
	};
};

/**
 * Runs the pass: a process for every library on every timed language it claims,
 * several at a time.
 *
 * @param adapters - the libraries
 * @param concurrency - how many processes run at once
 * @returns every process's result, by library and then language
 * @throws if a process fails or reports on something it wasn't asked for
 */
export const measure_outputs = async (
	adapters: ReadonlyArray<HighlighterAdapter>,
	concurrency: number
): Promise<Array<OutputsResult>> => {
	const specs = adapters.flatMap((adapter) =>
		TIMED_LANGS.filter((lang) => Object.hasOwn(adapter.langs, lang)).map((lang): OutputsSpec => ({
			library: adapter.id,
			lang
		}))
	);
	return map_concurrent(specs, concurrency, async (spec) => {
		const label = `the outputs of ${spec.library} on ${spec.lang}`;
		const result = OutputsResult.parse(await run_node_json(OUTPUTS_PATH, spec, label));
		if (
			result.library !== spec.library ||
			result.lang !== spec.lang ||
			result.loaded_langs.length !== 1 ||
			result.loaded_langs[0] !== spec.lang
		) {
			throw new Error(`${label} came back as ${result.library} on [${result.loaded_langs}]`);
		}
		return result;
	});
};

/** A library's deterministic numbers on a cell, when it has any there. */
export interface CellNumbers {
	tokens: number;
	output: BenchCellOutput;
}

/**
 * Builds a cell of a results file from its input and its mode.
 *
 * Each deterministic number is stated once for an input, on the cell whose call
 * returns it: the token count on the `tokenize` cell and the HTML size on the
 * `html` cell. Both the timed harness and the deterministic pass build their
 * cells here, so a cell is shaped the same whichever wrote it.
 *
 * @param input - the cell's input
 * @param mode - the cell's mode
 * @param numbers - each measured library's token count and HTML size, in roster order
 * @param values - each measured library's timing, or none for a deterministic file
 */
export const to_bench_cell = (
	input: BenchInput,
	mode: BenchMode,
	numbers: ReadonlyArray<readonly [library: string, numbers: CellNumbers]>,
	values: BenchCell['values'] = {}
): BenchCell => ({
	id: to_bench_cell_id(input.file, mode),
	metric: 'throughput',
	lang: input.lang,
	size: input.size,
	mode,
	source: input.source,
	home: input.home,
	file: input.file,
	bytes: input.bytes,
	lines: input.lines,
	synthetic: input.synthetic,
	values,
	tokens:
		mode === 'tokenize' ? Object.fromEntries(numbers.map(([id, own]) => [id, own.tokens])) : {},
	output: mode === 'html' ? Object.fromEntries(numbers.map(([id, own]) => [id, own.output])) : {}
});

/**
 * Folds the pass's results into the cells of a deterministic results file:
 * every input of a timed language that some library claims, in every mode, with
 * no timed values.
 *
 * A library that failed the check on an input has no numbers there and an
 * `excluded` entry for each of the input's cells, as in a timed run. A library
 * that doesn't claim the language was never asked, and has neither.
 *
 * @param inputs - the corpus manifest's inputs
 * @param adapters - the libraries, in roster order
 * @param outputs - what `measure_outputs` returned for them
 * @returns the inputs that have cells, the cells in manifest order, and the exclusions
 * @throws if a claimed library has no result for an input
 */
export const to_deterministic_cells = (
	inputs: ReadonlyArray<CorpusInput>,
	adapters: ReadonlyArray<HighlighterAdapter>,
	outputs: ReadonlyArray<OutputsResult>
): { inputs: Array<CorpusInput>; cells: Array<BenchCell>; excluded: Array<BenchExcluded> } => {
	const by_key = new Map(
		outputs.flatMap((result) =>
			result.inputs.map((input) => [JSON.stringify([result.library, input.file]), input] as const)
		)
	);
	const covered: Array<CorpusInput> = [];
	const cells: Array<BenchCell> = [];
	const excluded: Array<BenchExcluded> = [];
	for (const input of inputs) {
		if (!lang_is_timed(input.lang)) continue;
		const claiming = adapters.filter((adapter) => Object.hasOwn(adapter.langs, input.lang));
		if (claiming.length === 0) continue;
		const numbers: Array<[string, CellNumbers]> = [];
		const failed: Array<{ library: string; reason: string }> = [];
		for (const { id } of claiming) {
			const own = by_key.get(JSON.stringify([id, input.file]));
			if (!own) throw new Error(`${id} has no output for "${input.file}"`);
			if (own.ok) numbers.push([id, { tokens: own.tokens, output: own.output }]);
			else failed.push({ library: id, reason: own.reason });
		}
		covered.push(input);
		for (const mode of BenchMode.options) {
			const cell = to_bench_cell(input, mode, numbers);
			cells.push(cell);
			for (const { library, reason } of failed) excluded.push({ cell: cell.id, library, reason });
		}
	}
	return { inputs: covered, cells, excluded };
};

if (import.meta.main) {
	const spec = OutputsSpec.parse(JSON.parse(process.argv[2] ?? 'null'));
	const result = await run_outputs(spec);
	// exits once the line is written, so a handle the library leaves open can't keep the process
	// alive; the callback waits for the write, which is asynchronous to a pipe
	process.stdout.write(JSON.stringify(result) + '\n', (error) => process.exit(error ? 1 : 0));
}
