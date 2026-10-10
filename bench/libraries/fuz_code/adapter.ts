/**
 * The fuz_code adapter. See `notes.md` beside it for the entry points and why.
 *
 * @module
 */

import { SyntaxStyler } from '@fuzdev/fuz_code/syntax_styler.js';
import type { LexedSyntax, SyntaxLang } from '@fuzdev/fuz_code/lexer.js';
import { lexer_bash } from '@fuzdev/fuz_code/lexer_bash.js';
import { lexer_css } from '@fuzdev/fuz_code/lexer_css.js';
import { lexer_json } from '@fuzdev/fuz_code/lexer_json.js';
import { lexer_markup, lexer_xml } from '@fuzdev/fuz_code/lexer_markup.js';
import { lexer_md } from '@fuzdev/fuz_code/lexer_md.js';
import { lexer_rust } from '@fuzdev/fuz_code/lexer_rust.js';
import { lexer_svelte } from '@fuzdev/fuz_code/lexer_svelte.js';
import { lexer_ts } from '@fuzdev/fuz_code/lexer_ts.js';

import {
	create_lang_map,
	resolve_claimed_langs,
	LangNotSetUpError,
	type HighlighterAdapter
} from '../../adapter.ts';
import type { Lang } from '../../langs.ts';

const ID = 'fuz_code';

/** Each lexer and the module that exports it, in registration order. */
const LEXERS = {
	lexer_ts: { lexer: lexer_ts, module: '@fuzdev/fuz_code/lexer_ts.js' },
	lexer_css: { lexer: lexer_css, module: '@fuzdev/fuz_code/lexer_css.js' },
	lexer_markup: { lexer: lexer_markup, module: '@fuzdev/fuz_code/lexer_markup.js' },
	lexer_xml: { lexer: lexer_xml, module: '@fuzdev/fuz_code/lexer_markup.js' },
	lexer_json: { lexer: lexer_json, module: '@fuzdev/fuz_code/lexer_json.js' },
	lexer_svelte: { lexer: lexer_svelte, module: '@fuzdev/fuz_code/lexer_svelte.js' },
	lexer_md: { lexer: lexer_md, module: '@fuzdev/fuz_code/lexer_md.js' },
	lexer_bash: { lexer: lexer_bash, module: '@fuzdev/fuz_code/lexer_bash.js' },
	lexer_rust: { lexer: lexer_rust, module: '@fuzdev/fuz_code/lexer_rust.js' }
} as const satisfies Record<string, { lexer: SyntaxLang; module: string }>;

type LexerName = keyof typeof LEXERS;

const LANGS = {
	ts: 'ts',
	js: 'js',
	css: 'css',
	html: 'html',
	xml: 'xml',
	json: 'json',
	svelte: 'svelte',
	md: 'md',
	bash: 'bash',
	rust: 'rust'
} as const satisfies Partial<Record<Lang, string>>;

/**
 * The lexers a language needs: its own, then the ones it embeds structurally.
 * A lexer resolves an embedded language through the styler's registry and leaves
 * the region plain when it is missing, so `<script>` and `<style>` content is
 * highlighted only if these are registered.
 */
const REQUIRED: Record<keyof typeof LANGS, ReadonlyArray<LexerName>> = {
	ts: ['lexer_ts'],
	js: ['lexer_ts'],
	css: ['lexer_css'],
	html: ['lexer_markup', 'lexer_ts', 'lexer_css'],
	xml: ['lexer_xml'],
	json: ['lexer_json'],
	svelte: ['lexer_svelte', 'lexer_ts', 'lexer_css'],
	md: ['lexer_md'],
	bash: ['lexer_bash'],
	rust: ['lexer_rust']
};

/** The lexers `langs` need, each once, in registration order. */
const to_lexer_names = (langs: ReadonlyArray<Lang>): Array<LexerName> => {
	const needed: Set<LexerName> = new Set();
	for (const [lang] of resolve_claimed_langs(ID, LANGS, langs)) {
		for (const name of REQUIRED[lang]) needed.add(name);
	}
	return (Object.keys(LEXERS) as Array<LexerName>).filter((name) => needed.has(name));
};

let styler = new SyntaxStyler();
/** The library's id for each language `setup` was given. */
let ready = create_lang_map<string>();

/** The library's id for a language, refusing one that `setup` wasn't given. */
const to_ready_lang = (lang: Lang): string => {
	const id = ready[lang];
	if (id === undefined) throw new LangNotSetUpError(ID, lang);
	return id;
};

export const fuz_code_adapter: HighlighterAdapter<LexedSyntax> = {
	id: ID,
	label: 'fuz_code',
	package: '@fuzdev/fuz_code',
	by_maintainer: true,
	note: 'Single-pass lexers. `tokenize` is the lexer alone and `html` adds the renderer.',
	langs: LANGS,
	via: { js: 'the TypeScript lexer, which fuz_code registers for JavaScript' },
	output: 'classes',
	engine: 'scanner',
	theme_css: ['@fuzdev/fuz_code/theme.css', '@fuzdev/fuz_code/theme_variables.css'],
	theme_schemes: ['light', 'dark'],
	// eslint-disable-next-line @typescript-eslint/require-await
	setup: async (langs) => {
		const next = new SyntaxStyler();
		for (const name of to_lexer_names(langs)) next.add_lang(LEXERS[name].lexer);
		styler = next;
		ready = create_lang_map(resolve_claimed_langs(ID, LANGS, langs));
	},
	tokenize: (src, lang) => styler.lex(src, to_ready_lang(lang)),
	count_tokens: (lexed) => {
		// a leaf is `[type, start, end]` and an open is `[-type, start]`: one token each.
		// a close is `[0, end]` and counts as nothing
		const { events, events_len } = lexed;
		let count = 0;
		let i = 0;
		while (i < events_len) {
			const type = events[i]!;
			if (type !== 0) count++;
			i += type > 0 ? 3 : 2;
		}
		return count;
	},
	html: (src, lang) => styler.stylize(src, to_ready_lang(lang)),
	bundle_entry: (langs) => {
		const names = to_lexer_names(langs);
		const modules = [...new Set(names.map((name) => LEXERS[name].module))];
		return [
			`import { SyntaxStyler } from '@fuzdev/fuz_code/syntax_styler.js';`,
			...modules.map((module) => {
				const exported = names.filter((name) => LEXERS[name].module === module);
				return `import { ${exported.join(', ')} } from '${module}';`;
			}),
			'',
			'export const syntax_styler = new SyntaxStyler();',
			...names.map((name) => `syntax_styler.add_lang(${name});`),
			''
		].join('\n');
	},
	bundle_html: (exports, src, lang) =>
		(exports.syntax_styler as SyntaxStyler).stylize(
			src,
			resolve_claimed_langs(ID, LANGS, [lang])[0]![1]
		),
	bundle_html_source: (lang) =>
		`exports.syntax_styler.stylize(src, ${JSON.stringify(resolve_claimed_langs(ID, LANGS, [lang])[0]![1])})`
};
