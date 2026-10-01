<script lang="ts">
	import { format_ratio } from './bench_format.ts';
	import { format_matrix_value, type MatrixEntry, type MatrixUnit } from './matrix.ts';
	import { ratio_is_within_floor, to_bound_color, to_ratio_color } from './ratio.ts';

	const {
		entry,
		unit,
		ratio,
		floor = null,
		bound = false,
		colored = true,
		open = false
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
		class={['num', { tinted: colored && ratio !== undefined }]}
		style:--ratio_color={colored && ratio !== undefined
			? bound
				? to_bound_color(ratio)
				: to_ratio_color(ratio)
			: undefined}
		title={[...entry.details, ...entry.badges.map((badge) => badge.title)].join('\n') || undefined}
	>
		{entry.text ?? format_matrix_value(entry.value, unit)}
		{#if ratio !== undefined}
			<small
				title={within_floor
					? "inside the machine's noise floor: not a difference"
					: bound
						? "at least this many times the baseline's own noise, which the smallest numbers in the row are inside"
						: undefined}
			>
				{within_floor ? '≈' : bound ? '≥' : ''}{format_ratio(ratio)}
			</small>
		{/if}
		{#each entry.badges as badge (badge.text)}
			<small class="chip" title={badge.title}>{badge.text}</small>
		{/each}
		{#if open}
			<ul class="unstyled">
				{#each [...entry.details, ...entry.badges.map((badge) => badge.title)] as line, i (i)}
					<li><small>{line}</small></li>
				{/each}
			</ul>
		{/if}
	</td>
{:else if entry.kind === 'unsupported'}
	<td class="num text_70">
		— <small>unsupported: no {entry.langs.join(', ')}</small>
	</td>
{:else if entry.kind === 'excluded'}
	<td class="num">
		<abbr title={entry.reason}>excluded</abbr>
		{#if open}
			<div><small>{entry.reason}</small></div>
		{/if}
	</td>
{:else if entry.kind === 'none'}
	<td class="num"><small>{entry.text}</small></td>
{:else}
	<td class="num text_70"><small>not measured</small></td>
{/if}

<style>
	.tinted {
		background-color: color-mix(in hsl, var(--ratio_color) 24%, transparent);
	}
	ul {
		white-space: normal;
	}
</style>
