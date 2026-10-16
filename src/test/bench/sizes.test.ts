import { afterAll, assert, beforeAll, describe, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, constants, gunzipSync, gzipSync } from 'node:zlib';
import * as s from '@fuzdev/fuz_schema/schema.ts';

import { BenchBundler } from '#lib/results_schema.ts';
import { check_bundle } from '../../../bench/bundle_check.ts';
import { MIN_SNIPPET_SPAN_KINDS } from '../../../bench/check_output.ts';
import { ADAPTERS } from '../../../bench/libraries.ts';
import { resolve_theme_css } from '../../../bench/library_info.ts';
import { FEATURE_SETS } from '../../../bench/sets.ts';
import {
	BROTLI_QUALITY,
	GZIP_LEVEL,
	build_bundle,
	find_missing_langs,
	measure_compressed,
	measure_theme_css,
	measure_wasm,
	read_bundler,
	sum_byte_sizes,
	to_bundle_file_name
} from '../../../bench/sizes.ts';

const require = createRequire(import.meta.url);

const get_adapter = (id: string) => {
	const adapter = ADAPTERS.find((a) => a.id === id);
	assert.ok(adapter, `missing adapter "${id}"`);
	return adapter;
};

const get_set = (id: string) => {
	const set = FEATURE_SETS.find((s) => s.id === id);
	assert.ok(set, `missing set "${id}"`);
	return set;
};

describe('measure_compressed', () => {
	const text = 'export const a = "é";\n'.repeat(200);

	test('raw is the UTF-8 size, and the compressed sizes are at the stated levels', () => {
		const bytes = Buffer.from(text, 'utf8');
		assert.ok(bytes.length > text.length);
		assert.deepStrictEqual(measure_compressed(text), {
			raw: bytes.length,
			gzip: gzipSync(bytes, { level: GZIP_LEVEL }).length,
			brotli: brotliCompressSync(bytes, {
				params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY }
			}).length
		});
		// the highest levels: what a build that compresses ahead of time would serve
		assert.strictEqual(GZIP_LEVEL, constants.Z_BEST_COMPRESSION);
		assert.strictEqual(BROTLI_QUALITY, constants.BROTLI_MAX_QUALITY);
	});

	test('is the same every time, and smaller than raw for real text', () => {
		const sizes = measure_compressed(text);
		assert.deepStrictEqual(measure_compressed(text), sizes);
		assert.ok(sizes.gzip < sizes.raw && sizes.brotli < sizes.raw);
		assert.strictEqual(
			gunzipSync(gzipSync(Buffer.from(text), { level: GZIP_LEVEL })).length,
			sizes.raw
		);
	});
});

describe('find_missing_langs', () => {
	test('names what a library lacks of a set, in the set order, and nothing for a set it covers', () => {
		const twinkleplop = get_adapter('twinkleplop');
		assert.deepStrictEqual(find_missing_langs(twinkleplop, get_set('all')), ['xml']);
		assert.deepStrictEqual(find_missing_langs(twinkleplop, get_set('single:xml')), ['xml']);
		assert.deepStrictEqual(find_missing_langs(twinkleplop, get_set('docs')), []);
		assert.deepStrictEqual(find_missing_langs(twinkleplop, get_set('core')), []);
		assert.deepStrictEqual(
			find_missing_langs({ langs: { ts: 'ts' } }, { langs: ['rust', 'ts', 'css'] }),
			['rust', 'css']
		);
	});

	test('every library covers the core set, and a set is unsupported only for a language it lacks', () => {
		for (const adapter of ADAPTERS) {
			for (const set of FEATURE_SETS) {
				const missing = find_missing_langs(adapter, set);
				assert.ok(missing.every((lang) => !Object.hasOwn(adapter.langs, lang)));
				assert.ok(missing.every((lang) => set.langs.includes(lang)));
				if (set.langs.length === 0) assert.deepStrictEqual(missing, []);
			}
		}
	});
});

describe('to_bundle_file_name', () => {
	test('is the set id made safe as a file name, and distinct for every set', () => {
		assert.strictEqual(to_bundle_file_name('core'), 'core.mjs');
		assert.strictEqual(to_bundle_file_name('single:ts'), 'single_ts.mjs');
		assert.strictEqual(to_bundle_file_name('../x'), '___x.mjs');
		const names = FEATURE_SETS.map((set) => to_bundle_file_name(set.id));
		assert.strictEqual(new Set(names).size, names.length);
	});
});

describe('the wasm column', () => {
	test('is null for a library without wasm, and the binary measured like the JS for one with it', () => {
		for (const adapter of ADAPTERS) {
			const sizes = measure_wasm(adapter);
			if (adapter.wasm) {
				assert.deepStrictEqual(
					sizes,
					sum_byte_sizes(
						adapter.wasm.map((w) => measure_compressed(readFileSync(require.resolve(w.binary))))
					),
					adapter.id
				);
				assert.strictEqual(
					sizes!.raw,
					adapter.wasm.reduce((sum, w) => sum + statSync(require.resolve(w.binary)).size, 0)
				);
				assert.ok(sizes!.gzip < sizes!.raw && sizes!.brotli < sizes!.raw);
			} else {
				assert.strictEqual(sizes, null, adapter.id);
			}
		}
		assert.deepStrictEqual(
			ADAPTERS.filter((a) => a.wasm).map((a) => a.id),
			['shiki_wasm']
		);
	});

	test('a wasm import is one every bundle entry of the library makes, and holds its binary', async () => {
		for (const adapter of ADAPTERS) {
			for (const wasm of adapter.wasm ?? []) {
				for (const set of FEATURE_SETS) {
					if (find_missing_langs(adapter, set).length > 0) continue;
					assert.ok(
						adapter.bundle_entry(set.langs).includes(`import('${wasm.import}')`),
						`${adapter.id} ${set.id}`
					);
				}
				// the import carries exactly this binary, inlined as text
				const binary = readFileSync(require.resolve(wasm.binary));
				assert.strictEqual(binary.subarray(0, 4).toString('latin1'), '\0asm');
				const inlined: { wasmBinary: Uint8Array } = await import(wasm.import);
				assert.ok(Buffer.from(inlined.wasmBinary).equals(binary));
			}
		}
	});
});

describe('the theme CSS column', () => {
	test('is null exactly for a library that writes its styles inline', async () => {
		for (const adapter of ADAPTERS) {
			const bytes = await measure_theme_css(adapter);
			assert.strictEqual(bytes === null, adapter.output === 'inline_styles', adapter.id);
		}
	});

	test('is the minified stylesheets, each measured raw and compressed, summed', async () => {
		for (const adapter of ADAPTERS) {
			const paths = resolve_theme_css(adapter);
			if (paths === null) continue;
			const shipped = paths.reduce((sum, path) => sum + statSync(path).size, 0);
			const sizes = await measure_theme_css(adapter);
			assert.ok(sizes !== null && sizes.raw > 0 && sizes.raw <= shipped, adapter.id);
			assert.ok(sizes.gzip < sizes.raw && sizes.brotli < sizes.raw, adapter.id);
			assert.deepStrictEqual(await measure_theme_css(adapter), sizes);
		}
	});

	test('every library says which color schemes its default theme covers', () => {
		assert.deepStrictEqual(
			ADAPTERS.map((a) => [a.id, a.theme_schemes]),
			[
				['twinkleplop', ['light', 'dark']],
				['prism', ['light']],
				['shiki_js', ['light']],
				['shiki_wasm', ['light']],
				['fuz_code', ['light', 'dark']]
			]
		);
	});
});

describe('sum_byte_sizes', () => {
	test('sums files served apart, and is null for none', () => {
		assert.strictEqual(sum_byte_sizes([]), null);
		assert.deepStrictEqual(
			sum_byte_sizes([
				{ raw: 10, gzip: 8, brotli: 7 },
				{ raw: 100, gzip: 30, brotli: 20 }
			]),
			{ raw: 110, gzip: 38, brotli: 27 }
		);
	});
});

describe('read_bundler', () => {
	test('records the versions the sizes depend on, and the compression levels', async () => {
		const bundler = s.parse_or_throw(BenchBundler, await read_bundler());
		assert.strictEqual(bundler.vite, require('vite/package.json').version);
		// the versions installed, never the stand-ins Vite 8 still exports as `rollupVersion` and
		// `esbuildVersion`
		const require_from_vite = createRequire(require.resolve('vite/package.json'));
		assert.ok('rolldown' in bundler);
		assert.strictEqual(bundler.rolldown, require_from_vite('rolldown/package.json').version);
		assert.strictEqual(bundler.esbuild, require('esbuild/package.json').version);
		assert.strictEqual(bundler.gzip_level, GZIP_LEVEL);
		assert.strictEqual(bundler.brotli_quality, BROTLI_QUALITY);
	});
});

// The only tests that run a real build: the smallest library, a language or two.
describe('build_bundle', () => {
	const adapter = get_adapter('fuz_code');
	let dir: string;
	let code: string;
	let node_env: string | undefined;

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), 'bench_sizes_test_'));
		node_env = process.env.NODE_ENV;
		code = await build_bundle(adapter.bundle_entry(['json']));
	});

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	test('builds one minified ES module, with no path of this machine in it', () => {
		assert.ok(code.length > 0);
		assert.match(code, /export\{/);
		assert.ok(!code.includes('sourceMappingURL'));
		assert.ok(!code.includes(process.cwd()));
		// minified whole: no indentation survives
		assert.ok(!/\n[\t ]+\S/.test(code));
		// the build ran as a production one and left the environment as it was
		assert.strictEqual(process.env.NODE_ENV, node_env);
	});

	test('builds the same bytes again', async () => {
		assert.strictEqual(await build_bundle(adapter.bundle_entry(['json'])), code);
	});

	test('the bundle highlights its language through its exports', async () => {
		const path = join(dir, 'single_json.mjs');
		writeFileSync(path, code);
		const result = await check_bundle({ library: adapter.id, langs: ['json'], path });
		assert.deepStrictEqual(result.exports, ['syntax_styler']);
		assert.ok(result.span_kinds.json! >= MIN_SNIPPET_SPAN_KINDS);
	});

	test('a bundle without the language fails its check', async () => {
		// what a build that shook the language away would leave: the styler, and plain text out
		const path = join(dir, 'hollow.mjs');
		writeFileSync(path, 'export const syntax_styler = { stylize: (text) => text };\n');
		let error: unknown;
		try {
			await check_bundle({ library: adapter.id, langs: ['json'], path });
		} catch (caught) {
			error = caught;
		}
		assert.ok(error instanceof Error);
		assert.match(error.message, /the language is not in the bundle/);
		// and one that exports nothing fails before any language is tried
		const empty = join(dir, 'empty.mjs');
		writeFileSync(empty, 'export {};\n');
		let empty_error: unknown;
		try {
			await check_bundle({ library: adapter.id, langs: [], path: empty });
		} catch (caught) {
			empty_error = caught;
		}
		assert.ok(empty_error instanceof Error);
		assert.match(empty_error.message, /exports nothing/);
	});

	test('a bundle of one language that lost a language it embeds fails its check', async () => {
		// HTML with the markup lexer alone: it clears the floor, and is much smaller than the real one
		const starved = await build_bundle(
			[
				`import { SyntaxStyler } from '@fuzdev/fuz_code/syntax_styler.js';`,
				`import { lexer_markup } from '@fuzdev/fuz_code/lexer_markup.js';`,
				'export const syntax_styler = new SyntaxStyler();',
				'syntax_styler.add_lang(lexer_markup);',
				''
			].join('\n')
		);
		const path = join(dir, 'starved_html.mjs');
		writeFileSync(path, starved);
		let error: unknown;
		try {
			await check_bundle({ library: adapter.id, langs: ['html'], path });
		} catch (caught) {
			error = caught;
		}
		assert.ok(error instanceof Error);
		assert.match(error.message, /renders the html snippet differently from fuz_code/);
	});

	test('refuses an import it was told to leave out that the entry never makes', async () => {
		let error: unknown;
		try {
			await build_bundle('export const a = 1;\n', ['shiki/wasm']);
		} catch (caught) {
			error = caught;
		}
		assert.ok(error instanceof Error);
		assert.match(error.message, /never imports "shiki\/wasm"/);
	});
});
