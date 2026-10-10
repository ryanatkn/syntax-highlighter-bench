<script lang="ts">
	import Mdz from '@fuzdev/mdz/Mdz.svelte';

	import { ENGINE_LABELS, OUTPUT_LABELS } from './library_labels.ts';
	import type { BenchLibrary } from './results_schema.ts';

	const {
		libraries
	}: {
		libraries: ReadonlyArray<BenchLibrary>;
	} = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="table-scroll" tabindex="0" role="region" aria-label="The measured libraries">
	<table>
		<caption>The measured libraries, at the versions these results came from.</caption>
		<thead>
			<tr>
				<th scope="col">library</th>
				<th scope="col">version</th>
				<th scope="col">HTML output</th>
				<th scope="col">engine</th>
				<th scope="col">default theme</th>
				<th scope="col">what is measured</th>
			</tr>
		</thead>
		<tbody>
			{#each libraries as library (library.id)}
				<tr>
					<th scope="row">
						{library.label} <small><code>{library.id}</code></small>
						{#if library.by_maintainer}
							<div>
								<small class="chip">maintainer's</small>
								<small>this benchmark's maintainer also maintains it</small>
							</div>
						{/if}
					</th>
					<td>
						<code>{library.package}</code>
						{library.version}
						{#if library.extra_packages}
							<details>
								<summary><small>with</small></summary>
								<ul class="unstyled">
									{#each Object.entries(library.extra_packages) as [name, version] (name)}
										<li><small><code>{name}</code> {version}</small></li>
									{/each}
								</ul>
							</details>
						{/if}
					</td>
					<td>{OUTPUT_LABELS[library.output]}</td>
					<td>{ENGINE_LABELS[library.engine]}</td>
					<td>{library.theme_schemes.join(' + ')}</td>
					<td>
						{#if library.note}<Mdz content={library.note} inline />{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
