<script lang="ts">
	import type { BenchLibrary } from './results_schema.ts';

	const {
		library
	}: {
		library: Pick<BenchLibrary, 'label' | 'by_maintainer'>;
	} = $props();
</script>

{library.label}{#if library.by_maintainer}
	<small class="chip ml_sm" title="This benchmark's maintainer also maintains this library.">
		maintainer's
	</small>
{/if}
