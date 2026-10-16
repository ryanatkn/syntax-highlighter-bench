/**
 * The Node side of an adapter: what the harness reads from disk on a library's
 * behalf, and the roster and coverage sections of a results file built from the
 * adapters. Adapters stay browser-safe by leaving all of it here.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { createRequire, findPackageJSON } from 'node:module';
import * as s from '@fuzdev/fuz_schema/schema.ts';

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
 * Reads the installed versions of what an adapter measures: its package and
 * each of its extra packages, by package name. A cell process reports them, so a
 * package changed on disk during a run is caught.
 *
 * @throws if a version can't be found
 */
export const read_package_versions = (
	adapter: Pick<HighlighterAdapter, 'package' | 'extra_packages'>
): Record<string, string> =>
	Object.fromEntries(
		[adapter.package, ...(adapter.extra_packages ?? [])].map((name) => [
			name,
			resolve_package_version(name)
		])
	);

/**
 * A roster entry's versions as `read_package_versions` gives them: its
 * package's and each extra package's.
 */
export const to_package_versions = (
	library: Pick<BenchLibrary, 'package' | 'version' | 'extra_packages'>
): Record<string, string> => ({ ...library.extra_packages, [library.package]: library.version });

/** A package whose version differs between two readings of a library's versions. */
export interface VersionChange {
	package: string;
	/** The version read earlier, or null when the package wasn't among them. */
	recorded: string | null;
	/** The version read now, or null when the package isn't among them. */
	current: string | null;
}

/**
 * Finds a package whose version differs between two readings of a library's
 * versions, as `to_package_versions` and `read_package_versions` give them.
 *
 * @returns the first such package, or null when the two agree
 */
export const find_version_change = (
	recorded: Record<string, string>,
	current: Record<string, string>
): VersionChange | null => {
	for (const name of new Set([...Object.keys(recorded), ...Object.keys(current)])) {
		const was = recorded[name] ?? null;
		const now = current[name] ?? null;
		if (was !== now) return { package: name, recorded: was, current: now };
	}
	return null;
};

/** Describes one side of a `VersionChange`, like `shiki 3.1.0`. */
export const format_package_version = (name: string, version: string | null): string =>
	version === null ? `no ${name}` : `${name} ${version}`;

/**
 * Finds a library of a run that another results file measured at other
 * versions, or not at all: what decides whether that file's numbers describe
 * the run.
 *
 * @param recorded - the other file's roster
 * @param libraries - the run's libraries
 * @returns why the file doesn't describe the run, naming the library and both
 * versions, or null when every library is the same
 */
export const find_library_change = (
	recorded: ReadonlyArray<BenchLibrary>,
	libraries: ReadonlyArray<BenchLibrary>
): string | null => {
	for (const library of libraries) {
		const own = recorded.find((l) => l.id === library.id);
		if (!own) return `it has no library "${library.id}"`;
		const change = find_version_change(to_package_versions(own), to_package_versions(library));
		if (change !== null) {
			return `it measured ${library.id} with ${format_package_version(change.package, change.recorded)}, and this run has ${format_package_version(change.package, change.current)}`;
		}
	}
	return null;
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
	s.parse_or_throw(BenchLibrary, {
		id: adapter.id,
		label: adapter.label,
		package: adapter.package,
		version: resolve_package_version(adapter.package),
		output: adapter.output,
		engine: adapter.engine,
		by_maintainer: adapter.by_maintainer,
		note: adapter.note,
		// in the schema's order, which the results file is written in
		...(adapter.extra_packages && {
			extra_packages: Object.fromEntries(
				adapter.extra_packages.map((name) => [name, resolve_package_version(name)])
			)
		}),
		theme_schemes: [...adapter.theme_schemes]
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
			entries[lang] = s.parse_or_throw(BenchCoverageEntry, via === undefined ? true : { via });
		}
		coverage[adapter.id] = entries;
	}
	return coverage;
};
