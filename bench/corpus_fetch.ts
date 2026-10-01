/**
 * Downloads corpus inputs from their pinned upstream commits and verifies them.
 * The pins are the manifest's: an input with one upstream file names its
 * repository, commit, path, and hash, and the file at that commit must hash to
 * the pin. This is how a pin is shown to be reproducible.
 *
 * ```bash
 * node bench/corpus_fetch.ts                        # fetch every neutral input missing or changed on disk
 * node bench/corpus_fetch.ts neutral/bash/nvm.sh    # only the named inputs, from any source
 * node bench/corpus_fetch.ts --check                # download and compare, writing nothing
 * ```
 *
 * A synthetic input built from several files is skipped: its own script builds
 * it. Only GitHub repositories are supported.
 *
 * @module
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { BenchProvenance } from '../src/lib/results_schema.ts';
import { CORPUS_DIR, hash_sha256, load_corpus_manifest, parse_corpus_path } from './corpus.ts';

const GITHUB_PREFIX = 'https://github.com/';

/**
 * The URL serving one file of a GitHub repository at a commit.
 *
 * @throws if the repository isn't on GitHub
 */
export const to_raw_url = (
	provenance: Pick<BenchProvenance, 'repo' | 'commit' | 'path'>
): string => {
	if (!provenance.repo.startsWith(GITHUB_PREFIX)) {
		throw new Error(`can only fetch from GitHub, not ${provenance.repo}`);
	}
	const repo = provenance.repo.slice(GITHUB_PREFIX.length);
	const path = provenance.path.split('/').map(encodeURIComponent).join('/');
	return `https://raw.githubusercontent.com/${repo}/${provenance.commit}/${path}`;
};

if (import.meta.main) {
	const args = process.argv.slice(2);
	const unknown = args.filter((arg) => arg.startsWith('--') && arg !== '--check');
	if (unknown.length > 0) {
		console.error(`unknown argument: ${unknown.join(' ')}`);
		console.error('usage: node bench/corpus_fetch.ts [--check] [file...]');
		process.exit(2);
	}
	const check = args.includes('--check');
	const named = args.filter((arg) => !arg.startsWith('--'));

	const { inputs } = load_corpus_manifest();
	for (const file of named) {
		if (!inputs.some((input) => input.file === file)) {
			console.error(`${file} is not in the manifest`);
			process.exit(2);
		}
	}
	const selected = inputs.filter((input) =>
		named.length > 0 ? named.includes(input.file) : input.source === 'neutral'
	);

	let failed = false;
	for (const input of selected) {
		// the manifest is data: never write outside the corpus layout on its word
		if (parse_corpus_path(input.file) === null) {
			console.error(`${input.file}: skipped, not a path of the corpus layout`);
			failed = true;
			continue;
		}
		const [provenance, ...rest] = input.provenance;
		if (provenance === undefined || rest.length > 0) {
			console.log(`${input.file}: skipped, not a copy of one upstream file`);
			continue;
		}
		const path = CORPUS_DIR + input.file;
		const on_disk = existsSync(path) ? hash_sha256(readFileSync(path)) : null;
		if (!check && on_disk === provenance.sha256) {
			console.log(`${input.file}: already the pinned file`);
			continue;
		}
		const response = await fetch(to_raw_url(provenance));
		if (!response.ok) {
			console.error(`${input.file}: ${response.status} from ${response.url}`);
			failed = true;
			continue;
		}
		const content = new Uint8Array(await response.arrayBuffer());
		const actual = hash_sha256(content);
		if (actual !== provenance.sha256) {
			console.error(
				`${input.file}: upstream hashes to ${actual}, not the pinned ${provenance.sha256}`
			);
			failed = true;
		} else if (check) {
			console.log(`${input.file}: upstream matches the pin`);
			if (on_disk !== actual) {
				console.error(`${input.file}: the file on disk is not the pinned file`);
				failed = true;
			}
		} else {
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, content);
			console.log(`${input.file}: wrote ${content.length} bytes`);
		}
	}
	if (failed) process.exit(1);
}
