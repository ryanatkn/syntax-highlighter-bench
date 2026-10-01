import { assert, describe, test } from 'vitest';

import { BenchAnchor } from '$lib/results_schema.ts';
import {
	ANCHOR_STABLE_BELOW,
	measure_anchor,
	run_anchor_workload,
	to_anchor_drift
} from '../../../bench/anchor.ts';

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
		assert.deepStrictEqual(to_anchor_drift(1000, 1010), { drift: 0.01, stable: true });
		assert.deepStrictEqual(to_anchor_drift(1000, 990), { drift: -0.01, stable: true });
		assert.deepStrictEqual(to_anchor_drift(1000, 1000), { drift: 0, stable: true });
	});

	test('a run is stable while the drift stays under the threshold, either way', () => {
		const just_under = ANCHOR_STABLE_BELOW - 0.001;
		assert.ok(to_anchor_drift(1000, 1000 * (1 + just_under)).stable);
		assert.ok(to_anchor_drift(1000, 1000 * (1 - just_under)).stable);
		assert.ok(!to_anchor_drift(1000, 1000 * (1 + ANCHOR_STABLE_BELOW)).stable);
		assert.ok(!to_anchor_drift(1000, 1000 * (1 - ANCHOR_STABLE_BELOW)).stable);
		assert.ok(!to_anchor_drift(1000, 1700).stable);
	});

	test('is the shape a results file carries', () => {
		BenchAnchor.parse(to_anchor_drift(1234, 1250));
	});
});
