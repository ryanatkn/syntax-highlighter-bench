/**
 * The twinkleplop adapter. See `notes.md` beside it for the entry points and why.
 *
 * @module
 */

import type { LanguageFn, TokenizeResult } from '@twinkleplop/core';
import * as bash from '@twinkleplop/bash';
import * as css from '@twinkleplop/css';
import * as html from '@twinkleplop/html';
import * as javascript from '@twinkleplop/javascript';
import * as json from '@twinkleplop/json';
import * as markdown from '@twinkleplop/markdown';
import * as rust from '@twinkleplop/rust';
import * as svelte from '@twinkleplop/svelte';
import * as typescript from '@twinkleplop/typescript';

import {
	create_lang_map,
	resolve_claimed_langs,
	LangNotSetUpError,
	type HighlighterAdapter
} from '../../adapter.ts';
import type { Lang } from '../../langs.ts';

const ID = 'twinkleplop';

/** Each language package, keyed by the library's id for the language. */
const PACKAGES = { bash, css, html, javascript, json, markdown, rust, svelte, typescript };

type PackageName = keyof typeof PACKAGES;

const LANGS = {
	ts: 'typescript',
	js: 'javascript',
	css: 'css',
	html: 'html',
	json: 'json',
	svelte: 'svelte',
	md: 'markdown',
	bash: 'bash',
	rust: 'rust'
} as const satisfies Partial<Record<Lang, PackageName>>;

/** How many slots of `TokenizeResult.tokens` one token takes: type, start, end. */
const TOKEN_STRIDE = 3;

type HtmlFn = (input: string) => string;

/** The bound tokenizer and renderer for each language `setup` was given. */
let tokenizers = create_lang_map<LanguageFn>();
let renderers = create_lang_map<HtmlFn>();

export const twinkleplop_adapter: HighlighterAdapter<TokenizeResult> = {
	id: ID,
	label: 'twinkleplop',
	package: '@twinkleplop/core',
	by_maintainer: false,
	note: "The full pipeline: the grammar plus the language's reclassifier stack, as shipped.",
	extra_packages: Object.keys(PACKAGES).map((name) => `@twinkleplop/${name}`),
	langs: LANGS,
	via: {},
	output: 'classes',
	engine: 'grammar_vm',
	theme_css: ['@twinkleplop/theme-github'],
	// eslint-disable-next-line @typescript-eslint/require-await
	setup: async (langs) => {
		const next_tokenizers = create_lang_map<LanguageFn>();
		const next_renderers = create_lang_map<HtmlFn>();
		for (const [lang, name] of resolve_claimed_langs(ID, LANGS, langs)) {
			const language = PACKAGES[name];
			// bound here, outside the timed calls: a consumer binds once, not per highlight
			next_tokenizers[lang] = language.tokenize();
			next_renderers[lang] = language.language();
		}
		tokenizers = next_tokenizers;
		renderers = next_renderers;
	},
	tokenize: (src, lang) => {
		const tokenize = tokenizers[lang];
		if (tokenize === undefined) throw new LangNotSetUpError(ID, lang);
		return tokenize(src);
	},
	count_tokens: (result) => result.tokens.length / TOKEN_STRIDE,
	html: (src, lang) => {
		const render = renderers[lang];
		if (render === undefined) throw new LangNotSetUpError(ID, lang);
		return render(src);
	},
	bundle_entry: (langs) => {
		const names = resolve_claimed_langs(ID, LANGS, langs).map(([, name]) => name);
		if (names.length === 0) {
			return `export { create_language, to_html } from '@twinkleplop/core';\n`;
		}
		return names
			.map(
				(name) =>
					`export { language as ${name}_language, tokenize as ${name}_tokenize } from '@twinkleplop/${name}';\n`
			)
			.join('');
	}
};
