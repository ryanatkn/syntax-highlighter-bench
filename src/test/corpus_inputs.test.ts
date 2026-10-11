import { assert, describe, test } from 'vitest';

import { format_provenance, group_inputs, to_provenance_url } from '#lib/corpus_inputs.ts';
import { load_deterministic } from './site_test_helpers.ts';

const { inputs } = load_deterministic();

describe('group_inputs', () => {
	const groups = group_inputs(inputs);

	test('groups every input by source, a home input under its owner', () => {
		assert.deepStrictEqual(
			groups.map((group) => group.source_key),
			['neutral', 'shiki', 'home:fuz_code', 'home:twinkleplop', 'harness', 'stress']
		);
		assert.strictEqual(
			groups.reduce((sum, group) => sum + group.inputs.length, 0),
			inputs.length
		);
		for (const group of groups) {
			const files = group.inputs.map((input) => input.file);
			assert.deepStrictEqual(
				files,
				[...files].sort((a, b) => a.localeCompare(b))
			);
			for (const file of files) assert.ok(file.startsWith(group.source_key.replace(':', '/')));
		}
	});

	test('a home group is labeled with the library', () => {
		const home = groups.find((group) => group.source_key === 'home:twinkleplop')!;
		assert.strictEqual(home.label, 'home: twinkleplop');
		assert.include(home.note, 'twinkleplop');
	});
});

describe('provenance links', () => {
	test('point at the file at its pinned commit, with the path encoded', () => {
		const pin = { repo: 'https://github.com/sveltejs/svelte', commit: 'a'.repeat(40) };
		assert.strictEqual(
			to_provenance_url({ ...pin, path: 'documentation/docs/02-runes/02-$state.md' }),
			`https://github.com/sveltejs/svelte/blob/${pin.commit}/documentation/docs/02-runes/02-%24state.md`
		);
		assert.strictEqual(format_provenance(pin), 'sveltejs/svelte@aaaaaaaaaa');
	});
});
