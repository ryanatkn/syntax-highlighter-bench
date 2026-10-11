<script lang="ts">
	const {
		legend,
		options,
		selected,
		onchange
	}: {
		legend: string;
		/** Every choice, in display order. */
		options: ReadonlyArray<{ id: string; label: string }>;
		/** The ids of the checked choices. */
		selected: ReadonlyArray<string>;
		/** Called with the checked ids, in the order of `options`. */
		onchange: (selected: Array<string>) => void;
	} = $props();

	const toggle = (id: string, checked: boolean): void => {
		onchange(options.map((o) => o.id).filter((o) => (o === id ? checked : selected.includes(o))));
	};
</script>

<fieldset>
	<legend>{legend}</legend>
	<!-- a long list takes two columns, so it is no taller than its neighbors -->
	<div class={{ split: options.length > 6 }}>
		{#each options as option (option.id)}
			<label class="row">
				<input
					type="checkbox"
					checked={selected.includes(option.id)}
					onchange={(e) => toggle(option.id, e.currentTarget.checked)}
				/>
				<span>{option.label}</span>
			</label>
		{/each}
	</div>
	<div class="row gap_xs">
		<button
			type="button"
			aria-label="select every choice of {legend}"
			onclick={() => onchange(options.map((o) => o.id))}
		>
			all
		</button>
		<button type="button" aria-label="select no choice of {legend}" onclick={() => onchange([])}>
			none
		</button>
	</div>
</fieldset>

<style>
	.split {
		columns: 2;
		column-gap: var(--space_lg);
	}
	.split label {
		break-inside: avoid;
	}
</style>
