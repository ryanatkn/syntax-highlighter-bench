import { assert, describe, test } from 'vitest';

import {
	matrix_row_entry,
	matrix_row_is_bounded,
	matrix_row_is_complete,
	matrix_row_value,
	to_matrix_ratios
} from '#lib/matrix.ts';
import {
	find_startup_bare,
	to_startup_groups,
	to_startup_noise_ms,
	to_startup_value
} from '#lib/startup_matrix.ts';
import { load_deterministic, load_fixture, to_library_ids } from './site_test_helpers.ts';

const fixture = load_fixture();
const libraries = to_library_ids(fixture);
const langs = fixture.langs.map((lang) => lang.id);
const bare = find_startup_bare(fixture)!;

describe('to_startup_groups', () => {
	const groups = to_startup_groups(fixture, { langs, forms: ['bundled', 'unbundled'] }, libraries);

	test('a file that measured no cold start has no groups, and no bare baseline', () => {
		const deterministic = load_deterministic();
		assert.strictEqual(find_startup_bare(deterministic), null);
		assert.deepStrictEqual(
			to_startup_groups(deterministic, { langs, forms: ['bundled'] }, libraries),
			[]
		);
	});

	test('groups by form, then scenario', () => {
		assert.deepStrictEqual(
			groups.map((group) => group.key),
			['bundled', 'unbundled'].flatMap((form) =>
				['core', 'lang', 'set', 'first_highlight'].map((scenario) => `${form}:${scenario}`)
			)
		);
		assert.deepStrictEqual(
			to_startup_groups(fixture, { langs, forms: ['unbundled'] }, libraries).map((g) => g.key),
			groups.slice(4).map((g) => g.key)
		);
	});

	test('a number is what the library added over the bare baseline', () => {
		const row = groups.find((g) => g.key === 'bundled:core')!.rows[0]!;
		const entry = fixture.startup.find(
			(e) => e.scenario === 'core' && e.library === 'twinkleplop' && e.bundled
		)!;
		assert.closeTo(matrix_row_value(row, 'twinkleplop')!, entry.median_ms - bare.median_ms, 1e-9);
		const shown = matrix_row_entry(row, 'twinkleplop');
		assert.ok(shown.kind === 'value');
		assert.include(shown.details.join('\n'), 'bare Node');
		assert.include(shown.details.join('\n'), `${entry.samples} samples`);
	});

	test('a language scenario has a row for each selected timed language, never an untimed one', () => {
		const group = groups.find((g) => g.key === 'bundled:lang')!;
		const timed = fixture.langs.filter((lang) => lang.timed);
		// the mean leads the group, so it can stand for the rows when they are folded
		assert.strictEqual(group.rows[0]!.kind, 'summary');
		assert.deepStrictEqual(
			group.rows.filter((row) => row.kind === 'cell').map((row) => row.label),
			timed.map((lang) => lang.label)
		);
		const narrowed = to_startup_groups(
			fixture,
			{ langs: ['ts', 'xml'], forms: ['bundled'] },
			libraries
		);
		assert.deepStrictEqual(
			narrowed.find((g) => g.key === 'bundled:lang')!.rows.map((row) => row.label),
			['TypeScript']
		);
	});

	test('an excluded scenario shows as excluded, and is left out of the mean for everyone', () => {
		const group = groups.find((g) => g.key === 'bundled:first_highlight')!;
		const rust = group.rows.find((row) => row.label === 'Rust')!;
		const entry = matrix_row_entry(rust, 'prism');
		assert.ok(entry.kind === 'excluded');
		assert.include(entry.reason, 'plain-text fallback');
		const cells = group.rows.filter((row) => row.kind === 'cell');
		const complete = cells.filter((row) => matrix_row_is_complete(row, libraries));
		assert.notInclude(complete, rust);
		assert.ok(complete.length > 0, 'the fixture has no complete first highlight');
		const mean = group.rows[0]!;
		assert.strictEqual(mean.kind, 'summary');
		assert.include(mean.note, `${complete.length} of ${cells.length} rows`);
		assert.include(mean.note, 'left out');
		for (const id of libraries) assert.ok(matrix_row_value(mean, id)! > 0);
	});

	test('a scenario over a language the library does not claim is unsupported', () => {
		// a library that claims nothing was never sampled, so it has no entry anywhere
		const without = to_startup_groups(
			{
				...fixture,
				coverage: { ...fixture.coverage, prism: {} },
				startup: fixture.startup.filter((entry) => entry.library !== 'prism'),
				meta: { ...fixture.meta, startup_excluded: [] }
			},
			{ langs, forms: ['bundled'] },
			libraries
		);
		const set = matrix_row_entry(without.find((g) => g.key === 'bundled:set')!.rows[0]!, 'prism');
		assert.ok(set.kind === 'unsupported');
		assert.deepStrictEqual(set.langs, fixture.sets.find((s) => s.id === 'docs')!.langs);
		const lang = without
			.find((g) => g.key === 'bundled:lang')!
			.rows.find((row) => row.kind === 'cell')!;
		assert.deepStrictEqual(matrix_row_entry(lang, 'prism'), { kind: 'unsupported', langs: ['ts'] });
		// and a library that claims the language with no entry is unmeasured, which is neither
		const unmeasured = to_startup_groups(
			{ ...fixture, startup: fixture.startup.filter((entry) => entry.library !== 'prism') },
			{ langs, forms: ['bundled'] },
			libraries
		);
		assert.deepStrictEqual(
			matrix_row_entry(unmeasured.find((g) => g.key === 'bundled:core')!.rows[0]!, 'prism'),
			{ kind: 'unmeasured' }
		);
	});

	test('a single-row group has no mean', () => {
		for (const key of ['bundled:core', 'bundled:set']) {
			const group = groups.find((g) => g.key === key)!;
			assert.ok(group.rows.every((row) => row.kind === 'cell'));
		}
	});
});

describe('an addition inside the noise of the bare baseline', () => {
	const noise = to_startup_noise_ms(bare);
	const entry = fixture.startup.find((e) => e.scenario === 'core' && e.bundled)!;
	const with_added = (added: number) =>
		to_startup_value({ ...entry, median_ms: bare.median_ms + added }, bare);

	test('the noise is the bare p10 to p90 band, scaled to a difference of two medians', () => {
		assert.closeTo(noise, (bare.p90_ms - bare.p10_ms) * Math.sqrt(2 / bare.samples), 1e-12);
		assert.ok(noise > 0);
	});

	test('more samples narrow the noise, and one sample widens it past the band', () => {
		const band = bare.p90_ms - bare.p10_ms;
		assert.ok(to_startup_noise_ms({ ...bare, samples: 80 }) < to_startup_noise_ms(bare));
		assert.ok(to_startup_noise_ms({ ...bare, samples: 1 }) > band);
	});

	test('an addition of at least the noise is ranked', () => {
		const value = with_added(noise * 2);
		assert.strictEqual(value.unranked, null);
		assert.strictEqual(value.text, null);
		assert.deepStrictEqual(value.badges, []);
		assert.closeTo(value.value, noise * 2, 1e-9);
	});

	test('a smaller addition is printed, marked, and not ranked', () => {
		const value = with_added(noise / 2);
		assert.closeTo(value.value, noise / 2, 1e-9);
		assert.strictEqual(value.text, null);
		assert.ok(value.unranked !== null);
		assert.deepStrictEqual(
			value.badges.map((badge) => badge.text),
			['in the noise']
		);
		// the whole-process time stays in the details
		assert.include(value.details.join('\n'), 'since the process started');
	});

	test('a peak RSS at or under the bare one says so, never a negative size', () => {
		for (const rss of [bare.rss_peak_bytes, bare.rss_peak_bytes - 111_000]) {
			const details = to_startup_value({ ...entry, rss_peak_bytes: rss }, bare).details.join('\n');
			assert.include(details, "at or under bare Node's");
			assert.notMatch(details, /-\d/);
		}
		const over = to_startup_value(
			{ ...entry, rss_peak_bytes: bare.rss_peak_bytes + 2_000_000 },
			bare
		);
		assert.include(over.details.join('\n'), '2.00 MB over bare Node');
	});

	test('a median at or under the bare one prints as "≈ bare", never as a negative time', () => {
		for (const added of [0, -0.05]) {
			const value = with_added(added);
			assert.strictEqual(value.text, '≈ bare');
			assert.ok(value.unranked !== null);
			assert.include(value.unranked, 'at or under');
		}
	});

	test('in a row holding one, the others are bounds against the noise, and it is out of the mean', () => {
		const groups = to_startup_groups(fixture, { langs, forms: ['bundled'] }, libraries);
		const rows = groups.flatMap((group) => group.rows.filter((row) => row.kind === 'cell'));
		const is_noisy = (row: (typeof rows)[number], id: string): boolean => {
			const value = matrix_row_entry(row, id);
			return value.kind === 'value' && value.unranked !== null;
		};
		const noisy = rows.filter((row) => libraries.some((id) => is_noisy(row, id)));
		assert.ok(noisy.length > 0, 'the fixture has no addition inside the noise');
		assert.ok(noisy.length < rows.length, 'the fixture has no ranked row');
		for (const row of rows) {
			assert.strictEqual(row.resolution, noise);
			assert.strictEqual(matrix_row_is_bounded(row, libraries, null), noisy.includes(row), row.key);
		}
		for (const row of noisy) {
			const ratios = to_matrix_ratios(row, libraries, null);
			assert.ok(Object.keys(ratios).length > 0, row.key);
			for (const id of libraries) {
				if (is_noisy(row, id)) {
					assert.ok(!Object.hasOwn(ratios, id), `${row.key} ${id}`);
				} else if (Object.hasOwn(ratios, id)) {
					// what it added over the noise, which is at least 1 and never the baseline itself
					assert.closeTo(ratios[id]!, matrix_row_value(row, id)! / noise, 1e-9);
					assert.ok(ratios[id]! >= 1);
				}
			}
			assert.ok(!matrix_row_is_complete(row, libraries));
		}
		// the fixture's median under bare is one of them
		const json = groups
			.find((g) => g.key === 'bundled:lang')!
			.rows.find((r) => r.label === 'JSON')!;
		const under = matrix_row_entry(json, 'prism');
		assert.ok(under.kind === 'value');
		assert.strictEqual(under.text, '≈ bare');
		assert.include(noisy, json);
	});
});
