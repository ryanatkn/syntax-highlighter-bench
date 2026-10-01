/**
 * Formatters for the numbers the site shows. Each is pinned to one locale, so a
 * prerendered page and its hydrated copy print the same text.
 *
 * @module
 */

/** A count with thousands separators. */
export const format_count = (n: number): string => n.toLocaleString('en-US');

/**
 * A number to about three significant digits: two decimals under 10, one under
 * 100, and a whole count from there.
 */
export const format_significant = (n: number): string => {
	const abs = Math.abs(n);
	if (abs >= 99.95) return format_count(Math.round(n));
	return n.toFixed(abs >= 9.995 ? 1 : 2);
};

/**
 * A byte count in decimal units, where 1 kB is 1,000 bytes. A negative count
 * keeps its sign, since a difference between two sizes can be one.
 */
export const format_bytes = (bytes: number): string => {
	const abs = Math.abs(bytes);
	if (abs < 1000) return `${format_count(bytes)} B`;
	if (abs < 999_500) return `${format_significant(bytes / 1000)} kB`;
	return `${format_significant(bytes / 1_000_000)} MB`;
};

/** A duration given in nanoseconds, in the unit that keeps it readable. */
export const format_ns = (ns: number): string => {
	if (ns < 999.5) return `${Math.round(ns)} ns`;
	if (ns < 999_500) return `${format_significant(ns / 1000)} µs`;
	if (ns < 999_500_000) return `${format_significant(ns / 1_000_000)} ms`;
	return `${format_significant(ns / 1_000_000_000)} s`;
};

/** A duration given in milliseconds. */
export const format_ms = (ms: number): string => `${format_significant(ms)} ms`;

/** A ratio as a factor: `1.00×`, `12.3×`, `140×`. */
export const format_ratio = (ratio: number): string => `${format_significant(ratio)}×`;

/** A fraction as a percentage: 0.033 is `3.3%`. */
export const format_percent = (fraction: number): string => `${(fraction * 100).toFixed(1)}%`;

/** The UTC date of an ISO timestamp, as `YYYY-MM-DD`. */
export const format_date = (iso: string): string => new Date(iso).toISOString().slice(0, 10);

/** How many characters of a hash the site prints. */
export const HASH_LABEL_LENGTH = 10;

/** A commit or content hash shortened for display, keeping a `-dirty` marker. */
export const format_hash = (hash: string): string =>
	hash.slice(0, HASH_LABEL_LENGTH) + (hash.endsWith('-dirty') ? '-dirty' : '');
