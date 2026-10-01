/**
 * A run of the timed harness: every library measured on every cell, each in a
 * process of its own, and one results file written through the schema.
 *
 * ```bash
 * node bench/run.ts --machine <name>   # a full run, to results/<date>_<name>.json
 * node bench/run.ts --smoke            # everything once, briefly and in parallel
 * node bench/run.ts --calibrate --machine <name>   # the machine's noise floor
 * node bench/run.ts --machine <name> --plan       # what a run would do, measuring nothing
 * node bench/run.ts --machine <name> --resume     # continue a run that was stopped
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
 * A timed run appends every result to a journal (`bench/journal.ts`) between
 * processes, so a run that is stopped continues with `--resume` instead of
 * starting over. And a library whose rounds on a cell disagreed is measured
 * there again, a bounded number of times, keeping the attempt whose rounds
 * agreed best.
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
import {
	accessSync,
	constants,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { availableParallelism, cpus, hostname, release, totalmem } from 'node:os';
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
import { CellResult, type CellSpec } from './cell.ts';
import { load_corpus_manifest } from './corpus.ts';
import {
	carry_deterministic,
	serialize_results,
	to_deterministic_path,
	to_expected_key,
	type CarriedDeterministic
} from './deterministic.ts';
import {
	JOURNAL_VERSION,
	diff_journal_header,
	open_journal,
	read_journal,
	to_journal_key,
	type Journal,
	type JournalHeader
} from './journal.ts';
import { LANG_ROSTER } from './langs.ts';
import { ADAPTERS } from './libraries.ts';
import { to_bench_coverage, to_bench_libraries } from './library_info.ts';
import {
	acquire_machine_lock,
	format_lock_holder,
	MACHINE_LOCK_PATH,
	type MachineLock
} from './lock.ts';
import { summarize_passes } from './measure.ts';
import { to_bench_cell, type CellNumbers } from './outputs.ts';
import {
	estimate_run_ms,
	format_run_help,
	parse_run_args,
	plan_cells,
	plan_processes,
	plan_retry,
	to_arm_count,
	to_calibration_path,
	to_journal_path,
	to_machine_name,
	to_results_path,
	type PassUnit,
	type PlannedCell,
	type PlannedProcess,
	type RunOptions,
	type RunParams
} from './run_options.ts';
import { to_bench_sets } from './sets.ts';

const REPO_DIR = fileURLToPath(new URL('../', import.meta.url));
const CELL_PATH = fileURLToPath(new URL('./cell.ts', import.meta.url));

/** How long one process may run before the run is failed, in milliseconds. */
export const CELL_TIMEOUT_MS = 10 * 60_000;

/** The exit code for each signal that stops a run. */
export const SIGNAL_EXIT = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 } as const;

/**
 * A library whose rounds on a cell are further apart than this, slowest over
 * fastest, was disturbed by something. A timed run measures it there again, and
 * the run's summary lists the ones still past it.
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
export const spawn_cell_sync = (spec: CellSpec): ChildOutcome => {
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

/** A process of a run with what it reported. */
export interface ProcessResult {
	planned: PlannedProcess;
	result: CellResult;
}

/**
 * Creates the check each result goes through as it arrives: a library's
 * processes on a cell must agree on what is deterministic, whichever pass, arm,
 * or attempt they are, and the first of them must agree with the deterministic
 * results file when the run carries one. A disagreement stops the run at that
 * cell.
 *
 * @param expected - what the deterministic file has for each input and library
 */
const create_agreement_check = (
	expected?: CarriedDeterministic['expected']
): ((planned: PlannedProcess, result: CellResult) => void) => {
	const firsts: Map<string, CellResult> = new Map();
	return (planned, result) => {
		const label = to_process_label(planned);
		const first = firsts.get(label);
		if (first) {
			assert_passes_agree(label, first, result);
			return;
		}
		firsts.set(label, result);
		if (expected) {
			assert_matches_deterministic(
				label,
				expected.get(to_expected_key(planned.cell.input.file, planned.library)),
				result
			);
		}
	};
};

/**
 * Runs the processes of a smoke run, several at a time.
 *
 * @param processes - the processes
 * @param options - the run
 * @param concurrency - how many run at once
 * @param expected - what the deterministic file has, which every result must agree with
 * @param on_result - called after each process, with its stderr
 * @returns their results, in the order planned
 * @throws `RunError` at the first process that fails, or whose result disagrees
 * with an earlier pass of the same library on the same cell
 */
const run_processes_at_once = async (
	processes: ReadonlyArray<PlannedProcess>,
	options: RunOptions,
	concurrency: number,
	expected: CarriedDeterministic['expected'] | undefined,
	on_result: (planned: PlannedProcess, done: number, stderr: string) => void
): Promise<Array<ProcessResult>> => {
	const results: Array<ProcessResult> = [];
	const check = create_agreement_check(expected);
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
				const result = read_cell_result(planned, outcome);
				check(planned, result);
				results[i] = { planned, result };
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

/** Whether a library's passes on a cell were disturbed: their pooled spread is past the threshold. */
export const passes_are_disturbed = (passes: ReadonlyArray<CellResult>, bytes: number): boolean => {
	const measurements = passes.flatMap((pass) => (pass.measurement ? [pass.measurement] : []));
	return measurements.length > 0 && summarize_passes(measurements, bytes).spread > DISTURBED_SPREAD;
};

/** How a timed run gets and keeps its results. */
export interface RunCellsDeps {
	/**
	 * Gets one process's result: by running it and blocking until it exits, or
	 * from a journal.
	 */
	measure: (planned: PlannedProcess) => CellResult;
	/** Called with each result once it has passed the agreement check. */
	on_result?: (planned: PlannedProcess, result: CellResult) => void;
	/** What the deterministic file has, which every library's first result on a cell must match. */
	expected?: CarriedDeterministic['expected'];
}

/**
 * Measures the cells of a timed run, one process at a time: each cell's planned
 * passes, then its retries.
 *
 * A library whose passes on the cell were disturbed (`passes_are_disturbed`) is
 * measured there again, every pass of it, up to `options.retries` times and
 * until an attempt isn't disturbed. In a calibration each arm of a library is
 * retried on its own, by the rule a full run applies to a library, so an arm
 * stays exactly what a full run would measure.
 *
 * What is measured next depends only on the results so far, so replaying a
 * journal's results through `deps.measure` continues a run where it stopped.
 *
 * @param cells - the cells, in the order they are measured
 * @param options - the run
 * @param deps - how a result is got, and what happens to it
 * @returns every process with its result, in the order measured
 * @throws `RunError` at the first process that fails, or whose result disagrees
 * with an earlier one of the same library on the same cell, or with the
 * deterministic file
 */
export const run_cells_in_turn = async (
	cells: ReadonlyArray<PlannedCell>,
	options: Pick<RunOptions, 'kind' | 'passes' | 'retries'>,
	deps: RunCellsDeps
): Promise<Array<ProcessResult>> => {
	const { measure, on_result } = deps;
	const arms = to_arm_count(options.kind);
	const check = create_agreement_check(deps.expected);
	const results: Array<ProcessResult> = [];
	const run = async (processes: ReadonlyArray<PlannedProcess>): Promise<Array<ProcessResult>> => {
		const ran: Array<ProcessResult> = [];
		for (const planned of processes) {
			const result = measure(planned);
			check(planned, result);
			on_result?.(planned, result);
			ran.push({ planned, result });
			results.push({ planned, result });
			await yield_to_signals();
		}
		return ran;
	};
	for (const cell of cells) {
		let latest = await run(plan_processes([cell], options.passes * arms));
		for (let attempt = 1; attempt <= options.retries; attempt++) {
			const ran = latest;
			const disturbed: Array<PassUnit> = cell.libraries
				.flatMap((library) =>
					Array.from({ length: arms }, (_, arm): PassUnit => ({ library, arm }))
				)
				.filter(({ library, arm }) =>
					passes_are_disturbed(
						ran
							.filter((p) => p.planned.library === library && p.planned.pass % arms === arm)
							.map((p) => p.result),
						cell.input.bytes
					)
				);
			if (disturbed.length === 0) break;
			latest = await run(plan_retry(cell, disturbed, options.passes, arms, attempt));
		}
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

/**
 * Checks a library's result on a cell against the deterministic results file:
 * whether it passed the output check, its token count, and its output size. The
 * two come from the same check under the same setup, so they differ only when
 * the file is stale or something is not deterministic.
 *
 * @param label - the cell and library, for the error
 * @param expected - what the file has for the input and library, if anything
 * @throws `RunError` with exit code 2 if they differ
 */
export const assert_matches_deterministic = (
	label: string,
	expected: CellNumbers | { excluded: string } | undefined,
	result: CellResult
): void => {
	const measured = result.measurement;
	const matches =
		expected !== undefined &&
		('excluded' in expected
			? result.excluded === expected.excluded
			: measured !== null &&
				measured.tokens === expected.tokens &&
				JSON.stringify(measured.output) === JSON.stringify(expected.output));
	if (!matches) {
		throw new RunError(
			`${label} disagrees with the deterministic results file, which has ${JSON.stringify(expected ?? null)} where the process reported ${JSON.stringify(result.excluded ?? { tokens: measured!.tokens, output: measured!.output })}: regenerate the file with \`npm run bench:deterministic\`, and if it still disagrees the library's output is not deterministic`,
			2
		);
	}
};

/** What a library came to on one cell, across its passes and attempts. */
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
 * Picks which attempt at a library-cell is kept: the one whose rounds agreed
 * best, and the earliest of those that tie.
 *
 * It never looks at the times. Keeping the fastest attempt would bias every
 * retried number toward fast, and a library that is noisier would be retried
 * more often and so favoured more.
 *
 * @param spreads - each attempt's spread, in the order measured
 * @returns the index of the attempt to keep
 */
export const select_attempt = (spreads: ReadonlyArray<number>): number =>
	spreads.reduce((best, spread, i) => (spread < spreads[best]! ? i : best), 0);

/**
 * Combines a library's processes on one cell. Every pass of an attempt is
 * pooled into one value, and of several attempts `select_attempt` keeps one.
 *
 * In a calibration the passes alternate between two arms, as if they were two
 * libraries: each arm is pooled and selected on its own, the value is the first
 * arm's, and the ratio compares the two.
 *
 * @param label - the cell and library, for an error
 * @param processes - the library's processes on the cell, with their results
 * @param bytes - the size of the input
 * @param run - the kind of run and how many passes one arm has
 * @throws `RunError` if the processes disagree on what is deterministic (whether
 * the library passed the check, its token count, or its output), or an attempt
 * lacks a pass
 */
export const combine_passes = (
	label: string,
	processes: ReadonlyArray<ProcessResult>,
	bytes: number,
	run: Pick<RunOptions, 'kind' | 'passes'>
): LibraryOutcome => {
	const first = processes[0]?.result;
	if (!first) throw new RunError(`${label} was not measured`);
	for (const { result } of processes) assert_passes_agree(label, first, result);
	if (first.excluded !== null) return { excluded: first.excluded };
	const arms = to_arm_count(run.kind);
	const [value, other] = Array.from({ length: arms }, (_, arm) => {
		const by_attempt = Map.groupBy(
			processes.filter((p) => p.planned.pass % arms === arm),
			(p) => p.planned.attempt
		);
		const summaries = [...by_attempt.keys()]
			.toSorted((a, b) => a - b)
			.map((attempt) => {
				const passes = by_attempt.get(attempt)!;
				if (passes.length !== run.passes) {
					throw new RunError(`${label} has ${passes.length} of ${run.passes} passes in an attempt`);
				}
				return summarize_passes(
					passes
						.toSorted((a, b) => a.planned.pass - b.planned.pass)
						.map((p) => p.result.measurement!),
					bytes
				);
			});
		if (summaries.length === 0) throw new RunError(`${label} lacks an arm`);
		return {
			...summaries[select_attempt(summaries.map((s) => s.spread))]!,
			attempts: summaries.length
		};
	});
	return {
		excluded: null,
		tokens: first.measurement!.tokens,
		output: first.measurement!.output,
		value: value!,
		ratio: other ? value!.ns_per_op / other.ns_per_op : null
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
 * version, corpus, and parameters, retries included.
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
	if (run?.kind !== 'calibrate' || noise_floor === null || machine === null) {
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
	for (const key of [
		'passes',
		'rounds',
		'target_ms',
		'warmup_ms',
		'rewarm_ms',
		'retries'
	] as const) {
		if (run[key] !== context.params[key]) {
			return { ok: false, reason: `it measured with ${key} ${run[key]}` };
		}
	}
	return { ok: true, noise_floor };
};

/** Everything a results file is assembled from. */
export interface RunRecord {
	options: RunOptions;
	/** When the run started: its first segment, if it was resumed. */
	generated_at: string;
	/** How long it measured for, over every segment. */
	duration_ms: number;
	/** How many segments it was measured in. */
	segments: number;
	machine: BenchMachine;
	node: string;
	commit: string;
	corpus_hash: string;
	/** The libraries the run selected, in roster order. */
	adapters: ReadonlyArray<HighlighterAdapter>;
	/** Every process's result, each with the process it answers, retries included. */
	processes: ReadonlyArray<ProcessResult>;
	anchor: BenchAnchor;
	/** The floor carried from the machine's calibration. A calibration run derives its own. */
	noise_floor: BenchNoiseFloor | null;
	/** What the run takes from the deterministic results file, when that file describes it. */
	deterministic: CarriedDeterministic | null;
}

/**
 * Assembles a results file and validates it.
 *
 * The cells' token counts and HTML sizes are the ones their processes reported.
 * The bundle sizes are the deterministic file's, when the run carries it, and
 * otherwise the section is empty.
 *
 * A library that failed the output check in a cell has no numbers there and an
 * entry in `meta.excluded`. A library that doesn't claim a cell's language was
 * never asked about it, and has neither.
 *
 * @returns the parsed results, and a calibration's pairs
 * @throws if a library's processes disagree, or the assembled file doesn't
 * match `BenchResults`
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
		const numbers: Array<[string, CellNumbers]> = [];
		const by_library = Map.groupBy(processes, (p) => p.planned.library);
		// roster order, whichever library a pass started with
		for (const library of cell.libraries) {
			const outcome = combine_passes(
				`cell ${cell.id} (${library})`,
				by_library.get(library) ?? [],
				input.bytes,
				options
			);
			if (outcome.excluded !== null) {
				excluded.push({ cell: cell.id, library, reason: outcome.excluded });
				continue;
			}
			values[library] = outcome.value;
			numbers.push([library, { tokens: outcome.tokens, output: outcome.output }]);
			if (outcome.ratio !== null) pairs.push({ cell: cell.id, library, ratio: outcome.ratio });
		}
		return to_bench_cell(input, cell.mode, numbers, values);
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
				retries: options.retries,
				loaded_langs: 'cell',
				filters: options.filters,
				segments: record.segments,
				duration_ms: record.duration_ms
			},
			anchor: record.anchor,
			libraries: to_bench_libraries(record.adapters),
			excluded,
			noise_floor: calibrate ? to_noise_floor(pairs) : record.noise_floor,
			bundler: record.deterministic?.bundler ?? null
		},
		langs: [...LANG_ROSTER],
		sets: to_bench_sets(),
		inputs: [...new Set(cells.map((cell) => cell.file))].map(
			(file) => [...by_cell.keys()].find((cell) => cell.input.file === file)!.input
		),
		cells,
		startup: [],
		bundle: record.deterministic?.bundle ?? {},
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
	if (run.segments > 1) {
		lines.push(`resumed: measured in ${run.segments} segments, and the anchor covers all of them`);
	}
	const disturbed: Array<{ cell: string; library: string; spread: number }> = [];
	let retried = 0;
	for (const { id } of meta.libraries) {
		const measured = cells.filter((cell) => Object.hasOwn(cell.values, id));
		if (measured.length === 0) {
			lines.push(`  ${id.padEnd(12)} not measured in any cell`);
			continue;
		}
		const spreads = measured.map((cell) => cell.values[id]!.spread);
		let own_retried = 0;
		for (const cell of measured) {
			const { spread, attempts } = cell.values[id]!;
			if (spread > DISTURBED_SPREAD) disturbed.push({ cell: cell.id, library: id, spread });
			if (attempts > 1) own_retried++;
		}
		retried += own_retried;
		lines.push(
			`  ${id.padEnd(12)} ${String(measured.length).padStart(3)} cells, spread median ${stats_median(spreads).toFixed(3)}, worst ${Math.max(...spreads).toFixed(3)}${run.kind === 'smoke' ? '' : `, ${own_retried} retried`}`
		);
	}
	if (run.kind !== 'smoke') {
		const after = run.retries === 0 ? '' : ` after ${run.retries} more attempt(s)`;
		lines.push(
			`retried: ${retried === 0 ? 'none' : `${retried} library-cells were measured again, and each keeps the attempt whose rounds agreed best, so its spread is that attempt's`}`,
			disturbed.length === 0
				? `disturbed: none (no spread over ${DISTURBED_SPREAD})`
				: `disturbed: ${disturbed.length} library-cells still have a spread over ${DISTURBED_SPREAD}${after}, so something else was running or its processes disagreed`
		);
		disturbed.sort((a, b) => b.spread - a.spread);
		for (const { cell, library, spread } of disturbed.slice(0, MAX_DISTURBED_LISTED)) {
			lines.push(`  ${library} in ${cell}: ${spread.toFixed(3)}`);
		}
		if (disturbed.length > MAX_DISTURBED_LISTED) lines.push('  and more');
	}
	if (meta.anchor) {
		lines.push(
			`anchor drift ${format_percent(meta.anchor.drift)}${meta.anchor.stable ? '' : `: UNSTABLE, the machine changed state during the run${run.segments > 1 ? ' or between its segments' : ''}`}`
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
	lines.push(
		meta.bundler
			? 'bundle sizes: carried from the deterministic results file, which every cell agreed with'
			: 'bundle sizes: none'
	);
	if (meta.commit?.endsWith('-dirty')) {
		lines.push(
			'the working tree had uncommitted changes, so the commit does not describe this run'
		);
	}
	return lines.join('\n');
};

/**
 * What `run_bench` can be given in place of the machine's own: two paths, where
 * its notes go, and for a timed run how a process is run and the anchor read.
 */
export interface RunBenchOptions {
	/** The lock file. Tests pass their own so they neither take nor wait on the machine's. */
	lock_path?: string;
	/** The results directory. */
	results_dir?: string;
	/** Receives progress and notes. Defaults to stderr. */
	log?: (line: string) => void;
	/** Runs one process of a timed run and blocks until it exits. */
	spawn_cell?: (spec: CellSpec) => ChildOutcome;
	/** Reads the anchor. */
	measure_anchor?: () => number;
}

/**
 * Checks that a file could be written at a path: the nearest directory that
 * exists above it is one, and is writable.
 *
 * @throws `RunError` with exit code 2 if not
 */
const assert_writable = (path: string): void => {
	let dir = dirname(path);
	while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
	let writable = statSync(dir).isDirectory();
	try {
		accessSync(dir, constants.W_OK | constants.X_OK);
	} catch {
		writable = false;
	}
	if (!writable)
		throw new RunError(`can't write to ${path}: ${dir} is not a writable directory`, 2);
};

/** Everything a run is decided to be before it measures. */
export interface RunPlan {
	options: RunOptions;
	machine: BenchMachine;
	node: string;
	commit: string;
	/** When the run started: its journal's first segment, if it resumes one. */
	generated_at: string;
	corpus_hash: string;
	/** The libraries the run selected, in roster order. */
	adapters: ReadonlyArray<HighlighterAdapter>;
	cells: Array<PlannedCell>;
	/** The planned processes, before any retry. */
	processes: Array<PlannedProcess>;
	/** How many processes run at once: one for anything timed. */
	concurrency: number;
	/** Where the results are written. */
	path: string;
	/** Where the journal is kept, or null for a smoke run, which keeps none. */
	journal_path: string | null;
	/** The header of this run's journal. */
	header: JournalHeader | null;
	/** The journal being resumed. */
	journal: Journal | null;
	/** The floor carried from the machine's calibration. A calibration run derives its own. */
	noise_floor: BenchNoiseFloor | null;
	/** Why a full run carries no noise floor, if it doesn't. */
	noise_floor_note: string | null;
	/** What the run takes from the deterministic results file, when that file describes it. */
	deterministic: CarriedDeterministic | null;
	/** Why the run carries nothing from the deterministic results file, if it doesn't. */
	deterministic_note: string | null;
}

/**
 * Decides everything about a run that can be decided before measuring, and
 * refuses what would only fail later. It changes nothing on disk.
 *
 * @param options - the run, as `parse_run_args` describes it
 * @param bench_options - a results directory, for tests
 * @throws `RunError` with exit code 2 if the machine isn't named, no cell
 * matches, the output or the journal couldn't be written, a complete full run of
 * the same UTC date and machine is already there, a journal exists and
 * `--resume` wasn't given or doesn't match this run, `--resume` has no journal,
 * the machine's calibration file or the deterministic results file doesn't
 * parse, or a full run with no filters has no deterministic results file that
 * describes it
 */
export const plan_run = (options: RunOptions, bench_options: RunBenchOptions = {}): RunPlan => {
	const { results_dir } = bench_options;
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
	const smoke = options.kind === 'smoke';
	// a calibration measures each library as two arms, so each gets twice the passes
	const processes = plan_processes(cells, options.passes * to_arm_count(options.kind));
	const machine = read_machine(options.machine ?? to_machine_name(hostname()));
	const node = process.version;
	const commit = read_commit();

	let out: string | null = null;
	if (options.out !== null) {
		if (options.out === '') throw new RunError('--out needs a file path', 2);
		out = resolve(options.out);
		if (existsSync(out) && statSync(out).isDirectory()) {
			throw new RunError(`--out ${options.out} is a directory, not a file`, 2);
		}
	}

	// the journal first: a resumed run is named by the date its first segment started
	const journal_path = smoke
		? null
		: to_journal_path({ ...options, machine: machine.name, out }, results_dir);
	let journal: Journal | null = null;
	if (journal_path !== null && existsSync(journal_path)) {
		const read = read_journal(journal_path);
		if (!options.resume) {
			throw new RunError(
				`a journal exists: pass --resume to continue the run it records, or remove ${journal_path}\nit records ${read.ok ? describe_journal(read) : `nothing that can be read: ${read.message}`}`,
				2
			);
		}
		if (!read.ok) {
			throw new RunError(`${journal_path} can't be resumed, ${read.message}: remove it`, 2);
		}
		journal = read;
	} else if (options.resume) {
		throw new RunError(`there is no journal to resume at ${journal_path}`, 2);
	}
	const generated_at = journal?.header.generated_at ?? new Date().toISOString();

	const libraries = to_bench_libraries(adapters);
	const header: JournalHeader | null = smoke
		? null
		: {
				type: 'header',
				journal: JOURNAL_VERSION,
				generated_at,
				kind: options.kind as JournalHeader['kind'],
				passes: options.passes,
				rounds: options.rounds,
				target_ms: options.target_ms,
				warmup_ms: options.warmup_ms,
				rewarm_ms: options.rewarm_ms,
				retries: options.retries,
				filters: options.filters,
				corpus_hash: manifest.corpus_hash,
				libraries: libraries.map(({ id, version, extra_packages }) => ({
					id,
					version,
					...(extra_packages && { extra_packages })
				})),
				machine: { name: machine.name, cpu: machine.cpu, governor: machine.governor },
				os_release: release(),
				node,
				// the processes inherit the parent's environment
				node_options: process.env.NODE_OPTIONS ?? '',
				commit
			};
	if (journal && header) {
		const differences = diff_journal_header(journal.header, header);
		if (differences.length > 0) {
			throw new RunError(
				`${journal_path} records another run, so it can't be resumed by this one:\n${differences.map((d) => `  ${d.field}: the journal has ${JSON.stringify(d.journal)}, this run ${JSON.stringify(d.current)}`).join('\n')}\nrun it as it was started, or remove the journal`,
				2
			);
		}
		const unplanned = find_unplanned_result(journal, cells, options);
		if (unplanned !== null) {
			throw new RunError(
				`${journal_path} holds a result this run never asks for (${unplanned}), so it is not this run's: remove it`,
				2
			);
		}
	}

	const path =
		out ?? to_results_path({ ...options, machine: machine.name, generated_at }, results_dir);
	if (
		out === null &&
		options.kind === 'full' &&
		bench_run_is_complete(options) &&
		existsSync(path)
	) {
		throw new RunError(`${path} exists: move it or pass --out`, 2);
	}
	// the journal goes in the same directory
	assert_writable(path);
	if (journal_path !== null && journal) {
		try {
			accessSync(journal_path, constants.R_OK | constants.W_OK);
		} catch {
			throw new RunError(`can't write to ${journal_path}`, 2);
		}
	}

	let noise_floor: BenchNoiseFloor | null = null;
	let noise_floor_note: string | null = null;
	if (options.kind === 'full') {
		const calibration_path = to_calibration_path(machine.name, results_dir);
		if (!existsSync(calibration_path)) {
			noise_floor_note = `${machine.name} has no calibration run`;
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
			else noise_floor_note = `the calibration doesn't describe this run, ${carried.reason}`;
		}
	}

	// the deterministic file: the bundle sizes a run carries, and what its cells must agree with
	let deterministic: CarriedDeterministic | null = null;
	let deterministic_note: string | null = null;
	const deterministic_path = to_deterministic_path(results_dir);
	if (!existsSync(deterministic_path)) {
		deterministic_note =
			'there is no deterministic results file: generate it with `npm run bench:deterministic`';
	} else {
		let parsed: BenchResults;
		try {
			parsed = parse_bench_results(JSON.parse(readFileSync(deterministic_path, 'utf8')));
		} catch (error) {
			throw new RunError(
				`${deterministic_path} is not a results file: regenerate it with \`npm run bench:deterministic\`\n${(error as Error).message}`,
				2
			);
		}
		const carried = carry_deterministic(parsed, {
			libraries,
			corpus_hash: manifest.corpus_hash,
			sets: to_bench_sets()
		});
		if (carried.ok) deterministic = carried;
		else {
			deterministic_note = `the deterministic results file doesn't describe this run, ${carried.reason}: regenerate it with \`npm run bench:deterministic\``;
		}
	}
	// regenerating the file takes seconds and this run a long time: a publishable run is whole
	if (deterministic_note !== null && options.kind === 'full' && bench_run_is_complete(options)) {
		throw new RunError(
			`a full run carries the bundle sizes and checks its cells against the deterministic results, and ${deterministic_note}`,
			2
		);
	}

	return {
		options,
		machine,
		node,
		commit,
		generated_at,
		corpus_hash: manifest.corpus_hash,
		adapters,
		cells,
		processes,
		// a smoke run's numbers mean nothing, so only it runs processes side by side
		concurrency: smoke ? Math.max(1, availableParallelism()) : 1,
		path,
		journal_path,
		header,
		journal,
		noise_floor,
		noise_floor_note,
		deterministic,
		deterministic_note
	};
};

/** Says what run a journal records, so a leftover from another run is recognisable. */
const describe_journal = (journal: Journal): string => {
	const { kind, filters, generated_at } = journal.header;
	const filtered = Object.entries(filters)
		.filter(([, ids]) => ids !== null)
		.map(([key, ids]) => `${key} ${ids!.join(',')}`);
	return `a ${kind} run started ${generated_at}, ${filtered.length === 0 ? 'with no filters' : `filtered to ${filtered.join('; ')}`}, holding ${journal.results.size} results`;
};

/**
 * Finds a journaled result the plan could never ask for: a cell or library it
 * doesn't measure, a pass it doesn't have, or an attempt past its retries.
 *
 * @returns what the first such result is, or null when every one fits the plan
 */
const find_unplanned_result = (
	journal: Journal,
	cells: ReadonlyArray<PlannedCell>,
	options: Pick<RunOptions, 'kind' | 'passes' | 'retries'>
): string | null => {
	const by_id = new Map(cells.map((cell) => [cell.id, cell]));
	const passes = options.passes * to_arm_count(options.kind);
	for (const key of journal.results.keys()) {
		const [cell, library, pass, attempt] = JSON.parse(key) as [string, string, number, number];
		if (
			!by_id.get(cell)?.libraries.includes(library) ||
			pass >= passes ||
			attempt > options.retries
		) {
			return `${library} on ${cell}, pass ${pass + 1}, attempt ${attempt + 1}`;
		}
	}
	return null;
};

/** The suffix a journal is renamed with when its run lost the machine lock. */
export const OVERLAPPED_SUFFIX = '.overlapped';

const to_display_path = (path: string): string => {
	const relative_path = relative(process.cwd(), path);
	return relative_path.startsWith('..') ? path : relative_path;
};

/**
 * Describes a run that `plan_run` accepted, for `--plan`: what it would
 * measure, where it would write, and roughly how long it would take.
 */
export const format_run_plan = (plan: RunPlan): string => {
	const { options, cells, processes, journal } = plan;
	const retry_processes =
		cells.reduce((sum, cell) => sum + cell.libraries.length, 0) *
		options.passes *
		to_arm_count(options.kind) *
		options.retries;
	const estimate_ms = estimate_run_ms(processes.length, options, plan.concurrency);
	const rows: Array<[string, string]> = [
		['cells', String(cells.length)],
		['libraries', plan.adapters.map((a) => a.id).join(', ')],
		[
			'processes',
			`${processes.length}, ${plan.concurrency === 1 ? 'one at a time' : `${plan.concurrency} at a time`}${retry_processes > 0 ? `, and at most ${retry_processes} more if every library-cell is measured again` : ''}`
		],
		[
			'measuring',
			`${options.passes} pass(es) of ${options.rounds} round(s), ${options.target_ms}ms batches, ${options.warmup_ms}ms warmup, ${options.rewarm_ms}ms rewarm, up to ${options.retries} retries`
		],
		['commit', plan.commit],
		['output', to_display_path(plan.path)]
	];
	if (plan.journal_path === null) {
		rows.push(['journal', 'none: a smoke run keeps no journal']);
	} else {
		rows.push([
			'journal',
			`${to_display_path(plan.journal_path)}${journal ? `, which holds ${journal.results.size} results from ${journal.segments} segment(s) that this run continues` : ''}`
		]);
	}
	if (options.kind === 'full') {
		rows.push([
			'noise floor',
			plan.noise_floor ? 'carried from the calibration' : `none: ${plan.noise_floor_note}`
		]);
	}
	rows.push([
		'bundle sizes',
		plan.deterministic
			? 'carried from the deterministic results file'
			: `none: ${plan.deterministic_note}`
	]);
	rows.push([
		'estimate',
		`about ${estimate_ms >= 60_000 ? `${Math.round(estimate_ms / 60_000)} min` : time_format_adaptive(estimate_ms * 1e6)} for the planned processes, without retries${journal ? ' and before what the journal already holds' : ''}: a rough figure from the parameters, not a measurement`
	]);
	return [
		`the plan of a ${options.kind} run on ${plan.machine.name}: nothing is measured`,
		...rows.map(([name, value]) => `  ${name.padEnd(12)} ${value}`)
	].join('\n');
};

/** What measuring a run's processes comes to. */
interface Measured {
	processes: Array<ProcessResult>;
	/** Every anchor reading, over every segment. */
	readings_ns: Array<number>;
	duration_ms: number;
	segments: number;
}

/** Measures a smoke run: its processes several at a time, between two anchor readings. */
const measure_smoke = async (
	plan: RunPlan,
	bench_options: RunBenchOptions,
	on_progress: (planned: PlannedProcess, done: number) => void,
	log: (line: string) => void
): Promise<Measured> => {
	const read_anchor = bench_options.measure_anchor ?? measure_anchor;
	const started = performance.now();
	const opening = read_anchor();
	const processes = await run_processes_at_once(
		plan.processes,
		plan.options,
		plan.concurrency,
		plan.deterministic?.expected,
		(planned, done, stderr) => {
			if (stderr.trim() !== '') {
				log(`${to_process_label(planned)} wrote to stderr:\n${stderr.trim()}`);
			}
			on_progress(planned, done);
		}
	);
	return {
		processes,
		readings_ns: [opening, read_anchor()],
		duration_ms: Math.round(performance.now() - started),
		segments: 1
	};
};

/**
 * Measures a segment of a timed run: one process at a time, each result
 * journaled before the next process starts, between two anchor readings.
 *
 * Results the journal already holds are replayed in place of their processes.
 * However the segment ends, by finishing, failing, or a signal, it takes its
 * closing anchor reading, releases the lock, and leaves the journal for
 * `--resume`, or sets it aside if the lock had been lost. Only a process killed
 * outright (SIGKILL, power) takes no reading, and the next segment's opening
 * reading stands in for it.
 */
const measure_segment = async (
	plan: RunPlan,
	bench_options: RunBenchOptions,
	lock: MachineLock,
	on_progress: (planned: PlannedProcess, done: number) => void,
	log: (line: string) => void
): Promise<Measured> => {
	const { options, journal } = plan;
	const journal_path = plan.journal_path!;
	const read_anchor = bench_options.measure_anchor ?? measure_anchor;
	const spawn_cell = bench_options.spawn_cell ?? spawn_cell_sync;
	const started = performance.now();
	const at_ms = (): number => Math.round(performance.now() - started);
	const readings_ns = [...(journal?.readings_ns ?? [])];
	const replay = new Map(journal?.results);
	const fresh: Set<CellResult> = new Set();
	let done = 0;
	if (journal) {
		log(
			`resuming ${journal_path}: ${replay.size} results from ${journal.segments} segment(s) are kept`
		);
		if (plan.commit.endsWith('-dirty')) {
			log(
				'the working tree has uncommitted changes, and the journal can not tell whether they are the ones it was started with'
			);
		}
	}

	const writer = open_journal(journal_path, journal ? journal.complete_bytes : plan.header!);
	let closed = false;
	let overlapped = false;
	/**
	 * Ends the segment, once, however it ends: takes the closing reading, closes
	 * the journal, and releases the lock. A segment that had lost the lock may
	 * have overlapped another run, so its journal is set aside under a name no
	 * run resumes.
	 */
	const close = (): void => {
		if (closed) return;
		closed = true;
		try {
			const closing = read_anchor();
			readings_ns.push(closing);
			writer.append({ type: 'anchor', at_ms: at_ms(), anchor_ns: closing });
		} catch {
			// the journal still holds every result
		} finally {
			writer.close();
			if (!lock.release()) {
				overlapped = true;
				renameSync(journal_path, journal_path + OVERLAPPED_SUFFIX);
			}
		}
	};
	/** What becomes of the journal of a segment that stopped. */
	const to_hint = (): string =>
		overlapped
			? `the machine lock ${lock.path} was taken over during the run, so another run may have overlapped this one: the journal was set aside as ${to_display_path(journal_path + OVERLAPPED_SUFFIX)} and can not be resumed`
			: `the journal ${to_display_path(journal_path)} is kept: run the same command with --resume to continue, or remove it to start over`;
	// a signal exits the process from its handler, between two processes
	const on_exit = (): void => {
		if (closed) return;
		close();
		log(to_hint());
	};
	// before the run's own release of the lock, so the closing reading is taken under it
	process.prependOnceListener('exit', on_exit);
	try {
		const opening = read_anchor();
		readings_ns.push(opening);
		writer.append({ type: 'segment', at_ms: at_ms(), anchor_ns: opening });
		const processes = await run_cells_in_turn(plan.cells, options, {
			...(plan.deterministic && { expected: plan.deterministic.expected }),
			measure: (planned) => {
				const key = to_journal_key(planned.cell.id, planned.library, planned.pass, planned.attempt);
				const journaled = replay.get(key);
				if (journaled) {
					replay.delete(key);
					return journaled;
				}
				const outcome = spawn_cell(to_cell_spec(planned, options));
				const result = read_cell_result(planned, outcome);
				if (outcome.stderr.trim() !== '') {
					log(`${to_process_label(planned)} wrote to stderr:\n${outcome.stderr.trim()}`);
				}
				fresh.add(result);
				return result;
			},
			// journaled only once it agrees with the library's earlier results
			on_result: (planned, result) => {
				done++;
				if (!fresh.has(result)) return;
				writer.append({
					type: 'result',
					at_ms: at_ms(),
					pass: planned.pass,
					attempt: planned.attempt,
					result
				});
				on_progress(planned, done);
			}
		});
		close();
		if (overlapped) throw new RunError(`${to_hint()}: nothing was written`);
		if (replay.size > 0) {
			// each fits the plan, or `plan_run` would have refused: a retry the results don't call for
			throw new RunError(
				`${journal_path} holds ${replay.size} results this run never asked for, so it is not this run's: remove it`,
				2
			);
		}
		return {
			processes,
			readings_ns,
			duration_ms: (journal?.duration_ms ?? 0) + at_ms(),
			segments: (journal?.segments ?? 0) + 1
		};
	} catch (error) {
		// thrown above, after the segment ended: the message already says what became of the journal
		if (closed) throw error;
		close();
		if (error instanceof RunError) {
			throw new RunError(`${error.message}\n${to_hint()}`, error.exit_code);
		}
		throw error;
	} finally {
		process.off('exit', on_exit);
	}
};

/**
 * Runs the timed harness and writes the results file.
 *
 * @param options - the run, as `parse_run_args` describes it
 * @param bench_options - paths, a logger, and how a process is run, for tests
 * @returns the validated results, the path they were written to, and a
 * calibration's pairs
 * @throws `RunError` if the run can't start, a process fails, or the lock is
 * lost. No results are written unless every process succeeded. A timed run that
 * stops leaves its journal, and `--resume` continues it.
 */
export const run_bench = async (
	options: RunOptions,
	bench_options: RunBenchOptions = {}
): Promise<{ results: BenchResults; path: string; pairs: Array<CalibrationPair> }> => {
	const log = bench_options.log ?? ((line: string) => process.stderr.write(line + '\n'));
	// everything that could fail is tried before measuring, not after
	const plan = plan_run(options, bench_options);
	const { machine, adapters, cells, processes, path, journal_path } = plan;
	if (plan.noise_floor_note !== null) log(`no noise floor: ${plan.noise_floor_note}`);
	if (plan.deterministic_note !== null) log(`no bundle sizes: ${plan.deterministic_note}`);
	try {
		mkdirSync(dirname(path), { recursive: true });
	} catch (error) {
		throw new RunError(`can't write to ${path}: ${(error as Error).message}`, 2);
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
		log(
			`${options.kind} run on ${machine.name}: ${cells.length} cells, ${processes.length} processes${plan.concurrency > 1 ? `, ${plan.concurrency} at a time` : ''}, libraries ${adapters.map((a) => a.id).join(', ')}`
		);
		// `plan_run` has already spawned a process, to read the commit: the anchor reads several
		// percent slower after a process's first spawn, so every reading must come after one
		const show_progress = process.stderr.isTTY && !bench_options.log;
		const on_progress = (planned: PlannedProcess, done: number): void => {
			if (!show_progress) return;
			process.stderr.write(
				`\r\x1b[K  [${done}/${Math.max(done, processes.length)}] ${planned.cell.id} ${planned.library}${planned.attempt > 0 ? ` (attempt ${planned.attempt + 1})` : ''}`
			);
		};
		const measured =
			options.kind === 'smoke'
				? await measure_smoke(plan, bench_options, on_progress, log)
				: await measure_segment(plan, bench_options, lock, on_progress, log);
		if (show_progress) process.stderr.write('\r\x1b[K');

		const { results, pairs } = assemble_results({
			options,
			generated_at: plan.generated_at,
			duration_ms: measured.duration_ms,
			segments: measured.segments,
			machine,
			node: plan.node,
			commit: plan.commit,
			corpus_hash: plan.corpus_hash,
			adapters,
			processes: measured.processes,
			anchor: to_anchor_drift(measured.readings_ns),
			noise_floor: plan.noise_floor,
			deterministic: plan.deterministic
		});

		// a timed segment has released the lock already, and set its journal aside if it was lost
		if (!lock.release()) {
			throw new RunError(
				`the machine lock ${lock.path} was taken over during the run, so another run may have overlapped this one: nothing was written`
			);
		}
		// whole or not at all: a reader never sees half a file
		const temp_path = `${path}.${process.pid}.tmp`;
		try {
			writeFileSync(temp_path, serialize_results(results));
			renameSync(temp_path, path);
		} catch (error) {
			rmSync(temp_path, { force: true });
			throw new RunError(
				`can't write ${path}: ${(error as Error).message}${journal_path === null ? '' : `\nthe journal ${to_display_path(journal_path)} is kept, and holds the whole run: fix the output, then run the same command with --resume`}`,
				2
			);
		}
		// the results are written, so the journal has nothing left to resume
		if (journal_path !== null) rmSync(journal_path, { force: true });
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
	// an exit runs what `run_bench` registered: a timed run's closing reading, and the lock's release
	for (const [signal, code] of Object.entries(SIGNAL_EXIT)) {
		process.on(signal, () => process.exit(code));
	}
	try {
		if (parsed.options.plan) {
			console.log(format_run_plan(plan_run(parsed.options)));
			return 0;
		}
		const { results, path, pairs } = await run_bench(parsed.options);
		console.log(format_run_summary(results, pairs));
		console.log(`wrote ${to_display_path(path)}`);
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
