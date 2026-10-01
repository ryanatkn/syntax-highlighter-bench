<script lang="ts">
	import { resolve } from '$app/paths';
	import Breadcrumb from '@fuzdev/fuz_ui/Breadcrumb.svelte';
</script>

<main class="width_atmost_md mx_auto p_lg">
	<section>
		<h1>syntax-highlighter-bench</h1>
		<Breadcrumb />
		<p>
			A neutral benchmark suite and results site for JavaScript syntax highlighters. It will measure
			fuz_code, twinkleplop, Prism, and Shiki on the same inputs, and adding a library will mean
			writing one adapter. No results are published yet.
		</p>
		<p>
			The maintainer of this benchmark also maintains fuz_code, so that library will be flagged
			wherever its numbers appear, every input will be labelled by where it came from, and the
			method will be published for anyone to reproduce. The measurement method follows twinkleplop's
			comparison harness.
		</p>
		<p>
			<a href={resolve('/docs')}>docs</a> ·
			<a href="https://github.com/ryanatkn/syntax-highlighter-bench">source</a>
		</p>
	</section>
</main>
