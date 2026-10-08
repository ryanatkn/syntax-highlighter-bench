import { afterEach, assert, beforeEach, describe, test } from 'vitest';
import {
	appendFileSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parse_bench_results, type BenchResults } from '$lib/results_schema.ts';
import type { CellResult, CellSpec } from '../../../bench/cell.ts';
import { MIN_SNIPPET_SPAN_KINDS } from '../../../bench/check_output.ts';
import {
	STARTUP_TIMEOUT_MS,
	plan_startup_round,
	plan_startup_scenarios,
	type PlannedStartup,
	type StartupScenario
} from '../../../bench/coldstart.ts';
import { load_corpus_manifest } from '../../../bench/corpus.ts';
import {
	to_expected_key,
	type CarriedDeterministic,
	type ExpectedNumbers
} from '../../../bench/deterministic.ts';
import { read_journal } from '../../../bench/journal.ts';
import { ADAPTERS } from '../../../bench/libraries.ts';
import { to_bench_libraries } from '../../../bench/library_info.ts';
import {
	RunError,
	assemble_results,
	format_run_plan,
	format_run_summary,
	plan_run,
	read_startup_result,
	run_bench,
	run_startup_in_turn,
	to_planned_versions,
	to_startup_entries,
	type ChildOutcome,
	type RunBenchOptions,
	type StartupProcessResult
} from '../../../bench/run.ts';
import {
	FULL_PARAMS,
	SMOKE_PARAMS,
	STARTUP_PROCESS_MS,
	estimate_startup_ms,
	parse_run_args,
	type RunOptions
} from '../../../bench/run_options.ts';

// Cold start as part of a run, with invented process results in place of real
// processes: reading a process, the rounds, the journal, resuming, and the plan.

const manifest = load_corpus_manifest();

/** The versions installed, which a cell process reports. */
const VERSIONS = to_planned_versions(to_bench_libraries(ADAPTERS));

let dir: string;
let out: string;
let journal_path: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'bench_run_startup_test_'));
	out = join(dir, 'run.json');
	journal_path = `${out}.journal.jsonl`;
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

/** A narrow cold start: two libraries, one language, two samples after the discarded rounds. */
const FILTERS = ['--libraries', 'fuz_code,prism', '--langs', 'json', '--startup-samples', '2'];
const SCENARIOS = plan_startup_scenarios(
	ADAPTERS,
	{ libraries: ['fuz_code', 'prism'], langs: ['json'] },
	manifest.inputs
).scenarios;
const ROUNDS = FULL_PARAMS.startup_discard + 2;
const PLANNED = SCENARIOS.length * ROUNDS;

const parse = (...args: Array<string>): RunOptions => {
	const parsed = parse_run_args(
		[...FILTERS, '--metrics', 'startup', '--out', out, ...args],
		ADAPTERS
	);
	assert.ok(parsed.ok && !parsed.help, parsed.ok ? '' : parsed.message);
	return parsed.options;
};

const HIGHLIGHTED = Array.from(
	{ length: MIN_SNIPPET_SPAN_KINDS },
	(_v, i) => `<span class="k${i}">x</span>`
).join('');

/** An invented time for a process, different for every scenario and round. */
const to_ms = (planned: PlannedStartup): number =>
	20 + SCENARIOS.findIndex((s) => s.key === planned.scenario.key) + planned.round / 10;

/** What a cold-start process would print. */
const to_outcome = (planned: PlannedStartup, overrides: object = {}): ChildOutcome => ({
	error: null,
	status: 0,
	signal: null,
	stdout:
		JSON.stringify({
			ms: to_ms(planned),
			max_rss_kb: 50_000,
			exports: planned.scenario.library === null ? 0 : 1,
			html: planned.scenario.scenario === 'first_highlight' ? HIGHLIGHTED : null,
			compile_cache_dir: null,
			...overrides
		}) + '\n',
	stderr: ''
});

const FAILED: ChildOutcome = {
	error: null,
	status: 1,
	signal: null,
	stdout: '',
	stderr: [
		`file://${process.cwd()}/node_modules/.cache/x/entry.mjs:1`,
		`import 'some-style.css';`,
		'',
		`TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".css" for ${process.cwd()}/node_modules/x/some-style.css`,
		'    at Object.getFileProtocolModuleFormat (node:internal/modules/esm/get_format:219:9)',
		''
	].join('\n')
};

const INTERRUPTED: ChildOutcome = {
	error: null,
	status: null,
	signal: 'SIGINT',
	stdout: '',
	stderr: ''
};

const find_planned = (key: string, round: number = 0): PlannedStartup => {
	const scenario = SCENARIOS.find((s) => s.key === key);
	assert.ok(scenario, key);
	return { scenario, round };
};

const catch_run_error = async (fn: () => unknown): Promise<RunError> => {
	let error: unknown;
	try {
		await fn();
	} catch (caught) {
		error = caught;
	}
	assert.ok(error instanceof RunError, `expected a RunError, got ${String(error)}`);
	return error;
};

describe('read_startup_result', () => {
	test('a process that reported is a sample of its scenario', () => {
		const planned = find_planned('prism:core:bundled', 3);
		assert.deepStrictEqual(read_startup_result(planned, to_outcome(planned)), {
			key: 'prism:core:bundled',
			sample: { ms: to_ms(planned), rss_peak_bytes: 50_000 * 1024, output: null },
			excluded: null
		});
		const highlight = find_planned('prism:first_highlight:json:unbundled');
		assert.deepStrictEqual(read_startup_result(highlight, to_outcome(highlight)).sample!.output, {
			html_bytes: Buffer.byteLength(HIGHLIGHTED),
			spans: MIN_SNIPPET_SPAN_KINDS
		});
	});

	test('a process that failed on its own excludes the library, with the error and no local path', () => {
		const result = read_startup_result(find_planned('prism:set:docs:unbundled'), FAILED);
		assert.deepStrictEqual(result, {
			key: 'prism:set:docs:unbundled',
			sample: null,
			excluded:
				'the process failed: TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".css" for node_modules/x/some-style.css'
		});
		// with nothing on stderr, how it ended is the reason
		const silent = read_startup_result(find_planned('prism:core:bundled'), {
			...FAILED,
			status: 7,
			stderr: ''
		});
		assert.strictEqual(silent.excluded, 'the process failed: exit 7');
	});

	test('a first highlight that fails the snippet gate is excluded, not timed', () => {
		const planned = find_planned('prism:first_highlight:json:bundled');
		const result = read_startup_result(planned, to_outcome(planned, { html: 'plain text' }));
		assert.strictEqual(result.sample, null);
		assert.match(result.excluded!, /failed the check on the json snippet/);
	});

	test('the bare baseline loads no library, so its failure is the run’s', async () => {
		const error = await catch_run_error(() => read_startup_result(find_planned('bare'), FAILED));
		assert.strictEqual(error.exit_code, 1);
		assert.match(error.message, /^cold start bare \(round 1\) failed \(exit 1\):/);
	});

	test('a process that did not end on its own fails the run, naming the scenario', async () => {
		const planned = find_planned('prism:core:bundled', 1);
		const cases: Array<[ChildOutcome, RegExp, number]> = [
			[INTERRUPTED, /^interrupted during cold start prism:core:bundled \(round 2\)$/, 130],
			[
				{ ...FAILED, error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }) },
				new RegExp(`timed out after ${STARTUP_TIMEOUT_MS / 1000}s`),
				1
			],
			[{ ...FAILED, error: new Error('spawn ENOENT') }, /could not be run: spawn ENOENT/, 1],
			// ended by the machine, not failed on its own: never an exclusion
			[
				{ ...FAILED, status: null, signal: 'SIGKILL', stderr: '' },
				/^cold start prism:core:bundled \(round 2\) failed \(signal SIGKILL\)/,
				1
			],
			[{ ...FAILED, status: null, signal: 'SIGSEGV' }, /failed \(signal SIGSEGV\)/, 1],
			[
				{ ...FAILED, status: 134, stderr: 'FATAL ERROR: Reached heap limit' },
				/failed \(exit 134\):\nFATAL ERROR: Reached heap limit/,
				1
			],
			[{ ...FAILED, status: 137, stderr: '' }, /failed \(exit 137\)/, 1],
			[{ ...to_outcome(planned), stdout: 'hello' }, /printed something other than one JSON/, 1],
			[to_outcome(planned, { ms: 'soon' }), /reported a malformed result/, 1],
			[to_outcome(planned, { extra: 1 }), /reported a malformed result/, 1]
		];
		for (const [outcome, expected, exit_code] of cases) {
			const error = await catch_run_error(() => read_startup_result(planned, outcome));
			assert.match(error.message, expected);
			assert.strictEqual(error.exit_code, exit_code);
		}
	});

	test('a process with a compile cache in use was not a cold start', async () => {
		const planned = find_planned('prism:core:bundled');
		const error = await catch_run_error(() =>
			read_startup_result(planned, to_outcome(planned, { compile_cache_dir: '/cache/v24' }))
		);
		assert.match(error.message, /ran with V8's compile cache in \/cache\/v24/);
	});
});

const PARAMS = { startup_samples: 2, startup_discard: 1 };

/** Samples the scenarios through `run_startup_in_turn`, each process answered by `answer`. */
const run_in_turn = async (
	answer: (planned: PlannedStartup) => ChildOutcome = to_outcome,
	expected?: CarriedDeterministic['expected']
): Promise<Array<StartupProcessResult>> =>
	run_startup_in_turn(SCENARIOS, PARAMS, {
		measure: (planned) => read_startup_result(planned, answer(planned)),
		...(expected && { expected })
	});

describe('run_startup_in_turn', () => {
	test('runs every scenario once a round, the discarded rounds and then the kept ones', async () => {
		const journaled: Array<string> = [];
		const results = await run_startup_in_turn(SCENARIOS, PARAMS, {
			measure: (planned) => read_startup_result(planned, to_outcome(planned)),
			on_result: (planned, result) => journaled.push(`${result.key}@${planned.round}`)
		});
		const planned = [0, 1, 2].flatMap((round) => plan_startup_round(SCENARIOS, round));
		assert.deepStrictEqual(
			results.map((r) => r.planned),
			planned
		);
		assert.deepStrictEqual(
			journaled,
			planned.map((p) => `${p.scenario.key}@${p.round}`)
		);
		assert.ok(results.every((r) => r.result.key === r.planned.scenario.key));
	});

	test('a scenario excluded by its first process is not run again', async () => {
		const key = 'prism:set:docs:unbundled';
		let asked = 0;
		const results = await run_in_turn((planned) => {
			if (planned.scenario.key !== key) return to_outcome(planned);
			asked++;
			return FAILED;
		});
		assert.strictEqual(asked, 1);
		assert.strictEqual(results.length, SCENARIOS.length * 3 - 2);
		const own = results.filter((r) => r.planned.scenario.key === key);
		assert.deepStrictEqual(
			own.map((r) => [r.planned.round, r.result.sample]),
			[[0, null]]
		);
	});

	test('a scenario that fails after it was sampled stops the run', async () => {
		const key = 'prism:set:docs:unbundled';
		const error = await catch_run_error(() =>
			run_in_turn((planned) =>
				planned.scenario.key === key && planned.round === 1 ? FAILED : to_outcome(planned)
			)
		);
		assert.match(
			error.message,
			/^cold start prism:set:docs:unbundled \(round 2\) came out differently from an earlier sample/
		);
	});

	test('a first highlight returns the same HTML in every sample', async () => {
		const key = 'fuz_code:first_highlight:json:bundled';
		const error = await catch_run_error(() =>
			run_in_turn((planned) =>
				planned.scenario.key === key && planned.round === 2
					? to_outcome(planned, { html: HIGHLIGHTED + '<span class="more">y</span>' })
					: to_outcome(planned)
			)
		);
		assert.match(
			error.message,
			/fuz_code:first_highlight:json:bundled \(round 3\) came out differently/
		);
	});

	test('a first highlight’s HTML is the size the deterministic file has for the snippet', async () => {
		const snippet = SCENARIOS.find((s) => s.snippet !== null)!.snippet!;
		const output = { html_bytes: Buffer.byteLength(HIGHLIGHTED), spans: MIN_SNIPPET_SPAN_KINDS };
		const compressed = { gzip: 50, brotli: 40 };
		const to_expected = (prism: object): CarriedDeterministic['expected'] =>
			new Map([
				[to_expected_key(snippet.file, 'fuz_code'), { tokens: 9, output, compressed }],
				[to_expected_key(snippet.file, 'prism'), { compressed, ...prism } as ExpectedNumbers]
			]);
		// equal: the run goes through
		await run_in_turn(to_outcome, to_expected({ tokens: 9, output }));
		// another size: the file is stale, or the output is not deterministic
		const error = await catch_run_error(() =>
			run_in_turn(to_outcome, to_expected({ tokens: 9, output: { ...output, spans: 99 } }))
		);
		assert.strictEqual(error.exit_code, 2);
		assert.match(
			error.message,
			/^cold start prism:first_highlight:json:unbundled \(round 1\) disagrees with the deterministic results file, which has \{"html_bytes":\d+,"spans":99\}/
		);
		assert.match(error.message, /npm run bench:deterministic/);
		// excluded there, the process has to fail its check too
		const excluded = await catch_run_error(() =>
			run_in_turn(to_outcome, to_expected({ excluded: 'produced no tokens' }))
		);
		assert.strictEqual(excluded.exit_code, 2);
		await run_in_turn(
			(planned) =>
				planned.scenario.library === 'prism' && planned.scenario.snippet
					? to_outcome(planned, { html: 'plain' })
					: to_outcome(planned),
			to_expected({ excluded: 'produced no tokens' })
		);
		// a file that lacks the library on the snippet doesn't describe the run
		const lacking = to_expected({ tokens: 9, output });
		lacking.delete(to_expected_key(snippet.file, 'prism'));
		assert.strictEqual(
			(await catch_run_error(() => run_in_turn(to_outcome, lacking))).exit_code,
			2
		);
	});
});

describe('to_startup_entries', () => {
	test('summarizes the kept rounds of each scenario, in the order planned', async () => {
		const processes = await run_in_turn();
		const { startup, excluded } = to_startup_entries(SCENARIOS, processes, PARAMS);
		assert.deepStrictEqual(excluded, []);
		assert.deepStrictEqual(
			startup.map(({ scenario, library, lang, set, bundled }) => ({
				scenario,
				library,
				lang,
				set,
				bundled
			})),
			SCENARIOS.map(({ scenario, library, lang, set, bundled }) => ({
				scenario,
				library,
				lang,
				set,
				bundled
			}))
		);
		for (const [i, entry] of startup.entries()) {
			// rounds 1 and 2 are kept, and round 0 is thrown away
			assert.strictEqual(entry.samples, 2);
			assert.closeTo(entry.median_ms, 20 + i + 0.15, 1e-9);
			assert.closeTo(entry.spread, (20 + i + 0.2) / (20 + i + 0.1), 1e-9);
			assert.strictEqual(entry.rss_peak_bytes, 50_000 * 1024);
		}
	});

	test('a discarded round’s time never reaches a number', async () => {
		const processes = await run_in_turn((planned) =>
			planned.round === 0 ? to_outcome(planned, { ms: 99_999 }) : to_outcome(planned)
		);
		const calm = to_startup_entries(SCENARIOS, await run_in_turn(), PARAMS);
		assert.deepStrictEqual(to_startup_entries(SCENARIOS, processes, PARAMS), calm);
	});

	test('an excluded scenario has its reason and no number', async () => {
		const key = 'prism:first_highlight:json:bundled';
		const processes = await run_in_turn((planned) =>
			planned.scenario.key === key ? to_outcome(planned, { html: 'plain' }) : to_outcome(planned)
		);
		const { startup, excluded } = to_startup_entries(SCENARIOS, processes, PARAMS);
		assert.strictEqual(startup.length, SCENARIOS.length - 1);
		assert.strictEqual(excluded.length, 1);
		const { reason, ...scenario } = excluded[0]!;
		assert.deepStrictEqual(scenario, {
			scenario: 'first_highlight',
			library: 'prism',
			lang: 'json',
			set: null,
			bundled: true
		});
		assert.match(reason, /failed the check on the json snippet/);
		assert.ok(
			!startup.some(
				(entry) =>
					entry.library === 'prism' &&
					entry.lang === 'json' &&
					entry.bundled &&
					entry.scenario === 'first_highlight'
			)
		);
	});

	test('fails for a scenario that lacks a sample', async () => {
		const processes = await run_in_turn();
		assert.throws(
			() => to_startup_entries(SCENARIOS, processes.slice(0, -1), PARAMS),
			/has 1 of 2 samples/
		);
		assert.throws(
			() =>
				to_startup_entries(
					SCENARIOS,
					processes.filter((p) => p.planned.scenario.key !== 'bare'),
					PARAMS
				),
			/cold start bare was not sampled/
		);
	});
});

/**
 * Stands in for the machine: answers each cold-start process, counts them, and
 * stops the run like a signal when asked.
 */
const create_machine = (answer: (planned: PlannedStartup) => ChildOutcome = to_outcome) => {
	const machine = {
		spawned: 0,
		cells_spawned: 0,
		prepared: [] as Array<{ scenarios: ReadonlyArray<StartupScenario>; expected: unknown }>,
		/** Stops the run, as a signal would, when this many processes have run. */
		interrupt_after: Infinity,
		log: [] as Array<string>,
		options: {
			lock_path: join(dir, 'bench.lock'),
			// holds no deterministic file
			results_dir: dir,
			read_load: () => 0,
			log: (line: string) => machine.log.push(line),
			spawn_startup: (planned: PlannedStartup): ChildOutcome => {
				if (machine.spawned + machine.cells_spawned >= machine.interrupt_after) return INTERRUPTED;
				machine.spawned++;
				return answer(planned);
			},
			spawn_cell: (spec: CellSpec): ChildOutcome => {
				if (machine.spawned + machine.cells_spawned >= machine.interrupt_after) return INTERRUPTED;
				machine.cells_spawned++;
				const result: CellResult = {
					cell: `${spec.file}:${spec.mode}`,
					library: spec.library,
					loaded_langs: ['json'],
					versions: VERSIONS.get(spec.library)!,
					measurement: {
						tokens: 10,
						output: { html_bytes: 100, spans: 10 },
						iterations: 10,
						ns_per_op: [1000, 1010],
						rss_peak_bytes: 50_000_000
					},
					excluded: null
				};
				return { error: null, status: 0, signal: null, stdout: JSON.stringify(result), stderr: '' };
			},
			prepare_startup: (scenarios, _adapters, options) => {
				machine.prepared.push({ scenarios, expected: options.expected_bundle });
				return Promise.resolve({ built: [], mismatched: [] });
			},
			measure_anchor: () => 1000
		} satisfies RunBenchOptions
	};
	return machine;
};

/** A results file without what a resumed run records differently. */
const to_comparable = (results: BenchResults): unknown => ({
	...results,
	meta: {
		...results.meta,
		generated_at: null,
		run: { ...results.meta.run!, segments: null, duration_ms: null }
	}
});

describe('cold start in a timed run', () => {
	test('a run of cold start alone samples every scenario and writes one valid file', async () => {
		const machine = create_machine();
		const { results, path } = await run_bench(parse(), machine.options);
		assert.strictEqual(path, out);
		assert.strictEqual(machine.spawned, PLANNED);
		assert.strictEqual(machine.cells_spawned, 0);
		// the modules were written once, before anything ran, for exactly these scenarios
		assert.strictEqual(machine.prepared.length, 1);
		assert.deepStrictEqual(machine.prepared[0]!.scenarios, SCENARIOS);
		assert.strictEqual(machine.prepared[0]!.expected, null);
		assert.deepStrictEqual(parse_bench_results(JSON.parse(readFileSync(out, 'utf8'))), results);
		assert.deepStrictEqual(results.cells, []);
		assert.deepStrictEqual(results.inputs, []);
		assert.strictEqual(results.startup.length, SCENARIOS.length);
		assert.deepStrictEqual(results.meta.startup_excluded, []);
		for (const entry of results.startup) assert.strictEqual(entry.samples, 2);
		const { run, anchor } = results.meta;
		assert.strictEqual(run!.startup_samples, 2);
		assert.strictEqual(run!.startup_discard, FULL_PARAMS.startup_discard);
		assert.strictEqual(run!.startup_compile_cache, 'disabled');
		assert.deepStrictEqual(run!.filters.metrics, ['startup']);
		assert.deepStrictEqual(anchor, { drift: 0, stable: true });
		// nothing but the results is left
		assert.deepStrictEqual(readdirSync(dir), ['run.json']);
		const summary = format_run_summary(results);
		// with no cells, nothing is said of passes and rounds
		assert.match(summary, /^full run: 0 cells, in /);
		assert.ok(
			summary.includes(
				`cold start: ${SCENARIOS.length} scenarios, 2 sample(s) each after ${FULL_PARAMS.startup_discard} discarded round(s), compile cache disabled`
			)
		);
		assert.ok(summary.includes('cold start excluded: none'));
		assert.match(summary, / {2}bare +1 scenarios, spread median /);
		assert.match(summary, / {2}prism +8 scenarios, spread median /);
	});

	test('a run stopped at any point resumes to the results of an uninterrupted one', async () => {
		const whole = await run_bench(parse(), create_machine().options);
		for (const cut of [1, SCENARIOS.length, SCENARIOS.length * 2 + 3, PLANNED - 1]) {
			rmSync(out);
			const machine = create_machine();
			machine.interrupt_after = cut;
			const error = await catch_run_error(() => run_bench(parse(), machine.options));
			assert.strictEqual(error.exit_code, 130);
			assert.match(error.message, /^interrupted during cold start /);
			assert.match(error.message, /run the same command with --resume to continue/);
			assert.ok(!existsSync(out));
			const journal = read_journal(journal_path);
			assert.ok(journal.ok);
			assert.strictEqual(journal.startup.size, cut);
			assert.strictEqual(journal.results.size, 0);

			machine.interrupt_after = Infinity;
			const resumed = await run_bench(parse('--resume'), machine.options);
			// only what the journal lacked was run
			assert.strictEqual(machine.spawned, PLANNED);
			assert.strictEqual(resumed.results.meta.run!.segments, 2);
			assert.deepStrictEqual(to_comparable(resumed.results), to_comparable(whole.results));
			assert.ok(!existsSync(journal_path));
			assert.ok(
				machine.log.some((line) => line.includes(`${cut} results from 1 segment(s) are kept`))
			);
		}
	});

	test('the cells and the cold start are one run, with one journal and one file', async () => {
		const args = ['--langs', 'json', '--sizes', 'micro', '--libraries', 'fuz_code,prism'];
		const to_options = (...more: Array<string>): RunOptions => {
			const parsed = parse_run_args(
				[...args, '--passes', '1', '--startup-samples', '2', '--out', out, ...more],
				ADAPTERS
			);
			assert.ok(parsed.ok && !parsed.help);
			return parsed.options;
		};
		const whole_machine = create_machine();
		const whole = await run_bench(to_options(), whole_machine.options);
		const cell_processes = whole_machine.cells_spawned;
		assert.ok(cell_processes > 0);
		assert.strictEqual(whole_machine.spawned, PLANNED);
		assert.strictEqual(whole.results.startup.length, SCENARIOS.length);
		assert.ok(whole.results.cells.length > 0);
		assert.strictEqual(whole.results.meta.run!.filters.metrics, null);

		// stopped in the cold start: the cells are in the journal, and are not measured again
		rmSync(out);
		const machine = create_machine();
		machine.interrupt_after = cell_processes + 5;
		await catch_run_error(() => run_bench(to_options(), machine.options));
		const journal = read_journal(journal_path);
		assert.ok(journal.ok);
		assert.strictEqual(journal.results.size, cell_processes);
		assert.strictEqual(journal.startup.size, 5);
		// the plan says what the journal holds
		const plan = format_run_plan(plan_run(to_options('--resume'), machine.options));
		assert.ok(plan.includes(`which holds ${cell_processes + 5} results from 1 segment(s)`));
		machine.interrupt_after = Infinity;
		const resumed = await run_bench(to_options('--resume'), machine.options);
		assert.strictEqual(machine.cells_spawned, cell_processes);
		assert.strictEqual(machine.spawned, PLANNED);
		assert.deepStrictEqual(to_comparable(resumed.results), to_comparable(whole.results));
	});

	test('an excluded scenario is recorded with its reason, sampled once, and survives a resume', async () => {
		const key = 'prism:set:docs:unbundled';
		const answer = (planned: PlannedStartup): ChildOutcome =>
			planned.scenario.key === key ? FAILED : to_outcome(planned);
		const machine = create_machine(answer);
		const { results } = await run_bench(parse(), machine.options);
		assert.strictEqual(machine.spawned, PLANNED - (ROUNDS - 1));
		assert.deepStrictEqual(results.meta.startup_excluded, [
			{
				scenario: 'set',
				library: 'prism',
				lang: null,
				set: 'docs',
				bundled: false,
				reason:
					'the process failed: TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".css" for node_modules/x/some-style.css'
			}
		]);
		assert.strictEqual(results.startup.length, SCENARIOS.length - 1);
		const summary = format_run_summary(results);
		assert.ok(summary.includes('cold start excluded: 1 scenarios'));
		assert.ok(summary.includes(`  ${key}: the process failed: TypeError`));

		rmSync(out);
		const stopped = create_machine(answer);
		stopped.interrupt_after = SCENARIOS.length + 2;
		await catch_run_error(() => run_bench(parse(), stopped.options));
		stopped.interrupt_after = Infinity;
		const resumed = await run_bench(parse('--resume'), stopped.options);
		assert.strictEqual(stopped.spawned, PLANNED - (ROUNDS - 1));
		assert.deepStrictEqual(to_comparable(resumed.results), to_comparable(results));
	});

	test('a process killed in a discarded round fails the run, which resumes to every scenario', async () => {
		const key = 'prism:set:docs:unbundled';
		const whole = await run_bench(parse(), create_machine().options);
		rmSync(out);
		let killed = false;
		const machine = create_machine((planned) => {
			if (planned.scenario.key !== key || killed) return to_outcome(planned);
			killed = true;
			return { ...FAILED, status: null, signal: 'SIGKILL', stderr: '' };
		});
		const error = await catch_run_error(() => run_bench(parse(), machine.options));
		assert.strictEqual(error.exit_code, 1);
		assert.match(
			error.message,
			/^cold start prism:set:docs:unbundled \(round 1\) failed \(signal SIGKILL\)/
		);
		assert.match(error.message, /run the same command with --resume to continue/);
		assert.ok(!existsSync(out));
		// the killed process is not in the journal, so the scenario is sampled when the run resumes
		const { results } = await run_bench(parse('--resume'), machine.options);
		assert.deepStrictEqual(results.meta.startup_excluded, []);
		assert.deepStrictEqual(to_comparable(results), to_comparable(whole.results));
	});

	test('a journal holding a cold-start result the run never asks for is refused', async () => {
		const machine = create_machine();
		machine.interrupt_after = 3;
		await catch_run_error(() => run_bench(parse(), machine.options));
		const stray = (key: string, round: number): string =>
			JSON.stringify({
				type: 'startup',
				at_ms: 5,
				round,
				result: { key, sample: { ms: 1, rss_peak_bytes: 1, output: null }, excluded: null }
			}) + '\n';
		const journal = readFileSync(journal_path, 'utf8');
		for (const [line, expected] of [
			[
				stray('shiki_js:core:bundled', 0),
				/never asks for \(cold start shiki_js:core:bundled, round 1\)/
			],
			[
				stray('bare', ROUNDS),
				new RegExp(`never asks for \\(cold start bare, round ${ROUNDS + 1}\\)`)
			]
		] as const) {
			appendFileSync(journal_path, line);
			const error = await catch_run_error(() => run_bench(parse('--resume'), machine.options));
			assert.strictEqual(error.exit_code, 2);
			assert.match(error.message, expected);
			rmSync(journal_path);
			appendFileSync(journal_path, journal);
		}
		// and a different sample count is another run
		const other = parse_run_args(
			[...FILTERS.slice(0, -1), '3', '--metrics', 'startup', '--out', out, '--resume'],
			ADAPTERS
		);
		assert.ok(other.ok && !other.help);
		const error = await catch_run_error(() => run_bench(other.options, machine.options));
		assert.strictEqual(error.exit_code, 2);
		assert.match(error.message, /startup_samples: the journal has 2, this run 3/);
	});

	test('a bundle that is not the one whose size is reported stops the run before it measures', async () => {
		const machine = create_machine();
		const error = await catch_run_error(() =>
			run_bench(parse(), {
				...machine.options,
				prepare_startup: () =>
					Promise.resolve({
						built: ['prism core'],
						mismatched: ['prism core: built 10 bytes (9 gzipped), and the file has 8 (7)']
					})
			})
		);
		assert.strictEqual(error.exit_code, 2);
		assert.match(error.message, /is not the one the deterministic results file measured/);
		assert.match(error.message, /prism core: built 10 bytes/);
		assert.strictEqual(machine.spawned, 0);
		assert.deepStrictEqual(readdirSync(dir), []);
		// and a build that fails is the run's failure, with the lock released
		const failed = await catch_run_error(() =>
			run_bench(parse(), {
				...machine.options,
				prepare_startup: () => Promise.reject(new Error('the build failed'))
			})
		);
		assert.match(failed.message, /the cold-start modules could not be written: the build failed/);
		assert.ok(!existsSync(machine.options.lock_path));
	});
});

describe('the plan of a run with cold start', () => {
	const plan_of = (...args: Array<string>) => {
		const parsed = parse_run_args(args, ADAPTERS);
		assert.ok(parsed.ok && !parsed.help, parsed.ok ? '' : parsed.message);
		return plan_run(parsed.options, { results_dir: dir });
	};
	const ALL = plan_startup_scenarios(ADAPTERS, { libraries: null, langs: null }, manifest.inputs);

	test('a filtered run plans its scenarios in every round, and says how long they add', () => {
		const plan = plan_of(...FILTERS, '--metrics', 'startup', '--out', out);
		assert.deepStrictEqual(plan.cells, []);
		assert.deepStrictEqual(plan.processes, []);
		assert.deepStrictEqual(plan.startup_scenarios, SCENARIOS);
		assert.strictEqual(plan.startup_processes, PLANNED);
		assert.strictEqual(plan.header!.startup_samples, 2);
		assert.strictEqual(plan.header!.startup_discard, FULL_PARAMS.startup_discard);
		const text = format_run_plan(plan);
		assert.ok(
			text.includes(
				`cold start   ${SCENARIOS.length} scenarios, each sampled by 2 fresh process(es) after ${FULL_PARAMS.startup_discard} discarded round(s): ${PLANNED} more processes, one at a time, after the cells`
			),
			text
		);
		assert.strictEqual(estimate_startup_ms(PLANNED), PLANNED * STARTUP_PROCESS_MS);
		assert.strictEqual(estimate_startup_ms(PLANNED, 4), (PLANNED * STARTUP_PROCESS_MS) / 4);
		assert.match(text, /estimate +about /);
	});

	test('a run with no filter on it plans every scenario of the roster', () => {
		const plan = plan_of('--langs', 'json', '--sizes', 'micro', '--out', out);
		assert.ok(plan.cells.length > 0);
		// --sizes selects inputs, and cold start has none: only --langs narrows it
		assert.deepStrictEqual(
			plan.startup_scenarios,
			plan_startup_scenarios(ADAPTERS, { libraries: null, langs: ['json'] }, manifest.inputs)
				.scenarios
		);
		assert.strictEqual(
			plan.startup_processes,
			plan.startup_scenarios.length * (FULL_PARAMS.startup_discard + FULL_PARAMS.startup_samples)
		);
	});

	test('a smoke run covers every scenario of the roster, one sample each', () => {
		const plan = plan_of('--smoke', '--metrics', 'startup');
		assert.deepStrictEqual(plan.startup_scenarios, ALL.scenarios);
		assert.deepStrictEqual(plan.startup_unsupported, ALL.unsupported);
		assert.strictEqual(plan.startup_processes, ALL.scenarios.length);
		assert.ok(plan.concurrency >= 1);
		// one sample of each, as its processes would report, is a file the schema accepts
		const startup = plan_startup_round(plan.startup_scenarios, 0).map(
			(planned): StartupProcessResult => ({
				planned,
				result: read_startup_result(planned, to_outcome(planned, { ms: 25 }))
			})
		);
		const { results } = assemble_results({
			options: plan.options,
			generated_at: plan.generated_at,
			duration_ms: 1,
			segments: 1,
			load_at_start: 0,
			machine: plan.machine,
			node: plan.node,
			commit: plan.commit,
			corpus_hash: plan.corpus_hash,
			adapters: plan.adapters,
			libraries: plan.libraries,
			processes: [],
			startup_scenarios: plan.startup_scenarios,
			startup,
			anchor: { drift: 0, stable: true },
			noise_floor: null,
			deterministic: null
		});
		assert.strictEqual(results.startup.length, ALL.scenarios.length);
		assert.strictEqual(results.meta.run!.kind, 'smoke');
		assert.strictEqual(results.meta.run!.startup_samples, SMOKE_PARAMS.startup_samples);
		assert.strictEqual(results.meta.run!.startup_discard, 0);
		for (const entry of results.startup) {
			assert.deepStrictEqual([entry.samples, entry.spread, entry.median_ms], [1, 1, 25]);
		}
		// every library is there in both forms, and the baseline once
		for (const adapter of ADAPTERS) {
			for (const bundled of [false, true]) {
				const own = results.startup.filter(
					(s) => s.library === adapter.id && s.bundled === bundled
				);
				assert.deepStrictEqual(
					[...new Set(own.map((s) => s.scenario))],
					['core', 'lang', 'set', 'first_highlight']
				);
			}
		}
		assert.strictEqual(results.startup.filter((s) => s.scenario === 'bare').length, 1);
	});

	test('a calibration, and a run told to leave it out, plan no cold start and say why', () => {
		const calibration = plan_of('--calibrate', '--langs', 'json', '--sizes', 'micro', '--out', out);
		assert.deepStrictEqual(calibration.startup_scenarios, []);
		assert.strictEqual(calibration.startup_processes, 0);
		// and the file of such a run records no sampling of it
		const { results } = assemble_results({
			options: calibration.options,
			generated_at: calibration.generated_at,
			duration_ms: 1,
			segments: 1,
			load_at_start: 0,
			machine: calibration.machine,
			node: calibration.node,
			commit: calibration.commit,
			corpus_hash: calibration.corpus_hash,
			adapters: calibration.adapters,
			libraries: calibration.libraries,
			processes: [],
			startup_scenarios: [],
			startup: [],
			anchor: { drift: 0, stable: true },
			noise_floor: null,
			deterministic: null
		});
		const { startup_samples, startup_discard, startup_compile_cache } = results.meta.run!;
		assert.deepStrictEqual(
			[startup_samples, startup_discard, startup_compile_cache],
			[null, null, null]
		);
		assert.ok(
			format_run_plan(calibration).includes(
				'cold start   none: a calibration measures the timed cells only'
			)
		);
		const cells_only = plan_of(
			...['--metrics', 'throughput', '--langs', 'json', '--sizes', 'micro', '--out', out]
		);
		assert.deepStrictEqual(cells_only.startup_scenarios, []);
		assert.ok(format_run_plan(cells_only).includes('cold start   none: left out by --metrics'));
	});

	test('the plan names what a library is unsupported for', () => {
		const plan = plan_of(...FILTERS, '--metrics', 'startup', '--out', out);
		const text = format_run_plan({
			...plan,
			startup_unsupported: [
				{ library: 'prism', scenario: 'set', lang: null, set: 'docs', missing: ['md', 'bash'] }
			]
		});
		assert.ok(
			text.includes(
				"prism is unsupported for set docs, unbundled and bundled: it doesn't claim md, bash"
			),
			text
		);
	});
});
