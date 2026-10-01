/**
 * Runs a script of the harness in a Node process of its own and reads the JSON
 * it prints. The deterministic passes use it: nothing they run is timed, so
 * several processes may run at once.
 *
 * Node-only.
 *
 * @module
 */

import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_DIR = fileURLToPath(new URL('../', import.meta.url));

/** How long one such process may run, in milliseconds. */
export const NODE_CHILD_TIMEOUT_MS = 5 * 60_000;

/**
 * Runs `node <script> '<spec as JSON>'` from the repo's root.
 *
 * What a process that succeeded wrote to stderr is passed on to this process's
 * stderr, under the label, so a warning from a library is not lost.
 *
 * @param script_path - the script, which prints one JSON value on stdout
 * @param spec - what the script is asked to do
 * @param label - what the process is, for the error
 * @returns the parsed JSON
 * @throws if the process fails, with its stderr, or prints something else
 */
export const run_node_json = (
	script_path: string,
	spec: unknown,
	label: string
): Promise<unknown> =>
	new Promise((resolve, reject) => {
		execFile(
			process.execPath,
			[script_path, JSON.stringify(spec)],
			{ cwd: REPO_DIR, maxBuffer: 64 * 1024 * 1024, timeout: NODE_CHILD_TIMEOUT_MS },
			(error, stdout, stderr) => {
				if (error) {
					reject(new Error(`${label} failed: ${stderr.trim() || error.message}`));
					return;
				}
				if (stderr.trim() !== '') {
					process.stderr.write(`${label} wrote to stderr:\n${stderr.trim()}\n`);
				}
				try {
					resolve(JSON.parse(stdout));
				} catch {
					reject(
						new Error(
							`${label} printed something other than one JSON value: ${JSON.stringify(stdout.slice(0, 200))}`
						)
					);
				}
			}
		);
	});
