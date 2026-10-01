/**
 * The feature sets: named lists of language ids that bundle size is measured
 * over. They are declared here, before any numbers exist, so a set can't be tuned
 * to flatter a result. Adding a set is one line in `FEATURE_SETS`.
 *
 * @module
 */

import type { BenchSet } from '../src/lib/results_schema.ts';
import { LANG_LABELS, LANGS, type Lang } from './langs.ts';

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
	create_feature_set('all', 'all', LANGS)
];
