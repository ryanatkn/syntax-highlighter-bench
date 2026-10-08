/**
 * The id lists and thresholds that the results schema, the harness, and the
 * pages of the site all read. The module imports nothing, so a page can use
 * them without loading the schema, and the harness and the site can't disagree.
 *
 * @module
 */

/** The size tiers of an input, smallest first. */
export const BENCH_SIZES = ['micro', 'small', 'medium', 'large'] as const;

/** The stages a cell runs, in display order. */
export const BENCH_MODES = ['tokenize', 'html'] as const;

/** Where an input came from, the primary set first and the stress inputs last. */
export const BENCH_SOURCES = ['neutral', 'shiki', 'home', 'harness', 'stress'] as const;

/** The sources whose inputs may be written for this benchmark, with no upstream file. */
export const BENCH_WRITTEN_SOURCES = ['harness', 'stress'] as const satisfies ReadonlyArray<
	(typeof BENCH_SOURCES)[number]
>;

/**
 * A library whose rounds on a cell are further apart than this, slowest over
 * fastest, was disturbed by something. A timed run measures it there again, the
 * run's summary lists the ones still past it, and the site marks them.
 */
export const SPREAD_DISTURBED_ABOVE = 1.25;

/**
 * Two retained-heap readings (`BenchHeap`), in KiB, are the same reading when
 * they are this close, or `HEAP_TOLERANCE_RATIO` of the larger, whichever is
 * larger. Readings agree to well under a kibibyte; the margin keeps a reading
 * from being the one number of the deterministic file that fails a check on an
 * unchanged tree.
 */
export const HEAP_TOLERANCE_KB = 16;

/** The relative margin of `HEAP_TOLERANCE_KB`. */
export const HEAP_TOLERANCE_RATIO = 0.005;
