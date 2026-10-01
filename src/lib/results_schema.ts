/**
 * The results file: one run of the benchmark, written by the harness and parsed
 * by the site. Both sides import these schemas, so a malformed run fails the
 * harness and the build rather than rendering blanks.
 *
 * The file separates two classes of number. **Machine-dependent** numbers come
 * from the timed harness on a named machine: each cell's `values` and the
 * `startup` section. **Deterministic** numbers regenerate identically anywhere:
 * each cell's `tokens` and `output`, plus `bundle` and `coverage`.
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

import { z } from 'zod';

/** An id used as a key or a cross-reference: a set or a cell. */
const Id = z.string().min(1);

/** A SHA-256 digest in lowercase hex. */
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

/** The shape of a library id and a language id: lowercase, safe as a key and in a path. */
const NAME_MATCHER = /^[a-z][a-z0-9_]*$/;

/** A library id. */
const LibraryId = z.string().regex(NAME_MATCHER);

/** A language id. */
const LangId = z.string().regex(NAME_MATCHER);

/**
 * A record that rejects an own `__proto__` key, which `z.record` would otherwise
 * drop without an issue.
 */
const strict_record = <TKey extends z.ZodType<string, string>, TValue extends z.ZodType>(
	key: TKey,
	value: TValue
) =>
	z
		.custom<unknown>(
			(v) => typeof v !== 'object' || v === null || !Object.hasOwn(v, '__proto__'),
			'a "__proto__" key is not allowed'
		)
		.pipe(z.record(key, value));

/** The machine a run's timed numbers came from. */
export const BenchMachine = z.strictObject({
	name: Id.meta({ description: 'The name the machine is published under.' }),
	cpu: z.string().min(1).meta({ description: 'The CPU model.' }),
	governor: z
		.string()
		.min(1)
		.nullable()
		.meta({ description: 'The CPU frequency governor, or null where the OS exposes none.' }),
	memory_gb: z.number().positive().meta({ description: 'Installed memory in gigabytes.' })
});
export type BenchMachine = z.infer<typeof BenchMachine>;

/**
 * The reference workload measured at the start and end of a run. Its drift says
 * whether the machine changed state while the run was in progress.
 */
export const BenchAnchor = z.strictObject({
	drift: z
		.number()
		.meta({ description: 'Relative change from the first measurement to the last; 0.01 is 1%.' }),
	stable: z.boolean().meta({ description: 'Whether the drift stayed inside the threshold.' })
});
export type BenchAnchor = z.infer<typeof BenchAnchor>;

/** What a library's `html` output carries its colors in. */
export const BenchOutputKind = z.enum(['classes', 'inline_styles']);
export type BenchOutputKind = z.infer<typeof BenchOutputKind>;

/** How a library lexes. A filterable tag, not a ranking. */
export const BenchEngineKind = z.enum(['scanner', 'grammar_vm', 'regex', 'textmate']);
export type BenchEngineKind = z.infer<typeof BenchEngineKind>;

/** One measured library. The roster of these drives every page of the site. */
export const BenchLibrary = z.strictObject({
	id: LibraryId.meta({ description: 'The key this library has in every per-library map.' }),
	label: z.string().min(1).meta({ description: 'The display name.' }),
	package: z.string().min(1).meta({ description: 'The npm package the version was read from.' }),
	version: z
		.string()
		.min(1)
		.refine((v) => v !== 'unknown', 'a run must know which version it measured')
		.meta({ description: 'The installed version of the package.' }),
	output: BenchOutputKind.meta({ description: 'What the HTML output carries its colors in.' }),
	engine: BenchEngineKind.meta({ description: 'How the library lexes.' }),
	by_maintainer: z.boolean().meta({
		description:
			"Whether this benchmark's maintainer also maintains the library. The site flags it."
	}),
	note: z
		.string()
		.min(1)
		.nullable()
		.meta({ description: 'What was measured and any caveat, shown beside the library.' }),
	extra_packages: z.record(z.string().min(1), z.string().min(1)).optional().meta({
		description:
			'The installed versions of packages the library was measured with that are versioned apart from `package`, by name.'
	})
});
export type BenchLibrary = z.infer<typeof BenchLibrary>;

/**
 * A library that claims a cell's language but failed the pre-measurement output
 * check there, so it was not measured. Distinct from unsupported, which is a
 * language missing from the library's `coverage`.
 */
export const BenchExcluded = z.strictObject({
	cell: Id.meta({ description: 'The id of the cell.' }),
	library: LibraryId.meta({ description: 'The id of the library.' }),
	reason: z.string().min(1).meta({ description: 'What the check found.' })
});
export type BenchExcluded = z.infer<typeof BenchExcluded>;

/**
 * The machine's noise floor, from a calibration run: every library is measured
 * as two, in separate processes, which should come out equal. A difference
 * smaller than this is not a result.
 */
export const BenchNoiseFloor = z.strictObject({
	per_cell: z.number().nonnegative().meta({
		description:
			'The deviation a single cell can show by chance: the 95th percentile, over cells and libraries, of how far two measurements of the same library were apart, as the larger over the smaller less one; 0.01 is 1%.'
	}),
	geomean: z.number().nonnegative().meta({
		description:
			"The deviation of a geometric mean across cells: how far apart the two measurements' geometric means were, for the library where they differed most; 0.01 is 1%."
	})
});
export type BenchNoiseFloor = z.infer<typeof BenchNoiseFloor>;

/** An input's size tier, by real file size. */
export const BenchSize = z.enum(['micro', 'small', 'medium', 'large']);
export type BenchSize = z.infer<typeof BenchSize>;

/** The stage a cell runs: tokens out, or the HTML string consumers ship. */
export const BenchMode = z.enum(['tokenize', 'html']);
export type BenchMode = z.infer<typeof BenchMode>;

/**
 * Who an input came from: `neutral` is real code no measured library authored,
 * `shiki` is Shiki's upstream benchmark samples, `home` is one library's own
 * samples, and `harness` is a snippet written for this benchmark.
 */
export const BenchSource = z.enum(['neutral', 'shiki', 'home', 'harness']);
export type BenchSource = z.infer<typeof BenchSource>;

/**
 * What a run is: `full` measures with the published parameters, `smoke` runs
 * every cell once to prove the harness works and its numbers mean nothing, and
 * `calibrate` measures every library twice in every cell to find the noise floor.
 */
export const BenchRunKind = z.enum(['full', 'smoke', 'calibrate']);
export type BenchRunKind = z.infer<typeof BenchRunKind>;

/**
 * The filters a run was restricted by. Each is null when the run was not
 * restricted on that axis.
 */
export const BenchRunFilters = z.strictObject({
	libraries: z.array(LibraryId).min(1).nullable(),
	langs: z.array(LangId).min(1).nullable(),
	sizes: z.array(BenchSize).min(1).nullable(),
	modes: z.array(BenchMode).min(1).nullable(),
	sources: z.array(BenchSource).min(1).nullable()
});
export type BenchRunFilters = z.infer<typeof BenchRunFilters>;

/**
 * How the timed cells of a run were measured. It tells a complete `full` run
 * from a smoke, calibration, or partial run: see `bench_results_is_publishable`.
 */
export const BenchRun = z.strictObject({
	kind: BenchRunKind,
	passes: z.number().int().positive().meta({
		description: 'How many processes measured each library in each cell. Their rounds are pooled.'
	}),
	rounds: z.number().int().positive().meta({ description: 'How many batches each process timed.' }),
	target_ms: z
		.number()
		.positive()
		.meta({ description: 'How long one timed batch aimed to run, in milliseconds.' }),
	warmup_ms: z.number().nonnegative().meta({
		description: 'How long each library ran untimed before calibration, in milliseconds.'
	}),
	rewarm_ms: z.number().nonnegative().meta({
		description: 'How long each library ran untimed before each timed batch, in milliseconds.'
	}),
	loaded_langs: z.literal('cell').meta({
		description:
			"Which languages each cell's process set up in every library: `cell` is exactly the cell's language."
	}),
	filters: BenchRunFilters,
	duration_ms: z
		.number()
		.int()
		.nonnegative()
		.meta({ description: 'How long the run took, anchor readings included.' })
});
export type BenchRun = z.infer<typeof BenchRun>;

/**
 * Whether a run covered everything: every library on every cell, measured for
 * real. A smoke run never did, and neither did a run with any filter.
 */
export const bench_run_is_complete = (run: Pick<BenchRun, 'kind' | 'filters'>): boolean =>
	run.kind !== 'smoke' && Object.values(run.filters).every((filter) => filter === null);

/** Where, when, and from what a run was produced. */
export const BenchMeta = z.strictObject({
	generated_at: z.iso.datetime().meta({ description: 'When the run started.' }),
	machine: BenchMachine,
	node: z
		.string()
		.min(1)
		.meta({ description: 'The Node version, as `process.version` prints it.' }),
	commit: z
		.string()
		.regex(/^[0-9a-f]{40}(-dirty)?$/)
		.meta({
			description:
				'The harness commit that ran, with `-dirty` appended when the working tree had changes it does not record.'
		}),
	corpus_hash: Sha256.meta({
		description: 'A hash over the corpus manifest. Runs with different hashes are not comparable.'
	}),
	run: BenchRun.nullable().meta({ description: 'Null when no cell was timed.' }),
	anchor: BenchAnchor.nullable().meta({ description: 'Null when nothing was timed.' }),
	libraries: z.array(BenchLibrary),
	excluded: z.array(BenchExcluded),
	noise_floor: BenchNoiseFloor.nullable().meta({
		description:
			'Null until the machine has been calibrated with the parameters of this run. A calibration run carries the floor it measured.'
	})
});
export type BenchMeta = z.infer<typeof BenchMeta>;

/** One language id of the run, as the harness declares it in `bench/langs.ts`. */
export const BenchLang = z.strictObject({
	id: LangId,
	label: z.string().min(1),
	timed: z.boolean().meta({ description: 'Whether timed cells cover the language.' })
});
export type BenchLang = z.infer<typeof BenchLang>;

/** A named list of languages that bundle size is measured over. */
export const BenchSet = z.strictObject({
	id: Id,
	label: z.string().min(1),
	langs: z.array(LangId),
	footnote: z.string().min(1).nullable()
});
export type BenchSet = z.infer<typeof BenchSet>;

/** What a cell measures. */
export const BenchMetric = z.enum(['throughput']);
export type BenchMetric = z.infer<typeof BenchMetric>;

/** One file an input came from, pinned so the input can be rebuilt and checked. */
export const BenchProvenance = z.strictObject({
	repo: z
		.string()
		.regex(/^https:\/\/[^\s/?#@]+(\/[^\s/?#@]+)+$/)
		.meta({
			description:
				'The repository the file came from, as an https URL with a path and no userinfo, query, fragment, or trailing slash.'
		}),
	commit: z
		.string()
		.regex(/^[0-9a-f]{40}$/)
		.meta({ description: 'The commit the file was read at.' }),
	path: z
		.string()
		.min(1)
		.refine(
			(path) => path.split('/').every((segment) => segment !== '.' && segment !== '..'),
			'a path has no "." or ".." segment'
		)
		.meta({ description: "The file's path in that repository." }),
	sha256: Sha256.meta({ description: 'The hash of the file at that commit.' }),
	license: z
		.string()
		.min(1)
		.meta({ description: 'The SPDX expression of the license it is under.' }),
	note: z
		.string()
		.min(1)
		.nullable()
		.meta({ description: 'How the upstream describes or built the file, when it says.' })
});
export type BenchProvenance = z.infer<typeof BenchProvenance>;

/**
 * One input of the corpus: a file, what it is, and where it came from. The
 * corpus manifest is a list of these, and a results file carries the ones its
 * cells measured.
 */
export const BenchInput = z
	.strictObject({
		file: z
			.string()
			.min(1)
			.refine(
				(file) =>
					file.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
				'a file is a relative path with no empty, "." or ".." segment'
			)
			.meta({ description: "The input's path within the corpus, which identifies it." }),
		source: BenchSource,
		home: LibraryId.nullable().meta({
			description:
				"The library whose samples the input came from, set exactly when the source is home. It may name a library outside a run's roster."
		}),
		lang: LangId,
		size: BenchSize,
		bytes: z.number().int().positive(),
		lines: z.number().int().positive(),
		sha256: Sha256.meta({ description: "The hash of the input's bytes." }),
		synthetic: z.boolean().meta({
			description:
				'Whether the input was built by joining or repeating files to reach its size, rather than being one real file.'
		}),
		provenance: z.array(BenchProvenance).meta({
			description:
				'The upstream files the input came from. Empty exactly when the source is harness: the input was written here. One entry is a verbatim copy with the same hash. Several are the files a synthetic input was built from.'
		})
	})
	.superRefine((input, ctx) => {
		if ((input.source === 'home') !== (input.home !== null)) {
			ctx.addIssue({
				code: 'custom',
				path: ['home'],
				message: 'home is set exactly when the source is home'
			});
		}
		if ((input.source === 'harness') !== (input.provenance.length === 0)) {
			ctx.addIssue({
				code: 'custom',
				path: ['provenance'],
				message: 'provenance is empty exactly when the source is harness'
			});
		}
		if (input.provenance.length === 1 && input.provenance[0]!.sha256 !== input.sha256) {
			ctx.addIssue({
				code: 'custom',
				path: ['provenance', 0, 'sha256'],
				message: 'an input with one upstream file is a verbatim copy, so the hashes match'
			});
		}
		if (input.provenance.length > 1 && !input.synthetic) {
			ctx.addIssue({
				code: 'custom',
				path: ['synthetic'],
				message: 'an input built from several upstream files is synthetic'
			});
		}
	});
export type BenchInput = z.infer<typeof BenchInput>;

/** One library's timing and memory in one cell. Machine-dependent. */
export const BenchCellValue = z.strictObject({
	ns_per_op: z.number().positive().meta({ description: 'Median nanoseconds per call.' }),
	ops_per_sec: z.number().positive(),
	mb_per_sec: z.number().positive().meta({ description: 'Input megabytes per second.' }),
	p10_ns: z.number().positive().meta({ description: '10th percentile across rounds.' }),
	p90_ns: z.number().positive().meta({ description: '90th percentile across rounds.' }),
	spread: z
		.number()
		.min(1)
		.meta({ description: 'Slowest round over fastest. Near 1 means the rounds agreed.' }),
	iterations: z.number().int().positive().meta({
		description:
			'Calls per timed batch, calibrated for this library. Each process calibrates for itself, and this is the median across them.'
	}),
	rss_peak_bytes: z.number().int().positive().meta({
		description:
			"The peak resident set size of the library's process, the largest across its passes. The process holds this library alone, with Node itself and the input, so it is a whole-process peak and not what the library adds."
	})
});
export type BenchCellValue = z.infer<typeof BenchCellValue>;

/** The size of one library's HTML for a cell's input. Deterministic. */
export const BenchCellOutput = z.strictObject({
	html_bytes: z.number().int().positive(),
	spans: z.number().int().nonnegative().meta({ description: 'How many elements the HTML has.' })
});
export type BenchCellOutput = z.infer<typeof BenchCellOutput>;

/**
 * The id of a cell: its input's file and its mode, which together are unique in
 * a run.
 */
export const to_bench_cell_id = (file: string, mode: BenchMode): string => `${file}:${mode}`;

/**
 * One input measured in one mode, across libraries. A library absent from
 * `values`, `tokens`, and `output` was not measured here: it is unsupported,
 * excluded, or outside the run's filters.
 */
export const BenchCell = z.strictObject({
	id: Id.meta({
		description:
			'The file and the mode, as `<file>:<mode>`. Unique within the run, and `meta.excluded` refers to it.'
	}),
	metric: BenchMetric,
	lang: LangId,
	size: BenchSize,
	mode: BenchMode,
	source: BenchSource,
	home: LibraryId.nullable().meta({
		description:
			"The library whose samples the input came from, set exactly when the source is home. It may name a library outside this run's roster."
	}),
	file: z.string().min(1).meta({ description: "The input's path within the corpus." }),
	bytes: z.number().int().positive(),
	lines: z.number().int().positive(),
	synthetic: z.boolean().meta({
		description:
			'Whether the input was built by joining or repeating files to reach its size, rather than being one real file.'
	}),
	values: strict_record(LibraryId, BenchCellValue).meta({
		description: 'Machine-dependent: timing and memory by library id.'
	}),
	tokens: strict_record(LibraryId, z.number().int().positive()).meta({
		description: 'Deterministic: token count by library id.'
	}),
	output: strict_record(LibraryId, BenchCellOutput).meta({
		description: 'Deterministic: HTML size by library id.'
	})
});
export type BenchCell = z.infer<typeof BenchCell>;

/** What a cold-start sample loads before it stops the clock. */
export const BenchStartupScenario = z.enum(['bare', 'core', 'lang', 'set', 'first_highlight']);
export type BenchStartupScenario = z.infer<typeof BenchStartupScenario>;

/** One cold-start measurement, each sample in a fresh process. Machine-dependent. */
export const BenchStartup = z.strictObject({
	scenario: BenchStartupScenario,
	library: LibraryId.nullable().meta({ description: 'Null exactly for the bare Node baseline.' }),
	lang: LangId.nullable().meta({
		description: 'The language loaded. Set exactly for the lang and first_highlight scenarios.'
	}),
	set: Id.nullable().meta({
		description: 'The feature set loaded. Set exactly for the set scenario.'
	}),
	bundled: z
		.boolean()
		.meta({ description: 'Whether the library was loaded as one bundled chunk.' }),
	samples: z.number().int().positive(),
	median_ms: z.number().positive(),
	spread: z.number().min(1)
});
export type BenchStartup = z.infer<typeof BenchStartup>;

/** The bundled size of one library over one feature set. Deterministic. */
export const BenchBundleSizes = z.strictObject({
	raw: z.number().int().positive().meta({ description: 'Minified JS bytes.' }),
	gzip: z.number().int().positive(),
	brotli: z.number().int().positive(),
	wasm: z
		.number()
		.int()
		.nonnegative()
		.meta({ description: 'WebAssembly bytes, kept out of the JS figures. 0 without wasm.' }),
	css: z.number().int().positive().nullable().meta({
		description:
			'Bytes of the default theme stylesheet, kept out of the JS figures. Null when styles are inline.'
	})
});
export type BenchBundleSizes = z.infer<typeof BenchBundleSizes>;

/** A feature set a library can't be measured over, naming the languages it lacks. */
export const BenchBundleUnsupported = z.strictObject({
	unsupported: z.array(LangId).min(1)
});
export type BenchBundleUnsupported = z.infer<typeof BenchBundleUnsupported>;

/** One library's result for one feature set: its sizes, or why there are none. */
export const BenchBundleEntry = z.union([BenchBundleSizes, BenchBundleUnsupported]);
export type BenchBundleEntry = z.infer<typeof BenchBundleEntry>;

/**
 * How a library supports a language it claims: `true` for directly, or a
 * footnote for anything a reader should know, like a third-party grammar.
 */
export const BenchCoverageEntry = z.union([
	z.literal(true),
	z.strictObject({ via: z.string().min(1) })
]);
export type BenchCoverageEntry = z.infer<typeof BenchCoverageEntry>;

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

/**
 * One run of the benchmark. Beyond each section's shape, parsing checks that
 * the sections agree: ids are unique and refer to roster entries, every cell
 * describes its input as the `inputs` roster does and is named after it, no
 * library has numbers for a language it doesn't claim or a cell it was excluded
 * from, no cell covers an untimed language, and a run with timed numbers has an
 * anchor and its run parameters.
 */
export const BenchResults = z
	.strictObject({
		meta: BenchMeta,
		langs: z.array(BenchLang),
		sets: z.array(BenchSet),
		inputs: z.array(BenchInput).meta({
			description: 'The corpus inputs the cells measured, with where each came from.'
		}),
		cells: z.array(BenchCell),
		startup: z
			.array(BenchStartup)
			.meta({ description: 'Machine-dependent. Empty when cold start was not measured.' }),
		bundle: strict_record(LibraryId, strict_record(Id, BenchBundleEntry)).meta({
			description: 'Deterministic: library id, then set id. Empty when sizes were not measured.'
		}),
		coverage: strict_record(LibraryId, strict_record(LangId, BenchCoverageEntry)).meta({
			description:
				'Deterministic: library id, then the languages it claims. An absent language is unsupported.'
		})
	})
	.superRefine((results, ctx) => {
		const issue = (path: Array<string | number>, message: string): void => {
			ctx.addIssue({ code: 'custom', path, message });
		};
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
			Object.hasOwn(results.coverage, library) && Object.hasOwn(results.coverage[library]!, lang);

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
			} else if (cell && !claims(entry.library, cell.lang)) {
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
		let timed = results.startup.length > 0;
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
			for (const section of ['values', 'tokens', 'output'] as const) {
				for (const library of Object.keys(cell[section])) {
					const at = [...path, section, library];
					if (!library_ids.has(library)) {
						issue(at, `unknown library "${library}"`);
					} else if (!claims(library, cell.lang)) {
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
		if (cells_timed && results.meta.run === null) {
			issue(['meta', 'run'], 'a run with timed cells records how they were measured');
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
		}

		// startup
		const startup_keys: Set<string> = new Set();
		for (const [i, entry] of results.startup.entries()) {
			const path = ['startup', i];
			const { scenario, library } = entry;
			const key = JSON.stringify([scenario, library, entry.lang, entry.set, entry.bundled]);
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
			if ((entry.scenario === 'bare') !== (entry.library === null)) {
				issue([...path, 'library'], 'library is null exactly for the bare scenario');
			}
			if (entry.library !== null && !library_ids.has(entry.library)) {
				issue([...path, 'library'], `unknown library "${entry.library}"`);
			}
			if (entry.lang !== null && !lang_ids.has(entry.lang)) {
				issue([...path, 'lang'], `unknown lang "${entry.lang}"`);
			}
			if (entry.set !== null && !sets.has(entry.set)) {
				issue([...path, 'set'], `unknown set "${entry.set}"`);
			}
		}

		// bundle: sizes only where every language is claimed; otherwise the missing ones, exactly
		for (const [library, by_set] of Object.entries(results.bundle)) {
			if (!library_ids.has(library)) {
				issue(['bundle', library], `unknown library "${library}"`);
				continue;
			}
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
				} else if (missing.length) {
					issue(path, `library "${library}" has sizes but doesn't claim: ${missing.join(', ')}`);
				}
			}
		}
	});
export type BenchResults = z.infer<typeof BenchResults>;

/**
 * Whether a run's numbers can be published as results: a complete `full` run,
 * from a commit that records everything that ran, on a machine that held still.
 * A site shows anything else as what it is, never as a result.
 */
export const bench_results_is_publishable = (results: BenchResults): boolean => {
	const { run, anchor, commit } = results.meta;
	return (
		run !== null &&
		run.kind === 'full' &&
		bench_run_is_complete(run) &&
		anchor !== null &&
		anchor.stable &&
		!commit.endsWith('-dirty')
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
	const parsed = BenchResults.safeParse(data);
	if (!parsed.success) throw new Error(`invalid bench results: ${z.prettifyError(parsed.error)}`);
	return parsed.data;
};
