/**
 * The pre-measurement output check: before a library is measured on a language,
 * its output is checked for being real highlighting. A library that returned
 * escaped plain text for a language it didn't know would benchmark as very fast,
 * so a failure here is recorded as excluded rather than measured.
 *
 * Browser-safe, like the adapters it drives.
 *
 * @module
 */

import type { Result } from '@fuzdev/fuz_util/result.js';

import type { BenchCellOutput } from '../src/lib/results_schema.ts';
import { LangNotSetUpError, type HighlighterAdapter } from './adapter.ts';
import type { Lang } from './langs.ts';

/**
 * How many differently-styled spans the HTML of any input must have. A
 * plain-text fallback produces none, or only structural kinds: a per-line
 * wrapper, plus one default-color span in Shiki. Prose-heavy Markdown
 * legitimately produces as few as two, so this floor alone cannot tell them
 * apart; the snippet floor does.
 */
export const MIN_SPAN_KINDS = 2;

/**
 * How many differently-styled spans the HTML of a language's harness snippet
 * must have. The snippets are written dense in syntax, so real highlighting
 * clears this easily and a fallback that keeps its structural spans does not.
 * It is the gate for a library on a language: checked once on the snippet, with
 * only that language set up, before the per-input floor applies. Shiki's JSON
 * reaches exactly this with `github-light`, so a theme change may need the gate
 * revisited.
 */
export const MIN_SNIPPET_SPAN_KINDS = 4;

/** What `analyze_html` finds in an HTML string. */
export interface HtmlStats {
	/** The UTF-8 size of the string. */
	html_bytes: number;
	/** How many elements it has. */
	elements: number;
	/** How many distinct sets of attributes its `<span>` elements carry. */
	span_kinds: number;
}

const OPENING_TAG_MATCHER = /<([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;

/**
 * Measures highlighted HTML without parsing it: every library escapes `<` in
 * text, so each `<name ...>` is an element.
 */
export const analyze_html = (html: string): HtmlStats => {
	let elements = 0;
	const span_kinds: Set<string> = new Set();
	for (const match of html.matchAll(OPENING_TAG_MATCHER)) {
		elements++;
		const attributes = match[2]!.trim();
		if (match[1] === 'span' && attributes !== '') span_kinds.add(attributes);
	}
	return {
		html_bytes: new TextEncoder().encode(html).length,
		elements,
		span_kinds: span_kinds.size
	};
};

/** The deterministic numbers of one library on one input. */
export interface OutputCheckValue {
	/** The library's own token count. */
	tokens: number;
	/** The size of its HTML, in the shape a results cell carries. */
	output: BenchCellOutput;
}

/** A passed check with its numbers, or the reason the library is excluded. */
export type OutputCheckResult = Result<OutputCheckValue, { reason: string }>;

const to_message = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * Checks one library's output on one input. `setup` must already have loaded
 * the language.
 *
 * A harness runs it twice for a library and a language: on the language's
 * harness snippet with `MIN_SNIPPET_SPAN_KINDS`, which decides whether the
 * library is measured on the language at all, then on each input with the
 * default floor.
 *
 * @param adapter - the library
 * @param lang - a language the adapter claims
 * @param src - a non-trivial input in that language
 * @param min_span_kinds - how many kinds of span the HTML must have
 * @returns the token count and HTML size, or a reason usable as an excluded entry
 * @throws if the adapter doesn't claim the language, which is unsupported, not
 * excluded, or if the language isn't set up, which is the caller's mistake
 */
export const check_output = (
	adapter: HighlighterAdapter,
	lang: Lang,
	src: string,
	min_span_kinds: number = MIN_SPAN_KINDS
): OutputCheckResult => {
	if (!Object.hasOwn(adapter.langs, lang)) {
		throw new Error(`${adapter.id} doesn't claim lang "${lang}", so there is nothing to check`);
	}

	let tokens: number;
	try {
		tokens = adapter.count_tokens(adapter.tokenize(src, lang));
	} catch (error) {
		if (error instanceof LangNotSetUpError) throw error;
		return { ok: false, reason: `tokenize threw: ${to_message(error)}` };
	}
	if (!Number.isInteger(tokens) || tokens <= 0) {
		return { ok: false, reason: `produced no tokens (counted ${tokens})` };
	}

	let html: unknown;
	try {
		html = adapter.html(src, lang);
	} catch (error) {
		if (error instanceof LangNotSetUpError) throw error;
		return { ok: false, reason: `html threw: ${to_message(error)}` };
	}
	if (typeof html !== 'string' || html.length === 0) {
		return { ok: false, reason: 'produced no HTML' };
	}
	const { html_bytes, elements, span_kinds } = analyze_html(html);
	if (span_kinds < min_span_kinds) {
		return {
			ok: false,
			reason: `the HTML has ${span_kinds} kinds of span, under the ${min_span_kinds} that highlighting produces: a plain-text fallback`
		};
	}

	return { ok: true, tokens, output: { html_bytes, spans: elements } };
};

/**
 * The snippet gate: checks a library on a language's harness snippet against
 * `MIN_SNIPPET_SPAN_KINDS`. It decides whether the library is measured on the
 * language at all, so every pass of the harness runs it before the per-input
 * floor: a timed cell's process, and the deterministic pass.
 *
 * @param adapter - the library, with the language set up
 * @param lang - a language the adapter claims
 * @param snippet_src - the language's harness snippet
 * @returns the snippet's numbers, or a reason that names the snippet
 * @throws as `check_output` does
 */
export const check_snippet = (
	adapter: HighlighterAdapter,
	lang: Lang,
	snippet_src: string
): OutputCheckResult => {
	const gate = check_output(adapter, lang, snippet_src, MIN_SNIPPET_SPAN_KINDS);
	return gate.ok
		? gate
		: { ok: false, reason: `failed the check on the ${lang} snippet: ${gate.reason}` };
};
