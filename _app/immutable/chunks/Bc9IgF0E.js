import{B as e,D as t,F as n,K as r,L as i,bt as a,ft as o,ht as s,it as c,mt as l,ot as u,rt as d,yt as f}from"./DR8oD0rm.js";import{n as p,r as m,t as h}from"./bvaZRDbI.js";import{t as g}from"./CaQk44lo.js";import{t as _}from"./BmzMvine.js";import{t as v}from"./qvr_EUua.js";import{n as y}from"./DL-znCFA.js";import{t as b}from"./CEgJNfnh.js";var x=i(`<!> <ul><li><!> — where the numbers came from: <ul><li>the machine, Node version, commit, and corpus hash</li> <li>the kind of run and how it measured, in <!>: the retries
						it allowed, how cold start was sampled, how many segments it was measured in, and the
						load average it started at</li> <li>the roster of libraries, with their versions and the color schemes their default themes
						cover</li> <li>what was excluded: from cells in the excluded list, and from cold-start scenarios in <code>startup_excluded</code>, in <!></li> <li>the anchor's drift, the machine's noise floor, and the run's own process noise from
						every pair of a value's passes, in <!></li> <li>what built the bundles and the compression levels of every compressed size, in <!></li></ul></li> <li><!> and <!> — the language
				ids and feature sets of the run, described in <!></li> <li><!> — the inputs the run measured, each with its source,
				size tier, hash, and provenance, as in the <!> manifest</li> <li><!> — one input measured in one mode, with each library's
				numbers. Its id is <code>&lt;file&gt;:&lt;mode&gt;</code>. A <code>tokenize</code> cell
				states the token counts and an <code>html</code> cell the output sizes, with the HTML's
				compressed sizes in <!>, so each is stated once
				for an input. Each value carries <code>attempts</code>: how many times the library was
				measured there, more than 1 when its rounds disagreed and it was retried. A retried value's
				spread and percentiles are those of the attempt that was kept. Each value also carries <code>pass_medians_ns</code>, the kept attempt's median for each pass, so the processes'
				disagreement can be recomputed from the file</li> <li><!> — one cold-start scenario: what a fresh process
				loaded (<code>bare</code>, <code>core</code>, <code>lang</code>, <code>set</code>, or <code>first_highlight</code>), for which library, with which language or feature set, and
				whether as one bundled chunk. Its numbers are the median time since the process started, the
				10th and 90th percentile, the spread, how many samples were kept, and the processes' median
				peak resident size. The one <code>bare</code> entry, with no library, is the Node baseline
				every other entry includes</li> <li><!> — for each library over each feature set, its
				bundle sizes in <!>, or the languages of the set it
				lacks. The sizes are the JS's, with the wasm and the theme CSS each measured apart</li> <li><!> — for each library, what <code>npm install</code> of
				it adds: the packages of its runtime dependency closure, their files, those files' bytes,
				and a hash of the closure's <code>name@version</code> list</li> <li><!> — for each library and each timed language it claims,
				what it holds once that language is loaded and highlighted once: the V8 heap less machine
				code, the machine code, and the external memory beside it, in KiB</li> <li><!> — which languages each library claims, with a
				footnote where the support is indirect</li></ul> <p>The file describes itself. The libraries, languages, sets, and inputs are lists inside it, and
			every other section refers to them by id, or by file for inputs, so the site needs no list of
			its own and adding a library changes no site code.</p>`,1),S=i(`<!> <p><strong>Machine-dependent</strong> numbers come from timing on one named machine and mean
			nothing apart from it: throughput and memory in each cell's <code>values</code>, and the <code>startup</code> section.</p> <p><strong>Deterministic</strong> numbers come out the same anywhere: token counts and output
			sizes in each cell's <code>tokens</code>, <code>output</code>, and <code>compressed</code>,
			plus <code>bundle</code>, <code>install</code>, <code>heap</code>, and <code>coverage</code>.
			The retained heaps are deterministic for a Node version and platform, within the tolerance <!> gives.</p> <p>A file may hold only the deterministic ones. It then has no <code>meta.run</code> and no
			anchor, and its <code>generated_at</code>, <code>machine</code>, <code>node</code>, and <code>commit</code> are null: they say where timed numbers came from, and are required as soon
			as a file has any. A timed run carries the deterministic numbers too, so one published file
			holds both.</p>`,1),C=i(`<!> <p><code>meta.run</code> tells a publishable run from the rest. Its <code>kind</code> is <code>full</code>, <code>smoke</code>, or <code>calibrate</code>, and its <code>filters</code> are null unless the run was restricted to some libraries, languages, sizes, modes, sources, or
			metrics (the timed cells, or cold start). A smoke run's numbers mean nothing, and a
			calibration exists for its noise floor.</p> <p><!> is the test for a result: a full run
			with no filters and no gap in its cells or its cold start, a stable anchor, a noise floor
			carried from the machine's calibration, and a commit that records everything that ran.</p> <p>No filters is what a run set out to cover. Whether the file then holds all of it is checked by <!>, from the file alone:</p> <ul><li>in every cell, each library of the roster that claims the cell's language has a value, or an
				entry in the excluded list for that cell</li> <li>every listed input of a timed language has a cell in each mode the file's cells use</li></ul> <p>A full run's cold start is checked the same way, by <!>. Each of these has an entry or an
			exclusion:</p> <ul><li>the <code>bare</code> baseline</li> <li>for each library of the roster, unbundled and bundled: <code>core</code>; <code>lang</code> and <code>first_highlight</code> for every timed language it claims; and <code>set</code> for every feature set the file's cold start names whose languages it all claims</li></ul> <p>A file with no filters and a gap doesn't parse, whether it is a full run or a calibration, so
			a run that silently lost a library can't pass as complete. A calibration measures no cold
			start, so only its cells are checked. A filtered or smoke run lists what it has and may have
			gaps. Two things the file can't show are an input missing altogether and a whole mode missing:
			its inputs and modes are the ones that were measured, and only the corpus hash names the
			corpus they came from. A third is a cold-start set missing altogether: the sets a <code>set</code> scenario covers are read from the file too, so a file with every <code>set</code> entry removed still reads as complete.</p> <p>A run that was stopped and resumed is a result like any other. <code>meta.run.segments</code> says how many stretches it was measured in, and its anchor covers every one of them, as <!> describes.</p> <p><code>meta.commit</code> ends in <code>-dirty</code> when the working tree had changes the
			commit doesn't record, and such a run can't be reproduced from its commit.</p>`,1),w=i(`<!> <p>The site is built from one results file, parsed through the schema when the site is built, so
			a malformed file fails the build and no number reaches a page unchecked:</p> <ul><li><code>results/latest.json</code>, the latest published timed run, when it exists: <code>npm run results:publish</code> copies a run there once it passes the test below. It
				carries its own bundle sizes, install footprints, retained heaps, token counts, and output
				sizes, so every number on a page is from one file.</li> <li>otherwise <code>results/deterministic.json</code>. The pages then show the deterministic
				numbers, and say that no timed results are published where a timed number would be. A
				deterministic file that holds a timed number fails the build.</li></ul> <p>A latest run must pass <!>, or the build
			fails and says why. A smoke run, a calibration, a filtered run, a run with a gap, a run from a
			commit with uncommitted changes, a run whose anchor drifted, and a run with no noise floor are
			never shown as results. A drifted run is measured again, not published under a warning.</p> <p>A published run is also held against the deterministic file. When the two describe the same
			library versions, the same install closures, the same corpus, and the same bundler and
			compression levels, their deterministic numbers must be equal: the feature sets, the coverage,
			the bundle sizes, the install footprints, and each cell's token counts and output sizes, raw
			and compressed. A difference fails the build and names the first place they differ. The
			retained heaps are compared within the check's tolerance instead, and never fail the build.
			When a library's version, its dependencies, the corpus, or what built and compressed the
			bundles (the versions of Vite, of the bundler inside it, and of esbuild, and the compression
			levels) has moved since the run, or the retained heaps differ by more, as they do when the
			Node version moves, the run is shown as the snapshot it is, and the line that says where the
			numbers came from also says what has moved since.</p> <p>The fixture run the tests use holds invented numbers. A build renders it only when the <code>BENCH_RESULTS_FIXTURE</code> environment variable is <code>1</code>, which is for
			working on the pages before a run exists, and every page of such a build is marked as fixture
			data. A build without the variable never reads the file.</p>`,1),T=i(`<!> <p>Beyond the shape of each section, parsing checks that the sections agree:</p> <ul><li>every id is unique and refers to a listed entry, except the library a home input came from,
				which may be outside the run</li> <li>every cell names a listed input and describes it as that entry does, no two cells measure
				the same input in the same mode, and no cell covers an untimed language</li> <li>an input written for the benchmark has no provenance, a verbatim copy has the hash its one
				pin records, a derived stress input names its derivation, and an input built from several
				files is marked synthetic</li> <li>a run with timed numbers records its anchor, when it started, its machine, Node version, and
				commit, and how its numbers were measured</li> <li>a run's filters describe the file, and a run with no filters has no gap, as above</li> <li>a library has no numbers for a language it doesn't claim, and one excluded from a cell or a
				cold-start scenario claims its languages and has no numbers there</li> <li>each deterministic number sits on the cell whose call returns it, and a library with a timed
				value in a cell has that cell's deterministic number</li> <li>a bundle entry holds sizes only when the library claims every language of the set, and
				otherwise names exactly the languages it lacks</li> <li>the bundle sizes, install footprints, retained heaps, and the HTML's compressed sizes are
				present together, for every library, or absent together</li> <li>every number is internally consistent: percentiles in order, as many pass medians and
				cold-start samples as the run says, no more attempts than its retries allow, and no
				compressed size larger than the raw one plus the format's own overhead</li></ul> <p>Use <!> to validate a file and get every problem in
			one message.</p>`,1),E=i(`<section><p>A run of the benchmark is one JSON file. The harness writes it and the site reads it, and both
			go through the same schema, <!> in <!>, so a malformed run fails loudly instead of
			rendering blanks. The schema is strict: an unknown key is an error.</p> <p><code>bench/run.ts</code> writes one for a timed run, as <!> describes,
			and <code>bench/deterministic.ts</code> writes the committed <code>results/deterministic.json</code>, which holds only the numbers that are the same on any
			machine, as <!> describes. <!></p></section> <!> <!> <!> <!> <!>`,1);function D(i,D){s(D,!0);let O=y(`results`),k=b.get(),A=o(k);m(i,{get tome(){return O},children:(i,o)=>{var s=E(),l=c(s),m=d(l),y=u(d(m));v(y,{name:`BenchResults`});var b=u(y,2);_(b,{module_path:`results_schema.ts`}),f(),a(m);var D=u(m,2),O=u(d(D),2);g(O,{slug:`method`});var k=u(O,6);g(k,{slug:`deterministic`});var j=u(k,2),M=t=>{var r=e(`No timed run has been published yet, so that file is the one this site renders.`);n(t,r)};t(j,e=>{r(A).source===`deterministic`&&e(M)}),a(D),a(l);var N=u(l,2);p(N,{children:(e,t)=>{var r=x(),i=c(r);h(i,{text:`Sections`});var o=u(i,2),s=d(o),l=d(s);v(l,{name:`BenchMeta`});var p=u(l,2),m=u(d(p),2),_=u(d(m));v(_,{name:`BenchRun`}),f(),a(m);var y=u(m,4),b=u(d(y),3);v(b,{name:`BenchStartupExcluded`}),a(y);var S=u(y,2),C=u(d(S));v(C,{name:`BenchProcessNoise`}),a(S);var w=u(S,2),T=u(d(w));v(T,{name:`BenchBundler`}),a(w),a(p),a(s);var E=u(s,2),D=d(E);v(D,{name:`BenchLang`});var O=u(D,2);v(O,{name:`BenchSet`});var k=u(O,2);g(k,{slug:`languages`}),a(E);var A=u(E,2),j=d(A);v(j,{name:`BenchInput`});var M=u(j,2);g(M,{slug:`corpus`}),f(),a(A);var N=u(A,2),P=d(N);v(P,{name:`BenchCell`});var F=u(P,8);v(F,{name:`BenchCellCompressed`}),f(5),a(N);var I=u(N,2),L=d(I);v(L,{name:`BenchStartup`}),f(13),a(I);var R=u(I,2),z=d(R);v(z,{name:`BenchBundleEntry`});var B=u(z,2);v(B,{name:`BenchBundleSizes`}),f(),a(R);var V=u(R,2),H=d(V);v(H,{name:`BenchInstall`}),f(5),a(V);var U=u(V,2),W=d(U);v(W,{name:`BenchHeap`}),f(),a(U);var G=u(U,2),K=d(G);v(K,{name:`BenchCoverageEntry`}),f(),a(G),a(o),f(2),n(e,r)},$$slots:{default:!0}});var P=u(N,2);p(P,{children:(e,t)=>{var r=S(),i=c(r);h(i,{text:`Two classes of number`});var o=u(i,4),s=u(d(o),16);g(s,{slug:`deterministic`}),f(),a(o),f(2),n(e,r)},$$slots:{default:!0}});var F=u(P,2);p(F,{children:(e,t)=>{var r=C(),i=c(r);h(i,{text:`Publishable or not`});var o=u(i,4),s=d(o);v(s,{name:`bench_results_is_publishable`}),f(),a(o);var l=u(o,2),p=u(d(l));v(p,{name:`bench_results_find_gaps`}),f(),a(l);var m=u(l,4),_=u(d(m));v(_,{name:`bench_results_find_startup_gaps`}),f(),a(m);var y=u(m,6),b=u(d(y),3);g(b,{slug:`method`}),f(),a(y),f(2),n(e,r)},$$slots:{default:!0}});var I=u(F,2);p(I,{children:(e,t)=>{var r=w(),i=c(r);h(i,{text:`What the site renders`});var o=u(i,6),s=u(d(o));v(s,{name:`bench_results_is_publishable`}),f(),a(o),f(4),n(e,r)},$$slots:{default:!0}});var L=u(I,2);p(L,{children:(e,t)=>{var r=T(),i=c(r);h(i,{text:`Consistency checks`});var o=u(i,6),s=u(d(o));v(s,{name:`parse_bench_results`}),f(),a(o),n(e,r)},$$slots:{default:!0}}),n(i,s)},$$slots:{default:!0}}),l()}export{D as t};