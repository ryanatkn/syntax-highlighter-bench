/**
 * Bundle size: what each library costs a page, over each feature set.
 *
 * For a library and a set, the adapter's `bundle_entry` writes the module a
 * consumer would: the library with exactly the set's languages registered. That
 * module is bundled and minified, and its bytes are reported raw, gzipped, and
 * brotli-compressed. A set holding a language the library doesn't claim is not
 * measured for it: the entry names the missing languages instead.
 *
 * **The build.** Vite's build API in library mode bundles the entry into one ES
 * module, with no source map and nothing written to disk by Vite. Vite's library
 * mode never minifies the whitespace of an ES build, which is right for a
 * library and wrong for what a page ships, so the build leaves minifying off and
 * the chunk is then minified once, whole, by esbuild called directly
 * (`minify_with_esbuild`; esbuild would keep license comments, and none
 * reaches it). Resolution is a production browser build's, from this repo's
 * `node_modules`. The entry is a virtual module, so no path of this machine
 * reaches the output.
 *
 * **Two things stay out of the JS figure**, each with a column of its
 * own, because folding them in would hide a real difference:
 *
 * - **wasm**: a library that runs on a WebAssembly binary may ship it inlined
 *   in a JS module as text. The adapter names that import (`wasm`), the
 *   build leaves it out, and the binary's own bytes are measured.
 * - **theme CSS**: class-based output needs a stylesheet to show color, and
 *   inline-styled output needs none, its theme being in the JS. The
 *   default theme's stylesheets are minified by the same esbuild and measured.
 *
 * Both are reported raw, gzipped, and brotli-compressed, as the JS is.
 *
 * **Determinism.** The numbers depend on the libraries' versions, on Vite and
 * the Rolldown inside it, on esbuild (`BenchBundler` records the three), and, for the
 * compressed figures, on Node's zlib and brotli. They don't depend on the
 * machine, the directory, or the time. `NODE_ENV` would change them, since Vite
 * picks its resolve conditions from it, so a build sets it and checks that the
 * build Vite resolved is a production one.
 *
 * **Each bundle is checked**: `bench/bundle_check.ts` imports it in a process of
 * its own and highlights every language of the set through its exports.
 *
 * Node-only.
 *
 * @module
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { map_concurrent } from '@fuzdev/fuz_util/async.js';

import {
	BenchBundleEntry,
	BenchBundler,
	type BenchByteSizes,
	type BenchResults
} from '../src/lib/results_schema.ts';
import type { HighlighterAdapter } from './adapter.ts';
import { BundleCheckResult, type BundleCheckSpec } from './bundle_check.ts';
import type { Lang } from './langs.ts';
import { resolve_theme_css } from './library_info.ts';
import { run_node_json } from './node_child.ts';
import type { FeatureSet } from './sets.ts';

const require = createRequire(import.meta.url);

const REPO_DIR = fileURLToPath(new URL('../', import.meta.url));
const BUNDLE_CHECK_PATH = fileURLToPath(new URL('./bundle_check.ts', import.meta.url));

/**
 * The id of the entry module. No such file exists: a plugin serves the entry's
 * source under it, and its place in the repo is what the entry's imports resolve
 * from.
 */
const ENTRY_ID = join(REPO_DIR, 'bench', 'bundle_entry.js');

/** The gzip level sizes are reported at: the highest. */
export const GZIP_LEVEL = 9;

/** The brotli quality sizes are reported at: the highest. */
export const BROTLI_QUALITY = 11;

/**
 * Where the built bundles are written for their check: under `node_modules`, so
 * that an import the build left out still resolves, and no tool of the repo
 * sweeps them.
 */
export const BUNDLES_DIR = join(
	REPO_DIR,
	'node_modules',
	'.cache',
	'syntax-highlighter-bench',
	'bundles'
);

/** The bytes of some text: raw, gzipped, and brotli-compressed. */
export const measure_compressed = (text: string | Uint8Array): BenchByteSizes => {
	const bytes = typeof text === 'string' ? Buffer.from(text, 'utf8') : text;
	return {
		raw: bytes.length,
		gzip: gzipSync(bytes, { level: GZIP_LEVEL }).length,
		brotli: brotliCompressSync(bytes, {
			params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY }
		}).length
	};
};

/**
 * Sums the sizes of files served apart: each was compressed on its own.
 *
 * @returns the sums, or null for no files
 */
export const sum_byte_sizes = (sizes: ReadonlyArray<BenchByteSizes>): BenchByteSizes | null =>
	sizes.length === 0
		? null
		: sizes.reduce((sum, own) => ({
				raw: sum.raw + own.raw,
				gzip: sum.gzip + own.gzip,
				brotli: sum.brotli + own.brotli
			}));

/** The languages of a set that a library doesn't claim, in the set's order. */
export const find_missing_langs = (
	adapter: Pick<HighlighterAdapter, 'langs'>,
	set: Pick<FeatureSet, 'langs'>
): Array<Lang> => set.langs.filter((lang) => !Object.hasOwn(adapter.langs, lang));

/**
 * The file a set's bundle is written to: the set's id, made safe as a file name.
 * It is `.mjs` because nothing above the directory says what a `.js` file there
 * is, and Node would have to detect its format by compiling it, which a
 * cold-start process importing the bundle would pay for.
 */
export const to_bundle_file_name = (set_id: string): string =>
	`${set_id.replace(/[^A-Za-z0-9_-]/g, '_')}.mjs`;

/**
 * Writes a file unless it already holds the content, and whole or not at all.
 * A timed run's cold-start processes import the bundles and the modules beside
 * them, and one of them reading a file while it is written again must never
 * see half of it.
 */
export const write_if_changed = (path: string, content: string): void => {
	if (existsSync(path) && readFileSync(path, 'utf8') === content) return;
	mkdirSync(dirname(path), { recursive: true });
	const temp_path = `${path}.${process.pid}.tmp`;
	writeFileSync(temp_path, content);
	renameSync(temp_path, path);
};

/**
 * Runs something with `NODE_ENV` set to `production`, and puts it back. Vite
 * takes its resolve conditions from it, so a build under a test runner, which
 * sets it otherwise, would bundle a library's development build.
 */
const with_production_env = async <T>(fn: () => Promise<T>): Promise<T> => {
	const previous = process.env.NODE_ENV;
	process.env.NODE_ENV = 'production';
	try {
		return await fn();
	} finally {
		if (previous === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = previous;
	}
};

/**
 * Minifies JS or CSS with esbuild, called directly: the one minifier every
 * measured byte goes through, the bundles, the theme stylesheets, and the
 * derived stress inputs alike. Its version is in `BenchBundler.esbuild`, and a
 * stress input's `derivation` names it, since another version may minify to
 * other bytes.
 *
 * @param code - the source to minify
 * @param file - the file name esbuild reports in an error
 * @param loader - how esbuild reads `code`
 * @returns the minified source, ending with a newline
 * @throws if esbuild can't parse `code`
 */
export const minify_with_esbuild = async (
	code: string,
	file: string,
	loader: 'js' | 'css'
): Promise<string> => {
	const { transform } = await import('esbuild');
	const result = await transform(code, {
		loader,
		sourcefile: file,
		minify: true,
		sourcemap: false,
		...(loader === 'js' ? { format: 'esm', target: 'esnext' } : {})
	});
	return result.code;
};

/**
 * Bundles and minifies a module.
 *
 * @param source - the module's source, as an adapter's `bundle_entry` returns it
 * @param external - specifiers left out of the bundle: a library's inlined wasm
 * @returns the minified ES module
 * @throws if the build fails, produces anything but one chunk, or never imports
 * a specifier it was told to leave out
 */
export const build_bundle = (
	source: string,
	external: ReadonlyArray<string> = []
): Promise<string> =>
	with_production_env(async () => {
		const { build } = await import('vite');
		const built = await build({
			configFile: false,
			envFile: false,
			root: REPO_DIR,
			mode: 'production',
			logLevel: 'error',
			publicDir: false,
			define: { 'process.env.NODE_ENV': '"production"' },
			plugins: [
				{
					name: 'bench_bundle_entry',
					configResolved: (config) => {
						if (!config.isProduction) throw new Error('the bundle build is not a production build');
					},
					resolveId: (id) => (id === ENTRY_ID ? ENTRY_ID : null),
					load: (id) => (id === ENTRY_ID ? source : null)
				}
			],
			build: {
				write: false,
				// the minifier's target: Vite's default moves between majors, so it is pinned here
				target: 'esnext',
				minify: false,
				sourcemap: false,
				reportCompressedSize: false,
				copyPublicDir: false,
				lib: { entry: ENTRY_ID, formats: ['es'], fileName: 'bundle' },
				rolldownOptions: { external: [...external], output: { codeSplitting: false } }
			}
		});
		const outputs = (Array.isArray(built) ? built : [built]).flatMap((b) =>
			'output' in b ? b.output : []
		);
		const [chunk] = outputs;
		if (outputs.length !== 1 || chunk?.type !== 'chunk') {
			throw new Error(
				`the bundle build produced ${outputs.map((o) => o.fileName).join(', ') || 'nothing'}, not one chunk`
			);
		}
		const imported = [...chunk.imports, ...chunk.dynamicImports];
		for (const specifier of external) {
			if (!imported.includes(specifier)) {
				throw new Error(`the bundle never imports "${specifier}", which was to be left out of it`);
			}
		}
		for (const specifier of imported) {
			if (!external.includes(specifier)) {
				throw new Error(`the bundle leaves out "${specifier}", which nothing asked for`);
			}
		}
		// Vite's library mode keeps the whitespace of an ES chunk whatever `minify` says, so that a
		// consumer's bundler can still shake it. The figure is what a page ships: minified whole
		return minify_with_esbuild(chunk.code, 'bundle.js', 'js');
	});

/**
 * Measures a library's default theme: each stylesheet minified, then measured
 * raw and compressed as the JS is, and the sizes summed.
 *
 * @returns the sizes, or null for a library that writes its styles inline
 * @throws if a stylesheet doesn't resolve
 */
export const measure_theme_css = async (
	adapter: HighlighterAdapter
): Promise<BenchByteSizes | null> => {
	const paths = resolve_theme_css(adapter);
	if (paths === null) return null;
	const sizes: Array<BenchByteSizes> = [];
	for (const path of paths) {
		sizes.push(
			measure_compressed(
				await minify_with_esbuild(readFileSync(path, 'utf8'), basename(path), 'css')
			)
		);
	}
	return sum_byte_sizes(sizes);
};

/**
 * Measures the WebAssembly binaries a library loads.
 *
 * @returns their sizes, raw and compressed as the JS is, or null for a library with none
 * @throws if a binary doesn't resolve
 */
export const measure_wasm = (adapter: Pick<HighlighterAdapter, 'wasm'>): BenchByteSizes | null =>
	sum_byte_sizes(
		(adapter.wasm ?? []).map((wasm) =>
			measure_compressed(readFileSync(require.resolve(wasm.binary)))
		)
	);

/** What the sizes are built and compressed with. */
export const read_bundler = async (): Promise<BenchBundler> => {
	const [vite, esbuild] = await Promise.all([import('vite'), import('esbuild')]);
	return BenchBundler.parse({
		vite: vite.version,
		rolldown: vite.rolldownVersion,
		esbuild: esbuild.version,
		gzip_level: GZIP_LEVEL,
		brotli_quality: BROTLI_QUALITY
	} satisfies BenchBundler);
};

/** How `measure_bundles` is run. */
export interface MeasureBundlesOptions {
	/** Where the bundles are written for their check. Under the repo, for a library with wasm. */
	out_dir?: string;
	/** How many bundle checks run at once. */
	concurrency?: number;
	/** Receives progress. */
	log?: (line: string) => void;
}

/**
 * Measures every library over every feature set.
 *
 * Each bundle is built, written to `out_dir`, measured, and then checked by
 * `bench/bundle_check.ts` in a process of its own.
 *
 * @param adapters - the libraries
 * @param sets - the feature sets
 * @returns the `bundle` section of a results file, each entry validated
 * @throws if a build or a bundle's check fails
 */
export const measure_bundles = async (
	adapters: ReadonlyArray<HighlighterAdapter>,
	sets: ReadonlyArray<FeatureSet>,
	options: MeasureBundlesOptions = {}
): Promise<BenchResults['bundle']> => {
	const { out_dir = BUNDLES_DIR, concurrency = 1, log } = options;
	const bundle: BenchResults['bundle'] = {};
	const checks: Array<BundleCheckSpec> = [];
	for (const adapter of adapters) {
		const css = await measure_theme_css(adapter);
		const wasm = measure_wasm(adapter);
		const external = (adapter.wasm ?? []).map((w) => w.import);
		const dir = join(out_dir, adapter.id);
		const by_set: BenchResults['bundle'][string] = {};
		for (const set of sets) {
			const unsupported = find_missing_langs(adapter, set);
			if (unsupported.length > 0) {
				by_set[set.id] = BenchBundleEntry.parse({ unsupported });
				continue;
			}
			const code = await build_bundle(adapter.bundle_entry(set.langs), external);
			const path = join(dir, to_bundle_file_name(set.id));
			write_if_changed(path, code);
			checks.push({ library: adapter.id, langs: [...set.langs], path });
			by_set[set.id] = BenchBundleEntry.parse({ ...measure_compressed(code), wasm, css });
		}
		bundle[adapter.id] = by_set;
		log?.(`built ${adapter.id}`);
	}
	await map_concurrent(checks, concurrency, async (spec) => {
		const label = `the check of ${spec.path}`;
		const result = BundleCheckResult.parse(await run_node_json(BUNDLE_CHECK_PATH, spec, label));
		const missing = spec.langs.filter((lang) => !Object.hasOwn(result.span_kinds, lang));
		if (result.library !== spec.library || missing.length > 0) {
			throw new Error(`${label} did not cover ${missing.join(', ') || spec.library}`);
		}
	});
	log?.(`checked ${checks.length} bundles: each imports and highlights its languages`);
	return bundle;
};
