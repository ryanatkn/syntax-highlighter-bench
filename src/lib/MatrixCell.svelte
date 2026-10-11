<script lang="ts">
	import { format_ratio } from './bench_format.ts';
	import { format_matrix_value, type MatrixEntry, type MatrixUnit } from './matrix.ts';
	import { ratio_is_within_floor, to_ratio_display_color } from './ratio.ts';

	const {
		entry,
		unit,
		ratio,
		floor = null,
		bound = false,
		colored = true,
		open = false,
		bar = null,
		reference = false
	}: {
		entry: MatrixEntry;
		unit: MatrixUnit;
		/** The value's ratio against the row's baseline, when it has one. */
		ratio?: number | undefined;
		/** The noise floor a ratio is read against, or null for none. */
		floor?: number | null;
		/** Whether the ratio is a lower bound: the true one is at least it. */
		bound?: boolean;
		/** Whether the ratio tints the cell. Off where a smaller number is not a better one. */
		colored?: boolean;
		/** Whether the details are shown in the cell. They are always in its `title`. */
		open?: boolean;
		/** The length of a bar beneath the number, as a fraction of the table's largest, or null for none. */
		bar?: number | null;
		/** Whether this is the reference library's column, which every ratio is taken against. */
		reference?: boolean;
	} = $props();

	// the baseline itself is exactly 1, and is not a difference to qualify
	const within_floor = $derived(
		ratio !== undefined &&
			ratio !== 1 &&
			!bound &&
			floor !== null &&
			ratio_is_within_floor(ratio, floor)
	);
</script>

{#if entry.kind === 'value'}
	<td
		class={['num', { tinted: colored && ratio !== undefined, reference }]}
		style:--ratio_color={colored && ratio !== undefined
			? to_ratio_display_color(ratio, bound)
			: undefined}
		title={[...entry.details, ...entry.badges.map((badge) => badge.title)].join('\n') || undefined}
	>
		{entry.text ?? format_matrix_value(entry.value, unit)}
		{#if ratio !== undefined}
			<small
				title={within_floor
					? "inside the row's noise floor (the machine's, or a heap reading's tolerance): not a difference"
					: bound
						? "at least this many times bare Node's own p10–p90 band, which the smallest numbers in the row are inside"
						: undefined}
			>
				{within_floor ? '≈' : bound ? '≥' : ''}{format_ratio(ratio)}
			</small>
		{/if}
		{#if bar !== null}
			<!-- repeats the number for the eye, so it is hidden from assistive tech -->
			<span class="bar" aria-hidden="true">
				<!-- nothing to draw for a number at or under zero, which the minimum width would show -->
				{#if bar > 0}
					<span
						class="bar-fill"
						style:width="{Math.min(1, bar) * 100}%"
						style:background={ratio === undefined
							? 'var(--fg_30)'
							: to_ratio_display_color(ratio, bound)}
					></span>
				{/if}
			</span>
		{/if}
		{#if entry.badges.length > 0}
			<!-- on a line of their own, so a cell with several stays no wider than its number -->
			<span class="badges">
				{#each entry.badges as badge (badge.text)}
					<small class="chip" title={badge.title}>{badge.text}</small>
				{/each}
			</span>
		{/if}
		{#if open}
			<ul class="unstyled">
				{#each [...entry.details, ...entry.badges.map((badge) => badge.title)] as line, i (i)}
					<li><small>{line}</small></li>
				{/each}
			</ul>
		{/if}
	</td>
{:else if entry.kind === 'unsupported'}
	<td class={['num text_70', { reference }]}>
		— <small>unsupported: no {entry.langs.join(', ')}</small>
	</td>
{:else if entry.kind === 'excluded'}
	<td class={['num', { reference }]}>
		<abbr title={entry.reason}>excluded</abbr>
		{#if open}
			<div><small>{entry.reason}</small></div>
		{/if}
	</td>
{:else if entry.kind === 'none'}
	<td class={['num', { reference }]}><small>{entry.text}</small></td>
{:else}
	<td class={['num text_70', { reference }]}><small>not measured</small></td>
{/if}

<style>
	.tinted {
		background-color: color-mix(in hsl, var(--ratio_color) 24%, transparent);
	}
	/* the column every ratio is taken against, edged like its header */
	.reference {
		box-shadow:
			inset var(--border_width_2) 0 0 var(--accent_50),
			inset calc(-1 * var(--border_width_2)) 0 0 var(--accent_50);
	}
	ul {
		white-space: normal;
	}
	.badges {
		display: block;
	}
	/* one width in every column, so a bar's length compares across the libraries too */
	.bar {
		display: block;
		width: 10rem;
		max-width: 100%;
		margin-left: auto;
		height: 0.4rem;
		margin-top: var(--space_xs3);
		border-radius: var(--border_radius_xs);
		background: var(--fg_05);
	}
	.bar-fill {
		display: block;
		height: 100%;
		min-width: 2px;
		border-radius: var(--border_radius_xs);
	}
</style>
