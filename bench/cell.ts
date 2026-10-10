/**
 * One library on one cell, measured in a process of its own. `bench/run.ts`
 * spawns this file once per library per pass, always with `--expose-gc`:
 *
 * ```bash
 * node --expose-gc bench/cell.ts '<CellSpec as JSON>'
 * ```
 *
 * It prints one `CellResult` as JSON on stdout and nothing else, and exits once
 * that is written, whatever the library leaves running.
 *
 * The process loads one library and nothing else that is measured, so no other
 * library can change its number. Two effects made that necessary. Libraries
 * that share code, like Shiki's two engines, change how the JS engine
 * optimises that code for each other. And the engine sizes its young generation
 * from what has been allocating, so one library's time depended on which
 * libraries ran beside it.
 *
 * In order, before any timing:
 *
 * 1. The library sets up exactly the cell's language, once, and the installed
 *    versions of its packages are read, for the parent to check.
 * 2. Its output is checked: on the language's harness snippet, which decides
 *    whether it is measured on the language at all, then on the cell's input. A
 *    library that fails is reported as excluded, with the reason, and is not
 *    timed.
 *
 * The token count and the HTML size come from that check, so they are taken
 * under the same setup as the timing and outside it.
 *
 * The process-per-cell idea is from the comparison harness of twinkleplop
 * (https://github.com/pngwn/twinkleplop, MIT).
 *
 * Node-only.
 *
 * @module
 */

import { z } from 'zod';

import { BenchCellOutput, BenchMode, to_bench_cell_id } from '../src/lib/results_schema.ts';
import type { HighlighterAdapter } from './adapter.ts';
import { check_output, check_snippet } from './check_output.ts';
import { load_corpus_manifest, read_corpus_input } from './corpus.ts';
import { lang_is_timed, type Lang } from './langs.ts';
import { read_package_versions } from './library_info.ts';
import {
	create_measure_deps,
	measure_call,
	type MeasureCall,
	type MeasureDeps
} from './measure.ts';

/** What the parent asks a cell process to measure. */
export const CellSpec = z.strictObject({
	file: z.string().min(1).meta({ description: "The input's path within the corpus." }),
	mode: BenchMode,
	library: z
		.string()
		.regex(/^[a-z][a-z0-9_]*$/)
		.meta({ description: 'The id of the library to measure.' }),
	rounds: z.number().int().positive(),
	target_ms: z.number().positive(),
	warmup_ms: z.number().nonnegative(),
	rewarm_ms: z.number().nonnegative()
});
export type CellSpec = z.infer<typeof CellSpec>;

/** What a library measured in one process. */
export const CellMeasurement = z.strictObject({
	tokens: z.number().int().positive(),
	output: BenchCellOutput,
	iterations: z.number().int().positive(),
	ns_per_op: z.array(z.number().positive()).min(1).meta({ description: 'One per round.' }),
	rss_peak_bytes: z
		.number()
		.int()
		.positive()
		.meta({ description: "The process's peak resident size." })
});
export type CellMeasurement = z.infer<typeof CellMeasurement>;

/**
 * What a cell process reports: the library's measurement, or the reason it
 * failed the output check and was not timed.
 */
export const CellResult = z
	.strictObject({
		cell: z.string().min(1).meta({ description: 'The id of the cell.' }),
		library: z.string().min(1),
		loaded_langs: z
			.array(z.string().min(1))
			.meta({ description: 'The languages the library was set up with.' }),
		versions: z.record(z.string().min(1), z.string().min(1)).meta({
			description:
				"The installed version of the library's package and of each of its extra packages, by package name, as the process read them."
		}),
		measurement: CellMeasurement.nullable(),
		excluded: z.string().min(1).nullable()
	})
	.refine(
		(result) => (result.measurement === null) !== (result.excluded === null),
		'a library is measured or excluded, and never both'
	);
export type CellResult = z.infer<typeof CellResult>;

/**
 * Loads one library's adapter, and no other library: the process's memory and
 * the engine's state are then that library's alone.
 *
 * @throws if the library has no adapter module
 */
export const load_adapter = async (id: string): Promise<HighlighterAdapter> => {
	const module: Record<string, HighlighterAdapter | undefined> = await import(
		`./libraries/${id}/adapter.ts`
	);
	const adapter = module[`${id}_adapter`];
	if (!adapter) throw new Error(`bench/libraries/${id}/adapter.ts doesn't export ${id}_adapter`);
	return adapter;
};

/** Receives the character the html call reads, so the engine can't drop the read. */
let html_sink = 0;

/** Reads the sink, which is what keeps the writes to it from being dropped too. */
export const read_html_sink = (): number => html_sink;

/**
 * Creates the call a cell times. It is the same for every library.
 *
 * In `html` mode the string is read once. A library may return a string the
 * engine hasn't joined up yet (a rope), which costs almost nothing to build, and
 * every consumer then pays to flatten it on first use. Reading a character
 * flattens it, so that cost is inside the clock for every library, and is free
 * for one whose string is already flat. The character goes into `html_sink`:
 * a read whose result is unused is dropped once the call is optimised, and the
 * string then stays a rope.
 */
export const create_timed_call = (
	adapter: HighlighterAdapter,
	mode: BenchMode,
	src: string,
	lang: Lang
): (() => unknown) =>
	mode === 'tokenize'
		? () => adapter.tokenize(src, lang)
		: () => {
				const html = adapter.html(src, lang);
				html_sink += html.charCodeAt(0);
				return html;
			};

/** The process's peak resident size so far, in bytes. `maxRSS` is in kilobytes. */
const read_rss_peak_bytes = (): number => process.resourceUsage().maxRSS * 1024;

/**
 * Measures one library on one cell.
 *
 * @param spec - the input, the mode, the library, and how to measure
 * @param deps - the process's clock and collector
 * @param load - loads a library's adapter by id
 * @param read_versions - reads the installed versions of the adapter's packages
 * @returns the library's measurement, or why it was excluded
 * @throws if the input or the library is unknown, the language isn't timed or
 * isn't claimed, or the library's output changes between rounds
 */
export const run_cell = async (
	spec: CellSpec,
	deps: MeasureDeps = create_measure_deps(),
	load: (id: string) => Promise<HighlighterAdapter> = load_adapter,
	read_versions: (adapter: HighlighterAdapter) => Record<string, string> = read_package_versions
): Promise<CellResult> => {
	const { mode } = spec;
	const manifest = load_corpus_manifest();
	const input = manifest.inputs.find((i) => i.file === spec.file);
	if (!input) throw new Error(`unknown corpus input "${spec.file}"`);
	const { lang } = input;
	if (!lang_is_timed(lang)) throw new Error(`lang "${lang}" is not timed, so no cell covers it`);
	const snippet = manifest.inputs.find((i) => i.source === 'harness' && i.lang === lang);
	if (!snippet) throw new Error(`lang "${lang}" has no harness snippet to gate on`);
	const src = read_corpus_input(input);
	const snippet_src = snippet === input ? src : read_corpus_input(snippet);

	// the loaded-language rule: exactly the cell's language, once
	const loaded_langs = [lang];
	const adapter = await load(spec.library);
	await adapter.setup(loaded_langs);
	// what this process loaded, which the parent holds against the versions the run planned with
	const versions = read_versions(adapter);

	const result = (outcome: Pick<CellResult, 'measurement' | 'excluded'>): CellResult => ({
		cell: to_bench_cell_id(input.file, mode),
		library: adapter.id,
		loaded_langs,
		versions,
		...outcome
	});

	// a `LangNotSetUpError` propagates from either check: that is this harness's bug
	const gate = check_snippet(adapter, lang, snippet_src);
	if (!gate.ok) return result({ measurement: null, excluded: gate.reason });
	const check = snippet === input ? gate : check_output(adapter, lang, src);
	if (!check.ok) return result({ measurement: null, excluded: check.reason });

	const run = create_timed_call(adapter, mode, src, lang);
	const call: MeasureCall =
		mode === 'tokenize'
			? { run, count: (tokens) => adapter.count_tokens(tokens), expected: check.tokens }
			: {
					run,
					count: (html) => Buffer.byteLength(html as string),
					expected: check.output.html_bytes
				};
	const measured = measure_call(call, spec, deps);
	return result({
		measurement: {
			tokens: check.tokens,
			output: check.output,
			iterations: measured.iterations,
			ns_per_op: measured.ns_per_op,
			rss_peak_bytes: read_rss_peak_bytes()
		},
		excluded: null
	});
};

if (import.meta.main) {
	const spec = CellSpec.parse(JSON.parse(process.argv[2] ?? 'null'));
	const result = await run_cell(spec);
	// exits once the line is written, so a handle the library leaves open can't keep the process
	// alive; the callback waits for the write, which is asynchronous to a pipe
	process.stdout.write(JSON.stringify(result) + '\n', (error) => process.exit(error ? 1 : 0));
}
