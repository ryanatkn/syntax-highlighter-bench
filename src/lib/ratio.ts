/**
 * Ratios between libraries and the one color scale every table of the site
 * shares. A ratio is always "how many times worse than the baseline": 1 is the
 * baseline itself, 2 is twice as slow or twice as large, and under 1 is better,
 * which only happens against a chosen reference library.
 *
 * @module
 */

/** Whether a smaller or a larger number is the better one. */
export type RatioDirection = 'lower' | 'higher';

/**
 * How many times worse `value` is than `baseline`.
 *
 * @returns the ratio, or null when either number isn't positive and finite, so
 * a ratio is never made from a zero
 */
export const to_ratio = (
	value: number,
	baseline: number,
	direction: RatioDirection
): number | null => {
	if (!(value > 0) || !(baseline > 0) || !Number.isFinite(value) || !Number.isFinite(baseline)) {
		return null;
	}
	return direction === 'lower' ? value / baseline : baseline / value;
};

/**
 * The ratios under which each level of the scale ends. A ratio at or past the
 * last one is the last level.
 */
export const RATIO_LEVEL_LIMITS: ReadonlyArray<number> = [0.9, 1.1, 1.5, 3];

/**
 * The color of each level, as fuz_css variables that adapt to the color scheme:
 * better than the reference, level with the baseline, then three steps worse.
 */
export const RATIO_LEVEL_COLORS: ReadonlyArray<string> = [
	'var(--color_j_50)',
	'var(--color_b_50)',
	'var(--color_e_50)',
	'var(--color_h_50)',
	'var(--color_c_50)'
];

/**
 * The level of the color scale a ratio falls in, from 0 (better than the
 * reference) to the last index of `RATIO_LEVEL_COLORS`. It never decreases as
 * the ratio grows.
 */
export const to_ratio_level = (ratio: number): number => {
	const level = RATIO_LEVEL_LIMITS.findIndex((limit) => ratio < limit);
	return level === -1 ? RATIO_LEVEL_LIMITS.length : level;
};

/** The color of a ratio. The tables tint a cell with it and always print the ratio too. */
export const to_ratio_color = (ratio: number): string => RATIO_LEVEL_COLORS[to_ratio_level(ratio)]!;

/**
 * The color of a ratio that is only a lower bound. A bound is taken against a
 * row's resolution, not against the best in the row, so it is never given the
 * color of a number level with the baseline, however close to 1 it is: a number
 * that is at least the resolution is worse than one inside it.
 */
export const to_bound_color = (ratio: number): string =>
	to_ratio_color(Math.max(ratio, RATIO_LEVEL_LIMITS[1]!));

/**
 * Whether a ratio is inside a noise floor: the two numbers differ by no more
 * than the machine shows between two measurements of the same library.
 *
 * @param floor - a deviation as `BenchNoiseFloor` holds it; 0.03 is 3%
 */
export const ratio_is_within_floor = (ratio: number, floor: number): boolean =>
	Math.max(ratio, 1 / ratio) - 1 <= floor;

/** The geometric mean of positive numbers, or null for none. */
export const to_geomean = (values: ReadonlyArray<number>): number | null => {
	if (values.length === 0) return null;
	let sum = 0;
	for (const value of values) sum += Math.log(value);
	return Math.exp(sum / values.length);
};
