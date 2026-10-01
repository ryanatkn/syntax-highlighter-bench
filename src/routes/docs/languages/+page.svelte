<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';

	const tome = tome_get_by_slug('languages');
</script>

<TomeContent {tome}>
	<section>
		<p>
			The harness owns the language ids. Each library names its languages differently, so an adapter
			maps these ids onto its library's own. <code>bench/langs.ts</code> is the source of truth, and
			a results file carries the list so the site reads it from there.
		</p>
	</section>
	<TomeSection>
		<TomeSectionHeader text="Language ids" />
		<p>
			The timed languages are the ones every library in the starting roster supports, so a timed
			comparison is never missing a library by design:
		</p>
		<p>
			<code>ts</code>, <code>js</code>, <code>css</code>, <code>html</code>, <code>json</code>,
			<code>svelte</code>, <code>md</code>, <code>bash</code>, <code>rust</code>
		</p>
		<p>
			<code>xml</code> is also an id but is not timed, because the roster doesn't share it:
			twinkleplop has no XML language. It appears in the coverage matrix and in feature sets.
		</p>
		<p>
			The measured libraries support many more languages than these. An id is added when a feature
			set or a second library needs it.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Unsupported and excluded" />
		<p>A library can be missing from a comparison for two different reasons:</p>
		<ul>
			<li>
				<strong>unsupported</strong> — the library's adapter doesn't claim the language. Adapters
				declare their languages explicitly and never fall back to plain text, which would otherwise
				benchmark as very fast.
			</li>
			<li>
				<strong>excluded</strong> — the adapter claims the language, but its output failed the check
				that runs before measuring, described in <TomeLink slug="adapters" />.
			</li>
		</ul>
		<p>
			Neither is recorded as a zero or counted in an average, and the <TomeLink slug="results" />
			keeps the two apart.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Feature sets" />
		<p>
			A feature set is a named list of language ids that bundle size is measured over. The sets are
			declared in <code>bench/sets.ts</code> before any numbers exist, so a set can't be chosen to
			flatter a result.
		</p>
		<table>
			<thead>
				<tr>
					<th>id</th>
					<th>languages</th>
					<th>purpose</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td><code>core</code></td>
					<td>none</td>
					<td>the library with no languages registered: its runtime floor</td>
				</tr>
				<tr>
					<td><code>single:&lt;lang&gt;</code></td>
					<td>one, for each language id</td>
					<td>subtracting <code>core</code> gives what that language adds</td>
				</tr>
				<tr>
					<td><code>docs</code></td>
					<td>js, ts, css, html, md, bash, json</td>
					<td>what a documentation site imports, matching twinkleplop's docs bundle</td>
				</tr>
				<tr>
					<td><code>web_rust</code></td>
					<td>ts, js, css, html, xml, json, svelte, md, bash, rust</td>
					<td>
						labelled "web + rust" and footnoted as fuz_code's full set, so home turf for that
						library
					</td>
				</tr>
				<tr>
					<td><code>all</code></td>
					<td>every language id</td>
					<td>the union</td>
				</tr>
			</tbody>
		</table>
		<p>
			A set is measured for a library only when the library supports every language in it. Otherwise
			the result names the languages it lacks.
		</p>
	</TomeSection>
</TomeContent>
