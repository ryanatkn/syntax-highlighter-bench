<script lang="ts">
	import type { Snippet } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	import type { BenchLibrary } from './results_schema.ts';
	import LibraryLabel from './LibraryLabel.svelte';
	import MatrixCell from './MatrixCell.svelte';
	import {
		matrix_row_entry,
		matrix_row_is_bounded,
		to_matrix_ratios,
		type MatrixGroup,
		type MatrixRow
	} from './matrix.ts';

	const {
		libraries,
		groups,
		heading,
		label,
		reference = null,
		colored = true,
		children
	}: {
		/** The libraries shown, in column order. */
		libraries: ReadonlyArray<BenchLibrary>;
		groups: ReadonlyArray<MatrixGroup>;
		/** The heading of the first column: what a row is. */
		heading: string;
		/** The accessible name of the table's scrolling region. */
		label: string;
		/** The library every ratio is taken against, or null for the best in each row. */
		reference?: string | null;
		/** Whether ratios tint their cells. */
		colored?: boolean;
		/** The caption. */
		children: Snippet;
	} = $props();

	const library_ids = $derived(libraries.map((library) => library.id));

	// the rows whose details are shown in their cells
	const expanded: SvelteSet<string> = new SvelteSet();

	const toggle = (key: string): void => {
		if (!expanded.delete(key)) expanded.add(key);
	};

	const has_details = (row: MatrixRow): boolean =>
		library_ids.some((id) => {
			const entry = matrix_row_entry(row, id);
			return (
				entry.kind === 'excluded' ||
				(entry.kind === 'value' && entry.details.length + entry.badges.length > 0)
			);
		});
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="table-scroll" tabindex="0" role="region" aria-label={label}>
	<table>
		<caption>{@render children()}</caption>
		<thead>
			<tr>
				<th scope="col">{heading}</th>
				{#each libraries as library (library.id)}
					<th scope="col" class="num"><LibraryLabel {library} /></th>
				{/each}
			</tr>
		</thead>
		{#each groups as group (group.key)}
			<tbody>
				<tr class="group">
					<th scope="rowgroup" colspan={libraries.length + 1}>
						{group.label}
						{#if group.note}<small>{group.note}</small>{/if}
					</th>
				</tr>
				{#each group.rows as row (row.key)}
					{@const ratios = to_matrix_ratios(row, library_ids, reference)}
					{@const open = expanded.has(row.key)}
					<tr class={{ summary: row.kind === 'summary' }}>
						<th scope="row">
							{row.label}
							{#if row.note}<small>{row.note}</small>{/if}
							{#if has_details(row)}
								<button
									type="button"
									class="plain"
									aria-expanded={open}
									aria-label="{open ? 'hide' : 'show'} the details of {row.label}{row.note
										? `, ${row.note}`
										: ''} in {group.label}"
									onclick={() => toggle(row.key)}
								>
									{open ? 'hide' : 'details'}
								</button>
							{/if}
						</th>
						{#if row.empty !== null}
							<td colspan={libraries.length}>{row.empty}</td>
						{:else}
							{#each libraries as library (library.id)}
								<MatrixCell
									entry={matrix_row_entry(row, library.id)}
									unit={row.unit}
									ratio={ratios[library.id]}
									floor={row.floor}
									bound={matrix_row_is_bounded(row, library_ids, reference)}
									{colored}
									{open}
								/>
							{/each}
						{/if}
					</tr>
				{/each}
			</tbody>
		{/each}
	</table>
</div>

<style>
	.group th {
		font-weight: 700;
		background-color: var(--fg_05);
	}
	.summary :global(:is(th, td)) {
		font-weight: 700;
		border-top: var(--border_width_1) var(--border_style) var(--border_color);
	}
	button {
		font-size: var(--font_size_sm);
		min-height: 0;
		padding: 0 var(--space_xs);
	}
</style>
