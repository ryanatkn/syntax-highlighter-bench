/**
 * The feature sets: named lists of language ids that bundle size is measured
 * over. They are declared here, before any numbers exist, so a set can't be tuned
 * to flatter a result. Adding a set is one line in `FEATURE_SETS`.
 *
 * @module
 */

import type { BenchSet } from '../src/lib/results_schema.ts';
import { LANG_LABELS, LANGS, TIMED_LANGS, type Lang } from './langs.ts';

/**
 * A named list of languages: the shape a results file carries as its `sets`,
 * with the languages narrowed to the harness's ids.
 */
export type FeatureSet = Omit<BenchSet, 'langs'> & { langs: ReadonlyArray<Lang> };

const create_feature_set = (
	id: string,
	label: string,
	langs: ReadonlyArray<Lang>,
	footnote: string | null = null
): FeatureSet => ({ id, label, langs, footnote });

/** The id of the set holding a single language. */
export const to_single_set_id = (lang: Lang): string => `single:${lang}`;

/** The id of the set with no languages: a library's runtime floor. */
export const CORE_SET_ID = 'core';

/**
 * The id of the set of every timed language. Every library claims each of
 * them, so the sets that leave one out are measured against it for all of them.
 */
export const TIMED_SET_ID = 'timed';

/** The id of the set of every timed language but one. */
export const to_without_set_id = (lang: Lang): string => `without:${lang}`;

/** Every feature set, in display order. */
export const FEATURE_SETS: ReadonlyArray<FeatureSet> = [
	create_feature_set(CORE_SET_ID, 'core', []),
	// one per language, so `single - core` is what that language adds
	...LANGS.map((lang) => create_feature_set(to_single_set_id(lang), LANG_LABELS[lang], [lang])),
	// the shape a documentation site imports, matching twinkleplop's docs bundle
	create_feature_set('docs', 'docs', ['js', 'ts', 'css', 'html', 'md', 'bash', 'json']),
	create_feature_set(
		'web_rust',
		'web + rust',
		['ts', 'js', 'css', 'html', 'xml', 'json', 'svelte', 'md', 'bash', 'rust'],
		"fuz_code's full set (home turf)"
	),
	create_feature_set('all', 'all', LANGS),
	// with one per timed language less it, so `timed - without` is what that language adds to a
	// bundle that has the others: the first language carries whatever runtime the floor leaves out
	create_feature_set(TIMED_SET_ID, 'every timed language', TIMED_LANGS),
	...TIMED_LANGS.map((lang) =>
		create_feature_set(
			to_without_set_id(lang),
			`timed less ${LANG_LABELS[lang]}`,
			TIMED_LANGS.filter((other) => other !== lang)
		)
	)
];

/** The feature sets as a results file carries them: its `sets` section. */
export const to_bench_sets = (): Array<BenchSet> =>
	FEATURE_SETS.map((set) => ({ ...set, langs: [...set.langs] }));
