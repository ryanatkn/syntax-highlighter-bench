/**
 * A run of the timed harness: every library measured on every cell, each in a
 * process of its own, and one results file written through the schema.
 *
 * ```bash
 * node bench/run.ts --machine <name>   # a full run, to results/<date>_<name>.json
 * node bench/run.ts --smoke            # everything once, briefly and in parallel
 * node bench/run.ts --calibrate --machine <name>   # the machine's noise floor
 * node bench/run.ts --help
 * ```
 *
 * A process measures one library on one cell, so no library can move another's
 * number. A cell gets several passes, each a process per library, and the
 * library a pass starts with rotates. A library's value pools the rounds of all
 * its passes.
 *
 * In a timed run the parent does no work while a process is measuring. It
 * spawns one process at a time with a blocking call, so it has no timers and
 * reads the child's output only after the child has exited. It holds the
 * machine lock from before the first anchor reading until the results are ready
 * to write. A smoke run's numbers mean nothing, so it alone runs its processes
 * several at a time.
 *
 * The anchor and the lock follow the comparison harness of twinkleplop
 * (https://github.com/pngwn/twinkleplop, MIT), as does spawning a fresh process
 * per cell; a process per library is this harness's change.
 *
 * Node-only.
 *
 * @module
 */

import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { availableParallelism, cpus, hostname, totalmem } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stats_median, stats_percentile } from '@fuzdev/fuz_util/stats.js';
import { time_format_adaptive } from '@fuzdev/fuz_util/time.js';

import {
	bench_run_is_complete,
	parse_bench_results,
	type BenchAnchor,
	type BenchCell,
	type BenchCellOutput,
	type BenchCellValue,
	type BenchExcluded,
	type BenchMachine,
	type BenchNoiseFloor,
	type BenchResults
} from '../src/lib/results_schema.ts';
import type { HighlighterAdapter } from './adapter.ts';
import { measure_anchor, to_anchor_drift } from './anchor.ts';
import { CellResult, type CellMeasurement, type CellSpec } from './cell.ts';
import { load_corpus_manifest } from './corpus.ts';
import { LANG_ROSTER } from './langs.ts';
import { ADAPTERS } from './libraries.ts';
import { to_bench_coverage, to_bench_libraries } from './library_info.ts';
import { acquire_machine_lock, format_lock_holder, MACHINE_LOCK_PATH } from './lock.ts';
import { summarize_passes } from './measure.ts';
import {
	format_run_help,
	parse_run_args,
	plan_cells,
	plan_processes,
	to_calibration_path,
	to_machine_name,
	to_results_path,
	type PlannedProcess,
	type RunOptions,
	type RunParams
} from './run_options.ts';
import { FEATURE_SETS } from './sets.ts';

const REPO_DIR = fileURLToPath(new URL('../', import.meta.url));
const CELL_PATH = fileURLToPath(new URL('./cell.ts', import.meta.url));

/** How long one process may run before the run is failed, in milliseconds. */
export const CELL_TIMEOUT_MS = 10 * 60_000;

/** The exit code for each signal that stops a run. */
export const SIGNAL_EXIT = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 } as const;

/**
 * A library whose rounds on a cell are further apart than this, slowest over
 * fastest, is listed in the run's summary: something disturbed it.
 */
export const DISTURBED_SPREAD = 1.25;

/**
 * A run that can't continue. `exit_code` is 2 when the caller has to change
 * something first (the flags, a missing machine name, a held lock, an output
 * path), a signal's code when the run was interrupted, and 1 for everything
 * else.
 */
export class RunError extends Error {
	readonly exit_code: number;

	constructor(message: string, exit_code: number = 1) {
		super(message);
		this.name = 'RunError';
		this.exit_code = exit_code;
	}
}

/** Builds what a process is asked to measure. */
export const to_cell_spec = (planned: PlannedProcess, options: RunOptions): CellSpec => ({
	file: planned.cell.input.file,
	mode: planned.cell.mode,
	library: planned.library,
	rounds: options.rounds,
	target_ms: options.target_ms,
	warmup_ms: options.warmup_ms,
	rewarm_ms: options.rewarm_ms
});

/** How a cell's process ended. */
export interface ChildOutcome {
	/** Why the process couldn't be run or was stopped, if it was. */
	error: (Error & { code?: string }) | null;
	status: number | null;
	signal: string | null;
	stdout: string;
	stderr: string;
}

const to_process_label = (planned: PlannedProcess): string =>
	`cell ${planned.cell.id} (${planned.library})`;

/**
 * Reads what a cell's process reported, or says how it failed.
 *
 * @param planned - the process that was asked for
 * @param outcome - how it ended and what it printed
 * @returns the validated result
 * @throws `RunError` naming the cell and library if the process failed, timed
 * out, was interrupted, or printed anything but one result for what it was asked
 */
export const read_cell_result = (planned: PlannedProcess, outcome: ChildOutcome): CellResult => {
	const label = to_process_label(planned);
	if (outcome.error?.code === 'ETIMEDOUT') {
		throw new RunError(`${label} timed out after ${CELL_TIMEOUT_MS / 1000}s`);
	}
	if (outcome.signal !== null && Object.hasOwn(SIGNAL_EXIT, outcome.signal)) {
		throw new RunError(
			`interrupted during ${label}`,
			SIGNAL_EXIT[outcome.signal as keyof typeof SIGNAL_EXIT]
		);
	}
	if (outcome.error) throw new RunError(`${label} could not be run: ${outcome.error.message}`);
	if (outcome.status !== 0) {
		const how = outcome.signal === null ? `exit ${outcome.status}` : `signal ${outcome.signal}`;
		throw new RunError(`${label} failed (${how}):\n${outcome.stderr.trim()}`);
	}
	let data: unknown;
	try {
		data = JSON.parse(outcome.stdout);
	} catch {
		throw new RunError(
			`${label} printed something other than one JSON result: ${JSON.stringify(outcome.stdout.slice(0, 200))}`
		);
	}
	const parsed = CellResult.safeParse(data);
	if (!parsed.success) {
		throw new RunError(`${label} reported a malformed result: ${parsed.error.message}`);
	}
	const result = parsed.data;
	if (result.cell !== planned.cell.id || result.library !== planned.library) {
		throw new RunError(`${label} reported on "${result.cell}" (${result.library})`);
	}
	if (result.loaded_langs.length !== 1 || result.loaded_langs[0] !== planned.cell.input.lang) {
		throw new RunError(
			`${label} loaded [${result.loaded_langs.join(', ')}], not exactly its language`
		);
	}
	return result;
};

const to_child_args = (spec: CellSpec): Array<string> => [
	'--expose-gc',
	CELL_PATH,
	JSON.stringify(spec)
];

/** Runs one process and blocks until it exits, so nothing else runs beside it. */
const spawn_cell_sync = (spec: CellSpec): ChildOutcome => {
	const child = spawnSync(process.execPath, to_child_args(spec), {
		cwd: REPO_DIR,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		maxBuffer: 64 * 1024 * 1024,
		timeout: CELL_TIMEOUT_MS
	});
	return {
		error: child.error ?? null,
		status: child.status,
		signal: child.signal,
		stdout: child.stdout,
		stderr: child.stderr
	};
};

/** Runs one process without blocking. Only a smoke run uses it. */
const spawn_cell_async = (spec: CellSpec, children: Set<ChildProcess>): Promise<ChildOutcome> =>
	new Promise((resolve_outcome) => {
		const started = performance.now();
		const child = spawn(process.execPath, to_child_args(spec), {
			cwd: REPO_DIR,
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: CELL_TIMEOUT_MS
		});
		children.add(child);
		let stdout = '';
		let stderr = '';
		const finish = (outcome: Pick<ChildOutcome, 'error' | 'status' | 'signal'>): void => {
			children.delete(child);
			resolve_outcome({ ...outcome, stdout, stderr });
		};
		child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
		child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
		// a process that never started has no close event
		child.on('error', (error) => finish({ error, status: null, signal: null }));
		child.on('close', (status, signal) => {
			const timed_out = signal !== null && performance.now() - started >= CELL_TIMEOUT_MS;
			const error = timed_out ? Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }) : null;
			finish({ error, status, signal });
		});
	});

/** Lets a pending signal handler run, which a blocking spawn loop otherwise never does. */
const yield_to_signals = (): Promise<void> => new Promise((r) => setImmediate(r));

/**
 * Runs every process of a run and returns their results in the order planned.
 *
 * @param processes - the processes, in the order they are measured
 * @param options - the run
 * @param concurrency - how many run at once: one for anything timed
 * @param on_result - called after each process, with its stderr
 * @throws `RunError` at the first process that fails, or whose result disagrees
 * with an earlier pass of the same library on the same cell
 */
const run_processes = async (
	processes: ReadonlyArray<PlannedProcess>,
	options: RunOptions,
	concurrency: number,
	on_result: (planned: PlannedProcess, done: number, stderr: string) => void
): Promise<Array<CellResult>> => {
	const results: Array<CellResult> = [];
	// a library's passes are compared as they arrive, so a disagreement stops the run at that cell
	const first_passes: Map<string, CellResult> = new Map();
	const read = (planned: PlannedProcess, outcome: ChildOutcome): CellResult => {
		const result = read_cell_result(planned, outcome);
		const label = to_process_label(planned);
		const first = first_passes.get(label);
		if (first) assert_passes_agree(label, first, result);
		else first_passes.set(label, result);
		return result;
	};
	if (concurrency === 1) {
		for (const [i, planned] of processes.entries()) {
			const outcome = spawn_cell_sync(to_cell_spec(planned, options));
			results.push(read(planned, outcome));
			on_result(planned, i + 1, outcome.stderr);
			await yield_to_signals();
		}
		return results;
	}
	const children: Set<ChildProcess> = new Set();
	const kill_children = (): void => {
		for (const child of children) child.kill();
	};
	process.once('exit', kill_children);
	let next = 0;
	let done = 0;
	let failed = false;
	const work = async (): Promise<void> => {
		while (!failed && next < processes.length) {
			const i = next++;
			const planned = processes[i]!;
			const outcome = await spawn_cell_async(to_cell_spec(planned, options), children);
			if (failed) return;
			try {
				results[i] = read(planned, outcome);
			} catch (error) {
				failed = true;
				kill_children();
				throw error;
			}
			on_result(planned, ++done, outcome.stderr);
		}
	};
	try {
		await Promise.all(Array.from({ length: concurrency }, work));
	} finally {
		process.off('exit', kill_children);
	}
	return results;
};

/** The geometric mean of some positive numbers. */
export const to_geomean = (values: ReadonlyArray<number>): number =>
	Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);

/** How far a ratio is from one, the same whichever side is larger. */
export const to_deviation = (ratio: number): number => Math.max(ratio, 1 / ratio) - 1;

/** One library measured as two on one cell of a calibration. */
export interface CalibrationPair {
	cell: string;
	library: string;
	/** The first measurement's time over the second's. One when they agree. */
	ratio: number;
}

/**
 * Derives the noise floor from a calibration's pairs.
 *
 * - `per_cell` is the 95th percentile of the deviation, over every cell and
 *   library.
 * - `geomean` takes each library's ratios across its cells, and is the deviation
 *   of their geometric mean, for the library where it is largest.
 *
 * @returns null when nothing was measured twice
 */
export const to_noise_floor = (pairs: ReadonlyArray<CalibrationPair>): BenchNoiseFloor | null => {
	if (pairs.length === 0) return null;
	const by_library = Map.groupBy(pairs, (pair) => pair.library);
	return {
		per_cell: stats_percentile(
			pairs.map((pair) => to_deviation(pair.ratio)),
			0.95
		),
		geomean: Math.max(
			...[...by_library.values()].map((own) => to_deviation(to_geomean(own.map((p) => p.ratio))))
		)
	};
};

/**
 * Checks that two of a library's passes on a cell agree on what is
 * deterministic: whether it passed the output check, its token count, and its
 * output size.
 *
 * @param label - the cell and library, for the error
 * @throws `RunError` if they differ
 */
export const assert_passes_agree = (label: string, first: CellResult, pass: CellResult): void => {
	if (
		pass.excluded !== first.excluded ||
		pass.measurement?.tokens !== first.measurement?.tokens ||
		JSON.stringify(pass.measurement?.output) !== JSON.stringify(first.measurement?.output)
	) {
		throw new RunError(
			`${label} came out differently from one process to the next, in something that should be deterministic: ${JSON.stringify([first, pass].map((p) => p.excluded ?? { tokens: p.measurement!.tokens, output: p.measurement!.output }))}`
		);
	}
};

/** What a library came to on one cell, across its passes. */
export type LibraryOutcome =
	| { excluded: string }
	| {
			excluded: null;
			tokens: number;
			output: BenchCellOutput;
			value: BenchCellValue;
			/** In a calibration, the first arm's time over the second's. */
			ratio: number | null;
	  };

/**
 * Combines a library's passes on one cell. Every pass's rounds are pooled into
 * one value.
 *
 * In a calibration the passes alternate between two arms, as if they were two
 * libraries: the value is the first arm's, and the ratio compares the two.
 *
 * @param label - the cell and library, for an error
 * @param passes - what each of the library's processes reported, in order
 * @param bytes - the size of the input
 * @param calibrate - whether the passes are two arms
 * @throws `RunError` if the passes disagree on what is deterministic: whether
 * the library passed the check, its token count, or its output
 */
export const combine_passes = (
	label: string,
	passes: ReadonlyArray<CellResult>,
	bytes: number,
	calibrate: boolean
): LibraryOutcome => {
	const first = passes[0]!;
	const measurements: Array<CellMeasurement> = [];
	for (const pass of passes) {
		assert_passes_agree(label, first, pass);
		if (pass.measurement) measurements.push(pass.measurement);
	}
	if (first.excluded !== null) return { excluded: first.excluded };
	const arm_a = calibrate ? measurements.filter((_, i) => i % 2 === 0) : measurements;
	const arm_b = calibrate ? measurements.filter((_, i) => i % 2 === 1) : [];
	const value = summarize_passes(arm_a, bytes);
	return {
		excluded: null,
		tokens: measurements[0]!.tokens,
		output: measurements[0]!.output,
		value,
		ratio: arm_b.length === 0 ? null : value.ns_per_op / summarize_passes(arm_b, bytes).ns_per_op
	};
};

/** What a run measured with, compared against a calibration's. */
export interface NoiseFloorContext {
	machine: BenchMachine;
	node: string;
	corpus_hash: string;
	params: RunParams;
}

/**
 * Takes the noise floor from a machine's calibration run, if that calibration
 * describes this run: complete, steady, and on the same machine, governor, Node
 * version, corpus, and parameters.
 *
 * @param calibration - a parsed calibration results file
 * @param context - what the run that would carry it measures with
 * @returns the noise floor, or the reason the calibration doesn't apply
 */
export const carry_noise_floor = (
	calibration: BenchResults,
	context: NoiseFloorContext
): { ok: true; noise_floor: BenchNoiseFloor } | { ok: false; reason: string } => {
	const { run, machine, node, noise_floor, anchor, corpus_hash } = calibration.meta;
	if (run?.kind !== 'calibrate' || noise_floor === null) {
		return { ok: false, reason: 'it is not a calibration run' };
	}
	if (!bench_run_is_complete(run)) return { ok: false, reason: 'it was filtered' };
	if (!anchor?.stable) {
		return { ok: false, reason: 'the machine changed state while it ran' };
	}
	if (machine.name !== context.machine.name || machine.cpu !== context.machine.cpu) {
		return { ok: false, reason: `it is from another machine (${machine.name}, ${machine.cpu})` };
	}
	if (machine.governor !== context.machine.governor) {
		return { ok: false, reason: `it ran under the governor ${machine.governor}` };
	}
	if (node !== context.node) return { ok: false, reason: `it ran on Node ${node}` };
	if (corpus_hash !== context.corpus_hash) {
		return { ok: false, reason: 'it measured another corpus' };
	}
	for (const key of ['passes', 'rounds', 'target_ms', 'warmup_ms', 'rewarm_ms'] as const) {
		if (run[key] !== context.params[key]) {
			return { ok: false, reason: `it measured with ${key} ${run[key]}` };
		}
	}
	return { ok: true, noise_floor };
};

/** Everything a results file is assembled from. */
export interface RunRecord {
	options: RunOptions;
	generated_at: string;
	duration_ms: number;
	machine: BenchMachine;
	node: string;
	commit: string;
	corpus_hash: string;
	/** The libraries the run selected, in roster order. */
	adapters: ReadonlyArray<HighlighterAdapter>;
	/** Every process's result, each with the process it answers. */
	processes: ReadonlyArray<{ planned: PlannedProcess; result: CellResult }>;
	anchor: BenchAnchor;
	/** The floor carried from the machine's calibration. A calibration run derives its own. */
	noise_floor: BenchNoiseFloor | null;
}

/**
 * Assembles a results file and validates it.
 *
 * A library that failed the output check in a cell has no numbers there and an
 * entry in `meta.excluded`. A library that doesn't claim a cell's language was
 * never asked about it, and has neither.
 *
 * @returns the parsed results, and a calibration's pairs
 * @throws if a library's passes disagree, or the assembled file doesn't match
 * `BenchResults`
 */
export const assemble_results = (
	record: RunRecord
): { results: BenchResults; pairs: Array<CalibrationPair> } => {
	const { options } = record;
	const calibrate = options.kind === 'calibrate';
	const excluded: Array<BenchExcluded> = [];
	const pairs: Array<CalibrationPair> = [];
	const by_cell = Map.groupBy(record.processes, (p) => p.planned.cell);
	const cells = [...by_cell].map(([cell, processes]): BenchCell => {
		const { input } = cell;
		const values: BenchCell['values'] = {};
		const tokens: BenchCell['tokens'] = {};
		const output: BenchCell['output'] = {};
		const by_library = Map.groupBy(processes, (p) => p.planned.library);
		// roster order, whichever library a pass started with
		for (const library of cell.libraries) {
			const outcome = combine_passes(
				`cell ${cell.id} (${library})`,
				(by_library.get(library) ?? [])
					.toSorted((a, b) => a.planned.pass - b.planned.pass)
					.map((p) => p.result),
				input.bytes,
				calibrate
			);
			if (outcome.excluded !== null) {
				excluded.push({ cell: cell.id, library, reason: outcome.excluded });
				continue;
			}
			values[library] = outcome.value;
			tokens[library] = outcome.tokens;
			output[library] = outcome.output;
			if (outcome.ratio !== null) pairs.push({ cell: cell.id, library, ratio: outcome.ratio });
		}
		return {
			id: cell.id,
			metric: 'throughput',
			lang: input.lang,
			size: input.size,
			mode: cell.mode,
			source: input.source,
			home: input.home,
			file: input.file,
			bytes: input.bytes,
			lines: input.lines,
			synthetic: input.synthetic,
			values,
			tokens,
			output
		};
	});
	const results = parse_bench_results({
		meta: {
			generated_at: record.generated_at,
			machine: record.machine,
			node: record.node,
			commit: record.commit,
			corpus_hash: record.corpus_hash,
			run: {
				kind: options.kind,
				passes: options.passes,
				rounds: options.rounds,
				target_ms: options.target_ms,
				warmup_ms: options.warmup_ms,
				rewarm_ms: options.rewarm_ms,
				loaded_langs: 'cell',
				filters: options.filters,
				duration_ms: record.duration_ms
			},
			anchor: record.anchor,
			libraries: to_bench_libraries(record.adapters),
			excluded,
			noise_floor: calibrate ? to_noise_floor(pairs) : record.noise_floor
		},
		langs: [...LANG_ROSTER],
		sets: FEATURE_SETS.map((set) => ({ ...set, langs: [...set.langs] })),
		inputs: [...new Set(cells.map((cell) => cell.file))].map(
			(file) => [...by_cell.keys()].find((cell) => cell.input.file === file)!.input
		),
		cells,
		startup: [],
		bundle: {},
		coverage: to_bench_coverage(record.adapters)
	} satisfies BenchResults);
	return { results, pairs };
};

const GOVERNOR_PATH = '/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor';

/**
 * Describes the machine a run is on.
 *
 * @param name - the name it is recorded under
 * @param governor_path - where the OS exposes the CPU frequency governor, if it does
 */
export const read_machine = (name: string, governor_path: string = GOVERNOR_PATH): BenchMachine => {
	let governor: string | null = null;
	try {
		governor = readFileSync(governor_path, 'utf8').trim() || null;
	} catch {
		// no cpufreq here: another OS, a container, or a VM
	}
	return {
		name,
		cpu: cpus()[0]?.model.trim() || 'unknown',
		governor,
		memory_gb: Math.round((totalmem() / 1024 ** 3) * 10) / 10
	};
};

/**
 * Reads the commit a run is on, with `-dirty` appended when the working tree
 * has changes the commit doesn't record. Results files don't count: a run's
 * own output, like the calibration a full run follows, changes nothing that is
 * measured.
 *
 * @param dir - the root of the checkout
 * @throws `RunError` if `dir` isn't in a git checkout, since a run must say what produced it
 */
export const read_commit = (dir: string = REPO_DIR): string => {
	const git = (args: Array<string>): string =>
		execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	try {
		const commit = git(['rev-parse', 'HEAD']).trim();
		const changes = git(['status', '--porcelain', '--', '.', ':(exclude)results']).trim();
		return changes === '' ? commit : `${commit}-dirty`;
	} catch (error) {
		throw new RunError(
			`a run records the commit it ran at, and git couldn't say: ${(error as Error).message}`
		);
	}
};

const format_percent = (ratio: number): string => `${(ratio * 100).toFixed(1)}%`;

/** How many disturbed library-cells a summary lists before it only counts them. */
const MAX_DISTURBED_LISTED = 20;

/**
 * Summarizes a run for the terminal: what was measured, and what to look at
 * before trusting it.
 *
 * @param results - the run
 * @param pairs - a calibration's pairs, reported for each library
 */
export const format_run_summary = (
	results: BenchResults,
	pairs: ReadonlyArray<CalibrationPair> = []
): string => {
	const { meta, cells } = results;
	const run = meta.run!;
	const lines = [
		`${run.kind} run: ${cells.length} cells, ${run.passes} pass(es) of ${run.rounds} round(s), ${run.target_ms}ms batches, in ${time_format_adaptive(run.duration_ms * 1e6)}`
	];
	const disturbed: Array<{ cell: string; library: string; spread: number }> = [];
	for (const { id } of meta.libraries) {
		const measured = cells.filter((cell) => Object.hasOwn(cell.values, id));
		if (measured.length === 0) {
			lines.push(`  ${id.padEnd(12)} not measured in any cell`);
			continue;
		}
		const spreads = measured.map((cell) => cell.values[id]!.spread);
		for (const cell of measured) {
			const { spread } = cell.values[id]!;
			if (spread > DISTURBED_SPREAD) disturbed.push({ cell: cell.id, library: id, spread });
		}
		lines.push(
			`  ${id.padEnd(12)} ${String(measured.length).padStart(3)} cells, spread median ${stats_median(spreads).toFixed(3)}, worst ${Math.max(...spreads).toFixed(3)}`
		);
	}
	if (run.kind !== 'smoke') {
		lines.push(
			disturbed.length === 0
				? `disturbed: none (no spread over ${DISTURBED_SPREAD})`
				: `disturbed: ${disturbed.length} library-cells with a spread over ${DISTURBED_SPREAD}, so something else was running or its processes disagreed`
		);
		disturbed.sort((a, b) => b.spread - a.spread);
		for (const { cell, library, spread } of disturbed.slice(0, MAX_DISTURBED_LISTED)) {
			lines.push(`  ${library} in ${cell}: ${spread.toFixed(3)}`);
		}
		if (disturbed.length > MAX_DISTURBED_LISTED) lines.push('  and more');
	}
	if (meta.anchor) {
		lines.push(
			`anchor drift ${format_percent(meta.anchor.drift)}${meta.anchor.stable ? '' : ': UNSTABLE, the machine changed state during the run'}`
		);
	}
	lines.push(
		meta.noise_floor
			? `noise floor: ${format_percent(meta.noise_floor.per_cell)} per cell, ${format_percent(meta.noise_floor.geomean)} for a geomean`
			: 'noise floor: none'
	);
	for (const { id } of meta.libraries) {
		const own = pairs.filter((pair) => pair.library === id);
		if (own.length === 0) continue;
		const worst = own.reduce((a, b) => (to_deviation(b.ratio) > to_deviation(a.ratio) ? b : a));
		lines.push(
			`  ${id.padEnd(12)} geomean deviation ${format_percent(to_deviation(to_geomean(own.map((pair) => pair.ratio))))}, worst ${format_percent(to_deviation(worst.ratio))} (${worst.cell})`
		);
	}
	lines.push(
		meta.excluded.length === 0
			? 'excluded: none'
			: `excluded: ${meta.excluded.length} library-cells`
	);
	for (const { cell, library, reason } of meta.excluded) {
		lines.push(`  ${library} in ${cell}: ${reason}`);
	}
	if (meta.commit.endsWith('-dirty')) {
		lines.push(
			'the working tree had uncommitted changes, so the commit does not describe this run'
		);
	}
	return lines.join('\n');
};

/**
 * What `run_bench` can be given in place of the machine's own: two paths, and
 * where its notes go.
 */
export interface RunBenchOptions {
	/** The lock file. Tests pass their own so they neither take nor wait on the machine's. */
	lock_path?: string;
	/** The results directory. */
	results_dir?: string;
	/** Receives progress and notes. Defaults to stderr. */
	log?: (line: string) => void;
}

/**
 * Resolves where a run writes, and refuses what would only fail after
 * measuring.
 *
 * @throws `RunError` with exit code 2 if `--out` is empty or a directory, or a
 * complete full run of the same UTC date and machine is already there
 */
const resolve_results_path = (
	options: RunOptions,
	machine: string,
	generated_at: string,
	results_dir: string | undefined
): string => {
	if (options.out !== null) {
		if (options.out === '') throw new RunError('--out needs a file path', 2);
		const path = resolve(options.out);
		if (existsSync(path) && statSync(path).isDirectory()) {
			throw new RunError(`--out ${options.out} is a directory, not a file`, 2);
		}
		return path;
	}
	const path = to_results_path({ ...options, machine, generated_at }, results_dir);
	if (options.kind === 'full' && bench_run_is_complete(options) && existsSync(path)) {
		throw new RunError(`${path} exists: move it or pass --out`, 2);
	}
	return path;
};

/**
 * Runs the timed harness and writes the results file.
 *
 * @param options - the run, as `parse_run_args` describes it
 * @param bench_options - a lock path, a results directory, and a logger, for tests
 * @returns the validated results, the path they were written to, and a
 * calibration's pairs
 * @throws `RunError` if the run can't start, a process fails, or the lock is
 * lost. Nothing is written unless every process succeeded.
 */
export const run_bench = async (
	options: RunOptions,
	bench_options: RunBenchOptions = {}
): Promise<{ results: BenchResults; path: string; pairs: Array<CalibrationPair> }> => {
	const log = bench_options.log ?? ((line: string) => process.stderr.write(line + '\n'));
	if (options.machine === null && bench_run_is_complete(options)) {
		throw new RunError(
			'name the machine with --machine <name>: this run is recorded under that name',
			2
		);
	}
	const manifest = load_corpus_manifest();
	const adapters = ADAPTERS.filter((a) => options.filters.libraries?.includes(a.id) ?? true);
	const cells = plan_cells(manifest.inputs, options.filters, ADAPTERS);
	if (cells.length === 0) throw new RunError('no cell matches the filters', 2);
	// a calibration measures each library as two arms, so each gets twice the passes
	const processes = plan_processes(
		cells,
		options.kind === 'calibrate' ? options.passes * 2 : options.passes
	);

	const machine = read_machine(options.machine ?? to_machine_name(hostname()));
	const node = process.version;
	const generated_at = new Date().toISOString();

	// everything that could fail is tried before measuring, not after
	const path = resolve_results_path(options, machine.name, generated_at, bench_options.results_dir);
	try {
		mkdirSync(dirname(path), { recursive: true });
	} catch (error) {
		throw new RunError(`can't write to ${path}: ${(error as Error).message}`, 2);
	}
	let noise_floor: BenchNoiseFloor | null = null;
	if (options.kind === 'full') {
		const calibration_path = to_calibration_path(machine.name, bench_options.results_dir);
		if (!existsSync(calibration_path)) {
			log(`no noise floor: ${machine.name} has no calibration run`);
		} else {
			let calibration: BenchResults;
			try {
				calibration = parse_bench_results(JSON.parse(readFileSync(calibration_path, 'utf8')));
			} catch (error) {
				throw new RunError(
					`${calibration_path} is not a results file: fix or remove it\n${(error as Error).message}`,
					2
				);
			}
			const carried = carry_noise_floor(calibration, {
				machine,
				node,
				corpus_hash: manifest.corpus_hash,
				params: options
			});
			if (carried.ok) noise_floor = carried.noise_floor;
			else log(`no noise floor: the calibration doesn't describe this run, ${carried.reason}`);
		}
	}

	const acquired = acquire_machine_lock(
		`${options.kind} run`,
		bench_options.lock_path ?? MACHINE_LOCK_PATH
	);
	if (!acquired.ok) throw new RunError(format_lock_holder(acquired.path, acquired.holder), 2);
	const { lock } = acquired;
	const release_on_exit = (): void => void lock.release();
	process.once('exit', release_on_exit);
	try {
		const started = performance.now();
		// a smoke run's numbers mean nothing, so only it runs processes side by side
		const concurrency = options.kind === 'smoke' ? Math.max(1, availableParallelism()) : 1;
		log(
			`${options.kind} run on ${machine.name}: ${cells.length} cells, ${processes.length} processes${concurrency > 1 ? `, ${concurrency} at a time` : ''}, libraries ${adapters.map((a) => a.id).join(', ')}`
		);

		const commit = read_commit();
		// read_commit above has already spawned a process: the anchor reads several percent
		// slower after a process's first spawn, so both readings must come after one
		const anchor_start = measure_anchor();
		const show_progress = process.stderr.isTTY && !bench_options.log;
		const cell_results = await run_processes(
			processes,
			options,
			concurrency,
			(planned, done, stderr) => {
				if (stderr.trim() !== '') {
					log(`${to_process_label(planned)} wrote to stderr:\n${stderr.trim()}`);
				}
				if (show_progress) {
					process.stderr.write(
						`\r\x1b[K  [${done}/${processes.length}] ${planned.cell.id} ${planned.library}`
					);
				}
			}
		);
		if (show_progress) process.stderr.write('\r\x1b[K');
		const anchor = to_anchor_drift(anchor_start, measure_anchor());
		const duration_ms = Math.round(performance.now() - started);

		const { results, pairs } = assemble_results({
			options,
			generated_at,
			duration_ms,
			machine,
			node,
			commit,
			corpus_hash: manifest.corpus_hash,
			adapters,
			processes: processes.map((planned, i) => ({ planned, result: cell_results[i]! })),
			anchor,
			noise_floor
		});

		if (!lock.release()) {
			throw new RunError(
				`the machine lock ${lock.path} was taken over during the run, so another run may have overlapped this one: nothing was written`
			);
		}
		// whole or not at all: a reader never sees half a file
		const temp_path = `${path}.${process.pid}.tmp`;
		writeFileSync(temp_path, JSON.stringify(results, null, '\t') + '\n');
		renameSync(temp_path, path);
		return { results, path, pairs };
	} finally {
		lock.release();
		process.off('exit', release_on_exit);
	}
};

/**
 * The command: parses the flags, runs, and prints the summary.
 *
 * @param args - the arguments after the script
 * @returns the exit code
 */
export const main = async (args: ReadonlyArray<string>): Promise<number> => {
	const parsed = parse_run_args(args, ADAPTERS);
	if (!parsed.ok) {
		console.error(parsed.message);
		console.error('run `node bench/run.ts --help` for the flags');
		return 2;
	}
	if (parsed.help) {
		console.log(format_run_help());
		return 0;
	}
	// an exit runs the release registered by `run_bench`
	for (const [signal, code] of Object.entries(SIGNAL_EXIT)) {
		process.on(signal, () => process.exit(code));
	}
	try {
		const { results, path, pairs } = await run_bench(parsed.options);
		console.log(format_run_summary(results, pairs));
		const relative_path = relative(process.cwd(), path);
		console.log(`wrote ${relative_path.startsWith('..') ? path : relative_path}`);
		return 0;
	} catch (error) {
		if (!(error instanceof RunError)) throw error;
		console.error(error.message);
		return error.exit_code;
	}
};

if (import.meta.main) {
	process.exitCode = await main(process.argv.slice(2));
}
