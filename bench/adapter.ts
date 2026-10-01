/**
 * The adapter contract: how the harness drives one library. Each library has
 * one adapter under `bench/libraries/<id>/`, listed in `bench/libraries.ts`.
 *
 * The rules every adapter holds to:
 *
 * - **Same stage.** `tokenize` and `html` are the narrowest public entries doing
 *   the same work as the other adapters': tokens out, and the HTML string a
 *   consumer ships.
 * - **Explicit languages.** `langs` lists what the library is measured on, and
 *   nothing else is. A call for a language outside the map, or one `setup` wasn't
 *   given, throws. It never returns escaped plain text, which would benchmark as
 *   very fast.
 * - **Token counts are recorded, not equalised.** Libraries split the same source
 *   differently, so `count_tokens` reports the library's own count and the
 *   adapter's `notes.md` says what one token is.
 * - **Synchronous timed paths.** `tokenize` and `html` are synchronous. A library
 *   with an async API does its loading in `setup` and is timed through its
 *   synchronous core.
 * - **Browser-safe.** No Node-only API and no file access, so an adapter runs in a
 *   page unchanged. Reading a version, a stylesheet, or a wasm file from disk is
 *   the harness's job, in `bench/library_info.ts`.
 *
 * @module
 */

import type { BenchEngineKind, BenchOutputKind } from '../src/lib/results_schema.ts';
import type { Lang } from './langs.ts';

/**
 * One library, as the harness drives it.
 *
 * @template TTokens - what the library's tokenizer returns
 */
export interface HighlighterAdapter<TTokens = unknown> {
	/** The library's id in a results file. It is also the adapter's directory name. */
	id: string;
	/** The display name. */
	label: string;
	/** The npm package whose manifest gives the measured version. */
	package: string;
	/** Whether this benchmark's maintainer also maintains the library. */
	by_maintainer: boolean;
	/** What was measured and any caveat, shown beside the library. */
	note: string | null;
	/**
	 * Packages the library is measured with that are versioned apart from
	 * `package`, like per-language packages. Their versions are recorded too.
	 */
	extra_packages?: ReadonlyArray<string>;
	/**
	 * The languages the library is measured on: harness id to the library's own
	 * id. An absent language is unsupported, and no cell or set covers it.
	 */
	langs: Partial<Record<Lang, string>>;
	/**
	 * A footnote for a claimed language whose support a reader should know more
	 * about, like a third-party grammar. It becomes the coverage entry's `via`.
	 */
	via: Partial<Record<Lang, string>>;
	/** What the HTML carries its colors in. */
	output: BenchOutputKind;
	/** How the library lexes. */
	engine: BenchEngineKind;
	/**
	 * The module specifiers of the stylesheets a consumer imports for the default
	 * theme, measured as the CSS that class-based output needs. Null when the
	 * styles are inline.
	 */
	theme_css: ReadonlyArray<string> | null;
	/**
	 * Loads and registers exactly these languages, plus whatever the library
	 * itself requires for them. Called once per process, before any timing.
	 *
	 * The harness gives a cell's process exactly the cell's language, so every
	 * library has the same languages loaded; what a language embeds beyond that
	 * (Markdown fences) is not loaded.
	 *
	 * @param langs - languages the adapter claims
	 * @throws if a language is outside `langs`
	 */
	setup(langs: ReadonlyArray<Lang>): Promise<void>;
	/**
	 * The narrowest tokens-out entry. Timed, so it returns the library's own
	 * result untouched and leaves the counting to `count_tokens`.
	 *
	 * @throws if `setup` wasn't given the language
	 */
	tokenize(src: string, lang: Lang): TTokens;
	/** How many tokens a `tokenize` result holds. Never timed. */
	count_tokens(tokens: TTokens): number;
	/**
	 * The HTML string a consumer ships.
	 *
	 * @throws if `setup` wasn't given the language
	 */
	html(src: string, lang: Lang): string;
	/**
	 * The source of a module that imports and registers exactly these languages
	 * in the library's documented shape, and exports the ready highlighter. Bundle
	 * size is measured over it. With no languages it is the library's runtime
	 * floor.
	 *
	 * @param langs - languages the adapter claims
	 * @throws if a language is outside `langs`
	 */
	bundle_entry(langs: ReadonlyArray<Lang>): string;
}

/**
 * Narrows languages to the ones an adapter claims, in the order given.
 *
 * @param adapter_id - the adapter, for the error message
 * @param claimed - the adapter's `langs`
 * @param langs - the languages asked for
 * @returns the library's ids for `langs`, each once, as `[lang, library_id]` pairs
 * @throws if a language is outside `claimed`
 */
export const resolve_claimed_langs = <TClaimed extends Partial<Record<Lang, string>>>(
	adapter_id: string,
	claimed: TClaimed,
	langs: ReadonlyArray<Lang>
): Array<[lang: Lang & keyof TClaimed, library_lang: TClaimed[Lang & keyof TClaimed] & string]> =>
	[...new Set(langs)].map((lang) => {
		if (!Object.hasOwn(claimed, lang)) {
			throw new Error(`${adapter_id} doesn't claim lang "${lang}"`);
		}
		const claimed_lang = lang as Lang & keyof TClaimed;
		return [claimed_lang, claimed[claimed_lang] as TClaimed[Lang & keyof TClaimed] & string];
	});

/**
 * Creates the lookup an adapter keeps of what `setup` loaded, keyed by language.
 * It has no prototype, so a lookup by any string finds only what was put there.
 */
export const create_lang_map = <T>(
	entries: Iterable<readonly [Lang, T]> = []
): Partial<Record<Lang, T>> => Object.assign(Object.create(null), Object.fromEntries(entries));

/**
 * The error an adapter throws for a language `setup` didn't load, instead of
 * letting the library fall back to plain text. It means the caller is wrong, not
 * the library, so the output check rethrows it rather than recording an exclusion.
 */
export class LangNotSetUpError extends Error {
	constructor(adapter_id: string, lang: string) {
		super(`${adapter_id} has no lang "${lang}" set up`);
		this.name = 'LangNotSetUpError';
	}
}
