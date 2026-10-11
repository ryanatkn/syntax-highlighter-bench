/**
 * Cold start: what a library costs a process before it has highlighted
 * anything. This module holds the scenarios, the process that takes one sample,
 * the check each sample passes, and the statistics. `bench/run.ts` runs the
 * processes, as part of a run.
 *
 * **A sample is one fresh Node process** that does a scenario's work once and
 * reports its own clock. The scenarios, for each library:
 *
 * - `core` imports the library with no language
 * - `lang` imports it with one language, for each timed language it claims
 * - `set` imports it with the languages of the `docs` feature set
 * - `first_highlight` imports it with one language and highlights that
 *   language's harness snippet once, to HTML
 *
 * and `bare` is a process that imports nothing, the baseline every other time
 * includes.
 *
 * **Two forms of each.** What a scenario imports is the module the adapter's
 * `bundle_entry` writes for a feature set (`core`, `single:<lang>`, `docs`): the
 * module bundle size is measured over. `bundled` imports the built chunk whose
 * size is reported. `unbundled` imports the same module's source from a file,
 * so Node resolves and loads every package file it reaches from `node_modules`,
 * as a consumer without a bundler does. The adapter modules are never loaded:
 * some import every language, which would charge a library for languages the
 * scenario doesn't load.
 *
 * **Start** is the start of the process, as the process itself sees it:
 * `performance.now()` counts from Node's time origin, taken as the process
 * begins. The clock is read once, when the work is done. So a time includes
 * Node starting up and excludes what happens outside the process (the parent
 * forking it, the OS loading the binary, the exit), which a parent-side clock
 * would add with its own variance. The `bare` scenario is Node starting up and
 * the same few lines of reporting, so a scenario's time less `bare`'s is what
 * the library added.
 *
 * **The process is a consumer's.** It is a generated module that holds the
 * scenario and nothing of the harness, run with no flags. V8's compile cache is
 * off (`NODE_DISABLE_COMPILE_CACHE=1`, and no `NODE_COMPILE_CACHE`), and each
 * sample reports that no cache directory is in use: with it a second process
 * would not compile what it loads, and would not be cold.
 *
 * The scenario set and the method generalize the cold-start harness of
 * Twinkleplop (https://github.com/pngwn/twinkleplop, MIT) across libraries: a
 * process per sample, scenarios interleaved, first rounds discarded, bundled
 * against unbundled, a bare baseline, time to first highlight.
 *
 * Node-only.
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { stats_median, stats_percentile, stats_spread } from '@fuzdev/fuz_util/stats.js';
import { z } from 'zod';

import {
	BenchCellOutput,
	type BenchResults,
	type BenchRunFilters,
	type BenchStartup,
	type BenchStartupKey,
	type BenchStartupScenario
} from '../src/lib/results_schema.ts';
import type { HighlighterAdapter } from './adapter.ts';
import { analyze_html, MIN_SNIPPET_SPAN_KINDS } from './check_output.ts';
import { read_corpus_input, type CorpusInput } from './corpus.ts';
import { TIMED_LANGS, type Lang } from './langs.ts';
import { CORE_SET_ID, FEATURE_SETS, to_single_set_id, type FeatureSet } from './sets.ts';
import {
	BUNDLES_DIR,
	GZIP_LEVEL,
	build_bundle,
	find_missing_langs,
	to_bundle_file_name,
	write_if_changed
} from './sizes.ts';

const REPO_DIR = fileURLToPath(new URL('../', import.meta.url));

/**
 * Where a run writes the modules its cold-start processes run: under
 * `node_modules`, beside the built bundles, so the bare specifiers of an
 * unbundled entry resolve as they do from anywhere in this repo, and no tool of
 * the repo sweeps the files. A specifier is looked for in a few directories
 * that don't exist on the way up, which a consumer's own file also pays for
 * each level it sits below its `node_modules`.
 */
export const STARTUP_DIR = join(
	REPO_DIR,
	'node_modules',
	'.cache',
	'syntax-highlighter-bench',
	'startup'
);

/**
 * The feature set the `set` scenario loads: what a documentation site imports.
 * Fixed, like every set, before any numbers exist.
 */
export const STARTUP_SET_ID = 'docs';

/** How long one cold-start process may run before the run is failed, in milliseconds. */
export const STARTUP_TIMEOUT_MS = 60_000;

/** One cold-start scenario of a run: what a results entry is keyed by, and what it loads. */
export interface StartupScenario extends BenchStartupKey {
	/** Identifies the scenario in a journal, a file name, and a message. */
	key: string;
	/**
	 * The scenarios that differ only in the library share a slot. The libraries of
	 * a slot run one after another, and the one that goes first rotates.
	 */
	slot: string;
	/** The feature set whose entry module the scenario imports. Null for `bare`. */
	entry_set: string | null;
	/** The input a `first_highlight` scenario highlights: the language's harness snippet. */
	snippet: CorpusInput | null;
}

/** A scenario a library can't run, because it doesn't claim a language of it. */
export interface StartupUnsupported {
	library: string;
	scenario: BenchStartupScenario;
	lang: Lang | null;
	set: string | null;
	/** The languages the library lacks. */
	missing: Array<Lang>;
}

const to_form = (bundled: boolean): string => (bundled ? 'bundled' : 'unbundled');

/** The key of a scenario: `bare`, or the library, the scenario, what it loads, and the form. */
export const to_startup_key = (scenario: BenchStartupKey): string =>
	scenario.library === null
		? scenario.scenario
		: [
				scenario.library,
				scenario.scenario,
				...(scenario.lang === null ? [] : [scenario.lang]),
				...(scenario.set === null ? [] : [scenario.set]),
				to_form(scenario.bundled)
			].join(':');

/**
 * Lists the cold-start scenarios of a run, slot by slot: `bare`, then `core`,
 * each language's `lang`, the `set`, and each language's `first_highlight`,
 * every one unbundled and then bundled, and within a slot every library that
 * supports it, in roster order.
 *
 * A library that doesn't claim every language of a scenario is unsupported
 * there: it is named in `unsupported` and gets no scenario, so it can't come
 * out as a number.
 *
 * @param adapters - the roster
 * @param filters - the run's filters: `libraries` narrows the libraries, and
 * `langs` the `lang` and `first_highlight` scenarios
 * @param inputs - the corpus manifest's inputs, for the harness snippets
 * @param sets - the feature sets
 * @throws if a timed language has no harness snippet, or a set is missing
 */
export const plan_startup_scenarios = (
	adapters: ReadonlyArray<HighlighterAdapter>,
	filters: Pick<BenchRunFilters, 'libraries' | 'langs'>,
	inputs: ReadonlyArray<CorpusInput>,
	sets: ReadonlyArray<FeatureSet> = FEATURE_SETS
): { scenarios: Array<StartupScenario>; unsupported: Array<StartupUnsupported> } => {
	const selected = adapters.filter((a) => filters.libraries?.includes(a.id) ?? true);
	const langs = TIMED_LANGS.filter((lang) => filters.langs?.includes(lang) ?? true);
	const find_set = (id: string): FeatureSet => {
		const set = sets.find((s) => s.id === id);
		if (!set) throw new Error(`there is no feature set "${id}" to start cold`);
		return set;
	};
	const scenarios: Array<StartupScenario> = [];
	const unsupported: Array<StartupUnsupported> = [];
	const add = (
		scenario: BenchStartupScenario,
		lang: Lang | null,
		set: string | null,
		entry_set: string,
		snippet: CorpusInput | null
	): void => {
		for (const bundled of [false, true]) {
			for (const adapter of selected) {
				const missing = find_missing_langs(adapter, find_set(entry_set));
				if (missing.length > 0) {
					// once for the two forms
					if (!bundled) unsupported.push({ library: adapter.id, scenario, lang, set, missing });
					continue;
				}
				const key: BenchStartupKey = { scenario, library: adapter.id, lang, set, bundled };
				scenarios.push({
					...key,
					key: to_startup_key(key),
					slot: to_startup_key({ ...key, library: '' }),
					entry_set,
					snippet
				});
			}
		}
	};
	scenarios.push({
		scenario: 'bare',
		library: null,
		lang: null,
		set: null,
		bundled: false,
		key: 'bare',
		slot: 'bare',
		entry_set: null,
		snippet: null
	});
	add('core', null, null, CORE_SET_ID, null);
	for (const lang of langs) add('lang', lang, null, to_single_set_id(lang), null);
	add('set', null, STARTUP_SET_ID, STARTUP_SET_ID, null);
	for (const lang of langs) {
		const snippet = inputs.find((input) => input.source === 'harness' && input.lang === lang);
		if (!snippet) throw new Error(`lang "${lang}" has no harness snippet to highlight first`);
		add('first_highlight', lang, null, to_single_set_id(lang), snippet);
	}
	return { scenarios, unsupported };
};

/** One cold-start process of a run: one sample of one scenario. */
export interface PlannedStartup {
	scenario: StartupScenario;
	/** Which round of the run it belongs to, from zero. The first ones are discarded. */
	round: number;
}

/**
 * Lists the processes of one round, in the order they run: every scenario
 * once, slot by slot. The library a slot starts with rotates from round to
 * round and from slot to slot, so no library always runs first in its slot. The
 * order within a slot is a rotation, so a library usually follows the same
 * neighbor.
 *
 * Every round holds every scenario, so the scenarios are interleaved over the
 * whole of the measuring: a machine that slows down slows every scenario's
 * samples alike, instead of the scenarios that happened to come last.
 *
 * @param scenarios - the scenarios, as `plan_startup_scenarios` lists them
 * @param round - which round, from zero
 */
export const plan_startup_round = (
	scenarios: ReadonlyArray<StartupScenario>,
	round: number
): Array<PlannedStartup> =>
	[...Map.groupBy(scenarios, (scenario) => scenario.slot).values()].flatMap((slot, i) =>
		slot.map((_scenario, k): PlannedStartup => ({
			scenario: slot[(k + i + round) % slot.length]!,
			round
		}))
	);

/** The environment variable that turns V8's compile cache off in a Node process. */
const DISABLE_COMPILE_CACHE = 'NODE_DISABLE_COMPILE_CACHE';

/**
 * The environment of a cold-start process: the run's own, with V8's compile
 * cache off. Node enables that cache only when asked, through
 * `NODE_COMPILE_CACHE` or `module.enableCompileCache()`, and
 * `NODE_DISABLE_COMPILE_CACHE` refuses both.
 */
export const to_startup_env = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
	const { NODE_COMPILE_CACHE: _, ...rest } = env;
	return { ...rest, [DISABLE_COMPILE_CACHE]: '1' };
};

/** What a `first_highlight` process highlights, and the call it makes. */
export interface StartupHighlight {
	/** The source to highlight. */
	src: string;
	/** The call, as an adapter's `bundle_html_source` gives it. */
	expression: string;
}

/**
 * Writes the module a cold-start process runs: the whole process, apart from
 * what it imports. It imports the scenario's entry, highlights once if the
 * scenario does, reads the clock, and only then gathers what it reports.
 *
 * - The import is static, as a consumer's is, so the clock is read after the
 *   entry and everything under it has loaded and run.
 * - The source to highlight is a literal in the module, so no file is read
 *   inside the clock.
 * - One character of the HTML is read before the clock stops. A library may
 *   return a string the engine hasn't joined up yet, which a consumer pays to
 *   flatten on first use: the timed cells read it for the same reason.
 * - The peak resident size is read before anything is written, since writing
 *   loads Node's stream modules.
 *
 * @param entry - the specifier of the entry module, or null for the bare baseline
 * @param highlight - what to highlight, or null for a scenario that only imports
 * @returns the source of an ES module that prints one `StartupChildOutput`
 */
export const to_startup_child_source = (
	entry: string | null,
	highlight: StartupHighlight | null = null
): string =>
	[
		'// generated by bench/coldstart.ts: one cold-start sample, and nothing of the harness',
		...(entry === null ? [] : [`import * as exports from ${JSON.stringify(entry)};`]),
		...(highlight === null
			? []
			: [
					`const src = ${JSON.stringify(highlight.src)};`,
					`const html = ${highlight.expression};`,
					`if (Number.isNaN(html.charCodeAt(0))) throw new Error('produced no HTML');`
				]),
		'const ms = performance.now();',
		'const max_rss_kb = process.resourceUsage().maxRSS;',
		'process.stdout.write(',
		'\tJSON.stringify({',
		'\t\tms,',
		'\t\tmax_rss_kb,',
		`\t\texports: ${entry === null ? '0' : 'Object.keys(exports).length'},`,
		`\t\thtml: ${highlight === null ? 'null' : 'html'},`,
		"\t\tcompile_cache_dir: process.getBuiltinModule('node:module').getCompileCacheDir() ?? null",
		"\t}) + '\\n',",
		// after the clock: exits once the line is written, whatever handle the library left open
		'\t(error) => process.exit(error ? 1 : 0)',
		');',
		''
	].join('\n');

/** The file name of a scenario's process, under its library's directory. */
const to_child_file_name = (scenario: StartupScenario): string =>
	`${[scenario.scenario, scenario.lang ?? scenario.set ?? []].flat().join('_')}.${to_form(scenario.bundled)}.mjs`;

/** The module a scenario's process runs. */
export const to_startup_child_path = (
	scenario: StartupScenario,
	dir: string = STARTUP_DIR
): string =>
	scenario.library === null
		? join(dir, 'bare.mjs')
		: join(dir, scenario.library, to_child_file_name(scenario));

/** Where things are, and what the bundles must be. */
export interface PrepareStartupOptions {
	/** Where the processes' modules and the unbundled entries are written. Under the repo. */
	dir?: string;
	/** Where the built bundles are, and are written when one is missing. Under the repo. */
	bundles_dir?: string;
	/**
	 * The deterministic results file's bundle sizes, when the run carries them. A
	 * bundle on disk is used only if it is the size that file reports, and one that
	 * is built must come out at that size.
	 */
	expected_bundle?: BenchResults['bundle'] | null;
}

/** What `prepare_startup` did about the bundles. */
export interface PreparedStartup {
	/** The bundles that were built, each as `<library> <set>`. */
	built: Array<string>;
	/** The bundles that don't have the size the deterministic file reports, each with both sizes. */
	mismatched: Array<string>;
}

/** The raw and gzipped size of a bundle: what tells a stale one from the reported one. */
const to_bundle_sizes = (code: string | Buffer): { raw: number; gzip: number } => {
	const bytes = typeof code === 'string' ? Buffer.from(code, 'utf8') : code;
	return { raw: bytes.length, gzip: gzipSync(bytes, { level: GZIP_LEVEL }).length };
};

/**
 * Writes everything the cold-start processes of a run load, before any is
 * started:
 *
 * - each scenario's own module (`to_startup_child_source`)
 * - for the unbundled form, the adapter's `bundle_entry` source as a file
 *   beside it, so its imports resolve from this repo's `node_modules`
 * - for the bundled form, the chunk `bench/sizes.ts` builds and measures, in
 *   the directory the deterministic pass leaves its bundles in. A bundle
 *   already there is used when it has the size the deterministic file reports,
 *   and is otherwise built here by the same `build_bundle`.
 *
 * A library's wasm import stays outside its bundle, as in the size build, so
 * the bundled form of such a library loads that one module from its package.
 *
 * @param scenarios - the scenarios, as `plan_startup_scenarios` lists them
 * @param adapters - the libraries they name
 * @returns which bundles were built, and which disagree with the deterministic file
 * @throws if a bundle doesn't build
 */
export const prepare_startup = async (
	scenarios: ReadonlyArray<StartupScenario>,
	adapters: ReadonlyArray<HighlighterAdapter>,
	options: PrepareStartupOptions = {}
): Promise<PreparedStartup> => {
	const { dir = STARTUP_DIR, bundles_dir = BUNDLES_DIR, expected_bundle = null } = options;
	const prepared: PreparedStartup = { built: [], mismatched: [] };
	/** The entry module of each library, set, and form, once however many scenarios import it. */
	const entries: Map<string, string> = new Map();
	const to_specifier = (from: string, to: string): string => {
		const path = relative(dirname(from), to).split(sep).join('/');
		return path.startsWith('.') ? path : `./${path}`;
	};
	for (const scenario of scenarios) {
		const child_path = to_startup_child_path(scenario, dir);
		if (scenario.library === null || scenario.entry_set === null) {
			write_if_changed(child_path, to_startup_child_source(null));
			continue;
		}
		const adapter = adapters.find((a) => a.id === scenario.library);
		const set = FEATURE_SETS.find((s) => s.id === scenario.entry_set);
		if (!adapter || !set)
			throw new Error(`${scenario.key} names a library or set that isn't there`);
		const entry_key = JSON.stringify([adapter.id, set.id, scenario.bundled]);
		let entry_path = entries.get(entry_key);
		if (entry_path === undefined) {
			const file_name = to_bundle_file_name(set.id);
			if (scenario.bundled) {
				entry_path = join(bundles_dir, adapter.id, file_name);
				const expected = expected_bundle?.[adapter.id]?.[set.id];
				const sizes = expected && 'raw' in expected ? expected : null;
				const matches = (code: string | Buffer): boolean => {
					const own = to_bundle_sizes(code);
					return sizes !== null && own.raw === sizes.raw && own.gzip === sizes.gzip;
				};
				// without the file's sizes nothing says a bundle on disk is this tree's
				if (!existsSync(entry_path) || !matches(readFileSync(entry_path))) {
					const code = await build_bundle(
						adapter.bundle_entry(set.langs),
						(adapter.wasm ?? []).map((wasm) => wasm.import)
					);
					write_if_changed(entry_path, code);
					prepared.built.push(`${adapter.id} ${set.id}`);
					if (sizes !== null && !matches(code)) {
						const own = to_bundle_sizes(code);
						prepared.mismatched.push(
							`${adapter.id} ${set.id}: built ${own.raw} bytes (${own.gzip} gzipped), and the file has ${sizes.raw} (${sizes.gzip})`
						);
					}
				}
			} else {
				entry_path = join(dir, adapter.id, file_name.replace(/\.mjs$/, '.entry.mjs'));
				write_if_changed(entry_path, adapter.bundle_entry(set.langs));
			}
			entries.set(entry_key, entry_path);
		}
		const highlight: StartupHighlight | null =
			scenario.snippet && scenario.lang !== null
				? {
						src: read_corpus_input(scenario.snippet),
						expression: adapter.bundle_html_source(scenario.lang as Lang)
					}
				: null;
		write_if_changed(
			child_path,
			to_startup_child_source(to_specifier(child_path, entry_path), highlight)
		);
	}
	return prepared;
};

/** What a cold-start process prints: one line of JSON. */
export const StartupChildOutput = z.strictObject({
	ms: z.number().positive().meta({
		description: "The process's clock when the work was done: milliseconds since it started."
	}),
	max_rss_kb: z.number().int().positive().meta({
		description: "The process's peak resident size at that point, in kilobytes."
	}),
	exports: z
		.number()
		.int()
		.nonnegative()
		.meta({ description: 'How many names the entry module exports.' }),
	html: z.string().nullable().meta({ description: 'What a first highlight returned.' }),
	compile_cache_dir: z.string().nullable().meta({
		description: "The directory of V8's compile cache, which must not be in use."
	})
});
export type StartupChildOutput = z.infer<typeof StartupChildOutput>;

/** One sample of a scenario. */
export const StartupSample = z.strictObject({
	ms: z.number().positive(),
	rss_peak_bytes: z.number().int().positive(),
	output: BenchCellOutput.nullable().meta({
		description: 'The size of the HTML a first highlight returned. Null for any other scenario.'
	})
});
export type StartupSample = z.infer<typeof StartupSample>;

/**
 * What one cold-start process came to: a sample, or the reason the library is
 * excluded from the scenario.
 */
export const StartupResult = z
	.strictObject({
		key: z.string().min(1).meta({ description: 'The key of the scenario.' }),
		sample: StartupSample.nullable(),
		excluded: z.string().min(1).nullable()
	})
	.refine(
		(result) => (result.sample === null) !== (result.excluded === null),
		'a scenario is sampled or excluded, and never both'
	);
export type StartupResult = z.infer<typeof StartupResult>;

/**
 * Checks what a cold-start process reported, and turns it into a sample.
 *
 * An entry that exports nothing gave the process nothing to load. A first
 * highlight has to pass the snippet gate the timed cells apply, on its HTML: at
 * least `MIN_SNIPPET_SPAN_KINDS` kinds of span, which a plain-text fallback
 * doesn't reach. Either failure excludes the library from the scenario.
 *
 * `maxRSS` is in kilobytes. Node documents it so for every platform, and only
 * Linux has been checked here: the OS call underneath reports bytes on macOS,
 * which libuv is left to convert.
 *
 * @param scenario - the scenario the process ran
 * @param output - what it printed
 * @returns the sample, or the reason for an exclusion
 */
export const check_startup_output = (
	scenario: StartupScenario,
	output: StartupChildOutput
): StartupResult => {
	const { key } = scenario;
	const exclude = (excluded: string): StartupResult => ({ key, sample: null, excluded });
	if (scenario.library !== null && output.exports === 0) {
		return exclude('the entry module exports nothing, so the process loaded no highlighter');
	}
	let html_output: BenchCellOutput | null = null;
	if (scenario.scenario === 'first_highlight') {
		// an empty string never gets here: the process throws on it before it reports
		if (output.html === null) return exclude('produced no HTML');
		const { html_bytes, elements, span_kinds } = analyze_html(output.html);
		if (span_kinds < MIN_SNIPPET_SPAN_KINDS) {
			return exclude(
				`failed the check on the ${scenario.lang} snippet: the HTML has ${span_kinds} kinds of span, under the ${MIN_SNIPPET_SPAN_KINDS} that highlighting produces: a plain-text fallback`
			);
		}
		html_output = { html_bytes, spans: elements };
	}
	return {
		key,
		sample: { ms: output.ms, rss_peak_bytes: output.max_rss_kb * 1024, output: html_output },
		excluded: null
	};
};

/** The numbers of one scenario: a `startup` entry without what names it. */
export type StartupSummary = Omit<BenchStartup, keyof BenchStartupKey>;

/**
 * Reduces a scenario's samples to the numbers a results entry carries.
 *
 * Everything is a median or a percentile. A process start has a floor, the time
 * the work takes, and a long slow tail (a core that was asleep, a page that had
 * left the cache), so a mean would follow the tail. `spread` is the slowest
 * sample over the fastest, the same definition a cell uses, and reads wider
 * here for that tail.
 *
 * @param samples - the kept samples of one scenario: at least one
 */
export const summarize_startup = (samples: ReadonlyArray<StartupSample>): StartupSummary => {
	const times = samples.map((sample) => sample.ms);
	return {
		samples: samples.length,
		median_ms: stats_median(times),
		p10_ms: stats_percentile(times, 0.1),
		p90_ms: stats_percentile(times, 0.9),
		spread: stats_spread(times),
		rss_peak_bytes: Math.round(stats_median(samples.map((sample) => sample.rss_peak_bytes)))
	};
};
