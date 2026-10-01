<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';
	import Code from '@fuzdev/fuz_code/Code.svelte';

	const tome = tome_get_by_slug('design');

	const adapter_contract = `interface HighlighterAdapter {
	id: string;
	label: string;
	package: string; // its manifest is read for the version
	langs: Partial<Record<Lang, string>>; // harness id to library id; absent means unsupported
	output: 'classes' | 'inline_styles';
	engine: 'scanner' | 'grammar_vm' | 'regex' | 'textmate';
	theme_css: string | null; // the default theme stylesheet; null when styles are inline
	setup(langs: Array<Lang>): Promise<void>; // once per process, before any timing
	tokenize(src: string, lang: Lang): number; // returns the token count
	html(src: string, lang: Lang): string; // the string consumers ship
	bundle_entry(langs: Array<Lang>): string; // module source importing exactly these languages
}`;
</script>

<TomeContent {tome}>
	<section>
		<aside>
			This page describes the design. None of it is built yet, and the details may change as it is.
		</aside>
	</section>
	<TomeSection>
		<TomeSectionHeader text="The adapter contract" />
		<p>
			Each library is measured through one adapter, and the adapter is the extension point: adding a
			library means adding an adapter and its dependency.
		</p>
		<Code lang="ts" content={adapter_contract} />
		<p>The rules an adapter follows:</p>
		<ul>
			<li>expose the narrowest entry point that does the same stage of work as the others</li>
			<li>declare languages explicitly, and never let the library fall back to plain text</li>
			<li>
				report token counts rather than trying to equalise them, since libraries split the same
				source differently
			</li>
			<li>
				time synchronous paths only; a library with an async API preloads and calls its synchronous
				core
			</li>
			<li>stay browser-safe, with no Node-only APIs</li>
		</ul>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Metrics" />
		<p>Machine-dependent, published only from one named machine:</p>
		<ul>
			<li>throughput for each language, input size, and mode</li>
			<li>cold start, from a bare import through to the first highlight</li>
			<li>memory around the timed loop</li>
		</ul>
		<p>Deterministic, the same anywhere:</p>
		<ul>
			<li>
				bundle size for each feature set, minified and compressed, with wasm and theme CSS reported
				separately
			</li>
			<li>output size and element count</li>
			<li>token counts</li>
			<li>the coverage matrix</li>
		</ul>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Inputs" />
		<p>
			Every input is labelled by its source: real code from pinned upstream projects that no
			measured library authored, Shiki's own benchmark samples, and each library's own samples,
			marked as home turf. Inputs are grouped into size tiers by real file size, and an input built
			by repetition is marked synthetic.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Method" />
		<p>
			The timing method follows the comparison harness of
			<a href="https://github.com/pngwn/twinkleplop">twinkleplop</a> (MIT):
		</p>
		<ul>
			<li>each cell runs in a process of its own</li>
			<li>libraries alternate within a round, and the starting library rotates</li>
			<li>iteration counts are calibrated for each library, since speeds differ widely</li>
			<li>garbage is collected and each library rewarmed before a round</li>
			<li>
				a reference workload runs at the start and end, and its drift says whether the machine
				changed state during the run
			</li>
			<li>
				before measuring, every adapter's output is checked for every language it claims, and a
				failure is recorded as excluded rather than measured
			</li>
			<li>
				a machine is calibrated before its numbers are trusted, by measuring one adapter as two
				libraries; the deviation is its noise floor
			</li>
		</ul>
	</TomeSection>
</TomeContent>
