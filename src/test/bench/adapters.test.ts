import { assert, beforeAll, describe, test } from 'vitest';
import { globSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { BenchCoverageEntry, BenchLibrary } from '$lib/results_schema.ts';
import { LangNotSetUpError, type HighlighterAdapter } from '../../../bench/adapter.ts';
import { MIN_SNIPPET_SPAN_KINDS, analyze_html, check_output } from '../../../bench/check_output.ts';
import { load_corpus_manifest, read_corpus_input } from '../../../bench/corpus.ts';
import { LANGS, TIMED_LANGS, is_lang, type Lang } from '../../../bench/langs.ts';
import { ADAPTERS, get_adapter } from '../../../bench/libraries.ts';
import {
	resolve_package_version,
	resolve_theme_css,
	to_bench_coverage,
	to_bench_libraries
} from '../../../bench/library_info.ts';

const claimed_langs = (adapter: HighlighterAdapter): Array<Lang> =>
	LANGS.filter((lang) => Object.hasOwn(adapter.langs, lang));

const corpus = load_corpus_manifest();

/** The harness's own snippet for a language: the micro input every language has. */
const read_snippet = (lang: Lang): string => {
	const input = corpus.inputs.find((i) => i.source === 'harness' && i.lang === lang);
	assert.ok(input, `no harness snippet for lang "${lang}"`);
	return read_corpus_input(input);
};

/** The opening tags of an HTML string, which is where classes and styles live. */
const to_tags = (html: string): Array<string> => html.match(/<[a-zA-Z][^>]*>/g) ?? [];

describe('roster', () => {
	test('adapter ids are unique', () => {
		const ids = ADAPTERS.map((a) => a.id);
		assert.strictEqual(new Set(ids).size, ids.length);
	});

	test('adapter ids are the directories under bench/libraries', () => {
		const directories = readdirSync('bench/libraries', { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
		assert.deepStrictEqual(ADAPTERS.map((a) => a.id).sort(), directories.sort());
		for (const directory of directories) {
			assert.deepStrictEqual(readdirSync(`bench/libraries/${directory}`).sort(), [
				'adapter.ts',
				'notes.md',
				...(directory === 'prism' ? ['prism_modules.d.ts'] : [])
			]);
		}
	});

	test('get_adapter finds each adapter and rejects an unknown id', () => {
		for (const adapter of ADAPTERS) assert.strictEqual(get_adapter(adapter.id), adapter);
		assert.throws(() => get_adapter('highlight_js'), /unknown library "highlight_js"/);
	});

	test('every timed language is claimed by every adapter', () => {
		for (const adapter of ADAPTERS) {
			for (const lang of TIMED_LANGS) {
				assert.ok(Object.hasOwn(adapter.langs, lang), `${adapter.id} doesn't claim "${lang}"`);
			}
		}
	});

	test('the roster and coverage sections match the results schema', () => {
		const libraries = to_bench_libraries(ADAPTERS);
		assert.deepStrictEqual(
			libraries.map((l) => l.id),
			ADAPTERS.map((a) => a.id)
		);
		for (const library of libraries) assert.deepStrictEqual(BenchLibrary.parse(library), library);
		const coverage = to_bench_coverage(ADAPTERS);
		assert.deepStrictEqual(
			Object.keys(coverage),
			ADAPTERS.map((a) => a.id)
		);
		for (const adapter of ADAPTERS) {
			assert.deepStrictEqual(Object.keys(coverage[adapter.id]!), claimed_langs(adapter));
			for (const entry of Object.values(coverage[adapter.id]!)) BenchCoverageEntry.parse(entry);
		}
	});

	test('coverage carries the footnotes', () => {
		const coverage = to_bench_coverage(ADAPTERS);
		assert.deepStrictEqual(coverage.prism!.svelte, {
			via: 'the third-party prism-svelte grammar'
		});
		assert.strictEqual(coverage.prism!.ts, true);
		assert.ok(typeof coverage.fuz_code!.js === 'object');
		assert.strictEqual(coverage.twinkleplop!.xml, undefined);
	});

	test('only the maintainer library is flagged', () => {
		assert.deepStrictEqual(
			ADAPTERS.filter((a) => a.by_maintainer).map((a) => a.id),
			['fuz_code']
		);
	});

	test('a duplicate id and a footnote for an unclaimed language are rejected', () => {
		const [adapter] = ADAPTERS;
		assert.throws(() => to_bench_libraries([adapter!, adapter!]), /duplicate library id/);
		assert.throws(
			() => to_bench_coverage([{ ...ADAPTERS[1]!, via: { xml: 'nope' } }]),
			/without claiming it/
		);
	});
});

describe('browser-safe', () => {
	// an adapter, and what it imports from the harness, runs in a page unchanged
	const files = [
		...globSync('bench/libraries/**/*.ts'),
		'bench/adapter.ts',
		'bench/check_output.ts',
		'bench/langs.ts'
	];

	test('no adapter module uses a Node-only API', () => {
		assert.ok(files.length > ADAPTERS.length);
		for (const file of files) {
			const source = readFileSync(file, 'utf8');
			assert.notMatch(source, /['"]node:/, `${file} imports a node: module`);
			assert.notMatch(
				source,
				/\b(process\.|Buffer\.|require\(|createRequire|__dirname|__filename)/,
				`${file} uses a Node global`
			);
			assert.notMatch(source, /import\.meta\.(url|dirname|filename|resolve)/, file);
		}
	});

	test('an adapter imports only its library, the contract, and types', () => {
		for (const file of globSync('bench/libraries/**/adapter.ts')) {
			const source = readFileSync(file, 'utf8');
			const relative = [...source.matchAll(/from '(\.[^']+)'/g)].map((m) => m[1]);
			for (const specifier of relative) {
				assert.match(
					specifier!,
					/^\.\.\/(\.\.\/(adapter|langs)|shiki)\.ts$/,
					`${file}: ${specifier}`
				);
			}
		}
	});
});

describe.each(ADAPTERS.map((adapter) => ({ id: adapter.id, adapter })))('$id', ({ adapter }) => {
	const langs = claimed_langs(adapter);

	test('its declarations are consistent', () => {
		assert.match(adapter.id, /^[a-z][a-z0-9_]*$/);
		for (const lang of Object.keys(adapter.langs)) assert.ok(is_lang(lang), lang);
		for (const lang of Object.keys(adapter.via)) {
			assert.ok(Object.hasOwn(adapter.langs, lang), `footnote for unclaimed "${lang}"`);
		}
		// class-based output needs a stylesheet, and inline styles need none
		assert.strictEqual(adapter.theme_css === null, adapter.output === 'inline_styles');
	});

	test('its package resolves to a version', () => {
		assert.match(resolve_package_version(adapter.package), /^\d+\.\d+\.\d+/);
	});

	test('its theme stylesheets resolve to non-empty files', () => {
		for (const path of resolve_theme_css(adapter) ?? []) {
			assert.match(path, /\.css$/);
			assert.ok(readFileSync(path, 'utf8').trim().length > 0, path);
		}
	});

	test('its extra packages resolve to versions', () => {
		for (const name of adapter.extra_packages ?? []) {
			assert.match(resolve_package_version(name), /^\d+\.\d+\.\d+/, name);
		}
	});

	// The measured configuration: a cell's process sets up the cell's language and
	// nothing else. Each group below does the same, but a file is one process, so
	// what an earlier group loaded into a library with a global registry (Prism)
	// is still there. `adapters.setup.test.ts` and the `adapters.embed.*` files
	// start from nothing; the strict one-process-per-language run is the harness's.
	describe.each(langs)('%s alone', (lang) => {
		beforeAll(async () => {
			await adapter.setup([lang]);
		});

		test('its snippet clears the snippet gate', () => {
			const result = check_output(adapter, lang, read_snippet(lang), MIN_SNIPPET_SPAN_KINDS);
			assert.ok(result.ok, result.ok ? '' : result.reason);
			assert.ok(Number.isInteger(result.tokens) && result.tokens > 0);
			assert.ok(result.output.html_bytes > 0);
			assert.ok(result.output.spans > 0);
		});

		test('its output is what the adapter declares', () => {
			const tags = to_tags(adapter.html(read_snippet(lang), lang));
			const with_class = tags.filter((tag) => /\sclass="/.test(tag));
			const with_style = tags.filter((tag) => /\sstyle="/.test(tag));
			if (adapter.output === 'classes') {
				assert.ok(with_class.length > 0, 'no class attributes');
				assert.deepStrictEqual(with_style, [], 'inline styles in class-based output');
			} else {
				assert.ok(with_style.filter((tag) => tag.includes('color:')).length > 1, 'no colors');
				// Shiki's classes mark structure only: the block and its lines
				for (const tag of with_class) assert.match(tag, /class="(shiki [^"]*|line)"/);
			}
		});

		test('it is tokenized and rendered the same on every call', () => {
			const src = read_snippet(lang);
			assert.strictEqual(
				adapter.count_tokens(adapter.tokenize(src, lang)),
				adapter.count_tokens(adapter.tokenize(src, lang))
			);
			assert.strictEqual(adapter.html(src, lang), adapter.html(src, lang));
		});

		test('every other language throws, whatever the library has loaded', () => {
			for (const other of LANGS.filter((l) => l !== lang)) {
				const src = read_snippet(other);
				assert.throws(() => adapter.tokenize(src, other), LangNotSetUpError, other);
				assert.throws(() => adapter.html(src, other), LangNotSetUpError, other);
			}
		});

		test('a name libraries render as plain text throws', () => {
			const src = read_snippet(lang);
			for (const name of ['nope', 'text', 'plain', 'plaintext', 'typescript', '__proto__']) {
				assert.throws(() => adapter.tokenize(src, name as Lang), LangNotSetUpError, name);
				assert.throws(() => adapter.html(src, name as Lang), LangNotSetUpError, name);
			}
		});
	});

	test('the output check throws for an unclaimed language rather than excluding it', () => {
		assert.throws(() => check_output(adapter, 'nope' as Lang, 'x'), /doesn't claim/);
	});

	test('setup and bundle_entry reject an unclaimed language', async () => {
		let error: unknown;
		try {
			await adapter.setup(['nope' as Lang]);
		} catch (caught) {
			error = caught;
		}
		assert.ok(error instanceof Error);
		assert.match(error.message, /doesn't claim lang "nope"/);
		assert.throws(() => adapter.bundle_entry(['nope' as Lang]), /doesn't claim lang "nope"/);
		// the failed setup left the language already set up in place
		const last = langs.at(-1)!;
		assert.ok(check_output(adapter, last, read_snippet(last)).ok);
	});

	describe('bundle_entry', () => {
		const directory = `node_modules/.cache/syntax-highlighter-bench/bundle_entry/${adapter.id}/`;
		const to_specifiers = (source: string): Array<string> =>
			[...source.matchAll(/(?:from |import |import\()'([^']+)'/g)].map((m) => m[1]!);

		/** Writes an entry where its bare specifiers resolve, and imports it. */
		const import_entry = async (name: string, source: string): Promise<Record<string, unknown>> => {
			mkdirSync(directory, { recursive: true });
			const path = `${directory}${name}.mjs`;
			writeFileSync(path, source);
			try {
				return await import(/* @vite-ignore */ pathToFileURL(path).href);
			} finally {
				rmSync(path);
			}
		};

		test('with no languages is an importable module: the runtime floor', async () => {
			const source = adapter.bundle_entry([]);
			assert.ok(to_specifiers(source).length > 0);
			assert.ok(Object.keys(await import_entry('core', source)).length > 0);
		});

		test.each(langs)('for %s is an importable module with exports', async (lang) => {
			const source = adapter.bundle_entry([lang]);
			assert.ok(Object.keys(await import_entry(lang, source)).length > 0);
			// a language changes the floor, and imports nothing every language together doesn't
			const specifiers = to_specifiers(source);
			assert.notStrictEqual(source, adapter.bundle_entry([]));
			const all = to_specifiers(adapter.bundle_entry(langs));
			for (const specifier of specifiers) assert.ok(all.includes(specifier), specifier);
		});

		test('for every language is an importable module', async () => {
			const source = adapter.bundle_entry(langs);
			assert.ok(Object.keys(await import_entry('all', source)).length > 0);
			assert.strictEqual(new Set(to_specifiers(source)).size, to_specifiers(source).length);
		});

		test('names a language once however often it is asked for', () => {
			assert.strictEqual(adapter.bundle_entry(['ts', 'ts']), adapter.bundle_entry(['ts']));
		});
	});
});

describe('analyze_html', () => {
	test('counts elements and the kinds of span', () => {
		const html =
			'<pre class="x"><code><span class="a">1</span> <span class="a">2</span><span style="color:red">é</span><span>plain &lt;b&gt;</span></code></pre>';
		const stats = analyze_html(html);
		assert.strictEqual(stats.elements, 6);
		assert.strictEqual(stats.span_kinds, 2);
		// bytes, not characters: the `é` is two
		assert.strictEqual(stats.html_bytes, html.length + 1);
	});

	test('finds nothing in escaped text', () => {
		assert.deepStrictEqual(analyze_html('a &lt;span class="x"&gt; b'), {
			html_bytes: 26,
			elements: 0,
			span_kinds: 0
		});
	});
});
