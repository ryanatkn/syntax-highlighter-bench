import {
	to_headline_charts,
	to_language_weight_groups,
	to_practice_group,
	type HeadlineChart
} from '$lib/headline.ts';
import type { MatrixGroup } from '$lib/matrix.ts';
import type { BenchResults } from '$lib/results_schema.ts';
import { load_site_results_for_build } from '$lib/server/site_results_load.ts';

/** What the landing page shows: the rosters, its headline figures, and what each language adds. */
export interface LandingData extends Pick<BenchResults, 'meta' | 'langs' | 'coverage'> {
	charts: Array<HeadlineChart>;
	language_weights: Array<MatrixGroup>;
	/** The HTML throughput worked out for sizes a reader knows, or null with no timed run. */
	practice: MatrixGroup | null;
	/** What has changed since a published run was measured. */
	moved: Array<string>;
}

export const load = (): LandingData => {
	const { results, moved } = load_site_results_for_build();
	return {
		meta: results.meta,
		langs: results.langs,
		coverage: results.coverage,
		charts: to_headline_charts(results),
		language_weights: to_language_weight_groups(results),
		practice: to_practice_group(results),
		moved
	};
};
