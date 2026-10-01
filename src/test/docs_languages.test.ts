import { assert, test } from 'vitest';
import { readFileSync } from 'node:fs';

import { LANGS } from '../../bench/langs.ts';
import { FEATURE_SETS } from '../../bench/sets.ts';

// the languages tome lists the ids by hand, because the site never imports the harness
const page = readFileSync(
	new URL('../routes/docs/languages/+page.svelte', import.meta.url),
	'utf8'
);

test('the languages tome names every language id', () => {
	for (const lang of LANGS) {
		assert.ok(page.includes(`<code>${lang}</code>`), `missing lang "${lang}"`);
	}
});

test('the languages tome names every feature set', () => {
	assert.ok(page.includes('<code>single:&lt;lang&gt;</code>'));
	for (const set of FEATURE_SETS) {
		if (set.id.startsWith('single:')) continue;
		assert.ok(page.includes(`<code>${set.id}</code>`), `missing set "${set.id}"`);
	}
});
