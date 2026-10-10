<script lang="ts">
	import { resolve } from '$app/paths';
	import Breadcrumb from '@fuzdev/fuz_ui/Breadcrumb.svelte';
	import Docs from '@fuzdev/fuz_ui/Docs.svelte';
	import DocsFooter from '@fuzdev/fuz_ui/DocsFooter.svelte';
	import { Library, library_context } from '@fuzdev/fuz_ui/library.svelte.ts';
	import { site_context } from '@fuzdev/fuz_ui/site.svelte.ts';

	import { docs_data_context } from '$lib/docs_data.ts';
	import { tomes } from './tomes.ts';
	import { library_json } from '$routes/library.ts';
	import type { LayoutProps } from './$types.js';

	const { children, data }: LayoutProps = $props();

	const site = site_context.get();

	const library = new Library(library_json);
	library_context.set(() => library);

	// the tomes render their rosters and the inputs table from the results file
	docs_data_context.set(() => data.docs);
</script>

<Docs {tomes}>
	{#snippet primary_nav()}
		<a href={resolve('/results')}>results</a>
	{/snippet}
	<!-- the default footer, less its link to fuz.dev: this site isn't part of the Fuz stack -->
	{#snippet footer()}
		<DocsFooter repo_url={site.repo_url}>
			<div class="mb_xl5">
				<Breadcrumb />
			</div>
		</DocsFooter>
	{/snippet}
	{@render children()}
</Docs>
