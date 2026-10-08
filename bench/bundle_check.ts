/**
 * Proves a built bundle holds what its size is reported for: imports it in a
 * process of its own and highlights each of its languages' harness snippets
 * through its exports. `bench/sizes.ts` runs it once per bundle:
 *
 * ```bash
 * node bench/bundle_check.ts '<BundleCheckSpec as JSON>'
 * ```
 *
 * It prints one `BundleCheckResult` as JSON, and fails when the bundle doesn't
 * import, exports nothing, or highlights a snippet with fewer kinds of span
 * than the snippet gate asks for. A bundle whose languages were shaken out
 * would otherwise be reported as small.
 *
 * A bundle of one language must do more: its HTML for the snippet has to equal
 * what the library produces through its adapter with that language set up. The
 * floor alone can't see a language that lost what it embeds, like HTML without
 * its script and style languages, and such a bundle is much smaller. A bundle of
 * several languages keeps the floor only, since there a Markdown fence is
 * highlighted that a process with one language loaded leaves plain.
 *
 * A process per bundle, because a bundle may register itself globally: Prism's
 * components read the global `Prism` its core sets.
 *
 * Node-only.
 *
 * @module
 */

import { pathToFileURL } from 'node:url';
import { z } from 'zod';

import { load_adapter } from './cell.ts';
import { analyze_html, MIN_SNIPPET_SPAN_KINDS } from './check_output.ts';
import { load_corpus_manifest, read_corpus_input } from './corpus.ts';
import { is_lang } from './langs.ts';

/** A bundle to check: the file, the library it is of, and the languages it should hold. */
export const BundleCheckSpec = z.strictObject({
	library: z.string().regex(/^[a-z][a-z0-9_]*$/),
	langs: z.array(z.string().min(1)),
	path: z.string().min(1).meta({ description: 'The built bundle, as an absolute path.' })
});
export type BundleCheckSpec = z.infer<typeof BundleCheckSpec>;

/** What a bundle was seen to hold. */
export const BundleCheckResult = z.strictObject({
	library: z.string().min(1),
	exports: z.array(z.string()).min(1).meta({ description: 'The names the bundle exports.' }),
	span_kinds: z.record(z.string(), z.number().int().positive()).meta({
		description: "How many kinds of span each language's snippet was highlighted with."
	})
});
export type BundleCheckResult = z.infer<typeof BundleCheckResult>;

/**
 * Evaluates what an adapter's `bundle_html_source` returns, the way a cold-start
 * process runs it: as an expression over the names `exports` and `src`.
 *
 * @param source - the expression
 * @param exports - the namespace of a module built from the adapter's `bundle_entry`
 * @param src - the source to highlight
 * @returns what the expression evaluates to, which should be the HTML
 */
export const evaluate_bundle_html_source = (
	source: string,
	exports: Record<string, unknown>,
	src: string
): unknown =>
	// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
	new Function('exports', 'src', `return (${source});`)(exports, src);

/**
 * Imports a bundle and highlights with it.
 *
 * @throws if the bundle exports nothing, the adapter's `bundle_html_source`
 * returns other HTML than its `bundle_html`, a language's snippet comes out with
 * fewer kinds of span than `MIN_SNIPPET_SPAN_KINDS`, or a bundle of one language
 * renders its snippet differently from the adapter with that language set up
 */
export const check_bundle = async (spec: BundleCheckSpec): Promise<BundleCheckResult> => {
	const adapter = await load_adapter(spec.library);
	const exports: Record<string, unknown> = await import(pathToFileURL(spec.path).href);
	const names = Object.keys(exports);
	if (names.length === 0) throw new Error(`the bundle ${spec.path} exports nothing`);
	const { inputs } = load_corpus_manifest();
	const span_kinds: Record<string, number> = {};
	for (const lang of spec.langs) {
		if (!is_lang(lang)) throw new Error(`unknown lang "${lang}"`);
		const snippet = inputs.find((input) => input.source === 'harness' && input.lang === lang);
		if (!snippet) throw new Error(`lang "${lang}" has no harness snippet to check a bundle on`);
		const src = read_corpus_input(snippet);
		const html = adapter.bundle_html(exports, src, lang);
		if (evaluate_bundle_html_source(adapter.bundle_html_source(lang), exports, src) !== html) {
			throw new Error(
				`${adapter.id}'s bundle_html_source for ${lang} doesn't make the call its bundle_html makes: the two return different HTML for the snippet`
			);
		}
		const kinds = typeof html === 'string' ? analyze_html(html).span_kinds : 0;
		if (kinds < MIN_SNIPPET_SPAN_KINDS) {
			throw new Error(
				`the bundle ${spec.path} highlights the ${lang} snippet with ${kinds} kinds of span, under the ${MIN_SNIPPET_SPAN_KINDS} that highlighting produces: the language is not in the bundle`
			);
		}
		span_kinds[lang] = kinds;
	}
	// after every bundle call: setting the adapter up may load the library a second time
	if (spec.langs.length === 1) {
		const lang = spec.langs[0]!;
		if (!is_lang(lang)) throw new Error(`unknown lang "${lang}"`);
		const src = read_corpus_input(
			inputs.find((input) => input.source === 'harness' && input.lang === lang)!
		);
		const bundled = adapter.bundle_html(exports, src, lang);
		await adapter.setup([lang]);
		if (bundled !== adapter.html(src, lang)) {
			throw new Error(
				`the bundle ${spec.path} renders the ${lang} snippet differently from ${adapter.id} with ${lang} set up: the bundle lacks something the language needs, like a language it embeds`
			);
		}
	}
	return { library: adapter.id, exports: names, span_kinds };
};

if (import.meta.main) {
	const spec = BundleCheckSpec.parse(JSON.parse(process.argv[2] ?? 'null'));
	const result = await check_bundle(spec);
	// exits once the line is written, so a handle the library leaves open can't keep the process
	// alive; the callback waits for the write, which is asynchronous to a pipe
	process.stdout.write(JSON.stringify(result) + '\n', (error) => process.exit(error ? 1 : 0));
}
