<script lang="ts">
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import DeclarationLink from '@fuzdev/fuz_ui/DeclarationLink.svelte';
	import TomeSection from '@fuzdev/fuz_ui/TomeSection.svelte';
	import TomeSectionHeader from '@fuzdev/fuz_ui/TomeSectionHeader.svelte';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';
	import Code from '@fuzdev/fuz_code/Code.svelte';

	const tome = tome_get_by_slug('deterministic');

	const commands = `npm run bench:deterministic             # regenerate results/deterministic.json
npm run bench:deterministic -- --check  # regenerate in memory, and fail if the committed file differs`;
</script>

<TomeContent {tome}>
	<section>
		<p>
			Some of what the benchmark reports is the same on any machine: how many bytes a library adds
			to a page, what installing it adds to a project, how many tokens it finds in an input, how
			large its HTML is, and which languages it covers. These are measured by a command of their
			own, with nothing timed, and committed as <code>results/deterministic.json</code>.
		</p>
		<Code lang="bash" content={commands} />
		<p>
			The file goes through the same schema as a timed run, described in
			<TomeLink slug="results" />, and regenerating it on an unchanged tree changes nothing.
		</p>
	</section>
	<TomeSection>
		<TomeSectionHeader text="Bundle size" />
		<p>
			For each library and each feature set of <TomeLink slug="languages" />, the library's adapter
			writes the module a consumer would write: the library with exactly the set's languages
			registered, in the shape the library documents. <code>bench/sizes.ts</code> bundles that
			module, minifies it, and reports its bytes in <DeclarationLink name="BenchBundleSizes" />:
		</p>
		<ul>
			<li><code>raw</code> — the minified JavaScript</li>
			<li><code>gzip</code> — those bytes gzipped at level 9, the highest</li>
			<li><code>brotli</code> — those bytes brotli-compressed at quality 11, the highest</li>
		</ul>
		<p>How a bundle is built:</p>
		<ul>
			<li>
				Vite's build API in library mode bundles the entry into one ES module, as a production build
				for the browser, resolving from the versions installed here.
			</li>
			<li>
				Vite's library mode never removes the whitespace of an ES module, which suits a library and
				not a page. So the module is then minified once, whole, by the esbuild inside Vite. No
				bundle in the roster ends up carrying a license comment.
			</li>
			<li>Compression is Node's zlib and brotli.</li>
		</ul>
		<p>
			A set that holds a language the library doesn't claim is not measured for it. The entry names
			the languages it lacks instead, and is never a zero.
		</p>
		<p>The shape each adapter writes, which its <code>notes.md</code> states in full:</p>
		<table>
			<thead>
				<tr>
					<th>library</th>
					<th>with languages</th>
					<th>with none: <code>core</code></th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td>fuz_code</td>
					<td>a <code>SyntaxStyler</code> with the needed <code>lexer_*</code> modules added</td>
					<td>the styler alone</td>
				</tr>
				<tr>
					<td>twinkleplop</td>
					<td>the two factories of each language's package</td>
					<td>
						the runtime and the grammar compiler of the core package, which every language package
						is built from
					</td>
				</tr>
				<tr>
					<td>Prism</td>
					<td>the core file and one component file for each grammar, in dependency order</td>
					<td>the core file alone</td>
				</tr>
				<tr>
					<td>Shiki, both engines</td>
					<td>
						<code>shiki/core</code>, one engine, the <code>github-light</code> theme, and one module
						for each language
					</td>
					<td>the core, the engine, and the theme, since Shiki can't render without a theme</td>
				</tr>
			</tbody>
		</table>
		<p>
			A library's maintainers may know a leaner documented shape. The entry is one function of the
			adapter, <code>bundle_entry</code>, and a change to it is a small pull request.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Wasm and theme CSS" />
		<p>
			Two things stay out of the JavaScript figures and have a section each, because folding them in
			would hide a real difference between libraries. Both are reported as the JavaScript is, as
			<code>raw</code>, <code>gzip</code>, and <code>brotli</code>, in
			<DeclarationLink name="BenchByteSizes" />:
		</p>
		<ul>
			<li>
				<code>wasm</code> — the WebAssembly binary a library loads, and null for a library with
				none. Shiki's Oniguruma engine loads one. The documented import carries the binary inlined
				in a JavaScript module as text, which a bundler would count as JavaScript. The build leaves
				that one import out of the bundle, and the binary file itself is measured.
			</li>
			<li>
				<code>css</code> — each library's documented default stylesheet, minified by the same
				esbuild. Output that carries classes needs a stylesheet to show any color. Output that
				carries inline styles needs none, so for Shiki the section is null: its theme is in the
				JavaScript figure, and its colors are in every page of HTML. A theme of several stylesheets
				is measured file by file, each compressed on its own, and summed.
			</li>
		</ul>
		<p>
			Default themes don't cover the same ground. Each library's roster entry says which color
			schemes its theme holds, in <code>theme_schemes</code>: the stylesheets of fuz_code and
			twinkleplop hold a light and a dark palette, and Prism's holds one. Read the stylesheet sizes
			beside that.
		</p>
		<p>
			Which stylesheets are a library's default theme is stated by its adapter, and a theme shipped
			as a package of its own has its version recorded with the library's.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Each bundle is checked" />
		<p>
			A bundle that lost a language to tree shaking, or was written without one, would be reported
			as small. So every bundle is written to disk and imported in a process of its own, and each
			language of its set is highlighted through the bundle's exports, on that language's harness
			snippet.
		</p>
		<ul>
			<li>
				For a bundle of one language, the HTML must equal what the library produces through its
				adapter with that language set up. A language missing something it embeds, like HTML without
				its script and style languages, renders differently and fails.
			</li>
			<li>
				For a bundle of several languages, the HTML must have as many kinds of styled span as the
				snippet gate of <TomeLink slug="adapters" /> asks for. Equality doesn't hold there by
				design: a Markdown fence is highlighted when its language is in the bundle, and left plain
				in a process with one language loaded.
			</li>
		</ul>
		<p>
			A bundle that doesn't import or exports nothing fails too. The check doesn't prove a bundle is
			the smallest that works.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="What a language costs" />
		<p>
			One set holds no languages and one holds each language alone, so the bytes a language adds to
			a library are <code>single:&lt;lang&gt;</code> minus <code>core</code>, with no extra
			measurement. The results page derives that view from the sets and never stores it, so it can't
			drift from them. It is the default view of the bundle sizes there.
		</p>
		<p>
			The sum of those differences over a set and the set's measured size differ when a library
			shares code between languages, or when one language brings another with it, as HTML brings the
			script and style languages. The results page shows the sum beside the measured size for that
			reason.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Token counts and output sizes" />
		<p>
			For every input of the <TomeLink slug="corpus" /> and every library that claims its language,
			<code>bench/outputs.ts</code> records what one <code>tokenize</code> call and one
			<code>html</code> call return:
		</p>
		<ul>
			<li><code>tokens</code> — the library's own token count</li>
			<li>
				<code>output</code> — the HTML's size in UTF-8 bytes, <code>html_bytes</code>, and how many
				elements it has, <code>spans</code>
			</li>
			<li>
				<code>compressed</code> — the same HTML <code>gzip</code>ped and
				<code>brotli</code>-compressed at the levels bundle sizes use: what a server sends for a
				page that renders the input highlighted. The HTML is produced again for this, outside the
				check, and must come to the size the check saw.
			</li>
		</ul>
		<p>
			They are taken as a timed cell takes them: a process sets up exactly one language in one
			library, the snippet gate runs, and each input is then checked. A library that fails is
			recorded as excluded with the reason, not counted.
		</p>
		<p>
			Equal sizes don't mean equal output: two libraries, or Shiki's two engines, can return HTML of
			the same size that colors a token differently, and nothing here compares content.
		</p>
		<p>
			Each number is stated once for an input, on the cell whose call returns it: the token count on
			the input's <code>tokenize</code> cell and the output sizes, raw and compressed, on its
			<code>html</code> cell.
		</p>
		<p>What the numbers don't say:</p>
		<ul>
			<li>
				<strong>Token counts are not comparable as work.</strong> Libraries split the same source
				differently. Shiki counts runs of whitespace and unstyled text, the others count only typed
				tokens, and a container and what it holds may each count. Fewer tokens is less output, not a
				faster library.
			</li>
			<li>
				<strong>Classes and inline styles are different HTML.</strong> A class name is short and
				needs a stylesheet. An inline color is repeated on every token and needs none. Compare
				<code>html_bytes</code> with the theme CSS column beside it. Compression narrows the gap,
				since a repeated color is what it removes best, which is why the compressed sizes are
				recorded too.
			</li>
			<li>
				<strong>Wrappers differ.</strong> twinkleplop and Shiki wrap the output in
				<code>&lt;pre&gt;</code> and a span for each line, and fuz_code and Prism return bare token
				spans. <code>spans</code> counts every element.
			</li>
			<li>
				<strong>Prism's two calls can disagree on Markdown.</strong> Prism highlights the inside of
				a fenced block in a hook that only <code>highlight</code> runs, never <code>tokenize</code>.
				For a fence whose language is loaded, the HTML holds elements the token count doesn't
				include.
			</li>
		</ul>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Install footprint" />
		<p>
			What <code>npm install</code> of a library adds to a project, in
			<DeclarationLink name="BenchInstall" />: <code>bench/install.ts</code> walks the runtime
			dependency closure of the adapter's package and each of its separately versioned packages,
			resolving each dependency from the package that needs it as Node resolves it, through this
			repository's <code>node_modules</code>.
		</p>
		<ul>
			<li><code>packages</code> — the packages in the closure, each counted once</li>
			<li>
				<code>files</code> — the files in those packages' directories, less any nested
				<code>node_modules</code>, whose packages are counted through the closure
			</li>
			<li><code>bytes</code> — the sum of those files' sizes as stored, not the disk blocks</li>
		</ul>
		<p>What the closure follows:</p>
		<ul>
			<li><code>dependencies</code>, always</li>
			<li>
				<code>peerDependencies</code> not marked optional, which npm installs as well: fuz_code's
				utility library is one
			</li>
			<li>
				<code>optionalDependencies</code> that are installed and not limited to some platforms by
				<code>os</code>, <code>cpu</code>, or <code>libc</code>. A package with a binary for each
				platform installs one of them on each machine, and counting it would make the figure the
				machine's. No library in the roster has one today.
			</li>
			<li>never <code>devDependencies</code></li>
		</ul>
		<p>
			Each library is counted whole, on its own, as installing it alone would give: the two Shiki
			adapters install the same package and have the same footprint. npm installs what a package's
			tarball holds, so the footprint is everything the package ships, every language, theme, and
			type declaration included, and not what a page loads.
		</p>
		<p>
			The versions are the ones this repository's lockfile installs, transitive ones included. A
			fresh <code>npm install</code> of the same library may resolve a dependency to a newer version
			within its range, and its footprint then differs. A package is told apart by name and version,
			so one installed twice at the same version counts once. <code>closure</code> is a hash of the
			sorted <code>name@version</code> list: a timed run carries the file only when each library's
			closure is this tree's, and the site names a library whose dependencies moved since a run.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Coverage" />
		<p>
			The coverage matrix is each adapter's language map: <code>true</code> for a language the
			library claims, a footnote where the support is indirect, and no entry for a language it
			doesn't claim, in <DeclarationLink name="BenchCoverageEntry" />. The footnotes are written
			once, in the adapters, and <TomeLink slug="adapters" /> lists what they cover.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="What the file records" />
		<p>
			A deterministic file holds no timed value, so it records no machine, no time, no Node version,
			and no commit: none of them shaped its numbers, and a commit can't name the tree it is itself
			committed in. What the numbers do depend on is in the file:
		</p>
		<ul>
			<li>each library's version, and the versions of its separately versioned packages</li>
			<li>the corpus hash</li>
			<li>
				the versions of Vite and of the Rollup and esbuild inside it, and the compression levels, in
				<DeclarationLink name="BenchBundler" />
			</li>
		</ul>
		<p>
			Two dependencies are not in the file. The gzip and brotli sizes, of bundles and of HTML alike,
			come from the zlib and brotli inside Node, and a Node with another version of either can
			compress to a few bytes more or less. The file is generated on the Node version the checks run
			on. And the install footprints follow the versions the lockfile installs, which a dependency
			update moves without moving a library's own version. A failed check says which of these it
			looks like.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Beside a timed run" />
		<p>
			A timed run, described in <TomeLink slug="method" />, takes its cells' token counts and output
			sizes from its own processes, by the same check under the same setup. When the deterministic
			file describes the run, which is the same library versions, install closures, corpus, and
			feature sets, the run does two more things:
		</p>
		<ul>
			<li>
				it compares each library's first result on a cell with the file, and stops at a difference
			</li>
			<li>
				it copies the bundle sizes, the install footprints, and the HTML's compressed sizes of its
				libraries from the file, and measures none of them (cold start rebuilds a missing cached
				bundle, checked against those sizes)
			</li>
		</ul>
		<p>
			The compressed sizes are not compared on their own: the raw size each process reports is, and
			the file applies only at the same install closures, which pin every package that renders the
			HTML, transitive ones included. Compressing every process's HTML again would compress the same
			bytes in every process, for numbers the file already holds.
		</p>
		<p>
			So a timed results file holds the deterministic numbers of its cells and the sizes of its
			libraries, equal to the deterministic file's. When the file doesn't describe the run, a smoke
			or filtered run says so and carries none of those sizes, and a full run with no filters is
			refused before it measures anything: regenerating the file is quick, and the run is long.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Kept current" />
		<p>
			On every change the repository's check workflow runs the tests,
			<code>bench:deterministic -- --check</code>, and a smoke run of every library on every cell.
			The deterministic check rebuilds every bundle and recounts every input, and fails with the
			places that differ when the committed file is stale. Nothing in the workflow is a measurement
			of speed.
		</p>
	</TomeSection>
</TomeContent>
