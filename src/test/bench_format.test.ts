import { assert, describe, test } from 'vitest';

import {
	format_bytes,
	format_date,
	format_hash,
	format_ms,
	format_ns,
	format_percent,
	format_ratio,
	format_significant
} from '$lib/bench_format.ts';

describe('formatters', () => {
	test('format_significant keeps about three digits', () => {
		assert.strictEqual(format_significant(1.234), '1.23');
		assert.strictEqual(format_significant(9.999), '10.0');
		assert.strictEqual(format_significant(12.34), '12.3');
		assert.strictEqual(format_significant(99.96), '100');
		assert.strictEqual(format_significant(1234.5), '1,235');
	});

	test('format_bytes uses decimal units and never prints four digits before a unit change', () => {
		assert.strictEqual(format_bytes(0), '0 B');
		assert.strictEqual(format_bytes(999), '999 B');
		assert.strictEqual(format_bytes(1000), '1.00 kB');
		assert.strictEqual(format_bytes(999_499), '999 kB');
		assert.strictEqual(format_bytes(999_500), '1.00 MB');
		assert.strictEqual(format_bytes(466_610), '467 kB');
		assert.strictEqual(format_bytes(-1500), '-1.50 kB');
	});

	test('format_ns picks the unit', () => {
		assert.strictEqual(format_ns(12), '12 ns');
		assert.strictEqual(format_ns(1500), '1.50 µs');
		assert.strictEqual(format_ns(2_580_480), '2.58 ms');
		assert.strictEqual(format_ns(1_500_000_000), '1.50 s');
	});

	test('format_ms, format_ratio, and format_percent', () => {
		assert.strictEqual(format_ms(23.4), '23.4 ms');
		assert.strictEqual(format_ratio(1), '1.00×');
		assert.strictEqual(format_ratio(14.04), '14.0×');
		assert.strictEqual(format_ratio(140.4), '140×');
		assert.strictEqual(format_percent(0.033), '3.3%');
	});

	test('format_date is the UTC date, whatever zone the build machine is in', () => {
		assert.strictEqual(format_date('2026-01-01T00:00:00.000Z'), '2026-01-01');
		assert.strictEqual(format_date('2026-01-01T23:59:59.000Z'), '2026-01-01');
	});

	test('format_hash shortens and keeps a dirty marker', () => {
		assert.strictEqual(format_hash('0123456789abcdef0123456789abcdef01234567'), '0123456789');
		assert.strictEqual(
			format_hash('0123456789abcdef0123456789abcdef01234567-dirty'),
			'0123456789-dirty'
		);
	});
});
