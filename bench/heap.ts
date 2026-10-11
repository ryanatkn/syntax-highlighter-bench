/**
 * Retained heap: what a page or a server holds after loading one language of a
 * library and highlighting once.
 *
 * For each library and each timed language it claims, a Node process imports
 * the library's `single:<lang>` bundle (the one whose size is reported, from the
 * bundles cache `bench/sizes.ts` writes), highlights the language's harness
 * snippet once, lets go of the HTML, and collects garbage until the heap
 * settles. It then reads three numbers:
 *
 * - **retained**: the bytes used in every V8 heap space but the two that hold
 *   machine code (`HEAP_CODE_SPACES`).
 * - **code**: the bytes used in those two. They hold the regular expressions V8
 *   compiled to native code as well as optimized functions, so a regexp engine
 *   holds much of its memory here. Machine code is the architecture's: the
 *   figure is x64's.
 * - **external**: `process.memoryUsage().external`, the memory V8 is told about
 *   but doesn't lay out itself: array buffers, and a WebAssembly engine's linear
 *   memory, counted at the size it has grown to, which it never gives back. The
 *   OS backs only the pages it has touched, so resident memory can be lower.
 *
 * A bare process for the language, the same module without the import and the
 * call, is read the same way, and each number is reported over it, in
 * kibibytes. The highlight is of a small snippet: larger inputs leave more,
 * most of all for regexp and wasm engines.
 *
 * **A module of its own, not the bundle check.** `bench/bundle_check.ts` is a
 * TypeScript module that imports zod, the corpus, and the adapter before any of
 * its code runs, and the adapter imports every language of some libraries. A
 * reading there would carry all of that, and Node's type stripper. So the
 * process runs a generated module with nothing of the harness in it, as a
 * cold-start process does (`to_heap_child_source`), and its call is the
 * adapter's `bundle_html_source`, which the bundle check ties to `bundle_html`.
 *
 * **Flags.** The process runs with `HEAP_NODE_FLAGS`: `--expose-gc` for the
 * collections; a pinned semi-space size, because V8 sizes its young generation
 * from the machine's memory and a small one leaves a library holding a
 * different amount; and `--single-threaded`, because work V8 compiles on other
 * threads lands before the reading or after it, which moved Shiki's figures by
 * kilobytes from one process to the next. The flags are for this reading only:
 * no timed number is measured with a flag.
 *
 * **Determinism.** The figures depend on the library's version, the Node
 * version (V8's object layout), and the platform: they are for the Node version
 * the check workflow pins, on x64, with pointer compression off as official
 * Node builds have it. Two readings agree to well under a kibibyte, and a check
 * still compares them within a tolerance (`heap_readings_agree`).
 *
 * Node-only.
 *
 * @module
 */

import { execFile } from 'node:child_process';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { map_concurrent } from '@fuzdev/fuz_util/async.js';
import { z } from 'zod';

import { BenchHeap, type BenchResults } from '../src/lib/results_schema.ts';
import type { HighlighterAdapter } from './adapter.ts';
import { load_corpus_manifest, read_corpus_input } from './corpus.ts';
import { TIMED_LANGS } from './langs.ts';
import { to_single_set_id } from './sets.ts';
import { BUNDLES_DIR, to_bundle_file_name, write_if_changed } from './sizes.ts';

const REPO_DIR = fileURLToPath(new URL('../', import.meta.url));

/** Where the generated modules of the heap processes are written. */
export const HEAP_DIR = join(
	REPO_DIR,
	'node_modules',
	'.cache',
	'syntax-highlighter-bench',
	'heap'
);

/**
 * The flags of a heap process. The semi-space size is pinned at a size the
 * figures no longer move above, so a machine with little memory, whose default
 * is smaller, reads the same. One thread, so no compilation finishes on another
 * thread between the collections and the reading.
 */
export const HEAP_NODE_FLAGS: ReadonlyArray<string> = [
	'--expose-gc',
	'--max-semi-space-size=16',
	'--single-threaded'
];

/** The heap spaces of machine code, read apart from the rest of the heap. */
export const HEAP_CODE_SPACES: ReadonlyArray<string> = ['code_space', 'code_large_object_space'];

/**
 * A collection that changes the heap by less than this, in bytes, has settled
 * it. Not zero: a collection can move a few hundred bytes back and forth
 * indefinitely, more often on a busy machine.
 */
export const HEAP_SETTLED_BELOW_BYTES = 1024;

/** How many full collections a heap process runs, at most, waiting for the heap to settle. */
export const HEAP_MAX_COLLECTIONS = 50;

/** What a heap process highlights, and the call it makes. */
export interface HeapHighlight {
	/** The source to highlight. */
	src: string;
	/** The call, as an adapter's `bundle_html_source` gives it. */
	expression: string;
}

/**
 * Writes the module a heap process runs. It holds the source to highlight as a
 * literal, imports the bundle and highlights once, drops the HTML, collects
 * until `used_heap_size` settles (`HEAP_SETTLED_BELOW_BYTES`), and prints one `HeapChildOutput`. The bare
 * module of the language is the same without the import and the call, so what
 * the two share, the snippet's text among it, cancels out.
 *
 * @param entry - the specifier of the bundle, or null for the bare baseline
 * @param highlight - what to highlight; for the bare baseline, only its `src` is used
 * @returns the source of an ES module
 */
export const to_heap_child_source = (entry: string | null, highlight: HeapHighlight): string =>
	[
		'// generated by bench/heap.ts: one heap reading, and nothing of the harness',
		...(entry === null ? [] : [`import * as exports from ${JSON.stringify(entry)};`]),
		"const v8 = process.getBuiltinModule('node:v8');",
		`const src = ${JSON.stringify(highlight.src)};`,
		...(entry === null
			? ['const html_length = 0;']
			: [
					`let html = ${highlight.expression};`,
					"if (typeof html !== 'string' || html.length === 0) throw new Error('produced no HTML');",
					'const html_length = html.length;',
					'html = null;'
				]),
		'let used = -Infinity;',
		'let collections = 0;',
		`while (collections < ${HEAP_MAX_COLLECTIONS}) {`,
		'\tglobalThis.gc();',
		'\tcollections++;',
		'\tconst now = v8.getHeapStatistics().used_heap_size;',
		`\tif (Math.abs(now - used) < ${HEAP_SETTLED_BELOW_BYTES}) break;`,
		'\tused = now;',
		'}',
		`const code_spaces = ${JSON.stringify(HEAP_CODE_SPACES)};`,
		'let heap_bytes = 0;',
		'let code_bytes = 0;',
		'for (const space of v8.getHeapSpaceStatistics()) {',
		'\tif (code_spaces.includes(space.space_name)) code_bytes += space.space_used_size;',
		'\telse heap_bytes += space.space_used_size;',
		'}',
		'const external_bytes = process.memoryUsage().external;',
		'process.stdout.write(',
		'\tJSON.stringify({',
		'\t\theap_bytes,',
		'\t\tcode_bytes,',
		'\t\texternal_bytes,',
		'\t\tcollections,',
		`\t\tsettled: collections < ${HEAP_MAX_COLLECTIONS},`,
		`\t\texports: ${entry === null ? '0' : 'Object.keys(exports).length'},`,
		'\t\thtml_length',
		"\t}) + '\\n',",
		// exits once the line is written, whatever handle the library left open
		'\t(error) => process.exit(error ? 1 : 0)',
		');',
		''
	].join('\n');

/** What a heap process prints. */
export const HeapChildOutput = z.strictObject({
	heap_bytes: z.number().int().positive(),
	code_bytes: z.number().int().nonnegative(),
	external_bytes: z.number().int().nonnegative(),
	collections: z.number().int().positive(),
	settled: z.boolean().meta({
		description: 'Whether a collection changed the heap by under `HEAP_SETTLED_BELOW_BYTES`.'
	}),
	exports: z.number().int().nonnegative(),
	html_length: z.number().int().nonnegative()
});
export type HeapChildOutput = z.infer<typeof HeapChildOutput>;

/**
 * Runs a heap process with `HEAP_NODE_FLAGS`.
 *
 * @throws if the process fails, prints something else, or its heap never settled
 */
export const run_heap_child = (path: string, label: string): Promise<HeapChildOutput> =>
	new Promise((resolve, reject) => {
		execFile(
			process.execPath,
			[...HEAP_NODE_FLAGS, path],
			{ cwd: REPO_DIR, maxBuffer: 1024 * 1024, timeout: 5 * 60_000 },
			(error, stdout, stderr) => {
				if (error) {
					reject(new Error(`${label} failed: ${stderr.trim() || error.message}`));
					return;
				}
				let output: HeapChildOutput;
				try {
					output = HeapChildOutput.parse(JSON.parse(stdout));
				} catch {
					reject(
						new Error(`${label} printed something other than its reading: ${stdout.slice(0, 200)}`)
					);
					return;
				}
				if (!output.settled) {
					reject(
						new Error(
							`${label}: the heap was still changing after ${HEAP_MAX_COLLECTIONS} collections`
						)
					);
					return;
				}
				resolve(output);
			}
		);
	});

/**
 * A library's reading over the bare one, in kibibytes. A reading under the
 * bare one is zero: the library holds nothing more there.
 */
export const to_bench_heap = (
	reading: Pick<HeapChildOutput, 'heap_bytes' | 'code_bytes' | 'external_bytes'>,
	bare: Pick<HeapChildOutput, 'heap_bytes' | 'code_bytes' | 'external_bytes'>
): BenchHeap =>
	BenchHeap.parse({
		retained_kb: Math.max(0, Math.round((reading.heap_bytes - bare.heap_bytes) / 1024)),
		code_kb: Math.max(0, Math.round((reading.code_bytes - bare.code_bytes) / 1024)),
		external_kb: Math.max(0, Math.round((reading.external_bytes - bare.external_bytes) / 1024))
	} satisfies BenchHeap);

/** How `measure_heaps` is run. */
export interface MeasureHeapsOptions {
	/** Where the bundles are, as `measure_bundles` wrote them. */
	bundles_dir?: string;
	/** Where the generated modules are written. */
	dir?: string;
	/** How many processes run at once. */
	concurrency?: number;
	/** Receives progress. */
	log?: (line: string) => void;
}

/**
 * Reads the retained heap of every library on every timed language it claims,
 * from the `single:<lang>` bundles `measure_bundles` wrote.
 *
 * @returns the `heap` section of a results file
 * @throws if a process fails, a bundle exports nothing, or a highlight returns no HTML
 */
export const measure_heaps = async (
	adapters: ReadonlyArray<HighlighterAdapter>,
	options: MeasureHeapsOptions = {}
): Promise<BenchResults['heap']> => {
	const { bundles_dir = BUNDLES_DIR, dir = HEAP_DIR, concurrency = 1, log } = options;
	const { inputs } = load_corpus_manifest();
	const to_specifier = (from: string, to: string): string => {
		const path = relative(dirname(from), to).split(sep).join('/');
		return path.startsWith('.') ? path : `./${path}`;
	};
	/** The bare module of each language, written once however many libraries claim it. */
	const bare_paths: Map<string, string> = new Map();
	const planned: Array<{ library: string; lang: string; path: string; bare_path: string }> = [];
	for (const adapter of adapters) {
		for (const lang of TIMED_LANGS) {
			if (!Object.hasOwn(adapter.langs, lang)) continue;
			const snippet = inputs.find((input) => input.source === 'harness' && input.lang === lang);
			if (!snippet) throw new Error(`lang "${lang}" has no harness snippet to highlight`);
			const highlight = {
				src: read_corpus_input(snippet),
				expression: adapter.bundle_html_source(lang)
			};
			let bare_path = bare_paths.get(lang);
			if (bare_path === undefined) {
				bare_path = join(dir, 'bare', `${lang}.mjs`);
				write_if_changed(bare_path, to_heap_child_source(null, highlight));
				bare_paths.set(lang, bare_path);
			}
			const path = join(dir, adapter.id, `${lang}.mjs`);
			const bundle_path = join(
				bundles_dir,
				adapter.id,
				to_bundle_file_name(to_single_set_id(lang))
			);
			write_if_changed(path, to_heap_child_source(to_specifier(path, bundle_path), highlight));
			planned.push({ library: adapter.id, lang, path, bare_path });
		}
	}
	const bares: Map<string, HeapChildOutput> = new Map();
	await map_concurrent([...bare_paths], concurrency, async ([lang, path]) => {
		bares.set(lang, await run_heap_child(path, `the bare heap process of ${lang}`));
	});
	const readings = await map_concurrent(planned, concurrency, async (p) => {
		const label = `the heap process of ${p.library} on ${p.lang}`;
		const reading = await run_heap_child(p.path, label);
		if (reading.exports === 0) throw new Error(`${label}: the bundle exports nothing`);
		if (reading.html_length === 0) throw new Error(`${label}: the highlight returned no HTML`);
		return reading;
	});
	const heap: BenchResults['heap'] = {};
	for (const [i, p] of planned.entries()) {
		(heap[p.library] ??= {})[p.lang] = to_bench_heap(readings[i]!, bares.get(p.lang)!);
	}
	log?.(`read the retained heap of ${planned.length} library languages`);
	return heap;
};
