import { assert, describe, test } from 'vitest';

import {
	compare_results,
	find_compare_changes,
	format_compare_table,
	format_comparison,
	parse_compare_args,
	type CompareSection
} from '../../../bench/compare.ts';
import { parse_bench_results } from '#lib/results_schema.ts';
import { load_fixture, load_fixture_json, to_deterministic_only } from '../site_test_helpers.ts';

const PATHS: [string, string] = ['before.json', 'after.json'];

const find_section = (sections: Array<CompareSection>, title: string): CompareSection => {
	const section = sections.find((s) => s.title === title);
	assert(section, `no section "${title}"`);
	return section;
};

describe('find_compare_changes', () => {
	test('a file against itself has none', () => {
		const fixture = load_fixture();
		assert.deepEqual(find_compare_changes(fixture, fixture), []);
	});

	test('names a version, an extra package, the corpus, and a run parameter', () => {
		const after_json = load_fixture_json();
		const library = after_json.meta.libraries.find((l) => l.extra_packages)!;
		library.version = '9.9.9';
		const [name] = Object.keys(library.extra_packages!);
		library.extra_packages![name!] = '8.8.8';
		after_json.meta.corpus_hash = 'f'.repeat(64);
		const changes = find_compare_changes(load_fixture(), after_json);
		assert.ok(changes.some((c) => c.startsWith(`${library.id}: `) && c.endsWith('→ 9.9.9')));
		assert.ok(changes.some((c) => c.includes(`${name} `) && c.endsWith('→ 8.8.8')));
		assert.ok(changes.some((c) => c.startsWith('the corpus: ')));
	});

	test('narrows the library lines to one library', () => {
		const after_json = load_fixture_json();
		for (const library of after_json.meta.libraries) library.version = '9.9.9';
		const [first, second] = after_json.meta.libraries;
		const changes = find_compare_changes(load_fixture(), after_json, first!.id);
		assert.ok(changes.some((c) => c.startsWith(`${first!.id}: `)));
		assert.ok(!changes.some((c) => c.startsWith(`${second!.id}: `)));
	});

	test('compares no machine or run against a deterministic-only file', () => {
		const deterministic = parse_bench_results(to_deterministic_only(load_fixture_json()));
		assert.deepEqual(find_compare_changes(deterministic, load_fixture()), []);
	});
});

describe('compare_results', () => {
	test('a timed value that moved shows its change, and the geomean of its group', () => {
		const after_json = load_fixture_json();
		const cell = after_json.cells.find((c) => Object.keys(c.values).length > 0)!;
		const [library, value] = Object.entries(cell.values)[0]!;
		value.ns_per_op *= 1.1;
		const sections = compare_results(load_fixture(), after_json, PATHS, library);
		const [summary, cells] = find_section(sections, 'Throughput').tables;
		const row = cells!.rows.find((r) => r[1] === cell.id);
		assert.ok(row);
		assert.strictEqual(row[4], '+10.0%');
		assert.ok(summary!.rows.every((r) => r[0] === library));
		assert.ok(summary!.rows.some((r) => r[1] === cell.mode && r[4] !== '0.0%'));
		assert.ok(cells!.rows.filter((r) => r[1] !== cell.id).every((r) => r[4] === '0.0%'));
	});

	test('a library excluded after says so', () => {
		const before = load_fixture();
		const after_json = load_fixture_json();
		const cell = after_json.cells.find(
			(c) => c.mode === 'tokenize' && Object.keys(c.values).length > 0
		)!;
		const library = Object.keys(cell.values)[0]!;
		delete cell.values[library];
		delete cell.tokens[library];
		after_json.meta.excluded.push({ cell: cell.id, library, reason: 'invented' });
		const sections = compare_results(before, after_json, PATHS, library);
		const row = find_section(sections, 'Throughput').tables[1]!.rows.find((r) => r[1] === cell.id)!;
		assert.strictEqual(row[3], 'excluded');
		assert.strictEqual(row[4], '—');
	});

	test('cold start lists the bare baseline first, with what each scenario added', () => {
		const fixture = load_fixture();
		const table = find_section(compare_results(fixture, fixture, PATHS), 'Cold start').tables[0]!;
		assert.strictEqual(table.rows[0]![0], 'node');
		assert.strictEqual(table.rows[0]![5], '—');
		assert.ok(table.rows.slice(1).every((r) => r[5] !== '—' || r[2] === 'excluded'));
	});

	test('lists the deterministic numbers that differ, and only those', () => {
		const fixture = load_fixture();
		const same = find_section(
			compare_results(fixture, fixture, PATHS),
			'Deterministic numbers that differ'
		);
		assert.deepEqual(same.tables, []);
		assert.match(same.lines[0]!, /^none: /);
		const after_json = load_fixture_json();
		const [library, by_set] = Object.entries(after_json.bundle)[0]!;
		const [set, entry] = Object.entries(by_set).find(([, e]) => 'raw' in e)!;
		assert('raw' in entry);
		entry.raw += 1000;
		const changed = find_section(
			compare_results(fixture, after_json, PATHS),
			'Deterministic numbers that differ'
		);
		assert.deepEqual(
			changed.tables[0]!.rows.map((r) => [r[0], r[1], r[2], r[5]]),
			[[library, `bundle ${set}`, 'raw', '+1.00 kB']]
		);
	});

	test('a retained heap within the tolerance counts as equal, and one beyond it differs', () => {
		const fixture = load_fixture();
		const after_json = load_fixture_json();
		const [library, by_lang] = Object.entries(after_json.heap)[0]!;
		const [lang, heap] = Object.entries(by_lang)[0]!;
		heap.retained_kb += 1;
		const section = (): CompareSection =>
			find_section(
				compare_results(fixture, after_json, PATHS),
				'Deterministic numbers that differ'
			);
		assert.deepEqual(section().tables, []);
		heap.retained_kb += 10_000;
		assert.deepEqual(
			section().tables[0]!.rows.map((r) => [r[0], r[1], r[2]]),
			[[library, `heap ${lang}`, 'retained_kb']]
		);
	});

	test('the throughput summary leads each library with its neutral inputs', () => {
		const fixture = load_fixture();
		const [summary] = find_section(compare_results(fixture, fixture, PATHS), 'Throughput').tables;
		const first = summary!.rows[0]!;
		assert.strictEqual(first[2], 'neutral');
	});

	test('leaves out the timed sections when a file has no timed numbers', () => {
		const deterministic = parse_bench_results(to_deterministic_only(load_fixture_json()));
		const titles = compare_results(deterministic, load_fixture(), PATHS).map((s) => s.title);
		assert.deepEqual(titles, [
			'Runs',
			'What changed between them',
			'Deterministic numbers that differ'
		]);
	});
});

describe('format_compare_table', () => {
	const table = {
		head: ['a', 'n'],
		rows: [
			['x|y', '1'],
			['zz', '100']
		],
		numeric: [false, true]
	};

	test('aligns numbers right in plain text', () => {
		assert.strictEqual(
			format_compare_table(table, false),
			'a      n\n---  ---\nx|y    1\nzz   100'
		);
	});

	test('writes Markdown with escaped pipes and right-aligned number columns', () => {
		assert.strictEqual(
			format_compare_table(table, true),
			'| a | n |\n| --- | ---: |\n| x\\|y | 1 |\n| zz | 100 |'
		);
	});

	test('a comparison is its sections in order', () => {
		const fixture = load_fixture();
		const text = format_comparison(compare_results(fixture, fixture, PATHS), true);
		assert.match(text, /^## Runs\n/);
		assert.ok(text.indexOf('## Throughput') < text.indexOf('## Cold start'));
	});
});

describe('parse_compare_args', () => {
	test('two files, a library, and Markdown', () => {
		assert.deepEqual(parse_compare_args(['a.json', '--library', 'prism', 'b.json', '--markdown']), {
			ok: true,
			paths: ['a.json', 'b.json'],
			library: 'prism',
			markdown: true
		});
	});

	test('refuses one file, an unknown flag, and a library flag with no id', () => {
		assert.ok(!parse_compare_args(['a.json']).ok);
		assert.ok(!parse_compare_args(['a.json', 'b.json', '--nope']).ok);
		assert.ok(!parse_compare_args(['a.json', 'b.json', '--library']).ok);
	});
});
