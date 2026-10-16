import { assert, describe, test } from 'vitest';
import * as s from '@fuzdev/fuz_schema/schema.ts';

import { BenchSet } from '#lib/results_schema.ts';
import { LANGS, is_lang } from '../../../bench/langs.ts';
import { CORE_SET_ID, FEATURE_SETS, to_single_set_id } from '../../../bench/sets.ts';

const get_set = (id: string) => {
	const set = FEATURE_SETS.find((s) => s.id === id);
	assert.ok(set, `missing set "${id}"`);
	return set;
};

describe('FEATURE_SETS', () => {
	test('has no duplicate ids', () => {
		const ids = FEATURE_SETS.map((s) => s.id);
		assert.strictEqual(new Set(ids).size, ids.length);
	});

	test('every set names only known language ids, each once', () => {
		for (const set of FEATURE_SETS) {
			for (const lang of set.langs) {
				assert.ok(is_lang(lang), `set "${set.id}" names unknown lang "${lang}"`);
			}
			assert.strictEqual(new Set(set.langs).size, set.langs.length, `set "${set.id}" repeats`);
		}
	});

	test('every set matches the results schema', () => {
		for (const set of FEATURE_SETS) {
			assert.deepStrictEqual(s.parse_or_throw(BenchSet, set), { ...set, langs: [...set.langs] });
		}
	});

	test('core has no languages', () => {
		assert.deepStrictEqual(get_set(CORE_SET_ID).langs, []);
	});

	test('a single set exists for each language and holds only it', () => {
		for (const lang of LANGS) {
			assert.deepStrictEqual(get_set(to_single_set_id(lang)).langs, [lang]);
		}
		const singles = FEATURE_SETS.filter((s) => s.id.startsWith('single:'));
		assert.strictEqual(singles.length, LANGS.length);
	});

	test('docs is the documentation-site shape', () => {
		assert.deepStrictEqual(get_set('docs').langs, [
			'js',
			'ts',
			'css',
			'html',
			'md',
			'bash',
			'json'
		]);
	});

	test('web_rust is labeled by content and footnoted as home turf', () => {
		const set = get_set('web_rust');
		assert.strictEqual(set.label, 'web + rust');
		assert.strictEqual(set.footnote, "fuz_code's full set (home turf)");
		assert.ok(set.langs.includes('xml'));
		assert.ok(set.langs.includes('rust'));
	});

	test('all is the union of every language and of every set', () => {
		const all = new Set(get_set('all').langs);
		assert.deepStrictEqual(all, new Set(LANGS));
		assert.deepStrictEqual(all, new Set(FEATURE_SETS.flatMap((s) => s.langs)));
	});

	test('only the home-turf set carries a footnote', () => {
		for (const set of FEATURE_SETS) {
			if (set.id !== 'web_rust') assert.strictEqual(set.footnote, null);
		}
	});
});
