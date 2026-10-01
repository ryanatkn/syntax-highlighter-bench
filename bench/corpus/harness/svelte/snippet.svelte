<script lang="ts">
	interface Props {
		items: Array<string>;
		limit?: number;
	}

	const { items, limit = 5 }: Props = $props();

	let query = $state('');
	const matches = $derived(items.filter((item) => item.includes(query)).slice(0, limit));
</script>

<input bind:value={query} placeholder="Filter" />

{#if matches.length}
	<ul>
		{#each matches as item (item)}
			<li class:exact={item === query}>{item}</li>
		{/each}
	</ul>
{:else}
	<p>No matches for <em>{query}</em>.</p>
{/if}

<style>
	.exact {
		font-weight: bold;
	}
</style>
