import { afterEach, assert, beforeEach, describe, test } from 'vitest';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parse_bench_results, type BenchResults } from '$lib/results_schema.ts';
import type { CellResult, CellSpec } from '../../../bench/cell.ts';
import { load_corpus_manifest } from '../../../bench/corpus.ts';
import { read_journal } from '../../../bench/journal.ts';
import { ADAPTERS } from '../../../bench/libraries.ts';
import {
	DISTURBED_SPREAD,
	OVERLAPPED_SUFFIX,
	RunError,
	format_run_plan,
	plan_run,
	read_commit,
	run_bench,
	type ChildOutcome,
	type RunBenchOptions
} from '../../../bench/run.ts';
import { parse_run_args, type RunOptions } from '../../../bench/run_options.ts';

// A timed run end to end, with invented process results in place of real
// processes and anchor readings: the journal, resuming, and retrying.

const manifest = load_corpus_manifest();

let dir: string;
let out: string;
let journal_path: string;
let lock_path: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'bench_run_journal_test_'));
	out = join(dir, 'run.json');
	journal_path = `${out}.journal.jsonl`;
	lock_path = join(dir, 'bench.lock');
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

/** A narrow run: two cells, two libraries. */
const FILTERS = ['--langs', 'json', '--sizes', 'micro', '--libraries', 'fuz_code,prism'];
const INPUTS = manifest.inputs.filter((i) => i.lang === 'json' && i.size === 'micro');
const PLANNED = INPUTS.length * 2 * 2 * 2;

const parse = (...args: Array<string>): RunOptions => {
	const parsed = parse_run_args([...FILTERS, '--passes', '2', '--out', out, ...args], ADAPTERS);
	assert.ok(parsed.ok && !parsed.help, parsed.ok ? '' : parsed.message);
	return parsed.options;
};

const STEADY = [1000, 1010];
const NOISY = [1000, 1000 * (DISTURBED_SPREAD + 0.2)];

/** What a process would print for a spec. */
const to_outcome = (spec: CellSpec, ns: Array<number>, tokens: number = 10): ChildOutcome => {
	const result: CellResult = {
		cell: `${spec.file}:${spec.mode}`,
		library: spec.library,
		loaded_langs: [manifest.inputs.find((i) => i.file === spec.file)!.lang],
		measurement: {
			tokens,
			output: { html_bytes: 100, spans: 10 },
			iterations: 10,
			ns_per_op: ns,
			rss_peak_bytes: 50_000_000
		},
		excluded: null
	};
	return {
		error: null,
		status: 0,
		signal: null,
		stdout: JSON.stringify(result) + '\n',
		stderr: ''
	};
};

const INTERRUPTED: ChildOutcome = {
	error: null,
	status: null,
	signal: 'SIGINT',
	stdout: '',
	stderr: ''
};

/**
 * Stands in for the machine: answers each process by how many times its library
 * has been measured on its cell, counts the processes, and reads the anchor
 * from a list.
 */
const create_machine = (
	answer: (spec: CellSpec, nth: number) => ChildOutcome = (spec) => to_outcome(spec, STEADY),
	anchors: Array<number> = []
) => {
	const asked: Map<string, number> = new Map();
	const machine = {
		spawned: 0,
		/** Stops the run, as a signal would, when this many processes have run. */
		interrupt_after: Infinity,
		log: [] as Array<string>,
		options: {
			lock_path,
			log: (line: string) => machine.log.push(line),
			spawn_cell: (spec: CellSpec): ChildOutcome => {
				if (machine.spawned >= machine.interrupt_after) return INTERRUPTED;
				machine.spawned++;
				const key = `${spec.file}:${spec.mode}:${spec.library}`;
				const nth = asked.get(key) ?? 0;
				asked.set(key, nth + 1);
				return answer(spec, nth);
			},
			measure_anchor: () => anchors.shift() ?? 1000
		} satisfies RunBenchOptions
	};
	return machine;
};

const catch_run_error = async (
	options: RunOptions,
	bench_options: RunBenchOptions
): Promise<RunError> => {
	let error: unknown;
	try {
		await run_bench(options, bench_options);
	} catch (caught) {
		error = caught;
	}
	assert.ok(error instanceof RunError, `expected a RunError, got ${String(error)}`);
	return error;
};

/** A results file without what a resumed run records differently. */
const to_comparable = (results: BenchResults): unknown => ({
	...results,
	meta: {
		...results.meta,
		generated_at: null,
		anchor: null,
		run: { ...results.meta.run!, segments: null, duration_ms: null }
	}
});

const read_journal_ok = () => {
	const journal = read_journal(journal_path);
	assert.ok(journal.ok, journal.ok ? '' : journal.message);
	return journal;
};

describe('a timed run keeps a journal', () => {
	test('an uninterrupted run writes its results and removes its journal', async () => {
		const machine = create_machine();
		const { results, path } = await run_bench(parse(), machine.options);
		assert.strictEqual(path, out);
		assert.strictEqual(machine.spawned, PLANNED);
		assert.strictEqual(results.meta.run!.segments, 1);
		assert.strictEqual(results.meta.run!.retries, 2);
		assert.deepStrictEqual(results.meta.anchor, { drift: 0, stable: true });
		assert.deepStrictEqual(parse_bench_results(JSON.parse(readFileSync(out, 'utf8'))), results);
		// nothing but the results is left
		assert.deepStrictEqual(readdirSync(dir), ['run.json']);
	});

	test('a run that is stopped leaves its journal, and says how to resume', async () => {
		const machine = create_machine();
		machine.interrupt_after = 3;
		const error = await catch_run_error(parse(), machine.options);
		assert.strictEqual(error.exit_code, 130);
		assert.match(error.message, /^interrupted during cell /);
		assert.match(error.message, /is kept: run the same command with --resume to continue/);
		assert.ok(!existsSync(out));
		assert.ok(!existsSync(lock_path));
		const journal = read_journal_ok();
		assert.strictEqual(journal.results.size, 3);
		assert.strictEqual(journal.segments, 1);
		// the segment's opening reading, and the closing one it took as it stopped
		assert.strictEqual(journal.readings_ns.length, 2);
	});

	test('a resumed run skips what the journal holds and assembles the same results', async () => {
		const answer = (spec: CellSpec, nth: number): ChildOutcome =>
			to_outcome(spec, [1000 + nth * 7 + spec.library.length, 1010]);
		const whole = await run_bench(parse(), create_machine(answer).options);
		rmSync(out);

		for (const stop_at of [1, 5, PLANNED - 1]) {
			const machine = create_machine(answer);
			machine.interrupt_after = stop_at;
			await catch_run_error(parse(), machine.options);
			const first_started_at = read_journal_ok().header.generated_at;

			machine.interrupt_after = Infinity;
			const { results } = await run_bench(parse('--resume'), machine.options);
			// every process ran once across the two segments
			assert.strictEqual(machine.spawned, PLANNED);
			assert.deepStrictEqual(to_comparable(results), to_comparable(whole.results));
			assert.strictEqual(results.meta.run!.segments, 2);
			assert.strictEqual(results.meta.generated_at, first_started_at);
			assert.ok(machine.log.some((line) => line.includes(`${stop_at} results from 1 segment`)));
			assert.deepStrictEqual(readdirSync(dir), ['run.json']);
			rmSync(out);
		}
	});

	test('a run stopped twice resumes twice', async () => {
		const machine = create_machine();
		machine.interrupt_after = 2;
		await catch_run_error(parse(), machine.options);
		machine.interrupt_after = 5;
		const error = await catch_run_error(parse('--resume'), machine.options);
		assert.strictEqual(error.exit_code, 130);
		assert.strictEqual(read_journal_ok().results.size, 5);
		machine.interrupt_after = Infinity;
		const { results } = await run_bench(parse('--resume'), machine.options);
		assert.strictEqual(machine.spawned, PLANNED);
		assert.strictEqual(results.meta.run!.segments, 3);
	});

	test('the anchor covers every segment: a machine that changed between them is unstable', async () => {
		// steady within each segment, and slower in the second
		const machine = create_machine(undefined, [1000, 1000, 1100, 1100]);
		machine.interrupt_after = 3;
		await catch_run_error(parse(), machine.options);
		machine.interrupt_after = Infinity;
		const { results } = await run_bench(parse('--resume'), machine.options);
		assert.closeTo(results.meta.anchor!.drift, 0.1, 1e-12);
		assert.ok(!results.meta.anchor!.stable);
	});

	test('a resumed run is as long as its segments, not the time between them', async () => {
		const machine = create_machine();
		machine.interrupt_after = 3;
		await catch_run_error(parse(), machine.options);
		const first = read_journal_ok().duration_ms;
		machine.interrupt_after = Infinity;
		const { results } = await run_bench(parse('--resume'), machine.options);
		assert.ok(results.meta.run!.duration_ms >= first);
	});

	test('a journal is neither overwritten nor resumed without being asked', async () => {
		const machine = create_machine();
		machine.interrupt_after = 3;
		await catch_run_error(parse(), machine.options);
		const before = readFileSync(journal_path, 'utf8');
		const error = await catch_run_error(parse(), machine.options);
		assert.strictEqual(error.exit_code, 2);
		assert.match(error.message, /a journal exists: pass --resume .* or remove /);
		// and says what it records, so a leftover from another run is recognisable
		assert.match(
			error.message,
			/it records a full run started \S+, filtered to libraries fuz_code,prism; langs json; sizes micro, holding 3 results/
		);
		writeFileSync(journal_path, 'garbage\n');
		const unreadable = await catch_run_error(parse(), machine.options);
		assert.strictEqual(unreadable.exit_code, 2);
		assert.match(unreadable.message, /it records nothing that can be read/);
		writeFileSync(journal_path, before);
		assert.strictEqual(readFileSync(journal_path, 'utf8'), before);
		assert.strictEqual(machine.spawned, 3);
	});

	test('--resume with no journal is refused', async () => {
		const machine = create_machine();
		const error = await catch_run_error(parse('--resume'), machine.options);
		assert.strictEqual(error.exit_code, 2);
		assert.match(error.message, /there is no journal to resume at /);
		assert.strictEqual(machine.spawned, 0);
		assert.ok(!existsSync(lock_path));
	});

	test('a journal resumed with another flag is refused, naming what differs', async () => {
		const machine = create_machine();
		machine.interrupt_after = 3;
		await catch_run_error(parse(), machine.options);
		const before = readFileSync(journal_path, 'utf8');
		for (const [args, field] of [
			[['--rounds', '9'], 'rounds: the journal has 4, this run 9'],
			[['--target-ms', '5'], 'target_ms: the journal has 20, this run 5'],
			[['--retries', '0'], 'retries: the journal has 2, this run 0'],
			[['--calibrate'], 'kind: the journal has "full", this run "calibrate"'],
			[['--modes', 'html'], 'filters.modes: the journal has null, this run ["html"]'],
			[['--machine', 'other'], 'machine.name: ']
		] as const) {
			const error = await catch_run_error(parse('--resume', ...args), machine.options);
			assert.strictEqual(error.exit_code, 2, args.join(' '));
			assert.match(error.message, /records another run/);
			assert.ok(error.message.includes(field), error.message);
		}
		assert.strictEqual(readFileSync(journal_path, 'utf8'), before);
		assert.strictEqual(machine.spawned, 3);
	});

	test('a last line cut short is measured again, and any other damage is refused', async () => {
		const machine = create_machine();
		machine.interrupt_after = 3;
		await catch_run_error(parse(), machine.options);
		// cut inside the closing reading and the last result: a crash mid-append
		const lines = readFileSync(journal_path, 'utf8').trimEnd().split('\n');
		assert.strictEqual(JSON.parse(lines.at(-2)!).type, 'result');
		writeFileSync(journal_path, lines.slice(0, -2).join('\n') + '\n' + lines.at(-2)!.slice(0, 30));
		machine.interrupt_after = Infinity;
		const { results } = await run_bench(parse('--resume'), machine.options);
		assert.strictEqual(machine.spawned, PLANNED + 1);
		assert.strictEqual(results.meta.run!.segments, 2);

		// a whole line that is not a journal line is not a crash
		rmSync(out);
		const again = create_machine();
		again.interrupt_after = 3;
		await catch_run_error(parse(), again.options);
		writeFileSync(journal_path, readFileSync(journal_path, 'utf8') + 'garbage\n');
		const error = await catch_run_error(parse('--resume'), again.options);
		assert.strictEqual(error.exit_code, 2);
		assert.match(error.message, /can't be resumed, line \d+ is not a journal line: remove it/);
		assert.strictEqual(again.spawned, 3);
	});

	test('a result that disagrees with a journaled one stops the run, and is not journaled', async () => {
		// the second process of a library on a cell counts another token total
		const machine = create_machine((spec, nth) => to_outcome(spec, STEADY, nth === 0 ? 10 : 11));
		const error = await catch_run_error(parse(), machine.options);
		assert.strictEqual(error.exit_code, 1);
		assert.match(error.message, /came out differently from one process to the next/);
		assert.match(error.message, /--resume/);
		const kept = read_journal_ok().results.size;
		assert.strictEqual(kept, machine.spawned - 1);

		// replayed from the journal, the first pass is still what the next is checked against
		const resumed = create_machine((spec) => to_outcome(spec, STEADY, 11));
		const again = await catch_run_error(parse('--resume'), resumed.options);
		assert.match(again.message, /came out differently/);
		assert.strictEqual(resumed.spawned, 1);
		assert.strictEqual(read_journal_ok().results.size, kept);
	});

	test('a failed process fails the run and leaves the journal to resume', async () => {
		const machine = create_machine((spec, nth) =>
			spec.library === 'prism' && nth === 1
				? { error: null, status: 1, signal: null, stdout: '', stderr: 'Error: boom\n' }
				: to_outcome(spec, STEADY)
		);
		const error = await catch_run_error(parse(), machine.options);
		assert.strictEqual(error.exit_code, 1);
		assert.match(error.message, /failed \(exit 1\):\nError: boom/);
		assert.ok(!existsSync(out));
		assert.ok(existsSync(journal_path));
	});

	test('a run that lost the machine lock sets its journal aside, however it ends', async () => {
		/** Another run takes the lock over. */
		const take_lock = (): void =>
			writeFileSync(
				lock_path,
				JSON.stringify({ pid: process.pid + 1, label: 'full run', cwd: '/', started_at: 'now' })
			);
		for (const interrupt_after of [Infinity, 3]) {
			const machine = create_machine((spec) => {
				take_lock();
				return to_outcome(spec, STEADY);
			});
			machine.interrupt_after = interrupt_after;
			const error = await catch_run_error(parse(), machine.options);
			assert.strictEqual(error.exit_code, interrupt_after === Infinity ? 1 : 130);
			assert.match(error.message, /taken over during the run/);
			assert.match(
				error.message,
				/set aside as .*\.journal\.jsonl\.overlapped and can not be resumed/
			);
			assert.ok(!error.message.includes('--resume'));
			assert.ok(!existsSync(out));
			assert.ok(!existsSync(journal_path));
			assert.ok(existsSync(journal_path + OVERLAPPED_SUFFIX));
			// the other run's lock is untouched, and nothing resumes what was set aside
			assert.ok(existsSync(lock_path));
			rmSync(lock_path);
			const resumed = await catch_run_error(parse('--resume'), create_machine().options);
			assert.match(resumed.message, /there is no journal to resume/);
			rmSync(journal_path + OVERLAPPED_SUFFIX);
		}
	});

	test('a journal holding a result the run never asks for is refused before measuring', async () => {
		const machine = create_machine();
		machine.interrupt_after = 3;
		await catch_run_error(parse(), machine.options);
		const whole = readFileSync(journal_path, 'utf8');
		const lines = whole.trimEnd().split('\n');
		const index = lines.findIndex((line) => JSON.parse(line).type === 'result');
		for (const [change, expected] of [
			[(entry: any) => (entry.attempt = 3), /attempt 4\)/],
			[(entry: any) => (entry.pass = 2), /pass 3, attempt 1\)/],
			[(entry: any) => (entry.result.library = 'shiki_js'), /\(shiki_js on /],
			[(entry: any) => (entry.result.cell = 'harness/ts/snippet.ts:html'), /snippet\.ts:html/]
		] as const) {
			const entry = JSON.parse(lines[index]!);
			change(entry);
			writeFileSync(journal_path, lines.with(index, JSON.stringify(entry)).join('\n') + '\n');
			const error = await catch_run_error(parse('--resume'), machine.options);
			assert.strictEqual(error.exit_code, 2);
			assert.match(error.message, /holds a result this run never asks for/);
			assert.match(error.message, expected);
			assert.ok(!error.message.includes('is kept'));
			assert.strictEqual(machine.spawned, 3);
			assert.ok(!existsSync(lock_path));
		}
	});

	test('a results file that can not be written leaves the whole run in the journal', async () => {
		let made = false;
		const machine = create_machine((spec) => {
			// the output path becomes a directory while the run measures
			if (!made) mkdirSync(out);
			made = true;
			return to_outcome(spec, STEADY);
		});
		const error = await catch_run_error(parse(), machine.options);
		assert.strictEqual(error.exit_code, 2);
		assert.match(error.message, /^can't write .*run\.json: /);
		assert.match(error.message, /is kept, and holds the whole run: .* --resume/);
		assert.deepStrictEqual(readdirSync(dir).toSorted(), ['run.json', 'run.json.journal.jsonl']);
		// with the output fixed, a resume writes it without measuring anything
		rmSync(out, { recursive: true });
		const { results } = await run_bench(parse('--resume'), machine.options);
		assert.strictEqual(machine.spawned, PLANNED);
		assert.strictEqual(results.meta.run!.segments, 2);
		assert.deepStrictEqual(readdirSync(dir), ['run.json']);
	});

	test('a resume from a dirty tree says the journal can not vouch for it', async () => {
		const machine = create_machine();
		machine.interrupt_after = 3;
		await catch_run_error(parse(), machine.options);
		machine.interrupt_after = Infinity;
		await run_bench(parse('--resume'), machine.options);
		assert.strictEqual(
			machine.log.some((line) => line.includes('can not tell whether')),
			read_commit().endsWith('-dirty')
		);
	});

	test('a calibration keeps a journal too, and resumes to the same noise floor', async () => {
		const answer = (spec: CellSpec, nth: number): ChildOutcome =>
			to_outcome(spec, [nth % 2 === 0 ? 1040 : 1000]);
		const whole = await run_bench(parse('--calibrate'), create_machine(answer).options);
		assert.closeTo(whole.results.meta.noise_floor!.per_cell, 0.04, 1e-9);
		rmSync(out);
		const machine = create_machine(answer);
		machine.interrupt_after = 7;
		await catch_run_error(parse('--calibrate'), machine.options);
		machine.interrupt_after = Infinity;
		const resumed = await run_bench(parse('--calibrate', '--resume'), machine.options);
		assert.strictEqual(machine.spawned, PLANNED * 2);
		assert.deepStrictEqual(to_comparable(resumed.results), to_comparable(whole.results));
		assert.deepStrictEqual(resumed.pairs, whole.pairs);
	});
});

describe('a timed run retries what was disturbed', () => {
	/** prism is noisy on its first attempt at every cell, steadier and slower on its second. */
	const answer = (spec: CellSpec, nth: number): ChildOutcome =>
		to_outcome(spec, spec.library !== 'prism' ? STEADY : nth < 2 ? NOISY : [3000, 3030]);

	test('the file records the attempt whose rounds agreed best, and how many there were', async () => {
		const machine = create_machine(answer);
		const { results } = await run_bench(parse(), machine.options);
		// every pass of prism again, in every cell, once
		assert.strictEqual(machine.spawned, PLANNED + INPUTS.length * 2 * 2);
		for (const cell of results.cells) {
			assert.strictEqual(cell.values.fuz_code!.attempts, 1);
			assert.strictEqual(cell.values.prism!.attempts, 2);
			// the slower attempt, because it is the steadier one
			assert.strictEqual(cell.values.prism!.ns_per_op, 3015);
			assert.ok(cell.values.prism!.spread < DISTURBED_SPREAD);
		}
	});

	test('retries stop at the bound, and the best of the attempts is kept', async () => {
		// noisier with every attempt
		const always = (spec: CellSpec, nth: number): ChildOutcome =>
			to_outcome(spec, spec.library === 'prism' ? [1000, 1000 * (1.5 + nth)] : STEADY);
		for (const retries of [0, 1, 3]) {
			const machine = create_machine(always);
			const { results } = await run_bench(parse('--retries', String(retries)), machine.options);
			assert.strictEqual(machine.spawned, PLANNED + INPUTS.length * 2 * 2 * retries);
			for (const cell of results.cells) {
				assert.strictEqual(cell.values.prism!.attempts, retries + 1);
				// the first attempt was the steadiest
				assert.closeTo(cell.values.prism!.spread, 2.5, 1e-12);
			}
			assert.strictEqual(results.meta.run!.retries, retries);
			rmSync(out);
		}
	});

	test('a run stopped in the middle of a retry resumes to the same results', async () => {
		const whole = await run_bench(parse(), create_machine(answer).options);
		rmSync(out);
		// the first cell is its planned processes, then the retry of prism
		for (const stop_at of [8, 9]) {
			const machine = create_machine(answer);
			machine.interrupt_after = stop_at;
			await catch_run_error(parse(), machine.options);
			assert.ok([...read_journal_ok().results.keys()].some((key) => key.endsWith(',1]')));
			machine.interrupt_after = Infinity;
			const { results } = await run_bench(parse('--resume'), machine.options);
			assert.deepStrictEqual(to_comparable(results), to_comparable(whole.results));
			assert.strictEqual(machine.spawned, PLANNED + INPUTS.length * 2 * 2);
			rmSync(out);
		}
	});

	test('a calibration retries each arm of a library on its own', async () => {
		// only the first process of prism on a cell is noisy: its first arm's first pass
		const machine = create_machine((spec, nth) =>
			to_outcome(spec, spec.library === 'prism' && nth === 0 ? NOISY : STEADY)
		);
		const { results, pairs } = await run_bench(parse('--calibrate'), machine.options);
		// two passes of one arm again, in every cell
		assert.strictEqual(machine.spawned, PLANNED * 2 + INPUTS.length * 2 * 2);
		for (const cell of results.cells) assert.strictEqual(cell.values.prism!.attempts, 2);
		// both arms then agree
		for (const pair of pairs) assert.closeTo(pair.ratio, 1, 1e-12);
	});
});

describe('before a timed run measures', () => {
	test('a directory that can not be written is refused, for the results and the journal', async (context) => {
		if (process.getuid?.() === 0) context.skip();
		const locked = join(dir, 'locked');
		mkdirSync(locked);
		chmodSync(locked, 0o555);
		try {
			for (const path of [join(locked, 'run.json'), join(locked, 'deeper', 'run.json')]) {
				const machine = create_machine();
				const error = await catch_run_error({ ...parse(), out: path }, machine.options);
				assert.strictEqual(error.exit_code, 2);
				assert.match(error.message, /can't write to .*: .*locked is not a writable directory/);
				assert.strictEqual(machine.spawned, 0);
				assert.ok(!existsSync(lock_path));
			}
		} finally {
			chmodSync(locked, 0o755);
		}
	});

	test('--plan describes the run and touches nothing', () => {
		const nested = join(dir, 'not_made', 'run.json');
		const plan = plan_run({ ...parse('--plan'), out: nested });
		assert.strictEqual(plan.processes.length, PLANNED);
		assert.strictEqual(plan.journal_path, `${nested}.journal.jsonl`);
		const text = format_run_plan(plan);
		assert.match(text, /^the plan of a full run on .*: nothing is measured/);
		assert.match(text, new RegExp(`cells +${INPUTS.length * 2}\\n`));
		assert.match(text, /libraries +fuz_code, prism\n/);
		assert.match(
			text,
			new RegExp(`processes +${PLANNED}, one at a time, and at most ${PLANNED * 2} more`)
		);
		assert.match(text, /measuring +2 pass\(es\) of 4 round\(s\), 20ms batches, .* up to 2 retries/);
		assert.match(text, /output +.*run\.json\n/);
		assert.match(text, /journal +.*run\.json\.journal\.jsonl\n/);
		assert.match(text, /noise floor +none: /);
		assert.match(text, /estimate +about .* a rough figure from the parameters, not a measurement/);
		// in minutes once it is over one
		const long = format_run_plan({ ...plan, processes: Array(400).fill(plan.processes[0]) });
		assert.match(long, /estimate +about \d+ min for the planned processes/);
		assert.ok(!existsSync(join(dir, 'not_made')));
		assert.ok(!existsSync(lock_path));
	});

	test('--plan says what a journal holds, and refuses what the run would', async () => {
		const machine = create_machine();
		machine.interrupt_after = 3;
		await catch_run_error(parse(), machine.options);
		assert.throws(() => plan_run(parse('--plan')), /a journal exists/);
		const text = format_run_plan(plan_run(parse('--plan', '--resume')));
		assert.match(text, /which holds 3 results from 1 segment\(s\) that this run continues/);
		// a smoke run keeps none
		const smoke = parse_run_args(['--smoke', '--plan', ...FILTERS, '--out', out], ADAPTERS);
		assert.ok(smoke.ok && !smoke.help);
		const smoke_text = format_run_plan(plan_run(smoke.options));
		assert.match(smoke_text, /journal +none: a smoke run keeps no journal/);
		assert.match(smoke_text, /\d+ at a time/);
		assert.ok(!smoke_text.includes('noise floor'));
	});
});
