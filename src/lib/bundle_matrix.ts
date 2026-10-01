/**
 * The bundle-size tables. A results file measures each library over feature
 * sets: one with no language, one for each language alone, and a few of several
 * languages. What a language adds to a library is derived here, as its
 * single-language set less the set with none, and is never stored, so it can't
 * drift from the measured sets.
 *
 * The sets are found by what they hold, not by their ids: the core set is the
 * one with no language, and a language's own set is the one holding it alone.
 *
 * @module
 */

import type { BenchBundleEntry, BenchSet } from './results_schema.ts';
import { format_bytes } from './bench_format.ts';
import {
	to_matrix_row,
	to_value_entry,
	type MatrixEntry,
	type MatrixGroup,
	type MatrixResults,
	type MatrixRow
} from './matrix.ts';

/** Which size of a bundle to show: the minified bytes, or those bytes compressed. */
export type BundleCompression = 'raw' | 'gzip' | 'brotli';

/** Every compression, in display order. */
export const BUNDLE_COMPRESSIONS: ReadonlyArray<BundleCompression> = ['gzip', 'brotli', 'raw'];

/** Which bundle table to show: what each language adds, or each set's total. */
export type BundleView = 'incremental' | 'totals';

/** Both views, with their labels, in display order. */
export const BUNDLE_VIEWS: ReadonlyArray<{ id: BundleView; label: string }> = [
	{ id: 'incremental', label: 'what each language adds' },
	{ id: 'totals', label: 'set totals' }
];

/** What the bundle tables show. */
export interface BundleSelection {
	langs: ReadonlyArray<string>;
	/** The id of the set of several languages to sum and to read wasm and CSS from. */
	set: string;
	compression: BundleCompression;
}

/** The set with no language: a library's runtime floor. */
export const find_core_set = (sets: ReadonlyArray<BenchSet>): BenchSet | null =>
	sets.find((set) => set.langs.length === 0) ?? null;

/** The set holding one language alone. */
export const find_single_set = (sets: ReadonlyArray<BenchSet>, lang: string): BenchSet | null =>
	sets.find((set) => set.langs.length === 1 && set.langs[0] === lang) ?? null;

/** Sets of several languages that hold the same ones, shown as one row. */
export interface CombinedSet {
	/** The ids of the sets that hold these languages, the first being the one measured. */
	ids: Array<string>;
	label: string;
	langs: Array<string>;
	footnote: string | null;
}

/**
 * The sets of several languages, with sets that hold the same languages merged
 * into one entry that names them all. Two such sets measure the same bundle, so
 * showing both would be a duplicate row that says nothing.
 */
export const to_combined_sets = (sets: ReadonlyArray<BenchSet>): Array<CombinedSet> => {
	const combined: Map<string, CombinedSet> = new Map();
	for (const set of sets) {
		if (set.langs.length < 2) continue;
		const key = [...set.langs].sort().join(',');
		const existing = combined.get(key);
		if (existing) {
			existing.ids.push(set.id);
			existing.label += ` = ${set.label}`;
			existing.footnote ??= set.footnote;
		} else {
			combined.set(key, {
				ids: [set.id],
				label: set.label,
				langs: [...set.langs],
				footnote: set.footnote
			});
		}
	}
	return [...combined.values()];
};

/** A combined set's languages, its footnote, and that it stands for several sets, when it does. */
export const to_combined_set_note = (set: CombinedSet): string =>
	[
		set.langs.join(', '),
		set.footnote,
		set.ids.length > 1 ? 'these sets hold the same languages, so they are one bundle' : null
	]
		.filter((part) => part !== null)
		.join(' · ');

/** A library's entry for a set, or null when the file measured no sizes for it. */
const find_bundle_entry = (
	results: Pick<MatrixResults, 'bundle'>,
	library: string,
	set: BenchSet | null
): BenchBundleEntry | null => {
	if (!set || !Object.hasOwn(results.bundle, library)) return null;
	const by_set = results.bundle[library]!;
	return Object.hasOwn(by_set, set.id) ? by_set[set.id]! : null;
};

/** The JavaScript size of one library over one set. */
export const to_bundle_size_entry = (
	results: Pick<MatrixResults, 'bundle'>,
	library: string,
	set: BenchSet | null,
	compression: BundleCompression
): MatrixEntry => {
	const entry = find_bundle_entry(results, library, set);
	if (!entry) return { kind: 'unmeasured' };
	if ('unsupported' in entry) return { kind: 'unsupported', langs: [...entry.unsupported] };
	return to_value_entry(entry[compression]);
};

/**
 * Everything a page loads for one library over one set: the JavaScript, the
 * wasm binary, and the theme stylesheet, each compressed on its own and added
 * up. A library with no binary or no stylesheet adds nothing for it, so a
 * library whose engine ships as wasm is compared on all it ships.
 */
export const to_bundle_loaded_entry = (
	results: Pick<MatrixResults, 'bundle'>,
	library: string,
	set: BenchSet | null,
	compression: BundleCompression
): MatrixEntry => {
	const entry = find_bundle_entry(results, library, set);
	if (!entry) return { kind: 'unmeasured' };
	if ('unsupported' in entry) return { kind: 'unsupported', langs: [...entry.unsupported] };
	const wasm = entry.wasm?.[compression] ?? 0;
	const css = entry.css?.[compression] ?? 0;
	return to_value_entry(entry[compression] + wasm + css, {
		details: [
			`JavaScript ${format_bytes(entry[compression])}`,
			entry.wasm ? `wasm binary ${format_bytes(wasm)}` : 'no wasm binary',
			entry.css
				? `theme stylesheet ${format_bytes(css)}`
				: 'no stylesheet: the theme is in the JavaScript'
		]
	});
};

/**
 * What one language adds to one library: its single-language set less the core
 * set. Unsupported when the library doesn't claim the language.
 */
export const to_bundle_increment_entry = (
	results: Pick<MatrixResults, 'bundle' | 'sets'>,
	library: string,
	lang: string,
	compression: BundleCompression
): MatrixEntry => {
	const core = to_bundle_size_entry(results, library, find_core_set(results.sets), compression);
	const single = to_bundle_size_entry(
		results,
		library,
		find_single_set(results.sets, lang),
		compression
	);
	if (single.kind !== 'value') return single;
	if (core.kind !== 'value') return core;
	return to_value_entry(single.value - core.value, {
		details: [
			`${format_bytes(single.value)} with the language alone, less ${format_bytes(core.value)} with none`
		]
	});
};

/**
 * The core set plus what each language of a set adds, for one library. It
 * equals the set's measured size only when the languages share no code, so the
 * two are shown side by side. Unsupported, naming the languages, when the
 * library lacks any of them.
 */
export const to_bundle_sum_entry = (
	results: Pick<MatrixResults, 'bundle' | 'sets'>,
	library: string,
	langs: ReadonlyArray<string>,
	compression: BundleCompression
): MatrixEntry => {
	const core = to_bundle_size_entry(results, library, find_core_set(results.sets), compression);
	if (core.kind !== 'value') return core;
	let sum = core.value;
	const missing: Array<string> = [];
	for (const lang of langs) {
		const added = to_bundle_increment_entry(results, library, lang, compression);
		if (added.kind === 'value') sum += added.value;
		else if (added.kind === 'unsupported') missing.push(...added.langs);
		else return added;
	}
	return missing.length > 0 ? { kind: 'unsupported', langs: missing } : to_value_entry(sum);
};

/** A row with one entry for each library of the roster. */
const to_bundle_row = (
	results: MatrixResults,
	row: Pick<MatrixRow, 'key' | 'label'> & Partial<MatrixRow>,
	to_entry: (library: string) => MatrixEntry
): MatrixRow => {
	const filled = to_matrix_row({ unit: 'bytes', direction: 'lower', ...row });
	for (const { id } of results.meta.libraries) filled.entries[id] = to_entry(id);
	return filled;
};

/**
 * What a page loads beside the JavaScript, kept out of the figures above it:
 * the wasm binary, the theme stylesheet, and which color schemes that theme
 * covers, since a theme with two is larger than a theme with one.
 */
export const to_bundle_beside_group = (
	results: MatrixResults,
	selection: Pick<BundleSelection, 'set' | 'compression'>
): MatrixGroup => {
	const core = find_core_set(results.sets);
	const selected = results.sets.find((set) => set.id === selection.set) ?? null;
	const to_sizes = (library: string) => {
		for (const set of [selected, core]) {
			const entry = find_bundle_entry(results, library, set);
			if (entry && !('unsupported' in entry)) return entry;
		}
		return null;
	};
	return {
		key: 'beside',
		label: 'Loaded beside the JavaScript',
		note: 'each on its own',
		rows: [
			to_bundle_row(results, { key: 'beside:wasm', label: 'wasm binary' }, (library) => {
				const sizes = to_sizes(library);
				if (!sizes) return { kind: 'unmeasured' };
				return sizes.wasm
					? to_value_entry(sizes.wasm[selection.compression])
					: { kind: 'none', text: 'none' };
			}),
			to_bundle_row(results, { key: 'beside:css', label: 'theme stylesheet' }, (library) => {
				const sizes = to_sizes(library);
				if (!sizes) return { kind: 'unmeasured' };
				return sizes.css
					? to_value_entry(sizes.css[selection.compression])
					: { kind: 'none', text: 'inline styles: the theme is in the JavaScript' };
			}),
			to_bundle_row(
				results,
				{ key: 'beside:schemes', label: 'color schemes the theme covers' },
				(library) => ({
					kind: 'none',
					text: results.meta.libraries.find((l) => l.id === library)!.theme_schemes.join(' + ')
				})
			)
		]
	};
};

/**
 * The incremental-cost view: the core set, what each selected language adds to
 * it, and for the selected set the sum of its languages beside its measured
 * total.
 *
 * @returns the groups, none for a file that measured no bundle
 */
export const to_bundle_cost_groups = (
	results: MatrixResults,
	selection: BundleSelection
): Array<MatrixGroup> => {
	const core = find_core_set(results.sets);
	if (!core || Object.keys(results.bundle).length === 0) return [];
	const { compression } = selection;
	const groups: Array<MatrixGroup> = [
		{
			key: 'core',
			label: 'The floor',
			note: 'the library with no language',
			rows: [
				to_bundle_row(results, { key: 'core', label: core.label }, (library) =>
					to_bundle_size_entry(results, library, core, compression)
				)
			]
		},
		{
			key: 'langs',
			label: 'Added by each language',
			note: 'the language alone, less the floor',
			rows: results.langs
				.filter((lang) => selection.langs.includes(lang.id))
				.map((lang) =>
					to_bundle_row(
						results,
						{
							key: `lang:${lang.id}`,
							label: lang.label,
							note: lang.timed ? null : 'not timed'
						},
						(library) => to_bundle_increment_entry(results, library, lang.id, compression)
					)
				)
		}
	];
	const set = to_combined_sets(results.sets).find((s) => s.ids.includes(selection.set));
	if (set) {
		const measured = results.sets.find((s) => s.id === set.ids[0])!;
		groups.push({
			key: 'set',
			label: `Set: ${set.label}`,
			note: to_combined_set_note(set),
			rows: [
				to_bundle_row(
					results,
					{
						key: 'set:sum',
						kind: 'summary',
						label: 'sum of the rows above',
						note: 'the floor plus each language alone: not a bundle',
						// no page loads this sum, so the libraries are not ranked by it
						compared: false
					},
					(library) => to_bundle_sum_entry(results, library, set.langs, compression)
				),
				to_bundle_row(
					results,
					{
						key: 'set:measured',
						kind: 'summary',
						label: 'measured',
						note: 'one bundle of them all'
					},
					(library) => to_bundle_size_entry(results, library, measured, compression)
				)
			]
		});
	}
	groups.push(to_bundle_beside_group(results, selection));
	return groups;
};

/**
 * The set totals: the core set and every set of several languages, each as it
 * was measured, then the same sets with everything a page loads added up.
 *
 * @returns the groups, none for a file that measured no bundle
 */
export const to_bundle_total_groups = (
	results: MatrixResults,
	selection: Pick<BundleSelection, 'set' | 'compression'>
): Array<MatrixGroup> => {
	const core = find_core_set(results.sets);
	if (Object.keys(results.bundle).length === 0) return [];
	const sets: Array<{ key: string; label: string; note: string; set: BenchSet }> = [];
	if (core) sets.push({ key: 'core', label: core.label, note: 'no language', set: core });
	for (const set of to_combined_sets(results.sets)) {
		sets.push({
			key: `set:${set.ids[0]}`,
			label: set.label,
			note: to_combined_set_note(set),
			set: results.sets.find((s) => s.id === set.ids[0])!
		});
	}
	const { compression } = selection;
	return [
		{
			key: 'sets',
			label: 'Feature sets',
			note: 'the JavaScript of each, measured as one bundle',
			rows: sets.map(({ key, label, note, set }) =>
				to_bundle_row(results, { key, label, note }, (library) =>
					to_bundle_size_entry(results, library, set, compression)
				)
			)
		},
		{
			key: 'loaded',
			label: 'Everything loaded',
			note: 'JavaScript + wasm binary + theme stylesheet, each compressed on its own',
			rows: sets.map(({ key, label, set }) =>
				to_bundle_row(results, { key: `loaded:${key}`, label }, (library) =>
					to_bundle_loaded_entry(results, library, set, compression)
				)
			)
		},
		to_bundle_beside_group(results, selection)
	];
};
