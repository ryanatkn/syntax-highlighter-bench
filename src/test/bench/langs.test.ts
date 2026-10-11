import { assert, describe, test } from 'vitest';

import { BenchLang } from '#lib/results_schema.ts';
import {
	LANG_LABELS,
	LANG_ROSTER,
	LANGS,
	TIMED_LANGS,
	is_lang,
	lang_is_timed
} from '../../../bench/langs.ts';

describe('LANG_ROSTER', () => {
	test('has no duplicate ids', () => {
		assert.strictEqual(new Set(LANGS).size, LANGS.length);
	});

	test('every entry matches the results schema', () => {
		for (const lang of LANG_ROSTER) {
			assert.deepStrictEqual(BenchLang.parse(lang), lang);
		}
	});

	test('ids are lowercase and safe inside a set id', () => {
		for (const lang of LANGS) {
			assert.match(lang, /^[a-z][a-z0-9_]*$/);
		}
	});
});

describe('derived lists', () => {
	test('LANGS follows the roster order', () => {
		assert.deepStrictEqual(
			LANGS,
			LANG_ROSTER.map((l) => l.id)
		);
	});

	test('TIMED_LANGS is the timed subset of LANGS', () => {
		assert.deepStrictEqual(
			TIMED_LANGS,
			LANG_ROSTER.filter((l) => l.timed).map((l) => l.id)
		);
		assert.ok(TIMED_LANGS.length < LANGS.length);
	});

	test('xml is a language but not a timed one', () => {
		assert.ok(is_lang('xml'));
		assert.ok(!lang_is_timed('xml'));
		assert.ok(lang_is_timed('ts'));
	});

	test('every language has a label', () => {
		assert.deepStrictEqual(Object.keys(LANG_LABELS), [...LANGS]);
		for (const lang of LANGS) assert.ok(LANG_LABELS[lang].length > 0);
	});

	test('is_lang rejects unknown ids', () => {
		assert.ok(!is_lang('typescript'));
		assert.ok(!is_lang(''));
	});
});
