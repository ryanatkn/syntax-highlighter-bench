import { assert, describe, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { load_corpus_manifest } from '../../../bench/corpus.ts';
import {
	STRESS_DERIVED,
	STRESS_DIR,
	STRESS_WRITTEN,
	find_stress_differences,
	generate_stress_inputs,
	list_stress_files,
	to_stress_seed
} from '../../../bench/corpus_stress.ts';
import { TIMED_LANGS } from '../../../bench/langs.ts';

const manifest = load_corpus_manifest();
const generated = await generate_stress_inputs(manifest);
const stress = manifest.inputs.filter((input) => input.source === 'stress');

describe('the stress inputs', () => {
	test('are what the generator makes, file for file and entry for entry', () => {
		// a minified input's bytes are esbuild's: a new esbuild version fails here, naming it
		assert.deepStrictEqual(find_stress_differences(generated, manifest), []);
		assert.deepStrictEqual(
			list_stress_files(),
			generated.map((input) => input.file)
		);
		assert.deepStrictEqual(
			stress.map((input) => input.file),
			generated.map((input) => input.file)
		);
	});

	test('generate the same bytes every time', async () => {
		assert.deepStrictEqual(await generate_stress_inputs(manifest), generated);
	});

	test('a derived input keeps the pins of the neutral input it was made from', () => {
		for (const { file, from } of STRESS_DERIVED) {
			const input = stress.find((i) => i.file === file)!;
			const source = manifest.inputs.find((i) => i.file === from)!;
			assert.strictEqual(source.source, 'neutral', from);
			assert.strictEqual(input.lang, source.lang, file);
			assert.deepStrictEqual(input.provenance, source.provenance, file);
			assert.ok(input.synthetic, file);
			assert.ok(input.derivation, file);
			assert.notStrictEqual(input.sha256, source.sha256, file);
			// one long line, and smaller than the source
			assert.ok(input.lines < 20, file);
			assert.ok(input.bytes < source.bytes, file);
		}
		const esbuild = stress.filter((i) => i.derivation?.includes('esbuild'));
		assert.ok(esbuild.length > 0);
		for (const input of esbuild) {
			assert.match(
				input.derivation!,
				/^minified by Vite \d+\.\d+\.\d+'s .+, esbuild \d+\.\d+\.\d+$/
			);
		}
	});

	test('a written input has no provenance, and every timed language has a stress input', () => {
		for (const { file, lang } of STRESS_WRITTEN) {
			const input = stress.find((i) => i.file === file)!;
			assert.strictEqual(input.lang, lang, file);
			assert.deepStrictEqual(input.provenance, [], file);
			assert.strictEqual(input.derivation, null, file);
			assert.ok(!input.synthetic, file);
		}
		assert.deepStrictEqual(new Set(stress.map((i) => i.lang)), new Set(TIMED_LANGS));
	});

	test('stay under the size of the large neutral inputs', () => {
		for (const input of stress) assert.ok(input.bytes < 90_000, input.file);
	});
});

describe('find_stress_differences', () => {
	test('names a changed file, a changed derivation, and a stray file', () => {
		const [first, ...rest] = generated;
		const derived = generated.find((input) => input.derivation?.includes('esbuild'))!;
		const changed = generated.map((input) =>
			input === first
				? { ...input, content: input.content + 'x' }
				: input === derived
					? { ...input, derivation: input.derivation!.replace(/esbuild \S+/, 'esbuild 0.0.0') }
					: input
		);
		const differences = find_stress_differences(changed, manifest);
		assert.include(differences.join('\n'), `${first!.file}: differs from what generates`);
		assert.include(differences.join('\n'), 'Vite and esbuild pin the minified bytes');
		assert.include(
			find_stress_differences(rest, manifest).join('\n'),
			`${first!.file}: not generated, so it would be removed`
		);
	});
});

describe('list_stress_files', () => {
	test('lists files at any depth as corpus paths, with one separator', () => {
		const dir = mkdtempSync(join(tmpdir(), 'corpus_stress_test_')) + '/';
		try {
			mkdirSync(dir + STRESS_DIR + 'ts', { recursive: true });
			writeFileSync(dir + STRESS_DIR + 'stray.txt', 'x');
			writeFileSync(dir + STRESS_DIR + 'ts/a.ts', 'x');
			assert.deepStrictEqual(list_stress_files(dir), ['stress/stray.txt', 'stress/ts/a.ts']);
		} finally {
			rmSync(dir, { recursive: true });
		}
	});
});

describe('to_stress_seed', () => {
	test('replaces every stress entry and keeps the rest', () => {
		const previous = [
			{ file: 'neutral/ts/a.ts', provenance: [] },
			{ file: STRESS_DIR + 'ts/old.ts', provenance: [] }
		];
		const seed = to_stress_seed(previous, generated);
		assert.deepStrictEqual(
			seed.map((input) => input.file),
			['neutral/ts/a.ts', ...generated.map((input) => input.file)]
		);
	});
});
