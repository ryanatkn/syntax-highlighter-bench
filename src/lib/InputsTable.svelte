<script lang="ts">
	import type { BenchInput } from './results_schema.ts';
	import { format_count } from './bench_format.ts';
	import { format_provenance, group_inputs, to_provenance_url } from './corpus_inputs.ts';

	const {
		inputs
	}: {
		inputs: ReadonlyArray<BenchInput>;
	} = $props();

	const groups = $derived(group_inputs(inputs));
</script>

{#each groups as group (group.source_key)}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div class="table-scroll" tabindex="0" role="region" aria-label="Inputs from {group.label}">
		<table>
			<caption><code>{group.label}</code> — {group.note}</caption>
			<thead>
				<tr>
					<th scope="col">input</th>
					<th scope="col">language</th>
					<th scope="col">tier</th>
					<th scope="col" class="num">bytes</th>
					<th scope="col" class="num">lines</th>
					<th scope="col">license</th>
					<th scope="col">upstream, at its pinned commit</th>
				</tr>
			</thead>
			<tbody>
				{#each group.inputs as input (input.file)}
					<tr>
						<th scope="row">
							<code>{input.file}</code>
							{#if input.synthetic}<small class="chip">synthetic</small>{/if}
						</th>
						<td>{input.lang}</td>
						<td>{input.size}</td>
						<td class="num">{format_count(input.bytes)}</td>
						<td class="num">{format_count(input.lines)}</td>
						<td>{[...new Set(input.provenance.map((p) => p.license))].join(', ')}</td>
						<td>
							{#if input.derivation !== null}<div><small>{input.derivation}, from</small></div>{/if}
							{#each input.provenance as provenance (provenance.repo + provenance.path)}
								<div>
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
									<a href={to_provenance_url(provenance)} rel="external">
										{format_provenance(provenance)}
									</a>
									<small><code>{provenance.path}</code></small>
								</div>
							{:else}
								<small>written for this benchmark</small>
							{/each}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/each}
