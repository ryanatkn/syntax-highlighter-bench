<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';

	import { find_without_set } from '$lib/bundle_matrix.ts';
	import { docs_data_context } from '$lib/docs_data.ts';

	const tome = tome_get_by_slug('languages');

	const get_docs = docs_data_context.get();
	const docs = $derived(get_docs());

	// the sets of every timed language but one, found by what they hold
	const leave_one_out = $derived(
		docs.langs
			.map((lang) => find_without_set(docs.sets, docs.langs, lang.id))
			.filter((set) => set !== null)
	);

	// the sets of one language are one row, as are the sets that leave one out: there is one of
	// each for every language id, or every timed one
	const sets = $derived(
		docs.sets.filter((set) => set.langs.length !== 1 && !leave_one_out.includes(set))
	);
	const has_single_sets = $derived(docs.sets.some((set) => set.langs.length === 1));
	const has_leave_one_out_sets = $derived(leave_one_out.length > 0);
</script>

<TomeContent {tome}>
	<section>
		<p>
			The harness owns the language ids. Each library names its languages differently, so an adapter
			maps these ids onto its library's own. <code>bench/langs.ts</code> is the source of truth, and
			a results file carries the list, so the tables on this page are read from the results this
			site renders.
		</p>
		<p>
			The languages measured are fuz_code's built-in set, so the list favours it: a language
			fuz_code doesn't have is never measured. Prism and Shiki each support hundreds of languages,
			and none of that shows here.
		</p>
	</section>
	<TomeSection>
		<TomeSectionHeader text="Language ids" />
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class="table-scroll" tabindex="0" role="region" aria-label="Language ids">
			<table>
				<caption>The language ids of the results this site renders.</caption>
				<thead>
					<tr>
						<th scope="col">id</th>
						<th scope="col">language</th>
						<th scope="col">timed</th>
					</tr>
				</thead>
				<tbody>
					{#each docs.langs as lang (lang.id)}
						<tr>
							<th scope="row"><code>{lang.id}</code></th>
							<td>{lang.label}</td>
							<td>{lang.timed ? 'yes' : 'no'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p>
			The timed languages are the ones every library in the starting roster supports, so a timed
			comparison is never missing a library by design.
		</p>
		<p>
			A language that is an id but is not timed is one the roster doesn't share: XML is the case
			today, since twinkleplop has no XML language. It appears in the coverage matrix and in feature
			sets. A cold-start scenario that loads one language loads a timed one, so it never names an
			untimed id.
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
			A feature set is a named list of language ids that bundle size is measured over, and that a
			cold-start scenario imports. The sets are declared in <code>bench/sets.ts</code> before any
			numbers exist, so a set can't be chosen to flatter a result.
		</p>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class="table-scroll" tabindex="0" role="region" aria-label="Feature sets">
			<table>
				<caption>The feature sets of the results this site renders.</caption>
				<thead>
					<tr>
						<th scope="col">id</th>
						<th scope="col">label</th>
						<th scope="col">languages</th>
						<th scope="col">note</th>
					</tr>
				</thead>
				<tbody>
					{#each sets as set (set.id)}
						<tr>
							<th scope="row"><code>{set.id}</code></th>
							<td>{set.label}</td>
							<td>{set.langs.length > 0 ? set.langs.join(', ') : 'none'}</td>
							<td>{set.footnote ?? ''}</td>
						</tr>
					{/each}
					{#if has_single_sets}
						<tr>
							<th scope="row"><code>single:&lt;lang&gt;</code></th>
							<td>the language's name</td>
							<td>one, for each language id</td>
							<td></td>
						</tr>
					{/if}
					{#if has_leave_one_out_sets}
						<tr>
							<th scope="row"><code>without:&lt;lang&gt;</code></th>
							<td>timed less the language</td>
							<td>every timed language but one, for each timed language</td>
							<td></td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
		<p>What each is for:</p>
		<ul>
			<li><code>core</code> — the library with no languages registered: its runtime floor.</li>
			<li>
				<code>single:&lt;lang&gt;</code> — subtracting <code>core</code> gives what that language
				adds, which the results page shows for every language.
			</li>
			<li>
				<code>docs</code> — what a documentation site imports, matching twinkleplop's docs bundle.
				It is also the set a cold-start process loads in the <code>set</code> scenario.
			</li>
			<li>
				<code>web_rust</code> — everything fuz_code supports, so it is home turf for that library,
				and its note says so. It is named by its content because the site is neutral.
			</li>
			<li>
				<code>all</code> — every language id. While it holds the same languages as another set, the
				two are one bundle, and the results page shows them as one row.
			</li>
			<li>
				<code>timed</code> — every timed language, which every library claims, and
				<code>without:&lt;lang&gt;</code> — the same less one of them. Subtracting the second from
				the first gives what a language adds to a bundle that already holds all the others. Unlike
				<code>single:&lt;lang&gt;</code> less <code>core</code>, that never includes runtime the
				first language loaded pays for, and a language the others already hold adds nothing.
			</li>
		</ul>
		<p>
			A set is measured for a library only when the library supports every language in it. Otherwise
			the result names the languages it lacks. <TomeLink slug="deterministic" /> describes how a set
			is built and measured.
		</p>
	</TomeSection>
</TomeContent>
