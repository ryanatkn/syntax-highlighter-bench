/**
 * Generates the stress inputs: sources chosen to find each library's worst
 * cases, kept under `stress/` so they are never pooled with the neutral set.
 * This script owns that directory, and every file there is its output.
 *
 * Two kinds:
 *
 * - **derived** — a neutral input transformed, as real code is shipped: the
 *   JS and CSS minified by esbuild (`minify_with_esbuild`, as the bundle sizes
 *   are), and the JSON serialized again with no
 *   whitespace. Each keeps its source's pins as provenance and names the
 *   transformation in `derivation`. esbuild's version is part of it, since
 *   another version may minify to other bytes.
 * - **written** — a pathological file generated here: deep nesting,
 *   very long lines, unterminated constructs, and the runs of delimiters that
 *   make a backtracking pattern retry. No provenance, and a first comment saying
 *   what it stresses, in every language that has comments.
 *
 * No measured library authored any of them, and none is tuned to any library:
 * a library that fails or crawls on one is a finding.
 *
 * ```bash
 * node bench/corpus_stress.ts          # write stress/, then the manifest and the table of inputs
 * node bench/corpus_stress.ts --check  # fail if a file or a manifest entry differs from what regenerates
 * ```
 *
 * @module
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { BenchProvenance } from '../src/lib/results_schema.ts';
import {
	CORPUS_DIR,
	CORPUS_MANIFEST_PATH,
	CorpusManifestSeed,
	hash_sha256,
	load_corpus_manifest,
	write_corpus_manifest,
	type LoadedCorpusManifest
} from './corpus.ts';
import type { Lang } from './langs.ts';
import { minify_with_esbuild } from './sizes.ts';

/** The directory, within the corpus, that this script owns. */
export const STRESS_DIR = 'stress/';

/** One generated input: its bytes and the hand-written fields of its manifest entry. */
export interface StressInput {
	file: string;
	content: string;
	synthetic: boolean;
	provenance: Array<BenchProvenance>;
	derivation: string | null;
}

/** How a derived input is made from its source's text. */
interface StressDerivation {
	/** Names the transformation and the version of the tool that makes it. */
	describe: () => Promise<string>;
	derive: (source: string, file: string) => Promise<string>;
}

/**
 * Minified by esbuild, as the bundle sizes are. esbuild ends the output with a
 * newline.
 */
const create_minify_derivation = (loader: 'js' | 'css'): StressDerivation => ({
	describe: async () => {
		const { version } = await import('esbuild');
		return `minified by esbuild ${version}`;
	},
	derive: (source, file) => minify_with_esbuild(source, file, loader)
});

const MINIFY_JSON: StressDerivation = {
	describe: () => Promise.resolve('minified: parsed and serialized again with no whitespace'),
	derive: (source) => Promise.resolve(JSON.stringify(JSON.parse(source)) + '\n')
};

/**
 * The derived inputs: one neutral input of each language that ships minified,
 * picked so the result stays under the large neutral inputs in size while being
 * one long line. The JS is the large neutral input (the medium one
 * minifies to a few KB), the CSS the medium one (the large stylesheet stays
 * several hundred KB), and the JSON the large one.
 */
export const STRESS_DERIVED: ReadonlyArray<{
	file: string;
	from: string;
	derivation: StressDerivation;
}> = [
	{
		file: 'stress/js/client.min.js',
		from: 'neutral/js/client.js',
		derivation: create_minify_derivation('js')
	},
	{
		file: 'stress/css/default.min.css',
		from: 'neutral/css/default.css',
		derivation: create_minify_derivation('css')
	},
	{ file: 'stress/json/ast.min.json', from: 'neutral/json/ast.json', derivation: MINIFY_JSON }
];

const tabs = (depth: number): string => '\t'.repeat(depth);

/** Joins lines, ending the file with a newline. */
const to_file = (lines: ReadonlyArray<string>): string => lines.join('\n') + '\n';

const nested_blocks_ts = (): string => {
	const DEPTH = 40;
	const lines = [
		'// stress: statements, object literals, arrays, and generic types nested far deeper than code',
		'// is written, each level indented one more tab',
		'',
		'type Row = { a: Array<[number, string]> };',
		'',
		'export function walk(v: Array<number>, m: Map<string, Array<Row>>): number {',
		'\tlet total = 0;'
	];
	const openers = [
		(d: number) => `if (v[${d}]! > ${d}) {`,
		(d: number) => `for (const x${d} of v) {`,
		(d: number) => `while (total < ${d * 10}) {`,
		() => `try {`,
		(d: number) => `const f${d} = (y: number): number => {`
	];
	const closers = [
		() => '}',
		() => '}',
		() => '}',
		(d: number) => `} catch (e${d}: unknown) {\n${tabs(d + 1)}total--;\n${tabs(d + 1)}}`,
		(d: number) => `};\n${tabs(d + 1)}total += f${d}(${d});`
	];
	for (let d = 0; d < DEPTH; d++) {
		const i = tabs(d + 1);
		lines.push(i + openers[d % openers.length]!(d));
		lines.push(`${i}\tconst o${d}: Row = { a: [[${d}, \`k\${total}${d}\`]] };`);
		lines.push(`${i}\ttotal += o${d}.a.length + (m.get('k${d}')?.[0]?.a[0]?.[0] ?? ${d});`);
	}
	for (let d = DEPTH - 1; d >= 0; d--) {
		lines.push(tabs(d + 1) + closers[d % closers.length]!(d));
	}
	lines.push('\treturn total;', '}', '');

	const VALUE_DEPTH = 120;
	let value = 'null';
	for (let d = VALUE_DEPTH - 1; d >= 0; d--) {
		value =
			d % 3 === 0
				? `{ k${d}: ${value}, n: ${d} }`
				: d % 3 === 1
					? `[${d}, ${value}, 'v${d}']`
					: `(${value} ?? ${d})`;
	}
	lines.push(`export const deep = ${value};`, '');

	const TYPE_DEPTH = 40;
	const wrappers = ['Array<', 'Promise<', 'Map<string, ', 'Readonly<', 'Record<`k${number}`, '];
	const type =
		Array.from({ length: TYPE_DEPTH }, (_, d) => wrappers[d % wrappers.length]).join('') +
		'number' +
		'>'.repeat(TYPE_DEPTH);
	lines.push(`export type Deep = ${type};`);
	return to_file(lines);
};

const long_line_ts = (): string => {
	const ROWS = 180;
	const rows = Array.from(
		{ length: ROWS },
		(_, i) =>
			`{ id: ${i}, name: 'row ${i}', ok: ${i % 2 === 0}, at: new Date(${i * 1000}), re: /r${i}[a-z]+\\d*/gu, t: \`t\${${i} * 2}\`, n: ${i}n, u: undefined as number | undefined } satisfies Row`
	);
	return to_file([
		'// stress: one line of ordinary TypeScript tokens, tens of KB long, as generated code writes it',
		'',
		'interface Row {',
		'\tid: number;',
		'\tname: string;',
		'\tok: boolean;',
		'\tat: Date;',
		'\tre: RegExp;',
		'\tt: string;',
		'\tn: bigint;',
		'\tu?: number;',
		'}',
		'',
		`export const rows: ReadonlyArray<Row> = [${rows.join(', ')}] as const;`
	]);
};

/** Ordinary code, repeated after an unterminated comment, holding `/*` and no close. */
const ordinary_js = (i: number): Array<string> => [
	`export const route_${i} = { pattern: '/files/*', glob: 'src/*', depth: ${i} };`,
	`export function handle_${i}(request, params = {}) {`,
	`\tconst url = new URL(request.url);`,
	`\tif (/^\\/api\\/v${i}\\//.test(url.pathname) && params.id !== undefined) {`,
	`\t\treturn { status: 200, body: \`item \${params.id} of ${i}\` };`,
	`\t}`,
	`\tconst ratio = (url.search.length / ${i + 1}) * 100;`,
	`\treturn { status: ratio > 50 ? 404 : 301, body: "moved: " + url.pathname };`,
	`}`,
	''
];

const unterminated_js = (): string => {
	const lines = [
		'// stress: an unterminated string, then an unterminated block comment near the top, so by the',
		'// language everything after it is comment; the code that follows holds many openers and no close',
		'',
		"const greeting = 'an unterminated single-quoted string",
		'const label = "an unterminated double-quoted string',
		'const ok = true;',
		'',
		'/* an unterminated block comment',
		''
	];
	for (let i = 0; i < 40; i++) lines.push(...ordinary_js(i));
	return to_file(lines);
};

const nested_templates_js = (): string => {
	const DEPTH = 32;
	let template = '`leaf`';
	for (let d = DEPTH - 1; d >= 0; d--) {
		template = `\`l${d} \${${d % 2 === 0 ? `cond${d} ? ${template} : 'none'` : template}} end${d}\``;
	}
	const lines = [
		'// stress: template literals nested inside substitutions, deep and on one line, then many',
		'// shallower ones of the kind a view written in templates holds',
		'',
		`export const deep = (${Array.from({ length: DEPTH }, (_, d) => `cond${d}`).join(', ')}) =>`,
		`\t${template};`,
		''
	];
	for (let i = 0; i < 80; i++) {
		lines.push(
			`export const item_${i} = (row) => \`<li class="\${row.ok ? \`ok \${row.kind ?? \`k${i}\`}\` : 'no'}">\${row.items.map((x) => \`<b>\${x.name} \${\`\${x.count} / ${i}\`}</b>\`).join('')}</li>\`;`
		);
	}
	return to_file(lines);
};

const nested_json = (): string => {
	const DEPTH = 64;
	let value: unknown = { leaf: true, values: [1, -2.5e-3, 'end', null] };
	for (let d = DEPTH - 1; d >= 0; d--) {
		value =
			d % 2 === 0
				? { [`level_${d}`]: value, index: d, name: `l${d}`, flags: [d % 3 === 0, false] }
				: [d, value, { s: `\\u00e9 "q" ${d}` }];
	}
	const text = JSON.stringify(value, null, '\t') + '\n';
	JSON.parse(text);
	return text;
};

const nested_md = (): string => {
	const DEPTH = 24;
	const lines = [
		'<!-- stress: lists nested deep, and runs of emphasis, link, and code delimiters that never',
		'close, where a pattern that backtracks retries at every opener -->',
		'',
		'# Nested lists and unclosed emphasis',
		''
	];
	for (let d = 0; d < DEPTH; d++) {
		const indent = '  '.repeat(d);
		const marker = d % 3 === 0 ? '-' : d % 3 === 1 ? '*' : `${d}.`;
		lines.push(
			`${indent}${marker} level ${d} with **bold, *italic, _under, \`code and [a link](#l${d} still open`
		);
	}
	lines.push('', '## Delimiter runs', '');
	for (let i = 0; i < 40; i++) {
		lines.push(
			`${'*'.repeat((i % 7) + 1)}a ${'_'.repeat((i % 5) + 1)}b ${'**c '.repeat(12)}${'[d '.repeat(8)}${'`'.repeat((i % 4) + 1)}e ${'~~f '.repeat(6)}line ${i}`,
			''
		);
	}
	lines.push('> '.repeat(DEPTH) + 'a quote nested deep, with *emphasis that never closes', '');
	return to_file(lines);
};

const unclosed_html = (): string => {
	const lines = [
		'<!-- stress: tags that are never closed, attribute values without quotes, attributes without',
		'values, and stray angle brackets in text -->',
		'<!doctype html>',
		'<html lang=en>',
		'<head>',
		'<meta charset=utf-8>',
		'<title>unclosed',
		'<body class=page data-x=1 hidden>'
	];
	for (let i = 0; i < 70; i++) {
		lines.push(
			`<div id=d${i} class=row${i % 4} data-n=${i} tabindex=0 aria-hidden=false><p>text ${i} < ${i + 1} && ${i} > 0 <span title=t${i} style=color:red>open <b>bold <i>italic <a href=/p/${i}?q=1&r=2 target=_blank>link <li>item ${i} <input type=checkbox checked disabled value=v${i}><img src=i${i}.png alt=a${i}><td colspan=2>cell`
		);
	}
	lines.push('<p>a comment that opens and never closes: <!-- open', '</body>');
	return to_file(lines);
};

const selectors_css = (): string => {
	const SELECTORS = 240;
	const DEPTH = 32;
	const selector_list = Array.from(
		{ length: SELECTORS },
		(_, i) =>
			`.c${i} > a[href^='/p${i}']:not(.x${i}):is(:hover, :focus-visible)::before, #i${i} ~ li:nth-child(${i}n + 1)`
	).join(', ');
	const lines = [
		'/* stress: one rule with a very long selector list on one line, then rules nested deep with',
		'   the nesting selector */',
		'',
		`${selector_list} {`,
		'\tcolor: rgb(0 0 0 / 50%);',
		'}',
		''
	];
	for (let d = 0; d < DEPTH; d++) {
		lines.push(`${tabs(d)}${d === 0 ? '.root' : `& > .l${d}:where(.a, .b)`} {`);
		lines.push(`${tabs(d + 1)}margin: calc(${d}px + var(--gap, ${d / 2}rem));`);
		lines.push(`${tabs(d + 1)}--level-${d}: "l${d}";`);
	}
	for (let d = DEPTH - 1; d >= 0; d--) lines.push(`${tabs(d)}}`);
	return to_file(lines);
};

const nested_blocks_svelte = (): string => {
	const DEPTH = 24;
	const lines = [
		'<!-- stress: logic blocks, elements, and expressions in attributes nested deep -->',
		'<script lang="ts">',
		'\tconst { items, depth = 0 }: { items: Array<{ id: number; children: Array<number> }>; depth?: number } = $props();',
		'\tlet open = $state(true);',
		'</script>',
		''
	];
	for (let d = 0; d < DEPTH; d++) {
		const i = tabs(d);
		const block =
			d % 3 === 0
				? `{#if open && depth > ${d}}`
				: d % 3 === 1
					? `{#each items as item_${d} (item_${d}.id)}`
					: `{#await Promise.resolve(${d}) then v${d}}`;
		lines.push(i + block);
		lines.push(
			`${i}\t<div class="l${d} {open ? 'open' : ''}" data-d={${d} + depth} onclick={() => (open = !open)}>`
		);
	}
	for (let d = DEPTH - 1; d >= 0; d--) {
		const i = tabs(d);
		lines.push(`${i}\t</div>`);
		lines.push(i + (d % 3 === 0 ? '{/if}' : d % 3 === 1 ? '{/each}' : '{/await}'));
	}
	lines.push('', '<style>', '\t.l0 {', '\t\tcolor: red;', '\t}', '</style>');
	return to_file(lines);
};

const nested_sh = (): string => {
	const DEPTH = 16;
	let substitution = 'echo leaf';
	for (let d = DEPTH - 1; d >= 0; d--) substitution = `echo "l${d} $(${substitution})"`;
	let expansion = '${z}';
	for (let d = DEPTH - 1; d >= 0; d--) expansion = `\${v${d}:-${expansion}}`;
	const lines = [
		'#!/usr/bin/env bash',
		'# stress: command substitutions and parameter expansions nested deep, then control flow',
		'# nested deep',
		'set -euo pipefail',
		'',
		`deep=$(${substitution})`,
		`fallback="${expansion}"`,
		''
	];
	const LOOPS = 14;
	for (let d = 0; d < LOOPS; d++) {
		const i = tabs(d);
		if (d % 3 === 0) lines.push(`${i}if [[ -n "\${deep:-}" && $(( ${d} + 1 )) -gt 0 ]]; then`);
		else if (d % 3 === 1) lines.push(`${i}for f${d} in "\${files[@]:-a b}"; do`);
		else lines.push(`${i}case "\${mode:-x}" in`, `${i}\tx${d}|y${d})`);
		lines.push(`${i}\tprintf '%s\\n' "level ${d}: \${f${d}:-none} $(basename "$0")"`);
	}
	for (let d = LOOPS - 1; d >= 0; d--) {
		const i = tabs(d);
		if (d % 3 === 0) lines.push(`${i}fi`);
		else if (d % 3 === 1) lines.push(`${i}done`);
		else lines.push(`${i}\t;;`, `${i}esac`);
	}
	return to_file(lines);
};

const nested_rs = (): string => {
	const COMMENT_DEPTH = 24;
	const TYPE_DEPTH = 32;
	const BLOCK_DEPTH = 32;
	const wrappers = ['Vec<', 'Option<', 'Result<', 'Box<', 'HashMap<String, '];
	const closers = ['>', '>', ', Error>', '>', '>'];
	let type = 'u8';
	for (let d = TYPE_DEPTH - 1; d >= 0; d--) {
		type = wrappers[d % wrappers.length] + type + closers[d % closers.length];
	}
	const lines = [
		'// stress: block comments nested deep (Rust nests them), generic types nested deep, raw',
		'// strings holding quotes and hashes, and blocks nested deep',
		'',
		'use std::collections::HashMap;',
		'',
		'#[derive(Debug)]',
		'pub struct Error;',
		'',
		'/*'.repeat(COMMENT_DEPTH) + ' nested comment ' + '*/'.repeat(COMMENT_DEPTH),
		'',
		`pub type Deep = ${type};`,
		'',
		'pub const RAW: &str = r##"a raw string with "quotes", a "# and \\n inside"##;',
		'pub const RAW2: &str = r#"another with ## and "inner" text"#;',
		'',
		'pub fn walk(v: &[i64]) -> i64 {',
		'\tlet mut total: i64 = 0;'
	];
	for (let d = 0; d < BLOCK_DEPTH; d++) {
		const i = tabs(d + 1);
		lines.push(
			i +
				(d % 4 === 0
					? `if let Some(x${d}) = v.get(${d}) {`
					: d % 4 === 1
						? `for x${d} in v.iter().copied() {`
						: d % 4 === 2
							? `match total {`
							: `{`)
		);
		if (d % 4 === 2) lines.push(`${i}\t${d}..=i64::MAX => {`);
		lines.push(`${i}\ttotal += ${d}i64 << 1; // level ${d} /* not a block */`);
	}
	for (let d = BLOCK_DEPTH - 1; d >= 0; d--) {
		const i = tabs(d + 1);
		if (d % 4 === 2) lines.push(`${i}\t}`, `${i}\t_ => {}`);
		lines.push(`${i}}`);
	}
	lines.push('\ttotal', '}');
	return to_file(lines);
};

/** The written inputs: what each holds is its first comment. */
export const STRESS_WRITTEN: ReadonlyArray<{ file: string; lang: Lang; generate: () => string }> = [
	{ file: 'stress/ts/nested_blocks.ts', lang: 'ts', generate: nested_blocks_ts },
	{ file: 'stress/ts/long_line.ts', lang: 'ts', generate: long_line_ts },
	{ file: 'stress/js/unterminated.js', lang: 'js', generate: unterminated_js },
	{ file: 'stress/js/nested_templates.js', lang: 'js', generate: nested_templates_js },
	{ file: 'stress/json/nested.json', lang: 'json', generate: nested_json },
	{ file: 'stress/md/nested.md', lang: 'md', generate: nested_md },
	{ file: 'stress/html/unclosed.html', lang: 'html', generate: unclosed_html },
	{ file: 'stress/css/selectors.css', lang: 'css', generate: selectors_css },
	{ file: 'stress/svelte/nested_blocks.svelte', lang: 'svelte', generate: nested_blocks_svelte },
	{ file: 'stress/bash/nested.sh', lang: 'bash', generate: nested_sh },
	{ file: 'stress/rust/nested.rs', lang: 'rust', generate: nested_rs }
];

/**
 * Generates every stress input. A derived input reads its source from the
 * corpus and copies its pins from the manifest.
 *
 * @throws if a source is missing from the manifest or its file differs from its entry
 */
export const generate_stress_inputs = async (
	manifest: LoadedCorpusManifest = load_corpus_manifest(),
	dir: string = CORPUS_DIR
): Promise<Array<StressInput>> => {
	const derived: Array<StressInput> = [];
	for (const { file, from, derivation } of STRESS_DERIVED) {
		const source = manifest.inputs.find((input) => input.file === from);
		if (!source) throw new Error(`${file}: its source ${from} is not in the manifest`);
		const text = readFileSync(dir + from, 'utf8');
		if (hash_sha256(text) !== source.sha256) {
			throw new Error(`${file}: its source ${from} differs from its manifest entry`);
		}
		derived.push({
			file,
			content: await derivation.derive(text, from),
			synthetic: true,
			provenance: source.provenance.map((pin) => ({ ...pin })),
			derivation: await derivation.describe()
		});
	}
	const written = STRESS_WRITTEN.map(({ file, generate }): StressInput => ({
		file,
		content: generate(),
		synthetic: false,
		provenance: [],
		derivation: null
	}));
	return [...derived, ...written].sort((a, b) => (a.file < b.file ? -1 : 1));
};

/** The files under `stress/` on disk, as paths within the corpus. */
export const list_stress_files = (dir: string = CORPUS_DIR): Array<string> =>
	existsSync(dir + STRESS_DIR)
		? readdirSync(dir + STRESS_DIR, { recursive: true, withFileTypes: true })
				.filter((entry) => !entry.isDirectory())
				.map((entry) =>
					// a file directly under `stress/` has a parent path ending in a separator
					(entry.parentPath + '/' + entry.name)
						.slice(dir.length)
						.replaceAll('\\', '/')
						.replace(/\/{2,}/g, '/')
				)
				.sort()
		: [];

/**
 * Compares generated inputs with the files on disk and their manifest entries.
 *
 * @returns every difference, empty when the committed inputs are what regenerates
 */
export const find_stress_differences = (
	generated: ReadonlyArray<StressInput>,
	manifest: LoadedCorpusManifest,
	dir: string = CORPUS_DIR
): Array<string> => {
	const differences: Array<string> = [];
	const files = generated.map((input) => input.file);
	for (const file of list_stress_files(dir)) {
		if (!files.includes(file)) differences.push(`${file}: not generated, so it would be removed`);
	}
	for (const input of generated) {
		const path = dir + input.file;
		const entry = manifest.inputs.find((i) => i.file === input.file);
		if (entry && entry.derivation !== input.derivation) {
			differences.push(
				`${input.file}: made by "${entry.derivation}", and now by "${input.derivation}"` +
					(input.derivation?.includes('esbuild')
						? ': esbuild pins the minified bytes, so a new version means regenerating'
						: '')
			);
		}
		if (!existsSync(path)) differences.push(`${input.file}: missing`);
		else if (readFileSync(path, 'utf8') !== input.content) {
			differences.push(`${input.file}: differs from what generates`);
		}
		if (!entry) differences.push(`${input.file}: not in the manifest`);
		else if (
			entry.synthetic !== input.synthetic ||
			JSON.stringify(entry.provenance) !== JSON.stringify(input.provenance)
		) {
			differences.push(`${input.file}: its manifest entry differs from what generates`);
		}
	}
	return differences;
};

/** The manifest's hand-written fields, with the stress entries replaced by `generated`. */
export const to_stress_seed = (
	previous: CorpusManifestSeed['inputs'],
	generated: ReadonlyArray<StressInput>
): CorpusManifestSeed['inputs'] => [
	...previous.filter((input) => !input.file.startsWith(STRESS_DIR)),
	...generated.map(({ file, synthetic, provenance, derivation }) => ({
		file,
		synthetic,
		provenance,
		derivation
	}))
];

if (import.meta.main) {
	const args = process.argv.slice(2);
	const unknown = args.filter((arg) => arg !== '--check');
	if (unknown.length > 0) {
		console.error(`unknown argument: ${unknown.join(' ')}`);
		console.error('usage: node bench/corpus_stress.ts [--check]');
		process.exit(2);
	}
	const manifest = load_corpus_manifest();
	const generated = await generate_stress_inputs(manifest);
	if (args.includes('--check')) {
		const differences = find_stress_differences(generated, manifest);
		for (const difference of differences) console.error(difference);
		if (differences.length > 0) {
			console.error('the stress inputs are stale: run `npm run corpus:stress`');
			process.exit(1);
		}
		console.log('the stress inputs are what generates');
	} else {
		const files = generated.map((input) => input.file);
		for (const file of list_stress_files()) {
			if (!files.includes(file)) {
				rmSync(CORPUS_DIR + file);
				console.log(`removed ${file}`);
			}
		}
		for (const input of generated) {
			const path = CORPUS_DIR + input.file;
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, input.content);
			console.log(`wrote ${input.file}: ${Buffer.byteLength(input.content)} bytes`);
		}
		const seed = CorpusManifestSeed.parse(JSON.parse(readFileSync(CORPUS_MANIFEST_PATH, 'utf8')));
		const { manifest: written, problems } = write_corpus_manifest(
			to_stress_seed(seed.inputs, generated)
		);
		for (const problem of problems) console.error(problem);
		if (problems.length > 0) {
			console.error('the corpus has problems, so the manifest was left as it is');
			process.exit(1);
		}
		console.log(`wrote the manifest: ${written.corpus_hash}`);
	}
}
