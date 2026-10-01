import { to_headline_groups } from '$lib/headline.ts';
import type { MatrixGroup } from '$lib/matrix.ts';
import type { BenchResults } from '$lib/results_schema.ts';
import { load_site_results_for_build } from '$lib/server/site_results_load.ts';

/** What the landing page shows: the rosters and its few headline rows, not the cells behind them. */
export interface LandingData extends Pick<BenchResults, 'meta' | 'langs' | 'coverage'> {
	headline: Array<MatrixGroup>;
	/** What has changed since a published run was measured. */
	moved: Array<string>;
}

export const load = (): LandingData => {
	const { results, moved } = load_site_results_for_build();
	return {
		meta: results.meta,
		langs: results.langs,
		coverage: results.coverage,
		headline: to_headline_groups(results),
		moved
	};
};
