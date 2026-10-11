import{F as e,L as t,M as n,Q as r,_t as i,at as a,ft as o,nt as s,pt as c,rt as l,vt as u}from"./DkH4oS7D.js";import{n as d}from"./CtErELZh.js";import{t as f}from"./DESDfS9X.js";import{t as p}from"./0Yij4SCe.js";import{t as m}from"./DeEuBUub.js";import{n as h,t as g}from"./Bcn64TpZ.js";import{t as _}from"./IGuC_Li3.js";import{t as v}from"./D7Bsffq_.js";import{i as y}from"./C-6h8kcQ.js";var b=t(`<!> <p>For each library and each feature set of <!>, the library's adapter
			writes the module a consumer would write: the library with exactly the set's languages
			registered, in the shape the library documents. <code>bench/sizes.ts</code> bundles that
			module, minifies it, and reports its bytes in <!>:</p> <ul><li><code>raw</code> — the minified JS</li> <li><code>gzip</code> — those bytes gzipped at level 9, the highest</li> <li><code>brotli</code> — those bytes brotli-compressed at quality 11, the highest</li></ul> <p>How a bundle is built:</p> <ul><li>Vite's build API in library mode bundles the entry into one ES module, as a production build
				for the browser, resolving from the versions installed here.</li> <li>Vite's library mode never removes the whitespace of an ES module, which suits a library and
				not a page. So the module is then minified once, whole, by esbuild, which keeps license
				comments: Prism's bundles carry the one in its core file.</li> <li>Compression is Node's zlib and brotli.</li></ul> <p>A set that holds a language the library doesn't claim is not measured for it. The entry names
			the languages it lacks instead, and is never a zero.</p> <p>The shape each adapter writes, which its <code>notes.md</code> states in full:</p> <table><thead><tr><th>library</th><th>with languages</th><th>with none: <code>core</code></th></tr></thead><tbody><tr><td>fuz_code</td><td>a <code>SyntaxStyler</code> with the needed <code>lexer_*</code> modules added</td><td>the styler alone</td></tr><tr><td>Twinkleplop</td><td>the two factories of each language's package</td><td>the runtime and the grammar compiler of the core package, which every language package
						is built from</td></tr><tr><td>Prism</td><td>the core file and one component file for each grammar, in dependency order</td><td>the core file alone</td></tr><tr><td>Shiki, both engines</td><td><code>shiki/core</code>, one engine, the <code>github-light</code> theme, and one module
						for each language</td><td>the core, the engine, and the theme, since Shiki can't render without a theme</td></tr></tbody></table> <p>A library's maintainers may know a leaner documented shape. The entry is one function of the
			adapter, <code>bundle_entry</code>, and a change to it is a small pull request.</p>`,1),x=t(`<!> <p>Two things stay out of the JS figures and have a section each, because folding them in would
			hide a real difference between libraries. Both are reported as the JS is, as <code>raw</code>, <code>gzip</code>, and <code>brotli</code>, in <!>:</p> <ul><li><code>wasm</code> — the WebAssembly binary a library loads, and null for a library with
				none. Shiki's Oniguruma engine loads one. The documented import carries the binary inlined
				in a JS module as text, which a bundler would count as JS. The build leaves that one import
				out of the bundle, and the binary file itself is measured.</li> <li><code>css</code> — each library's documented default stylesheet, minified by the same
				esbuild. Output that carries classes needs a stylesheet to show any color. Output that
				carries inline styles needs none, so for Shiki the section is null: its theme is in the JS
				figure, and its colors are in every page of HTML. A theme of several stylesheets is measured
				file by file, each compressed on its own, and summed.</li></ul> <p>Default themes don't cover the same ground. Each library's roster entry says which color
			schemes its theme holds, in <code>theme_schemes</code>: the stylesheets of fuz_code and
			Twinkleplop hold a light and a dark palette, and Prism's holds one. Read the stylesheet sizes
			beside that.</p> <p>Which stylesheets are a library's default theme is stated by its adapter, and a theme shipped
			as a package of its own has its version recorded with the library's.</p>`,1),S=t(`<!> <p>A bundle that lost a language to tree shaking, or was written without one, would be reported
			as small. So every bundle is written to disk and imported in a process of its own, and each
			language of its set is highlighted through the bundle's exports, on that language's harness
			snippet.</p> <ul><li>For a bundle of one language, the HTML must equal what the library produces through its
				adapter with that language set up. A language missing something it embeds, like HTML without
				its script and style languages, renders differently and fails.</li> <li>For a bundle of several languages, the HTML must have as many kinds of styled span as the
				snippet gate of <!> asks for. Equality doesn't hold there by
				design: a Markdown fence is highlighted when its language is in the bundle, and left plain
				in a process with one language loaded.</li></ul> <p>A bundle that fails to import, or exports nothing, fails too. The check doesn't prove a bundle
			is the smallest that works.</p>`,1),C=t(`<!> <p>One set holds no languages, and for each language one set holds it alone, so the bytes a
			language adds to a library are <code>single:&lt;lang&gt;</code> minus <code>core</code>, with
			no extra measurement. The results page derives that view from the sets and never stores it, so
			it can't drift from them. It is the default view of the bundle sizes there.</p> <p>The sum of those differences over a set and the set's measured size differ when a library
			shares code between languages, or when one language brings another with it, as HTML brings the
			script and style languages. The results page shows the sum beside the measured size for that
			reason.</p> <p>That difference is the price of the <strong>first</strong> language: it includes any runtime
			the language needs that the floor leaves out, which a library pays once. So two more sets
			measure the price of <strong>one more</strong> language: <code>timed</code>, every timed
			language, and <code>without:&lt;lang&gt;</code> </p>`,1),w=t(`<!> <p>For every input of the <!> and every library that claims its language, <code>bench/outputs.ts</code> records what one <code>tokenize</code> call and one <code>html</code> call return:</p> <ul><li><code>tokens</code> — the library's own token count</li> <li><code>output</code> — the HTML's size in UTF-8 bytes, <code>html_bytes</code>, and how many
				elements it has, <code>spans</code></li> <li><code>compressed</code> — the same HTML <code>gzip</code>ped and <code>brotli</code>-compressed at the levels bundle sizes use: what a server sends for a
				page that renders the input highlighted. The HTML is produced again for this, outside the
				check, and must come to the size the check saw.</li></ul> <p>They are taken as a timed cell takes them: a process sets up exactly one language in one
			library, the snippet gate runs, and each input is then checked. A library that fails is
			recorded as excluded with the reason, not counted.</p> <p>Equal sizes don't mean equal output: two libraries, or Shiki's two engines, can return HTML of
			the same size that colors a token differently, and nothing here compares content.</p> <p>Each number is stated once for an input, on the cell whose call returns it: the token count on
			the input's <code>tokenize</code> cell and the output sizes, raw and compressed, on its <code>html</code> cell.</p> <p>What the numbers don't say:</p> <ul><li><strong>Token counts are not comparable as work.</strong> Libraries split the same source
				differently. Shiki counts runs of whitespace and unstyled text, the others count only typed
				tokens, and a container and what it holds may each count. Fewer tokens is less output, not a
				faster library.</li> <li><strong>Classes and inline styles are different HTML.</strong> A class name is short and
				needs a stylesheet. An inline color is repeated on every token and needs none. Compare <code>html_bytes</code> with the theme CSS column beside it. Compression narrows the gap,
				since a repeated color is what it removes best, which is why the compressed sizes are
				recorded too.</li> <li><strong>Wrappers differ.</strong> Twinkleplop and Shiki wrap the output in <code>&lt;pre&gt;</code> and a span for each line, and fuz_code and Prism return bare token
				spans. <code>spans</code> counts every element.</li> <li><strong>Prism's two calls can disagree on Markdown.</strong> Prism highlights the inside of
				a fenced block in a hook that only <code>highlight</code> runs, never <code>tokenize</code>.
				For a fence whose language is loaded, the HTML holds elements the token count doesn't
				include.</li></ul>`,1),T=t(`<!> <p>What <code>npm install</code> of a library adds to a project, in <!>: <code>bench/install.ts</code> walks the runtime
			dependency closure of the adapter's package and each of its separately versioned packages,
			resolving each dependency from the package that needs it as Node resolves it, through this
			repository's <code>node_modules</code>.</p> <ul><li><code>packages</code> — the packages in the closure, each counted once</li> <li><code>files</code> — the files in those packages' directories, less any nested <code>node_modules</code>, whose packages are counted through the closure</li> <li><code>bytes</code> — the sum of those files' sizes as stored, not the disk blocks</li></ul> <p>What the closure follows:</p> <ul><li><code>dependencies</code>, always</li> <li><code>peerDependencies</code> not marked optional, which npm installs as well: fuz_code's
				utility library is one</li> <li><code>optionalDependencies</code> that are installed and not limited to some platforms by <code>os</code>, <code>cpu</code>, or <code>libc</code>. A package with a binary for each
				platform installs one of them on each machine, and counting it would make the figure the
				machine's. No library in the roster has one today.</li> <li>never <code>devDependencies</code></li></ul> <p>Each library is counted whole, on its own, as installing it alone would give: the two Shiki
			adapters install the same package and have the same footprint. npm installs what a package's
			tarball holds, so the footprint is everything the package ships, every language, theme, and
			type declaration included, and not what a page loads.</p> <p>The versions are the ones this repository's lockfile installs, transitive ones included. A
			fresh <code>npm install</code> of the same library may resolve a dependency to a newer version
			within its range, and its footprint then differs. A package is told apart by name and version,
			so one installed twice at the same version counts once. <code>closure</code> is a hash of the
			sorted <code>name@version</code> list: a timed run carries the file only when each library's
			closure is this tree's, and the site names a library whose dependencies moved since a run.</p>`,1),E=t(`<!> <p>What a page or a server holds once a library has loaded one language and highlighted once, in <!>, for every timed language each library claims. <code>bench/heap.ts</code> runs a Node process that imports the library's bundle of that
			language alone, the <code>single:</code> bundle whose size is reported, highlights the
			language's harness snippet once through the adapter's <code>bundle_html_source</code>, lets go
			of the HTML, and runs full collections until one changes the heap by under a kibibyte. It then
			reads three numbers, each in KiB over a bare process of the same module without the import and
			the call:</p> <ul><li><code>retained_kb</code> — the bytes in use in V8's heap, less the two spaces that hold
				machine code</li> <li><code>code_kb</code> — the bytes in use in those two spaces. They hold the regular
				expressions the engine compiled to native code as well as the functions it optimized, so a
				library that lexes with regular expressions holds much of its memory here. Machine code is
				the processor's: the figures are for x64.</li> <li><code>external_kb</code> — <code>process.memoryUsage().external</code>: memory outside the
				V8 heap that V8 is told about, like array buffers, and a WebAssembly engine's linear memory,
				counted at the size it has grown to, which it never gives back. The OS backs only the pages
				it has touched, so resident memory can be lower.</li></ul> <p>The process imports the bundle, not the adapter: some adapters import every language
			statically, and an adapter is TypeScript, which would load Node's type stripper into the
			reading. The generated module holds nothing of the harness, as a cold-start process doesn't.</p> <p>It runs with three flags, for this reading only: the timed cells run with <code>--expose-gc</code> alone, and cold start with none. <code>--expose-gc</code> gives it
			the collections. <code>--max-semi-space-size=16</code> pins the young generation, which V8
			otherwise sizes from the machine's memory, and a small one leaves some libraries holding a
			different amount. <code>--single-threaded</code> keeps the engine from finishing compilation
			on another thread between the collections and the reading, which otherwise moves Shiki's
			figures by kilobytes from one process to the next.</p> <p>A theme in a stylesheet is held by the page, not the library, so a library that writes its
			styles inline holds its theme in these figures and one that writes classes doesn't, as with
			the bundle sizes. The figures are after one highlight of a small snippet; larger inputs leave
			more, most of all for regexp and wasm engines.</p>`,1),D=t(`<!> <p>The coverage matrix is each adapter's language map: <code>true</code> for a language the
			library claims, a footnote where the support is indirect, and no entry for a language it
			doesn't claim, in <!>. The footnotes are written
			once, in the adapters, and <!> lists what they cover.</p>`,1),O=t(`<!> <p>A deterministic file holds no timed value, so it records no machine, no time, no Node version,
			and no commit. The Node version does shape the compressed sizes and the heaps (below), but a
			file naming it would differ between machines that agree, and a commit can't name the tree it
			is itself committed in. What the numbers do depend on is in the file:</p> <ul><li>each library's version, and the versions of its separately versioned packages</li> <li>each library's install closure, as a hash</li> <li>the corpus hash</li> <li>the versions of Vite, of the Rolldown inside it, and of esbuild, and the compression levels,
				in <!></li></ul> <p>Node itself is not recorded, and two of its parts shape the numbers. The gzip and brotli
			sizes, of bundles and of HTML alike, come from the zlib and brotli inside Node, and another
			version of either can compress to a few bytes more or less. The retained heaps follow V8's
			object layout: they are for x64 without pointer compression, as official Node builds are. So
			the file is generated on the Node version the checks run on. The install footprints follow the
			versions the lockfile installs, which a dependency update moves without moving a library's own
			version; the closure hash records them. A failed check says which of these it looks like.</p> <p> <code>≈</code>.</p>`,1),k=t(`<!> <p>A timed run, described in <!>, takes its cells' token counts and output
			sizes from its own processes, by the same check under the same setup. When the deterministic
			file describes the run (the same library versions and extra packages, install closures,
			corpus, and feature sets), the run does two more things:</p> <ul><li>it compares each library's first result on a cell with the file, and stops at a difference</li> <li>it copies the bundle sizes, the install footprints, the retained heaps, and the HTML's
				compressed sizes of its libraries from the file, and measures none of them (cold start
				rebuilds a missing cached bundle, checked against those sizes)</li></ul> <p>The compressed sizes are not compared on their own: the raw size each process reports is, and
			the file applies only at the same install closures, which pin every package that renders the
			HTML, transitive ones included. Compressing every process's HTML again would compress the same
			bytes in every process, for numbers the file already holds.</p> <p>So a timed results file holds the deterministic numbers of its cells and the sizes of its
			libraries, equal to the deterministic file's. When the file doesn't describe the run, a smoke
			or filtered run says so and carries none of those sizes, and a full run with no filters is
			refused before it measures anything: regenerating the file is quick, and the run is long.</p>`,1),A=t(`<!> <p>On every change the repository's check workflow runs <code>gro check</code>, <code>bench:deterministic -- --check</code>, and a smoke run of every library on every cell
			and cold-start scenario. The deterministic check rebuilds every bundle and recounts every
			input, and fails with the places that differ when the committed file is stale. Nothing in the
			workflow is a measurement of speed.</p>`,1),j=t(`<section><p>Some of what the benchmark reports is the same on any machine: how many bytes a library adds
			to a page, what installing it adds to a project, how much memory it holds once loaded, how
			many tokens it finds in an input, how large its HTML is, and which languages it covers. These
			are measured by a command of their own, with nothing timed, and committed as <code>results/deterministic.json</code>.</p> <!> <p>The file goes through the same schema as a timed run, described in <!>, and regenerating it on an unchanged tree changes nothing.</p></section> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!>`,1);function M(t,M){c(M,!0);let N=d(`deterministic`);m(t,{get tome(){return N},children:(t,o)=>{var c=j(),d=l(c),m=a(s(d),2);_(m,{lang:`bash`,dangerous_raw_html:`npm run bench:deterministic             <span class="token_comment"># regenerate results/deterministic.json</span>
npm run bench:deterministic -- --check  <span class="token_comment"># regenerate in memory, and fail if the committed file differs</span>`});var M=a(m,2),N=a(s(M));f(N,{slug:`results`}),i(),u(M),u(d);var P=a(d,2);h(P,{children:(t,n)=>{var r=b(),o=l(r);g(o,{text:`Bundle size`});var c=a(o,2),d=a(s(c));f(d,{slug:`languages`});var m=a(d,4);p(m,{name:`BenchBundleSizes`}),i(),u(c),i(14),e(t,r)},$$slots:{default:!0}});var F=a(P,2);h(F,{children:(t,n)=>{var r=x(),o=l(r);g(o,{text:`Wasm and theme CSS`});var c=a(o,2),d=a(s(c),7);p(d,{name:`BenchByteSizes`}),i(),u(c),i(6),e(t,r)},$$slots:{default:!0}});var I=a(F,2);h(I,{children:(t,n)=>{var r=S(),o=l(r);g(o,{text:`Each bundle is checked`});var c=a(o,4),d=a(s(c),2),p=a(s(d));f(p,{slug:`adapters`}),i(),u(d),u(c),i(2),e(t,r)},$$slots:{default:!0}});var L=a(I,2);h(L,{children:(t,i)=>{var o=C(),c=l(o);g(c,{text:`What a language costs`});var d=a(c,6),f=a(s(d),8);u(d),r(()=>n(f,`, the same less one. Their difference is what a
			language adds to a bundle that already holds the others. It is read in minified bytes and
			never compressed: compression works across a whole bundle, so the difference of two compressed
			bundles doesn't isolate one language's share, and can come out negative. A language the others
			already hold, like JS inside TypeScript, adds nothing there: an addition under
			16 bytes is shown as already included, and a language every library
			already includes has no row.`)),e(t,o)},$$slots:{default:!0}});var R=a(L,2);h(R,{children:(t,n)=>{var r=w(),o=l(r);g(o,{text:`Token counts and output sizes`});var c=a(o,2),d=a(s(c));f(d,{slug:`corpus`}),i(7),u(c),i(12),e(t,r)},$$slots:{default:!0}});var z=a(R,2);h(z,{children:(t,n)=>{var r=T(),o=l(r);g(o,{text:`Install footprint`});var c=a(o,2),d=a(s(c),3);p(d,{name:`BenchInstall`}),i(5),u(c),i(10),e(t,r)},$$slots:{default:!0}});var B=a(z,2);h(B,{children:(t,n)=>{var r=E(),o=l(r);g(o,{text:`Retained heap`});var c=a(o,2),d=a(s(c));p(d,{name:`BenchHeap`}),i(7),u(c),i(8),e(t,r)},$$slots:{default:!0}});var V=a(B,2);h(V,{children:(t,n)=>{var r=D(),o=l(r);g(o,{text:`Coverage`});var c=a(o,2),d=a(s(c),3);p(d,{name:`BenchCoverageEntry`});var m=a(d,2);f(m,{slug:`adapters`}),i(),u(c),e(t,r)},$$slots:{default:!0}});var H=a(V,2);h(H,{children:(t,o)=>{var c=O(),d=l(c);g(d,{text:`What the file records`});var f=a(d,4),m=a(s(f),6),h=a(s(m));p(h,{name:`BenchBundler`}),u(m),u(f);var _=a(f,4),b=s(_);i(2),u(_),r(e=>n(b,`Two heap readings on the same machine agree to well under a kibibyte, but the check allows
			${e??``} or ${y*100}% of the larger,
			whichever is larger, and compares every other number exactly. Regenerating keeps a committed
			reading that agrees, so an unchanged tree regenerates an unchanged file, and a change smaller
			than the tolerance isn't recorded until it, with later ones, exceeds it. The site reads two
			numbers within the tolerance as level, marked `),[()=>v(16384)]),e(t,c)},$$slots:{default:!0}});var U=a(H,2);h(U,{children:(t,n)=>{var r=k(),o=l(r);g(o,{text:`Beside a timed run`});var c=a(o,2),d=a(s(c));f(d,{slug:`method`}),i(),u(c),i(6),e(t,r)},$$slots:{default:!0}});var W=a(U,2);h(W,{children:(t,n)=>{var r=A(),a=l(r);g(a,{text:`Kept current`}),i(2),e(t,r)},$$slots:{default:!0}}),e(t,c)},$$slots:{default:!0}}),o()}export{M as t};