import type { MatrixResults } from '$lib/matrix.ts';
import { load_site_results_for_build } from '$lib/server/site_results_load.ts';

/** The results page gets the whole file but the corpus inputs, which the docs show. */
export const load = (): { results: MatrixResults; moved: Array<string> } => {
	const site = load_site_results_for_build();
	const { inputs: _, ...results } = site.results;
	return { results, moved: site.moved };
};
