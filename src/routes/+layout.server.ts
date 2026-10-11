import { load_site_results_for_build } from '#lib/server/site_results_load.ts';
import type { SiteResultsSource } from '#lib/site_results.ts';

/** Every page learns where the rendered results came from, so a fixture build is marked on all of them. */
export const load = (): { results_source: SiteResultsSource } => ({
	results_source: load_site_results_for_build().source
});
