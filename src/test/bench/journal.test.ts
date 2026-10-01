import { afterEach, assert, beforeEach, describe, test } from 'vitest';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CellResult } from '../../../bench/cell.ts';
import {
	JOURNAL_VERSION,
	JournalHeader,
	diff_journal_header,
	open_journal,
	parse_journal,
	read_journal,
	to_journal_key,
	type JournalEntry
} from '../../../bench/journal.ts';

let dir: string;
let path: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'bench_journal_test_'));
	path = join(dir, 'run.json.journal.jsonl');
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

const HEADER: JournalHeader = {
	type: 'header',
	journal: JOURNAL_VERSION,
	generated_at: '2026-01-01T00:00:00.000Z',
	kind: 'full',
	passes: 3,
	rounds: 4,
	target_ms: 20,
	warmup_ms: 100,
	rewarm_ms: 100,
	retries: 2,
	filters: { libraries: null, langs: ['ts'], sizes: null, modes: null, sources: null },
	corpus_hash: 'a'.repeat(64),
	libraries: [
		{ id: 'fuz_code', version: '1.0.0' },
		{ id: 'twinkleplop', version: '2.0.0', extra_packages: { '@twinkleplop/json': '0.1.0' } }
	],
	machine: { name: 'box', cpu: 'Test CPU', governor: 'performance' },
	os_release: '6.1.0',
	node: 'v24.14.1',
	node_options: '',
	commit: '0'.repeat(40)
};

const create_result = (library: string, ns: number = 1000): CellResult => ({
	cell: 'harness/ts/snippet.ts:tokenize',
	library,
	loaded_langs: ['ts'],
	measurement: {
		tokens: 10,
		output: { html_bytes: 100, spans: 10 },
		iterations: 10,
		ns_per_op: [ns],
		rss_peak_bytes: 50_000_000
	},
	excluded: null
});

const result_entry = (
	at_ms: number,
	library: string,
	pass: number,
	attempt: number = 0
): JournalEntry => ({ type: 'result', at_ms, pass, attempt, result: create_result(library) });

/** Writes a journal of the header and some entries, through the writer. */
const write_journal = (entries: Array<JournalEntry>): void => {
	const writer = open_journal(path, HEADER);
	for (const entry of entries) writer.append(entry);
	writer.close();
};

const read_ok = () => {
	const journal = read_journal(path);
	assert.ok(journal.ok, journal.ok ? '' : journal.message);
	return journal;
};

describe('a journal', () => {
	test('round-trips its header, results, readings, segments, and duration', () => {
		const excluded: CellResult = {
			...create_result('prism'),
			measurement: null,
			excluded: 'produced no tokens'
		};
		write_journal([
			{ type: 'segment', at_ms: 300, anchor_ns: 1000 },
			result_entry(900, 'fuz_code', 0),
			result_entry(1500, 'fuz_code', 1),
			{ type: 'anchor', at_ms: 1800, anchor_ns: 1010 },
			{ type: 'segment', at_ms: 250, anchor_ns: 1020 },
			result_entry(700, 'fuz_code', 0, 1),
			{ type: 'result', at_ms: 1200, pass: 0, attempt: 0, result: excluded }
		]);
		const journal = read_ok();
		assert.deepStrictEqual(journal.header, HEADER);
		assert.deepStrictEqual(
			[...journal.results.keys()],
			[
				to_journal_key('harness/ts/snippet.ts:tokenize', 'fuz_code', 0, 0),
				to_journal_key('harness/ts/snippet.ts:tokenize', 'fuz_code', 1, 0),
				to_journal_key('harness/ts/snippet.ts:tokenize', 'fuz_code', 0, 1),
				to_journal_key('harness/ts/snippet.ts:tokenize', 'prism', 0, 0)
			]
		);
		assert.deepStrictEqual([...journal.results.values()].at(-1), excluded);
		// every reading, in order: a segment's opening one, and its closing one when it took it
		assert.deepStrictEqual(journal.readings_ns, [1000, 1010, 1020]);
		assert.strictEqual(journal.segments, 2);
		// each segment up to its last line, and not the time between them
		assert.strictEqual(journal.duration_ms, 1800 + 1200);
		assert.strictEqual(journal.complete_bytes, readFileSync(path).length);
	});

	test('is one JSON line for the header and one for each entry', () => {
		write_journal([{ type: 'segment', at_ms: 0, anchor_ns: 1000 }, result_entry(5, 'fuz_code', 0)]);
		const text = readFileSync(path, 'utf8');
		assert.ok(text.endsWith('\n'));
		const lines = text.trimEnd().split('\n');
		assert.strictEqual(lines.length, 3);
		assert.deepStrictEqual(JSON.parse(lines[0]!), HEADER);
		assert.strictEqual(JSON.parse(lines[2]!).type, 'result');
	});

	test('a new journal is never written over an existing one', () => {
		write_journal([]);
		assert.throws(() => open_journal(path, HEADER), /EEXIST/);
	});

	test('a writer refuses to append once closed', () => {
		const writer = open_journal(path, HEADER);
		writer.close();
		writer.close();
		assert.throws(() => writer.append({ type: 'segment', at_ms: 0, anchor_ns: 1 }), /closed/);
	});

	test('a last line cut short by a crash is dropped, and a resume appends after what is whole', () => {
		write_journal([{ type: 'segment', at_ms: 0, anchor_ns: 1000 }, result_entry(5, 'fuz_code', 0)]);
		const whole = readFileSync(path).length;
		const cut = JSON.stringify(result_entry(9, 'fuz_code', 1));
		for (const tail of [cut.slice(0, 40), cut]) {
			// even a whole line of JSON: without its newline the write didn't finish
			appendFileSync(path, tail);
			const journal = read_ok();
			assert.strictEqual(journal.results.size, 1);
			assert.strictEqual(journal.complete_bytes, whole);
			const writer = open_journal(path, journal.complete_bytes);
			writer.close();
			assert.strictEqual(readFileSync(path).length, whole);
		}
		const writer = open_journal(path, whole);
		writer.append(result_entry(9, 'fuz_code', 1));
		writer.close();
		assert.strictEqual(read_ok().results.size, 2);
	});

	test('a complete line that is not a journal line is refused, with its line number', () => {
		const repeated = JSON.stringify(result_entry(5, 'fuz_code', 0));
		for (const [lines, expected] of [
			[['not json'], /line 3 is not a journal line/],
			[[JSON.stringify({ type: 'result', at_ms: 1 })], /line 3 is not a journal line/],
			[
				[JSON.stringify({ type: 'segment', at_ms: 1, anchor_ns: 1, extra: 1 })],
				/line 3 is not a journal line/
			],
			[[repeated, repeated], /line 4 repeats a result/]
		] as const) {
			rmSync(path, { force: true });
			write_journal([{ type: 'segment', at_ms: 0, anchor_ns: 1000 }]);
			appendFileSync(path, lines.map((line) => line + '\n').join(''));
			const journal = read_journal(path);
			assert.ok(!journal.ok);
			assert.match(journal.message, expected);
		}
	});

	test('a result before any segment is refused', () => {
		write_journal([result_entry(5, 'fuz_code', 0)]);
		const journal = read_journal(path);
		assert.ok(!journal.ok);
		assert.match(journal.message, /line 2 comes before any segment/);
	});

	test('a file with no header this version reads is refused', () => {
		for (const text of [
			'',
			'{"type":"hea',
			'not json\n',
			JSON.stringify({ ...HEADER, journal: JOURNAL_VERSION + 1 }) + '\n',
			JSON.stringify({ ...HEADER, extra: true }) + '\n'
		]) {
			const journal = parse_journal(Buffer.from(text));
			assert.ok(!journal.ok, text);
			assert.match(journal.message, /no header this harness can read/);
		}
	});
});

describe('diff_journal_header', () => {
	test('the same run has no difference, whenever it started', () => {
		assert.deepStrictEqual(diff_journal_header(HEADER, structuredClone(HEADER)), []);
		assert.deepStrictEqual(
			diff_journal_header(HEADER, { ...HEADER, generated_at: '2027-02-02T00:00:00.000Z' }),
			[]
		);
	});

	test('every other field is compared, and a difference is named', () => {
		const changes: Array<[field: string, changed: JournalHeader]> = [
			['kind', { ...HEADER, kind: 'calibrate' }],
			['passes', { ...HEADER, passes: 4 }],
			['rounds', { ...HEADER, rounds: 5 }],
			['target_ms', { ...HEADER, target_ms: 21 }],
			['warmup_ms', { ...HEADER, warmup_ms: 101 }],
			['rewarm_ms', { ...HEADER, rewarm_ms: 101 }],
			['retries', { ...HEADER, retries: 0 }],
			['filters.libraries', { ...HEADER, filters: { ...HEADER.filters, libraries: ['prism'] } }],
			['filters.langs', { ...HEADER, filters: { ...HEADER.filters, langs: ['ts', 'js'] } }],
			['filters.sizes', { ...HEADER, filters: { ...HEADER.filters, sizes: ['micro'] } }],
			['filters.modes', { ...HEADER, filters: { ...HEADER.filters, modes: ['html'] } }],
			['filters.sources', { ...HEADER, filters: { ...HEADER.filters, sources: ['home'] } }],
			['corpus_hash', { ...HEADER, corpus_hash: 'b'.repeat(64) }],
			[
				'libraries',
				{
					...HEADER,
					libraries: [{ ...HEADER.libraries[0]!, version: '1.0.1' }, HEADER.libraries[1]!]
				}
			],
			[
				'libraries',
				{
					...HEADER,
					libraries: [
						HEADER.libraries[0]!,
						{ ...HEADER.libraries[1]!, extra_packages: { '@twinkleplop/json': '0.1.1' } }
					]
				}
			],
			['libraries', { ...HEADER, libraries: HEADER.libraries.slice(0, 1) }],
			['machine.name', { ...HEADER, machine: { ...HEADER.machine, name: 'other' } }],
			['machine.cpu', { ...HEADER, machine: { ...HEADER.machine, cpu: 'Other CPU' } }],
			['machine.governor', { ...HEADER, machine: { ...HEADER.machine, governor: null } }],
			['os_release', { ...HEADER, os_release: '6.2.0' }],
			['node', { ...HEADER, node: 'v26.0.0' }],
			['node_options', { ...HEADER, node_options: '--max-old-space-size=4096' }],
			['commit', { ...HEADER, commit: `${HEADER.commit}-dirty` }]
		];
		for (const [field, changed] of changes) {
			const differences = diff_journal_header(HEADER, changed);
			assert.deepStrictEqual(
				differences.map((d) => d.field),
				[field]
			);
			assert.notDeepEqual(differences[0]!.journal, differences[0]!.current);
		}
		// every field of a header is one of these, so a new field can't go uncompared
		const compared = new Set(changes.map(([field]) => field.split('.')[0]));
		assert.deepStrictEqual(
			Object.keys(JournalHeader.shape).filter((key) => !compared.has(key)),
			['type', 'journal', 'generated_at']
		);
	});

	test('several differences are all listed', () => {
		const differences = diff_journal_header(HEADER, { ...HEADER, rounds: 9, node: 'v26.0.0' });
		assert.deepStrictEqual(
			differences.map((d) => [d.field, d.journal, d.current]),
			[
				['rounds', 4, 9],
				['node', 'v24.14.1', 'v26.0.0']
			]
		);
	});
});
