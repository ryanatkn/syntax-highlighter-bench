/**
 * Makes a timed run the published one: copies its results file to
 * `results/latest.json`, which the site renders, once the file is shown to be
 * publishable.
 *
 * ```bash
 * node bench/publish.ts results/<date>_<machine>.json
 * ```
 *
 * The file must be a run in `results/` itself, followed through any link, so
 * not one under `results/scratch/`, nor elsewhere, nor `latest.json`, and must
 * parse as a results file and pass `bench_results_is_publishable`.
 * The copy is byte for byte, written whole or not at all. Committing it is the
 * publisher's step.
 *
 * Node-only.
 *
 * @module
 */

import { readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

import {
	bench_results_is_publishable,
	describe_bench_run,
	parse_bench_results
} from '../src/lib/results_schema.ts';
import { RESULTS_DIR, SCRATCH_DIR_NAME } from './run_options.ts';

/** The name the published run has in the results directory. */
export const LATEST_FILE_NAME = 'latest.json';

const USAGE = [
	'usage: node bench/publish.ts <results file>',
	'',
	`Copies a publishable timed run to results/${LATEST_FILE_NAME}, which the site renders.`
].join('\n');

/** Where a run is published, or why it can't be. */
export type PublishResult = { ok: true; path: string } | { ok: false; message: string };

/**
 * Publishes a results file as `latest.json` in the results directory.
 *
 * @param source - the results file
 * @param results_dir - the results directory, for tests
 * @returns where it was written, or why it was refused: unreadable,
 * `latest.json` itself, outside the results directory or in its scratch
 * directory, not a results file, or not publishable
 * @throws if the copy can't be written
 */
export const publish_results = (
	source: string,
	results_dir: string = RESULTS_DIR
): PublishResult => {
	let real: string;
	let bytes: Buffer;
	try {
		// through any link, so a link here can't stand in for a file elsewhere
		real = realpathSync(source);
		bytes = readFileSync(real);
	} catch (error) {
		return { ok: false, message: `can't read ${source}: ${(error as Error).message}` };
	}
	const dir = realpathSync(results_dir);
	if (basename(source) === LATEST_FILE_NAME || basename(real) === LATEST_FILE_NAME) {
		return { ok: false, message: `${source} is ${LATEST_FILE_NAME} itself, the published run` };
	}
	if (dirname(real) === join(dir, SCRATCH_DIR_NAME)) {
		return {
			ok: false,
			message: `${source} is in ${SCRATCH_DIR_NAME}/, where smoke and filtered runs go, so it is not a run to publish`
		};
	}
	if (dirname(real) !== dir) {
		return {
			ok: false,
			message: `${source} is not in the results directory ${dir}: a published run is one of the runs written there`
		};
	}
	let results;
	try {
		results = parse_bench_results(JSON.parse(bytes.toString('utf8')));
	} catch (error) {
		return { ok: false, message: `${source} is not a results file: ${(error as Error).message}` };
	}
	if (!bench_results_is_publishable(results)) {
		return {
			ok: false,
			message: `${source} is not a publishable run: ${describe_bench_run(results)}`
		};
	}
	const target = join(dir, LATEST_FILE_NAME);
	// whole or not at all: a reader never sees half a file
	const temp_path = `${target}.${process.pid}.tmp`;
	try {
		writeFileSync(temp_path, bytes);
		renameSync(temp_path, target);
	} finally {
		rmSync(temp_path, { force: true });
	}
	return { ok: true, path: target };
};

/**
 * The command.
 *
 * @param args - the arguments after the script
 * @param results_dir - the results directory, for tests
 * @returns the exit code: 2 when the file is refused
 */
export const main = (args: ReadonlyArray<string>, results_dir: string = RESULTS_DIR): number => {
	if (args[0] === '--help') {
		console.log(USAGE);
		return 0;
	}
	if (args.length !== 1 || args[0]!.startsWith('--')) {
		console.error(USAGE);
		return 2;
	}
	const published = publish_results(args[0]!, results_dir);
	if (!published.ok) {
		console.error(published.message);
		return 2;
	}
	const display_path = relative(process.cwd(), published.path);
	console.log(
		`wrote ${display_path.startsWith('..') ? published.path : display_path}: build the site, then commit it with the run`
	);
	return 0;
};

if (import.meta.main) {
	process.exitCode = main(process.argv.slice(2));
}
