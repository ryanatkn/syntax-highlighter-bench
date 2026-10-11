<script lang="ts">
	import type { Snippet } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	import type { BenchLibrary } from './results_schema.ts';
	import LibraryLabel from './LibraryLabel.svelte';
	import MatrixCell from './MatrixCell.svelte';
	import {
		matrix_row_entry,
		matrix_row_is_bounded,
		matrix_row_value,
		matrix_rows_max,
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
		summaries = true,
		bars = false,
		collapsible = null,
		fold_unsummarized = false,
		children,
		more
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
		/**
		 * Whether a summary row is set apart from the cells it summarizes. Off where
		 * every row is a figure of its own.
		 */
		summaries?: boolean;
		/**
		 * Whether each number draws a bar beneath it, on one scale across its group,
		 * so a group's rows compare with each other as well as across.
		 */
		bars?: boolean;
		/**
		 * What a group's cell rows are, when a group with summary rows shows only those
		 * until it is opened, or null to show every row.
		 */
		collapsible?: string | null;
		/**
		 * Whether a group with no summary row folds too, down to its header. Off where
		 * such a group is a figure of its own, as a cold start's single scenario is.
		 */
		fold_unsummarized?: boolean;
		/** The caption's lead: what the table shows. */
		children: Snippet;
		/** How to read the table, folded under the lead. */
		more?: Snippet;
	} = $props();

	const library_ids = $derived(libraries.map((library) => library.id));

	// the largest number in each group, which a full bar in it stands for
	const bar_maxes: Record<string, number> = $derived(
		bars
			? Object.fromEntries(
					groups.map((group) => [group.key, matrix_rows_max(group.rows, library_ids)])
				)
			: {}
	);

	// the rows whose details are shown in their cells
	const expanded: SvelteSet<string> = new SvelteSet();

	const toggle = (key: string): void => {
		if (!expanded.delete(key)) expanded.add(key);
	};

	// the folding groups that are open
	const opened: SvelteSet<string> = new SvelteSet();

	const count_cells = (group: MatrixGroup): number =>
		group.rows.filter((row) => row.kind === 'cell').length;

	/**
	 * Whether a group can fold: it has cell rows, and summary rows to show in their
	 * place, or `fold_unsummarized` lets it fold to its header.
	 */
	const can_fold = (group: MatrixGroup): boolean =>
		collapsible !== null &&
		count_cells(group) > 0 &&
		(fold_unsummarized || group.rows.some((row) => row.kind === 'summary'));

	// a lone group that could fold is shown open: folding it would save the reader nothing
	const folding = $derived.by(() => {
		const candidates = groups.filter(can_fold);
		return candidates.length > 1 ? candidates : [];
	});

	const folds = (group: MatrixGroup): boolean => folding.includes(group);

	const all_open = $derived(folding.every((group) => opened.has(group.key)));

	const toggle_all = (): void => {
		if (all_open) opened.clear();
		else for (const group of folding) opened.add(group.key);
	};

	const toggle_group = (key: string): void => {
		if (!opened.delete(key)) opened.add(key);
	};

	/** The summary a cell row sits under in a folding group, which names what it is one of. */
	const to_parent_label = (group: MatrixGroup, index: number): string | null => {
		for (let i = index - 1; i >= 0; i--) {
			const row = group.rows[i]!;
			if (row.kind === 'summary') return row.label;
		}
		return null;
	};

	const to_bar = (group: string, row: MatrixRow, library: string): number | null => {
		const max = Object.hasOwn(bar_maxes, group) ? bar_maxes[group]! : 0;
		return max > 0 ? (matrix_row_value(row, library) ?? 0) / max : null;
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
		<caption>
			<p>{@render children()}</p>
			{#if more}
				<details>
					<summary>How to read this table</summary>
					{@render more()}
				</details>
			{/if}
			{#if folding.length > 0}
				<button type="button" onclick={toggle_all}>
					{all_open ? `hide the ${collapsible}` : `show all ${collapsible}`}
				</button>
			{/if}
		</caption>
		<thead>
			<tr>
				<th scope="col">{heading}</th>
				{#each libraries as library (library.id)}
					<th scope="col" class={['num', { reference: library.id === reference }]}>
						<LibraryLabel {library} />
						{#if library.id === reference}<small class="chip">reference</small>{/if}
					</th>
				{/each}
			</tr>
		</thead>
		{#each groups as group (group.key)}
			{@const group_folds = folds(group)}
			{@const group_open = !group_folds || opened.has(group.key)}
			<tbody>
				<tr class="group">
					<th scope="rowgroup" colspan={libraries.length + 1}>
						<!-- held at the left edge while a wide table scrolls -->
						<span class="group-label">
							{group.label}
							{#if group.note}<small>{group.note}</small>{/if}
							{#if group_folds}
								<button
									type="button"
									class="plain"
									aria-expanded={group_open}
									aria-label="{group_open ? 'hide' : 'show'} the {collapsible} of {group.label}"
									onclick={() => toggle_group(group.key)}
								>
									{group_open ? 'hide' : `show ${count_cells(group)} ${collapsible}`}
								</button>
							{/if}
						</span>
					</th>
				</tr>
				{#each group.rows as row, index (row.key)}
					{#if group_open || row.kind === 'summary'}
						{@const ratios = to_matrix_ratios(row, library_ids, reference)}
						{@const open = expanded.has(row.key)}
						{@const parent =
							group_folds && row.kind === 'cell' ? to_parent_label(group, index) : null}
						<tr
							class={{
								summary: summaries && row.kind === 'summary',
								member: group_folds && row.kind === 'cell'
							}}
						>
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
											: ''} in {group.label}{parent ? `, ${parent}` : ''}"
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
										bar={to_bar(group.key, row, library.id)}
										reference={library.id === reference}
									/>
								{/each}
							{/if}
						</tr>
					{/if}
				{/each}
			</tbody>
		{/each}
	</table>
</div>

<style>
	.group th {
		font-size: var(--font_size_lg);
		font-weight: 700;
		background-color: var(--fg_05);
	}
	.summary :global(:is(th, td)) {
		font-weight: 700;
		border-top: var(--border_width_1) var(--border_style) var(--border_color);
	}
	tbody button {
		font-size: var(--font_size_sm);
		min-height: 0;
		padding: 0 var(--space_xs);
	}
	caption p {
		margin-bottom: var(--space_xs);
	}
	caption details {
		margin-bottom: var(--space_xs);
	}
	caption summary {
		padding: var(--space_xs) var(--space_sm);
		font-size: var(--font_size_sm);
	}
	caption button {
		font-size: var(--font_size_sm);
		min-height: 0;
	}
	/* held to the visible width, as the caption is, so it wraps rather than scroll away */
	.group-label {
		display: inline-block;
		position: sticky;
		left: var(--space_sm);
		max-width: calc(min(100vw, var(--distance_lg)) - 3 * var(--space_lg));
	}
	/* a cell row under its summary is indented, so the summary reads as its heading */
	.member > th {
		padding-left: var(--space_xl);
	}
	thead .reference {
		box-shadow: inset 0 calc(-1 * var(--border_width_4)) 0 var(--accent_50);
	}
</style>
