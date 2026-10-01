import { assert, beforeAll, describe, test } from 'vitest';

import { LangNotSetUpError } from '../../../bench/adapter.ts';
import { check_output } from '../../../bench/check_output.ts';
import { load_corpus_manifest, read_corpus_input } from '../../../bench/corpus.ts';
import type { Lang } from '../../../bench/langs.ts';
import { ADAPTERS } from '../../../bench/libraries.ts';

// A file of its own, so no other test has loaded a language into these adapters:
// `setup` is given a subset, and everything outside it must throw.

const corpus = load_corpus_manifest();

const read_snippet = (lang: Lang): string =>
	read_corpus_input(corpus.inputs.find((i) => i.source === 'harness' && i.lang === lang)!);

const SET_UP: Array<Lang> = ['json', 'svelte'];
const NOT_SET_UP: Array<Lang> = ['ts', 'js', 'css', 'html', 'md', 'bash', 'rust'];

describe.each(ADAPTERS.map((adapter) => ({ id: adapter.id, adapter })))('$id', ({ adapter }) => {
	test('before setup, every language throws', () => {
		for (const lang of [...SET_UP, ...NOT_SET_UP]) {
			assert.throws(() => adapter.tokenize(read_snippet(lang), lang), LangNotSetUpError, lang);
			assert.throws(() => adapter.html(read_snippet(lang), lang), LangNotSetUpError, lang);
		}
	});

	describe('after setup', () => {
		beforeAll(async () => {
			await adapter.setup(SET_UP);
		});

		test('the languages it was given pass the output check', () => {
			for (const lang of SET_UP) {
				const result = check_output(adapter, lang, read_snippet(lang));
				assert.ok(result.ok, result.ok ? '' : result.reason);
			}
		});

		test('a claimed language it was not given throws', () => {
			// svelte brings its script and style languages along inside the library,
			// and they still aren't languages the adapter will run on their own
			for (const lang of NOT_SET_UP) {
				const src = read_snippet(lang);
				assert.throws(() => adapter.tokenize(src, lang), LangNotSetUpError, lang);
				assert.throws(() => adapter.html(src, lang), LangNotSetUpError, lang);
			}
		});

		test('the output check rethrows that instead of recording an exclusion', () => {
			// asking for a language that isn't set up is the harness's mistake, not the library's
			for (const lang of NOT_SET_UP) {
				assert.throws(() => check_output(adapter, lang, read_snippet(lang)), LangNotSetUpError);
			}
		});
	});
});
