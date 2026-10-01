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
			This page describes what is designed and not built. The details may change as they are built.
			Everything the other pages describe exists: the <TomeLink slug="adapters" />, the
			<TomeLink slug="corpus" />, the timed harness and the cold-start scenarios of
			<TomeLink slug="method" />, the <TomeLink slug="deterministic" />, and the pages that render a
			results file.
		</aside>
	</section>
	<TomeSection>
		<TomeSectionHeader text="A published run" />
		<p>
			Timed numbers will be published from one named machine, calibrated first, with the machine,
			the commands, and the checks a run must pass written beside them. The run is committed as
			<code>results/latest.json</code>, and the site then renders it in place of the deterministic
			results. Until then the harness can be run by anyone, and <TomeLink slug="method" /> says how.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="More views" />
		<p>Each of these is a view over the same results file:</p>
		<ul>
			<li>a page for each library: its version, its adapter's notes, its sizes, and its cells</li>
			<li>
				a page for each language, with every library's rendering of the same sample side by side
			</li>
			<li>
				the change from one published run to the next, for every library, once there are two runs
			</li>
			<li>the throughput cells run in the reader's own browser</li>
		</ul>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="More measurements" />
		<ul>
			<li>
				Markdown with the languages of its fenced blocks loaded, beside the cells that load Markdown
				alone
			</li>
			<li>inputs built to be a worst case, which regex grammars tend to handle very differently</li>
			<li>other runtimes than Node</li>
		</ul>
	</TomeSection>
</TomeContent>
