<script lang="ts">
	import { resolve } from '$app/paths';

	import Card from '@fuzdev/fuz_ui/Card.svelte';

	import BarChart from '#lib/BarChart.svelte';
	import CoverageTable from '#lib/CoverageTable.svelte';
	import LibrariesTable from '#lib/LibrariesTable.svelte';
	import MatrixTable from '#lib/MatrixTable.svelte';
	import Provenance from '#lib/Provenance.svelte';
	import type { PageProps } from './$types.js';

	const { data }: PageProps = $props();
</script>

<section>
	<h1>syntax-highlighter-bench</h1>
	<p>
		A benchmark of JS syntax highlighters: <a href="https://code.fuz.dev/">fuz_code</a>,
		<a href="https://twinkleplop.pngwn.at/">Twinkleplop</a>,
		<a href="https://prismjs.com/">Prism</a>, and <a href="https://shiki.style/">Shiki</a> with each
		of its two engines, run on the same inputs through one adapter each. It times throughput and
		cold start on one named machine, and measures bundle size, install footprint, retained memory,
		token counts, and output size, which come out the same on any machine with the same Node
		version.
	</p>
	<p>
		The maintainer of this benchmark also maintains fuz_code, so that library is marked wherever it
		appears, every input is labeled by where it came from, and the
		<a href={resolve('/docs/method')}>method</a> is published for anyone to reproduce.
	</p>
	<p>
		The libraries have different features. Shiki highlights with the TextMate grammars and themes VS
		Code uses; Twinkleplop aims for a similar feature set, with its own themes, annotations, and
		Twoslash support; and both do more than fuz_code, which has the fewest features of the four: a
		single-pass lexer per language, with CSS classes for its theme. These numbers compare the work
		all of them share, not what one offers that another doesn't.
	</p>
	<p>
		<a href={resolve('/(site)/results')}>Every result, with filters</a> ·
		<a href={resolve('/docs/method')}>how it is measured</a> ·
		<a href={resolve('/docs/corpus')}>the inputs</a> ·
		<a href={resolve('/docs/adapters')}>the adapters, and how to add a library</a>
	</p>
</section>
<section>
	<h2>Headline figures</h2>
	<p>
		Each bar's ratio is to the best library in the chart, where <code>1.00×</code> is the best and a
		ratio marked <code>≈</code> is inside the row's noise floor: the machine's for throughput, and
		the heap check's tolerance for retained memory. Hover a bar to compare the others against it
		instead.
	</p>
	<div class="charts">
		{#each data.charts as chart (chart.row.key)}
			<BarChart
				libraries={data.meta.libraries}
				row={chart.row}
				title={chart.title}
				note={chart.note}
				details={chart.details}
			/>
		{/each}
	</div>
	<Provenance meta={data.meta} moved={data.moved}>
		See <a href={resolve('/docs/method')}>the method</a> for what each number means.
	</Provenance>
	<p>
		These are summaries. <a href={resolve('/(site)/results')}>The results page</a> has every cell
		behind them, on inputs from other sources too.
		<a href={resolve('/docs/method#Caveats')}>The caveats</a> say what the numbers don't: the
		libraries don't do identical work, and Shiki's HTML carries inline styles where the others emit
		classes.
	</p>
</section>
<section>
	<h2>What the numbers mean in practice</h2>
	<p>
		Whether a ratio matters depends on where the highlighting runs and how often. Which figure to
		read first:
	</p>
	<ul>
		<li>
			<strong>At build time</strong>, as a static site or documentation build highlights its pages
			once: throughput sets the build's time and nothing else. Readers get plain HTML, so the JS and
			the cold start never reach them, though a theme stylesheet still does.
		</li>
		<li>
			<strong>In the browser</strong>: everything a page loads and the cold start to a first
			highlight come first, then throughput on long pages.
		</li>
		<li>
			<strong>In an editor that highlights as you type</strong>: throughput at the size being
			edited, against the time of one frame.
		</li>
		<li>
			<strong>On a server that renders each request</strong>: throughput and retained memory, paid
			on every request and held by every process.
		</li>
		<li>
			<strong>In serverless and edge functions</strong>: the cold start, paid by every fresh
			instance, and the bundle where the platform limits its size.
		</li>
	</ul>
	{#if data.practice}
		<MatrixTable
			libraries={data.meta.libraries}
			groups={[data.practice]}
			heading="worked out for"
			label="The HTML throughput worked out for familiar sizes, by library"
		>
			The HTML throughput worked out for sizes a reader knows. Each figure applies the
			geometric-mean rate over the neutral inputs to that size, so it is an estimate; a library's
			rate differs from input to input, as <a href={resolve('/(site)/results')}>the results page</a>
			shows.
		</MatrixTable>
	{/if}
</section>
{#if data.language_weights.length > 0}
	<section>
		<h2>What each language costs</h2>
		<MatrixTable
			libraries={data.meta.libraries}
			groups={data.language_weights}
			heading="language"
			label="What each language costs in JS, by library"
			bars
		>
			What each language's grammar costs, in two ways. <strong>The first language</strong> is the JS
			a page loads for that language alone, minified and compressed with gzip, less the library with
			no language: it includes any runtime the language needs that the floor leaves out, which a
			library pays once, and any language it loads with it, as when a library's TypeScript loads its
			JS. <strong>One more language</strong> is what the language adds to a bundle that already
			holds every other timed language, in minified bytes: the price of adding it to a site that has
			the rest. A language the others already hold, like JS inside TypeScript, adds little or
			nothing there. The bars of each group are on one scale, and beside a number is its ratio to
			the smallest in the row; a row where a library adds nothing has no ratios.
		</MatrixTable>
	</section>
{/if}
<section>
	<h2>Coverage</h2>
	<CoverageTable results={data} />
	<p>
		The languages measured here are fuz_code's built-in set, so the list favors it: a language
		fuz_code doesn't have is never measured. Prism and Shiki each support hundreds of languages, and
		none of that shows here.
	</p>
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

<section class="cards">
	<Card href={resolve('/(site)/results')}>every result, with filters</Card>
	<Card href={resolve('/docs/method')}>how it is measured</Card>
	<Card href={resolve('/docs/corpus')}>the inputs</Card>
	<Card href={resolve('/docs/adapters')}>the adapters, and how to add a library</Card>
</section>

<style>
	.cards {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space_lg);
	}
	/* two charts side by side where they fit, one per line where they don't */
	.charts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 48rem), 1fr));
		column-gap: var(--space_xl5);
	}
</style>
