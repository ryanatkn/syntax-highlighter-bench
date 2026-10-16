import { assert, describe, test } from 'vitest';
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as s from '@fuzdev/fuz_schema/schema.ts';

import { BenchInput } from '#lib/results_schema.ts';
import {
	CORPUS_DIR,
	CORPUS_INPUTS_PATH,
	CORPUS_MANIFEST_PATH,
	CorpusManifest,
	CorpusManifestSeed,
	SIZE_TIER_LIMITS,
	build_corpus_manifest,
	count_lines,
	hash_corpus,
	hash_sha256,
	load_corpus_manifest,
	parse_corpus_path,
	read_corpus_input,
	render_corpus_inputs,
	serialize_corpus_manifest,
	to_size_tier
} from '../../../bench/corpus.ts';
import { to_raw_url } from '../../../bench/corpus_fetch.ts';
import {
	SVELTE_HARVEST_FILE,
	SVELTE_HARVEST_SHA256,
	SVELTE_HARVEST_SOURCES,
	harvest_svelte,
	split_svelte_blocks
} from '../../../bench/corpus_harvest_svelte.ts';
import { LANGS, TIMED_LANGS, is_lang } from '../../../bench/langs.ts';
import { ADAPTERS } from '../../../bench/libraries.ts';

const manifest_text = readFileSync(CORPUS_MANIFEST_PATH, 'utf8');
const manifest = load_corpus_manifest();
const { inputs } = manifest;

const SHIKI_REPO = 'https://github.com/shikijs/textmate-grammars-themes';
const SHIKI_COMMIT = '45e292ef67d3a55911dfd02a5039dc238a07040c';

describe('the manifest and the disk', () => {
	const built = build_corpus_manifest(
		s.parse_or_throw(CorpusManifestSeed, JSON.parse(manifest_text)).inputs
	);

	test('the corpus has no problems', () => {
		assert.deepStrictEqual(built.problems, []);
		assert.deepStrictEqual(built.dropped, []);
	});

	test('the manifest is what the files on disk build', () => {
		// every file on disk is listed, every listed file is on disk, and each
		// size, line count, hash, and tier is the file's own
		assert.deepStrictEqual(
			built.manifest.inputs.map((i) => i.file),
			inputs.map((i) => i.file)
		);
		assert.strictEqual(serialize_corpus_manifest(built.manifest), manifest_text);
	});

	test('the corpus hash is derived from the inputs', () => {
		assert.strictEqual(manifest.corpus_hash, hash_corpus(inputs));
	});

	test('the table of inputs is what the manifest renders', () => {
		assert.strictEqual(readFileSync(CORPUS_INPUTS_PATH, 'utf8'), render_corpus_inputs(manifest));
	});

	test('every input reads as the text its entry describes', () => {
		for (const input of inputs) {
			const text = read_corpus_input(input);
			assert.strictEqual(Buffer.byteLength(text), input.bytes, input.file);
			assert.strictEqual(hash_sha256(text), input.sha256, `${input.file} is not UTF-8`);
		}
	});
});

describe('entries', () => {
	test('every entry matches the schema and names a known lang', () => {
		s.parse_or_throw(CorpusManifest, JSON.parse(manifest_text));
		for (const input of inputs) {
			assert.deepStrictEqual(s.parse_or_throw(BenchInput, input), input);
			assert.ok(is_lang(input.lang), input.file);
		}
	});

	test('files are unique, and the path says what the entry does', () => {
		assert.strictEqual(new Set(inputs.map((i) => i.file)).size, inputs.length);
		for (const input of inputs) {
			const info = parse_corpus_path(input.file);
			assert.ok(info, input.file);
			assert.deepStrictEqual(
				info,
				{ source: input.source, home: input.home, lang: input.lang },
				input.file
			);
		}
	});

	test('every tier is the one the file size falls in', () => {
		for (const input of inputs) {
			assert.strictEqual(input.size, to_size_tier(input.bytes), input.file);
		}
	});

	test('a home input names a measured library', () => {
		const ids = ADAPTERS.map((a) => a.id);
		const homes = new Set(inputs.filter((i) => i.source === 'home').map((i) => i.home!));
		assert.ok(homes.size > 0);
		for (const home of homes) assert.ok(ids.includes(home), home);
	});

	test('a copied input is the pinned upstream file, byte for byte', () => {
		for (const input of inputs.filter((i) => i.provenance.length === 1 && i.derivation === null)) {
			assert.strictEqual(input.provenance[0]!.sha256, input.sha256, input.file);
		}
	});

	test('a harness input is a micro snippet, and every language has one', () => {
		const harness = inputs.filter((i) => i.source === 'harness');
		for (const input of harness) {
			assert.strictEqual(input.size, 'micro', input.file);
			assert.deepStrictEqual(input.provenance, []);
			assert.ok(!input.synthetic);
		}
		assert.deepStrictEqual(new Set(harness.map((i) => i.lang)), new Set(LANGS));
	});

	test("the shiki inputs are Shiki's samples at one pinned commit", () => {
		const shiki = inputs.filter((i) => i.source === 'shiki');
		assert.deepStrictEqual(new Set(shiki.map((i) => i.lang)), new Set(TIMED_LANGS));
		for (const input of shiki) {
			const [pin, ...rest] = input.provenance;
			assert.deepStrictEqual(rest, []);
			assert.strictEqual(pin!.repo, SHIKI_REPO);
			assert.strictEqual(pin!.commit, SHIKI_COMMIT);
			assert.match(pin!.path, /^samples\/[a-z]+\.sample$/);
			assert.strictEqual(pin!.sha256, input.sha256, input.file);
			assert.ok(!input.synthetic);
		}
	});

	test('the neutral inputs cover every timed language at three sizes, pinned', () => {
		const neutral = inputs.filter((i) => i.source === 'neutral');
		for (const lang of TIMED_LANGS) {
			assert.deepStrictEqual(
				neutral
					.filter((i) => i.lang === lang)
					.map((i) => i.size)
					.sort(),
				['large', 'medium', 'small'],
				lang
			);
		}
		const measured = ['fuz_code', 'twinkleplop', 'prism', 'shiki'];
		for (const input of neutral) {
			assert.ok(input.provenance.length > 0, input.file);
			assert.strictEqual(input.synthetic, input.provenance.length > 1, input.file);
			for (const pin of input.provenance) {
				assert.match(pin.repo, /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
				assert.match(pin.commit, /^[0-9a-f]{40}$/);
				assert.ok(pin.path.length > 0);
				assert.ok(pin.license.length > 0);
				// neutral means no measured library authored it
				for (const name of measured) assert.ok(!pin.repo.toLowerCase().includes(name), pin.repo);
			}
		}
	});

	test('the neutral notice names every upstream and holds the license texts on hand', () => {
		const notice = readFileSync(CORPUS_DIR + 'neutral/NOTICE.md', 'utf8');
		const repos = new Set(
			inputs.filter((i) => i.source === 'neutral').flatMap((i) => i.provenance.map((p) => p.repo))
		);
		for (const repo of repos) assert.ok(notice.includes(repo), `the notice lacks ${repo}`);
		const texts = [...notice.matchAll(/\]\((licenses\/[^)]+)\)/g)].map((m) => m[1]!);
		// one row for each upstream, each with its text
		assert.ok(texts.length >= repos.size);
		for (const file of texts) assert.ok(existsSync(CORPUS_DIR + 'neutral/' + file), file);
		assert.ok(existsSync(CORPUS_DIR + 'shiki/LICENSE'));
	});
});

describe('the harvested svelte input', () => {
	test('lists the components it is built from as its provenance', () => {
		const input = inputs.find((i) => i.file === SVELTE_HARVEST_FILE);
		assert.ok(input);
		assert.ok(input.synthetic);
		assert.strictEqual(input.sha256, SVELTE_HARVEST_SHA256);
		assert.strictEqual(input.size, 'large');
		assert.deepStrictEqual(input.provenance, [...SVELTE_HARVEST_SOURCES]);
		const paths = SVELTE_HARVEST_SOURCES.map((s) => `${s.repo}/${s.path}`);
		assert.strictEqual(new Set(paths).size, paths.length);
		// none of them is also a neutral input of its own
		const others = inputs.filter((i) => i.source === 'neutral' && i !== input);
		for (const other of others) {
			for (const pin of other.provenance) assert.ok(!paths.includes(`${pin.repo}/${pin.path}`));
		}
	});

	test('names every component in the file, block by block', () => {
		const text = read_corpus_input(inputs.find((i) => i.file === SVELTE_HARVEST_FILE)!);
		for (const { path } of SVELTE_HARVEST_SOURCES) {
			assert.ok(text.includes(`<!-- ${path} -->`), path);
			assert.ok(text.includes(`// ${path}`), path);
		}
		// one of each block at the top level
		assert.strictEqual(text.match(/^<script lang="ts" module>$/gm)?.length, 1);
		assert.strictEqual(text.match(/^<script lang="ts">$/gm)?.length, 1);
		assert.strictEqual(text.match(/^<style>$/gm)?.length, 1);
	});

	const A = `<script lang="ts" module>\n\texport const a = 1;\n</script>\n\n<script lang="ts">\n\tlet x = $state(0);\n</script>\n\n<p>{x}</p>\n\n<style>\n\tp {\n\t\tcolor: red;\n\t}\n</style>\n`;
	const B = `<script lang="ts">\n\tlet y = 2;\n</script>\n\n<div>\n\t<script>\n\t\tnested();\n\t</script>\n\t{y}\n</div>\n`;

	test('split_svelte_blocks separates the top-level blocks', () => {
		assert.deepStrictEqual(split_svelte_blocks(A, 'A'), {
			module_script: '\texport const a = 1;\n',
			instance_script: '\tlet x = $state(0);\n',
			markup: '<p>{x}</p>\n',
			style: '\tp {\n\t\tcolor: red;\n\t}\n'
		});
		const b = split_svelte_blocks(B, 'B');
		assert.strictEqual(b.module_script, null);
		assert.strictEqual(b.style, null);
		// a nested script is markup
		assert.ok(b.markup.includes('nested();'));
	});

	test('split_svelte_blocks fails loudly on what it cannot join', () => {
		assert.throws(() => split_svelte_blocks(B + B, 'BB'), /more than one instance_script/);
		assert.throws(
			() => split_svelte_blocks('<script lang="ts" generics="T">\n</script>\n', 'G'),
			/unsupported script attributes/
		);
		assert.throws(() => split_svelte_blocks('<script>\n</script>\n', 'JS'), /unsupported script/);
		assert.throws(
			() => split_svelte_blocks('<style>\n</style>\n<style>\n</style>\n', 'S'),
			/more than one style/
		);
	});

	test('harvest_svelte joins components into one of each block, bodies verbatim', () => {
		assert.strictEqual(
			harvest_svelte([
				{ path: 'a/A.svelte', source: A },
				{ path: 'b/B.svelte', source: B }
			]),
			`<script lang="ts" module>\n\t// a/A.svelte\n\texport const a = 1;\n</script>\n\n` +
				`<script lang="ts">\n\t// a/A.svelte\n\tlet x = $state(0);\n\n\t// b/B.svelte\n\tlet y = 2;\n</script>\n\n` +
				`<!-- a/A.svelte -->\n<p>{x}</p>\n\n` +
				`<!-- b/B.svelte -->\n<div>\n\t<script>\n\t\tnested();\n\t</script>\n\t{y}\n</div>\n\n` +
				`<style>\n\t/* a/A.svelte */\n\tp {\n\t\tcolor: red;\n\t}\n</style>\n`
		);
	});
});

describe('helpers', () => {
	test('to_size_tier splits at the documented limits', () => {
		assert.deepStrictEqual(
			SIZE_TIER_LIMITS.map((t) => t.size),
			['micro', 'small', 'medium', 'large']
		);
		assert.strictEqual(to_size_tier(1), 'micro');
		assert.strictEqual(to_size_tier(599), 'micro');
		assert.strictEqual(to_size_tier(600), 'small');
		assert.strictEqual(to_size_tier(1_000), 'small');
		assert.strictEqual(to_size_tier(3_200), 'medium');
		assert.strictEqual(to_size_tier(10_000), 'medium');
		assert.strictEqual(to_size_tier(32_000), 'large');
		assert.strictEqual(to_size_tier(1_000_000), 'large');
	});

	test('count_lines counts a last line with or without its newline', () => {
		const count = (text: string): number => count_lines(new TextEncoder().encode(text));
		assert.strictEqual(count(''), 0);
		assert.strictEqual(count('a'), 1);
		assert.strictEqual(count('a\n'), 1);
		assert.strictEqual(count('a\nb'), 2);
		assert.strictEqual(count('a\n\n'), 2);
	});

	test('parse_corpus_path reads the layout and rejects anything else', () => {
		assert.deepStrictEqual(parse_corpus_path('shiki/ts/typescript.sample'), {
			source: 'shiki',
			home: null,
			lang: 'ts'
		});
		assert.deepStrictEqual(parse_corpus_path('home/fuz_code/bash/a.b.sh'), {
			source: 'home',
			home: 'fuz_code',
			lang: 'bash'
		});
		assert.strictEqual(parse_corpus_path('neutral/bash/headerscheck')!.lang, 'bash');
		for (const file of [
			'manifest.json',
			'ts/a.ts',
			'home/ts/a.ts',
			'other/ts/a.ts',
			'shiki/ts/x/a.ts'
		]) {
			assert.strictEqual(parse_corpus_path(file), null, file);
		}
	});

	test('hash_corpus changes with any input and ignores order', () => {
		const [a, b] = inputs;
		assert.strictEqual(hash_corpus([a!, b!]), hash_corpus([b!, a!]));
		assert.notStrictEqual(hash_corpus([a!, b!]), hash_corpus([a!]));
		assert.notStrictEqual(hash_corpus([a!]), hash_corpus([{ ...a!, sha256: 'c'.repeat(64) }]));
		assert.notStrictEqual(hash_corpus([a!]), hash_corpus([{ ...a!, lang: 'other' }]));
	});

	test('to_raw_url addresses a file at its pinned commit', () => {
		assert.strictEqual(
			to_raw_url({
				repo: 'https://github.com/a/b',
				commit: 'c'.repeat(40),
				path: 'docs/02-$x y.md'
			}),
			`https://raw.githubusercontent.com/a/b/${'c'.repeat(40)}/docs/02-%24x%20y.md`
		);
		assert.throws(
			() => to_raw_url({ repo: 'https://example.com/a/b', commit: 'c'.repeat(40), path: 'x' }),
			/only fetch from GitHub/
		);
	});
});

describe('build_corpus_manifest', () => {
	const HARNESS = 'harness/ts/a.ts';
	const COPIED = 'shiki/ts/b.sample';

	/** Builds a manifest over a temporary corpus holding `files`. */
	const build = (
		files: Record<string, string>,
		previous: CorpusManifestSeed['inputs'] = []
	): ReturnType<typeof build_corpus_manifest> => {
		const dir = mkdtempSync(join(tmpdir(), 'corpus_test_')) + '/';
		try {
			for (const [file, content] of Object.entries(files)) {
				mkdirSync(join(dir, file, '..'), { recursive: true });
				writeFileSync(dir + file, content);
			}
			return build_corpus_manifest(previous, dir);
		} finally {
			rmSync(dir, { recursive: true });
		}
	};

	const to_pin = (content: string) => ({
		repo: 'https://github.com/a/b',
		commit: 'c'.repeat(40),
		path: 'b.sample',
		sha256: hash_sha256(content),
		license: 'MIT',
		note: null
	});

	test('derives an entry from a file and keeps what was written by hand', () => {
		const { manifest: built, problems } = build({ [HARNESS]: 'a\n', [COPIED]: 'b\nb\n' }, [
			{ file: COPIED, provenance: [to_pin('b\nb\n')] }
		]);
		assert.deepStrictEqual(problems, []);
		assert.deepStrictEqual(built.inputs, [
			{
				file: HARNESS,
				source: 'harness',
				home: null,
				lang: 'ts',
				size: 'micro',
				bytes: 2,
				lines: 1,
				sha256: hash_sha256('a\n'),
				synthetic: false,
				provenance: [],
				derivation: null
			},
			{
				file: COPIED,
				source: 'shiki',
				home: null,
				lang: 'ts',
				size: 'micro',
				bytes: 4,
				lines: 2,
				sha256: hash_sha256('b\nb\n'),
				synthetic: false,
				provenance: [to_pin('b\nb\n')],
				derivation: null
			}
		]);
		s.parse_or_throw(CorpusManifest, built);
	});

	test('reports a copied file that changed or has no pin', () => {
		assert.match(
			build({ [COPIED]: 'changed\n' }, [{ file: COPIED, provenance: [to_pin('b\n')] }])
				.problems[0]!,
			/not the verbatim copy its provenance pins/
		);
		assert.match(build({ [COPIED]: 'b\n' }).problems[0]!, /add its provenance/);
	});

	test('reports a file that is not an input, and passes over the license files', () => {
		const { manifest: built, problems } = build({
			[HARNESS]: 'a\n',
			'stray.txt': 'x',
			'harness/tsx/a.tsx': 'x',
			'harness/ts/empty.ts': '',
			'neutral/NOTICE.md': 'x',
			'neutral/licenses/a.txt': 'x',
			'home/fuz_code/LICENSE': 'x',
			'shiki/LICENSE': 'x',
			'README.md': 'x',
			'INPUTS.md': 'x',
			'manifest.json': '{}'
		});
		assert.deepStrictEqual(
			built.inputs.map((i) => i.file),
			[HARNESS]
		);
		assert.strictEqual(problems.length, 3);
		assert.match(problems.join('\n'), /harness\/ts\/empty\.ts: empty/);
		assert.match(problems.join('\n'), /harness\/tsx\/a\.tsx: unknown lang "tsx"/);
		assert.match(problems.join('\n'), /stray\.txt: not at/);
	});

	test('reports a symbolic link instead of reading through it', () => {
		const dir = mkdtempSync(join(tmpdir(), 'corpus_test_')) + '/';
		try {
			mkdirSync(dir + 'harness/ts', { recursive: true });
			writeFileSync(dir + 'outside.txt', 'x');
			symlinkSync(dir + 'outside.txt', dir + 'harness/ts/link.ts');
			const { manifest: built, problems } = build_corpus_manifest([], dir);
			assert.deepStrictEqual(built.inputs, []);
			assert.match(problems.join('\n'), /harness\/ts\/link\.ts: a symbolic link/);
		} finally {
			rmSync(dir, { recursive: true });
		}
	});

	test('requires an input built from several files to be marked synthetic', () => {
		const pins = [to_pin('x'), { ...to_pin('y'), path: 'c.sample' }];
		assert.match(
			build({ [COPIED]: 'xy\n' }, [{ file: COPIED, provenance: pins }]).problems[0]!,
			/must be marked synthetic/
		);
		const joined = build({ [COPIED]: 'xy\n' }, [
			{ file: COPIED, synthetic: true, provenance: pins }
		]);
		assert.deepStrictEqual(joined.problems, []);
		assert.ok(joined.manifest.inputs[0]!.synthetic);
	});

	test('a stress input may be written here, or derived from a pin it differs from', () => {
		const WRITTEN = 'stress/ts/a.ts';
		const DERIVED = 'stress/js/b.min.js';
		const derived = { file: DERIVED, synthetic: true, provenance: [to_pin('b\n')] };
		const { manifest: built, problems } = build({ [WRITTEN]: 'a\n', [DERIVED]: 'b' }, [
			{ ...derived, derivation: 'minified' }
		]);
		assert.deepStrictEqual(problems, []);
		assert.deepStrictEqual(
			built.inputs.map((i) => [i.file, i.source, i.provenance.length, i.derivation]),
			[
				[DERIVED, 'stress', 1, 'minified'],
				[WRITTEN, 'stress', 0, null]
			]
		);
		s.parse_or_throw(CorpusManifest, built);
		// without its derivation it reads as a copy that changed
		assert.match(
			build({ [DERIVED]: 'b' }, [derived]).problems[0]!,
			/not the verbatim copy its provenance pins/
		);
		assert.match(
			build({ [DERIVED]: 'b' }, [{ ...derived, synthetic: false, derivation: 'minified' }])
				.problems[0]!,
			/must be marked synthetic/
		);
		assert.match(
			build({ [COPIED]: 'b' }, [{ ...derived, file: COPIED, derivation: 'minified' }]).problems[0]!,
			/only a stress input is derived/
		);
		assert.match(
			build({ [WRITTEN]: 'a\n' }, [{ file: WRITTEN, synthetic: true }]).problems[0]!,
			/so it is not synthetic/
		);
		assert.match(
			build({ [WRITTEN]: 'a\n' }, [{ file: WRITTEN, synthetic: true, derivation: 'minified' }])
				.problems[0]!,
			/names the file it was derived from/
		);
	});

	test('drops an entry whose file is gone', () => {
		const {
			manifest: built,
			problems,
			dropped
		} = build({ [HARNESS]: 'a\n' }, [{ file: COPIED, provenance: [to_pin('b\n')] }]);
		assert.deepStrictEqual(problems, []);
		assert.deepStrictEqual(dropped, [COPIED]);
		assert.deepStrictEqual(
			built.inputs.map((i) => i.file),
			[HARNESS]
		);
	});
});
