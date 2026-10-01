/**
 * The Node side of an adapter: what the harness reads from disk on a library's
 * behalf, and the roster and coverage sections of a results file built from the
 * adapters. Adapters stay browser-safe by leaving all of it here.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { createRequire, findPackageJSON } from 'node:module';

import { BenchCoverageEntry, BenchLibrary, type BenchResults } from '../src/lib/results_schema.ts';
import type { HighlighterAdapter } from './adapter.ts';
import { LANGS } from './langs.ts';

const require = createRequire(import.meta.url);

/**
 * Reads the installed version of an npm package from its manifest.
 *
 * @param name - the package name
 * @returns the version
 * @throws if the package or its version can't be found, since a run must know what it measured
 */
export const resolve_package_version = (name: string): string => {
	const manifest_path = findPackageJSON(name, import.meta.url);
	if (manifest_path === undefined) throw new Error(`package "${name}" is not installed`);
	const manifest: unknown = JSON.parse(readFileSync(manifest_path, 'utf8'));
	if (
		typeof manifest !== 'object' ||
		manifest === null ||
		!('name' in manifest) ||
		manifest.name !== name ||
		!('version' in manifest) ||
		typeof manifest.version !== 'string' ||
		manifest.version === ''
	) {
		throw new Error(`${manifest_path} doesn't give a version for "${name}"`);
	}
	return manifest.version;
};

/**
 * Resolves an adapter's default theme stylesheets to files.
 *
 * @returns the paths in the adapter's order, or null when its styles are inline
 * @throws if a stylesheet doesn't resolve
 */
export const resolve_theme_css = (adapter: HighlighterAdapter): Array<string> | null =>
	adapter.theme_css === null
		? null
		: adapter.theme_css.map((specifier) => require.resolve(specifier));

/**
 * Builds a library's roster entry, reading its version from disk.
 *
 * @throws if the version can't be found or the entry doesn't match the schema
 */
export const to_bench_library = (adapter: HighlighterAdapter): BenchLibrary =>
	BenchLibrary.parse({
		id: adapter.id,
		label: adapter.label,
		package: adapter.package,
		version: resolve_package_version(adapter.package),
		output: adapter.output,
		engine: adapter.engine,
		by_maintainer: adapter.by_maintainer,
		note: adapter.note,
		theme_schemes: [...adapter.theme_schemes],
		...(adapter.extra_packages && {
			extra_packages: Object.fromEntries(
				adapter.extra_packages.map((name) => [name, resolve_package_version(name)])
			)
		})
	} satisfies BenchLibrary);

/**
 * Builds the `meta.libraries` roster of a results file.
 *
 * @throws if two adapters share an id
 */
export const to_bench_libraries = (
	adapters: ReadonlyArray<HighlighterAdapter>
): Array<BenchLibrary> => {
	const seen: Set<string> = new Set();
	return adapters.map((adapter) => {
		if (seen.has(adapter.id)) throw new Error(`duplicate library id "${adapter.id}"`);
		seen.add(adapter.id);
		return to_bench_library(adapter);
	});
};

/**
 * Builds the `coverage` section of a results file: each library's claimed
 * languages in roster order, with its footnotes.
 *
 * @throws if an adapter footnotes a language it doesn't claim
 */
export const to_bench_coverage = (
	adapters: ReadonlyArray<HighlighterAdapter>
): BenchResults['coverage'] => {
	const coverage: BenchResults['coverage'] = {};
	for (const adapter of adapters) {
		for (const lang of Object.keys(adapter.via)) {
			if (!Object.hasOwn(adapter.langs, lang)) {
				throw new Error(`${adapter.id} footnotes lang "${lang}" without claiming it`);
			}
		}
		const entries: Record<string, BenchCoverageEntry> = {};
		for (const lang of LANGS) {
			if (!Object.hasOwn(adapter.langs, lang)) continue;
			const via = adapter.via[lang];
			entries[lang] = BenchCoverageEntry.parse(via === undefined ? true : { via });
		}
		coverage[adapter.id] = entries;
	}
	return coverage;
};
