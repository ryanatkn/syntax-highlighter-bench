import { assert, test } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import { format_file } from '@fuzdev/gro/format_file.ts';

// `gro format` sweeps `src/` and the root config files, so `gro check` wouldn't
// notice an unformatted harness file. Fix a failure with `gro format 'bench/**/*'`.
test('the harness is formatted', () => {
	const files = globSync('bench/**/*.{ts,mts,cts,js,mjs,cjs,svelte,css}');
	assert.ok(files.length > 0);
	const unformatted = files.filter((file) => {
		const content = readFileSync(file, 'utf8');
		return format_file(content, { filepath: file }) !== content;
	});
	assert.deepStrictEqual(unformatted, []);
});
