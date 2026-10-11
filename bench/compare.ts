/**
 * Compares two results files: what changed between them, and every number
 * side by side, so a run after an upgrade can be read against the one before.
 *
 * ```bash
 * node bench/compare.ts <before> <after> [--library <id>] [--markdown]
 * ```
 *
 * It prints each change and draws no verdict: the noise the runs record (the
 * after run's calibrated floor, each run's process noise) is printed beside
 * the changes, for the reader to weigh. A time's change is after over before
 * less one, so a negative change is faster. Deterministic numbers are listed
 * only where they differ, a retained heap only beyond `heap_readings_agree`,
 * since an equal one says nothing a comparison needs.
 *
 * Either file may be any results file: two timed runs, or a run and the
 * deterministic file, and then the timed sections are left out. Nothing is refused
 * for differing machines, parameters, or corpora; they are listed first, since
 * they decide what a timed ratio means.
 *
 * Node-only.
 *
 * @module
 */

import { readFileSync } from 'node:fs';

import {
	format_bytes,
	format_count,
	format_hash,
	format_ms,
	format_ns,
	format_percent
} from '../src/lib/bench_format.ts';
import { to_geomean } from '../src/lib/ratio.ts';
import {
	heap_readings_agree,
	parse_bench_results,
	to_bench_startup_key,
	type BenchCell,
	type BenchResults,
	type BenchStartup,
	type BenchStartupKey
} from '../src/lib/results_schema.ts';
import { BENCH_SOURCES } from '../src/lib/bench_constants.ts';

const USAGE = [
	'usage: node bench/compare.ts <before> <after> [--library <id>] [--markdown]',
	'',
	'Compares two results files: what changed between them, then every timed',
	'number side by side with its change (negative is faster) and every',
	'deterministic number that differs.',
	'',
	'  --library <id>  only this library',
	'  --markdown      tables in Markdown, to paste'
].join('\n');

/** The flags the command takes, besides `--help`. */
export const COMPARE_FLAGS = ['--library', '--markdown'] as const;

export interface CompareOptions {
	/** Only this library, or every library of either file. */
	library: string | null;
	/** Whether the tables are written as Markdown. */
	markdown: boolean;
}

/** A table: its header, its rows, and which columns hold numbers, which align right. */
export interface CompareTable {
	head: Array<string>;
	rows: Array<Array<string>>;
	numeric: Array<boolean>;
}

/** One part of a comparison: a title, lines of prose, and the tables under it. */
export interface CompareSection {
	title: string;
	lines: Array<string>;
	tables: Array<CompareTable>;
}

/** What a missing number prints as. */
const NONE = '—';

/** A ratio of after over before as a signed change: `-3.1%` is faster for a time. */
const format_ratio_change = (ratio: number): string => {
	const change = format_percent(ratio - 1);
	if (change === '0.0%' || change === '-0.0%') return '0.0%';
	return change.startsWith('-') ? change : `+${change}`;
};

/** The change from before to after, or nothing when either is missing. */
const format_change = (before: number | undefined, after: number | undefined): string =>
	before === undefined || after === undefined ? NONE : format_ratio_change(after / before);

/**
 * The key a cell's source is grouped by, a home input by whose home it is: the
 * site's own grouping, so sources are never pooled.
 */
const to_source_key = (cell: Pick<BenchCell, 'source' | 'home'>): string =>
	cell.home === null ? cell.source : `${cell.source}:${cell.home}`;

/** The ids of every library in either file, the after file's roster first. */
const to_library_ids = (before: BenchResults, after: BenchResults): Array<string> => [
	...new Set([...after.meta.libraries, ...before.meta.libraries].map((library) => library.id))
];

/**
 * What differs between the two files in what their numbers depend on: the
 * libraries and their packages, the install closures, the corpus, the bundler,
 * Node, the machine, and how the timed numbers were measured.
 */
export const find_compare_changes = (
	before: BenchResults,
	after: BenchResults,
	library: string | null = null
): Array<string> => {
	const changes: Array<string> = [];
	const then = new Map(before.meta.libraries.map((l) => [l.id, l]));
	const now = new Map(after.meta.libraries.map((l) => [l.id, l]));
	for (const id of to_library_ids(before, after)) {
		if (library !== null && id !== library) continue;
		const a = then.get(id);
		const b = now.get(id);
		if (!a) {
			changes.push(`${id} was added, at ${b!.version}`);
			continue;
		}
		if (!b) {
			changes.push(`${id} was removed, at ${a.version}`);
			continue;
		}
		if (a.version !== b.version) changes.push(`${id}: ${a.version} → ${b.version}`);
		const extra_a = new Map(Object.entries(a.extra_packages ?? {}));
		const extra_b = new Map(Object.entries(b.extra_packages ?? {}));
		for (const name of [...new Set([...extra_a.keys(), ...extra_b.keys()])].sort()) {
			const va = extra_a.get(name);
			const vb = extra_b.get(name);
			if (va !== vb) changes.push(`${id}: ${name} ${va ?? 'absent'} → ${vb ?? 'absent'}`);
		}
		const closure_a = before.install[id]?.closure;
		const closure_b = after.install[id]?.closure;
		if (closure_a && closure_b && closure_a !== closure_b) {
			changes.push(`${id}: its dependency closure differs (install closure hash)`);
		}
		if (a.note !== b.note) changes.push(`${id}: its note changed`);
	}
	const field = (label: string, a: unknown, b: unknown): void => {
		const show = (value: unknown): string =>
			value === null || value === undefined
				? 'none'
				: typeof value === 'string'
					? value
					: JSON.stringify(value);
		if (JSON.stringify(a) !== JSON.stringify(b)) changes.push(`${label}: ${show(a)} → ${show(b)}`);
	};
	if (before.meta.corpus_hash !== after.meta.corpus_hash) {
		changes.push(
			`the corpus: ${format_hash(before.meta.corpus_hash)} → ${format_hash(after.meta.corpus_hash)}`
		);
	}
	const bundler_a = before.meta.bundler;
	const bundler_b = after.meta.bundler;
	if (bundler_a && bundler_b) {
		for (const key of [...new Set([...Object.keys(bundler_a), ...Object.keys(bundler_b)])]) {
			field(
				`bundler ${key}`,
				(bundler_a as Record<string, unknown>)[key],
				(bundler_b as Record<string, unknown>)[key]
			);
		}
	}
	const set_ids = (results: BenchResults): string =>
		results.sets.map((set) => `${set.id}=${set.langs.join('+')}`).join(' ');
	if (set_ids(before) !== set_ids(after)) changes.push('the feature sets differ');
	// the rest describes timed numbers, so a file with none has nothing to compare
	if (before.meta.run === null || after.meta.run === null) return changes;
	field('Node', before.meta.node, after.meta.node);
	const machine_a = before.meta.machine!;
	const machine_b = after.meta.machine!;
	for (const key of Object.keys(machine_b) as Array<keyof typeof machine_b>) {
		field(`machine ${key}`, machine_a[key], machine_b[key]);
	}
	const run_a = before.meta.run;
	const run_b = after.meta.run;
	for (const key of [
		'kind',
		'passes',
		'rounds',
		'target_ms',
		'warmup_ms',
		'rewarm_ms',
		'retries',
		'loaded_langs',
		'collection',
		'startup_samples',
		'startup_discard',
		'startup_compile_cache',
		'filters'
	] as const) {
		field(`run ${key}`, run_a[key], run_b[key]);
	}
	return changes;
};

/** The runs themselves, one row each. */
const to_runs_table = (
	before: BenchResults,
	after: BenchResults,
	paths: [string, string]
): CompareTable => {
	const row = (label: string, results: BenchResults, path: string): Array<string> => {
		const { meta } = results;
		return [
			label,
			path,
			meta.run?.kind ?? 'deterministic',
			meta.generated_at ? meta.generated_at.slice(0, 10) : NONE,
			meta.machine?.name ?? NONE,
			meta.node ?? NONE,
			meta.commit ? format_hash(meta.commit) : NONE,
			meta.anchor ? format_percent(meta.anchor.drift) : NONE
		];
	};
	return {
		head: ['', 'file', 'kind', 'started', 'machine', 'Node', 'commit', 'anchor drift'],
		rows: [row('before', before, paths[0]), row('after', after, paths[1])],
		numeric: [false, false, false, false, false, false, false, true]
	};
};

/** The noise each run records, for reading the timed ratios. */
const to_noise_lines = (before: BenchResults, after: BenchResults): Array<string> => {
	const lines: Array<string> = [];
	const floor = after.meta.noise_floor;
	lines.push(
		floor
			? `after's calibrated noise floor: ${format_percent(floor.per_cell)} per cell, ${format_percent(floor.geomean)} per library geomean${floor.per_process === null ? '' : `, ${format_percent(floor.per_process)} per process`}`
			: 'after carries no calibrated noise floor'
	);
	for (const [label, results] of [
		['before', before],
		['after', after]
	] as const) {
		const noise = results.meta.process_noise;
		if (noise) {
			lines.push(
				`${label}'s process noise: median ${format_percent(noise.median)}, p95 ${format_percent(noise.p95)}, max ${format_percent(noise.max)} over ${format_count(noise.pairs)} pairs`
			);
		}
	}
	return lines;
};

/** The key a library's exclusion from a cell is looked up by. */
const to_excluded_key = (cell: string, library: string): string => `${cell}\u0000${library}`;

/** A file's excluded cells and libraries, as `to_excluded_key` keys. */
const to_excluded_keys = (results: BenchResults): Set<string> =>
	new Set(results.meta.excluded.map((e) => to_excluded_key(e.cell, e.library)));

/**
 * The timed cells: for each library and cell either file has a number for, the
 * time per call before and after and their ratio, and each library's geometric
 * mean of those ratios by mode and source.
 */
const to_throughput_tables = (
	before: BenchResults,
	after: BenchResults,
	libraries: Array<string>
): Array<CompareTable> => {
	const before_cells = new Map(before.cells.map((cell) => [cell.id, cell]));
	const after_ids = new Set(after.cells.map((cell) => cell.id));
	// the after file's order, then cells only the before file has
	const cells = [...after.cells, ...before.cells.filter((cell) => !after_ids.has(cell.id))];
	const after_cells = new Map(after.cells.map((cell) => [cell.id, cell]));
	const excluded_before = to_excluded_keys(before);
	const excluded_after = to_excluded_keys(after);
	const state = (cell: BenchCell | undefined, excluded: Set<string>, library: string): string => {
		if (!cell) return NONE;
		const value = cell.values[library];
		if (value) return format_ns(value.ns_per_op);
		return excluded.has(to_excluded_key(cell.id, library)) ? 'excluded' : NONE;
	};
	const rows: Array<Array<string>> = [];
	const ratios: Map<string, Array<number>> = new Map();
	for (const library of libraries) {
		for (const { id } of cells) {
			const a = before_cells.get(id);
			const b = after_cells.get(id);
			const va = a?.values[library];
			const vb = b?.values[library];
			const shown_a = state(a, excluded_before, library);
			const shown_b = state(b, excluded_after, library);
			if (shown_a === NONE && shown_b === NONE) continue;
			rows.push([library, id, shown_a, shown_b, format_change(va?.ns_per_op, vb?.ns_per_op)]);
			if (va && vb) {
				const key = [library, b.mode, to_source_key(b)].join('\u0000');
				let list = ratios.get(key);
				if (!list) ratios.set(key, (list = []));
				list.push(vb.ns_per_op / va.ns_per_op);
			}
		}
	}
	// each library and mode by source, in the order of `BENCH_SOURCES`, so neutral leads
	const source_rank = (key: string): number =>
		(BENCH_SOURCES as ReadonlyArray<string>).indexOf(key.split('\u0000')[2]!.split(':')[0]!);
	const grouped = [...ratios].sort(
		([a], [b]) =>
			libraries.indexOf(a.split('\u0000')[0]!) - libraries.indexOf(b.split('\u0000')[0]!) ||
			source_rank(a) - source_rank(b)
	);
	const summary = grouped.map(([key, list]) => {
		const [library, mode, source] = key.split('\u0000') as [string, string, string];
		return [
			library,
			mode,
			source,
			format_count(list.length),
			format_ratio_change(to_geomean(list)!)
		];
	});
	return [
		{
			head: ['library', 'mode', 'source', 'cells', 'geomean change'],
			rows: summary,
			numeric: [false, false, false, true, true]
		},
		{
			head: ['library', 'cell', 'before', 'after', 'change'],
			rows,
			numeric: [false, false, true, true, true]
		}
	];
};

/** A cold-start scenario as a reader names it. */
const format_scenario = (key: BenchStartupKey): string =>
	[key.scenario, key.lang ?? key.set, key.bundled ? 'bundled' : 'unbundled']
		.filter((part) => part !== null)
		.join(' ');

/**
 * Cold start: each scenario's median before and after and their ratio, and what
 * the library added over each file's own bare baseline.
 */
const to_startup_table = (
	before: BenchResults,
	after: BenchResults,
	libraries: Array<string>
): CompareTable => {
	const index = (results: BenchResults): Map<string, BenchStartup> =>
		new Map(results.startup.map((entry) => [to_bench_startup_key(entry), entry]));
	const bare = (results: BenchResults): BenchStartup | undefined =>
		results.startup.find((entry) => entry.scenario === 'bare');
	const excluded = (results: BenchResults): Set<string> =>
		new Set(results.meta.startup_excluded.map((entry) => to_bench_startup_key(entry)));
	const by_key_before = index(before);
	const by_key_after = index(after);
	const excluded_before = excluded(before);
	const excluded_after = excluded(after);
	const bare_before = bare(before);
	const bare_after = bare(after);
	const keys: Map<string, BenchStartupKey> = new Map();
	for (const entry of [
		...after.startup,
		...after.meta.startup_excluded,
		...before.startup,
		...before.meta.startup_excluded
	]) {
		const key = to_bench_startup_key(entry);
		if (!keys.has(key)) keys.set(key, entry);
	}
	const shown = (
		entry: BenchStartup | undefined,
		key: string,
		excluded_keys: Set<string>
	): string => (entry ? format_ms(entry.median_ms) : excluded_keys.has(key) ? 'excluded' : NONE);
	const added = (entry: BenchStartup | undefined, base: BenchStartup | undefined): string =>
		entry && base && entry !== base ? format_ms(entry.median_ms - base.median_ms) : NONE;
	const rows: Array<Array<string>> = [];
	// the baseline first, then each library's scenarios in the after file's order
	for (const library of [null, ...libraries]) {
		for (const [key, entry] of keys) {
			if (entry.library !== library) continue;
			const a = by_key_before.get(key);
			const b = by_key_after.get(key);
			rows.push([
				library ?? 'node',
				format_scenario(entry),
				shown(a, key, excluded_before),
				shown(b, key, excluded_after),
				format_change(a?.median_ms, b?.median_ms),
				added(a, bare_before),
				added(b, bare_after)
			]);
		}
	}
	return {
		head: ['library', 'scenario', 'before', 'after', 'change', 'added before', 'added after'],
		rows,
		numeric: [false, false, true, true, true, true, true]
	};
};

/**
 * A value's numbers as flat named entries: nested objects joined by dots, and
 * anything not a number (a list of unsupported languages, a hash) as its JSON.
 */
const flatten = (value: unknown, prefix: string, out: Map<string, number | string>): void => {
	if (typeof value === 'number') {
		out.set(prefix, value);
	} else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
		for (const [key, inner] of Object.entries(value)) {
			flatten(inner, prefix === '' ? key : `${prefix}.${key}`, out);
		}
	} else if (value !== null && value !== undefined) {
		out.set(prefix, JSON.stringify(value));
	}
};

/** A deterministic number that differs: where, what, before, and after. */
interface DeterministicChange {
	library: string;
	where: string;
	measure: string;
	before: number | string | undefined;
	after: number | string | undefined;
}

/** Whether two flattened numbers are the same reading, for all but a retained heap. */
const values_agree = (a: number | string | undefined, b: number | string | undefined): boolean =>
	a === b;

/** Whether two retained heap readings are the same reading, within the check's tolerance. */
const heap_values_agree = (
	a: number | string | undefined,
	b: number | string | undefined
): boolean =>
	typeof a === 'number' && typeof b === 'number' ? heap_readings_agree(a, b) : a === b;

/**
 * Collects every flattened number of two values that differ.
 *
 * @returns how many agreed
 */
const push_changes = (
	changes: Array<DeterministicChange>,
	library: string,
	where: string,
	before: unknown,
	after: unknown,
	agree: typeof values_agree = values_agree
): number => {
	const a: Map<string, number | string> = new Map();
	const b: Map<string, number | string> = new Map();
	flatten(before, '', a);
	flatten(after, '', b);
	let unchanged = 0;
	for (const measure of [...new Set([...a.keys(), ...b.keys()])]) {
		// the closure is a hash, reported once among the changes
		if (measure === 'closure') continue;
		const va = a.get(measure);
		const vb = b.get(measure);
		if (agree(va, vb)) {
			unchanged++;
		} else {
			changes.push({
				library,
				where,
				measure: measure === '' ? 'value' : measure,
				before: va,
				after: vb
			});
		}
	}
	return unchanged;
};

/** Bytes print as bytes, KiB readings and counts as counts. */
const format_deterministic = (measure: string, value: number | string | undefined): string => {
	if (value === undefined) return NONE;
	if (typeof value === 'string') return value;
	if (measure.endsWith('_kb')) return `${format_count(value)} KiB`;
	if (
		measure === 'tokens' ||
		measure === 'spans' ||
		measure === 'packages' ||
		measure === 'files'
	) {
		return format_count(value);
	}
	return format_bytes(value);
};

/** The difference of two deterministic numbers, signed, in their unit. */
const format_difference = (change: DeterministicChange): string => {
	const { before, after, measure } = change;
	if (typeof before !== 'number' || typeof after !== 'number') return NONE;
	const sign = after > before ? '+' : '';
	return sign + format_deterministic(measure, after - before);
};

/**
 * The deterministic numbers that differ: token counts, HTML sizes raw and
 * compressed, bundle sizes, install footprints, and retained heaps.
 *
 * @returns the table, and how many numbers were compared and found equal, a
 * retained heap within the check's tolerance counting as equal
 */
const to_deterministic_table = (
	before: BenchResults,
	after: BenchResults,
	libraries: Array<string>
): { table: CompareTable; unchanged: number } => {
	const changes: Array<DeterministicChange> = [];
	let unchanged = 0;
	const before_cells = new Map(before.cells.map((cell) => [cell.id, cell]));
	for (const library of libraries) {
		for (const cell of after.cells) {
			const a = before_cells.get(cell.id);
			if (!a) continue;
			const numbers = (c: BenchCell): Record<string, unknown> => ({
				tokens: c.tokens[library],
				...c.output[library],
				...c.compressed[library]
			});
			unchanged += push_changes(changes, library, cell.id, numbers(a), numbers(cell));
		}
		for (const set of after.sets) {
			const a = before.bundle[library]?.[set.id];
			const b = after.bundle[library]?.[set.id];
			if (a && b) unchanged += push_changes(changes, library, `bundle ${set.id}`, a, b);
		}
		const install_a = before.install[library];
		const install_b = after.install[library];
		if (install_a && install_b) {
			unchanged += push_changes(changes, library, 'install', install_a, install_b);
		}
		for (const [lang, heap] of Object.entries(after.heap[library] ?? {})) {
			const a = before.heap[library]?.[lang];
			if (a) {
				unchanged += push_changes(changes, library, `heap ${lang}`, a, heap, heap_values_agree);
			}
		}
	}
	return {
		table: {
			head: ['library', 'where', 'measure', 'before', 'after', 'difference'],
			rows: changes.map((change) => [
				change.library,
				change.where,
				change.measure,
				format_deterministic(change.measure, change.before),
				format_deterministic(change.measure, change.after),
				format_difference(change)
			]),
			numeric: [false, false, false, true, true, true]
		},
		unchanged
	};
};

/**
 * Compares two results files, section by section.
 *
 * @param before - the earlier file
 * @param after - the later file
 * @param paths - where each was read from, for the runs table
 * @param library - only this library, or null for every library of either file
 * @returns the sections, empty tables left out
 */
export const compare_results = (
	before: BenchResults,
	after: BenchResults,
	paths: [string, string],
	library: string | null = null
): Array<CompareSection> => {
	const libraries = to_library_ids(before, after).filter(
		(id) => library === null || id === library
	);
	const changes = find_compare_changes(before, after, library);
	const sections: Array<CompareSection> = [
		{ title: 'Runs', lines: [], tables: [to_runs_table(before, after, paths)] },
		{
			title: 'What changed between them',
			lines: changes.length === 0 ? ['nothing the files record'] : changes.map((c) => `- ${c}`),
			tables: []
		}
	];
	if (before.meta.generated_at && after.meta.generated_at) {
		if (after.meta.generated_at < before.meta.generated_at) {
			sections[0]!.lines.push('note: the after run started before the before run');
		}
	}
	const timed =
		before.cells.some((c) => Object.keys(c.values).length > 0) &&
		after.cells.some((c) => Object.keys(c.values).length > 0);
	if (timed) {
		const [summary, cells] = to_throughput_tables(before, after, libraries);
		sections.push({
			title: 'Throughput',
			lines: [
				'Time per call, and its change from before to after: a negative change is faster. No change is judged: the noise each run records is here to weigh them by.',
				...to_noise_lines(before, after)
			],
			tables: [summary!, cells!]
		});
	}
	if (before.startup.length > 0 && after.startup.length > 0) {
		sections.push({
			title: 'Cold start',
			lines: [
				'Median time since the process started, and its change; "added" is over that file\'s own bare Node baseline.'
			],
			tables: [to_startup_table(before, after, libraries)]
		});
	}
	const deterministic = to_deterministic_table(before, after, libraries);
	sections.push({
		title: 'Deterministic numbers that differ',
		lines: [
			deterministic.table.rows.length === 0
				? `none: ${format_count(deterministic.unchanged)} numbers compared, all equal`
				: `${format_count(deterministic.table.rows.length)} differ, ${format_count(deterministic.unchanged)} equal (a retained heap within the check's tolerance counts as equal)`
		],
		tables: deterministic.table.rows.length === 0 ? [] : [deterministic.table]
	});
	return sections;
};

/** A table as aligned plain text, or as Markdown. */
export const format_compare_table = (table: CompareTable, markdown: boolean): string => {
	const all = [table.head, ...table.rows];
	if (markdown) {
		const escape = (text: string): string => text.replaceAll('|', '\\|');
		const line = (cells: Array<string>): string => `| ${cells.map(escape).join(' | ')} |`;
		const rule = table.numeric.map((numeric) => (numeric ? '---:' : '---'));
		return [line(table.head), `| ${rule.join(' | ')} |`, ...table.rows.map(line)].join('\n');
	}
	const widths = table.head.map((_, i) => Math.max(...all.map((row) => row[i]!.length)));
	const line = (cells: Array<string>): string =>
		cells
			.map((cell, i) => (table.numeric[i] ? cell.padStart(widths[i]!) : cell.padEnd(widths[i]!)))
			.join('  ')
			.trimEnd();
	return [
		line(table.head),
		widths.map((w) => '-'.repeat(w)).join('  '),
		...table.rows.map(line)
	].join('\n');
};

/** Every section, as plain text or as Markdown. */
export const format_comparison = (
	sections: ReadonlyArray<CompareSection>,
	markdown: boolean
): string =>
	sections
		.map((section) =>
			[
				markdown ? `## ${section.title}` : `${section.title}\n${'='.repeat(section.title.length)}`,
				...(section.lines.length > 0 ? [section.lines.join('\n')] : []),
				...section.tables.map((table) => format_compare_table(table, markdown))
			].join('\n\n')
		)
		.join('\n\n');

/** The arguments, or why they are wrong. */
export const parse_compare_args = (
	args: ReadonlyArray<string>
): ({ ok: true; paths: [string, string] } & CompareOptions) | { ok: false; message: string } => {
	const paths: Array<string> = [];
	let library: string | null = null;
	let markdown = false;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]!;
		if (arg === '--markdown') {
			markdown = true;
		} else if (arg === '--library') {
			const id = args[++i];
			if (id === undefined || id.startsWith('--')) {
				return { ok: false, message: '--library takes a library id' };
			}
			library = id;
		} else if (arg.startsWith('--')) {
			return { ok: false, message: `unknown flag ${arg}` };
		} else {
			paths.push(arg);
		}
	}
	if (paths.length !== 2)
		return { ok: false, message: 'give two results files: before, then after' };
	return { ok: true, paths: [paths[0]!, paths[1]!], library, markdown };
};

/** Reads and validates a results file, or says why it can't be. */
const read_results = (path: string): BenchResults | string => {
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch (error) {
		return `can't read ${path}: ${(error as Error).message}`;
	}
	try {
		return parse_bench_results(JSON.parse(text));
	} catch (error) {
		return `${path} is not a results file: ${(error as Error).message}`;
	}
};

/**
 * The command.
 *
 * @param args - the arguments after the script
 * @returns the exit code: 2 for bad arguments, an unreadable file, or an unknown library
 */
export const main = (args: ReadonlyArray<string>): number => {
	if (args[0] === '--help') {
		console.log(USAGE);
		return 0;
	}
	const parsed = parse_compare_args(args);
	if (!parsed.ok) {
		console.error(`${parsed.message}\n\n${USAGE}`);
		return 2;
	}
	const files: Array<BenchResults> = [];
	for (const path of parsed.paths) {
		const results = read_results(path);
		if (typeof results === 'string') {
			console.error(results);
			return 2;
		}
		files.push(results);
	}
	const [before, after] = files as [BenchResults, BenchResults];
	if (parsed.library !== null && !to_library_ids(before, after).includes(parsed.library)) {
		console.error(`neither file measured a library "${parsed.library}"`);
		return 2;
	}
	console.log(
		format_comparison(compare_results(before, after, parsed.paths, parsed.library), parsed.markdown)
	);
	return 0;
};

if (import.meta.main) {
	process.exitCode = main(process.argv.slice(2));
}
