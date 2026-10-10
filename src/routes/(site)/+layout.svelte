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

	// the root's breadcrumb would link to the page itself, so there the mark leads to the docs
	const at_root = $derived(page.url.pathname === resolve('/'));
</script>

<header class="site-header">
	<Breadcrumb root_path={at_root ? '/results' : undefined} />
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
<section class="box mt_xl9">
	<DocsFooter repo_url={site.repo_url} />
</section>

<style>
	.site-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space_md);
		font-size: var(--font_size_lg);
		/* the size of the mark, which `Breadcrumb` reads, stepped down as the docs header does,
		 * so the mark is one size on every page */
		--font_size: var(--font_size_xl);
		/* aligned with the main column below it */
		max-width: var(--distance_lg);
		margin: 0 auto;
		padding: var(--space_md) var(--space_lg);
	}
	@media (max-width: 800px) {
		.site-header {
			--font_size: var(--font_size_lg);
		}
	}
	@media (max-width: 550px) {
		.site-header {
			--font_size: var(--font_size_md);
		}
	}
	/* one line of its text tall, as it is with a path after the mark: the mark alone is 1em, and
	 * the header would be shorter at the root than on every other page */
	.site-header :global(.breadcrumb) {
		min-height: 1lh;
	}
	/* wide enough for a column per library, and no wider than reads well */
	.site-main {
		max-width: var(--distance_lg);
		margin: 0 auto;
		padding: var(--space_lg);
	}
</style>
