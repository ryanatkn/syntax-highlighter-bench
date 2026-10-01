import { assert, test } from 'vitest';
import { readFileSync } from 'node:fs';

import { FEATURE_SETS } from '../../bench/sets.ts';

// the languages tome renders its tables from the results file's rosters, and says by
// hand what each feature set is for, because the site never imports the harness
const page = readFileSync(
	new URL('../routes/docs/languages/+page.svelte', import.meta.url),
	'utf8'
);

test('the languages tome says what every feature set is for', () => {
	assert.ok(page.includes('<code>single:&lt;lang&gt;</code>'));
	for (const set of FEATURE_SETS) {
		if (set.id.startsWith('single:')) continue;
		assert.ok(page.includes(`<code>${set.id}</code>`), `missing set "${set.id}"`);
	}
});

test('the languages tome renders its tables from the results file', () => {
	assert.ok(page.includes('{#each docs.langs as lang (lang.id)}'));
	assert.ok(page.includes('{#each sets as set (set.id)}'));
});
