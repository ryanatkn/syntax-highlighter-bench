import { assert, describe, test } from 'vitest';

import { LangNotSetUpError, type HighlighterAdapter } from '../../../bench/adapter.ts';
import {
	MIN_SNIPPET_SPAN_KINDS,
	MIN_SPAN_KINDS,
	check_output
} from '../../../bench/check_output.ts';

const HIGHLIGHTED =
	'<span class="keyword">const</span> a <span class="operator">=</span> <span class="number">1</span>';

/** An adapter stub that claims `ts` and returns what the test gives it. */
const create_adapter = (
	overrides: Partial<Pick<HighlighterAdapter<number>, 'tokenize' | 'count_tokens' | 'html'>>
): HighlighterAdapter => {
	const adapter: HighlighterAdapter<number> = {
		id: 'stub',
		label: 'stub',
		package: 'stub',
		by_maintainer: false,
		note: null,
		langs: { ts: 'ts' },
		via: {},
		output: 'classes',
		engine: 'regex',
		theme_css: [],
		theme_schemes: ['light'],
		setup: async () => {},
		tokenize: () => 3,
		count_tokens: (tokens) => tokens,
		html: () => HIGHLIGHTED,
		bundle_entry: () => '',
		bundle_html: () => HIGHLIGHTED,
		bundle_html_source: () => 'null',
		...overrides
	};
	return adapter;
};

const assert_excluded = (adapter: HighlighterAdapter, expected: RegExp): void => {
	const result = check_output(adapter, 'ts', 'const a = 1');
	assert.ok(!result.ok, 'expected the check to fail');
	assert.match(result.reason, expected);
};

describe('check_output', () => {
	test('passes real highlighting and returns its numbers', () => {
		assert.deepStrictEqual(check_output(create_adapter({}), 'ts', 'const a = 1'), {
			ok: true,
			tokens: 3,
			output: { html_bytes: HIGHLIGHTED.length, spans: 3 }
		});
	});

	test('excludes a library that produces no tokens', () => {
		assert_excluded(create_adapter({ tokenize: () => 0 }), /produced no tokens/);
		assert_excluded(create_adapter({ count_tokens: () => NaN }), /produced no tokens/);
	});

	test('excludes a library that throws, with its message', () => {
		assert_excluded(
			create_adapter({
				tokenize: () => {
					throw new Error('no grammar');
				}
			}),
			/tokenize threw: no grammar/
		);
		assert_excluded(
			create_adapter({
				html: () => {
					throw new Error('boom');
				}
			}),
			/html threw: boom/
		);
	});

	test('excludes a library that produces no HTML', () => {
		assert_excluded(create_adapter({ html: () => '' }), /produced no HTML/);
		assert_excluded(create_adapter({ html: () => undefined as any }), /produced no HTML/);
	});

	test('excludes a plain-text fallback, bare or wrapped', () => {
		// a per-line wrapper is one kind of span, and must not pass for highlighting
		assert.ok(MIN_SPAN_KINDS > 1);
		// escaped source and nothing else
		assert_excluded(create_adapter({ html: () => 'const a = 1 &lt; 2' }), /plain-text fallback/);
		// one wrapper per line, as a library with a line structure falls back
		assert_excluded(
			create_adapter({
				html: () =>
					'<pre class="x"><code><span class="line"><span>const a = 1</span></span>\n<span class="line"><span>b</span></span></code></pre>'
			}),
			/plain-text fallback/
		);
	});

	// What Shiki renders when a loaded grammar matches nothing: every line wrapped,
	// and its text in one span of the theme's default color.
	const SHIKI_DEFAULT_COLOUR_FALLBACK =
		'<pre class="shiki github-light" style="background-color:#fff;color:#24292e" tabindex="0"><code>' +
		'<span class="line"><span style="color:#24292E">const a = 1;</span></span>\n' +
		'<span class="line"><span style="color:#24292E">const b = `x${a}`;</span></span></code></pre>';

	test('the per-input floor alone lets a default-color fallback through', () => {
		// two kinds of span, like prose-heavy Markdown, so this floor cannot tell them apart
		const adapter = create_adapter({ html: () => SHIKI_DEFAULT_COLOUR_FALLBACK });
		assert.ok(check_output(adapter, 'ts', 'const a = 1').ok);
	});

	test('the snippet gate excludes a default-color fallback', () => {
		assert.ok(MIN_SNIPPET_SPAN_KINDS > MIN_SPAN_KINDS);
		const adapter = create_adapter({ html: () => SHIKI_DEFAULT_COLOUR_FALLBACK });
		const result = check_output(adapter, 'ts', 'const a = 1', MIN_SNIPPET_SPAN_KINDS);
		assert.ok(!result.ok);
		assert.match(result.reason, /2 kinds of span, under the 4/);
		// and passes real highlighting of a dense snippet
		const real = create_adapter({
			html: () => HIGHLIGHTED + '<span class="punctuation">;</span>'
		});
		assert.ok(check_output(real, 'ts', 'const a = 1;', MIN_SNIPPET_SPAN_KINDS).ok);
	});

	test('rethrows a language that is not set up instead of excluding the library', () => {
		for (const key of ['tokenize', 'html'] as const) {
			const adapter = create_adapter({
				[key]: () => {
					throw new LangNotSetUpError('stub', 'ts');
				}
			});
			assert.throws(() => check_output(adapter, 'ts', 'const a = 1'), LangNotSetUpError);
		}
	});

	test('throws for a language the adapter does not claim', () => {
		assert.throws(() => check_output(create_adapter({}), 'rust', 'fn main() {}'), /doesn't claim/);
	});
});
