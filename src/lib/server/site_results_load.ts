/**
 * Reads the results files the site renders from disk, at build time. It runs
 * only in the server loads of the prerendered pages, so no results file and no
 * schema reaches the client bundle: a page receives the validated data its load
 * returns.
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolve_site_results, type SiteResults } from '../site_results.ts';

/** The environment variable that makes a build or a dev server render the fixture run. */
export const SITE_FIXTURE_ENV = 'BENCH_RESULTS_FIXTURE';

/** The committed deterministic results, relative to the repository. */
export const SITE_DETERMINISTIC_PATH = 'results/deterministic.json';

/** The latest published timed run, relative to the repository. Absent until one is published. */
export const SITE_LATEST_PATH = 'results/latest.json';

/** The fixture run, whose numbers are invented, relative to the repository. */
export const SITE_FIXTURE_PATH = 'src/test/fixtures/results/fixture_run.json';

/**
 * Whether an environment asks for the fixture run: the variable is exactly `1`.
 * Anything else, an unset variable included, is no.
 */
export const site_fixture_is_enabled = (env: Record<string, string | undefined>): boolean =>
	env[SITE_FIXTURE_ENV] === '1';

/** Where the results files are, and whether to render the fixture. */
export interface LoadSiteResultsOptions {
	/** The repository root. */
	dir: string;
	/** Whether the fixture run is rendered in place of real results. */
	fixture: boolean;
}

const read_json = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

/**
 * Reads and validates the results the site renders. The fixture file is read
 * only when `fixture` is set, so a default build never opens it.
 *
 * @throws Error if a file is missing that must exist, or as `resolve_site_results` does
 */
export const load_site_results = (options: LoadSiteResultsOptions): SiteResults => {
	const latest_path = join(options.dir, SITE_LATEST_PATH);
	return resolve_site_results({
		deterministic: read_json(join(options.dir, SITE_DETERMINISTIC_PATH)),
		latest: existsSync(latest_path) ? read_json(latest_path) : null,
		fixture: options.fixture ? read_json(join(options.dir, SITE_FIXTURE_PATH)) : null
	});
};

/** The results for this process: the working directory's files, and its environment's choice. */
export const load_site_results_for_build = (): SiteResults =>
	load_site_results({ dir: process.cwd(), fixture: site_fixture_is_enabled(process.env) });
