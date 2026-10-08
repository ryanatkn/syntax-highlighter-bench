/**
 * Install footprint: what `npm install` of a library adds to a project.
 *
 * For each adapter, the runtime dependency closure of its `package` and each of
 * its `extra_packages`, each resolved from this repository the way Node
 * resolves a bare specifier: the nearest `node_modules/<name>` walking up from
 * the package that depends on it. The closure follows:
 *
 * - `dependencies`, always
 * - `peerDependencies` not marked optional in `peerDependenciesMeta`, since npm
 *   installs those too
 * - `optionalDependencies` that are installed and not gated by platform (`os`,
 *   `cpu`, or `libc` in their manifest): a gated one is installed on some
 *   machines and not on others, so counting it would make the figure the
 *   machine's
 *
 * and never `devDependencies`. A package is told apart by its name and
 * version: one reached twice, or installed twice at the same version in nested
 * `node_modules`, is counted once, as a consumer's deduplicated install holds
 * it once, and two versions of one name are two packages, as npm installs both.
 *
 * `closure` is a hash of the sorted `name@version` list, so the versions the
 * figures depend on, transitive ones included, can be compared without being
 * listed: a lockfile update that moves a dependency moves the hash.
 *
 * Each package's files are what is in its directory, less any `node_modules`
 * inside it (the packages there are reached through the closure, or are not in
 * it). npm installs what the package's tarball holds, so that is what is on
 * disk. `bytes` sums the files' sizes as stored, never disk blocks, and no path
 * is recorded.
 *
 * **Determinism.** The figures depend on the versions this repository's
 * lockfile installs, transitive ones included, which `closure` pins: a fresh
 * `npm install` of the same library may resolve a dependency to a newer version
 * within its range. They
 * don't depend on the machine, apart from the platform-gated packages left out
 * above.
 *
 * Node-only.
 *
 * @module
 */

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BenchInstall, type BenchResults } from '../src/lib/results_schema.ts';
import type { HighlighterAdapter } from './adapter.ts';

const REPO_DIR = fileURLToPath(new URL('../', import.meta.url));

/**
 * Finds the directory of a package as Node resolves it from a directory: the
 * nearest `node_modules/<name>` with a manifest, walking up.
 *
 * @returns the real path of the package's directory, or null when it isn't installed
 */
export const find_package_dir = (name: string, from_dir: string): string | null => {
	let dir = from_dir;
	for (;;) {
		const candidate = join(dir, 'node_modules', name);
		if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
};

/** The fields of a manifest the closure reads. */
interface InstallManifest {
	name?: string;
	version?: string;
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	peerDependenciesMeta?: Record<string, { optional?: boolean }>;
	optionalDependencies?: Record<string, string>;
	os?: unknown;
	cpu?: unknown;
	libc?: unknown;
}

const read_manifest = (dir: string): InstallManifest =>
	JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as InstallManifest;

/** Whether a package installs only on some platforms. */
const is_platform_gated = (manifest: InstallManifest): boolean =>
	manifest.os !== undefined || manifest.cpu !== undefined || manifest.libc !== undefined;

/**
 * Counts the files of a package's directory and their bytes, leaving out any
 * `node_modules` inside it.
 *
 * @throws on a symbolic link, which no registry tarball holds: a linked package
 * is not what a consumer installs
 */
const count_package_files = (dir: string): { files: number; bytes: number } => {
	let files = 0;
	let bytes = 0;
	const walk = (path: string): void => {
		for (const entry of readdirSync(path, { withFileTypes: true })) {
			const child = join(path, entry.name);
			if (entry.isDirectory()) {
				if (entry.name !== 'node_modules') walk(child);
			} else if (entry.isFile()) {
				files++;
				bytes += lstatSync(child).size;
			} else {
				throw new Error(`${child} is neither a file nor a directory`);
			}
		}
	};
	walk(dir);
	return { files, bytes };
};

/** The hash of a closure: SHA-256 over its sorted `name@version` list, in hex. */
export const to_closure_hash = (packages: Iterable<string>): string =>
	createHash('sha256')
		.update([...packages].sort().join('\n'))
		.digest('hex');

/**
 * Measures the install footprint of some packages together: their closure,
 * each package once.
 *
 * @param names - the packages a consumer installs
 * @param from_dir - where they resolve from
 * @throws if a package or a required dependency isn't installed
 */
export const measure_install = (
	names: ReadonlyArray<string>,
	from_dir: string = REPO_DIR
): BenchInstall => {
	const seen: Set<string> = new Set();
	let files = 0;
	let bytes = 0;
	const visit = (name: string, from: string, required: boolean, by: string): void => {
		const dir = find_package_dir(name, from);
		if (dir === null) {
			if (required) throw new Error(`"${name}", which ${by} needs, is not installed`);
			return;
		}
		const manifest = read_manifest(dir);
		const label = manifest.name ?? name;
		if (manifest.version === undefined) throw new Error(`"${label}" has no version`);
		const key = `${label}@${manifest.version}`;
		if (seen.has(key)) return;
		if (!required && is_platform_gated(manifest)) return;
		seen.add(key);
		const counted = count_package_files(dir);
		files += counted.files;
		bytes += counted.bytes;
		// npm lists an optional dependency in `dependencies` too, and the optional entry wins
		const optional = Object.keys(manifest.optionalDependencies ?? {});
		for (const dep of Object.keys(manifest.dependencies ?? {})) {
			if (!optional.includes(dep)) visit(dep, dir, true, label);
		}
		for (const dep of Object.keys(manifest.peerDependencies ?? {})) {
			if (manifest.peerDependenciesMeta?.[dep]?.optional !== true) visit(dep, dir, true, label);
		}
		for (const dep of optional) visit(dep, dir, false, label);
	};
	for (const name of names) visit(name, from_dir, true, 'the library');
	return BenchInstall.parse({
		packages: seen.size,
		files,
		bytes,
		closure: to_closure_hash(seen)
	} satisfies BenchInstall);
};

/**
 * Each library's install closure, by id: what `carry_deterministic` compares.
 *
 * @throws if a package isn't installed
 */
export const to_install_closures = (
	adapters: ReadonlyArray<Pick<HighlighterAdapter, 'id' | 'package' | 'extra_packages'>>
): Record<string, string> =>
	Object.fromEntries(
		Object.entries(measure_installs(adapters)).map(([id, install]) => [id, install.closure])
	);

/**
 * Measures every library's install footprint: its package and its extra
 * packages, each library's closure counted whole on its own, as installing it
 * alone would give.
 *
 * @returns the `install` section of a results file
 */
export const measure_installs = (
	adapters: ReadonlyArray<Pick<HighlighterAdapter, 'id' | 'package' | 'extra_packages'>>
): BenchResults['install'] =>
	Object.fromEntries(
		adapters.map((adapter) => [
			adapter.id,
			measure_install([adapter.package, ...(adapter.extra_packages ?? [])])
		])
	);
