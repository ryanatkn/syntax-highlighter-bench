<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';
	import Code from '@fuzdev/fuz_code/Code.svelte';

	const tome = tome_get_by_slug('adapters');

	const adapter_contract = `interface HighlighterAdapter<TTokens = unknown> {
	id: string;
	label: string;
	package: string; // its manifest is read for the version
	by_maintainer: boolean;
	note: string | null;
	extra_packages?: ReadonlyArray<string>; // separately versioned packages whose versions are recorded too
	langs: Partial<Record<Lang, string>>; // harness id to library id; absent means unsupported
	via: Partial<Record<Lang, string>>; // a coverage footnote for a claimed language
	output: 'classes' | 'inline_styles';
	engine: 'scanner' | 'grammar_vm' | 'regex' | 'textmate';
	theme_css: ReadonlyArray<string> | null; // the default theme's stylesheets; null when styles are inline
	theme_schemes: ReadonlyArray<'light' | 'dark'>; // the color schemes that theme covers
	wasm?: ReadonlyArray<{import: string; binary: string}>; // the wasm binaries it loads, counted apart from the JavaScript
	setup(langs: ReadonlyArray<Lang>): Promise<void>; // once per process, before any timing
	tokenize(src: string, lang: Lang): TTokens; // timed: the library's own result
	count_tokens(tokens: TTokens): number; // never timed
	html(src: string, lang: Lang): string; // timed: the string consumers ship
	bundle_entry(langs: ReadonlyArray<Lang>): string; // module source importing exactly these languages
	bundle_html(exports: Record<string, any>, src: string, lang: Lang): string; // highlights through a built bundle's exports
}`;
</script>

<TomeContent {tome}>
	<section>
		<p>
			Each library is measured through one adapter, and the adapter is the extension point. The
			contract is in <code>bench/adapter.ts</code>, the adapters are under
			<code>bench/libraries/</code>, and <code>bench/libraries.ts</code> lists them.
		</p>
		<Code lang="ts" content={adapter_contract} />
	</section>
	<TomeSection>
		<TomeSectionHeader text="Rules" />
		<ul>
			<li>
				<strong>Same stage.</strong> <code>tokenize</code> and <code>html</code> are the narrowest
				public entries doing the same work as the other libraries': tokens out, and the HTML string
				a consumer ships.
			</li>
			<li>
				<strong>Explicit languages.</strong> A library is measured only on the languages its adapter
				lists. A call for any other language, or for one that wasn't set up, throws. A library that
				returned escaped plain text for a language it didn't know would benchmark as very fast.
			</li>
			<li>
				<strong>Token counts are recorded, not equalised.</strong> Libraries split the same source
				differently, so each count is the library's own, and counting happens outside the timed
				call.
			</li>
			<li>
				<strong>Synchronous timed paths.</strong> A library with an async API does its loading in
				<code>setup</code> and is timed through its synchronous core.
			</li>
			<li>
				<strong>Browser-safe.</strong> An adapter uses no Node-only API, so it can run in a page
				unchanged. The harness reads versions, stylesheets, and wasm binaries from disk on its
				behalf.
			</li>
		</ul>
		<p>
			<code>bundle_entry</code> and <code>bundle_html</code> serve the bundle sizes of
			<TomeLink slug="deterministic" />: the first writes the module a bundle is built from, and the
			second highlights through that bundle's exports, which is how each bundle is shown to hold its
			languages.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="What each adapter calls" />
		<table>
			<thead>
				<tr>
					<th>library</th>
					<th>tokenize</th>
					<th>html</th>
					<th>one token is</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td>fuz_code</td>
					<td><code>SyntaxStyler#lex</code></td>
					<td><code>SyntaxStyler#stylize</code></td>
					<td>a typed leaf or container</td>
				</tr>
				<tr>
					<td>twinkleplop</td>
					<td>the language package's <code>tokenize()</code></td>
					<td>the language package's <code>language()</code></td>
					<td>a typed token after reclassification</td>
				</tr>
				<tr>
					<td>Prism</td>
					<td><code>Prism.tokenize</code></td>
					<td><code>Prism.highlight</code></td>
					<td>a <code>Token</code> at any depth</td>
				</tr>
				<tr>
					<td>Shiki, both engines</td>
					<td><code>codeToTokensBase</code></td>
					<td><code>codeToHtml</code></td>
					<td>a themed token, whitespace included</td>
				</tr>
			</tbody>
		</table>
		<p>
			Each adapter has a <code>notes.md</code> beside it with the entry points, the import shape,
			how its tokens are counted, and its caveats, written so the library's maintainers can review
			or replace it.
		</p>
		<p>
			One default is changed. Shiki stops tokenizing a line after half a second and returns the rest
			of it as one token, so what a call returns depends on how fast the machine is at that moment:
			a first call on a busy machine can come back with fewer tokens than the next. Both Shiki
			adapters raise that limit out of reach rather than turning it off, so every call does the same
			work, and still reads the clock as Shiki's default does.
		</p>
		<p>What the HTML looks like differs, and the results say so:</p>
		<ul>
			<li>
				fuz_code and Prism return bare <code>&lt;span&gt;</code> elements with classes, and the
				consumer supplies the wrapper
			</li>
			<li>
				twinkleplop returns a <code>&lt;pre&gt;</code> with a span for each line and classes on each
				token
			</li>
			<li>
				Shiki returns a <code>&lt;pre&gt;</code> with a span for each line and an inline color on
				each token, so it needs no stylesheet and its tokenizing includes resolving colors
			</li>
		</ul>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Coverage" />
		<p>
			Every adapter claims the timed languages. <code>xml</code> is claimed by all but twinkleplop,
			which has no XML language. Where support is indirect, the coverage matrix carries a footnote:
		</p>
		<ul>
			<li>fuz_code runs its TypeScript lexer for JavaScript</li>
			<li>
				Prism's Svelte grammar is the third-party <code>prism-svelte</code>, and its XML is its
				markup grammar under another name
			</li>
			<li>Shiki's XML grammar loads the Java grammar it embeds</li>
		</ul>
		<p>
			<code>setup</code> loads exactly the languages it is given, plus what a language embeds
			structurally, like the script and style languages of HTML and Svelte. A timed process sets up
			only the language it measures, so every library has the same languages loaded.
		</p>
		<p>
			That decides how Markdown is measured: without highlighting inside fenced code blocks.
			fuz_code, Prism, and Shiki highlight a fenced block only when its language is loaded, and
			twinkleplop never does, so loading one language puts them on the same footing. Two exceptions
			come from what loads with Markdown itself: Prism's Markdown depends on its markup grammar, so
			Prism still highlights a fence tagged <code>html</code>, <code>xml</code>, <code>svg</code>,
			or <code>markup</code>, and fuz_code and Prism highlight a fence tagged as Markdown.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="The output check" />
		<p>
			Before a library is measured on a language, <code>check_output</code> runs it on the
			language's harness snippet, a few lines written dense in syntax. The library must produce
			tokens, and HTML with several kinds of styled span. A plain-text fallback has none, or only
			structural ones: a wrapper for each line, and in Shiki one span in the default color. A
			library that fails is recorded as excluded with the reason, which the
			<TomeLink slug="results" /> keeps apart from unsupported.
		</p>
		<p>
			Each input is then checked against a lower floor. It is lower because prose-heavy Markdown
			legitimately has few kinds of span, which is why the snippet decides and the floor only
			guards.
		</p>
		<p>
			The tests run both for every adapter on every input of the <TomeLink slug="corpus" /> in every
			language it claims.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Adding a library" />
		<ol>
			<li>Add the library as a devDependency.</li>
			<li>
				Write <code>bench/libraries/&lt;id&gt;/adapter.ts</code>, exporting an adapter, and
				<code>notes.md</code> beside it.
			</li>
			<li>Add the adapter to <code>ADAPTERS</code> in <code>bench/libraries.ts</code>.</li>
		</ol>
		<p>
			The tests then cover it, and a results file carries the roster of libraries, so the site needs
			no change.
		</p>
	</TomeSection>
</TomeContent>
