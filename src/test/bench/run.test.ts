import { assert, describe, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	BenchMachine,
	BenchResults,
	bench_results_is_publishable,
	type BenchCell,
	type BenchRunFilters
} from '$lib/results_schema.ts';
import type { CellResult } from '../../../bench/cell.ts';
import { load_corpus_manifest } from '../../../bench/corpus.ts';
import { ADAPTERS } from '../../../bench/libraries.ts';
import {
	DISTURBED_SPREAD,
	RunError,
	SIGNAL_EXIT,
	assemble_results,
	assert_matches_deterministic,
	assert_passes_agree,
	carry_noise_floor,
	combine_passes,
	format_run_summary,
	passes_are_disturbed,
	read_cell_result,
	read_commit,
	read_machine,
	run_cells_in_turn,
	select_attempt,
	to_cell_spec,
	to_deviation,
	to_geomean,
	to_noise_floor,
	type ChildOutcome,
	type ProcessResult,
	type RunRecord
} from '../../../bench/run.ts';
import {
	FULL_PARAMS,
	SMOKE_PARAMS,
	plan_cells,
	plan_processes,
	type PlannedProcess,
	type RunOptions
} from '../../../bench/run_options.ts';

const NO_FILTERS: BenchRunFilters = {
	libraries: null,
	langs: null,
	sizes: null,
	modes: null,
	sources: null
};

const create_options = (overrides: Partial<RunOptions> = {}): RunOptions => ({
	kind: 'full',
	filters: NO_FILTERS,
	...FULL_PARAMS,
	machine: 'box',
	out: null,
	resume: false,
	plan: false,
	...overrides
});

const manifest = load_corpus_manifest();

const MACHINE: BenchMachine = {
	name: 'box',
	cpu: 'Test CPU',
	governor: 'performance',
	memory_gb: 16
};

/** What a process would report: an invented measurement, or an exclusion. */
const create_cell_result = (
	planned: PlannedProcess,
	options: { excluded?: string; ns?: Array<number>; tokens?: number } = {}
): CellResult => ({
	cell: planned.cell.id,
	library: planned.library,
	loaded_langs: [planned.cell.input.lang],
	measurement:
		options.excluded === undefined
			? {
					tokens: options.tokens ?? 10,
					output: { html_bytes: 100, spans: 10 },
					iterations: 10,
					ns_per_op: options.ns ?? [1000, 1000],
					rss_peak_bytes: 50_000_000
				}
			: null,
	excluded: options.excluded ?? null
});

/** The deterministic section a cell states: its token counts, or its output sizes. */
const to_stated = (cell: BenchCell): BenchCell['tokens'] | BenchCell['output'] =>
	cell.mode === 'tokenize' ? cell.tokens : cell.output;

const SMALL_TS: BenchRunFilters = { ...NO_FILTERS, langs: ['ts'], sizes: ['small'] };

/** The processes of a run over `filters`, each answered by `answer`. */
const create_processes = (
	options: RunOptions,
	answer: (planned: PlannedProcess) => CellResult = (planned) => create_cell_result(planned)
): RunRecord['processes'] =>
	plan_processes(
		plan_cells(manifest.inputs, options.filters, ADAPTERS),
		options.kind === 'calibrate' ? options.passes * 2 : options.passes
	).map((planned) => ({ planned, result: answer(planned) }));

const create_record = (overrides: Partial<RunRecord> = {}): RunRecord => {
	const options = overrides.options ?? create_options({ filters: SMALL_TS });
	return {
		options,
		generated_at: '2026-01-01T00:00:00.000Z',
		duration_ms: 1234,
		segments: 1,
		machine: MACHINE,
		node: 'v24.14.1',
		commit: '0'.repeat(40),
		corpus_hash: manifest.corpus_hash,
		adapters: ADAPTERS.filter((a) => options.filters.libraries?.includes(a.id) ?? true),
		processes: create_processes(options),
		anchor: { drift: 0.001, stable: true },
		noise_floor: null,
		deterministic: null,
		...overrides
	};
};

const [PLANNED] = plan_processes(plan_cells(manifest.inputs, SMALL_TS, ADAPTERS), 1);

describe('to_cell_spec', () => {
	test('asks one process for one library on one cell, with the run parameters', () => {
		for (const options of [create_options(), create_options({ kind: 'smoke', ...SMOKE_PARAMS })]) {
			assert.deepStrictEqual(to_cell_spec(PLANNED!, options), {
				file: PLANNED!.cell.input.file,
				mode: PLANNED!.cell.mode,
				library: PLANNED!.library,
				rounds: options.rounds,
				target_ms: options.target_ms,
				warmup_ms: options.warmup_ms,
				rewarm_ms: options.rewarm_ms
			});
		}
	});
});

describe('read_cell_result', () => {
	const planned = PLANNED!;
	const ok = (stdout: string): ChildOutcome => ({
		error: null,
		status: 0,
		signal: null,
		stdout,
		stderr: ''
	});
	const report = (result: unknown): ChildOutcome => ok(JSON.stringify(result) + '\n');

	const assert_refused = (outcome: ChildOutcome, expected: RegExp, exit_code = 1): void => {
		let error: unknown;
		try {
			read_cell_result(planned, outcome);
		} catch (caught) {
			error = caught;
		}
		assert.ok(error instanceof RunError, 'expected a RunError');
		assert.strictEqual(error.exit_code, exit_code);
		assert.match(error.message, expected);
		// the message names the cell and the library, so a failed run says where
		assert.ok(error.message.includes(planned.cell.id));
		assert.ok(error.message.includes(planned.library));
	};

	test('accepts a result for what the process was asked', () => {
		const result = create_cell_result(planned);
		assert.deepStrictEqual(read_cell_result(planned, report(result)), result);
		const excluded = create_cell_result(planned, { excluded: 'produced no tokens' });
		assert.deepStrictEqual(read_cell_result(planned, report(excluded)), excluded);
	});

	test('a process that exits with an error fails the run, with what it wrote', () => {
		assert_refused(
			{ ...ok(''), status: 1, stderr: 'Error: boom\n' },
			/failed \(exit 1\):\nError: boom/
		);
		assert_refused({ ...ok(''), status: null, signal: 'SIGKILL' }, /failed \(signal SIGKILL\)/);
	});

	test('a process that times out says so', () => {
		const error = Object.assign(new Error('spawnSync node ETIMEDOUT'), { code: 'ETIMEDOUT' });
		assert_refused({ ...ok(''), error, status: null, signal: 'SIGTERM' }, /timed out after \d+s/);
	});

	test('a process stopped by a signal is an interruption, with that signal exit code', () => {
		for (const [signal, code] of Object.entries(SIGNAL_EXIT)) {
			assert_refused({ ...ok(''), status: null, signal }, /^interrupted during cell /, code);
		}
		assert.deepStrictEqual(SIGNAL_EXIT, { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 });
	});

	test('a process that could not be started says why', () => {
		const error = Object.assign(new Error('spawn node ENOENT'), { code: 'ENOENT' });
		assert_refused({ ...ok(''), error, status: null }, /could not be run: spawn node ENOENT/);
	});

	test('anything but one JSON result is refused', () => {
		assert_refused(ok(''), /something other than one JSON result/);
		assert_refused(ok('a library printed this\n{}'), /something other than one JSON result/);
		const twice = JSON.stringify(create_cell_result(planned));
		assert_refused(ok(`${twice}\n${twice}\n`), /something other than one JSON result/);
	});

	test('a malformed result is refused', () => {
		assert_refused(report(null), /malformed result/);
		assert_refused(report({ ...create_cell_result(planned), extra: 1 }), /malformed result/);
		assert_refused(
			report({ ...create_cell_result(planned), excluded: 'both' }),
			/malformed result/
		);
	});

	test('a result for another cell or library is refused', () => {
		assert_refused(
			report({ ...create_cell_result(planned), cell: 'other' }),
			/reported on "other"/
		);
		assert_refused(
			report({ ...create_cell_result(planned), library: 'highlight_js' }),
			/reported on .* \(highlight_js\)/
		);
	});

	test('a process that loaded anything but the cell language is refused', () => {
		for (const loaded_langs of [['ts', 'js'], [], ['js']]) {
			assert_refused(
				report({ ...create_cell_result(planned), loaded_langs }),
				/not exactly its language/
			);
		}
	});
});

describe('combine_passes', () => {
	const pass = (ns: Array<number>, tokens = 10): CellResult =>
		create_cell_result(PLANNED!, { ns, tokens });
	/** A library's passes, numbered in order, as one attempt. */
	const attempt = (results: Array<CellResult>, n = 0): Array<ProcessResult> =>
		results.map((result, i) => ({ planned: { ...PLANNED!, pass: i, attempt: n }, result }));
	const full = (passes: number) => ({ kind: 'full' as const, passes });

	test('pools the rounds of every pass into one value', () => {
		const outcome = combine_passes(
			'x',
			attempt([pass([900, 1000]), pass([1100, 1200])]),
			1000,
			full(2)
		);
		assert.ok(outcome.excluded === null);
		assert.strictEqual(outcome.value.ns_per_op, 1050);
		assert.closeTo(outcome.value.spread, 1200 / 900, 1e-12);
		assert.strictEqual(outcome.value.attempts, 1);
		assert.strictEqual(outcome.tokens, 10);
		assert.strictEqual(outcome.ratio, null);
	});

	test('a calibration splits the passes alternately into two arms', () => {
		const outcome = combine_passes(
			'x',
			attempt([pass([1000, 1000]), pass([800, 800]), pass([1000, 1000]), pass([800, 800])]),
			1000,
			{ kind: 'calibrate', passes: 2 }
		);
		assert.ok(outcome.excluded === null);
		// the value is the first arm's alone, as a full run with these passes would measure
		assert.strictEqual(outcome.value.ns_per_op, 1000);
		assert.strictEqual(outcome.value.spread, 1);
		assert.closeTo(outcome.ratio!, 1000 / 800, 1e-12);
	});

	test('of several attempts it keeps the one whose rounds agreed best, not the fastest', () => {
		const outcome = combine_passes(
			'x',
			[
				...attempt([pass([1000, 1500])], 0),
				// the steadiest, and the slowest
				...attempt([pass([2000, 2600])], 1),
				// the fastest
				...attempt([pass([500, 700])], 2)
			],
			1000,
			full(1)
		);
		assert.ok(outcome.excluded === null);
		assert.strictEqual(outcome.value.ns_per_op, 2300);
		assert.closeTo(outcome.value.spread, 1.3, 1e-12);
		assert.strictEqual(outcome.value.attempts, 3);
	});

	test('select_attempt takes the lowest spread, and the earliest of a tie', () => {
		assert.strictEqual(select_attempt([1.5]), 0);
		assert.strictEqual(select_attempt([1.5, 1.3, 1.4]), 1);
		assert.strictEqual(select_attempt([1.3, 1.3, 1.3]), 0);
		assert.strictEqual(select_attempt([1.5, 1.2, 1.2]), 1);
	});

	test('each arm of a calibration keeps its own best attempt', () => {
		const arm = (results: Array<CellResult>, which: number, n: number): Array<ProcessResult> =>
			results.map((result, i) => ({
				planned: { ...PLANNED!, pass: which + 2 * i, attempt: n },
				result
			}));
		const outcome = combine_passes(
			'x',
			[
				...arm([pass([1000, 1400])], 0, 0),
				...arm([pass([800, 800])], 1, 0),
				...arm([pass([1000, 1000])], 0, 1)
			],
			1000,
			{ kind: 'calibrate', passes: 1 }
		);
		assert.ok(outcome.excluded === null);
		assert.strictEqual(outcome.value.ns_per_op, 1000);
		assert.strictEqual(outcome.value.attempts, 2);
		assert.closeTo(outcome.ratio!, 1000 / 800, 1e-12);
	});

	test('an excluded library is excluded with its reason', () => {
		const excluded = create_cell_result(PLANNED!, { excluded: 'produced no tokens' });
		assert.deepStrictEqual(combine_passes('x', attempt([excluded, excluded]), 1000, full(2)), {
			excluded: 'produced no tokens'
		});
	});

	test('two passes are compared on what is deterministic, not on their times', () => {
		assert_passes_agree('x', pass([1000]), pass([2000]));
		assert.throws(
			() => assert_passes_agree('cell x (lib)', pass([1000], 10), pass([1000], 11)),
			/cell x \(lib\) came out differently/
		);
	});

	test('passes that disagree on something deterministic fail the run', () => {
		const excluded = create_cell_result(PLANNED!, { excluded: 'produced no tokens' });
		for (const passes of [
			[pass([1000]), excluded],
			[excluded, pass([1000])],
			[pass([1000], 10), pass([1000], 11)]
		]) {
			assert.throws(
				() => combine_passes('cell x (lib)', attempt(passes), 1000, full(2)),
				/cell x \(lib\) came out differently from one process to the next/
			);
			// and so do two attempts
			assert.throws(
				() =>
					combine_passes(
						'cell x (lib)',
						[...attempt([passes[0]!], 0), ...attempt([passes[1]!], 1)],
						1000,
						full(1)
					),
				/came out differently/
			);
		}
	});

	test('an attempt that lacks a pass fails the run', () => {
		assert.throws(
			() => combine_passes('cell x (lib)', attempt([pass([1000])]), 1000, full(2)),
			/has 1 of 2 passes/
		);
		assert.throws(() => combine_passes('cell x (lib)', [], 1000, full(1)), /was not measured/);
	});
});

describe('run_cells_in_turn', () => {
	const cells = plan_cells(manifest.inputs, SMALL_TS, ADAPTERS).slice(0, 2);
	const [cell] = cells;
	const steady = [1000, 1000];
	const noisy = [1000, 1000 * (DISTURBED_SPREAD + 0.1)];

	/** Runs the cells with each process answered by `answer`, and lists what was asked for. */
	const run = async (
		options: { kind: 'full' | 'calibrate'; passes: number; retries: number },
		answer: (planned: PlannedProcess) => CellResult,
		run_cells = cells
	): Promise<{ results: Array<ProcessResult>; asked: Array<PlannedProcess> }> => {
		const asked: Array<PlannedProcess> = [];
		const results = await run_cells_in_turn(run_cells, options, {
			measure: (planned) => {
				asked.push(planned);
				return answer(planned);
			}
		});
		return { results, asked };
	};

	test('passes_are_disturbed compares the pooled spread to the threshold', () => {
		const result = (ns: Array<number>): CellResult => create_cell_result(PLANNED!, { ns });
		assert.ok(!passes_are_disturbed([result(steady), result(steady)], 1000));
		assert.ok(passes_are_disturbed([result(noisy)], 1000));
		// across passes too
		assert.ok(passes_are_disturbed([result([1000]), result([1300])], 1000));
		assert.ok(!passes_are_disturbed([result([1000, 1000 * DISTURBED_SPREAD])], 1000));
		// an excluded library has no rounds to disagree
		assert.ok(!passes_are_disturbed([create_cell_result(PLANNED!, { excluded: 'x' })], 1000));
		assert.ok(!passes_are_disturbed([], 1000));
	});

	test('with nothing disturbed it is the planned processes, in order', async () => {
		const { results, asked } = await run({ kind: 'full', passes: 2, retries: 2 }, (planned) =>
			create_cell_result(planned)
		);
		assert.deepStrictEqual(asked, plan_processes(cells, 2));
		assert.deepStrictEqual(
			results.map((r) => r.planned),
			asked
		);
	});

	test('a disturbed library is measured again on that cell, before the next cell', async () => {
		const { asked } = await run({ kind: 'full', passes: 2, retries: 2 }, (planned) =>
			create_cell_result(planned, {
				ns:
					planned.cell === cell && planned.library === 'prism' && planned.attempt === 0
						? noisy
						: steady
			})
		);
		const retries = asked.filter((p) => p.attempt > 0);
		// every pass of that library, once: the second attempt was steady
		assert.deepStrictEqual(
			retries.map((p) => [p.cell.id, p.library, p.pass, p.attempt]),
			[
				[cell!.id, 'prism', 0, 1],
				[cell!.id, 'prism', 1, 1]
			]
		);
		const first_of_next = asked.findIndex((p) => p.cell !== cell);
		assert.ok(asked.indexOf(retries[1]!) < first_of_next);
		assert.strictEqual(asked.length, plan_processes(cells, 2).length + 2);
	});

	test('retries are bounded, and 0 turns them off', async () => {
		const always_noisy = (planned: PlannedProcess): CellResult =>
			create_cell_result(planned, { ns: noisy });
		for (const retries of [0, 1, 2]) {
			const { asked } = await run({ kind: 'full', passes: 2, retries }, always_noisy, [cell!]);
			assert.strictEqual(asked.length, cell!.libraries.length * 2 * (1 + retries));
			assert.strictEqual(Math.max(...asked.map((p) => p.attempt)), retries);
		}
	});

	test('an excluded library is not measured again', async () => {
		const { asked } = await run({ kind: 'full', passes: 2, retries: 2 }, (planned) =>
			create_cell_result(planned, { excluded: 'produced no tokens' })
		);
		assert.ok(asked.every((p) => p.attempt === 0));
	});

	test('in a calibration only the disturbed arm of a library is measured again', async () => {
		const { asked } = await run(
			{ kind: 'calibrate', passes: 2, retries: 2 },
			(planned) =>
				create_cell_result(planned, {
					// the second arm of one library, in its first attempt
					ns:
						planned.library === 'prism' && planned.pass % 2 === 1 && planned.attempt === 0
							? noisy
							: steady
				}),
			[cell!]
		);
		assert.strictEqual(asked.filter((p) => p.attempt === 0).length, cell!.libraries.length * 4);
		assert.deepStrictEqual(
			asked.filter((p) => p.attempt > 0).map((p) => [p.library, p.pass, p.attempt]),
			[
				['prism', 1, 1],
				['prism', 3, 1]
			]
		);
	});

	test('a result that disagrees with an earlier one stops the run as it arrives', async () => {
		const asked: Array<PlannedProcess> = [];
		const kept: Array<PlannedProcess> = [];
		let error: unknown;
		try {
			await run_cells_in_turn(
				cells,
				{ kind: 'full', passes: 2, retries: 0 },
				{
					measure: (planned) => {
						asked.push(planned);
						return create_cell_result(planned, {
							tokens: planned.library === 'prism' && planned.pass === 1 ? 11 : 10
						});
					},
					on_result: (planned) => kept.push(planned)
				}
			);
		} catch (caught) {
			error = caught;
		}
		assert.ok(error instanceof RunError);
		assert.match(error.message, /prism\) came out differently/);
		// it stopped at that process, and the result was not handed on
		const last = asked.at(-1)!;
		assert.deepStrictEqual([last.library, last.pass], ['prism', 1]);
		assert.ok(asked.length < plan_processes(cells, 2).length);
		assert.deepStrictEqual(kept, asked.slice(0, -1));
	});
});

describe('to_noise_floor', () => {
	test('nothing measured twice is no noise floor', () => {
		assert.strictEqual(to_noise_floor([]), null);
	});

	test('the deviation is the same whichever measurement was slower', () => {
		assert.closeTo(to_deviation(1.25), 0.25, 1e-12);
		assert.closeTo(to_deviation(0.8), 0.25, 1e-12);
		assert.strictEqual(to_deviation(1), 0);
	});

	test('per cell is the 95th percentile of the deviation', () => {
		const pairs = Array.from({ length: 101 }, (_v, i) => ({
			cell: `c${i}`,
			library: 'a',
			// deviations of 0% to 10%, alternating which side is slower
			ratio: i % 2 === 0 ? 1 + i / 1000 : 1 / (1 + i / 1000)
		}));
		assert.closeTo(to_noise_floor(pairs)!.per_cell, 0.095, 1e-9);
	});

	test('the geomean is of each library across its cells, for the worst library', () => {
		const floor = to_noise_floor([
			// cancels out across its cells
			{ cell: 'c1', library: 'a', ratio: 1.25 },
			{ cell: 'c2', library: 'a', ratio: 0.8 },
			// consistently faster the second time, by 2%
			{ cell: 'c3', library: 'b', ratio: 1 / 1.02 },
			{ cell: 'c4', library: 'b', ratio: 1 / 1.02 }
		])!;
		assert.closeTo(floor.geomean, 0.02, 1e-9);
		assert.ok(floor.per_cell > 0.2);
	});

	test('to_geomean', () => {
		assert.closeTo(to_geomean([2, 8]), 4, 1e-12);
		assert.closeTo(to_geomean([1.25, 0.8]), 1, 1e-12);
	});
});

describe('assemble_results', () => {
	test('stub process results assemble into a valid results file', () => {
		const record = create_record();
		const { results, pairs } = assemble_results(record);
		// what comes back is the parsed value, and it parses again to itself
		assert.deepStrictEqual(BenchResults.parse(results), results);
		assert.deepStrictEqual(BenchResults.parse(JSON.parse(JSON.stringify(results))), results);
		assert.deepStrictEqual(pairs, []);

		const cells = plan_cells(manifest.inputs, SMALL_TS, ADAPTERS);
		assert.deepStrictEqual(
			results.cells.map((c) => c.id),
			cells.map((c) => c.id)
		);
		assert.deepStrictEqual(results.meta.run, {
			kind: 'full',
			...FULL_PARAMS,
			loaded_langs: 'cell',
			filters: SMALL_TS,
			segments: 1,
			duration_ms: 1234
		});
		assert.deepStrictEqual(results.meta.machine, MACHINE);
		assert.strictEqual(results.meta.corpus_hash, manifest.corpus_hash);
		assert.deepStrictEqual(results.meta.excluded, []);
		assert.strictEqual(results.meta.noise_floor, null);
		// the inputs roster is the inputs the cells measured, each once
		assert.deepStrictEqual(
			results.inputs.map((i) => i.file),
			[...new Set(cells.map((c) => c.input.file))]
		);
		// the rosters come from the harness, whatever the filters
		assert.ok(results.langs.some((l) => l.id === 'xml' && !l.timed));
		assert.ok(results.sets.some((s) => s.id === 'docs'));
		// cold start is not built, and this record carries no deterministic file
		assert.deepStrictEqual(results.startup, []);
		assert.deepStrictEqual(results.bundle, {});
		assert.strictEqual(results.meta.bundler, null);
		for (const cell of results.cells) {
			assert.strictEqual(cell.metric, 'throughput');
			// roster order, though each pass started with a different library
			for (const section of [cell.values, to_stated(cell)]) {
				assert.deepStrictEqual(
					Object.keys(section),
					ADAPTERS.map((a) => a.id)
				);
			}
			// each deterministic number is stated on the cell whose call returns it
			assert.deepStrictEqual(cell.mode === 'tokenize' ? cell.output : cell.tokens, {});
			assert.strictEqual(cell.values.fuz_code!.rss_peak_bytes, 50_000_000);
			assert.strictEqual(cell.values.fuz_code!.attempts, 1);
		}
	});

	test('a retried library carries the attempt whose rounds agreed best, and how many it took', () => {
		const options = create_options({ filters: SMALL_TS });
		const planned_processes = create_processes(options, (planned) =>
			create_cell_result(planned, { ns: planned.library === 'prism' ? [500, 900] : [1000] })
		);
		const processes = [
			...planned_processes,
			// measured again: slower, and steadier
			...planned_processes
				.filter(({ planned }) => planned.library === 'prism')
				.map(({ planned }) => ({ ...planned, attempt: 1 }))
				.map((planned) => ({ planned, result: create_cell_result(planned, { ns: [2000] }) }))
		];
		const { results } = assemble_results(create_record({ options, processes, segments: 2 }));
		for (const cell of results.cells) {
			assert.strictEqual(cell.values.prism!.attempts, 2);
			assert.strictEqual(cell.values.prism!.ns_per_op, 2000);
			assert.strictEqual(cell.values.fuz_code!.attempts, 1);
		}
		assert.strictEqual(results.meta.run!.retries, FULL_PARAMS.retries);
		assert.strictEqual(results.meta.run!.segments, 2);
		// a resumed run is a result like any other
		assert.match(format_run_summary(results), /resumed: measured in 2 segments/);
		assert.match(format_run_summary(results), /retried: \d+ library-cells were measured again/);
		// and each library's line says how many of its cells were
		assert.match(
			format_run_summary(results),
			new RegExp(`prism +\\d+ cells, .*, ${results.cells.length} retried`)
		);
		assert.match(format_run_summary(results), /fuz_code +\d+ cells, .*, 0 retried/);
	});

	test('a value pools every pass, in whatever order the processes ran', () => {
		const options = create_options({ filters: SMALL_TS });
		// each pass reports its own time, so the pooled value shows all of them were used
		const processes = create_processes(options, (planned) =>
			create_cell_result(planned, { ns: [1000 + planned.pass * 100] })
		);
		const { results } = assemble_results(
			create_record({ options, processes: processes.toReversed() })
		);
		for (const cell of results.cells) {
			for (const value of Object.values(cell.values)) {
				assert.strictEqual(value.ns_per_op, 1100);
				assert.closeTo(value.spread, 1200 / 1000, 1e-12);
			}
		}
	});

	test('excluded and unsupported stay distinct', () => {
		// prism failed the check in every ts cell: excluded
		const reason = 'failed the check on the ts snippet: produced no tokens (counted 0)';
		const options = create_options({ filters: SMALL_TS });
		// and shiki_wasm was never asked, as when it doesn't claim the language: unsupported
		const cells = plan_cells(manifest.inputs, SMALL_TS, ADAPTERS).map((cell) => ({
			...cell,
			libraries: cell.libraries.filter((id) => id !== 'shiki_wasm')
		}));
		const processes = plan_processes(cells, options.passes).map((planned) => ({
			planned,
			result: create_cell_result(
				planned,
				planned.library === 'prism' ? { excluded: reason } : undefined
			)
		}));
		const { results } = assemble_results(create_record({ options, processes }));
		// excluded: one entry for every cell of the language, with the reason, and no numbers
		assert.deepStrictEqual(
			results.meta.excluded,
			cells.map((cell) => ({ cell: cell.id, library: 'prism', reason }))
		);
		for (const cell of results.cells) {
			for (const section of [cell.values, to_stated(cell)]) {
				assert.ok(!Object.hasOwn(section, 'prism'));
				// unsupported: no numbers and no excluded entry either
				assert.ok(!Object.hasOwn(section, 'shiki_wasm'));
				assert.ok(Object.hasOwn(section, 'fuz_code'));
			}
		}
		assert.ok(results.meta.excluded.every((e) => e.library !== 'shiki_wasm'));
		// prism still claims the language: that is what makes it excluded
		assert.strictEqual(results.coverage.prism!.ts, true);
	});

	test('an excluded entry for a language the library does not claim fails the assembly', () => {
		// a library missing from coverage can't be excluded, only unsupported
		const adapters = ADAPTERS.map((a) => {
			if (a.id !== 'prism') return a;
			const { ts: _, ...langs } = a.langs;
			return { ...a, langs };
		});
		const options = create_options({ filters: SMALL_TS });
		const processes = create_processes(options, (planned) =>
			create_cell_result(planned, planned.library === 'prism' ? { excluded: 'x' } : undefined)
		);
		assert.throws(
			() => assemble_results(create_record({ options, processes, adapters })),
			/it is unsupported there, not excluded/
		);
	});

	test('a filtered run lists only the libraries it selected', () => {
		const filters: BenchRunFilters = { ...SMALL_TS, libraries: ['fuz_code', 'prism'] };
		const { results } = assemble_results(create_record({ options: create_options({ filters }) }));
		assert.deepStrictEqual(
			results.meta.libraries.map((l) => l.id),
			['fuz_code', 'prism']
		);
		assert.deepStrictEqual(Object.keys(results.coverage), ['fuz_code', 'prism']);
		assert.deepStrictEqual(results.meta.run!.filters, filters);
	});

	test('a smoke run is marked as one, and carries no noise floor', () => {
		const options = create_options({ kind: 'smoke', ...SMOKE_PARAMS, filters: SMALL_TS });
		const { results } = assemble_results(create_record({ options }));
		assert.strictEqual(results.meta.run!.kind, 'smoke');
		assert.strictEqual(results.meta.run!.passes, 1);
		assert.strictEqual(results.meta.noise_floor, null);
		assert.ok(!bench_results_is_publishable(results));
	});

	test('a full run carries the noise floor it is given', () => {
		const noise_floor = { per_cell: 0.03, geomean: 0.005 };
		const { results } = assemble_results(create_record({ noise_floor }));
		assert.deepStrictEqual(results.meta.noise_floor, noise_floor);
	});

	test('only a complete, steady, clean full run is publishable', () => {
		const options = create_options();
		const complete = create_record({ options });
		assert.ok(bench_results_is_publishable(assemble_results(complete).results));
		for (const overrides of [
			{ options: create_options({ filters: SMALL_TS }) },
			{ options: create_options({ kind: 'calibrate' }) },
			{ anchor: { drift: 0.2, stable: false } },
			{ commit: `${'0'.repeat(40)}-dirty` }
		] satisfies Array<Partial<RunRecord>>) {
			const { results } = assemble_results(create_record({ options, ...overrides }));
			assert.ok(!bench_results_is_publishable(results), JSON.stringify(Object.keys(overrides)));
		}
	});

	test('a calibration measures every library as two arms and derives its noise floor', () => {
		const options = create_options({ kind: 'calibrate', filters: SMALL_TS });
		// twice the passes of a full run, alternating between the arms
		const processes = create_processes(options, (planned) =>
			create_cell_result(planned, { ns: [planned.pass % 2 === 0 ? 1040 : 1000] })
		);
		assert.strictEqual(
			processes.length,
			create_processes(create_options({ filters: SMALL_TS })).length * 2
		);
		// a carried floor is ignored: the calibration measured its own
		const { results, pairs } = assemble_results(
			create_record({ options, processes, noise_floor: { per_cell: 0.5, geomean: 0.5 } })
		);
		assert.strictEqual(pairs.length, results.cells.length * ADAPTERS.length);
		for (const pair of pairs) assert.closeTo(pair.ratio, 1.04, 1e-12);
		assert.closeTo(results.meta.noise_floor!.per_cell, 0.04, 1e-9);
		assert.closeTo(results.meta.noise_floor!.geomean, 0.04, 1e-9);
		// the file records the passes of one arm, which is what a full run uses
		assert.strictEqual(results.meta.run!.passes, FULL_PARAMS.passes);
		for (const cell of results.cells) {
			for (const value of Object.values(cell.values)) assert.strictEqual(value.ns_per_op, 1040);
		}
	});

	test('fails rather than writing a file the schema rejects', () => {
		assert.throws(
			() => assemble_results(create_record({ commit: 'not a commit' })),
			/invalid bench results/
		);
	});
});

describe('assert_matches_deterministic', () => {
	const PROCESS = plan_processes(plan_cells(manifest.inputs, SMALL_TS, ADAPTERS), 1)[0]!;
	const measured = create_cell_result(PROCESS);
	const numbers = { tokens: 10, output: { html_bytes: 100, spans: 10 } };

	test('accepts a result that is what the file has', () => {
		assert_matches_deterministic('label', numbers, measured);
		const excluded = create_cell_result(PROCESS, { excluded: 'produced no HTML' });
		assert_matches_deterministic('label', { excluded: 'produced no HTML' }, excluded);
	});

	test('refuses any difference, with exit code 2 and how to regenerate the file', () => {
		const excluded = create_cell_result(PROCESS, { excluded: 'produced no HTML' });
		for (const [expected, result] of [
			[{ ...numbers, tokens: 11 }, measured],
			[{ ...numbers, output: { html_bytes: 101, spans: 10 } }, measured],
			[{ ...numbers, output: { html_bytes: 100, spans: 9 } }, measured],
			[{ excluded: 'produced no HTML' }, measured],
			[numbers, excluded],
			[{ excluded: 'another reason' }, excluded],
			// the file has nothing for the input and library
			[undefined, measured]
		] as const) {
			let error: unknown;
			try {
				assert_matches_deterministic('cell a (prism)', expected, result);
			} catch (caught) {
				error = caught;
			}
			assert.ok(error instanceof RunError);
			assert.strictEqual(error.exit_code, 2);
			assert.match(
				error.message,
				/^cell a \(prism\) disagrees with the deterministic results file/
			);
			assert.match(error.message, /npm run bench:deterministic/);
		}
	});
});

describe('carry_noise_floor', () => {
	const noise_floor = { per_cell: 0.03, geomean: 0.005 };
	const context = {
		machine: MACHINE,
		node: 'v24.14.1',
		corpus_hash: manifest.corpus_hash,
		params: FULL_PARAMS
	};
	const create_calibration = (overrides: Partial<RunRecord> = {}): BenchResults => {
		const options = overrides.options ?? create_options({ kind: 'calibrate' });
		const { results } = assemble_results(create_record({ options, ...overrides }));
		if (options.kind === 'calibrate') results.meta.noise_floor = noise_floor;
		return results;
	};

	const assert_not_carried = (calibration: BenchResults, expected: RegExp): void => {
		const carried = carry_noise_floor(calibration, context);
		assert.ok(!carried.ok);
		assert.match(carried.reason, expected);
	};

	test('carries the floor of a calibration that describes the run', () => {
		assert.deepStrictEqual(carry_noise_floor(create_calibration(), context), {
			ok: true,
			noise_floor
		});
	});

	test('not from a full run', () => {
		assert_not_carried(create_calibration({ options: create_options() }), /not a calibration/);
	});

	test('not from a filtered calibration, of cells or of libraries', () => {
		for (const filters of [SMALL_TS, { ...NO_FILTERS, libraries: ['fuz_code'] }]) {
			const options = create_options({ kind: 'calibrate', filters });
			assert_not_carried(create_calibration({ options }), /it was filtered/);
		}
	});

	test('not from a calibration the machine did not hold still for', () => {
		assert_not_carried(
			create_calibration({ anchor: { drift: 0.09, stable: false } }),
			/changed state/
		);
	});

	test('not from another machine, CPU, governor, Node version, or corpus', () => {
		assert_not_carried(
			create_calibration({ machine: { ...MACHINE, name: 'other' } }),
			/another machine/
		);
		assert_not_carried(
			create_calibration({ machine: { ...MACHINE, cpu: 'Other CPU' } }),
			/another machine/
		);
		assert_not_carried(
			create_calibration({ machine: { ...MACHINE, governor: 'powersave' } }),
			/governor powersave/
		);
		assert_not_carried(
			create_calibration({ machine: { ...MACHINE, governor: null } }),
			/governor null/
		);
		assert_not_carried(create_calibration({ node: 'v26.0.0' }), /Node v26\.0\.0/);
		assert_not_carried(create_calibration({ corpus_hash: 'f'.repeat(64) }), /another corpus/);
	});

	test('not measured with other parameters', () => {
		for (const key of [
			'passes',
			'rounds',
			'target_ms',
			'warmup_ms',
			'rewarm_ms',
			'retries'
		] as const) {
			const options = create_options({ kind: 'calibrate', [key]: FULL_PARAMS[key] + 1 });
			assert_not_carried(create_calibration({ options }), new RegExp(`measured with ${key}`));
		}
	});
});

describe('read_machine', () => {
	test('describes this machine in the shape a results file carries', () => {
		const machine = read_machine('box');
		BenchMachine.parse(machine);
		assert.strictEqual(machine.name, 'box');
	});

	test('reads the governor where the OS exposes one, and is null where it does not', () => {
		const dir = mkdtempSync(join(tmpdir(), 'bench_run_test_'));
		try {
			const path = join(dir, 'scaling_governor');
			writeFileSync(path, 'performance\n');
			assert.strictEqual(read_machine('box', path).governor, 'performance');
			assert.strictEqual(read_machine('box', join(dir, 'missing')).governor, null);
			writeFileSync(path, '\n');
			assert.strictEqual(read_machine('box', path).governor, null);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('read_commit', () => {
	test('is a full hash, marked when the tree is dirty', () => {
		assert.match(read_commit(), /^[0-9a-f]{40}(-dirty)?$/);
	});

	test('refuses to run outside a git checkout', () => {
		const dir = mkdtempSync(join(tmpdir(), 'bench_run_test_'));
		try {
			assert.throws(() => read_commit(dir), RunError);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('format_run_summary', () => {
	test('reports excluded entries verbatim, an unstable anchor, and a dirty tree', () => {
		const reason = 'the HTML has 1 kinds of span, under the 2 that highlighting produces';
		const options = create_options({ filters: SMALL_TS });
		const processes = create_processes(options, (planned) =>
			create_cell_result(planned, planned.library === 'prism' ? { excluded: reason } : undefined)
		);
		const { results } = assemble_results(
			create_record({
				options,
				processes,
				anchor: { drift: 0.08, stable: false },
				commit: `${'0'.repeat(40)}-dirty`
			})
		);
		const summary = format_run_summary(results);
		assert.ok(summary.includes(`prism in ${results.cells[0]!.id}: ${reason}`));
		assert.match(summary, /excluded: \d+ library-cells/);
		assert.match(summary, /anchor drift 8\.0%: UNSTABLE/);
		assert.match(summary, /prism +not measured in any cell/);
		assert.match(summary, /fuz_code +\d+ cells, spread median 1\.000/);
		assert.match(summary, /uncommitted changes/);
		assert.match(summary, /noise floor: none/);
		assert.match(summary, /disturbed: none/);
		assert.match(summary, /retried: none/);
		assert.ok(!summary.includes('resumed'));
	});

	test('lists the cells whose rounds disagreed, so a loaded machine shows', () => {
		const options = create_options({ filters: SMALL_TS });
		const noisy = DISTURBED_SPREAD + 0.25;
		const processes = create_processes(options, (planned) =>
			create_cell_result(
				planned,
				planned.library === 'shiki_js' && planned.cell.mode === 'html'
					? { ns: [1000, 1000 * noisy] }
					: undefined
			)
		);
		const summary = format_run_summary(
			assemble_results(create_record({ options, processes })).results
		);
		const html_cells = processes.filter(
			(p) =>
				p.planned.library === 'shiki_js' && p.planned.cell.mode === 'html' && p.planned.pass === 0
		);
		assert.ok(
			summary.includes(
				`disturbed: ${html_cells.length} library-cells still have a spread over ${DISTURBED_SPREAD} after ${FULL_PARAMS.retries} more attempt(s)`
			)
		);
		for (const { planned } of html_cells) {
			assert.ok(summary.includes(`shiki_js in ${planned.cell.id}: ${noisy.toFixed(3)}`));
		}
		assert.ok(!summary.includes('fuz_code in '));
	});

	test('reports a calibration library by library', () => {
		const options = create_options({ kind: 'calibrate', filters: SMALL_TS });
		const processes = create_processes(options, (planned) =>
			create_cell_result(planned, { ns: [planned.pass % 2 === 0 ? 970 : 1000] })
		);
		const { results, pairs } = assemble_results(create_record({ options, processes }));
		const summary = format_run_summary(results, pairs);
		assert.match(summary, /^calibrate run/);
		assert.match(summary, /noise floor: 3\.1% per cell, 3\.1% for a geomean/);
		assert.match(summary, /prism +geomean deviation 3\.1%, worst 3\.1%/);
		assert.match(summary, /excluded: none/);
	});
});
