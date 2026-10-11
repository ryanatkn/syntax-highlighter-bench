<script lang="ts">
	import { format_ratio } from './bench_format.ts';
	import { to_bar_chart } from './bar_chart.ts';
	import { to_library_color } from './library_labels.ts';
	import LibraryLabel from './LibraryLabel.svelte';
	import type { MatrixRow } from './matrix.ts';
	import { to_ratio_display_color } from './ratio.ts';
	import type { BenchLibrary } from './results_schema.ts';

	const {
		libraries,
		row,
		title,
		note = null,
		details = false
	}: {
		/** The libraries shown, in bar order. */
		libraries: ReadonlyArray<BenchLibrary>;
		row: MatrixRow;
		/** What the chart measures, as a heading. */
		title: string;
		/** Under the bars, after which direction is better: the unit and what was measured. */
		note?: string | null;
		/** Whether each bar shows its number's details beneath it. */
		details?: boolean;
	} = $props();

	// the library the ratios are taken against while the pointer is over its bar,
	// otherwise the best in the row, as in the tables
	let hovered: string | null = $state(null);

	const library_ids = $derived(libraries.map((library) => library.id));
	const items = $derived(to_bar_chart(row, library_ids, hovered));
</script>

<figure class="bar-chart">
	<figcaption>
		<strong>{title}</strong>
	</figcaption>
	{#if row.empty !== null}
		<p><small>{row.empty}</small></p>
	{:else}
		<!-- a table to assistive tech: each row is one library, its cells the name, the
			number, and the ratio; the bar only repeats the number, so it is hidden. Hovering
			a bar re-baselines the ratios on it, a pointer affordance over numbers that are
			all shown regardless -->
		<div
			class="bars"
			role="table"
			aria-label={title}
			onpointerover={(event) => {
				// one delegated listener: the bar under the pointer names its library, and one
				// without a ratio names none, so the baseline stays where it was
				const target = (event.target as Element).closest<HTMLElement>('[data-library]');
				if (target) hovered = target.dataset.library!;
			}}
			onpointerleave={() => (hovered = null)}
		>
			{#each items as item, i (item.library)}
				{@const library = libraries[i]!}
				<div
					class={['bar-row', { anchor: item.anchor, missing: !item.has_value }]}
					role="row"
					data-library={item.ratio === undefined ? undefined : item.library}
				>
					<span class="bar-label" role="rowheader"><LibraryLabel {library} /></span>
					<div class="bar-track" aria-hidden="true">
						{#if item.fraction > 0}
							<div
								class="bar-fill"
								style:width="{item.fraction * 100}%"
								style:background={to_library_color(i)}
							></div>
						{/if}
					</div>
					<span class="bar-value" role="cell">{item.text}</span>
					<span
						class="bar-ratio"
						role="cell"
						style:color={item.ratio === undefined
							? undefined
							: to_ratio_display_color(item.ratio, item.bound)}
					>
						{#if item.ratio !== undefined}
							{item.within_floor ? '≈' : item.bound ? '≥' : ''}{format_ratio(item.ratio)}
						{/if}
					</span>
					{#if details && item.details.length > 0}
						<small class="bar-details" role="cell">{item.details.join(' · ')}</small>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
	<p class="bar-notes">
		<small>{`${row.direction} is better${note ? ` — ${note}` : ''}`}</small>
		{#if row.note}<small>{row.note}</small>{/if}
	</p>
</figure>

<style>
	.bar-chart {
		margin: 0 0 var(--space_xl4) 0;
	}
	figcaption {
		margin-bottom: var(--space_xs);
	}
	.bar-notes {
		margin: var(--space_xs) 0 0 0;
	}
	.bar-notes small {
		display: block;
	}
	/* the chart is the grid and its rows are subgrids, so the columns size to their
	 * content; the ratio column is held at a fixed width so re-baselining shifts nothing */
	.bars {
		container: bar-chart / inline-size;
		display: grid;
		grid-template-columns:
			[label] max-content [track] minmax(0, 1fr) [value] max-content
			[ratio] 7ch;
		column-gap: var(--space_md);
	}
	.bar-row {
		display: grid;
		grid-template-columns: subgrid;
		grid-column: 1 / -1;
		align-items: center;
		padding: var(--space_xs) var(--space_xs) var(--space_xs) var(--space_md);
	}
	.bar-row.missing {
		opacity: 0.6;
	}
	.bar-row.anchor {
		background-color: var(--fg_05);
		box-shadow: inset var(--border_width_3) 0 0 var(--fg_50);
	}
	.bar-label,
	.bar-value,
	.bar-ratio {
		white-space: nowrap;
	}
	.bar-label {
		grid-column: label;
	}
	.bar-track {
		grid-column: track;
		height: 1.2rem;
		border-radius: var(--border_radius_xs);
		background: var(--fg_05);
	}
	.bar-fill {
		height: 100%;
		min-width: 2px;
		border-radius: var(--border_radius_xs);
	}
	.bar-value {
		grid-column: value;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.bar-ratio {
		grid-column: ratio;
		text-align: right;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.bar-details {
		grid-column: track / -1;
	}
	/* too narrow for a bar beside its label: the label takes a line of its own */
	@container bar-chart (max-width: 32rem) {
		.bar-label {
			grid-column: 1 / -1;
		}
	}
</style>
