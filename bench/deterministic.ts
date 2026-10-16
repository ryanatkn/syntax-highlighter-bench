/**
 * The deterministic results file: every number of the benchmark that is the
 * same on any machine. Bundle sizes over the feature sets, each library's
 * install footprint, its retained heap on each language, its token count and
 * HTML size on every input with the HTML's compressed sizes, and the coverage
 * matrix.
 *
 * ```bash
 * node bench/deterministic.ts           # regenerate results/deterministic.json
 * node bench/deterministic.ts --check   # regenerate in memory, and fail if the committed file differs
 * node bench/deterministic.ts --out <path>
 * ```
 *
 * The file is committed, and regenerating it on an unchanged tree changes
 * nothing: it goes through `BenchResults` like any results file, with no timed
 * value in it and so no machine, time, Node version, or commit. What its numbers
 * depend on is in it instead: each library's version, the corpus hash, and what
 * the bundles were built with. Two inputs aren't recorded: the compressed sizes
 * depend on the zlib and brotli inside Node, the install footprints on the
 * transitive versions the lockfile installs, and the retained heaps on the Node
 * version and the platform (`bench/heap.ts`). The heaps can also differ by a few
 * kibibytes between two readings, so `--check` compares them within a tolerance
 * (`heap_readings_agree`) and every other number exactly.
 *
 * A timed run relates to it in two ways (`carry_deterministic`). The run's
 * cells get their token counts and HTML sizes from their own processes, by the
 * same check under the same setup, and every one is compared with this file as
 * it arrives. And the run copies the bundle sizes, the install footprints, the
 * retained heaps, and the HTML's compressed sizes from this file rather than measuring them again. Both happen only when the file describes the run: the
 * same library versions, corpus, and sets.
 *
 * Node-only.
 *
 * @module
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import * as s from '@fuzdev/fuz_schema/schema.ts';

import { HEAP_TOLERANCE_KB, HEAP_TOLERANCE_RATIO } from '../src/lib/bench_constants.ts';
import {
	BenchHeap,
	BenchResults,
	heap_readings_agree,
	order_keys_by_schema,
	parse_bench_results,
	type BenchBundler,
	type BenchCellCompressed,
	type BenchLibrary,
	type BenchSet
} from '../src/lib/results_schema.ts';
import type { HighlighterAdapter } from './adapter.ts';
import { load_corpus_manifest } from './corpus.ts';
import { measure_heaps } from './heap.ts';
import { LANG_ROSTER } from './langs.ts';
import { ADAPTERS } from './libraries.ts';
import { measure_installs } from './install.ts';
import { find_library_change, to_bench_coverage, to_bench_libraries } from './library_info.ts';
import { measure_outputs, to_deterministic_cells, type CellNumbers } from './outputs.ts';
import { RESULTS_DIR } from './run_options.ts';
import { FEATURE_SETS, to_bench_sets } from './sets.ts';
import { measure_bundles, read_bundler, type MeasureBundlesOptions } from './sizes.ts';

/** The path of the committed deterministic results file. */
export const to_deterministic_path = (dir: string = RESULTS_DIR): string =>
	join(dir, 'deterministic.json');

/**
 * The text of a results file: what is written to disk, and what a check
 * compares. Keys are in the schema's order, whatever order the harness built
 * them in.
 */
export const serialize_results = (results: BenchResults): string =>
	JSON.stringify(order_keys_by_schema(BenchResults, results), null, '\t') + '\n';

/** How `build_deterministic_results` is run. */
export interface BuildDeterministicOptions extends MeasureBundlesOptions {
	/** The libraries. Defaults to the roster. */
	adapters?: ReadonlyArray<HighlighterAdapter>;
}

/**
 * Measures everything deterministic and assembles it as a results file.
 *
 * @returns the results, as `BenchResults` parsed them
 * @throws if a bundle doesn't build or fails its check, a process of the output
 * pass fails, or the assembled file doesn't match `BenchResults`
 */
export const build_deterministic_results = async (
	options: BuildDeterministicOptions = {}
): Promise<BenchResults> => {
	const { adapters = ADAPTERS, log } = options;
	const concurrency = options.concurrency ?? Math.max(1, availableParallelism());
	const manifest = load_corpus_manifest();
	const outputs = await measure_outputs(adapters, concurrency);
	const { inputs, cells, excluded } = to_deterministic_cells(manifest.inputs, adapters, outputs);
	log?.(`checked ${inputs.length} inputs: token counts and HTML sizes`);
	const bundle = await measure_bundles(adapters, FEATURE_SETS, {
		...(options.out_dir !== undefined && { out_dir: options.out_dir }),
		...(log && { log }),
		concurrency
	});
	const heap = await measure_heaps(adapters, {
		...(options.out_dir !== undefined && { bundles_dir: options.out_dir }),
		...(log && { log }),
		concurrency
	});
	return parse_bench_results({
		meta: {
			generated_at: null,
			machine: null,
			node: null,
			commit: null,
			corpus_hash: manifest.corpus_hash,
			run: null,
			anchor: null,
			libraries: to_bench_libraries(adapters),
			excluded,
			startup_excluded: [],
			noise_floor: null,
			process_noise: null,
			bundler: await read_bundler()
		},
		langs: [...LANG_ROSTER],
		sets: to_bench_sets(),
		inputs,
		cells,
		startup: [],
		bundle,
		install: measure_installs(adapters),
		heap,
		coverage: to_bench_coverage(adapters)
	} satisfies BenchResults);
};

const is_record = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** The key a list's entries are told apart by, when they all have one. */
const to_entry_key = (list: ReadonlyArray<unknown>): 'id' | 'file' | null =>
	(['id', 'file'] as const).find((key) =>
		list.every((entry) => is_record(entry) && typeof entry[key] === 'string')
	) ?? null;

/**
 * Lists where two JSON values differ, one line for each place, for a check that
 * has to say what changed. Entries of a list are matched by their `id` or
 * `file` when they all have one, so a cell is named and an inserted entry
 * doesn't shift every entry after it.
 *
 * @param committed - the value on disk
 * @param generated - the value just built
 * @param path - where the two are, for the lines
 * @returns the differences, none when the values are equal
 */
export const diff_json = (
	committed: unknown,
	generated: unknown,
	path: string = ''
): Array<string> => {
	const at = (key: string): string => (path === '' ? key : `${path}.${key}`);
	if (Array.isArray(committed) && Array.isArray(generated)) {
		const key = to_entry_key([...committed, ...generated]);
		if (key === null) {
			return Array.from({ length: Math.max(committed.length, generated.length) }, (_, i) =>
				diff_json(committed[i], generated[i], at(String(i)))
			).flat();
		}
		const keyed = (list: Array<Record<string, unknown>>): Record<string, unknown> =>
			Object.fromEntries(list.map((entry) => [`[${entry[key] as string}]`, entry]));
		return diff_json(keyed(committed), keyed(generated), path);
	}
	if (is_record(committed) && is_record(generated)) {
		return [...new Set([...Object.keys(committed), ...Object.keys(generated)])].flatMap((key) =>
			diff_json(committed[key], generated[key], key.startsWith('[') ? path + key : at(key))
		);
	}
	if (JSON.stringify(committed) === JSON.stringify(generated)) return [];
	const show = (value: unknown): string =>
		value === undefined ? 'nothing' : (JSON.stringify(value)?.slice(0, 80) ?? 'nothing');
	return [`${path}: committed ${show(committed)}, generated ${show(generated)}`];
};

/** What a timed run takes from the deterministic file. */
export interface CarriedDeterministic {
	/** The bundle sizes of the run's libraries. */
	bundle: BenchResults['bundle'];
	/** The install footprints of the run's libraries. */
	install: BenchResults['install'];
	/** The retained heaps of the run's libraries. */
	heap: BenchResults['heap'];
	bundler: BenchBundler;
	/**
	 * What each library came to on each input, by `to_expected_key`: its numbers,
	 * the compressed sizes among them, or the reason it is excluded.
	 */
	expected: Map<string, ExpectedNumbers | { excluded: string }>;
}

/** A library's numbers on an input in the deterministic file, which always has the compressed sizes. */
export type ExpectedNumbers = CellNumbers & { compressed: BenchCellCompressed };

/** The key of `CarriedDeterministic.expected`: an input and a library. */
export const to_expected_key = (file: string, library: string): string =>
	JSON.stringify([file, library]);

/** What a run measures, compared against the deterministic file's. */
export interface DeterministicContext {
	/** The run's libraries, in roster order. */
	libraries: ReadonlyArray<BenchLibrary>;
	corpus_hash: string;
	sets: ReadonlyArray<BenchSet>;
	/**
	 * Each library's install closure as this tree installs it (`BenchInstall.closure`),
	 * by id: the transitive versions, which the libraries' own versions don't show.
	 */
	closures: Record<string, string>;
}

/**
 * Takes the bundle sizes and the expected cell numbers from a deterministic
 * results file, if that file describes this run: every library of the run at
 * the same version, with the same extra packages and the same install closure,
 * the same corpus, and the same feature sets. The closure pins the transitive
 * versions, which move a library's HTML and footprint without moving its own
 * version (Shiki renders through a dependency).
 *
 * @param deterministic - a parsed deterministic results file
 * @param context - what the run that would carry it measures
 * @returns what the run takes, or the reason the file doesn't apply
 */
export const carry_deterministic = (
	deterministic: BenchResults,
	context: DeterministicContext
): ({ ok: true } & CarriedDeterministic) | { ok: false; reason: string } => {
	const { meta } = deterministic;
	if (meta.bundler === null) return { ok: false, reason: 'it holds no bundle sizes' };
	if (meta.corpus_hash !== context.corpus_hash) {
		return { ok: false, reason: 'it measured another corpus' };
	}
	if (JSON.stringify(deterministic.sets) !== JSON.stringify(context.sets)) {
		return { ok: false, reason: 'it measured other feature sets' };
	}
	const moved = find_library_change(meta.libraries, context.libraries);
	if (moved !== null) return { ok: false, reason: moved };
	for (const { id } of context.libraries) {
		if (deterministic.install[id]?.closure !== context.closures[id]) {
			return {
				ok: false,
				reason: `it measured ${id} with other versions of its dependencies than this tree installs`
			};
		}
	}
	const expected: CarriedDeterministic['expected'] = new Map();
	const by_file = Map.groupBy(deterministic.cells, (cell) => cell.file);
	const excluded = new Map(meta.excluded.map((e) => [JSON.stringify([e.cell, e.library]), e]));
	for (const [file, cells] of by_file) {
		const tokenize = cells.find((cell) => cell.mode === 'tokenize');
		const html = cells.find((cell) => cell.mode === 'html');
		if (!tokenize || !html) continue;
		for (const { id } of context.libraries) {
			const reason = excluded.get(JSON.stringify([tokenize.id, id]))?.reason;
			const tokens = tokenize.tokens[id];
			const output = html.output[id];
			const compressed = html.compressed[id];
			if (reason !== undefined) expected.set(to_expected_key(file, id), { excluded: reason });
			else if (tokens !== undefined && output !== undefined && compressed !== undefined) {
				expected.set(to_expected_key(file, id), { tokens, output, compressed });
			}
		}
	}
	return {
		ok: true,
		bundle: Object.fromEntries(
			context.libraries.map((library) => [library.id, deterministic.bundle[library.id]!])
		),
		install: Object.fromEntries(
			context.libraries.map((library) => [library.id, deterministic.install[library.id]!])
		),
		heap: Object.fromEntries(
			context.libraries.map((library) => [library.id, deterministic.heap[library.id] ?? {}])
		),
		bundler: meta.bundler,
		expected
	};
};

/**
 * Keeps the committed retained heaps that agree with the regenerated ones, so
 * that regenerating on an unchanged tree changes nothing and a check compares
 * the heaps within `heap_readings_agree` and every other number exactly. A heap
 * reading can move by a little from one process to the next. A change smaller
 * than the tolerance isn't recorded until it, with later ones, exceeds it.
 *
 * @param committed - the file on disk, as JSON, or null
 * @param generated - the results just built
 * @returns `generated`, with each agreeing heap number replaced by the committed one
 */
export const keep_agreeing_heaps = (committed: unknown, generated: BenchResults): BenchResults => {
	if (!is_record(committed) || !is_record(committed.heap)) return generated;
	const heap: BenchResults['heap'] = {};
	for (const [library, by_lang] of Object.entries(generated.heap)) {
		const own = committed.heap[library];
		heap[library] = {};
		for (const [lang, entry] of Object.entries(by_lang)) {
			const kept = is_record(own) ? own[lang] : undefined;
			const parsed = s.parse(BenchHeap, kept);
			if (!parsed.ok) {
				heap[library][lang] = entry;
				continue;
			}
			// number by number, so a check names only a number outside the tolerance
			const keep = (key: keyof BenchHeap): number =>
				heap_readings_agree(parsed.value[key], entry[key]) ? parsed.value[key] : entry[key];
			heap[library][lang] = {
				retained_kb: keep('retained_kb'),
				code_kb: keep('code_kb'),
				external_kb: keep('external_kb')
			};
		}
	}
	return { ...generated, heap };
};

const USAGE = [
	'usage: node bench/deterministic.ts [--check] [--out <path>]',
	'',
	'Regenerates the deterministic results: bundle sizes, install footprints,',
	'retained heaps, token counts, HTML sizes raw and compressed, and coverage.',
	'Nothing is timed. The check compares retained heaps within a tolerance.',
	'',
	'  --check        regenerate in memory, and fail if the committed file differs',
	'  --out <path>   read and write this file instead of results/deterministic.json',
	'  --help         print this'
].join('\n');

/** How many differences a failed check lists before it only counts them. */
const MAX_DIFFERENCES_LISTED = 40;

/**
 * The command: regenerates the deterministic results, and writes them or checks
 * the committed file against them.
 *
 * @param args - the arguments after the script
 * @returns the exit code: 0 when written or matching, 1 when the check fails, 2
 * for a usage error
 */
const main = async (args: ReadonlyArray<string>): Promise<number> => {
	let check = false;
	let out: string | null = null;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		if (arg === '--help') {
			console.log(USAGE);
			return 0;
		}
		if (arg === '--check' && !check) check = true;
		else if (arg === '--out' && out === null && args[i + 1] !== undefined) out = args[++i]!;
		else {
			console.error(`unknown or repeated argument "${arg}"\n${USAGE}`);
			return 2;
		}
	}
	const path = out === null ? to_deterministic_path() : resolve(out);
	const display_path = relative(process.cwd(), path).startsWith('..')
		? path
		: relative(process.cwd(), path);

	if (check && !existsSync(path)) {
		console.error(`${display_path} doesn't exist: run \`npm run bench:deterministic\``);
		return 1;
	}

	const started = performance.now();
	const built = await build_deterministic_results({
		log: (line) => process.stderr.write(line + '\n')
	});
	let previous: unknown = null;
	try {
		previous = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
	} catch {
		// not JSON: written over, or reported by the check
	}
	const results = keep_agreeing_heaps(previous, built);
	const serialized = serialize_results(results);
	const seconds = ((performance.now() - started) / 1000).toFixed(1);

	if (!check) {
		mkdirSync(dirname(path), { recursive: true });
		// whole or not at all: a reader never sees half a file
		const temp_path = `${path}.${process.pid}.tmp`;
		try {
			writeFileSync(temp_path, serialized);
			renameSync(temp_path, path);
		} finally {
			rmSync(temp_path, { force: true });
		}
		console.log(`wrote ${display_path} in ${seconds}s`);
		return 0;
	}
	const committed = readFileSync(path, 'utf8');
	if (committed === serialized) {
		console.log(`${display_path} matches what regenerates, in ${seconds}s`);
		return 0;
	}
	let differences: Array<string>;
	try {
		differences = diff_json(JSON.parse(committed), results);
	} catch {
		differences = ['the committed file is not JSON'];
	}
	if (differences.length === 0) differences = ['only the formatting differs'];
	console.error(
		`${display_path} is stale: it differs in ${differences.length} place${differences.length === 1 ? '' : 's'}`
	);
	for (const line of differences.slice(0, MAX_DIFFERENCES_LISTED)) console.error(`  ${line}`);
	if (differences.length > MAX_DIFFERENCES_LISTED) console.error('  and more');
	if (differences.every((line) => /\.(gzip|brotli): /.test(line))) {
		console.error(
			`only compressed sizes differ, so the committed file was likely generated by a Node with another zlib or brotli (this one has zlib ${process.versions.zlib}, brotli ${process.versions.brotli})`
		);
	}
	if (differences.some((line) => line.startsWith('heap.'))) {
		console.error(
			`a retained heap differs by more than a heap reading's own jitter (${HEAP_TOLERANCE_KB} KiB or ${HEAP_TOLERANCE_RATIO * 100}%, whichever is larger): a library, its bundle, or the Node version has moved (this one is ${process.version} on ${process.arch})`
		);
	}
	if (differences.some((line) => line.startsWith('install.'))) {
		console.error(
			'an install footprint differs: a library version, or a dependency the lockfile installs for it, has moved'
		);
	}
	console.error('regenerate it with `npm run bench:deterministic`, and commit the result');
	return 1;
};

if (import.meta.main) {
	process.exitCode = await main(process.argv.slice(2));
}
