import { assert, describe, test } from 'vitest';

import {
	HEADLINE_COMPRESSION,
	PRACTICE_BLOCK_BYTES,
	PRACTICE_FRAME_MS,
	to_headline_charts,
	to_language_weight_groups,
	to_practice_group
} from '#lib/headline.ts';
import { matrix_row_entry, matrix_row_value } from '#lib/matrix.ts';
import { load_deterministic, load_fixture, to_library_ids } from './site_test_helpers.ts';

const to_titles = (charts: ReturnType<typeof to_headline_charts>): Array<string> =>
	charts.map((chart) => chart.title);

describe('to_headline_charts', () => {
	test('with a timed run, every figure, each a number for every library', () => {
		const results = load_fixture();
		const libraries = to_library_ids(results);
		const charts = to_headline_charts(results);
		assert.deepStrictEqual(to_titles(charts), [
			'Tokenizing',
			'Highlighting to HTML',
			'Cold start to a first highlight',
			'Retained memory',
			'Everything a page loads'
		]);
		for (const { row } of charts) {
			assert.strictEqual(row.empty, null, row.key);
			for (const id of libraries) assert.strictEqual(matrix_row_entry(row, id).kind, 'value');
		}
		// the timed figures are geometric means over the neutral inputs
		assert.include(charts[0]!.row.key, 'neutral');
		assert.strictEqual(charts[0]!.row.kind, 'summary');
	});

	test('with no timed run, only the deterministic figures', () => {
		const results = load_deterministic();
		const charts = to_headline_charts(results);
		assert.deepStrictEqual(to_titles(charts), ['Retained memory', 'Everything a page loads']);
		// memory is a geometric mean over the languages of what each library holds
		const held = Object.values(results.heap.prism!).map(
			(e) => 1024 * (e.retained_kb + e.code_kb + e.external_kb)
		);
		const expected = Math.exp(held.reduce((sum, v) => sum + Math.log(v), 0) / held.length);
		assert.approximately(matrix_row_value(charts[0]!.row, 'prism')!, expected, 1e-6 * expected);
		// everything loaded: the JS, the wasm binary, and the stylesheet
		const [, loaded] = charts;
		const sizes = results.bundle.prism!.docs!;
		assert.ok(!('unsupported' in sizes));
		assert.strictEqual(matrix_row_value(loaded!.row, 'prism'), sizes.gzip + sizes.css!.gzip);
		const wasm = results.bundle.shiki_wasm!.docs!;
		assert.ok(!('unsupported' in wasm));
		assert.strictEqual(matrix_row_value(loaded!.row, 'shiki_wasm'), wasm.gzip + wasm.wasm!.gzip);
		// and it shows what it is made of, with the schemes the theme covers
		assert.ok(loaded!.details);
		const prism = matrix_row_entry(loaded!.row, 'prism');
		assert.ok(prism.kind === 'value');
		assert.include(prism.details.at(-1), 'theme: light');
	});

	test('only the throughput figures carry the noise floor, and memory the heap tolerance', () => {
		const results = load_fixture();
		for (const { row } of to_headline_charts(results)) {
			if (row.key.startsWith('summary:')) {
				assert.strictEqual(row.floor, results.meta.noise_floor!.geomean, row.key);
			} else if (row.key === 'memory') {
				assert.isAbove(row.floor!, 0);
			} else {
				// cold start has no calibrated floor, and a byte count has no noise
				assert.strictEqual(row.floor, null, row.key);
			}
		}
	});
});

describe('to_language_weight_groups', () => {
	test('the runtime, then each language as the whole bundle a page loads', () => {
		const results = load_deterministic();
		const [core, , langs] = to_language_weight_groups(results);
		assert.strictEqual(core!.key, 'core');
		assert.strictEqual(langs!.key, 'langs');
		assert.strictEqual(langs!.rows.length, results.langs.length);
		const fuz_code = results.bundle.fuz_code!;
		const floor = fuz_code.core!;
		const ts = fuz_code['single:ts']!;
		assert.ok(!('unsupported' in floor) && !('unsupported' in ts));
		assert.strictEqual(matrix_row_value(core!.rows[0]!, 'fuz_code'), floor[HEADLINE_COMPRESSION]);
		const ts_row = langs!.rows.find((row) => row.key === 'lang:ts')!;
		// the whole bundle, never a difference
		assert.strictEqual(matrix_row_value(ts_row, 'fuz_code'), ts[HEADLINE_COMPRESSION]);
		// a language a library doesn't claim is unsupported, never a zero
		const xml = langs!.rows.find((row) => row.key === 'lang:xml')!;
		assert.strictEqual(matrix_row_entry(xml, 'twinkleplop').kind, 'unsupported');
	});

	test('the default set and every timed language lead, each as one bundle', () => {
		const results = load_deterministic();
		const sets = to_language_weight_groups(results)[1]!;
		assert.strictEqual(sets.key, 'sets');
		assert.deepStrictEqual(
			sets.rows.map((row) => row.key),
			['set:docs', 'set:timed']
		);
		for (const row of sets.rows) {
			const set = results.bundle.twinkleplop![row.key.slice('set:'.length)]!;
			assert.ok(!('unsupported' in set));
			// every library claims both, so each has a number
			assert.strictEqual(matrix_row_value(row, 'twinkleplop'), set[HEADLINE_COMPRESSION]);
		}
	});
});

describe('to_practice_group', () => {
	test('the HTML rate worked out for one block, a frame, and a build', () => {
		const results = load_fixture();
		const group = to_practice_group(results)!;
		const rate = to_headline_charts(results).find((chart) => chart.row.key.endsWith(':html'))!.row;
		const [block, frame, build] = group.rows;
		for (const id of to_library_ids(results)) {
			const mb_per_sec = matrix_row_value(rate, id)!;
			const block_ms = (PRACTICE_BLOCK_BYTES / 1e6 / mb_per_sec) * 1000;
			assert.approximately(matrix_row_value(block!, id)!, block_ms, 1e-9);
			assert.strictEqual(matrix_row_value(frame!, id), Math.floor(PRACTICE_FRAME_MS / block_ms));
			assert.approximately(matrix_row_value(build!, id)!, 1000 / mb_per_sec, 1e-9);
		}
	});

	test('is null with no timed run', () => {
		assert.strictEqual(to_practice_group(load_deterministic()), null);
	});
});
