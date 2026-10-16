import { assert, describe, test } from 'vitest';
import * as s from '@fuzdev/fuz_schema/schema.ts';

import { BenchCellValue } from '#lib/results_schema.ts';
import {
	MAX_ITERATIONS,
	MAX_MEASUREMENT_MS,
	MIN_ITERATIONS,
	create_measure_deps,
	measure_call,
	summarize_passes,
	to_iterations,
	type MeasureCall,
	type MeasureDeps,
	type MeasureOptions
} from '../../../bench/measure.ts';

const NS_PER_MS = 1e6;

/**
 * A process whose clock only moves when the call runs, so a measurement is the
 * same every time. `log` records each collection, and each stretch of calls as
 * its length.
 */
const create_fake = (
	ns_per_call: number,
	expected = 3
): { deps: MeasureDeps; call: MeasureCall; log: Array<string | number>; calls: () => number } => {
	let clock = 0n;
	let calls = 0;
	const log: Array<string | number> = [];
	return {
		log,
		calls: () => calls,
		deps: {
			now: () => clock,
			collect_minor: () => {
				log.push('minor');
			}
		},
		call: {
			run: () => {
				clock += BigInt(ns_per_call);
				calls++;
				const last = log.at(-1);
				if (typeof last === 'number') log[log.length - 1] = last + 1;
				else log.push(1);
				return expected;
			},
			count: (result) => result as number,
			expected
		}
	};
};

const OPTIONS: MeasureOptions = { rounds: 3, target_ms: 20, warmup_ms: 100, rewarm_ms: 100 };

describe('to_iterations', () => {
	test('fills the target duration', () => {
		assert.strictEqual(to_iterations(1000, 20), 20_000);
		assert.strictEqual(to_iterations(0.5 * NS_PER_MS, 20), 40);
	});

	test('pads a short batch up to the minimum while it is affordable', () => {
		// 10ms a call: two calls fill the target, and four still fit the cap
		assert.strictEqual(to_iterations(10 * NS_PER_MS, 20), MIN_ITERATIONS);
		// 60ms a call: only two fit the cap
		assert.strictEqual(to_iterations(60 * NS_PER_MS, 20), 2);
		assert.ok(2 * 60 <= MAX_MEASUREMENT_MS && 3 * 60 > MAX_MEASUREMENT_MS);
	});

	test('one call that already exceeds the target is measured once', () => {
		assert.strictEqual(to_iterations(100 * NS_PER_MS, 20), 1);
		assert.strictEqual(to_iterations(1200 * NS_PER_MS, 20), 1);
		assert.strictEqual(to_iterations(1200 * NS_PER_MS, 1), 1);
	});

	test('is capped, and falls back when there is no estimate', () => {
		assert.strictEqual(to_iterations(0.0001, 20), MAX_ITERATIONS);
		assert.strictEqual(to_iterations(0, 20), MIN_ITERATIONS);
		assert.strictEqual(to_iterations(NaN, 20), MIN_ITERATIONS);
	});
});

describe('measure_call', () => {
	test('calibrates the batch to the target', () => {
		for (const [ns_per_call, iterations] of [
			[1000, 20_000],
			[0.5 * NS_PER_MS, 40],
			[300 * NS_PER_MS, 1]
		] as const) {
			const fake = create_fake(ns_per_call);
			const measured = measure_call(fake.call, OPTIONS, fake.deps);
			assert.strictEqual(measured.iterations, iterations);
			assert.deepStrictEqual(measured.ns_per_op, [ns_per_call, ns_per_call, ns_per_call]);
		}
	});

	test('before every timed batch: a rewarm and a minor collection, and never a full one', () => {
		const fake = create_fake(0.5 * NS_PER_MS);
		const { iterations } = measure_call(fake.call, { ...OPTIONS, rounds: 2 }, fake.deps);
		const rewarm_calls = OPTIONS.rewarm_ms / 0.5;
		// nothing is collected between a batch and the next rewarm, so the log joins them, and the
		// warmup and the calibration probes run straight into the first rewarm the same way
		const first = fake.log[0];
		assert.ok(typeof first === 'number' && first > rewarm_calls);
		assert.deepStrictEqual(fake.log.slice(1), [
			'minor',
			iterations + rewarm_calls,
			'minor',
			iterations
		]);
	});

	test('a slow library pays no call it does not need', () => {
		const fake = create_fake(1200 * NS_PER_MS);
		const measured = measure_call(fake.call, { ...OPTIONS, rounds: 2 }, fake.deps);
		assert.strictEqual(measured.iterations, 1);
		// the warmup showed one call exceeds the target, so there is no probe, and one call
		// outlasts the rewarm, so there is none: one warmup call, then a batch of one call a round
		assert.strictEqual(fake.calls(), 1 + 2);
		assert.deepStrictEqual(fake.log, [1, 'minor', 1, 'minor', 1]);
	});

	test('a call just shorter than the rewarm still gets one', () => {
		const fake = create_fake(OPTIONS.rewarm_ms * NS_PER_MS - 1);
		measure_call(fake.call, { ...OPTIONS, rounds: 2 }, fake.deps);
		// two warmup calls and a rewarm of two, then each batch of one joined with the next rewarm
		assert.deepStrictEqual(fake.log, [4, 'minor', 3, 'minor', 1]);
	});

	test('no rewarm when its duration is zero', () => {
		const fake = create_fake(1200 * NS_PER_MS);
		measure_call(fake.call, { ...OPTIONS, rounds: 2, rewarm_ms: 0 }, fake.deps);
		assert.strictEqual(fake.calls(), 1 + 2);
	});

	test('fails when a result changes size, instead of averaging it in', () => {
		const fake = create_fake(1000);
		let calls = 0;
		const truncating: MeasureCall = {
			run: () => {
				fake.call.run();
				// as a tokenizer that hits a time limit stops early, without throwing
				return ++calls > 150_000 ? 2 : 3;
			},
			count: (result) => result as number,
			expected: 3
		};
		assert.throws(
			() => measure_call(truncating, OPTIONS, fake.deps),
			/a result of size 2 in round 1, not the 3 it was checked with/
		);
	});

	test('counts the last result of each batch, outside the clock', () => {
		const fake = create_fake(1000);
		let counted = 0;
		const call: MeasureCall = {
			...fake.call,
			count: (result) => {
				counted++;
				return result as number;
			}
		};
		const measured = measure_call(call, OPTIONS, fake.deps);
		assert.strictEqual(counted, OPTIONS.rounds);
		assert.deepStrictEqual(measured.ns_per_op, [1000, 1000, 1000]);
	});
});

describe('summarize_passes', () => {
	test('pools the rounds of every pass', () => {
		const value = summarize_passes(
			[
				{ iterations: 50, ns_per_op: [1000, 1100], rss_peak_bytes: 100_000_000 },
				{ iterations: 52, ns_per_op: [900, 1200], rss_peak_bytes: 123_456_789 },
				{ iterations: 49, ns_per_op: [1050, 1060], rss_peak_bytes: 110_000_000 }
			],
			2000
		);
		// the median of all six rounds, not of one pass
		assert.strictEqual(value.ns_per_op, 1055);
		assert.strictEqual(value.ops_per_sec, 1e9 / 1055);
		// megabytes of input a second
		assert.closeTo(value.mb_per_sec, 2000 / 1e6 / (1055 / 1e9), 1e-9);
		// the spread covers the disagreement between passes
		assert.closeTo(value.spread, 1200 / 900, 1e-12);
		// and each pass keeps its own median, in order
		assert.deepStrictEqual(value.pass_medians_ns, [1050, 1050, 1055]);
		assert.ok(value.p10_ns >= 900 && value.p10_ns <= 1000);
		assert.ok(value.p90_ns >= 1100 && value.p90_ns <= 1200);
		// each pass calibrates for itself: the median count
		assert.strictEqual(value.iterations, 50);
		// the largest peak of any pass
		assert.strictEqual(value.rss_peak_bytes, 123_456_789);
		s.parse_or_throw(BenchCellValue, { ...value, attempts: 1 });
	});

	test('one round of one pass has no spread', () => {
		const value = summarize_passes(
			[{ iterations: 1, ns_per_op: [5000], rss_peak_bytes: 1024 }],
			100
		);
		assert.strictEqual(value.spread, 1);
		assert.strictEqual(value.p10_ns, 5000);
		assert.strictEqual(value.p90_ns, 5000);
		s.parse_or_throw(BenchCellValue, { ...value, attempts: 1 });
	});

	test('an even number of passes still records a whole count', () => {
		const value = summarize_passes(
			[
				{ iterations: 3, ns_per_op: [10], rss_peak_bytes: 1 },
				{ iterations: 4, ns_per_op: [10], rss_peak_bytes: 1 }
			],
			100
		);
		assert.ok(Number.isInteger(value.iterations));
		s.parse_or_throw(BenchCellValue, { ...value, attempts: 1 });
	});
});

describe('create_measure_deps', () => {
	test('refuses to measure without forced collections', () => {
		// the test process isn't started with --expose-gc, like a parent that forgot the flag
		assert.strictEqual(typeof globalThis.gc, 'undefined');
		assert.throws(() => create_measure_deps(), /--expose-gc/);
	});
});
