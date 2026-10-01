/**
 * What the docs pages render from the results file: the rosters and the inputs,
 * so a table in a tome is the data and can't fall behind it.
 *
 * @module
 */

import { create_context } from '@fuzdev/fuz_ui/context_helpers.ts';

import type { BenchInput, BenchLang, BenchNoiseFloor, BenchSet } from './results_schema.ts';
import type { SiteResults, SiteResultsSource } from './site_results.ts';

/** The parts of the rendered results file that the docs pages show. */
export interface DocsData {
	source: SiteResultsSource;
	langs: Array<BenchLang>;
	sets: Array<BenchSet>;
	inputs: Array<BenchInput>;
	corpus_hash: string;
	/** Whether the inputs are the repository's corpus as it is committed. */
	corpus_current: boolean;
	/** The name of the machine the timed numbers came from, or null when nothing was timed. */
	machine: string | null;
	noise_floor: BenchNoiseFloor | null;
}

/** Picks what the docs pages show from the results the site renders. */
export const to_docs_data = ({ source, results, corpus_current }: SiteResults): DocsData => ({
	source,
	langs: results.langs,
	sets: results.sets,
	inputs: results.inputs,
	corpus_hash: results.meta.corpus_hash,
	corpus_current,
	machine: results.meta.machine?.name ?? null,
	noise_floor: results.meta.noise_floor
});

/** The docs data, set by the docs layout from its load and read by the tomes. */
export const docs_data_context = create_context<() => DocsData>();
