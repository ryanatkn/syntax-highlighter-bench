/**
 * What a run is asked to do: its flags, the parameters each kind of run
 * measures with, the cells it covers, and where its results go. Everything here
 * is a pure function of its arguments, so `bench/run.ts` holds only the parts
 * that touch the machine.
 *
 * @module
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	BenchMode,
	BenchRunMetric,
	BenchSize,
	BenchSource,
	bench_run_is_complete,
	to_bench_cell_id,
	type BenchRunFilters,
	type BenchRunKind
} from '../src/lib/results_schema.ts';
import type { HighlighterAdapter } from './adapter.ts';
import type { CorpusInput } from './corpus.ts';
import { is_lang, lang_is_timed, TIMED_LANGS } from './langs.ts';
import type { MeasureOptions } from './measure.ts';

/** The directory results are written under. */
export const RESULTS_DIR = fileURLToPath(new URL('../results/', import.meta.url));

/**
 * The directory under `RESULTS_DIR` for runs that are not complete: smoke runs
 * and filtered ones. It is ignored by git.
 */
export const SCRATCH_DIR_NAME = 'scratch';

/** How a run measures: how each process does, and how many processes a library gets. */
export interface RunParams extends MeasureOptions {
	/** How many processes measure each library in each cell. */
	passes: number;
	/** How many times a library whose rounds on a cell disagreed is measured again there. */
	retries: number;
	/** How many samples each cold-start scenario keeps, each a fresh process. */
	startup_samples: number;
	/** How many rounds of cold-start processes run first and are thrown away. */
	startup_discard: number;
}

/**
 * The parameters of a `full` and a `calibrate` run.
 *
 * More than one pass, so a library's number is not one process's luck: the same
 * code can settle at a slightly different speed from one process to the next.
 * Three rather than two, so the median of the pooled rounds comes from the
 * middle pass and not from between two that disagree.
 *
 * The rewarm is longer than the warmup. A forced collection leaves code cold,
 * and libraries recover from it at different speeds: Shiki more slowly than
 * the others. With a rewarm as short as the warmup a slow recoverer was still
 * recovering when its batch was timed, and read slow for it. The rewarm is long
 * enough that every library in the roster has recovered.
 *
 * The retries are few: a library-cell that stays disturbed after them says the
 * machine is busy, and measuring it again and again would only hide that.
 *
 * A cold-start scenario keeps enough samples for a median and a 10th and 90th
 * percentile that one slow process can't move. The rounds discarded before them
 * bring every file a scenario reads into the OS page cache, which a machine
 * pays once and not at every start.
 */
export const FULL_PARAMS: Readonly<RunParams> = {
	passes: 3,
	retries: 2,
	rounds: 4,
	target_ms: 20,
	warmup_ms: 100,
	rewarm_ms: 300,
	startup_samples: 20,
	startup_discard: 3
};

/**
 * The parameters of a `smoke` run: every step of the method, as briefly as it
 * can run. The numbers mean nothing.
 */
export const SMOKE_PARAMS: Readonly<RunParams> = {
	passes: 1,
	retries: 0,
	rounds: 1,
	target_ms: 1,
	warmup_ms: 1,
	rewarm_ms: 1,
	startup_samples: 1,
	startup_discard: 0
};

/**
 * The 1-minute load average above which a timed run warns as it starts; it
 * never refuses. A timed run measures one process at a time, and when it is
 * planned it has spawned nothing yet, so on a quiet machine the load is well
 * under 1. Above 1, something else kept about a CPU's worth of tasks running or
 * waiting over the last minute, enough to land in some library's batches and
 * not in the others'.
 */
export const LOAD_BUSY_ABOVE = 1;

/** Every flag `bench/run.ts` takes, as its help prints them. */
export const RUN_FLAGS: ReadonlyArray<{ flag: string; value: string | null; description: string }> =
	[
		{
			flag: '--smoke',
			value: null,
			description:
				'run every library on every cell once, briefly and several at a time, to prove the harness works; the numbers mean nothing'
		},
		{
			flag: '--calibrate',
			value: null,
			description:
				'measure every library twice in every cell; how far the two are apart is the noise floor'
		},
		{ flag: '--libraries', value: '<ids>', description: 'measure only these libraries' },
		{ flag: '--langs', value: '<ids>', description: 'measure only inputs in these languages' },
		{
			flag: '--sizes',
			value: '<tiers>',
			description: `measure only inputs of these size tiers (${BenchSize.options.join(', ')})`
		},
		{
			flag: '--modes',
			value: '<modes>',
			description: `measure only these modes (${BenchMode.options.join(', ')})`
		},
		{
			flag: '--sources',
			value: '<sources>',
			description: `measure only inputs from these sources (${BenchSource.options.join(', ')})`
		},
		{
			flag: '--metrics',
			value: '<metrics>',
			description: `measure only these (${BenchRunMetric.options.join(', ')}): the timed cells, cold start, or by default both`
		},
		{
			flag: '--passes',
			value: '<n>',
			description: `how many processes measure each library in a cell (default ${FULL_PARAMS.passes})`
		},
		{
			flag: '--rounds',
			value: '<n>',
			description: `how many batches each process times (default ${FULL_PARAMS.rounds})`
		},
		{
			flag: '--target-ms',
			value: '<ms>',
			description: `how long one timed batch aims to run (default ${FULL_PARAMS.target_ms})`
		},
		{
			flag: '--retries',
			value: '<n>',
			description: `how many times a library whose rounds on a cell disagreed is measured again there; 0 is never (default ${FULL_PARAMS.retries})`
		},
		{
			flag: '--startup-samples',
			value: '<n>',
			description: `how many fresh processes sample each cold-start scenario, after ${FULL_PARAMS.startup_discard} discarded rounds (default ${FULL_PARAMS.startup_samples})`
		},
		{
			flag: '--resume',
			value: null,
			description:
				'continue the run its journal records, which must be this same run: flags, corpus, libraries, machine, Node, and commit'
		},
		{
			flag: '--plan',
			value: null,
			description:
				'print what the run would measure, where it would write, and roughly how long it would take, and measure nothing'
		},
		{
			flag: '--machine',
			value: '<name>',
			description:
				'the name the machine is recorded under; required for a run written to results/, otherwise the hostname'
		},
		{ flag: '--out', value: '<path>', description: 'write the results file here instead' },
		{ flag: '--help', value: null, description: 'print this' }
	];

/** The help text of `bench/run.ts`. */
export const format_run_help = (): string =>
	[
		'usage: node bench/run.ts [flags]',
		'',
		'Measures every cell of the corpus and every cold-start scenario, and writes',
		'one results file.',
		'Lists are comma-separated ids.',
		'',
		...RUN_FLAGS.map(
			({ flag, value, description }) =>
				`  ${(value === null ? flag : `${flag} ${value}`).padEnd(22)} ${description}`
		)
	].join('\n');

/** A run, as its flags describe it. */
export interface RunOptions extends RunParams {
	kind: BenchRunKind;
	filters: BenchRunFilters;
	/** The machine's name, or null to use the hostname. */
	machine: string | null;
	/** The results path, or null for the default. */
	out: string | null;
	/** Whether to continue the run its journal records. */
	resume: boolean;
	/** Whether to print the plan and measure nothing. */
	plan: boolean;
}

/** The options of a run, a request for the help, or what is wrong with the flags. */
export type ParsedRunArgs =
	| { ok: true; help: false; options: RunOptions }
	| { ok: true; help: true }
	| { ok: false; message: string };

/** The flags that take a positive whole number, and the parameter each sets. */
const NUMERIC_FLAGS: ReadonlyArray<
	[flag: string, key: 'passes' | 'rounds' | 'target_ms' | 'startup_samples']
> = [
	['--passes', 'passes'],
	['--rounds', 'rounds'],
	['--target-ms', 'target_ms'],
	['--startup-samples', 'startup_samples']
];

/** A machine name is part of a file name. */
const MACHINE_NAME_MATCHER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Parses the flags of `bench/run.ts`.
 *
 * @param args - the arguments after the script
 * @param adapters - the roster, which `--libraries` is checked against
 * @returns the run's options, or a message for a usage error
 */
export const parse_run_args = (
	args: ReadonlyArray<string>,
	adapters: ReadonlyArray<HighlighterAdapter>
): ParsedRunArgs => {
	const error = (message: string): ParsedRunArgs => ({ ok: false, message });
	const values: Map<string, string | null> = new Map();
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		const spec = RUN_FLAGS.find((f) => f.flag === arg);
		if (!spec) return error(`unknown argument "${arg}"`);
		if (values.has(arg)) return error(`${arg} is given twice`);
		if (spec.value === null) {
			values.set(arg, null);
			continue;
		}
		const value = args[++i];
		if (value === undefined || value.startsWith('--')) return error(`${arg} needs ${spec.value}`);
		values.set(arg, value);
	}
	if (values.has('--help')) return { ok: true, help: true };

	const smoke = values.has('--smoke');
	if (smoke && values.has('--calibrate')) {
		return error('--smoke and --calibrate are different kinds of run: give one');
	}
	if (smoke && [...NUMERIC_FLAGS.map(([flag]) => flag), '--retries'].some((f) => values.has(f))) {
		return error('--smoke sets its own passes, rounds, durations, retries, and samples');
	}
	if (smoke && values.has('--resume')) {
		return error('--smoke keeps no journal, so there is nothing to resume');
	}
	const kind: BenchRunKind = smoke ? 'smoke' : values.has('--calibrate') ? 'calibrate' : 'full';

	/** Reads a list flag, keeping `known`'s order so a run doesn't depend on how it was typed. */
	const parse_list = <T extends string>(
		flag: string,
		known: ReadonlyArray<T>
	): Array<T> | null | string => {
		const value = values.get(flag);
		if (value == null) return null;
		const ids = value.split(',').map((id) => id.trim());
		const unknown = ids.filter((id) => !(known as ReadonlyArray<string>).includes(id));
		if (unknown.length > 0) {
			return `${flag}: unknown ${unknown.map((id) => `"${id}"`).join(', ')} (have: ${known.join(', ')})`;
		}
		return known.filter((id) => ids.includes(id));
	};

	const untimed = (values.get('--langs') ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter((id) => is_lang(id) && !lang_is_timed(id));
	if (untimed.length > 0) {
		return error(`--langs: ${untimed.join(', ')} is not timed, so no cell covers it`);
	}
	const libraries = parse_list(
		'--libraries',
		adapters.map((a) => a.id)
	);
	if (typeof libraries === 'string') return error(libraries);
	const langs = parse_list('--langs', TIMED_LANGS);
	if (typeof langs === 'string') return error(langs);
	const sizes = parse_list('--sizes', BenchSize.options);
	if (typeof sizes === 'string') return error(sizes);
	const modes = parse_list('--modes', BenchMode.options);
	if (typeof modes === 'string') return error(modes);
	const sources = parse_list('--sources', BenchSource.options);
	if (typeof sources === 'string') return error(sources);
	const metrics = parse_list('--metrics', BenchRunMetric.options);
	if (typeof metrics === 'string') return error(metrics);
	if (kind === 'calibrate' && (metrics?.includes('startup') || values.has('--startup-samples'))) {
		return error(
			'--calibrate measures the noise floor of the timed cells, and no cold start: --metrics startup and --startup-samples do not apply'
		);
	}
	if (metrics && !metrics.includes('throughput') && (sizes || modes || sources)) {
		return error(
			'--sizes, --modes, and --sources select inputs, and cold start has none: with --metrics startup they select nothing'
		);
	}

	const params = { ...(smoke ? SMOKE_PARAMS : FULL_PARAMS) };
	for (const [flag, key] of NUMERIC_FLAGS) {
		const value = values.get(flag);
		if (value == null) continue;
		if (!/^\d+$/.test(value) || Number(value) < 1) {
			return error(`${flag}: "${value}" is not a positive whole number`);
		}
		params[key] = Number(value);
	}
	const retries = values.get('--retries');
	if (retries != null) {
		if (!/^\d+$/.test(retries)) return error(`--retries: "${retries}" is not a whole number`);
		params.retries = Number(retries);
	}

	const machine = values.get('--machine') ?? null;
	if (machine !== null && !MACHINE_NAME_MATCHER.test(machine)) {
		return error(
			`--machine: "${machine}" is part of a file name, so letters, digits, ".", "_", and "-" only`
		);
	}

	return {
		ok: true,
		help: false,
		options: {
			kind,
			filters: {
				libraries,
				langs,
				sizes,
				modes,
				sources,
				// naming every metric restricts nothing, so it is no filter, and nor does naming
				// throughput on a calibration, which measures nothing else
				metrics:
					metrics?.length === BenchRunMetric.options.length || kind === 'calibrate' ? null : metrics
			},
			...params,
			machine,
			out: values.get('--out') ?? null,
			resume: values.has('--resume'),
			plan: values.has('--plan')
		}
	};
};

/**
 * Whether a run measures a metric. A filter can leave either out, and a
 * calibration measures the timed cells only: its two arms are a property of the
 * cell method, and cold start has no arms.
 */
export const run_measures = (
	run: { kind: BenchRunKind; filters: Pick<BenchRunFilters, 'metrics'> },
	metric: BenchRunMetric
): boolean =>
	(metric === 'throughput' || run.kind !== 'calibrate') &&
	(run.filters.metrics?.includes(metric) ?? true);

/** Makes a hostname usable as a machine name. */
export const to_machine_name = (hostname: string): string => {
	const name = hostname.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[^A-Za-z0-9]+/, '');
	return name === '' ? 'machine' : name;
};

/** The path of a machine's calibration run, where a full run looks for its noise floor. */
export const to_calibration_path = (machine: string, dir: string = RESULTS_DIR): string =>
	join(dir, `calibration_${machine}.json`);

/**
 * The default path of a run's results file.
 *
 * - a complete `full` run: `results/<date>_<machine>.json`, by the UTC date
 * - a complete `calibrate` run: `results/calibration_<machine>.json`
 * - a smoke or filtered run: `results/scratch/<kind>_<machine>.json`, which git
 *   ignores
 *
 * @param run - the kind of run, its filters, the machine's name, and when it started
 * @param dir - the results directory
 */
export const to_results_path = (
	run: { kind: BenchRunKind; filters: BenchRunFilters; machine: string; generated_at: string },
	dir: string = RESULTS_DIR
): string => {
	if (!bench_run_is_complete(run)) {
		return join(dir, SCRATCH_DIR_NAME, `${run.kind}_${run.machine}.json`);
	}
	return run.kind === 'calibrate'
		? to_calibration_path(run.machine, dir)
		: join(dir, `${run.generated_at.slice(0, 10)}_${run.machine}.json`);
};

/**
 * The path of a timed run's journal, beside its results file.
 *
 * - with `--out`: `<out>.journal.jsonl`
 * - otherwise: `<kind>_<machine>.journal.jsonl` in the directory the results go
 *   to. It carries no date, because a full run's results are named by the date
 *   the run started, and a run resumed on a later day must still find its
 *   journal.
 *
 * @param run - the kind of run, its filters, the machine's name, and the resolved `--out` or null
 * @param dir - the results directory
 */
export const to_journal_path = (
	run: { kind: BenchRunKind; filters: BenchRunFilters; machine: string; out: string | null },
	dir: string = RESULTS_DIR
): string =>
	run.out !== null
		? `${run.out}.journal.jsonl`
		: join(
				dir,
				bench_run_is_complete(run) ? '' : SCRATCH_DIR_NAME,
				`${run.kind}_${run.machine}.journal.jsonl`
			);

/** One cell a run will measure. */
export interface PlannedCell {
	id: string;
	input: CorpusInput;
	mode: BenchMode;
	/** The ids of the libraries to measure: the selected ones that claim the language. */
	libraries: Array<string>;
	/**
	 * A number that differs between neighbouring cells and between the modes of
	 * one input. The library a cell's first pass starts with advances by it.
	 */
	rotation: number;
}

/**
 * Lists the cells of a run: every input of a timed language in every mode,
 * narrowed by the filters. A library that doesn't claim an input's language is
 * left out of that cell, which is what unsupported means. A cell no selected
 * library claims is not planned.
 *
 * @param inputs - the corpus manifest's inputs
 * @param filters - the run's filters
 * @param adapters - the roster
 * @returns the cells, in manifest order, each input's modes together
 */
export const plan_cells = (
	inputs: ReadonlyArray<CorpusInput>,
	filters: BenchRunFilters,
	adapters: ReadonlyArray<HighlighterAdapter>
): Array<PlannedCell> => {
	const selected = adapters.filter((a) => filters.libraries?.includes(a.id) ?? true);
	const modes = BenchMode.options.filter((mode) => filters.modes?.includes(mode) ?? true);
	const cells: Array<PlannedCell> = [];
	let input_index = 0;
	for (const input of inputs) {
		if (!lang_is_timed(input.lang)) continue;
		if (filters.langs && !filters.langs.includes(input.lang)) continue;
		if (filters.sizes && !filters.sizes.includes(input.size)) continue;
		if (filters.sources && !filters.sources.includes(input.source)) continue;
		const libraries = selected.filter((a) => Object.hasOwn(a.langs, input.lang)).map((a) => a.id);
		if (libraries.length === 0) continue;
		for (const [mode_index, mode] of modes.entries()) {
			cells.push({
				id: to_bench_cell_id(input.file, mode),
				input,
				mode,
				libraries,
				rotation: input_index + mode_index
			});
		}
		input_index++;
	}
	return cells;
};

/** One process of a run: one library on one cell. */
export interface PlannedProcess {
	cell: PlannedCell;
	library: string;
	/** Which of the library's processes on this cell it is, from zero. */
	pass: number;
	/**
	 * Which measurement of the library on this cell it belongs to: zero for the
	 * planned one, and from one for each retry.
	 */
	attempt: number;
}

/**
 * How many arms a library's passes are split into: two in a calibration, which
 * measures each library as if it were two, and otherwise one. A pass belongs to
 * the arm `pass % arms`.
 */
export const to_arm_count = (kind: BenchRunKind): number => (kind === 'calibrate' ? 2 : 1);

/**
 * Lists the processes of a run, in the order they are measured: cell by cell,
 * pass by pass, and within a pass every library once. The library a pass starts
 * with rotates from pass to pass and from cell to cell, so no library is always
 * measured first. Retries are not planned ahead: see `plan_retry`.
 *
 * @param cells - the cells of the run
 * @param passes - how many processes each library gets on each cell
 */
export const plan_processes = (
	cells: ReadonlyArray<PlannedCell>,
	passes: number
): Array<PlannedProcess> =>
	cells.flatMap((cell) =>
		Array.from({ length: passes }, (_, pass) =>
			cell.libraries.map((_library, k): PlannedProcess => ({
				cell,
				library: cell.libraries[(k + cell.rotation + pass) % cell.libraries.length]!,
				pass,
				attempt: 0
			}))
		).flat()
	);

/** A library's passes on a cell that are summarized into one number: one arm of them. */
export interface PassUnit {
	library: string;
	/** Which arm: always zero outside a calibration. */
	arm: number;
}

/**
 * Lists the processes that measure some libraries on a cell again: every pass
 * of each unit, pass by pass, with the unit a pass starts with rotating as it
 * does in the planned passes.
 *
 * @param cell - the cell
 * @param units - the libraries to measure again, and for a calibration which arm of each
 * @param passes - how many processes one arm gets
 * @param arms - how many arms a library's passes are split into
 * @param attempt - which retry this is, from one
 */
export const plan_retry = (
	cell: PlannedCell,
	units: ReadonlyArray<PassUnit>,
	passes: number,
	arms: number,
	attempt: number
): Array<PlannedProcess> =>
	Array.from({ length: passes }, (_, k) =>
		units.map((_unit, j): PlannedProcess => {
			const { library, arm } = units[(j + cell.rotation + k) % units.length]!;
			return { cell, library, pass: arm + arms * k, attempt };
		})
	).flat();

/**
 * What a process costs beyond the loops its parameters set, in milliseconds:
 * starting Node, loading the library, the output check, calibration, and the
 * collections. A rough figure, for `estimate_run_ms` only.
 */
export const PROCESS_OVERHEAD_MS = 500;

/**
 * Estimates how long a run measures for, from its parameters. It is rough: a
 * call longer than a batch's target stretches the batch, and retries add
 * processes that can't be known ahead.
 *
 * @param processes - how many processes the run plans
 * @param params - how each measures
 * @param concurrency - how many run at once
 * @returns milliseconds
 */
export const estimate_run_ms = (
	processes: number,
	params: MeasureOptions,
	concurrency: number = 1
): number =>
	(processes *
		(PROCESS_OVERHEAD_MS +
			params.warmup_ms +
			params.rounds * (params.rewarm_ms + params.target_ms))) /
	concurrency;

/**
 * What a cold-start process is taken to cost, in milliseconds: starting Node
 * and loading a library once. A rough figure, for `estimate_startup_ms` only.
 */
export const STARTUP_PROCESS_MS = 100;

/**
 * Estimates how long a run's cold-start processes take. As rough as
 * `estimate_run_ms`: a library that loads slowly takes several times the figure.
 *
 * @param processes - how many cold-start processes the run plans
 * @param concurrency - how many run at once
 * @returns milliseconds
 */
export const estimate_startup_ms = (processes: number, concurrency: number = 1): number =>
	(processes * STARTUP_PROCESS_MS) / concurrency;
