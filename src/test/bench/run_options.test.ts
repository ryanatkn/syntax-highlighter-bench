import { assert, describe, test } from 'vitest';
import { join } from 'node:path';

import { BenchRunFilters, bench_run_is_complete } from '$lib/results_schema.ts';
import type { HighlighterAdapter } from '../../../bench/adapter.ts';
import { load_corpus_manifest } from '../../../bench/corpus.ts';
import { TIMED_LANGS, type Lang } from '../../../bench/langs.ts';
import { ADAPTERS } from '../../../bench/libraries.ts';
import {
	FULL_PARAMS,
	RUN_FLAGS,
	SMOKE_PARAMS,
	format_run_help,
	parse_run_args,
	plan_cells,
	plan_processes,
	to_calibration_path,
	to_machine_name,
	to_results_path,
	type RunOptions
} from '../../../bench/run_options.ts';

const NO_FILTERS: BenchRunFilters = {
	libraries: null,
	langs: null,
	sizes: null,
	modes: null,
	sources: null
};

const parse = (...args: Array<string>): RunOptions => {
	const parsed = parse_run_args(args, ADAPTERS);
	assert.ok(parsed.ok, parsed.ok ? '' : parsed.message);
	assert.ok(!parsed.help);
	return parsed.options;
};

const assert_usage_error = (args: Array<string>, expected: RegExp): void => {
	const parsed = parse_run_args(args, ADAPTERS);
	assert.ok(!parsed.ok, `expected ${args.join(' ')} to be refused`);
	assert.match(parsed.message, expected);
};

describe('parse_run_args', () => {
	test('no flags is a full run of everything', () => {
		assert.deepStrictEqual(parse(), {
			kind: 'full',
			filters: NO_FILTERS,
			...FULL_PARAMS,
			machine: null,
			out: null
		});
	});

	test('--smoke is one round with the shortest durations', () => {
		const options = parse('--smoke');
		assert.strictEqual(options.kind, 'smoke');
		assert.strictEqual(options.rounds, 1);
		assert.strictEqual(options.passes, 1);
		assert.strictEqual(options.rounds, SMOKE_PARAMS.rounds);
		assert.strictEqual(options.target_ms, SMOKE_PARAMS.target_ms);
		assert.ok(SMOKE_PARAMS.target_ms < FULL_PARAMS.target_ms);
		// a smoke run still warms and rewarms, so it takes every step of the method
		assert.ok(options.warmup_ms > 0 && options.rewarm_ms > 0);
		assert.deepStrictEqual(options.filters, NO_FILTERS);
	});

	test('--calibrate measures with the parameters of a full run', () => {
		const options = parse('--calibrate');
		assert.strictEqual(options.kind, 'calibrate');
		assert.deepStrictEqual({ ...options, kind: 'full' }, parse());
	});

	test('a full run measures each library in more than one process', () => {
		assert.ok(FULL_PARAMS.passes >= 2);
	});

	test('filters are validated lists, kept in roster order', () => {
		const options = parse(
			'--libraries',
			'prism,fuz_code',
			'--langs',
			'rust, ts',
			'--sizes',
			'large,micro',
			'--modes',
			'html',
			'--sources',
			'home,neutral'
		);
		assert.deepStrictEqual(options.filters, {
			libraries: ['fuz_code', 'prism'],
			langs: ['ts', 'rust'],
			sizes: ['micro', 'large'],
			modes: ['html'],
			sources: ['neutral', 'home']
		});
		BenchRunFilters.parse(options.filters);
	});

	test('a repeated id counts once', () => {
		assert.deepStrictEqual(parse('--langs', 'ts,ts').filters.langs, ['ts']);
	});

	test('an unknown id is a usage error that lists the known ones', () => {
		assert_usage_error(
			['--libraries', 'fuz_code,highlight_js'],
			/--libraries: unknown "highlight_js".*fuz_code/
		);
		assert_usage_error(['--langs', 'tsx'], /--langs: unknown "tsx"/);
		assert_usage_error(['--sizes', 'huge'], /--sizes: unknown "huge".*micro, small, medium, large/);
		assert_usage_error(['--modes', 'render'], /--modes: unknown "render"/);
		assert_usage_error(['--sources', 'mine'], /--sources: unknown "mine"/);
		assert_usage_error(['--langs', ''], /--langs: unknown ""/);
		assert_usage_error(['--langs', 'ts,'], /--langs: unknown ""/);
	});

	test('an untimed language is refused, since no cell covers it', () => {
		assert_usage_error(['--langs', 'xml'], /xml is not timed/);
		assert_usage_error(['--langs', 'ts,xml'], /xml is not timed/);
	});

	test('an unknown flag is a usage error', () => {
		assert_usage_error(['--bogus'], /unknown argument "--bogus"/);
		assert_usage_error(['smoke'], /unknown argument "smoke"/);
		assert_usage_error(['--langs=ts'], /unknown argument "--langs=ts"/);
		assert_usage_error(['--smoke', '--langs', 'ts', 'extra'], /unknown argument "extra"/);
	});

	test('a flag that takes a value needs one', () => {
		assert_usage_error(['--langs'], /--langs needs <ids>/);
		assert_usage_error(['--langs', '--smoke'], /--langs needs <ids>/);
		assert_usage_error(['--out'], /--out needs <path>/);
	});

	test('a flag given twice is refused', () => {
		assert_usage_error(['--langs', 'ts', '--langs', 'js'], /--langs is given twice/);
		assert_usage_error(['--smoke', '--smoke'], /--smoke is given twice/);
	});

	test('--smoke and --calibrate are different kinds of run', () => {
		assert_usage_error(['--smoke', '--calibrate'], /different kinds of run/);
	});

	test('--passes, --rounds, and --target-ms override a full run, as positive whole numbers', () => {
		const options = parse('--passes', '2', '--rounds', '5', '--target-ms', '12');
		assert.strictEqual(options.passes, 2);
		assert.strictEqual(options.rounds, 5);
		assert.strictEqual(options.target_ms, 12);
		assert.strictEqual(options.warmup_ms, FULL_PARAMS.warmup_ms);
		for (const flag of ['--passes', '--rounds', '--target-ms']) {
			for (const value of ['0', '-1', '2.5', '1e3', '0x10', ' 5', '5ms', 'many']) {
				assert_usage_error([flag, value], new RegExp(`${flag}: .* is not a positive whole number`));
			}
		}
		assert.strictEqual(parse('--calibrate', '--rounds', '9').rounds, 9);
	});

	test('--smoke sets its own parameters', () => {
		for (const flag of ['--passes', '--rounds', '--target-ms']) {
			assert_usage_error(['--smoke', flag, '3'], /--smoke sets its own/);
		}
	});

	test('--machine is a name usable in a file name', () => {
		assert.strictEqual(parse('--machine', 'bare-metal_5800x.1').machine, 'bare-metal_5800x.1');
		for (const name of ['../up', 'a/b', 'has space', '.hidden', '']) {
			assert_usage_error(['--machine', name], /--machine: .* is part of a file name/);
		}
	});

	test('--out is kept as given', () => {
		assert.strictEqual(parse('--out', 'somewhere/run.json').out, 'somewhere/run.json');
	});

	test('--help wins over everything valid', () => {
		assert.deepStrictEqual(parse_run_args(['--smoke', '--help'], ADAPTERS), {
			ok: true,
			help: true
		});
		assert_usage_error(['--help', '--bogus'], /unknown argument/);
	});

	test('the help names every flag', () => {
		const help = format_run_help();
		for (const { flag } of RUN_FLAGS) assert.ok(help.includes(flag), flag);
	});
});

describe('bench_run_is_complete', () => {
	test('a full run or a calibration is complete only with no filter at all', () => {
		for (const kind of ['full', 'calibrate'] as const) {
			assert.ok(bench_run_is_complete({ kind, filters: NO_FILTERS }));
			for (const filters of [
				{ ...NO_FILTERS, libraries: ['prism'] },
				{ ...NO_FILTERS, langs: ['ts'] },
				{ ...NO_FILTERS, sizes: ['micro' as const] },
				{ ...NO_FILTERS, modes: ['html' as const] },
				{ ...NO_FILTERS, sources: ['neutral' as const] }
			]) {
				assert.ok(!bench_run_is_complete({ kind, filters }));
			}
		}
	});

	test('a smoke run never is', () => {
		assert.ok(!bench_run_is_complete({ kind: 'smoke', filters: NO_FILTERS }));
	});
});

describe('to_results_path', () => {
	const run = { machine: 'box', generated_at: '2026-03-04T23:59:59.000Z' };

	test('a complete full run is named by its date and machine', () => {
		assert.strictEqual(
			to_results_path({ ...run, kind: 'full', filters: NO_FILTERS }, '/r'),
			join('/r', '2026-03-04_box.json')
		);
	});

	test('a complete calibration is where a full run looks for it', () => {
		const path = to_results_path({ ...run, kind: 'calibrate', filters: NO_FILTERS }, '/r');
		assert.strictEqual(path, join('/r', 'calibration_box.json'));
		assert.strictEqual(path, to_calibration_path('box', '/r'));
	});

	test('a smoke or filtered run goes to the scratch directory, named by its kind', () => {
		assert.strictEqual(
			to_results_path({ ...run, kind: 'smoke', filters: NO_FILTERS }, '/r'),
			join('/r', 'scratch', 'smoke_box.json')
		);
		const filters = { ...NO_FILTERS, langs: ['ts'] };
		assert.strictEqual(
			to_results_path({ ...run, kind: 'full', filters }, '/r'),
			join('/r', 'scratch', 'full_box.json')
		);
		assert.strictEqual(
			to_results_path({ ...run, kind: 'calibrate', filters }, '/r'),
			join('/r', 'scratch', 'calibrate_box.json')
		);
		// a calibration of fewer libraries is filtered too
		assert.strictEqual(
			to_results_path(
				{ ...run, kind: 'calibrate', filters: { ...NO_FILTERS, libraries: ['prism'] } },
				'/r'
			),
			join('/r', 'scratch', 'calibrate_box.json')
		);
	});
});

describe('to_machine_name', () => {
	test('keeps a plain hostname and replaces what a file name can not hold', () => {
		assert.strictEqual(to_machine_name('box'), 'box');
		assert.strictEqual(to_machine_name('my box.local'), 'my_box.local');
		assert.strictEqual(to_machine_name('..//x'), 'x');
		assert.strictEqual(to_machine_name(''), 'machine');
		for (const hostname of ['box', 'my box.local', '..//x', '']) {
			const parsed = parse_run_args(['--machine', to_machine_name(hostname)], ADAPTERS);
			assert.ok(parsed.ok);
		}
	});
});

describe('plan_cells', () => {
	const { inputs } = load_corpus_manifest();
	const timed_inputs = inputs.filter((i) => (TIMED_LANGS as ReadonlyArray<Lang>).includes(i.lang));

	test('every input of a timed language in every mode, and nothing untimed', () => {
		const cells = plan_cells(inputs, NO_FILTERS, ADAPTERS);
		assert.strictEqual(cells.length, timed_inputs.length * 2);
		assert.ok(inputs.some((i) => i.lang === 'xml'));
		assert.ok(cells.every((cell) => cell.input.lang !== 'xml'));
		assert.strictEqual(new Set(cells.map((cell) => cell.id)).size, cells.length);
		for (const cell of cells) {
			assert.strictEqual(cell.id, `${cell.input.file}:${cell.mode}`);
			assert.deepStrictEqual(
				cell.libraries,
				ADAPTERS.map((a) => a.id)
			);
		}
	});

	test("an input's modes are together, tokenize first", () => {
		const cells = plan_cells(inputs, NO_FILTERS, ADAPTERS);
		for (let i = 0; i < cells.length; i += 2) {
			assert.strictEqual(cells[i]!.input, cells[i + 1]!.input);
			assert.deepStrictEqual([cells[i]!.mode, cells[i + 1]!.mode], ['tokenize', 'html']);
		}
	});

	test('filters narrow each axis', () => {
		const cells = plan_cells(
			inputs,
			{
				libraries: ['fuz_code', 'prism'],
				langs: ['ts', 'rust'],
				sizes: ['small'],
				modes: ['html'],
				sources: ['neutral']
			},
			ADAPTERS
		);
		assert.deepStrictEqual(
			cells.map((cell) => cell.id).toSorted(),
			timed_inputs
				.filter(
					(i) => ['ts', 'rust'].includes(i.lang) && i.size === 'small' && i.source === 'neutral'
				)
				.map((i) => `${i.file}:html`)
				.toSorted()
		);
		assert.ok(cells.length > 0);
		for (const cell of cells) assert.deepStrictEqual(cell.libraries, ['fuz_code', 'prism']);
	});

	test('a library that does not claim a language is left out of its cells: unsupported', () => {
		const without_rust = (adapter: HighlighterAdapter): HighlighterAdapter => {
			const { rust: _, ...langs } = adapter.langs;
			return { ...adapter, langs };
		};
		const adapters = ADAPTERS.map((a) => (a.id === 'prism' ? without_rust(a) : a));
		const cells = plan_cells(inputs, NO_FILTERS, adapters);
		for (const cell of cells) {
			assert.strictEqual(cell.libraries.includes('prism'), cell.input.lang !== 'rust', cell.id);
		}
		// and a cell no selected library claims is not planned
		const only_prism = plan_cells(inputs, { ...NO_FILTERS, libraries: ['prism'] }, adapters);
		assert.ok(only_prism.length > 0);
		assert.ok(only_prism.every((cell) => cell.input.lang !== 'rust'));
	});

	test('rotation differs between the modes of an input and between neighbouring inputs', () => {
		// what the starting library of a cell's first pass advances by
		const cells = plan_cells(inputs, NO_FILTERS, ADAPTERS);
		for (let i = 0; i < cells.length - 2; i += 2) {
			assert.strictEqual(cells[i + 1]!.rotation, cells[i]!.rotation + 1);
			assert.strictEqual(cells[i + 2]!.rotation, cells[i]!.rotation + 1);
		}
		// with one mode it still advances with the input
		const one_mode = plan_cells(inputs, { ...NO_FILTERS, modes: ['html'] }, ADAPTERS);
		assert.deepStrictEqual(
			one_mode.map((cell) => cell.rotation),
			one_mode.map((_, i) => i)
		);
	});

	test('no cell when nothing matches', () => {
		const cells = plan_cells(
			inputs,
			{ ...NO_FILTERS, sizes: ['large'], sources: ['harness'] },
			ADAPTERS
		);
		assert.deepStrictEqual(cells, []);
	});
});

describe('plan_processes', () => {
	const { inputs } = load_corpus_manifest();
	const cells = plan_cells(inputs, { ...NO_FILTERS, langs: ['ts'], sizes: ['small'] }, ADAPTERS);
	const ids = ADAPTERS.map((a) => a.id);

	test('every library gets one process in every pass of every cell', () => {
		const processes = plan_processes(cells, 3);
		assert.strictEqual(processes.length, cells.length * 3 * ids.length);
		for (const cell of cells) {
			for (let pass = 0; pass < 3; pass++) {
				const libraries = processes
					.filter((p) => p.cell === cell && p.pass === pass)
					.map((p) => p.library);
				assert.deepStrictEqual(libraries.toSorted(), ids.toSorted());
			}
		}
	});

	test('a cell is finished before the next starts, pass by pass', () => {
		const processes = plan_processes(cells, 2);
		const per_pass = ids.length;
		for (const [i, planned] of processes.entries()) {
			assert.strictEqual(planned.cell, cells[Math.floor(i / (2 * per_pass))]);
			assert.strictEqual(planned.pass, Math.floor(i / per_pass) % 2);
		}
	});

	test('the library a pass starts with rotates from pass to pass and cell to cell', () => {
		const processes = plan_processes(cells, ids.length);
		const first_of = (cell: (typeof cells)[number], pass: number): string =>
			processes.find((p) => p.cell === cell && p.pass === pass)!.library;
		// across the passes of one cell, every library goes first once
		assert.deepStrictEqual(
			ids.map((_id, pass) => first_of(cells[0]!, pass)).toSorted(),
			ids.toSorted()
		);
		// and the first pass of the next input starts one library later
		const next_input = cells.find((cell) => cell.input !== cells[0]!.input)!;
		assert.notStrictEqual(first_of(next_input, 0), first_of(cells[0]!, 0));
		// the order within a pass is the roster's, rotated
		const pass = processes.filter((p) => p.cell === cells[0] && p.pass === 1).map((p) => p.library);
		const start = ids.indexOf(pass[0]!);
		assert.deepStrictEqual(pass, [...ids.slice(start), ...ids.slice(0, start)]);
	});
});
