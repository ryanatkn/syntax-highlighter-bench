import { assert, describe, test } from 'vitest';
import * as s from '@fuzdev/fuz_schema/schema.ts';

import { BENCH_ANCHOR_STABLE_BELOW, BenchAnchor } from '#lib/results_schema.ts';
import { measure_anchor, run_anchor_workload, to_anchor_drift } from '../../../bench/anchor.ts';

describe('the anchor workload', () => {
	test('is deterministic', () => {
		const checksum = run_anchor_workload();
		assert.ok(Number.isInteger(checksum));
		assert.strictEqual(run_anchor_workload(), checksum);
	});

	test('measures as a positive time', () => {
		const ns = measure_anchor();
		assert.ok(Number.isFinite(ns) && ns > 0);
	});
});

describe('to_anchor_drift', () => {
	test('drift is the relative change, positive when the machine got slower', () => {
		assert.deepStrictEqual(to_anchor_drift([1000, 1010]), { drift: 0.01, stable: true });
		assert.deepStrictEqual(to_anchor_drift([1000, 990]), { drift: -0.01, stable: true });
		assert.deepStrictEqual(to_anchor_drift([1000, 1000]), { drift: 0, stable: true });
	});

	test('a run is stable while the drift stays under the threshold, either way', () => {
		const just_under = BENCH_ANCHOR_STABLE_BELOW - 0.001;
		assert.ok(to_anchor_drift([1000, 1000 * (1 + just_under)]).stable);
		assert.ok(to_anchor_drift([1000, 1000 * (1 - just_under)]).stable);
		assert.ok(!to_anchor_drift([1000, 1000 * (1 + BENCH_ANCHOR_STABLE_BELOW)]).stable);
		assert.ok(!to_anchor_drift([1000, 1000 * (1 - BENCH_ANCHOR_STABLE_BELOW)]).stable);
		assert.ok(!to_anchor_drift([1000, 1700]).stable);
	});

	test('with more than two readings it is the two that differ most, earlier to later', () => {
		// the ends agree, and the middle shows the machine changed state
		assert.deepStrictEqual(to_anchor_drift([1000, 1100, 1000]), { drift: 0.1, stable: false });
		// each neighbor is under the threshold, and the whole is not
		const anchor = to_anchor_drift([1000, 980, 1010]);
		assert.closeTo(anchor.drift, 30 / 980, 1e-12);
		assert.ok(!anchor.stable);
		// faster later is negative
		assert.strictEqual(to_anchor_drift([1000, 1010, 900]).drift, (900 - 1010) / 1010);
		assert.ok(to_anchor_drift([1000, 1001, 999, 1002]).stable);
	});

	test('needs a reading at each end', () => {
		assert.throws(() => to_anchor_drift([1000]), /a reading at each end/);
	});

	test('is the shape a results file carries', () => {
		s.parse_or_throw(BenchAnchor, to_anchor_drift([1234, 1250]));
	});
});
