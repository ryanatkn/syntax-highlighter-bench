import { afterAll, assert, beforeAll, describe, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { BenchResults, heap_readings_agree, parse_bench_results } from '#lib/results_schema.ts';
import {
	STARTUP_DIR,
	plan_startup_scenarios,
	prepare_startup,
	to_startup_child_path,
	to_startup_env
} from '../../../bench/coldstart.ts';
import { load_corpus_manifest, read_corpus_input } from '../../../bench/corpus.ts';
import { to_deterministic_path } from '../../../bench/deterministic.ts';
import { run_heap_child, to_bench_heap, to_heap_child_source } from '../../../bench/heap.ts';
import { ADAPTERS } from '../../../bench/libraries.ts';
import { read_journal } from '../../../bench/journal.ts';
import {
	RunError,
	read_startup_result,
	run_bench,
	spawn_cell_sync,
	spawn_startup_sync,
	to_startup_entries,
	type StartupProcessResult
} from '../../../bench/run.ts';
import { parse_run_args, type RunOptions } from '../../../bench/run_options.ts';
import { build_bundle } from '../../../bench/sizes.ts';

// The tests that start real processes: one small smoke run through real cell
// processes, a few real cold starts, and the commands' exit codes. Keep them
// few: each costs a process.

const REPO_DIR = fileURLToPath(new URL('../../../', import.meta.url));

let dir: string;

beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), 'bench_run_spawn_test_'));
});

afterAll(() => {
	rmSync(dir, { recursive: true, force: true });
});

const parse = (...args: Array<string>): RunOptions => {
	const parsed = parse_run_args(args, ADAPTERS);
	assert.ok(parsed.ok && !parsed.help);
	return parsed.options;
};

describe('run_bench', () => {
	test(
		'a smoke run over a narrow filter writes a valid results file',
		{ timeout: 60_000 },
		async () => {
			const out = join(dir, 'smoke.json');
			const lock_path = join(dir, 'smoke.lock');
			const log: Array<string> = [];
			const options = parse(
				'--smoke',
				'--langs',
				'json',
				'--sizes',
				'micro',
				'--libraries',
				'fuz_code,prism',
				'--metrics',
				'throughput',
				'--out',
				out
			);
			const { results, path, pairs } = await run_bench(options, {
				lock_path,
				log: (line) => log.push(line)
			});

			assert.strictEqual(path, out);
			// the file is the parsed value, and reads back as itself
			const text = readFileSync(out, 'utf8');
			assert.strictEqual(text, JSON.stringify(results, null, '\t') + '\n');
			assert.deepStrictEqual(parse_bench_results(JSON.parse(text)), results);

			const inputs = load_corpus_manifest().inputs.filter(
				(i) => i.lang === 'json' && i.size === 'micro'
			);
			assert.ok(inputs.length > 0);
			assert.deepStrictEqual(
				results.cells.map((cell) => cell.id),
				inputs.flatMap((i) => [`${i.file}:tokenize`, `${i.file}:html`])
			);
			assert.deepStrictEqual(results.inputs, inputs);
			for (const cell of results.cells) {
				const [stated, unstated] =
					cell.mode === 'tokenize' ? [cell.tokens, cell.output] : [cell.output, cell.tokens];
				for (const section of [cell.values, stated]) {
					assert.deepStrictEqual(Object.keys(section), ['fuz_code', 'prism']);
				}
				assert.deepStrictEqual(unstated, {});
				for (const value of Object.values(cell.values)) {
					assert.ok(value.ns_per_op > 0);
					// a whole process of its own
					assert.ok(value.rss_peak_bytes > 10_000_000);
				}
			}
			assert.deepStrictEqual(results.meta.excluded, []);
			assert.deepStrictEqual(
				results.meta.libraries.map((l) => l.id),
				['fuz_code', 'prism']
			);

			const { meta } = results;
			assert.strictEqual(meta.run!.kind, 'smoke');
			assert.strictEqual(meta.run!.rounds, 1);
			assert.strictEqual(meta.run!.passes, 1);
			assert.deepStrictEqual(meta.run!.filters, options.filters);
			assert.ok(meta.run!.duration_ms > 0);
			assert.ok(meta.anchor !== null);
			assert.strictEqual(meta.noise_floor, null);
			assert.strictEqual(meta.node, process.version);
			assert.match(meta.commit!, /^[0-9a-f]{40}(-dirty)?$/);
			assert.strictEqual(meta.corpus_hash, load_corpus_manifest().corpus_hash);
			assert.ok(meta.machine!.name.length > 0);
			assert.deepStrictEqual(results.startup, []);
			// the committed deterministic file describes this tree, so the run carries its
			// sizes, and every real process agreed with its token counts and output sizes
			const deterministic = parse_bench_results(
				JSON.parse(readFileSync(to_deterministic_path(), 'utf8'))
			);
			assert.deepStrictEqual(results.bundle, {
				fuz_code: deterministic.bundle.fuz_code!,
				prism: deterministic.bundle.prism!
			});
			assert.deepStrictEqual(meta.bundler, deterministic.meta.bundler);
			assert.ok(log.every((line) => !line.includes('no bundle sizes')));
			for (const cell of results.cells) {
				const from_file = deterministic.cells.find((c) => c.id === cell.id)!;
				for (const id of ['fuz_code', 'prism']) {
					assert.deepStrictEqual(cell.tokens[id], from_file.tokens[id]);
					assert.deepStrictEqual(cell.output[id], from_file.output[id]);
				}
			}
			assert.deepStrictEqual(pairs, []);

			// the lock was held for the run and is free again, and no temp file is left
			assert.ok(!existsSync(lock_path));
			assert.deepStrictEqual(
				readdirSync(dir).filter((name) => name.endsWith('.tmp')),
				[]
			);
			assert.ok(log.some((line) => line.includes('smoke run')));
			BenchResults.parse(results);
		}
	);

	test(
		'a timed run stopped after a real process resumes from its journal',
		{ timeout: 60_000 },
		async () => {
			const out = join(dir, 'resumed.json');
			const journal_path = `${out}.journal.jsonl`;
			const args = [
				...['--langs', 'json', '--sizes', 'micro', '--modes', 'tokenize'],
				...['--libraries', 'fuz_code', '--passes', '1', '--rounds', '1', '--target-ms', '1'],
				...['--retries', '0', '--metrics', 'throughput', '--out', out]
			];
			let spawned = 0;
			let stop_after = 1;
			const bench_options = {
				lock_path: join(dir, 'resumed.lock'),
				log: () => {},
				measure_anchor: () => 1000,
				// real processes, and then what a signal to the child looks like
				spawn_cell: (spec: Parameters<typeof spawn_cell_sync>[0]) =>
					spawned++ < stop_after
						? spawn_cell_sync(spec)
						: { error: null, status: null, signal: 'SIGINT', stdout: '', stderr: '' }
			};
			let error: unknown;
			try {
				await run_bench(parse(...args), bench_options);
			} catch (caught) {
				error = caught;
			}
			assert.ok(error instanceof RunError);
			assert.strictEqual(error.exit_code, 130);
			assert.match(error.message, /--resume/);
			assert.ok(!existsSync(out));
			const journal = read_journal(journal_path);
			assert.ok(journal.ok);
			assert.strictEqual(journal.results.size, 1);
			const [journaled] = journal.results.values();

			spawned = 0;
			stop_after = Infinity;
			const { results } = await run_bench(parse(...args, '--resume'), bench_options);
			assert.strictEqual(results.meta.run!.segments, 2);
			assert.ok(!existsSync(journal_path));
			assert.deepStrictEqual(parse_bench_results(JSON.parse(readFileSync(out, 'utf8'))), results);
			// the first cell's number is the journaled process's, and the rest were measured now
			assert.strictEqual(spawned, results.cells.length - 1);
			assert.strictEqual(results.cells[0]!.id, journaled!.cell);
			assert.strictEqual(
				results.cells[0]!.values.fuz_code!.ns_per_op,
				journaled!.measurement!.ns_per_op[0]
			);
		}
	);

	test('refuses to run while the machine lock is held, and writes nothing', async () => {
		const out = join(dir, 'refused.json');
		const lock_path = join(dir, 'held.lock');
		writeFileSync(
			lock_path,
			JSON.stringify({ pid: process.pid, label: 'full run', cwd: '/elsewhere', started_at: 'now' })
		);
		let error: unknown;
		try {
			await run_bench(parse('--smoke', '--langs', 'json', '--sizes', 'micro', '--out', out), {
				lock_path,
				log: () => {}
			});
		} catch (caught) {
			error = caught;
		}
		assert.ok(error instanceof RunError);
		assert.strictEqual(error.exit_code, 2);
		assert.match(error.message, new RegExp(`held by pid ${process.pid} \\(full run`));
		assert.ok(!existsSync(out));
		// the holder's lock is untouched
		assert.ok(existsSync(lock_path));
	});

	const assert_refused = async (
		args: Array<string>,
		expected: RegExp,
		bench_options: { results_dir?: string } = {}
	): Promise<void> => {
		let error: unknown;
		try {
			await run_bench(parse(...args), {
				lock_path: join(dir, 'unused.lock'),
				log: () => {},
				...bench_options
			});
		} catch (caught) {
			error = caught;
		}
		assert.ok(error instanceof RunError, args.join(' '));
		assert.strictEqual(error.exit_code, 2);
		assert.match(error.message, expected);
		// refused before anything was measured: the lock was never taken
		assert.ok(!existsSync(join(dir, 'unused.lock')));
	};

	test('a complete run needs the machine named, whatever --out says', async () => {
		for (const args of [[], ['--calibrate'], ['--out', join(dir, 'x.json')]]) {
			await assert_refused(args, /--machine/);
		}
	});

	test('an output path that could not be written is refused before measuring', async () => {
		const filtered = ['--langs', 'json', '--sizes', 'micro'];
		await assert_refused([...filtered, '--out', ''], /--out needs a file path/);
		await assert_refused([...filtered, '--out', dir], /is a directory/);
		// a path under a file can't have its directory made
		const file = join(dir, 'a_file.json');
		writeFileSync(file, '');
		await assert_refused([...filtered, '--out', join(file, 'x.json')], /can't write to/);
	});

	test('a full run does not overwrite the run of the same UTC date and machine', async () => {
		const results_dir = join(dir, 'dated');
		mkdirSync(results_dir);
		const today = new Date().toISOString().slice(0, 10);
		const existing = join(results_dir, `${today}_box.json`);
		writeFileSync(existing, 'an earlier run');
		await assert_refused(['--machine', 'box'], /exists: move it or pass --out/, { results_dir });
		assert.strictEqual(readFileSync(existing, 'utf8'), 'an earlier run');
	});

	test('a calibration file that does not parse stops a full run before it measures', async () => {
		const results_dir = join(dir, 'calibrated');
		mkdirSync(results_dir);
		writeFileSync(join(results_dir, 'calibration_box.json'), '{"meta": {}}');
		await assert_refused(
			['--machine', 'box', '--langs', 'json', '--sizes', 'micro'],
			/calibration_box\.json is not a results file of this harness: run the calibration again/,
			{ results_dir }
		);
	});

	test('filters that match no cell are a usage error', async () => {
		await assert_refused(['--sizes', 'large', '--sources', 'harness'], /no cell matches/);
	});
});

describe('cold start', () => {
	// under the repo, as the real directory is, so the entry's imports resolve
	let startup_dir: string;

	beforeAll(() => {
		mkdirSync(dirname(STARTUP_DIR), { recursive: true });
		startup_dir = mkdtempSync(join(dirname(STARTUP_DIR), 'startup_spawn_test_'));
	});

	afterAll(() => {
		rmSync(startup_dir, { recursive: true, force: true });
	});

	test(
		'a fresh process per sample: the bare baseline, and a library imported unbundled',
		{ timeout: 60_000 },
		async () => {
			const adapters = ADAPTERS.filter((a) => a.id === 'fuz_code');
			const scenarios = plan_startup_scenarios(
				adapters,
				{ libraries: null, langs: [] },
				load_corpus_manifest().inputs
			).scenarios.filter((s) => s.key === 'bare' || s.key === 'fuz_code:core:unbundled');
			assert.strictEqual(scenarios.length, 2);
			// nothing bundled, so nothing is built
			const prepared = await prepare_startup(scenarios, adapters, { dir: startup_dir });
			assert.deepStrictEqual(prepared, { built: [], mismatched: [] });

			const params = { startup_discard: 0, startup_samples: 2 };
			const processes: Array<StartupProcessResult> = [];
			for (let round = 0; round < params.startup_samples; round++) {
				for (const scenario of scenarios) {
					const planned = { scenario, round };
					const outcome = spawn_startup_sync(to_startup_child_path(scenario, startup_dir));
					assert.strictEqual(outcome.stderr, '');
					processes.push({ planned, result: read_startup_result(planned, outcome) });
				}
			}
			const { startup, excluded } = to_startup_entries(scenarios, processes, params);
			assert.deepStrictEqual(excluded, []);
			assert.deepStrictEqual(
				startup.map((entry) => [entry.scenario, entry.library, entry.samples]),
				[
					['bare', null, 2],
					['core', 'fuz_code', 2]
				]
			);
			for (const entry of startup) {
				// the process's own clock, from its start: Node has to have started
				assert.ok(entry.median_ms > 1);
				// a whole process, in bytes
				assert.ok(entry.rss_peak_bytes > 10_000_000);
			}

			// a load trace: the library's process loads the scenario's module, its entry, and
			// the library, and neither the harness nor another library
			const trace_path = join(startup_dir, 'trace.mjs');
			writeFileSync(
				trace_path,
				[
					`import { registerHooks } from 'node:module';`,
					'const loaded = [];',
					'registerHooks({ load: (url, context, next) => (loaded.push(url), next(url, context)) });',
					`process.on('exit', () => process.stderr.write(JSON.stringify(loaded)));`
				].join('\n')
			);
			const core_path = to_startup_child_path(scenarios[1]!, startup_dir);
			const traced = spawnSync(
				process.execPath,
				['--import', pathToFileURL(trace_path).href, core_path],
				{ cwd: REPO_DIR, encoding: 'utf8', env: to_startup_env(process.env) }
			);
			assert.strictEqual(traced.status, 0, traced.stderr);
			const loaded: Array<string> = JSON.parse(traced.stderr);
			const files = loaded.filter((url) => url.startsWith('file:'));
			const library_dir = pathToFileURL(join(REPO_DIR, 'node_modules/@fuzdev/fuz_code/')).href;
			assert.deepStrictEqual(files.slice(0, 2), [
				pathToFileURL(core_path).href,
				pathToFileURL(join(startup_dir, 'fuz_code/core.entry.mjs')).href
			]);
			assert.ok(files.length > 2);
			for (const url of files.slice(2)) assert.ok(url.startsWith(library_dir), url);
			// and no language: the core scenario loads the styler alone
			assert.ok(!files.some((url) => url.includes('lexer_')), files.join('\n'));

			// the compile cache is refused in such a process, even when something asks for it
			const cache_dir = join(startup_dir, 'compile_cache');
			const asked = spawnSync(
				process.execPath,
				[
					'-e',
					`const m = require('node:module'); console.log(JSON.stringify([m.enableCompileCache(${JSON.stringify(cache_dir)}).status === m.constants.compileCacheStatus.DISABLED, m.getCompileCacheDir() ?? null]))`
				],
				{ encoding: 'utf8', env: to_startup_env({ ...process.env, NODE_COMPILE_CACHE: cache_dir }) }
			);
			assert.strictEqual(asked.status, 0, asked.stderr);
			assert.deepStrictEqual(JSON.parse(asked.stdout), [true, null]);
			assert.ok(!existsSync(cache_dir));
		}
	);
});

describe('heap', () => {
	test(
		'a library reads what the deterministic file holds for it, over its bare process',
		{ timeout: 60_000 },
		async () => {
			const adapter = ADAPTERS.find((a) => a.id === 'prism')!;
			const snippet = load_corpus_manifest().inputs.find(
				(input) => input.source === 'harness' && input.lang === 'json'
			)!;
			const highlight = {
				src: read_corpus_input(snippet),
				expression: adapter.bundle_html_source('json')
			};
			const heap_dir = join(dir, 'heap');
			mkdirSync(heap_dir, { recursive: true });
			writeFileSync(
				join(heap_dir, 'bundle.mjs'),
				await build_bundle(adapter.bundle_entry(['json']))
			);
			writeFileSync(join(heap_dir, 'bare.mjs'), to_heap_child_source(null, highlight));
			writeFileSync(join(heap_dir, 'prism.mjs'), to_heap_child_source('./bundle.mjs', highlight));
			const bare = await run_heap_child(join(heap_dir, 'bare.mjs'), 'bare');
			const reading = await run_heap_child(join(heap_dir, 'prism.mjs'), 'prism');
			assert.ok(bare.settled && reading.settled);
			assert.strictEqual(bare.exports, 0);
			assert.strictEqual(bare.html_length, 0);
			assert.ok(reading.exports > 0 && reading.html_length > 0);
			const heap = to_bench_heap(reading, bare);
			assert.ok(heap.retained_kb > 0);
			const committed = parse_bench_results(
				JSON.parse(readFileSync(to_deterministic_path(), 'utf8'))
			).heap.prism!.json!;
			assert.ok(
				heap_readings_agree(heap.retained_kb, committed.retained_kb) &&
					heap_readings_agree(heap.external_kb, committed.external_kb),
				`read ${JSON.stringify(heap)}, and the deterministic file has ${JSON.stringify(committed)}`
			);
		}
	);
});

const run_node = (
	...args: Array<string>
): { status: number | null; stdout: string; stderr: string } =>
	spawnSync(process.execPath, args, { cwd: REPO_DIR, encoding: 'utf8' });

describe('the commands', { timeout: 30_000 }, () => {
	test('bench/run.ts exits 2 for an unknown flag or id, before doing anything', () => {
		for (const args of [['--bogus']]) {
			const run = run_node('bench/run.ts', ...args);
			assert.strictEqual(run.status, 2, args.join(' '));
			assert.match(run.stderr, /--help/);
			assert.strictEqual(run.stdout, '');
		}
	});

	test('bench/run.ts --help prints the flags and exits 0', () => {
		const run = run_node('bench/run.ts', '--help');
		assert.strictEqual(run.status, 0);
		for (const flag of [
			...['--smoke', '--calibrate', '--libraries', '--machine', '--resume'],
			...['--metrics', '--startup-samples']
		]) {
			assert.ok(run.stdout.includes(flag), flag);
		}
	});

	test('bench/run.ts --plan prints the plan, exits 0, and measures nothing', () => {
		const out = join(dir, 'planned', 'run.json');
		const args = ['--plan', '--langs', 'json', '--sizes', 'micro', '--out', out];
		const run = run_node('bench/run.ts', ...args);
		assert.strictEqual(run.status, 0, run.stderr);
		assert.match(run.stdout, /^the plan of a full run on .*: nothing is measured\n/);
		assert.match(run.stdout, /estimate +about /);
		assert.ok(run.stdout.includes(`${out}.journal.jsonl`));
		assert.ok(!existsSync(join(dir, 'planned')));
		// and it is refused where the run would be
		const refused = run_node('bench/run.ts', '--plan');
		assert.strictEqual(refused.status, 2);
		assert.match(refused.stderr, /--machine/);
	});

	test('bench/cell.ts fails loudly without --expose-gc, and prints no result', () => {
		const spec = JSON.stringify({
			file: 'harness/json/snippet.json',
			mode: 'tokenize',
			library: 'fuz_code',
			rounds: 1,
			target_ms: 1,
			warmup_ms: 1,
			rewarm_ms: 1
		});
		const run = run_node('bench/cell.ts', spec);
		assert.notStrictEqual(run.status, 0);
		assert.match(run.stderr, /--expose-gc/);
		assert.strictEqual(run.stdout, '');
		// and with the flag, it prints exactly one JSON result
		const with_gc = run_node('--expose-gc', 'bench/cell.ts', spec);
		assert.strictEqual(with_gc.status, 0, with_gc.stderr);
		assert.strictEqual(JSON.parse(with_gc.stdout).cell, 'harness/json/snippet.json:tokenize');
		assert.strictEqual(with_gc.stdout.trim().split('\n').length, 1);
	});

	test('bench/cell.ts fails on a spec it does not understand', () => {
		for (const spec of ['{}']) {
			const run = run_node('--expose-gc', 'bench/cell.ts', spec);
			assert.notStrictEqual(run.status, 0);
			assert.strictEqual(run.stdout, '');
		}
	});

	test('the html call hands back a flat string from every library, cold and optimised', () => {
		// some libraries return a rope, and the timed call must pay to flatten it as a
		// consumer would. Only the engine can say whether a string is flat, and an
		// optimised call is where a read whose result goes nowhere would be dropped.
		const script = `
			import { create_timed_call, load_adapter, read_html_sink } from './bench/cell.ts';
			const src = 'const a: number = 1;\\nexport const b = [a, "two"];\\n'.repeat(40);
			const flat = {};
			for (const id of ${JSON.stringify(ADAPTERS.map((a) => a.id))}) {
				const adapter = await load_adapter(id);
				await adapter.setup(['ts']);
				const raw = %StringIsFlat(adapter.html(src, 'ts'));
				const run = create_timed_call(adapter, 'html', src, 'ts');
				const cold = %StringIsFlat(run());
				%PrepareFunctionForOptimization(run);
				run();
				run();
				%OptimizeFunctionOnNextCall(run);
				const optimised = %StringIsFlat(run());
				let hot = true;
				// a string that is flat as returned has no read to drop, so a few calls do
				const calls = raw ? 20 : 2000;
				for (let i = 0; i < calls; i++) hot = %StringIsFlat(run()) && hot;
				flat[id] = { raw, cold, optimised, hot };
			}
			console.log(JSON.stringify({ flat, sink: read_html_sink() }));
		`;
		const run = run_node('--allow-natives-syntax', '--input-type=module', '-e', script);
		assert.strictEqual(run.status, 0, run.stderr);
		const {
			flat,
			sink
		}: {
			flat: Record<string, { raw: boolean; cold: boolean; optimised: boolean; hot: boolean }>;
			sink: number;
		} = JSON.parse(run.stdout);
		assert.deepStrictEqual(
			Object.keys(flat),
			ADAPTERS.map((a) => a.id)
		);
		for (const [id, { cold, optimised, hot }] of Object.entries(flat)) {
			assert.ok(cold, `${id} cold`);
			assert.ok(optimised, `${id} optimised`);
			assert.ok(hot, `${id} after many calls`);
		}
		// the case this guards is real: at least one library returns a rope
		assert.ok(Object.values(flat).some(({ raw }) => !raw));
		// and every read reached the sink
		assert.ok(sink > 0);
	});

	test('importing the corpus commands does nothing', () => {
		const run = run_node(
			'--input-type=module',
			'-e',
			"await import('./bench/corpus_manifest.ts'); await import('./bench/corpus_harvest_svelte.ts');"
		);
		assert.strictEqual(run.status, 0, run.stderr);
		assert.strictEqual(run.stdout, '');
	});

	test('bench/corpus_harvest_svelte.ts does not take a flag as its directory', () => {
		for (const args of [['--repos', '--check'], ['--check']]) {
			const run = run_node('bench/corpus_harvest_svelte.ts', ...args);
			assert.strictEqual(run.status, 2, args.join(' '));
			assert.match(run.stderr, /usage:/);
		}
	});
});
