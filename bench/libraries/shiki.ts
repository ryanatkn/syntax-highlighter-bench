/**
 * What the two Shiki adapters share: the same grammars and theme, driven by
 * different regex engines. See `shiki_js/notes.md` for the entry points and why.
 *
 * @module
 */

import {
	createHighlighterCoreSync,
	type HighlighterCore,
	type LanguageRegistration,
	type RegexEngine,
	type ThemedToken,
	type ThemeRegistration
} from 'shiki/core';

import {
	create_lang_map,
	resolve_claimed_langs,
	LangNotSetUpError,
	type AdapterWasm,
	type HighlighterAdapter
} from '../adapter.ts';
import type { Lang } from '../langs.ts';

/**
 * Shiki stops tokenizing a line after this many milliseconds and returns the
 * rest of it as one token, 500 by default. With the default, what a call
 * returns depends on how fast the machine is at that moment: a cold first call
 * on a loaded machine comes back with fewer tokens than the next one. The
 * benchmark needs the same work from every call, so the limit is put out of
 * reach. It is not turned off with 0: Shiki reads the clock before every match
 * only while a limit is set, so 0 would skip work its default does.
 */
const TOKENIZE_TIME_LIMIT = 2 ** 31 - 1;

/** The one bundled theme both adapters render with. */
const THEME = { name: 'github-light', module: 'shiki/themes/github-light.mjs' };

const load_theme = async (): Promise<ThemeRegistration> =>
	(await import('shiki/themes/github-light.mjs')).default;

/**
 * Each grammar module. A module's default export lists the grammar and the
 * grammars it embeds, so loading one loads what it requires. `module` and `load`
 * name the same file, once as text for `bundle_entry` and once as an import a
 * bundler can see.
 */
const GRAMMARS = {
	typescript: {
		module: 'shiki/langs/typescript.mjs',
		load: () => import('shiki/langs/typescript.mjs')
	},
	javascript: {
		module: 'shiki/langs/javascript.mjs',
		load: () => import('shiki/langs/javascript.mjs')
	},
	css: { module: 'shiki/langs/css.mjs', load: () => import('shiki/langs/css.mjs') },
	html: { module: 'shiki/langs/html.mjs', load: () => import('shiki/langs/html.mjs') },
	xml: { module: 'shiki/langs/xml.mjs', load: () => import('shiki/langs/xml.mjs') },
	json: { module: 'shiki/langs/json.mjs', load: () => import('shiki/langs/json.mjs') },
	svelte: { module: 'shiki/langs/svelte.mjs', load: () => import('shiki/langs/svelte.mjs') },
	markdown: {
		module: 'shiki/langs/markdown.mjs',
		load: () => import('shiki/langs/markdown.mjs')
	},
	shellscript: {
		module: 'shiki/langs/shellscript.mjs',
		load: () => import('shiki/langs/shellscript.mjs')
	},
	rust: { module: 'shiki/langs/rust.mjs', load: () => import('shiki/langs/rust.mjs') }
} as const satisfies Record<
	string,
	{ module: string; load: () => Promise<{ default: Array<LanguageRegistration> }> }
>;

type GrammarName = keyof typeof GRAMMARS;

const LANGS = {
	ts: 'typescript',
	js: 'javascript',
	css: 'css',
	html: 'html',
	xml: 'xml',
	json: 'json',
	svelte: 'svelte',
	md: 'markdown',
	bash: 'shellscript',
	rust: 'rust'
} as const satisfies Partial<Record<Lang, GrammarName>>;

/** How one Shiki adapter differs from the other. */
export interface ShikiAdapterOptions {
	id: string;
	label: string;
	note: string;
	/** Creates the regex engine. The only async step, done in `setup`. */
	create_engine: () => RegexEngine | Promise<RegexEngine>;
	/** The WebAssembly binaries the engine loads, if it loads any. */
	wasm?: ReadonlyArray<AdapterWasm>;
	/** The engine's part of the bundle entry, in Shiki's documented shape. */
	entry: {
		/** The import line for the engine factory. */
		engine_import: string;
		/** The expression that creates the engine. */
		engine_expression: string;
		/** Whether the engine is ready synchronously, so the sync factory applies. */
		sync: boolean;
	};
}

/** Creates the adapter for one Shiki engine. */
export const create_shiki_adapter = (
	options: ShikiAdapterOptions
): HighlighterAdapter<Array<Array<ThemedToken>>> => {
	const { id, entry } = options;

	let highlighter: HighlighterCore | null = null;
	/** The library's id for each language `setup` was given. */
	let ready = create_lang_map<string>();

	/** The library's id for a language, refusing one that `setup` wasn't given. */
	const to_ready_lang = (lang: Lang): string => {
		const library_lang = ready[lang];
		if (library_lang === undefined) throw new LangNotSetUpError(id, lang);
		return library_lang;
	};

	return {
		id,
		label: options.label,
		package: 'shiki',
		by_maintainer: false,
		note: options.note,
		langs: LANGS,
		via: { xml: 'the XML grammar embeds the Java grammar, which loads with it' },
		output: 'inline_styles',
		engine: 'textmate',
		theme_css: null,
		theme_schemes: ['light'],
		...(options.wasm && { wasm: options.wasm }),
		setup: async (langs) => {
			const claimed = resolve_claimed_langs(id, LANGS, langs);
			const grammars = await Promise.all(
				claimed.map(async ([, name]) => (await GRAMMARS[name].load()).default)
			);
			const next = createHighlighterCoreSync({
				themes: [await load_theme()],
				langs: grammars,
				engine: await options.create_engine()
			});
			highlighter?.dispose();
			highlighter = next;
			ready = create_lang_map(claimed);
		},
		tokenize: (src, lang) => {
			const library_lang = to_ready_lang(lang);
			return highlighter!.codeToTokensBase(src, {
				lang: library_lang,
				theme: THEME.name,
				tokenizeTimeLimit: TOKENIZE_TIME_LIMIT
			});
		},
		count_tokens: (lines) => {
			let count = 0;
			for (const line of lines) count += line.length;
			return count;
		},
		html: (src, lang) => {
			const library_lang = to_ready_lang(lang);
			return highlighter!.codeToHtml(src, {
				lang: library_lang,
				theme: THEME.name,
				tokenizeTimeLimit: TOKENIZE_TIME_LIMIT
			});
		},
		bundle_entry: (langs) => {
			const names = resolve_claimed_langs(id, LANGS, langs).map(([, name]) => name);
			const factory = entry.sync ? 'createHighlighterCoreSync' : 'createHighlighterCore';
			return [
				`import { ${factory} } from 'shiki/core';`,
				entry.engine_import,
				`import theme from '${THEME.module}';`,
				...names.map((name) => `import ${name} from '${GRAMMARS[name].module}';`),
				'',
				`export const highlighter = ${entry.sync ? '' : 'await '}${factory}({`,
				'\tthemes: [theme],',
				`\tlangs: [${names.join(', ')}],`,
				`\tengine: ${entry.engine_expression}`,
				'});',
				''
			].join('\n');
		},
		bundle_html: (exports, src, lang) => {
			const [[, name]] = resolve_claimed_langs(id, LANGS, [lang]) as [[Lang, GrammarName]];
			return (exports.highlighter as HighlighterCore).codeToHtml(src, {
				lang: name,
				theme: THEME.name,
				tokenizeTimeLimit: TOKENIZE_TIME_LIMIT
			});
		}
	};
};
