/**
 * The corpus: the inputs the benchmark measures, and the manifest that pins
 * them. Inputs live under `bench/corpus/` by source, then language:
 *
 * - `harness/<lang>/` — short snippets written for this benchmark
 * - `shiki/<lang>/` — Shiki's own benchmark samples
 * - `home/<library>/<lang>/` — a measured library's own samples
 * - `neutral/<lang>/` — real code no measured library authored
 *
 * `manifest.json` lists every input with its size, hash, and where it came
 * from. Sizes and hashes are derived from the files; whether an input is
 * synthetic and its provenance are written by hand and carried forward when the
 * manifest is regenerated. An input with one upstream file is a verbatim copy, so
 * its hash must equal the one its provenance pins. An input built from several is
 * synthetic and lists them all.
 *
 * Node-only: this module reads the corpus from disk.
 *
 * @module
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { BenchInput, BenchProvenance, type BenchSize } from '../src/lib/results_schema.ts';
import { is_lang, type Lang } from './langs.ts';

/** The directory holding the corpus. */
export const CORPUS_DIR = fileURLToPath(new URL('./corpus/', import.meta.url));

/** The manifest's path. */
export const CORPUS_MANIFEST_PATH = CORPUS_DIR + 'manifest.json';

/** The corpus manifest: every input, and a hash over them all. */
export const CorpusManifest = z.strictObject({
	corpus_hash: z
		.string()
		.regex(/^[0-9a-f]{64}$/)
		.meta({
			description:
				'Derived from every input. A run records it, so runs over different corpora are told apart.'
		}),
	inputs: z.array(BenchInput)
});
export type CorpusManifest = z.infer<typeof CorpusManifest>;

/**
 * What regenerating the manifest reads from the one on disk: only the fields
 * written by hand. Loose, so a new input is added as just its `file` and
 * `provenance` and the rest is derived.
 */
export const CorpusManifestSeed = z.looseObject({
	inputs: z.array(
		z.looseObject({
			file: z.string().min(1),
			synthetic: z.boolean().optional(),
			provenance: z.array(BenchProvenance).optional()
		})
	)
});
export type CorpusManifestSeed = z.infer<typeof CorpusManifestSeed>;

/** An input of this corpus: its language is one of the harness's ids. */
export type CorpusInput = BenchInput & { lang: Lang };

/**
 * The size tiers, by real file size. Each is the largest size, in bytes, that
 * still falls short of the next tier: `small`, `medium`, and `large` centre on
 * roughly 1KB, 10KB, and 100KB, split at the geometric midpoints, and `micro`
 * is a snippet of a few lines.
 */
export const SIZE_TIER_LIMITS: ReadonlyArray<{ size: BenchSize; below: number }> = [
	{ size: 'micro', below: 600 },
	{ size: 'small', below: 3_200 },
	{ size: 'medium', below: 32_000 },
	{ size: 'large', below: Infinity }
];

/** The size tier of an input of `bytes` bytes. */
export const to_size_tier = (bytes: number): BenchSize =>
	SIZE_TIER_LIMITS.find((tier) => bytes < tier.below)!.size;

/**
 * Counts the lines of a file: its newlines, plus one for a last line that
 * doesn't end in one.
 */
export const count_lines = (content: Uint8Array): number => {
	const NEWLINE = 10;
	let lines = 0;
	for (const byte of content) if (byte === NEWLINE) lines++;
	return content.length > 0 && content.at(-1) !== NEWLINE ? lines + 1 : lines;
};

/** The SHA-256 of some bytes, in lowercase hex. */
export const hash_sha256 = (content: Uint8Array | string): string =>
	createHash('sha256').update(content).digest('hex');

/**
 * Hashes a corpus: the path, language, and content hash of every input, in path
 * order. Any input added, removed, changed, or relabelled changes it.
 */
export const hash_corpus = (inputs: ReadonlyArray<BenchInput>): string =>
	hash_sha256(
		JSON.stringify(
			inputs
				.map((input) => [input.file, input.lang, input.sha256])
				.sort((a, b) => (a[0]! < b[0]! ? -1 : a[0]! > b[0]! ? 1 : 0))
		)
	);

/** The files that may sit in the corpus without being inputs. */
const NON_INPUT_FILE_MATCHER =
	/^(manifest\.json|README\.md|INPUTS\.md|shiki\/LICENSE|home\/[^/]+\/LICENSE|neutral\/NOTICE\.md|neutral\/licenses\/[^/]+)$/;

const INPUT_FILE_MATCHER =
	/^(?:(?<source>harness|shiki|neutral)|(?<home_source>home)\/(?<home>[a-z][a-z0-9_]*))\/(?<lang>[^/]+)\/(?<name>[^/]+)$/;

/** What an input's path says about it. */
export interface CorpusPathInfo {
	source: BenchInput['source'];
	home: string | null;
	lang: string;
}

/**
 * Reads the source, home library, and language off an input's path.
 *
 * @param file - a path within the corpus, with `/` separators
 * @returns null when the path isn't shaped like an input's
 */
export const parse_corpus_path = (file: string): CorpusPathInfo | null => {
	const groups = INPUT_FILE_MATCHER.exec(file)?.groups;
	if (!groups) return null;
	return {
		source: (groups.source ?? groups.home_source) as BenchInput['source'],
		home: groups.home ?? null,
		lang: groups.lang!
	};
};

/** A manifest built from the files on disk, and what is wrong with them. */
export interface CorpusBuild {
	manifest: CorpusManifest;
	/** Every reason the corpus can't be trusted as it stands. Empty when it can. */
	problems: Array<string>;
	/** The previous entries left out because their file is gone. */
	dropped: Array<string>;
}

/**
 * Builds the manifest from the files on disk. Sizes, line counts, hashes, and
 * tiers come from the files; `synthetic` and `provenance` come from `previous`.
 *
 * @param previous - the hand-written fields of the manifest being regenerated
 * @param dir - the corpus directory
 */
export const build_corpus_manifest = (
	previous: CorpusManifestSeed['inputs'],
	dir: string = CORPUS_DIR
): CorpusBuild => {
	const problems: Array<string> = [];
	const previous_by_file = new Map(previous.map((input) => [input.file, input]));
	const entries = readdirSync(dir, { recursive: true, withFileTypes: true }).map((entry) => ({
		entry,
		file: (entry.parentPath + '/' + entry.name)
			.slice(dir.length)
			.replaceAll('\\', '/')
			.replace(/^\//, '')
	}));
	// a link's bytes live outside the corpus, so nothing here would pin them
	for (const { entry, file } of entries) {
		if (entry.isSymbolicLink()) problems.push(`${file}: a symbolic link, not a file`);
	}
	const files = entries
		.filter(({ entry }) => entry.isFile())
		.map(({ file }) => file)
		.sort();

	const inputs: Array<BenchInput> = [];
	for (const file of files) {
		if (NON_INPUT_FILE_MATCHER.test(file)) continue;
		const info = parse_corpus_path(file);
		if (!info) {
			problems.push(`${file}: not at <source>/<lang>/<file> or home/<library>/<lang>/<file>`);
			continue;
		}
		if (!is_lang(info.lang)) {
			problems.push(`${file}: unknown lang "${info.lang}"`);
			continue;
		}
		const content = readFileSync(dir + file);
		if (content.length === 0) {
			problems.push(`${file}: empty`);
			continue;
		}
		const sha256 = hash_sha256(content);
		const before = previous_by_file.get(file);
		const provenance = before?.provenance ?? [];
		const synthetic = before?.synthetic ?? false;
		if (info.source === 'harness') {
			if (provenance.length > 0) problems.push(`${file}: a harness input has no provenance`);
		} else if (provenance.length === 0) {
			problems.push(`${file}: add its provenance to the manifest by hand`);
		} else if (provenance.length === 1 && provenance[0]!.sha256 !== sha256) {
			problems.push(
				`${file}: not the verbatim copy its provenance pins (${provenance[0]!.sha256})`
			);
		} else if (provenance.length > 1 && !synthetic) {
			problems.push(`${file}: built from several files, so it must be marked synthetic`);
		}
		inputs.push({
			file,
			source: info.source,
			home: info.home,
			lang: info.lang,
			size: to_size_tier(content.length),
			bytes: content.length,
			lines: count_lines(content),
			sha256,
			synthetic,
			provenance
		});
	}
	const dropped = [...previous_by_file.keys()].filter((file) => !files.includes(file)).sort();
	return { manifest: { corpus_hash: hash_corpus(inputs), inputs }, problems, dropped };
};

/** Serializes a manifest the way it is committed. */
export const serialize_corpus_manifest = (manifest: CorpusManifest): string =>
	JSON.stringify(manifest, null, '\t') + '\n';

/** The generated table of inputs, beside the manifest. */
export const CORPUS_INPUTS_PATH = CORPUS_DIR + 'INPUTS.md';

const SOURCE_TITLES: Record<BenchInput['source'], string> = {
	neutral: 'neutral — real code no measured library authored',
	shiki: "shiki — Shiki's own benchmark samples",
	home: "home — a measured library's own samples",
	harness: 'harness — snippets written for this benchmark'
};

/** Renders the manifest as the Markdown table of inputs committed beside it. */
export const render_corpus_inputs = (manifest: CorpusManifest): string => {
	const to_upstream = (input: BenchInput): string =>
		input.provenance.length === 0
			? 'written here'
			: input.provenance
					.map(
						({ repo, commit, path }) =>
							`[${repo.replace('https://github.com/', '')}@${commit.slice(0, 10)}](${repo}/blob/${commit}/${path.split('/').map(encodeURIComponent).join('/')}) \`${path}\``
					)
					.join('<br>');
	const sections = (Object.keys(SOURCE_TITLES) as Array<BenchInput['source']>).flatMap((source) => {
		const inputs = manifest.inputs.filter((input) => input.source === source);
		if (inputs.length === 0) return [];
		return [
			`## ${SOURCE_TITLES[source]}`,
			'',
			'| input | lang | tier | bytes | lines | synthetic | license | upstream |',
			'| --- | --- | --- | --: | --: | --- | --- | --- |',
			...inputs.map((input) =>
				[
					'',
					`\`${input.file}\``,
					input.lang,
					input.size,
					input.bytes,
					input.lines,
					input.synthetic ? 'yes' : '',
					[...new Set(input.provenance.map((p) => p.license))].join(', '),
					to_upstream(input),
					''
				]
					.join(' | ')
					.trim()
			),
			''
		];
	});
	return [
		'# Corpus inputs',
		'',
		'Generated from `manifest.json` by `npm run corpus:manifest`. Do not edit.',
		'',
		`Corpus hash: \`${manifest.corpus_hash}\``,
		'',
		...sections
	].join('\n');
};

/** A loaded manifest, with each input's language narrowed to the harness's ids. */
export interface LoadedCorpusManifest {
	corpus_hash: string;
	inputs: Array<CorpusInput>;
}

/**
 * Loads and validates the committed manifest.
 *
 * @throws if the manifest doesn't match its schema or names an unknown language
 */
export const load_corpus_manifest = (path: string = CORPUS_MANIFEST_PATH): LoadedCorpusManifest => {
	const parsed = CorpusManifest.safeParse(JSON.parse(readFileSync(path, 'utf8')));
	if (!parsed.success) throw new Error(`invalid corpus manifest: ${z.prettifyError(parsed.error)}`);
	const inputs = parsed.data.inputs.map((input): CorpusInput => {
		const { lang } = input;
		if (!is_lang(lang)) throw new Error(`invalid corpus manifest: unknown lang "${lang}"`);
		return { ...input, lang };
	});
	return { corpus_hash: parsed.data.corpus_hash, inputs };
};

/** Reads an input's text. */
export const read_corpus_input = (input: BenchInput, dir: string = CORPUS_DIR): string =>
	readFileSync(dir + input.file, 'utf8');
