/**
 * Regenerates `bench/corpus/manifest.json` from the files on disk, keeping the
 * hand-written `synthetic` flags and provenance, and the table of inputs beside
 * it.
 *
 * ```bash
 * node bench/corpus_manifest.ts          # rewrite the manifest
 * node bench/corpus_manifest.ts --check  # fail if it is stale or the corpus is wrong
 * ```
 *
 * @module
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import {
	build_corpus_manifest,
	CORPUS_INPUTS_PATH,
	CORPUS_MANIFEST_PATH,
	CorpusManifestSeed,
	render_corpus_inputs,
	serialize_corpus_manifest
} from './corpus.ts';

if (import.meta.main) {
	const args = process.argv.slice(2);
	const unknown = args.filter((arg) => arg !== '--check');
	if (unknown.length > 0) {
		console.error(`unknown argument: ${unknown.join(' ')}`);
		console.error('usage: node bench/corpus_manifest.ts [--check]');
		process.exit(2);
	}
	const check = args.includes('--check');

	const read = (path: string): string | null =>
		existsSync(path) ? readFileSync(path, 'utf8') : null;

	const committed = read(CORPUS_MANIFEST_PATH);
	const previous = committed === null ? [] : CorpusManifestSeed.parse(JSON.parse(committed)).inputs;

	const { manifest, problems, dropped } = build_corpus_manifest(previous);
	const serialized = serialize_corpus_manifest(manifest);
	const rendered = render_corpus_inputs(manifest);

	for (const problem of problems) console.error(problem);
	for (const file of dropped)
		console.error(`${file}: its entry is dropped, since the file is gone`);

	if (problems.length > 0) {
		console.error('the corpus has problems, so the manifest was left as it is');
		process.exit(1);
	}
	if (!check) {
		writeFileSync(CORPUS_MANIFEST_PATH, serialized);
		writeFileSync(CORPUS_INPUTS_PATH, rendered);
		console.log(`wrote the manifest: ${manifest.corpus_hash}`);
	} else if (serialized === committed && rendered === read(CORPUS_INPUTS_PATH)) {
		console.log(`the manifest matches the corpus: ${manifest.corpus_hash}`);
	} else {
		console.error('the manifest is stale: run `npm run corpus:manifest`');
		process.exit(1);
	}
}
