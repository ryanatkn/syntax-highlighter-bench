import { assert, beforeAll, describe, test } from 'vitest';

import { check_output } from '../../../bench/check_output.ts';
import { load_corpus_manifest, read_corpus_input } from '../../../bench/corpus.ts';
import type { Lang } from '../../../bench/langs.ts';
import { ADAPTERS } from '../../../bench/libraries.ts';

const corpus = load_corpus_manifest();

const read_snippet = (lang: Lang): string =>
	read_corpus_input(corpus.inputs.find((i) => i.source === 'harness' && i.lang === lang)!);

// A file of its own, so `svelte` is the only language any library has loaded: the
// script and style languages it embeds must come with it.

describe.each(ADAPTERS.map((adapter) => ({ id: adapter.id, adapter })))('$id', ({ adapter }) => {
	beforeAll(async () => {
		await adapter.setup(['svelte']);
	});

	test('svelte alone passes the output check', () => {
		const result = check_output(adapter, 'svelte', read_snippet('svelte'));
		assert.ok(result.ok, result.ok ? '' : result.reason);
	});

	test('svelte alone styles the content of its script and style elements', () => {
		const html = adapter.html(read_snippet('svelte'), 'svelte');
		// a keyword of the script and a property of the style block
		assert.match(html, /<span[^>]*>\s*(const|interface)\s*<\/span>/, 'the script content is plain');
		assert.match(html, /<span[^>]*>\s*font-weight\s*<\/span>/, 'the style content is plain');
	});
});
