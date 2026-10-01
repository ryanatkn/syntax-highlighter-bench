import { readFileSync } from 'node:fs';

import { parse_bench_results, type BenchResults } from '$lib/results_schema.ts';

const fixture_text = readFileSync(
	new URL('./fixtures/results/fixture_run.json', import.meta.url),
	'utf8'
);
const deterministic_text = readFileSync(
	new URL('../../results/deterministic.json', import.meta.url),
	'utf8'
);

/** A fresh, mutable copy of the fixture run's JSON: a complete timed run with invented numbers. */
export const load_fixture_json = (): BenchResults => JSON.parse(fixture_text);

/** A fresh, mutable copy of the committed deterministic results' JSON. */
export const load_deterministic_json = (): BenchResults => JSON.parse(deterministic_text);

/** The fixture run, validated. */
export const load_fixture = (): BenchResults => parse_bench_results(load_fixture_json());

/** The committed deterministic results, validated. */
export const load_deterministic = (): BenchResults =>
	parse_bench_results(load_deterministic_json());

/** The ids of a results file's libraries, in roster order. */
export const to_library_ids = (results: BenchResults): Array<string> =>
	results.meta.libraries.map((library) => library.id);

/** Marks a run as a smoke run, which is neither retried nor resumed nor carries a floor. */
export const to_smoke = (data: BenchResults): BenchResults => {
	const run = data.meta.run!;
	run.kind = 'smoke';
	run.retries = 0;
	run.segments = 1;
	data.meta.noise_floor = null;
	for (const cell of data.cells) {
		for (const value of Object.values(cell.values)) value.attempts = 1;
	}
	return data;
};

/** Marks a run as a calibration, which measures no cold start. */
export const to_calibration = (data: BenchResults): BenchResults => {
	const run = data.meta.run!;
	run.kind = 'calibrate';
	run.startup_samples = run.startup_discard = run.startup_compile_cache = null;
	data.startup = [];
	data.meta.startup_excluded = [];
	return data;
};

/**
 * A run with everything timed removed: the deterministic-only file that
 * describes the same libraries, corpus, and deterministic numbers as the run.
 */
export const to_deterministic_only = (data: BenchResults): BenchResults => {
	for (const cell of data.cells) cell.values = {};
	data.startup = [];
	Object.assign(data.meta, {
		generated_at: null,
		machine: null,
		node: null,
		commit: null,
		run: null,
		anchor: null,
		noise_floor: null,
		startup_excluded: []
	});
	return data;
};
