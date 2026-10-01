<script lang="ts">
	import { resolve } from '$app/paths';

	import CoverageTable from '$lib/CoverageTable.svelte';
	import LibrariesTable from '$lib/LibrariesTable.svelte';
	import MatrixTable from '$lib/MatrixTable.svelte';
	import Provenance from '$lib/Provenance.svelte';
	import type { PageProps } from './$types.js';

	const { data }: PageProps = $props();
</script>

<section>
	<h1>syntax-highlighter-bench</h1>
	<p>
		A benchmark of JavaScript syntax highlighters: fuz_code, twinkleplop, Prism, and Shiki with each
		of its two engines, run on the same inputs through one adapter each. It measures throughput,
		cold start, and memory on one named machine, and bundle size, token counts, and output size,
		which are the same anywhere.
	</p>
	<p>
		The maintainer of this benchmark also maintains fuz_code, so that library is marked wherever it
		appears, every input is labelled by where it came from, and the
		<a href={resolve('/docs/method')}>method</a> is published for anyone to reproduce.
	</p>
	<p>
		<a href={resolve('/results')}>Every result, with filters</a> ·
		<a href={resolve('/docs/method')}>how it is measured</a> ·
		<a href={resolve('/docs/corpus')}>the inputs</a> ·
		<a href={resolve('/docs/adapters')}>the adapters, and how to add a library</a>
	</p>
</section>
<section>
	<h2>Headline figures</h2>
	<Provenance meta={data.meta} moved={data.moved}>
		See <a href={resolve('/docs/method')}>the method</a> for what each number means.
	</Provenance>
	<MatrixTable
		libraries={data.meta.libraries}
		groups={data.headline}
		heading="figure"
		label="Headline figures by library"
	>
		Each library's headline figures. Beside a number is its ratio to the best in the row, where
		<code>1.00×</code> is the best. A throughput figure is a geometric mean over the inputs every
		library was measured on, and a ratio marked <code>≈</code> is inside the machine's noise floor.
		"Everything loaded" adds the wasm binary and the theme stylesheet to the JavaScript.
	</MatrixTable>
	<p>
		These are summaries. <a href={resolve('/results')}>The results page</a> has every cell behind
		them, on inputs from other sources too, and what each language adds to a bundle.
		<a href={resolve('/docs/method#Caveats')}>The caveats</a> say what the numbers don't: the
		libraries don't do identical work, and Shiki's HTML carries inline styles where the others emit
		classes.
	</p>
</section>
<section>
	<h2>Coverage</h2>
	<CoverageTable results={data} />
	<p>
		Unsupported means the library's adapter doesn't claim the language. That is different from
		excluded, where a library claims a language and its output failed the check that runs before
		measuring. Neither is ever shown as a zero or counted in a mean.
		<a href={resolve('/docs/languages')}>Languages and sets</a> has the details.
	</p>
</section>
<section>
	<h2>Libraries</h2>
	<LibrariesTable libraries={data.meta.libraries} />
	<p>
		Each library is driven through one adapter with notes on the entry points it uses, so its
		maintainers can review or replace it. See <a href={resolve('/docs/adapters')}>the adapters</a>.
	</p>
</section>
