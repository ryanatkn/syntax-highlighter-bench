<script lang="ts">
	const {
		label,
		options,
		value,
		onchange
	}: {
		label: string;
		/** Every choice, in display order. */
		options: ReadonlyArray<{ id: string; label: string }>;
		/** The id of the selected choice. */
		value: string;
		onchange: (value: string) => void;
	} = $props();
</script>

<label>
	<div class="title">{label}</div>
	<select {value} onchange={(e) => onchange(e.currentTarget.value)}>
		{#each options as option (option.id)}
			<option value={option.id} selected={option.id === value}>{option.label}</option>
		{/each}
	</select>
</label>
