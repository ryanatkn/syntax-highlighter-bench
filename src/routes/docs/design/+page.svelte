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
			This page describes what is designed and not built: the bundle and cold-start measurements,
			the results pages, and a published run. The details may change as they are built. The
			<TomeLink slug="adapters" />, the <TomeLink slug="corpus" />, and the timed harness described
			in <TomeLink slug="method" /> exist.
		</aside>
	</section>
	<TomeSection>
		<TomeSectionHeader text="Bundle size" />
		<p>
			How many bytes a library adds to a page, measured over each feature set of
			<TomeLink slug="languages" />: a build of the module each adapter writes for the set, minified
			and compressed. Two things are reported apart from the JavaScript, because folding them in
			would hide a real difference: the wasm a library loads, and the stylesheet a library with
			class-based output needs for its default theme.
		</p>
		<p>
			Because one set holds no languages and one holds each language alone, the cost of adding a
			language is their difference, with no extra measurement.
		</p>
		<p>
			Bundle size is deterministic, like the token counts and output sizes the timed harness already
			records, so it can be regenerated anywhere and kept current on every change.
		</p>
	</TomeSection>
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
