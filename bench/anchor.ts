/**
 * The anchor: a fixed workload measured at the start and end of a run, and of
 * each segment of a resumed one. No measured library is involved in it, so a
 * change between readings is the machine changing state (heat, frequency
 * scaling, another process), and the run's absolute numbers are then suspect.
 *
 * The workload reads a string by character code, looks classes up in a typed
 * array, steps a small state machine, and writes to a typed array: the shapes a
 * tokenizer leans on, so it tracks what the measured libraries are sensitive to.
 *
 * Ported from the benchmark harness of Twinkleplop
 * (https://github.com/pngwn/twinkleplop, MIT).
 *
 * Node-only: it reads the process's clock.
 *
 * @module
 */

import { BENCH_ANCHOR_STABLE_BELOW, type BenchAnchor } from '../src/lib/results_schema.ts';

const TEXT_LENGTH = 65_536;

/**
 * A fixed pseudo-source, from a linear congruential generator so it is the same
 * bytes everywhere. Joined rather than concatenated: a string built by appending
 * is a tree until something flattens it, which made a first reading slow.
 */
const ANCHOR_TEXT = ((): string => {
	let seed = 0x2545f491;
	const next = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
	const alphabet =
		'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$ \n\t{}()[];:,."\'`+-*/=<>!&|';
	const chars: Array<string> = [];
	for (let i = 0; i < TEXT_LENGTH; i++) chars.push(alphabet[next() % alphabet.length]!);
	return chars.join('');
})();

const CHAR_CLASSES = ((): Uint8Array => {
	const classes = new Uint8Array(128);
	for (let c = 0; c < 128; c++) {
		if ((c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95 || c === 36) classes[c] = 1;
		else if (c >= 48 && c <= 57) classes[c] = 2;
		else if (c === 32 || c === 9 || c === 10 || c === 13) classes[c] = 3;
		else if (c === 34 || c === 39 || c === 96) classes[c] = 4;
		else classes[c] = 5;
	}
	return classes;
})();

const TRANSITIONS = ((): Uint16Array => {
	const transitions = new Uint16Array(8 * 8);
	for (let s = 0; s < 8; s++) {
		for (let c = 0; c < 8; c++) transitions[s * 8 + c] = (s * 3 + c * 5) % 8;
	}
	return transitions;
})();

const OUT = new Uint32Array(TEXT_LENGTH * 3);

/** One pass of the workload. Deterministic, so its checksum is always the same. */
export const run_anchor_workload = (): number => {
	const text = ANCHOR_TEXT;
	const classes = CHAR_CLASSES;
	const transitions = TRANSITIONS;
	const out = OUT;
	let state = 0;
	let n = 0;
	let checksum = 0;
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		const cls = code < 128 ? classes[code]! : 5;
		const next = transitions[state * 8 + cls]!;
		if (next !== state) {
			const o = n * 3;
			out[o] = state;
			out[o + 1] = i;
			out[o + 2] = i + 1;
			n++;
			state = next;
		}
		checksum = (checksum + cls * next) | 0;
	}
	return checksum + n;
};

const NS_PER_MS = 1e6;
const WARMUP_MS = 60;
const ITERATIONS = 24;
const REPEATS = 8;
const MAX_ATTEMPTS = 10;
/** Two readings in a row this close are taken as the reading. */
const AGREEMENT = 0.03;

/**
 * Measures the anchor.
 *
 * Both readings of a run have to be taken at the same tier of optimisation, or
 * the drift they report is the engine warming up. So the workload is warmed for
 * a fixed time, the reading is the best of several repeats, and it is retaken
 * until two in a row agree, so one interrupt can't become the reading.
 *
 * @returns nanoseconds per pass of the workload
 */
export const measure_anchor = (): number => {
	let sink = 0;
	const warm = (): void => {
		const deadline = process.hrtime.bigint() + BigInt(WARMUP_MS * NS_PER_MS);
		do {
			sink += run_anchor_workload();
		} while (process.hrtime.bigint() < deadline);
	};
	const read_best = (): number => {
		let best = Infinity;
		for (let r = 0; r < REPEATS; r++) {
			const start = process.hrtime.bigint();
			for (let i = 0; i < ITERATIONS; i++) sink += run_anchor_workload();
			best = Math.min(best, Number(process.hrtime.bigint() - start) / ITERATIONS);
		}
		return best;
	};
	warm();
	let previous = read_best();
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		warm();
		const current = read_best();
		const agree = Math.abs(current - previous) / Math.min(current, previous) <= AGREEMENT;
		previous = current;
		if (agree) break;
	}
	if (!Number.isFinite(sink)) throw new Error('the anchor workload returned no checksum');
	return previous;
};

/**
 * Compares the anchor readings taken around a run: one before its first process
 * and one after its last, and the same around every segment of a run that was
 * stopped and resumed.
 *
 * The drift is that of the two readings that differ most, so a machine that
 * changed state between segments, or within one, is not hidden by readings that
 * happen to agree at the two ends.
 *
 * @param readings_ns - every reading, in the order taken: at least two
 * @returns the drift from the earlier of those two readings to the later,
 * positive when the machine got slower, and whether it stayed under
 * `BENCH_ANCHOR_STABLE_BELOW`
 */
export const to_anchor_drift = (readings_ns: ReadonlyArray<number>): BenchAnchor => {
	if (readings_ns.length < 2) throw new Error('an anchor needs a reading at each end');
	let drift = 0;
	for (const [i, earlier] of readings_ns.entries()) {
		for (const later of readings_ns.slice(i + 1)) {
			const change = (later - earlier) / earlier;
			if (Math.abs(change) > Math.abs(drift)) drift = change;
		}
	}
	return { drift, stable: Math.abs(drift) < BENCH_ANCHOR_STABLE_BELOW };
};
