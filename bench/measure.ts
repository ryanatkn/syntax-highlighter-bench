/**
 * The timing engine: one library measured on one input, in a process that holds
 * nothing else.
 *
 * The method is adapted from the comparison harness of Twinkleplop
 * (https://github.com/pngwn/twinkleplop, MIT), and each part answers a way a
 * naive loop goes wrong:
 *
 * - **Iterations calibrated to the library.** Speeds differ by orders of
 *   magnitude, so a batch makes the number of calls that fills the target
 *   duration, at least a few while they fit a cap, and one when a call is too
 *   long for that.
 * - **An untimed rewarm and a minor collection before every timed batch.** The
 *   rewarm runs the library back to speed after whatever the last batch left (a
 *   collection, natural or not, can leave code cold), and the minor collection
 *   empties the young generation the rewarm filled, so the scavenge it would
 *   cause doesn't land inside the batch. A library whose one call already
 *   outlasts the rewarm gets none: the batch before keeps it warm, and a rewarm
 *   would only repeat that call. No full collection is forced: one
 *   between rounds puts some libraries through a race every round. A forced
 *   full collection discards optimized code whose hidden classes only per-call
 *   objects hold, so the library re-optimizes inside the clock, and it re-rolls
 *   how memory the library allocates outside the heap is reused, so a process
 *   settles at one of two speeds per round. A minor collection does neither.
 * - **Results are kept.** A batch keeps its last result, and that result is
 *   counted after the clock stops, so the engine can't drop the work and a
 *   library that silently stops early fails the cell instead of looking fast.
 *
 * Node-only: the default `MeasureDeps` read the process's clock.
 *
 * @module
 */

import { stats_median, stats_percentile, stats_spread } from '@fuzdev/fuz_util/stats.js';

import type { BenchCellValue } from '../src/lib/results_schema.ts';

const NS_PER_MS = 1e6;

/**
 * The fewest calls a batch makes when it can afford them. A short batch is
 * fragile: one pause lands on half of a two-call batch.
 */
export const MIN_ITERATIONS = 4;

/**
 * How long `MIN_ITERATIONS` may stretch a batch, in milliseconds. A call that
 * already runs this long has averaged over more work than any one pause adds, so
 * it is measured once per batch.
 */
export const MAX_MEASUREMENT_MS = 150;

/** The most calls a batch makes. */
export const MAX_ITERATIONS = 20_000_000;

/** The batch length, in milliseconds, at which a calibration probe is trusted. */
const PROBE_MS = 2;

/** The most calls a warmup makes, whatever its duration. */
const MAX_WARMUP_CALLS = 5_000_000;

/** What the engine reads from the process, injectable so tests are deterministic. */
export interface MeasureDeps {
	/** A monotonic clock, in nanoseconds. */
	now: () => bigint;
	/** Forces a minor collection: the young generation only. */
	collect_minor: () => void;
}

/**
 * Creates the deps of a real measurement.
 *
 * @throws if the process wasn't started with `--expose-gc`
 */
export const create_measure_deps = (): MeasureDeps => {
	const { gc } = globalThis;
	if (typeof gc !== 'function') {
		throw new Error('measuring needs forced collections: start the process with --expose-gc');
	}
	return {
		now: () => process.hrtime.bigint(),
		// without the option this would be a full collection
		collect_minor: () => gc({ type: 'minor' })
	};
};

/** The library's call, as the engine drives it. */
export interface MeasureCall {
	/** The timed call. */
	run: () => unknown;
	/** Sizes a result of `run`: its token count, or the bytes of its HTML. */
	count: (result: unknown) => number;
	/** What `count` must return for every batch. */
	expected: number;
}

/** How one process measures. */
export interface MeasureOptions {
	/** How many batches are timed. */
	rounds: number;
	/** How long one timed batch aims to run, in milliseconds. */
	target_ms: number;
	/** How long the library runs untimed before calibration, in milliseconds. */
	warmup_ms: number;
	/**
	 * How long the library runs untimed before each timed batch, in milliseconds;
	 * skipped when one call takes at least this long.
	 */
	rewarm_ms: number;
}

/** What one process measured. */
export interface Measurement {
	/** Calls per timed batch. */
	iterations: number;
	/** Nanoseconds per call, one per round. */
	ns_per_op: Array<number>;
}

/** One process's measurement of a library, with the process's peak resident size in bytes. */
export interface PassMeasurement extends Measurement {
	rss_peak_bytes: number;
}

/**
 * The calls per batch that fill the target duration.
 *
 * A batch has at least `MIN_ITERATIONS` calls where they fit in
 * `MAX_MEASUREMENT_MS`, fewer where they don't, and one when two calls no longer
 * fit.
 *
 * @param per_op_ns - an estimate of one call's duration, in nanoseconds
 * @param target_ms - how long a batch aims to run, in milliseconds
 */
export const to_iterations = (per_op_ns: number, target_ms: number): number => {
	if (!(per_op_ns > 0)) return MIN_ITERATIONS;
	const scaled = Math.max(1, Math.round((target_ms * NS_PER_MS) / per_op_ns));
	const affordable_floor = Math.max(
		1,
		Math.min(MIN_ITERATIONS, Math.floor((MAX_MEASUREMENT_MS * NS_PER_MS) / per_op_ns))
	);
	return Math.min(Math.max(scaled, affordable_floor), MAX_ITERATIONS);
};

/** Times `iterations` calls and keeps the last result, so the work can't be dropped. */
const time_batch = (
	run: () => unknown,
	iterations: number,
	now: () => bigint
): { ns: number; last: unknown } => {
	let last: unknown;
	const start = now();
	for (let i = 0; i < iterations; i++) last = run();
	const ns = Number(now() - start);
	return { ns, last };
};

/** Runs untimed for a duration, at least once, and returns the mean nanoseconds per call. */
const run_for = (run: () => unknown, ms: number, now: () => bigint): number => {
	const start = now();
	const deadline = start + BigInt(Math.round(ms * NS_PER_MS));
	let calls = 0;
	let end: bigint;
	do {
		run();
		calls++;
		end = now();
	} while (end < deadline && calls < MAX_WARMUP_CALLS);
	return Number(end - start) / calls;
};

/**
 * Estimates one call's duration from batches that grow until one is long enough
 * to trust.
 */
const probe_per_op_ns = (run: () => unknown, target_ms: number, now: () => bigint): number => {
	const trusted_ns = Math.min(PROBE_MS, target_ms) * NS_PER_MS;
	let iterations = 1;
	for (;;) {
		const { ns } = time_batch(run, iterations, now);
		if (ns >= trusted_ns || iterations * 4 > MAX_ITERATIONS) return ns / iterations;
		iterations *= 4;
	}
};

/**
 * Measures one library's call.
 *
 * @param call - the call, how to size its result, and the size it must have
 * @param options - rounds and durations
 * @param deps - the process's clock and collector
 * @throws if a batch's result isn't the size the call expects, since a library
 * that stopped early must not be averaged in
 */
export const measure_call = (
	call: MeasureCall,
	options: MeasureOptions,
	deps: MeasureDeps
): Measurement => {
	const { rounds, target_ms, warmup_ms, rewarm_ms } = options;
	const { now, collect_minor } = deps;

	// a library that isn't warm measures the optimizer
	const warm_ns = run_for(call.run, warmup_ms, now);
	// when one call already exceeds the target, probing would only repeat a slow call
	const per_op_ns =
		warm_ns >= target_ms * NS_PER_MS ? warm_ns : probe_per_op_ns(call.run, target_ms, now);
	const iterations = to_iterations(per_op_ns, target_ms);

	// a call that outlasts the rewarm is kept warm by the batch before it, so a rewarm would only
	// repeat it
	const rewarm = rewarm_ms > 0 && per_op_ns < rewarm_ms * NS_PER_MS;
	const ns_per_op: Array<number> = [];
	for (let round = 0; round < rounds; round++) {
		if (rewarm) run_for(call.run, rewarm_ms, now);
		collect_minor();
		const { ns, last } = time_batch(call.run, iterations, now);
		ns_per_op.push(ns / iterations);
		const counted = call.count(last);
		if (counted !== call.expected) {
			throw new Error(
				`a result of size ${counted} in round ${round + 1}, not the ${call.expected} it was checked with: the output is not stable, so it can't be timed`
			);
		}
	}
	return { iterations, ns_per_op };
};

/** The numbers of one attempt at a cell: a cell's value without its count of attempts. */
export type PassSummary = Omit<BenchCellValue, 'attempts'>;

/**
 * Reduces a library's passes on one cell to the numbers a results cell carries.
 * The rounds of every pass are pooled, so `spread` and the percentiles cover the
 * disagreement between processes as well as between rounds. `pass_medians_ns`
 * keeps each pass's own median, in the order given, so the disagreement between
 * processes can be read apart from the rounds.
 *
 * @param passes - what each process measured
 * @param bytes - the size of the input, for throughput
 */
export const summarize_passes = (
	passes: ReadonlyArray<PassMeasurement>,
	bytes: number
): PassSummary => {
	const samples = passes.flatMap((pass) => pass.ns_per_op);
	const median = stats_median(samples);
	return {
		ns_per_op: median,
		ops_per_sec: 1e9 / median,
		mb_per_sec: bytes / 1e6 / (median / 1e9),
		p10_ns: stats_percentile(samples, 0.1),
		p90_ns: stats_percentile(samples, 0.9),
		spread: stats_spread(samples),
		pass_medians_ns: passes.map((pass) => stats_median(pass.ns_per_op)),
		// each process calibrates for itself, so the counts can differ a little
		iterations: Math.round(stats_median(passes.map((pass) => pass.iterations))),
		rss_peak_bytes: Math.max(...passes.map((pass) => pass.rss_peak_bytes))
	};
};
