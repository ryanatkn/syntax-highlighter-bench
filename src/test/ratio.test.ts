import { assert, describe, test } from 'vitest';

import {
	RATIO_LEVEL_COLORS,
	RATIO_LEVEL_LIMITS,
	ratio_is_within_floor,
	to_bound_color,
	to_geomean,
	to_ratio,
	to_ratio_color,
	to_ratio_legend,
	to_ratio_level
} from '#lib/ratio.ts';

describe('to_ratio', () => {
	test('is how many times worse the value is, in either direction', () => {
		assert.strictEqual(to_ratio(200, 100, 'lower'), 2);
		assert.strictEqual(to_ratio(50, 100, 'higher'), 2);
		assert.strictEqual(to_ratio(100, 100, 'lower'), 1);
		assert.strictEqual(to_ratio(100, 100, 'higher'), 1);
	});

	test('is under 1 for a value better than the baseline', () => {
		assert.strictEqual(to_ratio(50, 100, 'lower'), 0.5);
		assert.strictEqual(to_ratio(200, 100, 'higher'), 0.5);
	});

	test('is null for a number a ratio can not be made from', () => {
		for (const bad of [0, -1, NaN, Infinity]) {
			assert.strictEqual(to_ratio(bad, 100, 'lower'), null, `value ${bad}`);
			assert.strictEqual(to_ratio(100, bad, 'higher'), null, `baseline ${bad}`);
		}
	});
});

describe('the color scale', () => {
	test('has a color for every level', () => {
		assert.strictEqual(RATIO_LEVEL_COLORS.length, RATIO_LEVEL_LIMITS.length + 1);
		assert.strictEqual(new Set(RATIO_LEVEL_COLORS).size, RATIO_LEVEL_COLORS.length);
	});

	test('its limits ascend', () => {
		for (let i = 1; i < RATIO_LEVEL_LIMITS.length; i++) {
			assert.ok(RATIO_LEVEL_LIMITS[i]! > RATIO_LEVEL_LIMITS[i - 1]!);
		}
	});

	test('a level never decreases as the ratio grows, and stays inside the scale', () => {
		let previous = 0;
		for (let ratio = 0.01; ratio < 1000; ratio *= 1.01) {
			const level = to_ratio_level(ratio);
			assert.ok(Number.isInteger(level));
			assert.ok(level >= 0 && level < RATIO_LEVEL_COLORS.length, `level ${level} of ${ratio}`);
			assert.ok(level >= previous, `the level fell at ${ratio}`);
			previous = level;
		}
		assert.strictEqual(to_ratio_level(0.01), 0);
		assert.strictEqual(previous, RATIO_LEVEL_COLORS.length - 1);
	});

	test('the baseline, a better ratio, and a much worse one are three different colors', () => {
		const colors = [0.5, 1, 100].map(to_ratio_color);
		assert.strictEqual(new Set(colors).size, 3);
		for (const color of colors) assert.include(RATIO_LEVEL_COLORS, color);
		assert.strictEqual(to_ratio_color(Infinity), RATIO_LEVEL_COLORS.at(-1));
	});

	test('every color is a fuz_css variable, so it adapts to the color scheme', () => {
		for (const color of RATIO_LEVEL_COLORS) assert.match(color, /^var\(--palette_[a-j]_\d+\)$/);
	});
});

describe('to_bound_color', () => {
	test('a bound never has the color of a number level with the baseline', () => {
		const level = to_ratio_color(1);
		for (let ratio = 0.5; ratio < 1000; ratio *= 1.01) {
			assert.notStrictEqual(to_bound_color(ratio), level, `${ratio}`);
			assert.include(RATIO_LEVEL_COLORS, to_bound_color(ratio));
		}
		assert.strictEqual(to_bound_color(1.01), to_ratio_color(RATIO_LEVEL_LIMITS[1]!));
	});

	test('past the level band, a bound has the color of its ratio', () => {
		for (const ratio of [RATIO_LEVEL_LIMITS[1]!, 1.3, 2, 6.13, 100]) {
			assert.strictEqual(to_bound_color(ratio), to_ratio_color(ratio));
		}
	});
});

describe('ratio_is_within_floor', () => {
	test('reads the same whichever side is larger', () => {
		assert.ok(ratio_is_within_floor(1.03, 0.033));
		assert.ok(ratio_is_within_floor(1 / 1.03, 0.033));
		assert.ok(!ratio_is_within_floor(1.04, 0.033));
		assert.ok(!ratio_is_within_floor(1 / 1.04, 0.033));
		assert.ok(ratio_is_within_floor(1, 0));
	});
});

describe('to_geomean', () => {
	test('is the geometric mean', () => {
		assert.closeTo(to_geomean([1, 100])!, 10, 1e-9);
		assert.closeTo(to_geomean([2, 8, 4])!, 4, 1e-9);
		assert.strictEqual(to_geomean([7]), 7);
	});

	test('is null for no values, never a zero', () => {
		assert.strictEqual(to_geomean([]), null);
	});

	test('a ratio of means is the mean of the ratios', () => {
		const a = [3, 50, 700];
		const b = [6, 25, 7000];
		const ratios = a.map((value, i) => b[i]! / value);
		assert.closeTo(to_geomean(b)! / to_geomean(a)!, to_geomean(ratios)!, 1e-9);
	});
});

describe('to_ratio_legend', () => {
	test('a key entry for each level, in the color a ratio inside it gets', () => {
		const legend = to_ratio_legend();
		assert.strictEqual(legend.length, RATIO_LEVEL_COLORS.length);
		assert.deepStrictEqual(
			legend.map((entry) => entry.label),
			['under 0.9×', '0.9–1.1×', '1.1–2×', '2–5×', '5–10×', '10–100×', '100× or more']
		);
		for (const [ratio, level] of [
			[0.5, 0],
			[1, 1],
			[1.5, 2],
			[3, 3],
			[7, 4],
			[50, 5],
			[500, 6]
		] as const) {
			assert.strictEqual(legend[level]!.color, to_ratio_color(ratio), String(ratio));
		}
	});
});
