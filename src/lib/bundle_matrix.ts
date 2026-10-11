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

import type { BenchBundleEntry, BenchInstall, BenchLang, BenchSet } from './results_schema.ts';
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

/** How a size of each compression is described in a group's note. */
const COMPRESSION_NOTES: Record<BundleCompression, string> = {
	raw: 'minified',
	gzip: 'minified and gzipped',
	brotli: 'minified and brotli-compressed'
};

/**
 * Below this many minified bytes, what one more language adds is shown as
 * already included rather than as a number: a few bytes are a separator or an
 * import, not a grammar.
 */
export const MARGINAL_INCLUDED_BELOW = 16;

/** Which bundle table to show: what each language costs, or each set's total. */
export type BundleView = 'incremental' | 'totals';

/** Both views, with their labels, in display order. */
export const BUNDLE_VIEWS: ReadonlyArray<{ id: BundleView; label: string }> = [
	{ id: 'incremental', label: 'what each language costs' },
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

/** Whether a set holds exactly these languages, in any order. */
const set_holds = (set: BenchSet, langs: ReadonlyArray<string>): boolean =>
	set.langs.length === langs.length && langs.every((lang) => set.langs.includes(lang));

/** The ids of the timed languages of a file, in its order. */
const to_timed_lang_ids = (langs: ReadonlyArray<BenchLang>): Array<string> =>
	langs.filter((lang) => lang.timed).map((lang) => lang.id);

/** The set of every timed language, which every library claims. */
export const find_timed_set = (
	sets: ReadonlyArray<BenchSet>,
	langs: ReadonlyArray<BenchLang>
): BenchSet | null => {
	const timed = to_timed_lang_ids(langs);
	return timed.length > 0 ? (sets.find((set) => set_holds(set, timed)) ?? null) : null;
};

/** The set of every timed language but one. */
export const find_without_set = (
	sets: ReadonlyArray<BenchSet>,
	langs: ReadonlyArray<BenchLang>,
	lang: string
): BenchSet | null => {
	const timed = to_timed_lang_ids(langs);
	if (!timed.includes(lang)) return null;
	const others = timed.filter((other) => other !== lang);
	return others.length > 0 ? (sets.find((set) => set_holds(set, others)) ?? null) : null;
};

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
 * showing both would be a duplicate row that says nothing. The sets of every
 * timed language but one are left out: they are there for what each language
 * adds (`to_bundle_marginal_entry`), not to be shown.
 */
export const to_combined_sets = (
	sets: ReadonlyArray<BenchSet>,
	langs: ReadonlyArray<BenchLang>
): Array<CombinedSet> => {
	const combined: Map<string, CombinedSet & { labels: Array<string> }> = new Map();
	// a set of every timed language but one is there for what that language adds, not to be shown
	const leave_one_out: Set<BenchSet> = new Set();
	for (const lang of langs) {
		const without = find_without_set(sets, langs, lang.id);
		if (without) leave_one_out.add(without);
	}
	for (const set of sets) {
		if (set.langs.length < 2 || leave_one_out.has(set)) continue;
		const key = [...set.langs].sort().join(',');
		const existing = combined.get(key);
		if (existing) {
			existing.ids.push(set.id);
			existing.labels.push(set.label);
			existing.footnote ??= set.footnote;
		} else {
			combined.set(key, {
				ids: [set.id],
				label: set.label,
				labels: [set.label],
				langs: [...set.langs],
				footnote: set.footnote
			});
		}
	}
	return [...combined.values()].map(({ labels, ...set }) => ({
		...set,
		label: labels.length > 1 ? `${labels[0]} (same as ${labels.slice(1).join(', ')})` : set.label
	}));
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

/** The JS size of one library over one set. */
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
 * Everything a page loads for one library over one set: the JS, the
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
			`JS ${format_bytes(entry[compression])}`,
			entry.wasm ? `wasm binary ${format_bytes(wasm)}` : 'no wasm binary',
			entry.css ? `theme stylesheet ${format_bytes(css)}` : 'no stylesheet: the theme is in the JS'
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
 * What one timed language adds to a bundle of all the others: the set of every
 * timed language less the set without it, in minified bytes. Unlike
 * `to_bundle_increment_entry`, this never carries runtime that any language
 * needs, which the first language loaded pays for. It is never compressed:
 * compression works across a whole bundle, so the difference of two compressed
 * bundles doesn't isolate one language's share, and can come out negative. A
 * language the others already hold adds nothing, and an addition under
 * `MARGINAL_INCLUDED_BELOW` is shown as already included. Unmeasured when the
 * file holds neither set.
 */
export const to_bundle_marginal_entry = (
	results: Pick<MatrixResults, 'bundle' | 'sets' | 'langs'>,
	library: string,
	lang: string
): MatrixEntry => {
	const timed = find_timed_set(results.sets, results.langs);
	const without = find_without_set(results.sets, results.langs, lang);
	if (!timed || !without) return { kind: 'unmeasured' };
	const all = to_bundle_size_entry(results, library, timed, 'raw');
	const less = to_bundle_size_entry(results, library, without, 'raw');
	if (all.kind !== 'value') return all;
	if (less.kind !== 'value') return less;
	const added = all.value - less.value;
	if (added < MARGINAL_INCLUDED_BELOW) return { kind: 'none', text: 'already included' };
	return to_value_entry(added, {
		details: [
			`${format_bytes(all.value)} with every timed language, less ${format_bytes(less.value)} without this one, minified`
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

/** A row of byte sizes with one entry for each library of the roster. */
export const to_bundle_row = (
	results: MatrixResults,
	row: Pick<MatrixRow, 'key' | 'label'> & Partial<MatrixRow>,
	to_entry: (library: string) => MatrixEntry
): MatrixRow => {
	const filled = to_matrix_row({ unit: 'bytes', direction: 'lower', ...row });
	for (const { id } of results.meta.libraries) filled.entries[id] = to_entry(id);
	return filled;
};

/**
 * What a page loads beside the JS, kept out of the figures above it:
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
		label: 'Loaded beside the JS',
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
					: { kind: 'none', text: 'inline styles: the theme is in the JS' };
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
			note: `the library with no language, ${COMPRESSION_NOTES[compression]}`,
			rows: [
				to_bundle_row(results, { key: 'core', label: core.label }, (library) =>
					to_bundle_size_entry(results, library, core, compression)
				)
			]
		},
		{
			key: 'langs',
			label: 'Each language',
			note: `its bundle less the floor, ${COMPRESSION_NOTES[compression]}: with any runtime the floor leaves out`,
			rows: results.langs
				.filter((lang) => selection.langs.includes(lang.id))
				.map((lang) =>
					to_bundle_row(results, { key: `lang:${lang.id}`, label: lang.label }, (library) =>
						to_bundle_increment_entry(results, library, lang.id, compression)
					)
				)
		}
	];
	const timed = find_timed_set(results.sets, results.langs);
	const marginal_langs = results.langs.filter(
		(lang) =>
			lang.timed &&
			selection.langs.includes(lang.id) &&
			find_without_set(results.sets, results.langs, lang.id) !== null
	);
	const marginal_rows = marginal_langs
		.map((lang) =>
			to_bundle_row(results, { key: `marginal:${lang.id}`, label: lang.label }, (library) =>
				to_bundle_marginal_entry(results, library, lang.id)
			)
		)
		// a language every library already includes says only that something else embeds it
		.filter((row) => Object.values(row.entries).some((entry) => entry.kind !== 'none'));
	if (timed && marginal_rows.length > 0) {
		groups.push({
			key: 'marginal',
			label: 'One more language',
			note: 'what it adds to a bundle of every other timed language, minified and never compressed, whatever the Bytes selector says: already included when another language embeds it, as HTML and Svelte embed their script and style languages',
			rows: marginal_rows
		});
	}
	const set = to_combined_sets(results.sets, results.langs).find((s) =>
		s.ids.includes(selection.set)
	);
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
						label: 'floor plus each language alone',
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
	for (const set of to_combined_sets(results.sets, results.langs)) {
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
			note: 'the JS of each, measured as one bundle',
			rows: sets.map(({ key, label, note, set }) =>
				to_bundle_row(results, { key, label, note }, (library) =>
					to_bundle_size_entry(results, library, set, compression)
				)
			)
		},
		{
			key: 'loaded',
			label: 'Everything loaded',
			note: 'JS + wasm binary + theme stylesheet, each compressed on its own',
			rows: sets.map(({ key, label, set }) =>
				to_bundle_row(results, { key: `loaded:${key}`, label }, (library) =>
					to_bundle_loaded_entry(results, library, set, compression)
				)
			)
		},
		to_bundle_beside_group(results, selection)
	];
};

/** The numbers of an install footprint, with their labels and units, in display order. */
export const INSTALL_MEASURES: ReadonlyArray<{
	id: Exclude<keyof BenchInstall, 'closure'>;
	label: string;
	unit: MatrixRow['unit'];
}> = [
	{ id: 'packages', label: 'packages', unit: 'count' },
	{ id: 'files', label: 'files', unit: 'count' },
	{ id: 'bytes', label: 'bytes', unit: 'bytes' }
];

/**
 * The install footprints: what `npm install` of each library adds, as a row for
 * each number. The footprint is everything the packages ship, every language,
 * theme, and type declaration included, and not what a page loads, which the
 * bundle tables show.
 *
 * @returns the group, or null for a file that measured no footprint
 */
export const to_install_group = (results: MatrixResults): MatrixGroup | null => {
	if (Object.keys(results.install).length === 0) return null;
	return {
		key: 'install',
		label: 'Install footprint',
		note: 'the packages and their runtime dependencies, each package once',
		rows: INSTALL_MEASURES.map(({ id, label, unit }) =>
			to_bundle_row(results, { key: `install:${id}`, label, unit }, (library) =>
				Object.hasOwn(results.install, library)
					? to_value_entry(results.install[library]![id])
					: { kind: 'unmeasured' }
			)
		)
	};
};
