/**
 * What a reader has selected on the results page, and its form as a URL query,
 * so a comparison is a link. The choices come from the results file, so a new
 * library or language needs no change here.
 *
 * Decoding never throws: an unknown key is ignored, an unknown id is dropped,
 * and a parameter left with nothing valid falls back to its default.
 *
 * @module
 */

import type { BenchLibrary } from './results_schema.ts';
import { BUNDLE_COMPRESSIONS, BUNDLE_VIEWS, to_combined_sets } from './bundle_matrix.ts';
import { BENCH_MODES, BENCH_SIZES } from './bench_constants.ts';
import { to_source_keys } from './cell_groups.ts';
import type { MatrixResults } from './matrix.ts';
import { OUTPUT_MEASURES } from './output_matrix.ts';
import { STARTUP_FORMS } from './startup_matrix.ts';
import { THROUGHPUT_UNITS } from './throughput_matrix.ts';

/** A section of the results page. */
export type ResultsMetric = 'throughput' | 'startup' | 'bundle' | 'heap' | 'output';

/** Every section, with its label, in display order. */
export const RESULTS_METRICS: ReadonlyArray<{ id: ResultsMetric; label: string }> = [
	{ id: 'throughput', label: 'throughput' },
	{ id: 'startup', label: 'cold start' },
	{ id: 'bundle', label: 'bundle size' },
	{ id: 'heap', label: 'retained heap' },
	{ id: 'output', label: 'tokens and output' }
];

/** The filters that hold several ids. */
export const RESULTS_LIST_KEYS = [
	'metrics',
	'libraries',
	'engines',
	'outputs',
	'langs',
	'sizes',
	'modes',
	'sources',
	'forms',
	'measures'
] as const;

/** The filters that hold one id. */
export const RESULTS_CHOICE_KEYS = [
	'unit',
	'bundle',
	'compression',
	'output_compression',
	'set'
] as const;

/** What a reader has selected on the results page. */
export type ResultsFilters = Record<(typeof RESULTS_LIST_KEYS)[number], Array<string>> &
	Record<(typeof RESULTS_CHOICE_KEYS)[number], string> & {
		/** The library every ratio is taken against, or null for the best in each row. */
		reference: string | null;
	};

/** The ids each filter can hold, in display order. */
export type ResultsFilterOptions = Record<
	(typeof RESULTS_LIST_KEYS)[number] | (typeof RESULTS_CHOICE_KEYS)[number],
	Array<string>
> & {
	/**
	 * Other ids a link may use for a set, each mapped to the id that stands for
	 * it: a set holding the same languages as another is shown under one id.
	 */
	set_aliases: Record<string, string>;
};

/** The source selected by default: the primary set, which no measured library authored. */
export const DEFAULT_SOURCE = 'neutral';

/** The form of a cold start selected by default: the chunk whose size is reported. */
export const DEFAULT_FORM = 'bundled';

/** How the HTML's size is shown by default: raw, as the output table has always shown it. */
export const DEFAULT_OUTPUT_COMPRESSION = 'raw';

/** The set summed by default, when the file has it: what a documentation site imports. */
export const DEFAULT_SET = 'docs';

const unique = (ids: ReadonlyArray<string>): Array<string> => [...new Set(ids)];

/** The ids each filter can hold, read from a results file. */
export const to_results_filter_options = (results: MatrixResults): ResultsFilterOptions => {
	const combined = to_combined_sets(results.sets, results.langs);
	return {
		metrics: RESULTS_METRICS.map((metric) => metric.id),
		libraries: results.meta.libraries.map((library) => library.id),
		engines: unique(results.meta.libraries.map((library) => library.engine)),
		outputs: unique(results.meta.libraries.map((library) => library.output)),
		langs: results.langs.map((lang) => lang.id),
		sizes: [...BENCH_SIZES],
		modes: [...BENCH_MODES],
		sources: to_source_keys(results.cells),
		forms: [...STARTUP_FORMS],
		measures: OUTPUT_MEASURES.map((measure) => measure.id),
		unit: THROUGHPUT_UNITS.map((unit) => unit.id),
		bundle: BUNDLE_VIEWS.map((view) => view.id),
		compression: [...BUNDLE_COMPRESSIONS],
		output_compression: [...BUNDLE_COMPRESSIONS],
		set: combined.map((set) => set.ids[0]!),
		set_aliases: Object.fromEntries(
			combined.flatMap((set) => set.ids.slice(1).map((id) => [id, set.ids[0]!]))
		)
	};
};

/**
 * The selection a reader starts from: everything, except the sources, where
 * only the neutral inputs are selected, and the forms of a cold start, where
 * only the bundled one is. Bundle sizes start gzipped and HTML sizes raw.
 */
export const to_default_results_filters = (options: ResultsFilterOptions): ResultsFilters => ({
	metrics: [...options.metrics],
	libraries: [...options.libraries],
	engines: [...options.engines],
	outputs: [...options.outputs],
	langs: [...options.langs],
	sizes: [...options.sizes],
	modes: [...options.modes],
	sources: options.sources.includes(DEFAULT_SOURCE) ? [DEFAULT_SOURCE] : [...options.sources],
	forms: options.forms.includes(DEFAULT_FORM) ? [DEFAULT_FORM] : [...options.forms],
	measures: [...options.measures],
	unit: options.unit[0]!,
	bundle: options.bundle[0]!,
	compression: options.compression[0]!,
	output_compression: options.output_compression.includes(DEFAULT_OUTPUT_COMPRESSION)
		? DEFAULT_OUTPUT_COMPRESSION
		: options.output_compression[0]!,
	set: options.set.includes(DEFAULT_SET) ? DEFAULT_SET : (options.set[0] ?? ''),
	reference: null
});

/** The query parameter of the reference library. */
export const REFERENCE_PARAM = 'reference';

const same = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
	a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * The query that restores a selection. Only what differs from the defaults is
 * written, so the default view has an empty query. A list is its ids joined by
 * commas, and an empty list is an empty value.
 */
export const encode_results_filters = (
	filters: ResultsFilters,
	defaults: ResultsFilters
): URLSearchParams => {
	const params = new URLSearchParams();
	for (const key of RESULTS_LIST_KEYS) {
		if (!same(filters[key], defaults[key])) params.set(key, filters[key].join(','));
	}
	for (const key of RESULTS_CHOICE_KEYS) {
		if (filters[key] !== defaults[key]) params.set(key, filters[key]);
	}
	if (filters.reference !== null) params.set(REFERENCE_PARAM, filters.reference);
	return params;
};

/**
 * Reads a selection from a query. Ids come back in the order of `options`,
 * each once.
 *
 * @param params - the query, which may hold anything
 * @param options - the ids each filter can hold
 * @param defaults - what a filter is when its parameter is absent or holds
 * nothing valid
 */
export const decode_results_filters = (
	params: Pick<URLSearchParams, 'get'>,
	options: ResultsFilterOptions,
	defaults: ResultsFilters
): ResultsFilters => {
	const filters: ResultsFilters = { ...defaults };
	for (const key of RESULTS_LIST_KEYS) {
		const raw = params.get(key);
		if (raw === null) continue;
		const ids = raw.split(',').filter((id) => id !== '');
		const valid = options[key].filter((id) => ids.includes(id));
		// an empty value selects nothing; ids that are all unknown are a broken link
		filters[key] = valid.length === 0 && ids.length > 0 ? [...defaults[key]] : valid;
	}
	for (const key of RESULTS_CHOICE_KEYS) {
		const raw = params.get(key);
		if (raw === null) continue;
		// a set that is shown under another id is that set
		const id =
			key === 'set' && Object.hasOwn(options.set_aliases, raw) ? options.set_aliases[raw]! : raw;
		if (options[key].includes(id)) filters[key] = id;
	}
	const reference = params.get(REFERENCE_PARAM);
	if (reference !== null && options.libraries.includes(reference)) filters.reference = reference;
	return filters;
};

/**
 * The libraries a selection shows, in roster order: the selected ones whose
 * engine kind and output shape are selected too.
 */
export const to_selected_libraries = (
	libraries: ReadonlyArray<BenchLibrary>,
	filters: Pick<ResultsFilters, 'libraries' | 'engines' | 'outputs'>
): Array<BenchLibrary> =>
	libraries.filter(
		(library) =>
			filters.libraries.includes(library.id) &&
			filters.engines.includes(library.engine) &&
			filters.outputs.includes(library.output)
	);

/**
 * The reference library a selection's ratios are taken against, or null for
 * the best in each row: a reference that isn't among the libraries shown is
 * ignored.
 */
export const to_selected_reference = (
	selected: ReadonlyArray<BenchLibrary>,
	filters: Pick<ResultsFilters, 'reference'>
): string | null =>
	selected.some((library) => library.id === filters.reference) ? filters.reference : null;
