/**
 * Which results file the site renders, and whether it may. The site shows one
 * validated file: the latest published timed run when one is committed, and
 * otherwise the deterministic results, which hold no timed number. The fixture
 * run, whose numbers are invented, is used only when a build asks for it.
 *
 * @module
 */

import {
	bench_results_is_publishable,
	describe_bench_run,
	parse_bench_results,
	type BenchLibrary,
	type BenchResults
} from './results_schema.ts';

/**
 * Where the results a page shows came from:
 *
 * - `deterministic` - the committed deterministic results, with nothing timed
 * - `published` - the latest published timed run
 * - `fixture` - the test fixture, whose numbers are invented
 */
export type SiteResultsSource = 'deterministic' | 'published' | 'fixture';

/** The results the site renders, and where they came from. */
export interface SiteResults {
	source: SiteResultsSource;
	results: BenchResults;
	/**
	 * What has changed since a published run was measured, one phrase for each
	 * thing: a library now at another version, or the corpus. Empty when the run
	 * describes the tree as it is, and for any other source.
	 */
	moved: Array<string>;
	/**
	 * Whether the inputs of these results are the repository's corpus as it is
	 * committed: true for the deterministic results and for a published run of
	 * the same corpus, and false for a run of an earlier corpus and for the
	 * fixture.
	 */
	corpus_current: boolean;
}

/** The parsed JSON of each results file the site may render, null for one that is absent. */
export interface SiteResultsFiles {
	/** The deterministic results, which are always committed. */
	deterministic: unknown;
	/** The latest published timed run, or null when none is committed. */
	latest: unknown;
	/** The fixture run, given only when the build asked for it, and null otherwise. */
	fixture: unknown;
}

/** Whether a results file holds any timed number. */
export const bench_results_are_timed = (results: BenchResults): boolean =>
	results.meta.run !== null ||
	results.startup.length > 0 ||
	results.cells.some((cell) => Object.keys(cell.values).length > 0);

/** A library's version and the versions of its extra packages, as one comparable string. */
const to_versions = (library: BenchLibrary): string =>
	JSON.stringify([
		library.version,
		Object.entries(library.extra_packages ?? {}).sort(([a], [b]) => a.localeCompare(b))
	]);

/**
 * What differs between a published run and the deterministic results in the
 * things a deterministic number depends on: each library's version with its
 * extra packages, and the corpus.
 *
 * @returns a phrase for each thing that moved, none when the run describes the
 * same libraries and corpus as the deterministic results
 */
export const find_moved_since = (run: BenchResults, deterministic: BenchResults): Array<string> => {
	const moved: Array<string> = [];
	const current = new Map(deterministic.meta.libraries.map((library) => [library.id, library]));
	for (const library of run.meta.libraries) {
		const now = current.get(library.id);
		if (!now) {
			moved.push(`${library.id} is no longer measured`);
		} else if (now.version !== library.version) {
			moved.push(`${library.id} was measured at ${library.version} and is now at ${now.version}`);
		} else if (to_versions(now) !== to_versions(library)) {
			moved.push(`${library.id} is measured with other versions of its extra packages now`);
		}
	}
	for (const library of deterministic.meta.libraries) {
		if (!run.meta.libraries.some((l) => l.id === library.id)) {
			moved.push(`${library.id} was added`);
		}
	}
	if (run.meta.corpus_hash !== deterministic.meta.corpus_hash) moved.push('the corpus changed');
	return moved;
};

/**
 * The path of the first place two JSON values differ, or null when they are
 * equal. Object keys are compared as sets, so their order doesn't matter.
 */
export const find_first_difference = (a: unknown, b: unknown, path = ''): string | null => {
	if (a === b) return null;
	if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return path;
	if (Array.isArray(a) !== Array.isArray(b)) return path;
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
	for (const key of keys) {
		const at = path === '' ? key : `${path}.${key}`;
		if (!Object.hasOwn(a, key) || !Object.hasOwn(b, key)) return at;
		const difference = find_first_difference(
			(a as Record<string, unknown>)[key],
			(b as Record<string, unknown>)[key],
			at
		);
		if (difference !== null) return difference;
	}
	return null;
};

/** The deterministic numbers of a results file: what must be the same on any machine. */
const to_deterministic_numbers = (results: BenchResults): Record<string, unknown> => ({
	sets: results.sets,
	coverage: results.coverage,
	bundle: results.bundle,
	cells: Object.fromEntries(
		results.cells.map((cell) => [cell.id, { tokens: cell.tokens, output: cell.output }])
	)
});

/**
 * Chooses and validates the results the site renders. Every file given is
 * parsed through `parse_bench_results`, so no number reaches a page unchecked.
 *
 * - With a fixture, the fixture, as `fixture`: the build asked for it.
 * - Otherwise with a latest run, that run, as `published`. It must pass
 *   `bench_results_is_publishable`, with no exception: a run whose anchor
 *   drifted is refused like a smoke run.
 * - Otherwise the deterministic results, as `deterministic`.
 *
 * A published run is checked against the deterministic results. When both
 * describe the same library versions and corpus, their deterministic numbers
 * (sets, coverage, bundle sizes, and each cell's token counts and output sizes)
 * must be equal. When a version or the corpus has moved since the run, the run
 * is rendered as the snapshot it is, and `moved` says what moved.
 *
 * @throws Error if a file doesn't parse, if the latest run is not publishable,
 * if it disagrees with the deterministic results it should equal, or if the
 * deterministic file holds a timed number
 */
export const resolve_site_results = (files: SiteResultsFiles): SiteResults => {
	const deterministic = parse_bench_results(files.deterministic);
	if (bench_results_are_timed(deterministic)) {
		throw new Error(
			'results/deterministic.json holds timed numbers, and the site shows it as results that are the same on any machine'
		);
	}
	if (files.fixture !== null) {
		return {
			source: 'fixture',
			results: parse_bench_results(files.fixture),
			moved: [],
			corpus_current: false
		};
	}
	if (files.latest === null) {
		return { source: 'deterministic', results: deterministic, moved: [], corpus_current: true };
	}
	const latest = parse_bench_results(files.latest);
	if (!bench_results_is_publishable(latest)) {
		throw new Error(
			`results/latest.json is not a publishable run, so the site won't show it as results: ${describe_bench_run(latest)}. Publish a complete full run from a clean commit on a calibrated machine that held still, or remove the file.`
		);
	}
	const moved = find_moved_since(latest, deterministic);
	if (moved.length === 0) {
		const difference = find_first_difference(
			to_deterministic_numbers(latest),
			to_deterministic_numbers(deterministic)
		);
		if (difference !== null) {
			throw new Error(
				`results/latest.json and results/deterministic.json describe the same library versions and corpus, and their deterministic numbers differ, first at ${difference}. Regenerate the deterministic results, or publish a run that agrees with them.`
			);
		}
	}
	return {
		source: 'published',
		results: latest,
		moved,
		corpus_current: latest.meta.corpus_hash === deterministic.meta.corpus_hash
	};
};
