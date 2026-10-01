/**
 * The Prism adapter. See `notes.md` beside it for the entry points and why.
 *
 * @module
 */

import type { Grammar, Token, TokenStream } from 'prismjs';

import {
	create_lang_map,
	resolve_claimed_langs,
	LangNotSetUpError,
	type HighlighterAdapter
} from '../../adapter.ts';
import type { Lang } from '../../langs.ts';

const ID = 'prism';

const CORE_MODULE = 'prismjs/components/prism-core.js';

/**
 * Each grammar component in the order Prism's own dependency data loads them: a
 * component registers itself on the global `Prism` when it is imported, and
 * reads the grammars it extends from there. `module` and `load` name the same
 * file, once as text for `bundle_entry` and once as an import a bundler can see.
 */
const COMPONENTS = {
	markup: {
		module: 'prismjs/components/prism-markup.js',
		load: () => import('prismjs/components/prism-markup.js')
	},
	css: {
		module: 'prismjs/components/prism-css.js',
		load: () => import('prismjs/components/prism-css.js')
	},
	clike: {
		module: 'prismjs/components/prism-clike.js',
		load: () => import('prismjs/components/prism-clike.js')
	},
	javascript: {
		module: 'prismjs/components/prism-javascript.js',
		load: () => import('prismjs/components/prism-javascript.js')
	},
	typescript: {
		module: 'prismjs/components/prism-typescript.js',
		load: () => import('prismjs/components/prism-typescript.js')
	},
	json: {
		module: 'prismjs/components/prism-json.js',
		load: () => import('prismjs/components/prism-json.js')
	},
	markdown: {
		module: 'prismjs/components/prism-markdown.js',
		load: () => import('prismjs/components/prism-markdown.js')
	},
	bash: {
		module: 'prismjs/components/prism-bash.js',
		load: () => import('prismjs/components/prism-bash.js')
	},
	rust: {
		module: 'prismjs/components/prism-rust.js',
		load: () => import('prismjs/components/prism-rust.js')
	},
	svelte: { module: 'prism-svelte', load: () => import('prism-svelte') }
} as const satisfies Record<string, { module: string; load: () => Promise<unknown> }>;

type ComponentName = keyof typeof COMPONENTS;

const LANGS = {
	ts: 'typescript',
	js: 'javascript',
	css: 'css',
	html: 'markup',
	xml: 'xml',
	json: 'json',
	svelte: 'svelte',
	md: 'markdown',
	bash: 'bash',
	rust: 'rust'
} as const satisfies Partial<Record<Lang, string>>;

/**
 * The components a language needs: the ones Prism's dependency data requires,
 * plus the ones the language embeds structurally. CSS and JavaScript add
 * `<style>` and `<script>` highlighting to markup only when they are loaded.
 */
const REQUIRED: Record<keyof typeof LANGS, ReadonlyArray<ComponentName>> = {
	ts: ['clike', 'javascript', 'typescript'],
	js: ['clike', 'javascript'],
	css: ['css'],
	html: ['markup', 'css', 'clike', 'javascript'],
	xml: ['markup'],
	json: ['json'],
	svelte: ['markup', 'css', 'clike', 'javascript', 'svelte'],
	md: ['markup', 'markdown'],
	bash: ['bash'],
	rust: ['rust']
};

/** The components `langs` need, each once, in load order. */
const to_component_names = (langs: ReadonlyArray<Lang>): Array<ComponentName> => {
	const needed: Set<ComponentName> = new Set();
	for (const [lang] of resolve_claimed_langs(ID, LANGS, langs)) {
		for (const name of REQUIRED[lang]) needed.add(name);
	}
	return (Object.keys(COMPONENTS) as Array<ComponentName>).filter((name) => needed.has(name));
};

type PrismApi = typeof import('prismjs');

let prism: PrismApi | null = null;
/** The grammar and the library's id for each language `setup` was given. */
let ready = create_lang_map<{ grammar: Grammar; id: string }>();

const count_stream = (stream: TokenStream): number => {
	if (typeof stream === 'string') return 0;
	if (Array.isArray(stream)) {
		let count = 0;
		for (const item of stream) count += count_stream(item);
		return count;
	}
	return 1 + count_stream(stream.content);
};

export const prism_adapter: HighlighterAdapter<Array<string | Token>> = {
	id: ID,
	label: 'Prism',
	package: 'prismjs',
	by_maintainer: false,
	note: 'The core plus one component file per grammar, without the autoloader or any plugin.',
	extra_packages: ['prism-svelte'],
	langs: LANGS,
	via: {
		svelte: 'the third-party prism-svelte grammar',
		xml: 'the markup grammar, which Prism also registers as xml'
	},
	output: 'classes',
	engine: 'regex',
	theme_css: ['prismjs/themes/prism.css'],
	theme_schemes: ['light'],
	setup: async (langs) => {
		const claimed = resolve_claimed_langs(ID, LANGS, langs);
		const loaded = (await import('prismjs/components/prism-core.js')).default;
		for (const name of to_component_names(langs)) await COMPONENTS[name].load();
		const next: typeof ready = create_lang_map();
		for (const [lang, id] of claimed) {
			const grammar = loaded.languages[id];
			// a missing grammar would otherwise reach Prism as `undefined`
			if (grammar === undefined) throw new Error(`${ID} registered no grammar "${id}"`);
			next[lang] = { grammar, id };
		}
		prism = loaded;
		ready = next;
	},
	tokenize: (src, lang) => {
		const entry = ready[lang];
		if (entry === undefined) throw new LangNotSetUpError(ID, lang);
		return prism!.tokenize(src, entry.grammar);
	},
	count_tokens: count_stream,
	html: (src, lang) => {
		const entry = ready[lang];
		if (entry === undefined) throw new LangNotSetUpError(ID, lang);
		return prism!.highlight(src, entry.grammar, entry.id);
	},
	bundle_entry: (langs) =>
		[
			`import Prism from '${CORE_MODULE}';`,
			...to_component_names(langs).map((name) => `import '${COMPONENTS[name].module}';`),
			'',
			'export default Prism;',
			''
		].join('\n'),
	bundle_html: (exports, src, lang) => {
		const bundled = exports.default as PrismApi;
		const [[, id]] = resolve_claimed_langs(ID, LANGS, [lang]) as [[Lang, string]];
		const grammar = bundled.languages[id];
		if (grammar === undefined) throw new Error(`the ${ID} bundle registered no grammar "${id}"`);
		return bundled.highlight(src, grammar, id);
	}
};
