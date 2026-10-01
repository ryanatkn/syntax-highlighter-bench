<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';

	const tome = tome_get_by_slug('design');
</script>

<TomeContent {tome}>
	<section>
		<aside>
			This page describes what is designed and not built: the timed harness, the bundle and
			cold-start measurements, and the results pages. The details may change as they are built. The
			<TomeLink slug="adapters" /> and the <TomeLink slug="corpus" /> exist.
		</aside>
	</section>
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
		<TomeSectionHeader text="Cells" />
		<p>
			A cell is one input of the <TomeLink slug="corpus" /> measured in one mode,
			<code>tokenize</code> or <code>html</code>, across the libraries that claim its language. A
			cell carries its input's source and size tier, so a reader can compare on the neutral inputs
			alone, or see whether a result holds on a library's home turf.
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
				before measuring, every adapter's output is checked for every language it claims, with the
				check described in <TomeLink slug="adapters" />, and a failure is recorded as excluded
				rather than measured
			</li>
			<li>
				a machine is calibrated before its numbers are trusted, by measuring one adapter as two
				libraries; the deviation is its noise floor
			</li>
		</ul>
	</TomeSection>
</TomeContent>
