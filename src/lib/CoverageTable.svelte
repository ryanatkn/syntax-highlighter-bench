<script lang="ts">
	import type { BenchResults } from './results_schema.ts';
	import { to_coverage_matrix } from './coverage_matrix.ts';
	import LibraryLabel from './LibraryLabel.svelte';

	const {
		results
	}: {
		results: Pick<BenchResults, 'meta' | 'langs' | 'coverage'>;
	} = $props();

	const matrix = $derived(to_coverage_matrix(results));
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="table-scroll" tabindex="0" role="region" aria-label="Coverage: languages by library">
	<table>
		<caption>
			Which languages each library is measured on. They are fuz_code's built-in set, so the list
			favors it: a language fuz_code doesn't have is never measured. Prism and Shiki each support
			hundreds of languages, and none of that shows here.
		</caption>
		<thead>
			<tr>
				<th scope="col">language</th>
				{#each results.meta.libraries as library (library.id)}
					<th scope="col"><LibraryLabel {library} /></th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each matrix.rows as row (row.lang.id)}
				<tr>
					<th scope="row">
						{row.lang.label} <small><code>{row.lang.id}</code></small>
						{#if !row.lang.timed}<small>not timed</small>{/if}
					</th>
					{#each results.meta.libraries as library (library.id)}
						{@const cell = row.cells[library.id]!}
						<td>
							{#if cell.kind === 'unsupported'}
								<span class="text_70">— <small>unsupported</small></span>
							{:else}
								yes{#if cell.kind === 'via'}
									<sup><a href="#coverage-note-{cell.footnote + 1}">{cell.footnote + 1}</a></sup>
								{/if}
							{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
{#if matrix.footnotes.length > 0}
	<ol>
		{#each matrix.footnotes as footnote, i (footnote)}
			<li id="coverage-note-{i + 1}"><small>{footnote}</small></li>
		{/each}
	</ol>
{/if}
