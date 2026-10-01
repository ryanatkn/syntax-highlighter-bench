/**
 * Builds the large neutral Svelte input. Real Svelte components of around
 * 100KB are rare, so this one is assembled from several real components of
 * pinned upstream projects, joined block by block into one component: one module
 * script, one instance script, the markup sections in order, and one style block.
 * Every body is copied verbatim.
 *
 * The result is shaped like one large component and is lexically well formed,
 * but it is not a working one: the scripts of unrelated components share a scope,
 * so names collide. It is marked synthetic in the manifest, which lists the
 * components in `SVELTE_HARVEST_SOURCES` as its provenance.
 *
 * The components are read from a checkout holding each repository at its pinned
 * commit, in a directory named after the repository:
 *
 * ```bash
 * node bench/corpus_harvest_svelte.ts --repos <dir>          # rewrite the input
 * node bench/corpus_harvest_svelte.ts --repos <dir> --check  # fail if it would change
 * ```
 *
 * @module
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { BenchProvenance } from '../src/lib/results_schema.ts';
import { CORPUS_DIR, hash_sha256 } from './corpus.ts';

/** The input this script builds, as a path within the corpus. */
export const SVELTE_HARVEST_FILE = 'neutral/svelte/harvest.svelte';

/** The hash of what the pinned components build, which the committed input must have. */
export const SVELTE_HARVEST_SHA256 =
	'984a4b63fc65456b8e7e9a5f0b81ea83458a1a557707c105e11c410d402e85b7';

const create_source = (
	repo: string,
	commit: string,
	path: string,
	sha256: string
): BenchProvenance => ({ repo, commit, path, sha256, license: 'MIT', note: null });

const LAYERCHART = 'https://github.com/techniq/layerchart';
const LAYERCHART_COMMIT = 'ec05fb1b845344e041f1f40c7e4d643330f5d86b';
const SVELTE_UX = 'https://github.com/techniq/svelte-ux';
const SVELTE_UX_COMMIT = '11c79b8c6e851ade9edec2e99108f8a859ccec55';
const FLOWBITE_SVELTE = 'https://github.com/themesberg/flowbite-svelte';
const FLOWBITE_SVELTE_COMMIT = '85f20a048ec51598e2be099bd57b5f555fe7a5b4';

/**
 * The components the input is built from, in order: large TypeScript components
 * from the library source of a few projects, spread evenly across them.
 */
export const SVELTE_HARVEST_SOURCES: ReadonlyArray<BenchProvenance> = [
	create_source(
		LAYERCHART,
		LAYERCHART_COMMIT,
		'packages/layerchart/src/lib/components/Legend.svelte',
		'eb369e65e5f1d9a572be7acecf0d90fb2b7e8934c7ebdf6f1539988eecc9a6df'
	),
	create_source(
		LAYERCHART,
		LAYERCHART_COMMIT,
		'packages/layerchart/src/lib/components/layers/Canvas.svelte',
		'05878c9106f45f7aca016262158c940581cb4abcecc9c5f4a57e03d0911af1c5'
	),
	create_source(
		SVELTE_UX,
		SVELTE_UX_COMMIT,
		'packages/svelte-ux/src/lib/components/Button.svelte',
		'3a395049d766bc1c2ade73696a0d2e7423f19c52d7d6d3cafc1812964a2c1edc'
	),
	create_source(
		SVELTE_UX,
		SVELTE_UX_COMMIT,
		'packages/svelte-ux/src/lib/components/TextField.svelte',
		'13b48499cd94de2746a41f1ce0edd64d26e0013af84edd0fc20af9bee5ba285c'
	),
	create_source(
		FLOWBITE_SVELTE,
		FLOWBITE_SVELTE_COMMIT,
		'src/lib/datepicker/Datepicker.svelte',
		'013cf8b88f7e27b44bf119cabbda8f802a29b44779de294275fc2dea9b3b35d4'
	),
	create_source(
		FLOWBITE_SVELTE,
		FLOWBITE_SVELTE_COMMIT,
		'src/lib/clipboard-manager/ClipboardManager.svelte',
		'c0b2d9ffe0f51655d8d4425144fc896b9a3b1ec17f1e2819df24c88dbd7df436'
	)
];

/** The top-level blocks of one component. A body excludes its tags. */
export interface SvelteBlocks {
	module_script: string | null;
	instance_script: string | null;
	markup: string;
	style: string | null;
}

// a top-level block opens and closes at the start of a line
const SCRIPT_MATCHER = /^<script\b([^>]*)>\n([\s\S]*?)^<\/script>\n?/gm;
const STYLE_MATCHER = /^<style\b[^>]*>\n([\s\S]*?)^<\/style>\n?/gm;
const SCRIPT_ATTRIBUTES_MATCHER = /^\s+lang="ts"(\s+module)?\s*$/;

/**
 * Splits a component into its top-level blocks.
 *
 * @param source - the component's text
 * @param name - the component, for error messages
 * @throws if the component has two of one block, or a script that isn't plain TypeScript
 */
export const split_svelte_blocks = (source: string, name: string): SvelteBlocks => {
	const blocks: SvelteBlocks = {
		module_script: null,
		instance_script: null,
		markup: '',
		style: null
	};
	let markup = source.replace(SCRIPT_MATCHER, (_, attributes: string, body: string) => {
		const matched = SCRIPT_ATTRIBUTES_MATCHER.exec(attributes);
		if (!matched) throw new Error(`${name}: unsupported script attributes "${attributes.trim()}"`);
		const key = matched[1] === undefined ? 'instance_script' : 'module_script';
		if (blocks[key] !== null) throw new Error(`${name}: more than one ${key}`);
		blocks[key] = body;
		return '';
	});
	markup = markup.replace(STYLE_MATCHER, (_, body: string) => {
		if (blocks.style !== null) throw new Error(`${name}: more than one style block`);
		blocks.style = body;
		return '';
	});
	if (/^<\/?(script|style)\b/m.test(markup)) {
		throw new Error(`${name}: a top-level script or style block was not split out`);
	}
	blocks.markup = markup.trim() + '\n';
	return blocks;
};

/** One component to join: where it came from, and its text. */
export interface HarvestComponent {
	path: string;
	source: string;
}

/**
 * Joins components into one, block by block. Bodies are verbatim; a comment
 * naming the component precedes each.
 */
export const harvest_svelte = (components: ReadonlyArray<HarvestComponent>): string => {
	const split = components.map(({ path, source }) => ({
		path,
		...split_svelte_blocks(source, path)
	}));
	const join_bodies = (
		key: 'module_script' | 'instance_script' | 'style',
		to_comment: (path: string) => string
	): string | null => {
		const bodies = split.filter((blocks) => blocks[key] !== null);
		if (bodies.length === 0) return null;
		return bodies.map((blocks) => `\t${to_comment(blocks.path)}\n${blocks[key]!}`).join('\n');
	};
	const module_script = join_bodies('module_script', (path) => `// ${path}`);
	const instance_script = join_bodies('instance_script', (path) => `// ${path}`);
	const style = join_bodies('style', (path) => `/* ${path} */`);
	return [
		module_script === null ? null : `<script lang="ts" module>\n${module_script}</script>\n`,
		instance_script === null ? null : `<script lang="ts">\n${instance_script}</script>\n`,
		...split.map((blocks) => `<!-- ${blocks.path} -->\n${blocks.markup}`),
		style === null ? null : `<style>\n${style}</style>\n`
	]
		.filter((part) => part !== null)
		.join('\n');
};

/**
 * Reads the pinned components from a directory of checkouts and joins them.
 *
 * @param repos_dir - holds each repository in a directory named after it
 * @throws if a component is missing or isn't the pinned file
 */
export const build_svelte_harvest = (repos_dir: string): string =>
	harvest_svelte(
		SVELTE_HARVEST_SOURCES.map(({ repo, path, sha256 }) => {
			const file = join(repos_dir, repo.slice(repo.lastIndexOf('/') + 1), path);
			const content = readFileSync(file);
			const actual = hash_sha256(content);
			if (actual !== sha256) {
				throw new Error(`${file} is not the pinned file: expected ${sha256}, found ${actual}`);
			}
			return { path, source: content.toString('utf8') };
		})
	);

if (import.meta.main) {
	const args = process.argv.slice(2);
	const repos_dir = args[args.indexOf('--repos') + 1];
	const unknown = args.filter(
		(arg, i) => arg !== '--repos' && arg !== '--check' && args[i - 1] !== '--repos'
	);
	if (!args.includes('--repos') || repos_dir === undefined || unknown.length > 0) {
		console.error('usage: node bench/corpus_harvest_svelte.ts --repos <dir> [--check]');
		process.exit(2);
	}
	const harvested = build_svelte_harvest(repos_dir);
	if (hash_sha256(harvested) !== SVELTE_HARVEST_SHA256) {
		console.error(
			`the sources build ${hash_sha256(harvested)}, not SVELTE_HARVEST_SHA256: update it with the sources`
		);
		process.exit(1);
	}
	const output_path = CORPUS_DIR + SVELTE_HARVEST_FILE;
	if (!args.includes('--check')) {
		writeFileSync(output_path, harvested);
		console.log(`wrote ${SVELTE_HARVEST_FILE}: ${Buffer.byteLength(harvested)} bytes`);
	} else if (readFileSync(output_path, 'utf8') === harvested) {
		console.log(`${SVELTE_HARVEST_FILE} matches its sources`);
	} else {
		console.error(`${SVELTE_HARVEST_FILE} differs from what its sources build`);
		process.exit(1);
	}
}
