/**
 * The journal of a timed run: every process's result, appended to a file as it
 * arrives, so a run that is stopped can be resumed instead of measured again.
 *
 * The file is JSON lines. The first is a header recording everything that must
 * be the same for the rest to belong to one run. Each stretch of measuring, a
 * segment, then adds a line with its opening anchor reading, a line for every
 * process result, a cell's or a cold-start sample's, and a line with its
 * closing anchor reading when the harness got to take one. Every line after the
 * header carries the milliseconds since its segment started, which is how a
 * run's duration survives a stop.
 *
 * A line is written and synced in one call, between processes, so a crash can
 * only cut the last line short. A last line with no newline is dropped when the
 * journal is read. A complete line that doesn't parse is not a crash, and the
 * journal is refused.
 *
 * Node-only.
 *
 * @module
 */

import {
	appendFileSync,
	closeSync,
	fsyncSync,
	openSync,
	readFileSync,
	truncateSync
} from 'node:fs';
import * as s from '@fuzdev/fuz_schema/schema.ts';
import { meta } from '@fuzdev/fuz_schema/meta.ts';

import {
	BenchDatetime,
	BenchMachine,
	BenchRunFilters,
	NonEmptyString,
	NonnegativeInt,
	NonnegativeNumber,
	PositiveInt,
	PositiveNumber
} from '../src/lib/results_schema.ts';
import { CellResult } from './cell.ts';
import { StartupResult } from './coldstart.ts';

/**
 * The version of the journal: its format, and how the results in it were
 * measured. A journal of another version is refused, so a resumed run never
 * pools results taken by another method.
 */
export const JOURNAL_VERSION = 5;

/** The entries of `BenchMachine` a journal records. */
const { name, cpu, threads, governor, cpufreq_driver, epp, boost, os_release } = BenchMachine.def;

/**
 * What a journal says about the run it belongs to. A run resumes a journal only
 * when every field but `generated_at` is the same for it.
 */
export const JournalHeader = s.object({
	type: s.literal('header'),
	journal: s.literal(JOURNAL_VERSION),
	generated_at: meta(BenchDatetime, { description: 'When the first segment started.' }),
	kind: s.one_of(['full', 'calibrate']),
	passes: PositiveInt,
	rounds: PositiveInt,
	target_ms: PositiveNumber,
	warmup_ms: NonnegativeNumber,
	rewarm_ms: NonnegativeNumber,
	retries: NonnegativeInt,
	startup_samples: PositiveInt,
	startup_discard: NonnegativeInt,
	filters: BenchRunFilters,
	corpus_hash: NonEmptyString,
	libraries: s.array(
		s.object({
			id: NonEmptyString,
			version: NonEmptyString,
			extra_packages: s.optional(s.record(s.string))
		})
	),
	machine: meta(s.object({ name, cpu, threads, governor, cpufreq_driver, epp, boost }), {
		description: "What of the machine can change what is measured: not its memory's size."
	}),
	os_release,
	node: NonEmptyString,
	node_options: meta(s.string, {
		description: 'The `NODE_OPTIONS` the processes inherit, empty when it is unset.'
	}),
	commit: NonEmptyString
});
export type JournalHeader = s.Infer<typeof JournalHeader>;

const at_ms = meta(NonnegativeInt, { description: 'Milliseconds since the segment started.' });

/** A line after the header. */
export const JournalEntry = s.variant('type', [
	s.object({
		type: s.literal('segment'),
		at_ms,
		anchor_ns: meta(PositiveNumber, { description: "The segment's opening anchor reading." }),
		load: meta(NonnegativeNumber, {
			description: "The 1-minute load average when the segment's run was planned."
		})
	}),
	s.object({
		type: s.literal('result'),
		at_ms,
		pass: NonnegativeInt,
		attempt: NonnegativeInt,
		result: CellResult
	}),
	s.object({
		type: s.literal('startup'),
		at_ms,
		round: NonnegativeInt,
		result: StartupResult
	}),
	s.object({
		type: s.literal('anchor'),
		at_ms,
		anchor_ns: meta(PositiveNumber, { description: "The segment's closing anchor reading." })
	})
]);
export type JournalEntry = s.Infer<typeof JournalEntry>;

/** Identifies one process of a run: a library's pass on a cell, in one attempt. */
export const to_journal_key = (
	cell: string,
	library: string,
	pass: number,
	attempt: number
): string => JSON.stringify([cell, library, pass, attempt]);

/** Identifies one cold-start process of a run: a scenario's sample in one round. */
export const to_startup_journal_key = (key: string, round: number): string =>
	JSON.stringify([key, round]);

/** What a journal holds. */
export interface Journal {
	header: JournalHeader;
	/** Every cell process's result, by `to_journal_key`. */
	results: Map<string, CellResult>;
	/** Every cold-start process's result, by `to_startup_journal_key`. */
	startup: Map<string, StartupResult>;
	/** Every anchor reading, in the order taken. */
	readings_ns: Array<number>;
	/** Each segment's load average at its start, in order. */
	loads: Array<number>;
	/** How many segments the journal records. */
	segments: number;
	/** How long those segments measured for, in milliseconds. */
	duration_ms: number;
	/** The length of the file up to its last complete line. A resume appends from here. */
	complete_bytes: number;
}

/** A journal, or why it can't be read. */
export type ReadJournalResult = ({ ok: true } & Journal) | { ok: false; message: string };

/**
 * Parses a journal.
 *
 * @param bytes - the file's content
 * @returns the journal without a last line that was cut short, or what is wrong
 * with it: no complete header, or a complete line that isn't a journal line
 */
export const parse_journal = (bytes: Buffer): ReadJournalResult => {
	const complete_bytes = bytes.lastIndexOf(0x0a) + 1;
	const lines = bytes.subarray(0, complete_bytes).toString('utf8').split('\n').slice(0, -1);
	const parse_line = (line: string): unknown => {
		try {
			return JSON.parse(line);
		} catch {
			return undefined;
		}
	};
	const header = s.parse(JournalHeader, parse_line(lines[0] ?? ''));
	if (!header.ok) return { ok: false, message: 'it has no header this harness can read' };
	const results: Map<string, CellResult> = new Map();
	const startup: Map<string, StartupResult> = new Map();
	const readings_ns: Array<number> = [];
	const loads: Array<number> = [];
	let segments = 0;
	let duration_ms = 0;
	let segment_ms = 0;
	for (const [i, line] of lines.entries()) {
		if (i === 0) continue;
		const parsed = s.parse(JournalEntry, parse_line(line));
		if (!parsed.ok) return { ok: false, message: `line ${i + 1} is not a journal line` };
		const entry = parsed.value;
		if (entry.type === 'segment') {
			segments++;
			duration_ms += segment_ms;
			loads.push(entry.load);
		} else if (segments === 0) {
			return { ok: false, message: `line ${i + 1} comes before any segment` };
		}
		segment_ms = entry.at_ms;
		if (entry.type === 'result') {
			const { cell, library } = entry.result;
			const key = to_journal_key(cell, library, entry.pass, entry.attempt);
			if (results.has(key)) return { ok: false, message: `line ${i + 1} repeats a result` };
			results.set(key, entry.result);
		} else if (entry.type === 'startup') {
			const key = to_startup_journal_key(entry.result.key, entry.round);
			if (startup.has(key)) return { ok: false, message: `line ${i + 1} repeats a result` };
			startup.set(key, entry.result);
		} else {
			readings_ns.push(entry.anchor_ns);
		}
	}
	return {
		ok: true,
		header: header.value,
		results,
		startup,
		readings_ns,
		loads,
		segments,
		duration_ms: duration_ms + segment_ms,
		complete_bytes
	};
};

/**
 * Reads a journal file.
 *
 * @throws if the file can't be read
 */
export const read_journal = (path: string): ReadJournalResult => parse_journal(readFileSync(path));

/** One way a journal's run differs from the run that would resume it. */
export interface JournalDifference {
	/** The field, like `rounds` or `filters.langs`. */
	field: string;
	journal: unknown;
	current: unknown;
}

/**
 * Lists the fields in which a journal's run and the current one differ. Any
 * difference means the journal's results and new ones would not be one run.
 * `generated_at` is not compared: it is when the first segment started.
 *
 * @param journal - the header a journal was started with
 * @param current - the header this run would start one with
 */
export const diff_journal_header = (
	journal: JournalHeader,
	current: JournalHeader
): Array<JournalDifference> => {
	const flatten = (header: JournalHeader): Record<string, unknown> => {
		const { type: _type, journal: _journal, generated_at: _, filters, machine, ...rest } = header;
		return {
			...rest,
			...Object.fromEntries(Object.entries(filters).map(([k, v]) => [`filters.${k}`, v])),
			...Object.fromEntries(Object.entries(machine).map(([k, v]) => [`machine.${k}`, v]))
		};
	};
	const a = flatten(journal);
	const b = flatten(current);
	return Object.keys(a)
		.filter((field) => JSON.stringify(a[field]) !== JSON.stringify(b[field]))
		.map((field) => ({ field, journal: a[field], current: b[field] }));
};

/** A journal open for appending. */
export interface JournalWriter {
	/** Appends a line and syncs it to disk before returning. */
	append: (entry: JournalEntry) => void;
	/** Closes the file. Safe to call again. */
	close: () => void;
}

/**
 * Opens a journal to append to.
 *
 * @param path - the journal file
 * @param start - the header of a new journal, which must not exist yet, or the
 * `complete_bytes` of one being resumed, which is cut back to that length
 * @throws if a new journal already exists, or the file can't be written
 */
export const open_journal = (path: string, start: JournalHeader | number): JournalWriter => {
	let fd: number | null;
	const write = (line: unknown): void => {
		if (fd === null) throw new Error('the journal is closed');
		// loops until the whole line is written
		appendFileSync(fd, JSON.stringify(line) + '\n');
		fsyncSync(fd);
	};
	if (typeof start === 'number') {
		truncateSync(path, start);
		fd = openSync(path, 'a');
	} else {
		fd = openSync(path, 'ax');
		write(start);
	}
	return {
		append: write,
		close: () => {
			if (fd === null) return;
			closeSync(fd);
			fd = null;
		}
	};
};
