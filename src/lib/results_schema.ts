/**
 * The results file: one run of the benchmark, written by the harness and parsed
 * by the site. Both sides import these schemas, so a malformed run fails the
 * harness and the build rather than rendering blanks.
 *
 * The file separates two classes of number. **Machine-dependent** numbers come
 * from the timed harness on a named machine: each cell's `values` and the
 * `startup` section (cold start). **Deterministic** numbers regenerate identically anywhere:
 * each cell's `tokens`, `output`, and `compressed`, plus `bundle`, `install`, and
 * `coverage`. A file may
 * hold only the deterministic ones: it then records no machine, time, or commit,
 * since none of them shaped its numbers.
 *
 * A library missing from a cell is in one of two states, and the file keeps them
 * apart. **Unsupported** means the library doesn't claim the language — it has
 * no entry for it in `coverage`. **Excluded** means it claims the language but
 * failed the pre-measurement output check — it has an entry in `meta.excluded`.
 * Neither is ever a zero.
 *
 * The file is self-describing: `meta.libraries`, `langs`, `sets`, and `inputs` are
 * rosters, and every other section refers to them by id, or by file for inputs.
 * The language ids are owned by the harness in `bench/langs.ts`, not enumerated
 * here, so a new id needs no schema change and the site reads the roster from
 * the file.
 *
 * @module
 */

import { meta } from '@fuzdev/fuz_schema/meta.ts';
import * as s from '@fuzdev/fuz_schema/schema.ts';

import {
	BENCH_MODES,
	BENCH_SIZES,
	BENCH_SOURCES,
	BENCH_WRITTEN_SOURCES,
	HEAP_TOLERANCE_KB,
	HEAP_TOLERANCE_RATIO
} from './bench_constants.ts';

/** Reports an issue at `path` under the value a `refined` schema checks, with `message`. */
export type BenchIssueReporter = (path: Array<string | number>, message: string) => void;

// the value at `path` under `value`, which an issue names the type of
const value_at = (value: unknown, path: Array<string | number>): unknown => {
	let v: any = value;
	for (const key of path) v = v === null || typeof v !== 'object' ? undefined : v[key];
	return v;
};

/**
 * `schema`, then `fn` on its output, which reports each problem it finds
 * through `issue` at a path of its own: a rule across fields, which a `check`
 * could only fail as a whole. It runs only when `schema` passed.
 *
 * @param schema - the schema whose output `fn` checks
 * @param fn - reports every problem with the value, each at the path it is about
 */
export const refined = <T extends s.Schema>(
	schema: T,
	fn: (value: s.Infer<T>, issue: BenchIssueReporter) => void
): s.PipeSchema<s.Infer<T>, T> => {
	const action: s.SchemaAction<s.Infer<T>> = {
		kind: 'refine',
		def: fn,
		run: (value, ctx) => {
			fn(value, (path, message) => {
				const count = ctx.fails;
				s.fail(ctx, 'refine', value_at(value, path));
				if (!ctx.probe) {
					const added = ctx.issues![count]!;
					added.path = [...path];
					added.message = message;
				}
			});
			return value;
		}
	};
	return s.pipe<T, s.Infer<T>>(schema, action);
};

/**
 * Formats issues one to a line pair, `✖ message` and then `  → at path` when
 * the issue has one: the form `cap_issues` in the harness splits on.
 */
export const format_bench_issues = (issues: Array<s.SchemaIssue>): string =>
	issues
		.map(
			(issue) =>
				`✖ ${issue.message ?? `expected ${issue.expected}, received ${issue.received}`}` +
				(issue.path.length ? `\n  → at ${issue.path.map(String).join('.')}` : '')
		)
		.join('\n');

/**
 * A copy of `value`, which `schema` accepts, with every object's keys in the
 * order `schema` names them, so a file serializes the same however its
 * objects were built. A record keeps its own order, and a union takes the
 * order of the first option that accepts the value.
 *
 * @param schema - a schema that accepts `value`
 * @param value - the value to copy
 */
export const order_keys_by_schema = (schema: s.AnySchema, value: unknown): unknown => {
	const node = schema as s.SchemaNode;
	if (value === null || value === undefined || typeof value !== 'object') return value;
	switch (node.kind) {
		case 'object':
		case 'loose_object':
		case 'strip_object': {
			const input = value as Record<string, unknown>;
			const output: Record<string, unknown> = {};
			for (const [key, entry] of Object.entries(node.def)) {
				if (Object.hasOwn(input, key)) output[key] = order_keys_by_schema(entry, input[key]);
			}
			for (const key of Object.keys(input))
				if (!Object.hasOwn(output, key)) output[key] = input[key];
			return output;
		}
		case 'record':
			return Object.fromEntries(
				Object.entries(value).map(([key, v]) => [key, order_keys_by_schema(node.def, v)])
			);
		case 'array':
			return (value as Array<unknown>).map((v) => order_keys_by_schema(node.def, v));
		case 'optional':
		case 'nullable':
			return order_keys_by_schema(node.def.schema, value);
		case 'pipe':
			// every step, since a pipe may start with `unknown` and hold its shape later
			return node.def.reduce((v: unknown, step) => order_keys_by_schema(step, v), value);
		case 'union': {
			const option = node.def.find((o) => s.is(o, value));
			return option ? order_keys_by_schema(option, value) : value;
		}
		default:
			return value;
	}
};

// an issue on one line, with its path when it has one, for a union's message
const format_issue_inline = (issue: s.SchemaIssue): string => {
	const message = issue.message ?? `expected ${issue.expected}, received ${issue.received}`;
	return issue.path.length === 0 ? message : `${issue.path.map(String).join('.')}: ${message}`;
};

/** A number above zero. */
const positive = s.check((v: number) => v > 0, '> 0');

/** A number at least zero. */
const nonnegative = s.check((v: number) => v >= 0, '>= 0');

/** A string with at least one character. */
export const NonEmptyString = s.pipe(s.string, s.min_length(1));

/** A number above zero. */
export const PositiveNumber = s.pipe(s.number, positive);

/** A number at least zero. */
export const NonnegativeNumber = s.pipe(s.number, nonnegative);

/** A safe integer above zero. */
export const PositiveInt = s.pipe(s.number, s.safe_integer, positive);

/** A safe integer at least zero. */
export const NonnegativeInt = s.pipe(s.number, s.safe_integer, nonnegative);

/** An id used as a key or a cross-reference: a set or a cell. */
const Id = NonEmptyString;

/** A SHA-256 digest in lowercase hex. */
const Sha256 = s.pipe(s.string, s.regex(/^[0-9a-f]{64}$/));

/** The shape of a library id and a language id: lowercase, safe as a key and in a path. */
const NAME_MATCHER = /^[a-z][a-z0-9_]*$/;

/** A library id. */
const LibraryId = s.pipe(s.string, s.regex(NAME_MATCHER));

/** A language id. */
const LangId = s.pipe(s.string, s.regex(NAME_MATCHER));

/**
 * The pattern of an ISO 8601 datetime in UTC: a date that exists, then the
 * hours and minutes, the seconds and their fraction optional, then `Z`.
 */
const DATETIME_MATCHER =
	/^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|02-(?:0[1-9]|1\d|2[0-8])))T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?Z$/;

/** An ISO 8601 datetime in UTC, as `Date.prototype.toISOString` writes one. */
export const BenchDatetime = s.pipe(s.string, s.regex(DATETIME_MATCHER, 'an ISO datetime'));

/**
 * A record whose every key passes `key`, with a message for one that doesn't.
 * `record` alone takes any key.
 */
export const keyed_record = <T extends s.Schema>(
	key: (key: string) => boolean,
	value: T
): s.PipeSchema<Record<string, s.Infer<T>>, s.Schema> =>
	refined(s.record(value), (record, issue) => {
		for (const k of Object.keys(record)) if (!key(k)) issue([k], `invalid key "${k}"`);
	}) as s.AnySchema as s.PipeSchema<Record<string, s.Infer<T>>, s.Schema>;

/**
 * A record whose keys pass `key` that rejects an own `__proto__` key, which
 * `record` would otherwise drop from its output.
 */
const strict_record = <T extends s.Schema>(
	key: (key: string) => boolean,
	value: T
): s.PipeSchema<Record<string, s.Infer<T>>, s.Schema> =>
	s.pipe(
		s.unknown,
		s.message(
			s.check(
				(v: unknown) => typeof v !== 'object' || v === null || !Object.hasOwn(v, '__proto__')
			),
			'a "__proto__" key is not allowed'
		),
		keyed_record(key, value)
	) as s.AnySchema as s.PipeSchema<Record<string, s.Infer<T>>, s.Schema>;

/** Whether a key is a library id or a language id. */
const is_name = (key: string): boolean => NAME_MATCHER.test(key);

/** Whether a key is an `Id`. */
const is_id = (key: string): boolean => key.length > 0;

/** The machine a run's timed numbers came from. */
export const BenchMachine = s.object({
	name: meta(Id, { description: 'The name the machine is published under.' }),
	cpu: meta(NonEmptyString, { description: 'The CPU model.' }),
	threads: meta(s.nullable(PositiveInt), {
		description: 'Logical CPUs, or null where the OS reports none.'
	}),
	governor: meta(s.nullable(NonEmptyString), {
		description: "The first CPU's frequency governor, or null where the OS exposes none."
	}),
	cpufreq_driver: meta(s.nullable(NonEmptyString), {
		description: "The first CPU's frequency scaling driver, or null where the OS exposes none."
	}),
	epp: meta(s.nullable(NonEmptyString), {
		description: "The first CPU's energy-performance preference, or null where the driver has none."
	}),
	boost: meta(s.nullable(s.boolean), {
		description: 'Whether frequency boost is on, or null where the OS exposes no switch.'
	}),
	memory_gb: meta(PositiveNumber, { description: 'Installed memory in gigabytes.' }),
	os_release: meta(NonEmptyString, { description: 'The OS release, as `os.release()` gives it.' })
});
export type BenchMachine = s.Infer<typeof BenchMachine>;

/**
 * The anchor drift under which a run counts as stable; 0.03 is 3%. Past it the
 * machine changed state during the run, and the ratios between libraries in a
 * cell are more trustworthy than any absolute time.
 */
export const BENCH_ANCHOR_STABLE_BELOW = 0.03;

/**
 * The reference workload measured at the start and end of a run, and of every
 * segment of a run that was stopped and resumed. Its drift says whether the
 * machine changed state while the run was in progress.
 */
export const BenchAnchor = refined(
	s.object({
		drift: meta(s.number, {
			description:
				'Relative change between the two readings that differ most, from the earlier to the later; 0.01 is 1%. An uninterrupted run has two readings.'
		}),
		stable: meta(s.boolean, {
			description: 'Whether the drift stayed under `BENCH_ANCHOR_STABLE_BELOW`, either way.'
		})
	}),
	(anchor, issue) => {
		if (anchor.stable !== Math.abs(anchor.drift) < BENCH_ANCHOR_STABLE_BELOW) {
			issue(['stable'], `stable is exactly a drift under ${BENCH_ANCHOR_STABLE_BELOW}, either way`);
		}
	}
);
export type BenchAnchor = s.Infer<typeof BenchAnchor>;

/** What a library's `html` output carries its colors in. */
export const BenchOutputKind = s.one_of(['classes', 'inline_styles']);
export type BenchOutputKind = s.Infer<typeof BenchOutputKind>;

/** A color scheme a theme covers. */
export const BenchColorScheme = s.one_of(['light', 'dark']);
export type BenchColorScheme = s.Infer<typeof BenchColorScheme>;

/** How a library lexes. A filterable tag, not a ranking. */
export const BenchEngineKind = s.one_of(['scanner', 'grammar_vm', 'regex', 'textmate']);
export type BenchEngineKind = s.Infer<typeof BenchEngineKind>;

/** One measured library. The roster of these drives every page of the site. */
export const BenchLibrary = s.object({
	id: meta(LibraryId, { description: 'The key this library has in every per-library map.' }),
	label: meta(NonEmptyString, { description: 'The display name.' }),
	package: meta(NonEmptyString, { description: 'The npm package the version was read from.' }),
	version: meta(
		s.pipe(
			s.string,
			s.min_length(1),
			s.message(
				s.check((v: string) => v !== 'unknown'),
				'a run must know which version it measured'
			)
		),
		{ description: 'The installed version of the package.' }
	),
	output: meta(BenchOutputKind, { description: 'What the HTML output carries its colors in.' }),
	engine: meta(BenchEngineKind, { description: 'How the library lexes.' }),
	by_maintainer: meta(s.boolean, {
		description:
			"Whether this benchmark's maintainer also maintains the library. The site flags it."
	}),
	note: meta(s.nullable(NonEmptyString), {
		description: 'What was measured and any caveat, shown beside the library.'
	}),
	extra_packages: meta(s.optional(keyed_record(is_id, NonEmptyString)), {
		description:
			'The installed versions of packages the library was measured with that are versioned apart from `package`, by name.'
	}),
	theme_schemes: meta(s.pipe(s.array(BenchColorScheme), s.min_length(1)), {
		description:
			'The color schemes the measured default theme covers: its stylesheets for class-based output, and the theme bundled in the JS for inline styles. A theme with two schemes is larger than one with one, which the theme CSS sizes should be read beside.'
	})
});
export type BenchLibrary = s.Infer<typeof BenchLibrary>;

/**
 * A library that claims a cell's language but failed the pre-measurement output
 * check there, so it was not measured. Distinct from unsupported, which is a
 * language missing from the library's `coverage`.
 */
export const BenchExcluded = s.object({
	cell: meta(Id, { description: 'The id of the cell.' }),
	library: meta(LibraryId, { description: 'The id of the library.' }),
	reason: meta(NonEmptyString, { description: 'What the check found.' })
});
export type BenchExcluded = s.Infer<typeof BenchExcluded>;

/**
 * The machine's noise floor, from a calibration run: every library is measured
 * as two, in separate processes, which should come out equal. A difference
 * smaller than this is not a result.
 */
export const BenchNoiseFloor = s.object({
	per_cell: meta(NonnegativeNumber, {
		description:
			'The deviation a single cell can show by chance: the 95th percentile, over cells and libraries, of how far two measurements of the same library were apart, as the larger over the smaller less one; 0.01 is 1%.'
	}),
	geomean: meta(NonnegativeNumber, {
		description:
			"The deviation of a geometric mean across cells: how far apart the two measurements' geometric means were, for the library where they differed most; 0.01 is 1%."
	}),
	per_process: meta(s.nullable(NonnegativeNumber), {
		description:
			"The deviation two processes of one library on one cell can show by chance: the 95th percentile, over every pair of passes within an arm, of how far their medians were apart. It is what a run's `process_noise.p95` is compared with, since `per_cell` compares values that each pool several processes and so reads lower. Null when each arm measured one pass."
	})
});
export type BenchNoiseFloor = s.Infer<typeof BenchNoiseFloor>;

/**
 * How far apart a run's own processes came out: an A/A figure from the run
 * itself. Each library on each cell was measured by several processes, which
 * should agree, and every pair of them gives a deviation. It is fuz_util's
 * `StatsPairwiseDeviation`, restated here so the schema depends on fuz_schema alone.
 */
export const BenchProcessNoise = refined(
	s.object({
		pairs: meta(PositiveInt, {
			description:
				"How many pairs of processes the figures are taken over: every pair of a value's `pass_medians_ns`, over every cell and library."
		}),
		median: meta(NonnegativeNumber, {
			description:
				'The median deviation of a pair, as the larger median over the smaller less one; 0.01 is 1%.'
		}),
		p95: meta(NonnegativeNumber, {
			description:
				"The 95th percentile deviation of a pair: the run's own counterpart of the noise floor's `per_process`."
		}),
		max: meta(NonnegativeNumber, { description: 'The largest deviation of a pair.' })
	}),
	(noise, issue) => {
		if (!(noise.median <= noise.p95 && noise.p95 <= noise.max)) {
			issue(['p95'], 'the median is at most the 95th percentile, which is at most the largest');
		}
	}
);
export type BenchProcessNoise = s.Infer<typeof BenchProcessNoise>;

/** An input's size tier, by real file size. */
export const BenchSize = s.one_of(BENCH_SIZES);
export type BenchSize = s.Infer<typeof BenchSize>;

/** The stage a cell runs: tokens out, or the HTML string consumers ship. */
export const BenchMode = s.one_of(BENCH_MODES);
export type BenchMode = s.Infer<typeof BenchMode>;

/**
 * Who an input came from: `neutral` is real code no measured library authored,
 * `shiki` is Shiki's upstream benchmark samples, `home` is one library's own
 * samples, and `harness` is a snippet written for this benchmark.
 */
export const BenchSource = s.one_of(BENCH_SOURCES);
export type BenchSource = s.Infer<typeof BenchSource>;

/**
 * What a run is: `full` measures with the published parameters, `smoke` runs
 * every cell once to prove the harness works and its numbers mean nothing, and
 * `calibrate` measures every library twice in every cell to find the noise floor.
 */
export const BenchRunKind = s.one_of(['full', 'smoke', 'calibrate']);
export type BenchRunKind = s.Infer<typeof BenchRunKind>;

/**
 * A machine-dependent measurement a run makes: `throughput` is the timed cells,
 * and `startup` is cold start.
 */
export const BenchRunMetric = s.one_of(['throughput', 'startup']);
export type BenchRunMetric = s.Infer<typeof BenchRunMetric>;

/**
 * The filters a run was restricted by. Each is null when the run was not
 * restricted on that axis. `libraries` and `langs` narrow the cells and the
 * cold-start scenarios alike; `sizes`, `modes`, and `sources` select inputs, so
 * they narrow the cells only.
 */
export const BenchRunFilters = s.object({
	libraries: s.nullable(s.pipe(s.array(LibraryId), s.min_length(1))),
	langs: s.nullable(s.pipe(s.array(LangId), s.min_length(1))),
	sizes: s.nullable(s.pipe(s.array(BenchSize), s.min_length(1))),
	modes: s.nullable(s.pipe(s.array(BenchMode), s.min_length(1))),
	sources: s.nullable(s.pipe(s.array(BenchSource), s.min_length(1))),
	metrics: s.nullable(s.pipe(s.array(BenchRunMetric), s.min_length(1)))
});
export type BenchRunFilters = s.Infer<typeof BenchRunFilters>;

/**
 * How the timed numbers of a run were measured: its cells and its cold-start
 * scenarios. It tells a complete `full` run from a smoke, calibration, or
 * partial run: see `bench_results_is_publishable`.
 */
export const BenchRun = s.object({
	kind: BenchRunKind,
	passes: meta(PositiveInt, {
		description: 'How many processes measured each library in each cell. Their rounds are pooled.'
	}),
	rounds: meta(PositiveInt, { description: 'How many batches each process timed.' }),
	target_ms: meta(PositiveNumber, {
		description: 'How long one timed batch aimed to run, in milliseconds.'
	}),
	warmup_ms: meta(NonnegativeNumber, {
		description: 'How long each library ran untimed before calibration, in milliseconds.'
	}),
	rewarm_ms: meta(NonnegativeNumber, {
		description: 'How long each library ran untimed before each timed batch, in milliseconds.'
	}),
	retries: meta(NonnegativeInt, {
		description:
			'How many times a library whose rounds on a cell disagreed could be measured again there. 0 is never.'
	}),
	loaded_langs: meta(s.literal('cell'), {
		description:
			"Which languages each cell's process set up in every library: `cell` is exactly the cell's language."
	}),
	collection: meta(s.literal('minor'), {
		description:
			'What each process collected before each timed batch, after its rewarm: `minor` is the young generation only. No full collection was forced between batches.'
	}),
	startup_samples: meta(s.nullable(PositiveInt), {
		description:
			'How many samples each cold-start scenario kept, each a fresh process. Null, like the two fields after it, exactly when the run measured no cold start: a calibration, or a run whose metrics filter leaves it out.'
	}),
	startup_discard: meta(s.nullable(NonnegativeInt), {
		description:
			'How many rounds of cold-start processes ran before the kept ones and were thrown away: they warm the page cache.'
	}),
	startup_compile_cache: meta(s.nullable(s.literal('disabled')), {
		description:
			"Whether V8's compile cache could serve a cold-start process: `disabled` is `NODE_DISABLE_COMPILE_CACHE=1` with no `NODE_COMPILE_CACHE`, so every sample compiles what it loads."
	}),
	filters: BenchRunFilters,
	segments: meta(PositiveInt, {
		description:
			'How many stretches the run was measured in. 1 is an uninterrupted run, and more means it was stopped and resumed.'
	}),
	duration_ms: meta(NonnegativeInt, {
		description:
			'How long the run measured for, anchor readings included: the sum of its segments, without the time between them.'
	}),
	load_at_start: meta(NonnegativeNumber, {
		description:
			"The machine's 1-minute load average when the run was planned, before it spawned anything; for a resumed run, the highest of its segments'. Something else was running when it is well above 0."
	})
});
export type BenchRun = s.Infer<typeof BenchRun>;

/**
 * Whether a run set out to cover everything: every library on every cell, and
 * for a `full` run in every cold-start scenario, measured for real. A smoke run
 * never did, and neither did a run with any filter. Whether the file then holds
 * everything is `bench_results_find_gaps` and `bench_results_find_startup_gaps`.
 */
export const bench_run_is_complete = (run: Pick<BenchRun, 'kind' | 'filters'>): boolean =>
	run.kind !== 'smoke' && Object.values(run.filters).every((filter) => filter === null);

/** The version of Vite that bundled, first in either bundler's keys. */
const bundler_vite = meta(NonEmptyString, { description: 'The version of Vite that bundled.' });

/** What every bundler records after the one inside Vite, whichever it is. */
const bundler_shape = {
	esbuild: meta(NonEmptyString, { description: 'The version of esbuild that minified.' }),
	gzip_level: s.pipe(s.number, s.safe_integer, s.min_value(1), s.max_value(9)),
	brotli_quality: s.pipe(s.number, s.safe_integer, s.min_value(0), s.max_value(11))
};

/** What bundles from Vite 8 on: Vite with the Rolldown inside it. */
export const BenchBundlerRolldown = s.object({
	vite: bundler_vite,
	rolldown: meta(NonEmptyString, {
		description: 'The version of Rolldown inside that Vite, which bundled.'
	}),
	...bundler_shape
});
export type BenchBundlerRolldown = s.Infer<typeof BenchBundlerRolldown>;

/** What bundled up to Vite 7, which files measured then record: Vite with the Rollup inside it. */
export const BenchBundlerRollup = s.object({
	vite: bundler_vite,
	rollup: meta(NonEmptyString, {
		description: 'The version of Rollup inside that Vite, which bundled.'
	}),
	...bundler_shape
});
export type BenchBundlerRollup = s.Infer<typeof BenchBundlerRollup>;

/** The two keys a bundler is told apart by. */
const BUNDLER_KEYS = ['rolldown', 'rollup'] as const;

/**
 * What the bundle sizes were built and compressed with. Together with the
 * libraries' versions it is what the sizes depend on, apart from the zlib and
 * brotli inside the Node that compressed them. The compression levels are also
 * the ones the HTML's compressed sizes (`BenchCell.compressed`) are taken at.
 * It names exactly one of `rolldown` and `rollup`, and is reported against the
 * shape it names, so a malformed one never reads as a bare union failure.
 */
export const BenchBundler = s.message(
	s.union([BenchBundlerRolldown, BenchBundlerRollup]),
	(_issue, input) => {
		const named =
			typeof input === 'object' && input !== null ? BUNDLER_KEYS.filter((k) => k in input) : [];
		if (named.length !== 1) return 'a bundler names exactly one of rolldown and rollup';
		const parsed = s.parse(
			named[0] === 'rolldown' ? BenchBundlerRolldown : BenchBundlerRollup,
			input
		);
		const problems = parsed.ok ? [] : parsed.issues.map(format_issue_inline);
		return `a bundler built with ${named[0]}: ${problems.join('; ')}`;
	}
);
export type BenchBundler = s.Infer<typeof BenchBundler>;

/**
 * What a cold-start sample does before it stops the clock: `bare` is Node alone,
 * `core` imports a library with no language, `lang` imports it with one
 * language, `set` imports it with a feature set's languages, and
 * `first_highlight` imports it with one language and highlights once.
 */
export const BenchStartupScenario = s.one_of(['bare', 'core', 'lang', 'set', 'first_highlight']);
export type BenchStartupScenario = s.Infer<typeof BenchStartupScenario>;

/** What names a cold-start scenario: what is loaded, by which library, in which form. */
const startup_key_shape = {
	scenario: BenchStartupScenario,
	library: meta(s.nullable(LibraryId), { description: 'Null exactly for the bare Node baseline.' }),
	lang: meta(s.nullable(LangId), {
		description:
			'The language loaded, a timed one. Set exactly for the lang and first_highlight scenarios.'
	}),
	set: meta(s.nullable(Id), {
		description: 'The feature set loaded. Set exactly for the set scenario.'
	}),
	bundled: meta(s.boolean, {
		description:
			'Whether the library was loaded as one bundled chunk, the one its bundle size is measured on. Otherwise the same module was imported unbundled, resolving from `node_modules`.'
	})
};

/** What tells one cold-start scenario from another. */
export type BenchStartupKey = Pick<
	BenchStartup,
	'scenario' | 'library' | 'lang' | 'set' | 'bundled'
>;

/**
 * One cold-start measurement. Each sample is a fresh Node process that does the
 * scenario's work and nothing else, and its time is the process's own clock
 * when the work is done, which counts from the start of the process. So every
 * time includes Node starting up, and the `bare` entry is that part alone.
 * Machine-dependent.
 */
export const BenchStartup = refined(
	s.object({
		...startup_key_shape,
		samples: meta(PositiveInt, {
			description: 'How many processes were kept, after the discarded rounds.'
		}),
		median_ms: meta(PositiveNumber, {
			description: 'The median, in milliseconds since the process started.'
		}),
		p10_ms: meta(PositiveNumber, { description: '10th percentile across the samples.' }),
		p90_ms: meta(PositiveNumber, { description: '90th percentile across the samples.' }),
		spread: meta(s.pipe(s.number, s.min_value(1)), {
			description:
				"Slowest sample over fastest. A process start has a long slow tail, so this is wider than a cell's spread, and the percentiles say more."
		}),
		rss_peak_bytes: meta(PositiveInt, {
			description:
				"The median peak resident set size of the samples' processes, read when the clock stopped. A whole process: the `bare` entry's is Node's own, to subtract."
		})
	}),
	(entry, issue) => {
		if (!(entry.p10_ms <= entry.median_ms && entry.median_ms <= entry.p90_ms)) {
			issue(['median_ms'], 'the median is between the 10th and the 90th percentile');
		}
	}
);
export type BenchStartup = s.Infer<typeof BenchStartup>;

/**
 * A cold-start scenario a library was not sampled in: its first process there
 * failed to import, exported nothing, or highlighted with too few kinds of
 * span. Distinct from unsupported, which is a scenario whose languages the
 * library doesn't claim, and which has no entry anywhere.
 */
export const BenchStartupExcluded = s.object({
	...startup_key_shape,
	library: meta(LibraryId, { description: 'The id of the library.' }),
	reason: meta(NonEmptyString, { description: 'What the check found.' })
});
export type BenchStartupExcluded = s.Infer<typeof BenchStartupExcluded>;

/** The string a cold-start scenario is told apart by. */
export const to_bench_startup_key = (entry: BenchStartupKey): string =>
	JSON.stringify([entry.scenario, entry.library, entry.lang, entry.set, entry.bundled]);

/**
 * Where, when, and from what a run was produced. `generated_at`, `machine`,
 * `node`, and `commit` say where timed numbers came from, and are null only in
 * a file that has none: its numbers are the same on any machine, at any time,
 * and a commit can't name the tree it is itself committed in.
 */
export const BenchMeta = s.object({
	generated_at: meta(s.nullable(BenchDatetime), {
		description:
			'When the run started: its first segment, for a run that was resumed. Null only when nothing was timed.'
	}),
	machine: meta(s.nullable(BenchMachine), { description: 'Null only when nothing was timed.' }),
	node: meta(s.nullable(NonEmptyString), {
		description:
			'The Node version, as `process.version` prints it. Null only when nothing was timed.'
	}),
	commit: meta(s.nullable(s.pipe(s.string, s.regex(/^[0-9a-f]{40}(-dirty)?$/))), {
		description:
			'The harness commit that ran, with `-dirty` appended when the working tree had changes it does not record. Null only when nothing was timed.'
	}),
	corpus_hash: meta(Sha256, {
		description: 'A hash over the corpus manifest. Runs with different hashes are not comparable.'
	}),
	run: meta(s.nullable(BenchRun), { description: 'Null when nothing was timed.' }),
	anchor: meta(s.nullable(BenchAnchor), { description: 'Null when nothing was timed.' }),
	libraries: s.array(BenchLibrary),
	excluded: s.array(BenchExcluded),
	startup_excluded: meta(s.array(BenchStartupExcluded), {
		description:
			'The cold-start scenarios a library was not sampled in, because its first process there failed its check.'
	}),
	noise_floor: meta(s.nullable(BenchNoiseFloor), {
		description:
			'Null until the machine has been calibrated with the parameters of this run. A calibration run carries the floor it measured.'
	}),
	process_noise: meta(s.nullable(BenchProcessNoise), {
		description:
			"How far apart this run's processes came out on the same library and cell, from every value's `pass_medians_ns`. Null exactly when no cell has a value or the run measured one pass. In a calibration file it is the first arm's."
	}),
	bundler: meta(s.nullable(BenchBundler), {
		description:
			"Null exactly when `bundle` is empty: no sizes were measured. The sizes of the deterministic pass come together, so it is also null exactly when `install` and every cell's `compressed` are empty."
	})
});
export type BenchMeta = s.Infer<typeof BenchMeta>;

/** One language id of the run, as the harness declares it in `bench/langs.ts`. */
export const BenchLang = s.object({
	id: LangId,
	label: NonEmptyString,
	timed: meta(s.boolean, { description: 'Whether timed cells cover the language.' })
});
export type BenchLang = s.Infer<typeof BenchLang>;

/** A named list of languages that bundle size is measured over. */
export const BenchSet = s.object({
	id: Id,
	label: NonEmptyString,
	langs: s.array(LangId),
	footnote: s.nullable(NonEmptyString)
});
export type BenchSet = s.Infer<typeof BenchSet>;

/** What a cell measures. */
export const BenchMetric = s.one_of(['throughput']);
export type BenchMetric = s.Infer<typeof BenchMetric>;

/** One file an input came from, pinned so the input can be rebuilt and checked. */
export const BenchProvenance = s.object({
	repo: meta(s.pipe(s.string, s.regex(/^https:\/\/[^\s/?#@]+(\/[^\s/?#@]+)+$/)), {
		description:
			'The repository the file came from, as an https URL with a path and no userinfo, query, fragment, or trailing slash.'
	}),
	commit: meta(s.pipe(s.string, s.regex(/^[0-9a-f]{40}$/)), {
		description: 'The commit the file was read at.'
	}),
	path: meta(
		s.pipe(
			s.string,
			s.min_length(1),
			s.message(
				s.check((path: string) =>
					path.split('/').every((segment) => segment !== '.' && segment !== '..')
				),
				'a path has no "." or ".." segment'
			)
		),
		{ description: "The file's path in that repository." }
	),
	sha256: meta(Sha256, { description: 'The hash of the file at that commit.' }),
	license: meta(NonEmptyString, { description: 'The SPDX expression of the license it is under.' }),
	note: meta(s.nullable(NonEmptyString), {
		description: 'How the upstream describes or built the file, when it says.'
	})
});
export type BenchProvenance = s.Infer<typeof BenchProvenance>;

/**
 * One input of the corpus: a file, what it is, and where it came from. The
 * corpus manifest is a list of these, and a results file carries the ones its
 * cells measured.
 */
export const BenchInput = refined(
	s.object({
		file: meta(
			s.pipe(
				s.string,
				s.min_length(1),
				s.message(
					s.check((file: string) =>
						file
							.split('/')
							.every((segment) => segment !== '' && segment !== '.' && segment !== '..')
					),
					'a file is a relative path with no empty, "." or ".." segment'
				)
			),
			{ description: "The input's path within the corpus, which identifies it." }
		),
		source: BenchSource,
		home: meta(s.nullable(LibraryId), {
			description:
				"The library whose samples the input came from, set exactly when the source is home. It may name a library outside a run's roster."
		}),
		lang: LangId,
		size: BenchSize,
		bytes: PositiveInt,
		lines: PositiveInt,
		sha256: meta(Sha256, { description: "The hash of the input's bytes." }),
		synthetic: meta(s.boolean, {
			description:
				'Whether the input is not one real file as published: built by joining or repeating files to reach its size, or derived from a file by a transformation.'
		}),
		provenance: meta(s.array(BenchProvenance), {
			description:
				'The upstream files the input came from. Empty for an input written here, which only the harness and stress sources hold, and always for harness. One entry without a derivation is a verbatim copy with the same hash. Several are the files a synthetic input was built from.'
		}),
		derivation: meta(s.nullable(NonEmptyString), {
			description:
				'How the input was made from its provenance by a transformation, naming the tool and its version, so its hash differs from the upstream file. Null for a copy, a join, or an input written here.'
		})
	}),
	(input, issue) => {
		if ((input.source === 'home') !== (input.home !== null)) {
			issue(['home'], 'home is set exactly when the source is home');
		}
		if (input.source === 'harness' && input.provenance.length > 0) {
			issue(['provenance'], 'a harness input is written here, so it has no provenance');
		}
		if (
			input.provenance.length === 0 &&
			!(BENCH_WRITTEN_SOURCES as ReadonlyArray<string>).includes(input.source)
		) {
			issue(
				['provenance'],
				`only a ${BENCH_WRITTEN_SOURCES.join(' or ')} input may be written here, without provenance`
			);
		}
		if (input.derivation !== null && input.source !== 'stress') {
			issue(['derivation'], 'only a stress input is derived');
		}
		if (input.source === 'stress' && input.provenance.length === 0 && input.synthetic) {
			issue(
				['synthetic'],
				'a stress input written here comes from no upstream file, so it is not synthetic'
			);
		}
		if (input.derivation !== null && (input.provenance.length === 0 || !input.synthetic)) {
			issue(['derivation'], 'a derived input names what it was derived from, and is synthetic');
		}
		if (
			input.derivation === null &&
			input.provenance.length === 1 &&
			input.provenance[0]!.sha256 !== input.sha256
		) {
			issue(
				['provenance', 0, 'sha256'],
				'an input with one upstream file and no derivation is a verbatim copy, so the hashes match'
			);
		}
		if (input.provenance.length > 1 && !input.synthetic) {
			issue(['synthetic'], 'an input built from several upstream files is synthetic');
		}
	}
);
export type BenchInput = s.Infer<typeof BenchInput>;

/** One library's timing and memory in one cell. Machine-dependent. */
export const BenchCellValue = refined(
	s.object({
		ns_per_op: meta(PositiveNumber, { description: 'Median nanoseconds per call.' }),
		ops_per_sec: PositiveNumber,
		mb_per_sec: meta(PositiveNumber, { description: 'Input megabytes per second.' }),
		p10_ns: meta(PositiveNumber, { description: '10th percentile across rounds.' }),
		p90_ns: meta(PositiveNumber, { description: '90th percentile across rounds.' }),
		spread: meta(s.pipe(s.number, s.min_value(1)), {
			description: 'Slowest round over fastest. Near 1 means the rounds agreed.'
		}),
		pass_medians_ns: meta(s.pipe(s.array(PositiveNumber), s.min_length(1)), {
			description:
				"Each pass's median nanoseconds per call over its own rounds, in pass order: one number per process, `meta.run.passes` of them, so the disagreement between processes can be read apart from the rounds. Of the kept attempt, and in a calibration file of the first arm."
		}),
		iterations: meta(PositiveInt, {
			description:
				'Calls per timed batch, calibrated for this library. Each process calibrates for itself, and this is the median across them.'
		}),
		rss_peak_bytes: meta(PositiveInt, {
			description:
				"The peak resident set size of the library's process, the largest across its passes. The process holds this library alone, with Node itself and the input, so it is a whole-process peak and not what the library adds. The process warms up and is timed for a fixed duration, so on a small input the peak follows how much the library allocated in that time more than what it holds: a cold-start entry's `rss_peak_bytes` is the figure to compare footprints by."
		}),
		attempts: meta(PositiveInt, {
			description:
				'How many times the library was measured on this cell. 1 is once. More means its rounds disagreed and it was measured again: every other number here, the spread and the percentiles included, is from the attempt whose rounds agreed best, whichever was faster, so they describe its calmest attempt. In a calibration file it counts the attempts of the first arm, which the value is from.'
		})
	}),
	(value, issue) => {
		if (!(value.p10_ns <= value.p90_ns)) {
			issue(['p10_ns'], 'the 10th percentile is at most the 90th');
		}
	}
);
export type BenchCellValue = s.Infer<typeof BenchCellValue>;

/** The size of one library's HTML for a cell's input. Deterministic. */
export const BenchCellOutput = s.object({
	html_bytes: PositiveInt,
	spans: meta(NonnegativeInt, { description: 'How many elements the HTML has.' })
});
export type BenchCellOutput = s.Infer<typeof BenchCellOutput>;

/**
 * The size of one library's HTML for a cell's input once compressed, at the
 * levels `BenchBundler` records: what a server sends for a page that renders the
 * highlighted input. Its raw size is `BenchCellOutput.html_bytes`. Deterministic.
 */
export const BenchCellCompressed = s.object({
	gzip: meta(PositiveInt, { description: 'The HTML, gzipped.' }),
	brotli: meta(PositiveInt, { description: 'The HTML, brotli-compressed.' })
});
export type BenchCellCompressed = s.Infer<typeof BenchCellCompressed>;

/**
 * The id of a cell: its input's file and its mode, which together are unique in
 * a run.
 */
export const to_bench_cell_id = (file: string, mode: BenchMode): string => `${file}:${mode}`;

/**
 * One input measured in one mode, across libraries. A library absent from
 * `values`, `tokens`, and `output` was not measured here: it is unsupported,
 * excluded, or outside the run's filters.
 *
 * Each deterministic number is stated once for an input, on the cell whose call
 * returns it: `tokens` on the `tokenize` cell, since it counts what `tokenize`
 * returned, and `output` on the `html` cell. The other is empty there.
 */
export const BenchCell = s.object({
	id: meta(Id, {
		description:
			'The file and the mode, as `<file>:<mode>`. Unique within the run, and `meta.excluded` refers to it.'
	}),
	metric: BenchMetric,
	lang: LangId,
	size: BenchSize,
	mode: BenchMode,
	source: BenchSource,
	home: meta(s.nullable(LibraryId), {
		description:
			"The library whose samples the input came from, set exactly when the source is home. It may name a library outside this run's roster."
	}),
	file: meta(NonEmptyString, { description: "The input's path within the corpus." }),
	bytes: PositiveInt,
	lines: PositiveInt,
	synthetic: meta(s.boolean, {
		description:
			'Whether the input was built by joining or repeating files to reach its size, rather than being one real file.'
	}),
	values: meta(strict_record(is_name, BenchCellValue), {
		description: 'Machine-dependent: timing and memory by library id.'
	}),
	tokens: meta(strict_record(is_name, PositiveInt), {
		description:
			"Deterministic: each library's own token count, by library id. Stated on the `tokenize` cell and empty on any other."
	}),
	output: meta(strict_record(is_name, BenchCellOutput), {
		description:
			'Deterministic: HTML size by library id. Stated on the `html` cell and empty on any other.'
	}),
	compressed: meta(strict_record(is_name, BenchCellCompressed), {
		description:
			"Deterministic: the HTML's compressed sizes by library id, from the deterministic pass. Stated on the `html` cell for exactly the libraries of `output` when the file holds that pass's sizes (`meta.bundler` is set), and empty otherwise and on any other cell."
	})
});
export type BenchCell = s.Infer<typeof BenchCell>;

/**
 * The most a compressed size may exceed the raw one by: a compression format
 * adds a header and a little framing, so a few bytes of input, or bytes that
 * don't compress, come out slightly larger. Anything past that is a mistake.
 */
export const to_max_compressed_bytes = (raw: number): number => raw + 64 + Math.ceil(raw / 100);

/** The shape of some bytes measured raw and compressed. */
const byte_sizes_shape = {
	raw: meta(PositiveInt, { description: 'The bytes as served uncompressed.' }),
	gzip: meta(PositiveInt, { description: 'Those bytes, gzipped.' }),
	brotli: meta(PositiveInt, { description: 'Those bytes, brotli-compressed.' })
};

/** Rejects a compressed size implausibly larger than the raw one. */
const refine_byte_sizes = (
	sizes: { raw: number; gzip: number; brotli: number },
	issue: BenchIssueReporter
): void => {
	for (const key of ['gzip', 'brotli'] as const) {
		if (sizes[key] > to_max_compressed_bytes(sizes.raw)) {
			issue([key], `${key} is larger than raw by more than a compression format's own overhead`);
		}
	}
};

/** Some bytes a page loads, measured raw and compressed. Deterministic. */
export const BenchByteSizes = refined(s.object(byte_sizes_shape), refine_byte_sizes);
export type BenchByteSizes = s.Infer<typeof BenchByteSizes>;

/**
 * The bundled size of one library over one feature set: `raw`, `gzip`, and
 * `brotli` are the minified JS, and what else a page loads for the
 * library has a section of its own. Deterministic.
 */
export const BenchBundleSizes = refined(
	s.object({
		...byte_sizes_shape,
		wasm: meta(s.nullable(BenchByteSizes), {
			description:
				'The WebAssembly binaries the library loads, kept out of the JS figures. Null when it loads none.'
		}),
		css: meta(s.nullable(BenchByteSizes), {
			description:
				'The default theme stylesheets, minified, each compressed on its own and summed, kept out of the JS figures. Null exactly when the library writes its styles inline: its theme is then in the JS figures.'
		})
	}),
	refine_byte_sizes
);
export type BenchBundleSizes = s.Infer<typeof BenchBundleSizes>;

/**
 * What `npm install` of a library adds: the runtime dependency closure of its
 * package and its extra packages, each package counted once, as this
 * repository's lockfile installs them. Deterministic.
 */
export const BenchInstall = refined(
	s.object({
		packages: meta(PositiveInt, { description: 'The packages in the closure.' }),
		files: meta(PositiveInt, { description: 'The files those packages hold.' }),
		bytes: meta(PositiveInt, {
			description: "The sum of those files' sizes, as stored, not as disk blocks."
		}),
		closure: meta(Sha256, {
			description:
				'SHA-256 over the sorted `name@version` list of the closure: what pins the figures, transitive versions included, so two files can be compared on it.'
		})
	}),
	(install, issue) => {
		if (!(install.files >= install.packages)) {
			issue(['files'], 'every package has at least its manifest');
		}
	}
);
export type BenchInstall = s.Infer<typeof BenchInstall>;

/**
 * What a library holds once one language is loaded and highlighted once, over a
 * bare Node process: its `single:<lang>` bundle imported, the language's harness
 * snippet highlighted, and garbage collected until the heap settles. That is
 * after one highlight of a small snippet; larger inputs leave more, most of all
 * for regexp and wasm engines. Deterministic for a Node version and platform
 * (the one the check workflow pins, on x64), within `heap_readings_agree`.
 */
export const BenchHeap = s.object({
	retained_kb: meta(NonnegativeInt, {
		description: "V8's heap in use, in KiB, less the spaces of machine code (`code_kb`)."
	}),
	code_kb: meta(NonnegativeInt, {
		description:
			"V8's code spaces in use, in KiB: the regular expressions compiled to native code as well as optimized functions. Machine code is the architecture's, and the figure is x64's."
	}),
	external_kb: meta(NonnegativeInt, {
		description:
			"`process.memoryUsage().external` in KiB: memory outside V8's heap that V8 is told about, like array buffers, and a WebAssembly engine's linear memory, counted at the size it has grown to, which it never gives back. The OS backs only the pages it has touched, so resident memory can be lower."
	})
});
export type BenchHeap = s.Infer<typeof BenchHeap>;

/**
 * Whether two heap readings, in KiB, are the same reading: within
 * `HEAP_TOLERANCE_KB`, or `HEAP_TOLERANCE_RATIO` of the larger, whichever is
 * larger.
 */
export const heap_readings_agree = (a: number, b: number): boolean =>
	Math.abs(a - b) <= Math.max(HEAP_TOLERANCE_KB, HEAP_TOLERANCE_RATIO * Math.max(a, b));

/** Whether two heap entries are the same reading, each number within `heap_readings_agree`. */
export const bench_heap_agrees = (a: BenchHeap, b: BenchHeap): boolean =>
	heap_readings_agree(a.retained_kb, b.retained_kb) &&
	heap_readings_agree(a.code_kb, b.code_kb) &&
	heap_readings_agree(a.external_kb, b.external_kb);

/** Whether two `heap` sections hold the same readings, each within `heap_readings_agree`. */
export const bench_heaps_agree = (a: BenchResults['heap'], b: BenchResults['heap']): boolean => {
	const keys = (record: object): string => JSON.stringify(Object.keys(record).sort());
	if (keys(a) !== keys(b)) return false;
	return Object.entries(a).every(([library, by_lang]) => {
		const other = b[library]!;
		if (keys(by_lang) !== keys(other)) return false;
		return Object.entries(by_lang).every(([lang, entry]) => bench_heap_agrees(entry, other[lang]!));
	});
};

/** A feature set a library can't be measured over, naming the languages it lacks. */
export const BenchBundleUnsupported = s.object({
	unsupported: s.pipe(s.array(LangId), s.min_length(1))
});
export type BenchBundleUnsupported = s.Infer<typeof BenchBundleUnsupported>;

/**
 * One library's result for one feature set: its sizes, or why there are none.
 * An entry with an `unsupported` key is read as the latter and anything else as
 * sizes, so a malformed entry is reported against the shape it was meant to be.
 */
export const BenchBundleEntry = s.message(
	s.union([BenchBundleSizes, BenchBundleUnsupported]),
	(_issue, input) => {
		const unsupported = typeof input === 'object' && input !== null && 'unsupported' in input;
		const parsed = s.parse(unsupported ? BenchBundleUnsupported : BenchBundleSizes, input);
		const problems = parsed.ok ? [] : parsed.issues.map(format_issue_inline);
		return `a bundle entry is sizes {raw, gzip, brotli, wasm, css} or {unsupported: [langs]}; read as ${unsupported ? 'unsupported' : 'sizes'}: ${problems.join('; ')}`;
	}
);
export type BenchBundleEntry = s.Infer<typeof BenchBundleEntry>;

/**
 * How a library supports a language it claims: `true` for directly, or a
 * footnote for anything a reader should know, like a third-party grammar.
 */
export const BenchCoverageEntry = s.union([s.literal(true), s.object({ via: NonEmptyString })]);
export type BenchCoverageEntry = s.Infer<typeof BenchCoverageEntry>;

/** What a cell repeats from its input, which must agree with the `inputs` roster. */
const INPUT_KEYS_ON_CELL = [
	'lang',
	'size',
	'source',
	'home',
	'bytes',
	'lines',
	'synthetic'
] as const;

/** Whether a library's coverage has an own entry for a language. */
const coverage_claims = (
	coverage: Record<string, Record<string, unknown>>,
	library: string,
	lang: string
): boolean => Object.hasOwn(coverage, library) && Object.hasOwn(coverage[library]!, lang);

/** Something a results file lacks that a complete run would have, and where. */
export interface BenchResultsGap {
	path: Array<string | number>;
	message: string;
}

/** The parts of a results file that say whether it has a gap. */
export interface BenchResultsCoverage {
	meta: { libraries: Array<{ id: string }>; excluded: Array<BenchExcluded> };
	langs: Array<BenchLang>;
	inputs: Array<{ file: string; lang: string }>;
	cells: Array<Pick<BenchCell, 'id' | 'lang' | 'mode' | 'values' | 'tokens' | 'output'>>;
	coverage: Record<string, Record<string, unknown>>;
}

/**
 * Lists what a results file lacks to be a complete run, from the file alone:
 *
 * - in every cell, every library of the roster that claims the cell's language
 *   has a number or an entry in `meta.excluded`. The number is a timed value,
 *   or for a deterministic-only file the one the cell states: its token count
 *   on a `tokenize` cell, its output size on an `html` cell
 * - every listed input of a timed language that some library claims has a cell
 *   in every mode the file's cells use
 *
 * It can't tell that an input is missing altogether, or a whole mode: the
 * `inputs` roster lists what was measured, only `meta.corpus_hash` names the
 * corpus it came from, and the modes are taken from the cells so that a file
 * stays valid when the harness gains a mode.
 *
 * @param results - the file, or the parts of it that say
 * @param numbers - which numbers the file should be complete in: its timed
 * `values`, or the `deterministic` number each cell states
 * @returns the gaps, none for a file that covers everything it lists
 */
export const bench_results_find_gaps = (
	results: BenchResultsCoverage,
	numbers: 'values' | 'deterministic' = 'values'
): Array<BenchResultsGap> => {
	const gaps: Array<BenchResultsGap> = [];
	const excluded = new Set(results.meta.excluded.map((e) => JSON.stringify([e.cell, e.library])));
	for (const [i, cell] of results.cells.entries()) {
		const section =
			numbers === 'values' ? 'values' : cell.mode === 'tokenize' ? 'tokens' : 'output';
		for (const { id } of results.meta.libraries) {
			if (
				coverage_claims(results.coverage, id, cell.lang) &&
				!Object.hasOwn(cell[section], id) &&
				!excluded.has(JSON.stringify([cell.id, id]))
			) {
				gaps.push({
					path: ['cells', i, section],
					message: `library "${id}" claims lang "${cell.lang}" and has neither ${section === 'values' ? 'a value' : `its ${section}`} nor an excluded entry here`
				});
			}
		}
	}
	const cell_ids = new Set(results.cells.map((cell) => cell.id));
	const modes = new Set(results.cells.map((cell) => cell.mode));
	const timed_langs = new Set(results.langs.filter((l) => l.timed).map((l) => l.id));
	for (const [i, input] of results.inputs.entries()) {
		if (!timed_langs.has(input.lang)) continue;
		if (!results.meta.libraries.some((l) => coverage_claims(results.coverage, l.id, input.lang))) {
			continue;
		}
		for (const mode of modes) {
			if (!cell_ids.has(to_bench_cell_id(input.file, mode))) {
				gaps.push({ path: ['inputs', i], message: `input "${input.file}" has no ${mode} cell` });
			}
		}
	}
	return gaps;
};

/** The parts of a results file that say whether its cold start has a gap. */
export interface BenchResultsStartupCoverage {
	meta: { libraries: Array<{ id: string }>; startup_excluded: Array<BenchStartupKey> };
	langs: Array<BenchLang>;
	sets: Array<{ id: string; langs: Array<string> }>;
	startup: Array<BenchStartupKey>;
	coverage: Record<string, Record<string, unknown>>;
}

/**
 * Lists the cold-start scenarios a results file lacks to be a complete run, from
 * the file alone. Each of these has an entry in `startup` or in
 * `meta.startup_excluded`:
 *
 * - the `bare` baseline
 * - for every library of the roster, unbundled and bundled: `core`, then `lang`
 *   and `first_highlight` for every timed language it claims, then `set` for
 *   every feature set the file's cold start names, where the library claims
 *   every language of it
 *
 * A scenario over a language or a set the library doesn't claim is unsupported,
 * and is no gap. The sets are taken from the file, since the schema doesn't say
 * which sets a harness starts cold. So one thing the file can't show: with every
 * `set` entry removed it names no set, and still reads as complete.
 *
 * @param results - the file, or the parts of it that say
 * @returns the gaps, none for a file whose cold start is whole
 */
export const bench_results_find_startup_gaps = (
	results: BenchResultsStartupCoverage
): Array<BenchResultsGap> => {
	const entries = [...results.startup, ...results.meta.startup_excluded];
	const have = new Set(entries.map(to_bench_startup_key));
	const set_ids = new Set(entries.flatMap((entry) => entry.set ?? []));
	const sets = results.sets.filter((set) => set_ids.has(set.id));
	const timed_langs = results.langs.filter((l) => l.timed).map((l) => l.id);
	const implied: Array<BenchStartupKey> = [
		{ scenario: 'bare', library: null, lang: null, set: null, bundled: false }
	];
	for (const { id: library } of results.meta.libraries) {
		const claimed = timed_langs.filter((lang) => coverage_claims(results.coverage, library, lang));
		for (const bundled of [false, true]) {
			implied.push({ scenario: 'core', library, lang: null, set: null, bundled });
			for (const scenario of ['lang', 'first_highlight'] as const) {
				for (const lang of claimed) implied.push({ scenario, library, lang, set: null, bundled });
			}
			for (const set of sets) {
				if (set.langs.every((lang) => coverage_claims(results.coverage, library, lang))) {
					implied.push({ scenario: 'set', library, lang: null, set: set.id, bundled });
				}
			}
		}
	}
	return implied
		.filter((key) => !have.has(to_bench_startup_key(key)))
		.map((key) => ({
			path: ['startup'],
			message: `${key.library === null ? 'the bare baseline' : `library "${key.library}"`} has neither an entry nor an excluded entry for the ${key.bundled ? 'bundled' : 'unbundled'} ${key.scenario} scenario${key.lang === null ? '' : ` of lang "${key.lang}"`}${key.set === null ? '' : ` of set "${key.set}"`}`
		}));
};

/**
 * One run of the benchmark. Beyond each section's shape, parsing checks that
 * the sections agree: ids are unique and refer to roster entries, every cell
 * describes its input as the `inputs` roster does and is named after it, no
 * library has numbers for a language it doesn't claim or a cell it was excluded
 * from, no cell covers an untimed language, a run with timed numbers has an
 * anchor, its run parameters, and where it came from, a run with no filters has
 * no gap (`bench_results_find_gaps`, and for a `full` run
 * `bench_results_find_startup_gaps`), each deterministic number of an input is
 * stated on one cell, and bundle sizes cover every library and set or none, as
 * the install footprints cover every library and the compressed HTML sizes every
 * library with an HTML size.
 */
export const BenchResults = refined(
	s.object({
		meta: BenchMeta,
		langs: s.array(BenchLang),
		sets: s.array(BenchSet),
		inputs: meta(s.array(BenchInput), {
			description: 'The corpus inputs the cells measured, with where each came from.'
		}),
		cells: s.array(BenchCell),
		startup: meta(s.array(BenchStartup), {
			description: 'Machine-dependent. Empty when cold start was not measured.'
		}),
		bundle: meta(strict_record(is_name, strict_record(is_id, BenchBundleEntry)), {
			description: 'Deterministic: library id, then set id. Empty when sizes were not measured.'
		}),
		install: meta(strict_record(is_name, BenchInstall), {
			description:
				'Deterministic: the install footprint by library id. Every library of the roster, or empty when sizes were not measured.'
		}),
		heap: meta(strict_record(is_name, strict_record(is_name, BenchHeap)), {
			description:
				'Deterministic within a few KiB: the retained heap by library id, then every timed language it claims. Empty when sizes were not measured.'
		}),
		coverage: meta(strict_record(is_name, strict_record(is_name, BenchCoverageEntry)), {
			description:
				'Deterministic: library id, then the languages it claims. An absent language is unsupported.'
		})
	}),
	(results, issue) => {
		const unique = (
			ids: Array<string>,
			path: Array<string | number>,
			kind: string
		): Set<string> => {
			const seen: Set<string> = new Set();
			for (const [i, id] of ids.entries()) {
				if (seen.has(id)) issue([...path, i, 'id'], `duplicate ${kind} id "${id}"`);
				seen.add(id);
			}
			return seen;
		};

		const library_ids = unique(
			results.meta.libraries.map((l) => l.id),
			['meta', 'libraries'],
			'library'
		);
		const lang_ids = unique(
			results.langs.map((l) => l.id),
			['langs'],
			'lang'
		);
		const sets = new Map(results.sets.map((s) => [s.id, s]));
		unique(
			results.sets.map((s) => s.id),
			['sets'],
			'set'
		);
		const cells = new Map(results.cells.map((c) => [c.id, c]));
		unique(
			results.cells.map((c) => c.id),
			['cells'],
			'cell'
		);
		const inputs = new Map(results.inputs.map((input) => [input.file, input]));
		const untimed_langs = new Set(results.langs.filter((l) => !l.timed).map((l) => l.id));
		const claims = (library: string, lang: string): boolean =>
			coverage_claims(results.coverage, library, lang);

		// rosters
		for (const [i, set] of results.sets.entries()) {
			for (const [j, lang] of set.langs.entries()) {
				if (!lang_ids.has(lang)) issue(['sets', i, 'langs', j], `unknown lang "${lang}"`);
				if (set.langs.indexOf(lang) !== j) {
					issue(['sets', i, 'langs', j], `duplicate lang "${lang}" in set "${set.id}"`);
				}
			}
		}

		// inputs
		for (const [i, input] of results.inputs.entries()) {
			if (!lang_ids.has(input.lang)) issue(['inputs', i, 'lang'], `unknown lang "${input.lang}"`);
			if (results.inputs.findIndex((other) => other.file === input.file) !== i) {
				issue(['inputs', i, 'file'], `duplicate input file "${input.file}"`);
			}
		}

		// coverage: every library has an entry, even an empty one
		for (const id of library_ids) {
			if (!Object.hasOwn(results.coverage, id)) {
				issue(['coverage'], `library "${id}" has no coverage entry`);
			}
		}
		for (const [library, langs] of Object.entries(results.coverage)) {
			if (!library_ids.has(library)) issue(['coverage', library], `unknown library "${library}"`);
			for (const lang of Object.keys(langs)) {
				if (!lang_ids.has(lang)) issue(['coverage', library, lang], `unknown lang "${lang}"`);
			}
		}

		// excluded: a claimed language that failed the check, never an unclaimed one
		const excluded: Set<string> = new Set();
		for (const [i, entry] of results.meta.excluded.entries()) {
			const path = ['meta', 'excluded', i];
			const cell = cells.get(entry.cell);
			if (!cell) issue([...path, 'cell'], `unknown cell "${entry.cell}"`);
			if (!library_ids.has(entry.library)) {
				issue([...path, 'library'], `unknown library "${entry.library}"`);
			} else if (cell && lang_ids.has(cell.lang) && !claims(entry.library, cell.lang)) {
				issue(
					path,
					`library "${entry.library}" doesn't claim lang "${cell.lang}", so it is unsupported there, not excluded`
				);
			}
			const key = JSON.stringify([entry.cell, entry.library]);
			if (excluded.has(key)) issue(path, 'duplicate excluded entry');
			excluded.add(key);
		}

		// cells
		const cell_inputs: Set<string> = new Set();
		let timed = results.startup.length > 0 || results.meta.startup_excluded.length > 0;
		let cells_timed = false;
		for (const [i, cell] of results.cells.entries()) {
			const path = ['cells', i];
			if (cell.id !== to_bench_cell_id(cell.file, cell.mode)) {
				issue([...path, 'id'], `expected "${to_bench_cell_id(cell.file, cell.mode)}"`);
			}
			if (!lang_ids.has(cell.lang)) issue([...path, 'lang'], `unknown lang "${cell.lang}"`);
			if (untimed_langs.has(cell.lang)) {
				issue([...path, 'lang'], `lang "${cell.lang}" is not timed, so no cell covers it`);
			}
			const input = JSON.stringify([
				cell.metric,
				cell.lang,
				cell.size,
				cell.mode,
				cell.source,
				cell.home,
				cell.file
			]);
			if (cell_inputs.has(input)) issue(path, 'duplicate cell: same input, mode, and metric');
			cell_inputs.add(input);
			if (Object.keys(cell.values).length > 0) timed = cells_timed = true;
			if ((cell.source === 'home') !== (cell.home !== null)) {
				issue([...path, 'home'], 'home is set exactly when the source is home');
			}
			const cell_input = inputs.get(cell.file);
			if (!cell_input) {
				issue([...path, 'file'], `unknown input "${cell.file}"`);
			} else {
				for (const key of INPUT_KEYS_ON_CELL) {
					if (cell[key] !== cell_input[key]) {
						issue([...path, key], `${key} disagrees with input "${cell.file}"`);
					}
				}
			}
			// each deterministic number is stated once for an input, on the cell whose call returns it
			const stated = cell.mode === 'tokenize' ? 'tokens' : 'output';
			const unstated =
				cell.mode === 'tokenize' ? (['output', 'compressed'] as const) : (['tokens'] as const);
			for (const key of unstated) {
				if (Object.keys(cell[key]).length > 0) {
					issue(
						[...path, key],
						`${key} is stated on the input's ${cell.mode === 'tokenize' ? 'html' : 'tokenize'} cell, and is empty here`
					);
				}
			}
			// the compressed sizes: for every library with an output when the pass's sizes are here
			for (const library of Object.keys(cell.compressed)) {
				const output = cell.output[library];
				const at = [...path, 'compressed', library];
				if (output === undefined) {
					if (cell.mode === 'html') issue(at, `library "${library}" has no output to compress`);
					continue;
				}
				for (const key of ['gzip', 'brotli'] as const) {
					if (cell.compressed[library]![key] > to_max_compressed_bytes(output.html_bytes)) {
						issue(
							[...at, key],
							`${key} is larger than html_bytes by more than a compression format's own overhead`
						);
					}
				}
			}
			if (cell.mode === 'html') {
				for (const library of Object.keys(cell.output)) {
					if (Object.hasOwn(cell.compressed, library) !== (results.meta.bundler !== null)) {
						issue(
							[...path, 'compressed', library],
							results.meta.bundler === null
								? `library "${library}" has compressed sizes, and the file holds no sizes of the deterministic pass`
								: `library "${library}" has an output and no compressed sizes`
						);
					}
				}
			}
			for (const library of Object.keys(cell.values)) {
				if (!Object.hasOwn(cell[stated], library)) {
					issue([...path, stated], `library "${library}" has a value here and no ${stated}`);
				}
			}
			for (const section of ['values', 'tokens', 'output'] as const) {
				for (const library of Object.keys(cell[section])) {
					const at = [...path, section, library];
					if (!library_ids.has(library)) {
						issue(at, `unknown library "${library}"`);
					} else if (lang_ids.has(cell.lang) && !claims(library, cell.lang)) {
						// an unknown lang is one issue on the cell, not one for every library
						issue(at, `library "${library}" doesn't claim lang "${cell.lang}"`);
					} else if (excluded.has(JSON.stringify([cell.id, library]))) {
						issue(at, `library "${library}" is excluded from this cell`);
					}
				}
			}
		}

		if (timed && results.meta.anchor === null) {
			issue(['meta', 'anchor'], 'a run with timed numbers needs an anchor');
		}
		for (const key of ['generated_at', 'machine', 'node', 'commit'] as const) {
			if (timed && results.meta[key] === null) {
				issue(['meta', key], `a run with timed numbers records its ${key}`);
			}
		}
		if (timed && results.meta.run === null) {
			issue(['meta', 'run'], 'a run with timed numbers records how they were measured');
		}
		// run: the filters describe what the file holds
		const { run } = results.meta;
		if (run) {
			const { filters } = run;
			for (const [key, ids] of Object.entries(filters) as Array<[string, Array<string> | null]>) {
				for (const [i, id] of (ids ?? []).entries()) {
					if (ids!.indexOf(id) !== i) {
						issue(['meta', 'run', 'filters', key, i], `duplicate "${id}" in the filter`);
					}
				}
			}
			for (const [i, lang] of (filters.langs ?? []).entries()) {
				if (!lang_ids.has(lang)) {
					issue(['meta', 'run', 'filters', 'langs', i], `unknown lang "${lang}"`);
				}
			}
			if (
				filters.libraries &&
				(filters.libraries.length !== results.meta.libraries.length ||
					results.meta.libraries.some((library, i) => library.id !== filters.libraries![i]))
			) {
				issue(
					['meta', 'run', 'filters', 'libraries'],
					'a run filtered by library lists exactly those libraries, in the same order'
				);
			}
			for (const [i, cell] of results.cells.entries()) {
				const outside = (
					[
						['langs', cell.lang],
						['sizes', cell.size],
						['modes', cell.mode],
						['sources', cell.source]
					] as const
				).filter(
					([key, value]) => filters[key] && !(filters[key] as Array<string>).includes(value)
				);
				for (const [key, value] of outside) {
					issue(['cells', i], `"${value}" is outside the run's ${key} filter`);
				}
			}
			if (run.kind === 'smoke' && results.meta.noise_floor !== null) {
				issue(['meta', 'noise_floor'], 'a smoke run carries no noise floor');
			}
			if (run.kind === 'smoke' && (run.retries !== 0 || run.segments !== 1)) {
				issue(['meta', 'run'], 'a smoke run is neither retried nor resumed');
			}
			for (const [i, cell] of results.cells.entries()) {
				for (const [library, value] of Object.entries(cell.values)) {
					if (value.attempts > run.retries + 1) {
						issue(
							['cells', i, 'values', library, 'attempts'],
							`more attempts than the run's ${run.retries} retries allow`
						);
					}
					if (value.pass_medians_ns.length !== run.passes) {
						issue(
							['cells', i, 'values', library, 'pass_medians_ns'],
							`a median for each of the run's ${run.passes} passes`
						);
					}
				}
			}
			if (filters.metrics && !filters.metrics.includes('throughput') && cells_timed) {
				issue(['cells'], "timed cells are outside the run's metrics filter");
			}
			// how cold start was sampled is recorded exactly when the run measured any
			const measures_startup =
				run.kind !== 'calibrate' && (filters.metrics?.includes('startup') ?? true);
			for (const key of ['startup_samples', 'startup_discard', 'startup_compile_cache'] as const) {
				if ((run[key] !== null) !== measures_startup) {
					issue(
						['meta', 'run', key],
						`${key} is set exactly when the run measures cold start: not a calibration, and not left out by the metrics filter`
					);
				}
			}
			const has_startup = results.startup.length + results.meta.startup_excluded.length > 0;
			if (has_startup && filters.metrics && !filters.metrics.includes('startup')) {
				issue(['startup'], "cold start is outside the run's metrics filter");
			}
			if (has_startup && run.kind === 'calibrate') {
				issue(['startup'], 'a calibration measures no cold start');
			}
			// a run that says it covered everything has no gap
			if (cells_timed && bench_run_is_complete(run)) {
				for (const gap of bench_results_find_gaps(results)) issue(gap.path, gap.message);
			}
			if (timed && run.kind === 'full' && bench_run_is_complete(run)) {
				for (const gap of bench_results_find_startup_gaps(results)) issue(gap.path, gap.message);
			}
		}
		// process noise is over every pair of a value's passes, so it is there exactly when a pair is
		const { process_noise } = results.meta;
		const passes = run?.passes ?? 0;
		const values_count = results.cells.reduce((n, cell) => n + Object.keys(cell.values).length, 0);
		const pairs = (values_count * passes * (passes - 1)) / 2;
		if ((process_noise !== null) !== pairs > 0) {
			issue(
				['meta', 'process_noise'],
				'process noise is set exactly when a cell has a value and the run measured more than one pass'
			);
		} else if (process_noise !== null && process_noise.pairs !== pairs) {
			issue(
				['meta', 'process_noise', 'pairs'],
				`${pairs} pairs: every pair of passes of every value, with ${values_count} values of ${passes} passes`
			);
		}
		if (!run && !cells_timed) {
			// a deterministic-only file has no filters, so it covers everything it lists
			for (const gap of bench_results_find_gaps(results, 'deterministic')) {
				issue(gap.path, gap.message);
			}
		}

		// startup: the entries and the exclusions name scenarios the same way
		const startup_keys: Set<string> = new Set();
		const check_startup_key = (entry: BenchStartupKey, path: Array<string | number>): void => {
			const { scenario, library } = entry;
			const key = to_bench_startup_key(entry);
			if (startup_keys.has(key)) issue(path, 'duplicate startup entry');
			startup_keys.add(key);
			if ((scenario === 'lang' || scenario === 'first_highlight') !== (entry.lang !== null)) {
				issue([...path, 'lang'], 'lang is set exactly for the lang and first_highlight scenarios');
			}
			if ((scenario === 'set') !== (entry.set !== null)) {
				issue([...path, 'set'], 'set is set exactly for the set scenario');
			}
			if (scenario === 'bare' && entry.bundled) {
				issue([...path, 'bundled'], 'the bare scenario loads nothing to bundle');
			}
			if (library !== null && library_ids.has(library)) {
				if (entry.lang !== null && lang_ids.has(entry.lang) && !claims(library, entry.lang)) {
					issue([...path, 'lang'], `library "${library}" doesn't claim lang "${entry.lang}"`);
				}
				const unclaimed =
					entry.set === null
						? []
						: (sets.get(entry.set)?.langs ?? []).filter((lang) => !claims(library, lang));
				if (unclaimed.length) {
					issue(
						[...path, 'set'],
						`library "${library}" doesn't claim every lang of set "${entry.set}": ${unclaimed.join(', ')}`
					);
				}
			}
			if ((scenario === 'bare') !== (library === null)) {
				issue([...path, 'library'], 'library is null exactly for the bare scenario');
			}
			if (library !== null && !library_ids.has(library)) {
				issue([...path, 'library'], `unknown library "${library}"`);
			}
			if (entry.lang !== null && !lang_ids.has(entry.lang)) {
				issue([...path, 'lang'], `unknown lang "${entry.lang}"`);
			}
			// a set may hold an untimed language, and a scenario of one language may not be one
			if (entry.lang !== null && untimed_langs.has(entry.lang)) {
				issue(
					[...path, 'lang'],
					`lang "${entry.lang}" is not timed, so no cold-start scenario loads it alone`
				);
			}
			if (entry.lang !== null && run?.filters.langs && !run.filters.langs.includes(entry.lang)) {
				issue([...path, 'lang'], `"${entry.lang}" is outside the run's langs filter`);
			}
			if (entry.set !== null && !sets.has(entry.set)) {
				issue([...path, 'set'], `unknown set "${entry.set}"`);
			}
		};
		for (const [i, entry] of results.startup.entries()) {
			check_startup_key(entry, ['startup', i]);
			if (run && entry.samples !== run.startup_samples) {
				issue(
					['startup', i, 'samples'],
					`every scenario keeps the run's ${run.startup_samples} samples`
				);
			}
		}
		// in the same set of keys: a scenario is measured or excluded, never both
		for (const [i, entry] of results.meta.startup_excluded.entries()) {
			check_startup_key(entry, ['meta', 'startup_excluded', i]);
		}

		// bundle: measured for every library over every set, or not at all
		const bundle_measured = Object.keys(results.bundle).length > 0;
		if (bundle_measured !== (results.meta.bundler !== null)) {
			issue(['meta', 'bundler'], 'bundler is set exactly when bundle sizes were measured');
		}
		const libraries = new Map(results.meta.libraries.map((l) => [l.id, l]));
		for (const id of bundle_measured ? library_ids : []) {
			if (!Object.hasOwn(results.install, id)) {
				issue(['install'], `library "${id}" has no install footprint`);
			}
			if (!Object.hasOwn(results.bundle, id)) {
				issue(['bundle'], `library "${id}" has no bundle entry`);
				continue;
			}
			for (const set of results.sets) {
				if (!Object.hasOwn(results.bundle[id]!, set.id)) {
					issue(['bundle', id], `library "${id}" has no entry for set "${set.id}"`);
				}
			}
		}
		for (const library of Object.keys(results.install)) {
			if (!library_ids.has(library)) issue(['install', library], `unknown library "${library}"`);
			else if (!bundle_measured) {
				issue(
					['install', library],
					'install footprints come with the bundle sizes, and there are none'
				);
			}
		}
		// heap: every timed language each library claims, exactly, with the bundle sizes
		for (const id of bundle_measured ? library_ids : []) {
			for (const lang of results.langs) {
				if (lang.timed && claims(id, lang.id) && !Object.hasOwn(results.heap[id] ?? {}, lang.id)) {
					issue(['heap', id], `library "${id}" has no retained heap for "${lang.id}"`);
				}
			}
		}
		const timed_lang_ids = new Set(results.langs.filter((l) => l.timed).map((l) => l.id));
		for (const [library, by_lang] of Object.entries(results.heap)) {
			if (!library_ids.has(library)) {
				issue(['heap', library], `unknown library "${library}"`);
				continue;
			}
			if (!bundle_measured) {
				issue(['heap', library], 'retained heaps come with the bundle sizes, and there are none');
			}
			for (const lang of Object.keys(by_lang)) {
				if (!timed_lang_ids.has(lang)) {
					issue(['heap', library, lang], `"${lang}" is not a timed language of the file`);
				} else if (!claims(library, lang)) {
					issue(['heap', library, lang], `library "${library}" doesn't claim "${lang}"`);
				}
			}
		}
		// sizes only where every language is claimed; otherwise the missing ones, exactly
		for (const [library, by_set] of Object.entries(results.bundle)) {
			if (!library_ids.has(library)) {
				issue(['bundle', library], `unknown library "${library}"`);
				continue;
			}
			const inline = libraries.get(library)!.output === 'inline_styles';
			for (const [set_id, entry] of Object.entries(by_set)) {
				const path = ['bundle', library, set_id];
				const set = sets.get(set_id);
				if (!set) {
					issue(path, `unknown set "${set_id}"`);
					continue;
				}
				const missing = set.langs.filter((lang) => !claims(library, lang));
				if ('unsupported' in entry) {
					if (
						entry.unsupported.length !== missing.length ||
						!missing.every((lang) => entry.unsupported.includes(lang))
					) {
						issue(
							[...path, 'unsupported'],
							`expected the langs of set "${set_id}" that "${library}" doesn't claim: ${missing.join(', ') || 'none'}`
						);
					}
				} else {
					if (missing.length) {
						issue(path, `library "${library}" has sizes but doesn't claim: ${missing.join(', ')}`);
					}
					if ((entry.css === null) !== inline) {
						issue(
							[...path, 'css'],
							inline
								? `library "${library}" writes its styles inline, so it has no stylesheet to measure`
								: `library "${library}" styles by class, so its stylesheet is measured`
						);
					}
				}
			}
		}
	}
);
export type BenchResults = s.Infer<typeof BenchResults>;

/**
 * Whether a run's numbers can be published as results: a complete `full` run
 * with no gap in its cells or its cold start (`bench_results_find_gaps`,
 * `bench_results_find_startup_gaps`), from a commit that records everything
 * that ran, on a machine that held still and was calibrated, so the run
 * carries a noise floor that says which differences are results. A run that was stopped and resumed
 * qualifies like any other: its anchor covers every segment. A site shows
 * anything else as what it is, never as a result.
 */
export const bench_results_is_publishable = (results: BenchResults): boolean => {
	const { run, anchor, commit, noise_floor } = results.meta;
	return (
		run !== null &&
		run.kind === 'full' &&
		bench_run_is_complete(run) &&
		anchor !== null &&
		anchor.stable &&
		noise_floor !== null &&
		commit !== null &&
		!commit.endsWith('-dirty') &&
		bench_results_find_gaps(results).length === 0 &&
		bench_results_find_startup_gaps(results).length === 0
	);
};

/**
 * Parses a results file, with every problem in one readable message.
 *
 * @param data - the parsed JSON of a results file
 * @returns the validated results
 * @throws if the data doesn't match `BenchResults`
 */
export const parse_bench_results = (data: unknown): BenchResults => {
	const parsed = s.parse(BenchResults, data);
	if (!parsed.ok) throw new Error(`invalid bench results: ${format_bench_issues(parsed.issues)}`);
	return parsed.value;
};

/** The facts of a run that decide whether it is publishable, as one line for an error. */
export const describe_bench_run = (results: BenchResults): string => {
	const { run, anchor, commit, noise_floor } = results.meta;
	if (run === null) return 'it holds no timed run';
	const filters = Object.entries(run.filters)
		.filter(([, ids]) => ids !== null)
		.map(([key]) => key);
	return [
		`kind: ${run.kind}`,
		`filters: ${filters.length > 0 ? filters.join(', ') : 'none'}`,
		`commit: ${commit ?? 'none'}`,
		`anchor: ${
			anchor === null
				? 'none'
				: anchor.stable
					? `stable, drift ${(anchor.drift * 100).toFixed(1)}%`
					: `drifted by ${(anchor.drift * 100).toFixed(1)}%, so the machine changed state during the run: run it again`
		}`,
		`noise floor: ${noise_floor === null ? 'none' : 'present'}`,
		`cells without a number: ${bench_results_find_gaps(results).length}`,
		`cold-start scenarios without a number: ${bench_results_find_startup_gaps(results).length}`
	].join('; ');
};
