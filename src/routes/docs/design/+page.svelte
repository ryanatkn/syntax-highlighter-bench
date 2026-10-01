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
			This page describes what is designed and not built: the cold-start measurement, the results
			pages, and a published timed run. The details may change as they are built. The
			<TomeLink slug="adapters" />, the <TomeLink slug="corpus" />, the timed harness described in
			<TomeLink slug="method" />, and the <TomeLink slug="deterministic" /> exist.
		</aside>
	</section>
	<TomeSection>
		<TomeSectionHeader text="Cold start" />
		<p>
			What a first highlight costs: the time from a bare process through importing a library,
			loading a language, and highlighting a short snippet, with each sample in a fresh process. The
			timed harness measures only warm libraries, so this is the other half of a library's speed,
			and the half a short-lived process or a first page load feels.
		</p>
		<p>
			What a library adds to a process's memory belongs here too: the timed harness records each
			process's peak size, which includes Node itself, and a cold-start process has a bare baseline
			to subtract.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Results pages" />
		<p>
			The site will render a results file as a matrix: cells as rows, libraries as columns, each
			value beside its ratio to the best, with filters for the libraries, languages, sizes, sources,
			and modes, so a reader compares the subset they care about. A summary is a geometric mean over
			only the cells every selected library was measured in, and differences inside the machine's
			noise floor are shown as such.
		</p>
		<p>
			For bundle size the pages will show what each language adds to a library, derived from the
			measured sets as <TomeLink slug="deterministic" /> describes, beside the sets' totals.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="A published run" />
		<p>
			Timed numbers will be published from one named machine, calibrated first, with the machine,
			the commands, and the checks a run must pass written beside them. Until then the harness can
			be run by anyone, and <TomeLink slug="method" /> says how.
		</p>
	</TomeSection>
</TomeContent>
