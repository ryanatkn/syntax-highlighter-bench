import { assert, describe, test } from 'vitest';

import { MIN_SNIPPET_SPAN_KINDS, check_output } from '../../../bench/check_output.ts';
import { load_corpus_manifest, read_corpus_input } from '../../../bench/corpus.ts';
import { LANGS } from '../../../bench/langs.ts';
import { get_adapter } from '../../../bench/libraries.ts';

/** The libraries slow enough on the large inputs to get a test file each, run in parallel. */
export const SLOW_ADAPTER_IDS: ReadonlyArray<string> = ['shiki_js', 'shiki_wasm'];

/**
 * Declares the corpus-wide output check for some libraries, as a run performs
 * it: with only the input's language set up, the language's harness snippet
 * must clear the snippet gate, and then every input the per-input floor. A run's
 * excluded list relies on all of it passing.
 *
 * A test file is one process, so a library with a global registry (Prism) still
 * holds the languages set up before the current one.
 */
export const describe_corpus_output_check = (adapter_ids: ReadonlyArray<string>): void => {
	const corpus = load_corpus_manifest();

	describe.each(adapter_ids.map((id) => ({ id })))('$id', ({ id }) => {
		const adapter = get_adapter(id);
		const langs = LANGS.filter((lang) => Object.hasOwn(adapter.langs, lang));

		test(
			'passes the output check on every corpus input it claims',
			{ timeout: 180_000 },
			async () => {
				const failures: Array<string> = [];
				let checked = 0;
				for (const lang of langs) {
					await adapter.setup([lang]);
					for (const input of corpus.inputs.filter((i) => i.lang === lang)) {
						const min_span_kinds = input.source === 'harness' ? MIN_SNIPPET_SPAN_KINDS : undefined;
						const result = check_output(adapter, lang, read_corpus_input(input), min_span_kinds);
						if (!result.ok) failures.push(`${input.file}: ${result.reason}`);
						checked++;
					}
				}
				assert.ok(checked > langs.length);
				assert.deepStrictEqual(failures, []);
			}
		);
	});
};
