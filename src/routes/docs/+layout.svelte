<script lang="ts">
	import { resolve } from '$app/paths';
	import Docs from '@fuzdev/fuz_ui/Docs.svelte';
	import { Library, library_context } from '@fuzdev/fuz_ui/library.svelte.ts';

	import { docs_data_context } from '$lib/docs_data.ts';
	import { tomes } from './tomes.ts';
	import { library_json } from '$routes/library.ts';
	import type { LayoutProps } from './$types.js';

	const { children, data }: LayoutProps = $props();

	const library = new Library(library_json);
	library_context.set(() => library);

	// the tomes render their rosters and the inputs table from the results file
	docs_data_context.set(() => data.docs);
</script>

<Docs {tomes}>
	<nav aria-label="Site" class="docs-site-nav">
		<a href={resolve('/results')}>results</a>
	</nav>
	{@render children()}
</Docs>

<style>
	/* a line above each docs page, inside the docs layout's own content column */
	.docs-site-nav {
		margin: 0;
		padding: var(--space_md) var(--space_lg) 0;
		text-align: right;
	}
</style>
