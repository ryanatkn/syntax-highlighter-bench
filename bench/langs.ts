/**
 * The language ids of the benchmark. The harness owns them: every adapter maps
 * these onto its library's own ids, and a results file carries this roster so the
 * site never has to import it. Adding a language is one line in `LANG_ROSTER`.
 *
 * This module and the rest of `bench/` run on Node directly, with type stripping:
 * erasable syntax only, relative imports with explicit `.ts` extensions, and
 * `import type` for types.
 *
 * @module
 */

import type { BenchLang } from '../src/lib/results_schema.ts';

/**
 * Every language id, with its label and whether timed cells cover the language.
 * An untimed language is named by the coverage matrix and the feature sets only.
 */
export const LANG_ROSTER = [
	{ id: 'ts', label: 'TypeScript', timed: true },
	{ id: 'js', label: 'JavaScript', timed: true },
	{ id: 'css', label: 'CSS', timed: true },
	{ id: 'html', label: 'HTML', timed: true },
	{ id: 'xml', label: 'XML', timed: false },
	{ id: 'json', label: 'JSON', timed: true },
	{ id: 'svelte', label: 'Svelte', timed: true },
	{ id: 'md', label: 'Markdown', timed: true },
	{ id: 'bash', label: 'Bash', timed: true },
	{ id: 'rust', label: 'Rust', timed: true }
] as const satisfies ReadonlyArray<BenchLang>;

/** A language id. */
export type Lang = (typeof LANG_ROSTER)[number]['id'];

/** A language id that timed cells cover. */
export type TimedLang = Extract<(typeof LANG_ROSTER)[number], { timed: true }>['id'];

/** Every language id, in roster order. */
export const LANGS: ReadonlyArray<Lang> = LANG_ROSTER.map((l) => l.id);

/** The language ids that timed cells cover. */
export const TIMED_LANGS: ReadonlyArray<TimedLang> = LANG_ROSTER.filter((l) => l.timed).map(
	(l) => l.id
);

/** The display label of each language id. */
export const LANG_LABELS: Readonly<Record<Lang, string>> = Object.fromEntries(
	LANG_ROSTER.map((l) => [l.id, l.label])
) as Record<Lang, string>;

/** Whether a string is a language id. */
export const is_lang = (value: string): value is Lang =>
	(LANGS as ReadonlyArray<string>).includes(value);

/** Whether timed cells cover a language. */
export const lang_is_timed = (lang: Lang): lang is TimedLang =>
	(TIMED_LANGS as ReadonlyArray<Lang>).includes(lang);
