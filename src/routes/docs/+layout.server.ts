import { to_docs_data, type DocsData } from '$lib/docs_data.ts';
import { load_site_results_for_build } from '$lib/server/site_results_load.ts';

/** The docs pages render their rosters and the inputs table from the results file. */
export const load = (): { docs: DocsData } => ({
	docs: to_docs_data(load_site_results_for_build())
});
