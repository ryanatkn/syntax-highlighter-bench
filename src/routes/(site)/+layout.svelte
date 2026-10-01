<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Breadcrumb from '@fuzdev/fuz_ui/Breadcrumb.svelte';
	import DocsFooter from '@fuzdev/fuz_ui/DocsFooter.svelte';
	import { site_context } from '@fuzdev/fuz_ui/site.svelte.ts';
	import type { Snippet } from 'svelte';

	const {
		children
	}: {
		children: Snippet;
	} = $props();

	const site = site_context.get();
</script>

<header class="site-header">
	<Breadcrumb />
	<nav aria-label="Site" class="row gap_md">
		<a href={resolve('/results')} class={{ selected: page.url.pathname === resolve('/results') }}>
			results
		</a>
		<a href={resolve('/docs')}>docs</a>
		{#if site.repo_url}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={site.repo_url} rel="external">source</a>
		{/if}
	</nav>
</header>
<main class="site-main">
	{@render children()}
</main>
<section class="box">
	<DocsFooter repo_url={site.repo_url} />
</section>

<style>
	.site-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space_md);
		padding: var(--space_md) var(--space_lg);
	}
	/* wide enough for a column per library, and no wider than reads well */
	.site-main {
		max-width: var(--distance_lg);
		margin: 0 auto;
		padding: var(--space_lg);
	}
</style>
