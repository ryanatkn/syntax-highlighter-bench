/**
 * The cold-start tables: each scenario of a results file as a row, shown as
 * what the library added to the bare Node baseline every sample includes.
 *
 * @module
 */

import type { BenchStartup, BenchStartupScenario } from './results_schema.ts';
import { format_bytes, format_ms } from './bench_format.ts';
import {
	coverage_claims_lang,
	to_geomean_row,
	to_matrix_row,
	to_value_entry,
	type MatrixEntry,
	type MatrixGroup,
	type MatrixResults,
	type MatrixRow,
	type MatrixValue
} from './matrix.ts';

/** How a library was loaded: as the one bundled chunk, or unbundled from `node_modules`. */
export type StartupForm = 'bundled' | 'unbundled';

/** Both forms, in display order. */
export const STARTUP_FORMS: ReadonlyArray<StartupForm> = ['bundled', 'unbundled'];

/** The scenarios that load a library, in display order, with what each does. */
export const STARTUP_SCENARIO_LABELS: ReadonlyArray<{
	scenario: Exclude<BenchStartupScenario, 'bare'>;
	label: string;
}> = [
	{ scenario: 'core', label: 'import the library with no language' },
	{ scenario: 'lang', label: 'import the library with one language' },
	{ scenario: 'set', label: 'import the library with a feature set' },
	{ scenario: 'first_highlight', label: 'import one language and highlight once' }
];

/** Which cold-start rows to show. */
export interface StartupSelection {
	langs: ReadonlyArray<string>;
	forms: ReadonlyArray<string>;
}

/** The bare Node baseline of a results file, or null when it measured no cold start. */
export const find_startup_bare = (results: Pick<MatrixResults, 'startup'>): BenchStartup | null =>
	results.startup.find((entry) => entry.scenario === 'bare') ?? null;

/** What tells one row of one form from another: the scenario and what it loads. */
interface StartupTarget {
	scenario: Exclude<BenchStartupScenario, 'bare'>;
	lang: string | null;
	set: string | null;
	bundled: boolean;
}

const matches = (
	entry: { scenario: string; lang: string | null; set: string | null; bundled: boolean },
	target: StartupTarget
): boolean =>
	entry.scenario === target.scenario &&
	entry.lang === target.lang &&
	entry.set === target.set &&
	entry.bundled === target.bundled;

/**
 * The width of the bare baseline's own p10 to p90 band: how far two samples of
 * a process that loads nothing are apart. A library that added less than this
 * can't be told from one that added nothing.
 */
export const to_startup_noise_ms = (bare: Pick<BenchStartup, 'p10_ms' | 'p90_ms'>): number =>
	bare.p90_ms - bare.p10_ms;

/**
 * What a scenario added over the bare baseline, as an entry. An addition smaller
 * than the baseline's own band is `unranked`: it is printed, has no ratio, and
 * takes no part in a mean. One at or under zero is printed as "≈ bare" and not as a
 * negative time, which no process has.
 */
export const to_startup_value = (entry: BenchStartup, bare: BenchStartup): MatrixValue => {
	const added = entry.median_ms - bare.median_ms;
	const noise = to_startup_noise_ms(bare);
	const unranked =
		added < noise
			? `${added <= 0 ? "its median is at or under bare Node's" : `it added ${format_ms(added)}`}, inside the ${format_ms(noise)} between the 10th and 90th percentile of bare Node itself, so it can't be told from adding nothing`
			: null;
	return to_value_entry(added, {
		text: added <= 0 ? '≈ bare' : null,
		unranked,
		badges: unranked === null ? [] : [{ text: 'in the noise', title: unranked }],
		details: [
			`${format_ms(entry.median_ms)} since the process started, ${format_ms(bare.median_ms)} of it bare Node`,
			`p10–p90 ${format_ms(entry.p10_ms)}–${format_ms(entry.p90_ms)}`,
			`spread ${entry.spread.toFixed(2)}`,
			`${entry.samples} samples`,
			`peak RSS ${format_bytes(entry.rss_peak_bytes)}, ${entry.rss_peak_bytes <= bare.rss_peak_bytes ? "at or under bare Node's" : `${format_bytes(entry.rss_peak_bytes - bare.rss_peak_bytes)} over bare Node`}`
		]
	});
};

/** One library's entry for one scenario: what it added over the bare baseline. */
const to_startup_entry = (
	results: MatrixResults,
	bare: BenchStartup,
	library: string,
	target: StartupTarget
): MatrixEntry => {
	const entry = results.startup.find((e) => e.library === library && matches(e, target));
	if (entry) return to_startup_value(entry, bare);
	const excluded = results.meta.startup_excluded.find(
		(e) => e.library === library && matches(e, target)
	);
	if (excluded) return { kind: 'excluded', reason: excluded.reason };
	const langs =
		target.lang !== null
			? [target.lang]
			: (results.sets.find((set) => set.id === target.set)?.langs ?? []);
	const missing = langs.filter((lang) => !coverage_claims_lang(results.coverage, library, lang));
	return missing.length > 0 ? { kind: 'unsupported', langs: missing } : { kind: 'unmeasured' };
};

/**
 * The cold-start scenarios as groups of one form and one scenario. A group of
 * several languages closes with a geometric mean. Every number is the scenario's
 * median less the bare baseline's: what the library added to a Node process.
 * In a row holding an addition inside the baseline's own noise, the others are
 * compared with that noise, as lower bounds, and the row is left out of the
 * mean.
 *
 * @param libraries - the selected library ids, which decide which rows are
 * complete and so enter a mean
 * @returns the groups, none for a file that measured no cold start
 */
export const to_startup_groups = (
	results: MatrixResults,
	selection: StartupSelection,
	libraries: ReadonlyArray<string>
): Array<MatrixGroup> => {
	const bare = find_startup_bare(results);
	if (!bare) return [];
	const timed_langs = results.langs.filter((l) => l.timed && selection.langs.includes(l.id));
	const scenario_sets = new Set(
		[...results.startup, ...results.meta.startup_excluded].flatMap((entry) => entry.set ?? [])
	);
	const sets = results.sets.filter((set) => scenario_sets.has(set.id));
	const groups: Array<MatrixGroup> = [];
	for (const form of STARTUP_FORMS) {
		if (!selection.forms.includes(form)) continue;
		const bundled = form === 'bundled';
		for (const { scenario, label } of STARTUP_SCENARIO_LABELS) {
			const targets: Array<{ label: string; lang: string | null; set: string | null }> =
				scenario === 'core'
					? [{ label: 'core', lang: null, set: null }]
					: scenario === 'set'
						? sets.map((set) => ({ label: set.label, lang: null, set: set.id }))
						: timed_langs.map((lang) => ({ label: lang.label, lang: lang.id, set: null }));
			const key = `${form}:${scenario}`;
			const rows: Array<MatrixRow> = targets.map((target) => {
				const row = to_matrix_row({
					key: `${key}:${target.lang ?? target.set ?? 'core'}`,
					label: target.label,
					unit: 'ms',
					direction: 'lower',
					resolution: to_startup_noise_ms(bare)
				});
				for (const { id } of results.meta.libraries) {
					row.entries[id] = to_startup_entry(results, bare, id, {
						scenario,
						lang: target.lang,
						set: target.set,
						bundled
					});
				}
				return row;
			});
			if (rows.length === 0) continue;
			const mean =
				rows.length > 1 ? to_geomean_row(rows, libraries, `${key}:geomean`, 'geomean') : null;
			groups.push({
				key,
				label: `${form} · ${label}`,
				note: null,
				rows: mean ? [...rows, mean] : rows
			});
		}
	}
	return groups;
};
